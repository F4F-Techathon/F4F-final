"""Retrieval hints extracted from original review clauses, not verified guarantees."""
import re

THEMES = {
    '口味': r'口味|好吃|难吃|味道|鲜美|太咸|偏咸|清淡|油腻|入味|不辣',
    '食材': r'食材|新鲜|不新鲜|三文鱼|海鲜|虾|鱼肉|肉质|发霉|变质|异物',
    '分量': r'分量|份量|量足|量少|料多|料很多|吃饱|不够吃|个头',
    '菜品选择': r'选择|种类|丰富|招牌|推荐菜|特色|热菜',
    '服务': r'服务|态度|倒水|加茶|收盘|包好|热情|贴心|周到|忌口|答不上|接待|核销',
    '上菜': r'上菜|出餐|等菜|等了|等太久|催菜',
    '环境': r'环境|安静|吵|氛围|装修|干净|卫生',
    '座位': r'座位|沙发|包间|宽敞|拥挤|座椅|坐着',
    '摆盘': r'摆盘|仪式感|颜值|装盘|好看',
    '便利': r'停车|交通|地铁|方便|位置|排队',
    '性价比': r'性价比|价格|贵|便宜|划算|实惠|不值',
}
NEGATIVE = re.compile(r'发霉|变质|异物|无人接待|没人接待|态度.{0,3}生硬|不(?:是)?(?:很|太|怎么)?好吃|没有(?:特别|很|太|那么)?好吃|难吃|不(?:是)?(?:很|太|够)?新鲜|太咸|偏咸|太油|油腻|量少|分量.{0,3}少|选择偏少|选择有限|种类.{0,3}少|不多|'
                      r'不够及时|不及时|不询问|不问|答不上|服务.{0,3}差|态度.{0,3}差|不耐烦|服务一般|体验感一般|'
                      r'上菜慢|出餐慢|等太久|催菜|很吵|太吵|吵闹|嘈杂|不干净|脏|太贵|偏贵|不值|失望|踩雷|一般般|很一般')
POSITIVE = re.compile(r'好吃|不错|新鲜|鲜美|入味|料很多|量足|实在|丰富|热情|贴心|周到|及时|主动|干净|安静|不吵|不贵|不.*油腻|舒适|优雅|宽敞|方便|划算|实惠|精致|包好|仪式感|好看|很棒|很好|满意')


def review_insights(text):
    result = {'praise': [], 'criticism': []}
    seen = {'praise': set(), 'criticism': set()}
    for clause in re.split(r'[。！？；\s，,]+|(?=但是|不过)', text):
        clause = clause.strip()
        if not clause:
            continue
        negative = NEGATIVE.search(clause)
        # Negation matters: "不吵/不油腻/不贵" must not become attack material.
        cleaned = re.sub(r'不(?:会|是)?(?:太|怎么|算|很|过于)?(?:吵闹|嘈杂|油腻|贵|很吵|太吵)|没有.{0,2}(?:吵闹|嘈杂|发霉|变质|异物)|没(?:有)?发霉', '', clause)
        negative = NEGATIVE.search(cleaned) if negative else None
        polarity = 'criticism' if negative else 'praise' if POSITIVE.search(clause) else None
        if not polarity:
            continue
        themes = [theme for theme, pattern in THEMES.items() if re.search(pattern, clause)] or ['体验']
        for theme in themes:
            if theme not in seen[polarity] and len(result[polarity]) < 6:
                result[polarity].append({'dimension': theme, 'snippet': clause[:180]})
                seen[polarity].add(theme)
    return result
