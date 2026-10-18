// The film's three owners and its dialogue, for the asset library and the Jev check on the system page.
// Data from agent-studio: catalog.json (characters), the film's lipsync.js (lines) and plan.js FILM_TRUTH
// (scene-stage.js, choreographed by hand). The rigs themselves are src/lib/characterRig.js.

import type { CharacterId } from '@/data/types'

export interface FilmCharacter {
  id: CharacterId; name: string; fullName: string; actorId: string; restaurant: string; plate: string; cuisine: string; language: string
  persona: string; voiceDesc: string; look: string; signature: string; palette: readonly string[]; edge: string
  defaults: { expr: string; gesture: string; act: string; reaction: string }; keywords: readonly string[]
}
export interface FilmTruth { quote: string | null; expr: string | null; gesture: string | null; act: string | null; listeners: Record<string, string> }
export interface FilmLine { id: string; who: CharacterId | 'orb'; text: string; lang: string; gloss?: string; truth: FilmTruth }

export const FILM_CHARACTERS: readonly FilmCharacter[] = [
  {"id": "rong", "name": "蓉姐", "fullName": "蓉姐 · 巴适川菜", "actorId": "sichuan_owner", "restaurant": "巴适川菜", "plate": "川菜 · ¥85/人 · 1.2 km", "cuisine": "川菜", "language": "sc", "persona": "四川餐馆老板娘，35—40 岁。热情、泼辣、直接，有感染力；推介时掌心打开、身体前倾，被质疑时先侧目挑眉再短促回击。卖点：正宗麻辣、人均 85、露台包间与鸳鸯锅。", "voiceDesc": "四川话 · 热情泼辣的中年老板娘", "look": "高发髻配金色发簪与辣椒红发绳、辣椒红短外套（盘扣与辣椒胸针）、姜黄短围裙、深紫裤装；上挑眼线。", "signature": "轻叉腰、扬眉、朝观众竖大拇指并抛媚眼（hipR → thumbR + wink）。", "palette": ["#C9483E", "#A23933", "#E3B04B", "#F6E8D2", "#4A2B3D", "#2A1C24", "#F6CBA9"], "defaults": {"expr": "pitch", "gesture": "hip_one", "act": "stepIn", "reaction": "eyeroll"}, "keywords": ["蓉姐", "川菜", "麻辣", "辣", "火锅", "巴适"], "edge": "#E57A63"},
  {"id": "hua", "name": "华叔", "fullName": "华叔 · 华记粤点", "actorId": "cantonese_owner", "restaurant": "华记粤点", "plate": "粤菜 · ¥128/人 · 0.8 km", "cuisine": "粤菜 / 早茶", "language": "yue", "persona": "粤菜馆老板，40—50 岁。慢条斯理、温和而笃定，爱用事实和反问挖苦对手；受挑战时先停顿抬眉再平静回应。卖点：早茶点心日日新鲜、老火汤煲足四个钟、离得最近。", "voiceDesc": "粤语 · 慢条斯理的中年老板（气泡附普通话释义）", "look": "短侧分发型单侧灰发、玉石绿立领短袖衬衣（盘扣、奶油色袖口）、奶油色围裙、茶叶纹口袋；圆润身形，蒜头鼻。", "signature": "拍肚子得意（belly + smug + puff），摇食指拆台（wagR）。", "palette": ["#2F6E62", "#245548", "#F3EAD8", "#DCCFB4", "#2F3640", "#1E1B21", "#F1C09B"], "defaults": {"expr": "sly", "gesture": "wag", "act": "lean", "reaction": "smug"}, "keywords": ["华叔", "粤菜", "早茶", "老火汤", "点心", "华记"], "edge": "#4DB393"},
  {"id": "pierre", "name": "Pierre", "fullName": "Pierre · Chez Pierre", "actorId": "french_chef", "restaurant": "Chez Pierre", "plate": "法餐 · ¥198/人 · 2.1 km", "cuisine": "法餐", "language": "frzh", "persona": "年轻法式主厨。精确、克制、偶尔戏剧化，自诩浪漫与艺术；被指出贵时短暂心虚找补，被冒犯时会炸毛。卖点：烛光、红酒、七道菜，工作日套餐 198。", "voiceDesc": "法国口音普通话 + 法语 · 年轻主厨", "look": "白色厨师帽与双排扣厨师服、梅子紫领巾配黄铜胸针、白围裙、紫色裤装；卷发鬓角。", "signature": "飞吻（kissR → kissOut + kiss），小鞠躬（bow）。", "palette": ["#FBF7F0", "#E6DCCB", "#7A5A9E", "#5F4482", "#EFCF6A", "#4B3560", "#6B4330", "#F7D0B3"], "defaults": {"expr": "proud", "gesture": "present", "act": "none", "reaction": "haughty"}, "keywords": ["Pierre", "法餐", "法国", "牛排", "红酒", "烛光", "七道菜", "Chez"], "edge": "#A18CE6"},
]

/** The host as the film names it (this app calls it Orb). */
export const FILM_HOST = { id: 'orb', name: "小选" }

/** The film's dialogue in order, each with how scene-stage.js performed it. */
export const FILM_LINES: readonly FilmLine[] = [
  {"id": "R1", "who": "rong", "text": "来我屋头嘛！正宗川菜，麻辣鲜香，人均才八十五！", "lang": "zh", "truth": {"quote": null, "expr": "pitch", "gesture": "hip_one", "act": "stepIn", "listeners": {"hua": "eyeroll", "pierre": "haughty"}}},
  {"id": "H1", "who": "hua", "text": "辣到个嘴都肿晒，仲点拍拖啊？嚟饮早茶啦，老火汤煲足四个钟！", "lang": "yue", "gloss": "辣到嘴都肿了，还怎么约会？来饮早茶，老火汤煲足四个钟。", "truth": {"quote": "R1", "expr": "sly", "gesture": "wag", "act": "lean", "listeners": {"rong": "shock", "pierre": "smug"}}},
  {"id": "R2", "who": "rong", "text": "四个钟？等你汤好，人都饿晕了！", "lang": "zh", "truth": {"quote": "H1", "expr": "angry", "gesture": "hip_point", "act": "shake", "listeners": {"hua": "sweat", "pierre": "laugh"}}},
  {"id": "P0", "who": "pierre", "text": "Mon Dieu…", "lang": "fr", "truth": {"quote": "R2", "expr": "haughty", "gesture": "shrug", "act": "none", "listeners": {"rong": "eyeroll", "hua": "eyeroll"}}},
  {"id": "P1", "who": "pierre", "text": "你们太吵了。烛光，红酒，七道菜，这才叫浪漫。", "lang": "zh", "truth": {"quote": "R2", "expr": "proud", "gesture": "present", "act": "none", "listeners": {"rong": "think", "hua": "sly"}}},
  {"id": "H2", "who": "hua", "text": "七道菜？人均八百八，食完要食成个月公仔面喎！", "lang": "yue", "gloss": "七道菜？人均八百八，吃完要吃一个月泡面！", "truth": {"quote": "P1", "expr": "laugh", "gesture": "point", "act": "bounce", "listeners": {"pierre": "shock", "rong": "laugh"}}},
  {"id": "P2", "who": "pierre", "text": "那、那是周末！工作日套餐，只要一百九十八！", "lang": "zh", "truth": {"quote": "H2", "expr": "nervous", "gesture": "handsUp", "act": "shiver", "listeners": {"hua": "smug", "rong": "sly"}}},
  {"id": "R3", "who": "rong", "text": "他那个牛排三分熟，切开还在喊妈妈咧！", "lang": "zh", "truth": {"quote": "P2", "expr": "sly", "gesture": "hip_point", "act": "none", "listeners": {"pierre": "shock", "hua": "squeal"}}},
  {"id": "P3", "who": "pierre", "text": "那叫艺术！你不懂！", "lang": "zh", "truth": {"quote": "R3", "expr": "angry", "gesture": "hip_point", "act": "shake", "listeners": {"rong": "smug", "hua": "laugh"}}},
  {"id": "O3", "who": "orb", "text": "我发现，你在烛光和麻辣上停留最久。今晚是约会，又馋辣？", "lang": "zh", "truth": {"quote": null, "expr": null, "gesture": null, "act": null, "listeners": {"rong": "think", "hua": "think", "pierre": "think"}}},
  {"id": "R4", "who": "rong", "text": "约会？我们有露台包间，鸳鸯锅，不辣也巴适！", "lang": "zh", "truth": {"quote": "O3", "expr": "star", "gesture": "wave", "act": "stepIn", "listeners": {"hua": "eyeroll", "pierre": "pout"}}},
  {"id": "H3", "who": "hua", "text": "啧，又畀佢抢先咗。", "lang": "yue", "gloss": "啧，又被她抢先了。", "truth": {"quote": "R4", "expr": "pout", "gesture": "hip", "act": "none", "listeners": {}}},
  {"id": "P4", "who": "pierre", "text": "Bon appétit !", "lang": "fr", "truth": {"quote": "R4", "expr": "kiss", "gesture": "bow", "act": "bow", "listeners": {}}},
]
