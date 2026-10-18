"""Regional hosts speak their own dialect, with the Mandarin kept as its gloss (原文释义).

Ported from agent-studio's Localizer (agent-studio/server/llm.py). As there, the line is written in 普通话 first: the
restaurant agent writes it and the console checks verify it (numbers against the evidence, length, repeated attacks).
A host whose cuisine has a regional language then has the verified line rewritten into that dialect before it is
voiced. The frontend's generator chose that language (its accent step: 四川话 for 川菜, 粤语 for 粤菜 and 潮汕牛肉火锅,
湖南话 for 湘菜 …) and sends it in session.start's characters. The stage shows the dialect, with the Mandarin under it.

A rewrite must keep every arabic number, the host's name and the restaurant's name; otherwise, or if the model is
slow, truncated or odd, the host says the Mandarin as written. Foreign-accented Mandarin (英式口音普通话 …) is not
rewritten here: the persona already gives those hosts their touch of a foreign language.
"""
from __future__ import annotations

import asyncio
import re
import time
from collections import OrderedDict

COMMON = ("只输出改写后的这一句台词本身，不加引号、不加解释、不加前缀。保留原句的意思、语气、数字和价格，长度与原句相近，适合直接配音。"
          "人名、店名、菜名照原样保留，不增加原句没有的事实。")

# id → (label, system prompt, few-shot pairs). The first three are agent-studio's own targets with the film's pairs.
TARGETS = {
    "sc": ("四川话", "你是四川成都的川菜馆店主的台词编剧。把普通话台词改写成店主会说的四川话口语："
                   "多用四川话词汇和语气词（屋头、巴适、安逸、啥子、莫得、晓得、要得、嘛、噻、哦、咧、得很），但要让普通话观众也能看懂，用普通话汉字书写。",
           [("来我家吧！正宗川菜，麻辣鲜香，人均才八十五！", "来我屋头嘛！正宗川菜，麻辣鲜香，人均才八十五！"),
            ("他那份牛排才三分熟，切开还在喊妈妈呢！", "他那个牛排三分熟，切开还在喊妈妈咧！"),
            ("约会？我们有露台包间和鸳鸯锅，不辣也很舒服！", "约会？我们有露台包间，鸳鸯锅，不辣也巴适！")]),
    "yue": ("粤语", "你是广州粤菜馆店主的台词编剧。把普通话台词翻译成地道的粤语（广州话）口语，"
                  "用粤语正字书写（嘅、咗、唔、佢、喺、嚟、咩、啲、冇、係、而家、点解、仲、晒、喎、啦）。",
            [("辣到嘴都肿了，还怎么约会？来饮早茶，老火汤煲足四个钟。", "辣到个嘴都肿晒，仲点拍拖啊？嚟饮早茶啦，老火汤煲足四个钟！"),
             ("七道菜？人均八百八，吃完要吃一个月泡面！", "七道菜？人均八百八，食完要食成个月公仔面喎！"),
             ("啧，又被她抢先了。", "啧，又畀佢抢先咗。")]),
    "fr": ("法语", "你是一位法国主厨的台词编剧。把普通话台词翻译成自然、口语化的法语，带一点主厨的优雅和戏剧感。",
           [("我的天哪……", "Mon Dieu…"), ("祝你们用餐愉快！", "Bon appétit !"), ("那叫艺术！你不懂！", "C'est de l'art ! Tu n'y comprends rien !")]),
    "hunan": ("湖南话", None,
              [("你们急什么，先尝一口辣椒炒肉再说。", "你们急么子咯，先恰一口辣椒炒肉再讲啰。"),
               ("人均二十七，吃得饱饱的，不好吗？", "人均二十七，恰得饱饱的，冇得好？蛮好咯！")]),
    "shanghai": ("上海话", None,
                 [("我们家的糖醋小排，味道真的很好。", "阿拉屋里厢额糖醋小排，味道老灵额。"),
                  ("你别急，先坐下来慢慢吃。", "侬覅急，先坐下来慢慢叫吃。")]),
    "dongbei": ("东北话", None,
                [("我们家的锅包肉，又酥又脆，特别好吃。", "俺家锅包肉，嘎嘎酥脆，老好吃了！"),
                 ("你说什么呢？量这么大还嫌少？", "你说啥呢？量这老大还嫌少啊？")]),
}
# The other regional languages of the frontend's catalog (src/agents/generation/languages.ts), on agent-studio's
# generic prompt.
REGIONAL = {"henan": "河南话", "hubei": "湖北话", "jiangxi": "江西话", "minnan": "闽南话", "shaanxi": "陕西话", "shanxi": "山西话",
            "shandong": "山东话", "tianjin": "天津话", "yunnan": "云南话", "guizhou": "贵州话", "gansu": "甘肃话", "ningxia": "宁夏话"}
LANGUAGES = {key: value[0] for key, value in TARGETS.items()} | REGIONAL

REWRITE_TIMEOUT = 12.0
DIGITS = re.compile(r"\d+(?:\.\d+)?")


def dialect_of(language):
    """The dialect a host speaks, or None for 普通话 and foreign-accented Mandarin."""
    return LANGUAGES.get(language) if isinstance(language, str) else None


def system_for(language):
    label = LANGUAGES[language]
    target = TARGETS.get(language)
    prompt = target[1] if target and target[1] else (f"你是一位{label}地区餐馆店主的台词编剧。把普通话台词改写成地道的{label}口语："
                                                    f"适当使用{label}的常用词汇和语气词，但要让普通话观众也能看懂，用普通话汉字书写。")
    shots = target[2] if target else []
    examples = "".join(f"\n原句：{a}\n改写：{b}" for a, b in shots)
    return prompt + COMMON + (f"\n示例：{examples}" if examples else "")


def unquote(text):
    return text[1:-1].strip() if len(text) >= 2 and text[0] in "\"“「『'" and text[-1] in "\"”」』'" else text


def clean(text):
    """The rewritten line alone: no reasoning, label or quotes around it, first line only."""
    text = re.sub(r"^<think>.*?</think>", "", (text or "").strip(), flags=re.S).strip()
    text = text.splitlines()[0].strip() if text else ""
    return unquote(re.sub(r"^(?:改写|译文|输出|[一-鿿]{2,4}话|粤语|法语)[：:]\s*", "", unquote(text)))


def problem(source, out, keep):
    """Why a rewrite cannot be voiced, or None."""
    if not out:
        return "改写结果为空"
    if len(out) > max(60, len(source) * 3):
        return "改写结果过长"
    missing = [n for n in DIGITS.findall(source) if n not in DIGITS.findall(out)]
    if missing:
        return "改写丢了数字：" + "、".join(missing)
    lost = [name for name in keep if name and name in source and name not in out]
    if lost:
        return "改写丢了名字：" + "、".join(lost)
    return None


class Localizer:
    def __init__(self, llm, timeout=REWRITE_TIMEOUT):
        self.llm, self.timeout = llm, timeout
        self.cache = OrderedDict()

    async def localize(self, text, language, keep=()):
        """→ {text, gloss, language, ms, note?}. `gloss` is the Mandarin when the text changed, else None."""
        source = (text or "").strip()
        base = {"text": source, "gloss": None, "language": language, "ms": 0}
        if not self.llm or not source or not dialect_of(language):
            return base
        key = (language, source, tuple(keep))
        if key in self.cache:
            self.cache.move_to_end(key)
            return {**self.cache[key], "ms": 0, "cached": True}
        started = time.perf_counter()

        async def collect():
            parts = []
            async for delta in self.llm.stream_text(system_for(language), source):
                parts.append(delta)
            return "".join(parts)

        try:
            out = clean(await asyncio.wait_for(collect(), self.timeout))
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            return {**base, "ms": round((time.perf_counter() - started) * 1000), "note": f"改写失败（{type(exc).__name__}），按普通话说"}
        ms = round((time.perf_counter() - started) * 1000)
        note = problem(source, out, keep)
        if note:
            return {**base, "ms": ms, "note": note + "，按普通话说"}
        result = {**base, "text": out, "gloss": source if out != source else None, "ms": ms}
        self.cache[key] = result
        while len(self.cache) > 500:
            self.cache.popitem(last=False)
        return result
