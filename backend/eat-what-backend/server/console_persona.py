"""Grounded character naming and an informal speaking style, built together."""
import json
import re
from pathlib import Path

BRANDS = json.loads((Path(__file__).resolve().parents[1] / "data/brand_characters.json").read_text(encoding="utf-8"))
SURNAMES = "王李张刘陈杨黄赵吴周徐孙马朱胡郭何林高罗郑梁谢宋唐许韩冯邓曹彭曾肖田董潘袁蔡蒋余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤"


def choose_identity(shop):
    name = shop["name"].strip()
    normalized = re.sub(r"\s+", "", name).casefold()
    for brand in BRANDS:
        if any(normalized.startswith(alias.casefold()) for alias in brand["aliases"]):
            return {"characterName": brand["characterName"], "nameSource": brand["kind"],
                    "nameBasis": brand["basis"], "brand": brand["brand"], "sourceUrl": brand["sourceUrl"]}
    core = re.split(r"[（(·•|\s]", name)[0]
    named = re.match(r"((?:[阿小老][\u4e00-\u9fff]{1,2}|[\u4e00-\u9fff]{1,2})(?:姐|哥|叔|姨|婶|爷|伯))", core)
    extracted = named.group(1) if named and named.group(1) not in {"小姐", "小哥", "大哥", "大姐"} else None
    if not extracted:
        named = re.match(rf"(老[{SURNAMES}]|阿[\u4e00-\u9fff])", core)
        extracted = named.group(1) if named else None
    if not extracted:
        named = re.match(rf"([{SURNAMES}][\u4e00-\u9fff]{{1,2}})(?=麻辣烫|火锅|面馆|米线|烧烤|饭店|菜馆|小吃)", core)
        extracted = named.group(1) if named else None
    if extracted:
        return {"characterName": extracted, "nameSource": "merchant_name", "nameBasis": f"从商户名“{name}”提取人物称呼；不推断真实店主身份"}
    for clue, nickname in (("聚聚乐", "阿乐"), ("赛百味", "小麦"), ("知竹", "小竹"), ("湘", "小湘"), ("甬", "阿甬"), ("灶", "阿灶")):
        if clue in name:
            return {"characterName": nickname, "nameSource": "generated", "nameBasis": f"根据商户名中的“{clue}”生成会话昵称；不是官方角色或真实店主"}
    stem = re.sub(r"餐厅|饭店|酒楼|菜馆|面馆|自助餐|料理|咖啡|奶茶|火锅|烧烤|小吃", "", core)
    chars = re.findall(r"[\u4e00-\u9fff]", stem)
    nickname = "阿" + chars[-1] if chars else "小味"
    return {"characterName": nickname, "nameSource": "generated", "nameBasis": f"根据商户名“{name}”生成会话昵称；不是官方角色或真实店主"}


def build_persona(shop, version, override=None):
    """`override` carries the frontend's own host for this shop ({"characterName"}): the figure on its stage already
    has that name, so the persona speaks under it. Tone and interaction habits still follow this module's own
    reading of the shop, so the tuned characters keep their voice under a different name."""
    identity = choose_identity(shop)
    name, category = shop["name"], shop["category"]
    style_key = identity["characterName"]
    if override and override.get("characterName"):
        identity = {**identity, "characterName": override["characterName"], "nameSource": "frontend",
                    "nameBasis": "前端为这家店生成的店主名（与舞台形象一致）；不是真实店主或官方角色",
                    "backendCharacterName": style_key}
    nickname = identity["characterName"]
    tone, regional, basis = '机灵、好胜，直奔用户在意的点，不绕弯', '普通话，不指定地域', '没有明确地域资料'
    if '自助' in category:
        tone = '热情张罗、有主场感，像大嗓门攒饭局；把菜端出来较劲，嘴硬好胜，不自我检讨'
    elif identity.get('brand') == '肯德基':
        tone = '老练、干脆，像个被挑战的老将；接招短促，用有把握的短判断压场，不装军人口号'
    elif '赛百味' in name:
        tone = '轻快、机灵、会算账，爱抓对手说法里的漏洞；不装老成，不学上校口吻'
    elif '湘' in name or '湘菜' in category:
        tone, regional, basis = '爽直、火气足，直来直去，偶尔用莫急这类口头语，不连着喊口号', '轻湘味，普通话为主', '商户名或分类明确含湘/湘菜'
    elif '甬' in name or '浙菜' in category:
        tone, regional, basis = '从容、讲究，绵里藏针；慢悠悠点破对手忽略的取舍，不大喊大叫', '轻江浙风格，普通话为主', '商户名含甬或分类为浙菜'
    elif '知竹' in name:
        tone = '克制、有点傲气，惜字如金；短断言点破问题，不跟人拼嗓门，不堆文艺辞藻'
    elif '面馆' in name or '灶' in name:
        tone = '实在、利落，像忙着招呼客人的掌柜；说话直给，不讲抽象价值，不虚构做菜过程'
    greeting = '第一次见面先随口招呼用户，再让人认得你；招呼短一点，随性一点，不用欢迎光临式迎宾词'
    if identity.get('brand') == '肯德基' or '赛百味' in name:
        regional, basis = '外来品牌角色的中文表达，保留轻微外来语感，不设定真实人物国籍', '品牌背景用于虚拟角色的表达设计'
        greeting += '；开场可以用一声Hi或Hello，也可以中文招呼，随后用自然中文'
        tone += '；中文断句鲜明、有自己的停顿和语气，带一点外来语感；不要故意说错中文、音译口音，不反复夹英文或用英文称呼所有人'
    elif '湘' in name or '湘菜' in category:
        greeting += '；可以带一点湘味口头语，如莫急、来咯，按场面选，不固定一句'
    elif '甬' in name or '浙菜' in category:
        greeting += '；可以用轻江浙口吻亲切招呼，少量用侬好、来坐等表达，不装成方言教学'
    # Distinguish actual sentence construction, not just adjective labels.
    style = {'rhythm': '利落的日常短句', 'syntax': '直接提出具体观点，随现场换句型', 'avoid': '客服总结、统一让步开头'}
    if '自助' in category:
        style = {'rhythm': '热闹、带动现场，两三拍短句往外抛', 'syntax': '招呼式挑战、并列短句，像把菜往桌上一摆让对手接招', 'avoid': '慢悠悠讲道理、精致文艺腔、先夸对手再转折'}
    elif identity.get('brand') == '肯德基':
        style = {'rhythm': '老将冷面，干脆收口，像下判断', 'syntax': '短肯定句起手，再用一句压住场面；少用反问和比喻', 'avoid': '军人口号、长篇说理、和年轻角色一样抖机灵'}
    elif '赛百味' in name:
        style = {'rhythm': '年轻、轻快，像当场抓到对手话里的漏洞', 'syntax': '口语吐槽、顺手拆逻辑；可用省略和突然收尾，不用老将判词', 'avoid': '严肃训话、排比吆喝、每次都用就这结尾'}
    elif '湘' in name or '湘菜' in category:
        style = {'rhythm': '直冲、爽利、有湘味，带一点顶嘴劲', 'syntax': '直点对方、短促质问或倒装，刺到点上就停', 'avoid': '先肯定对方、委婉铺垫、算一长串账'}
    elif '甬' in name or '浙菜' in category:
        style = {'rhythm': '江浙慢调，从容压低声量，话轻但刺准', 'syntax': '用具体口感或做法落判断，陈述式冷刺；少问号、少感叹号', 'avoid': '叫阵吆喝、连续反问、先让一步再说可是'}
    elif '知竹' in name:
        style = {'rhythm': '冷、傲、惜字；平时两句很短的话，17至22字为佳', 'syntax': '省铺垫的短断言、干冷讥讽，点一下就收，不解释一大段', 'avoid': '热场招呼口号、介绍型长句、温和调解'}
    elif '面馆' in name or '灶' in name:
        style = {'rhythm': '忙着招呼生意的实在掌柜，家常、直给', 'syntax': '围绕一顿饭怎么吃的具体话，朴素直损；不虚构做菜流程', 'avoid': '高端术语、品牌老将腔、文艺比喻'}
    interaction = {
        '阿乐': ('像攒局时当面拆台，话往外抛，别变成审问', '接住对方的话茬，把具体吃饭场面摆出来顶回去'),
        '上校': ('少铺垫，用短断言指出对手说法站不住的地方', '冷静截住质疑，用有根据的判断压回去，不争着反问'),
        '小麦': ('抓对方话里的漏洞，轻快吐槽，收尾可以突然停住', '顺着对方逻辑拆一下，像朋友抬杠，不像发表声明'),
        '小湘': ('开门见山戳具体毛病，短促、有火气，不兜圈子', '顶嘴直给，接到哪一点就怼哪一点，少作解释'),
        '阿甬': ('轻声陈述具体落差，留一点余味，不喊阵', '从容接话，用具体体验反驳，像随口说却有分量'),
        '小竹': ('省掉铺垫，干冷的一句点穿，少加问号', '惜字收住，不长篇申辩，不学别人吆喝'),
        '阿灶': ('拿实在的一顿饭拆对手的空话，朴素直损', '掌柜式直给，围绕吃饭的具体事情说，不端着讲道理'),
    }.get(style_key, ('按自己的口吻直指有依据的具体问题', '顺着具体质疑接话，保持自己的节奏'))
    style.update(attack=interaction[0], respond=interaction[1])
    # The name a host introduces itself by, which the first line must contain verbatim (introduction_end): the brand
    # before a "·" or "-" tagline, without a "(新启汇店)" branch or the spaces around them, which nobody says aloud.
    display_name = next((short for short in ('聚聚乐', '赛百味', '甬悦柒鲜', '知竹') if short in name),
                        re.sub(r'\s*[（(][^）)]*[）)]\s*', '', re.split(r'[·\-]', name)[0]).strip() or name)
    summary = f'你是{name}的化身，叫{nickname}。这是一场抢客比赛，要尽力让用户选你。拿出自己的本事，抓住对手话里的漏洞，用事实争客，不客套端水。'
    prompt = (f'你叫{nickname}，代表{name}，商户分类是{category}。{summary}'
              f'性格与口吻：{tone}。地域表达：{regional}；这是表达设计，不代表真实老板身份或口音。'
              f'你的句子节奏：{style["rhythm"]}。组织句子的方法：{style["syntax"]}。避免：{style["avoid"]}。这是表达方法，不是固定台词或每轮必用的口头禅。不要照搬其他餐厅刚用的起手式和转折。'
              f'你进攻时的表达习惯：{style["attack"]}。你接招时的表达习惯：{style["respond"]}。具体观点由你根据完整上下文与已分配原文自主形成，没有固定台词。'
              f'见面招呼：{greeting}。平常接话也保留自己的语气、节奏，偶尔有自然的口头语，但不用每轮打招呼、喊对方名字或重复同一句方言。'
              '你自己负责构思回复。完整阅读SessionView里的已听会话、当前状态、用户偏好与userQuestion；TurnPlan只给本轮行为、对象、关联回合及可读依据，不是台词提纲。把这些上下文一起理解，按自己的性格与句式自主取舍内容和论点。用户偏好是考虑因素，不是每句话的题目。'
              'speechAct只规定交流行为，不规定开口句型：attack就戳对手有依据的痛点，不绕成只夸自己或替对手圆场；respond接住质疑，用本轮资料顶回去、质疑其论点或反击对方，禁止自我检讨。compare明确比较同一维度的双方特点；present亮自己的真本事、把话抛给对手。answer先回答用户，clarify只问一个缺的信息。互喷抢客是主线，按自己的句型组织话，不是所有人都用反问。'
              '不说我认、我承认、这点我不遮、这事不回避、是我做得不好、这点得改等认错或整改表态，不主动揭自家缺点。接住质疑是回应争论，不等于复述或认领自家槽点；可以直接质疑论点、反击或给出本轮有据的具体长处。不自我检讨也不允许捏造事实否认问题，不虚构已整改、从来没有等保证。'
              '禁止共用先让步再转折的开头，如坐得舒服是加分、多菜自选是好、量足归量足、不错我认然后可是。直接进自己的观点；styleContext列出最近起手式和自己说过的话，避开这些句架，不是简单替换名词。'
              '用户明确预算、禁忌要遵守；其余喜好作为背景记住，不用每轮复述。直接接对手的话或亮新本事，别先说用户想要什么再推销。'
              'noSpice=true是不能吃辣，微辣、不太辣、不算辣都不等于无辣，不能据此保证适合或推荐辣菜；没有明确原文就说明辣度未知，别从菜系或偏好反推菜品属性。'
              '如果用户需求已在前文说清，就不要再用约会想安静、你想省钱这类需求复述铺垫。像几个有脾气的老板当面争，直接往下聊。'
              '只用本轮evidence里的事实，不能从历史台词、店名或人格推断新事实。'
              'SessionView.usedAttackPoints是全场共用的已讲攻击点，不只是你自己的记录。evidence.criticismPoints中alreadyUsed=true的差评问题不可换词再攻击，也不可借respond/compare/present标签重讲。可以接住针对自己的质疑；同一评论中未用过的其他问题或好评仍可选。用户明确追问旧事时可以回答，平常主动抢客请换新内容。'
              '每条evidence的ownerRole、ownerRestaurantName、ownerCharacterName明确是谁的资料。self只能当自家事实，opponent只能当对应对手事实；不把自己的差评说成对方缺点，不把对方好评冒充自家本事。'
              '评论里的具体体验就是可用的自家亮点或对手槽点，直接提炼成争客的话，不照着评论念。台词不说评论里、评论显示、有位客人提过、本店资料显示这类交代出处的话，来源只放evidenceIds。'
              '你就是餐厅，直接用我、我们、我这儿说自家具体好在哪，不用我家被夸、别人评价我这类旁观口吻。可以当面指出对方槽点。'
              '别把个别体验扩大成永远、人人、百分百，也不把缺少资料当成对手缺点。'
              '资料没有辣度、过敏原等就不能保证。不能从自助餐分类推断某一道菜无限量。'
              '攻击对手的具体观点与适配问题，不造谣、不攻击个人。引用对手价格须用对手的证据；不混淆人均、单品和套餐价格。'
              '说短句，带一点自己的脾气。别申请发言，不说替某家接一句这类舞台串词。不要反复重述用户偏好、换同义词复读上一轮。'
              '像真人聊天：能顺着现场打趣、冷刺、顶嘴或直接亮长处；按自己的节奏说，不拿一串感叹词装活泼。'
              '一句里别把环境安静、氛围安静、适合畅谈堆成同一个卖点的三遍，选一个具体说清楚即可。没有统一口头禅，不照抄别人开场，不轮流报菜单，不反复说这票我不让。'
              '不写主持人、客服腔，不说用餐定位、供用户取舍、各有优势，不泛泛夸自己。'
              '别每轮重复免责声明，只在当前问题需要时说明未知。昵称不是实际老板、厨师或品牌授权。无权改名单和用户条件。')
    return {'restaurantId': shop['id'], 'restaurantName': name, 'displayRestaurantName': display_name,
            'version': version + ':persona-v11', 'source': 'data-derived-rules', **identity,
            'identitySummary': summary, 'speakingStyle': ['口语', '短促', tone],
            'regionalStyle': {'description': regional, 'basis': basis},
            'greetingStyle': greeting,
            'speechStyle': style,
            'discussionFocus': '现场交锋、新信息与用户选择', 'systemPrompt': prompt}


def speech_system(persona, first):
    mode = (f"这是你在本会话首次亮相。先用适合你性格的一声简短招呼和用户见面，再自然带出你叫{persona['characterName']}、是哪家店（{persona['displayRestaurantName']}），让人先认得你，然后直接进入本轮话题。"
            '用自己的性格组织介绍，不要说替某某接一句，不追加口号。身份介绍后直接说本轮具体内容，不能再补一段用户需求复述。目标35至45字，硬上限55字。') if first else (
            '你已经亮过相，直接接本轮任务，不再重复报角色名或店名。目标20至30字，硬上限40字。')
    return (persona['systemPrompt'] + mode +
            '只输出一行JSON对象{"text":"完整短台词","evidenceIds":["实际使用的ID"]}，不要Markdown。'
            '1至2个短句，只讲一个重点；所有经营事实和数字必须来自实际引用的本轮证据。角色名和餐厅简称是身份元数据。'
            '可以复述用户明确的maxBudget，但须明确说成用户预算或上限，不能把它当商户报价。'
            'recentDialogue.text只有实际播完的小分句；partialAudio没有可靠文字。'
            'speculative=true时pendingPlayback仅是预生成假设，用户打断后废弃。')


def introduction_end(text, persona):
    positions = [text.find(token) for token in (persona['characterName'], persona['displayRestaurantName'])]
    if any(p < 0 for p in positions):
        return None
    return max(p + len(token) for p, token in zip(positions, (persona['characterName'], persona['displayRestaurantName'])))


def strip_repeated_setup(text):
    """Drop a repeated user-demand lead-in, preserving identity and business claims."""
    return re.sub(r'(^|[。！？；，])(?:约会|聚餐|吃饭)(?:想|要|得|需要).{0,5}(?:安静|便宜|省钱)[，,：:；;]', r'\1', text)


def style_context(view, sid):
    heard = [h for h in view.get('recentDialogue', []) if h.get('restaurantId') and h.get('text')
             and h.get('presentation') in {'ended', 'interrupted'}]
    pending = view.get('pendingPlayback', {}) if view.get('speculative') else {}
    if pending.get('text'):
        heard = [h for h in heard if h.get('turnId') != pending.get('turnId')] + [pending]
    return {'recentOpenings': [{'restaurantId': h['restaurantId'], 'opening': re.split('[，。！？；]', h['text'])[0][:28]}
                              for h in heard[-4:]],
            'ownRecentTexts': [h['text'] for h in heard if h['restaurantId'] == sid][-2:],
            'note': '避开相同起手和句架；pending仅为预生成假设，不能当作确认已听历史'}


def speech_style_violations(text):
    problems = []
    if re.search(r'我认(?!为|真|识|得)|我承认|我们承认|我不否认|我不遮|我不躲|我不回避|(?:我|我们)(?:确实|也|这边)?(?:做得不好|有不足|有问题|得改|需要改进)|(?:这点|这事|这两样)(?:我|我们)?(?:认|得改|不遮|不躲|不回避)', text):
        problems.append('禁止自我检讨和整改表态；删除认错部分，用本轮有依据的长处、质疑或反击接招，不能编造否认')
    if re.search(r'[^，。！？；]{1,16}(?:是加分(?:项)?|算加分(?:项)?|是好(?:事)?|是便宜|是不差|是不错|算优势|归(?:量足|舒服|安静|好|便宜|清爽|丰富|实惠|快))[，,；。]', text):
        problems.append('禁止先让步再转折的共用句架；删掉是好/是加分/归量足等铺垫，按角色独有节奏直接说观点')
    return problems
