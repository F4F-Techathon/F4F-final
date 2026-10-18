"""Source-and-issue memory from heard speech, shared by all restaurant agents."""
import hashlib
import re
from functools import lru_cache


# These identify repeated complaints, not the truth of a review.
ISSUES = {
    '上菜慢': r'上菜慢|出餐慢|等太久|等.{0,5}(?:半小时|小时|分钟)|催菜|久等',
    '菜凉': r'冷掉|凉了|凉过|已经凉|冷的|冷冰冰|上桌.{0,5}[冷凉]|温温.{0,4}腥',
    '食材不新鲜': r'不新鲜|肉质松散|肉散|化水',
    '霉变': r'发霉|霉点|变质',
    '异物': r'头发|异物|虫子',
    '异味': r'血水味|带血水|腥味|带腥|膻味|膻到',
    '口味差': r'难吃|不好吃|味道.{0,4}(?:一般|不对)|一般般|吃不出.{0,4}味',
    '太咸': r'太咸|偏咸|咸得|齁咸',
    '油腻': r'太油|油腻|油得',
    '口感差': r'嚼不动|又硬又柴|粘底|粘住|过头',
    '菜品少': r'热菜.{0,4}(?:少|不多)|品种.{0,4}少|种类.{0,4}少|选择.{0,4}(?:少|有限)|甜品少',
    '分量不足': r'没吃饱|吃不饱|不够吃|分量.{0,3}少|份量.{0,3}少|量少',
    '补货慢': r'不补|补货慢|空盘.{0,5}(?:等|久)|补货不及时',
    '服务迟缓': r'倒水不及时|加水不及时|没人倒水|不加茶|没人续|倒水.{0,3}慢',
    '服务态度': r'态度.{0,4}(?:差|生硬)|不耐烦|无人接待|没人接待|服务一般|服务.{0,3}差',
    '忌口询问': r'不问忌口|忌口不问|不询问|不问.{0,3}忌口',
    '座位拥挤': r'座位.{0,3}少|位置不多|包间紧凑|拥挤|挤满',
    '价格体验': r'太贵|偏贵|不值|性价比.{0,3}一般|几筷.{0,5}(?:三十|30)',
}


def _clean(text):
    return re.sub(r'[^\u4e00-\u9fffA-Za-z0-9]', '', text)


def _negative_text(text):
    return re.sub(r'(?:没有|没|并不|不|无)(?:太|很|明显)?(?:油腻|腥味|异物|发霉|变质)|(?:不算|不能说|谈不上)难吃', '', text)


@lru_cache(maxsize=8192)
def _points(fid, owner, quote, hints):
    points = {}
    clauses = re.split(r'[。！？；，,\n]+', quote)
    for clause in clauses:
        for issue, pattern in ISSUES.items():
            if re.search(pattern, _negative_text(clause)):
                points.setdefault(issue, clause.strip())
    for dimension, snippet in hints:
        found = False
        for issue, pattern in ISSUES.items():
            if re.search(pattern, _negative_text(snippet)):
                points.setdefault(issue, snippet)
                found = True
        if not found:
            points.setdefault(dimension + ':' + _clean(snippet), snippet)
    return tuple({'pointId': hashlib.sha256((fid + '\0' + issue).encode()).hexdigest()[:16],
                  'evidenceId': fid, 'targetRestaurantId': owner, 'issue': issue, 'snippet': snippet}
                 for issue, snippet in points.items())


def criticism_points(fact, owner=None):
    if fact.get('kind') != 'review' and 'reviewInsights' not in fact:
        return ()
    hints = tuple((p['dimension'], p['snippet']) for p in fact.get('reviewInsights', {}).get('criticism', []))
    return _points(fact['id'], fact.get('restaurantId', owner), fact.get('quote', ''), hints)


def mentions_point(text, point):
    pattern = ISSUES.get(point['issue'])
    if pattern:
        return bool(re.search(pattern, _negative_text(text)))
    source, spoken = _clean(point['snippet']), _clean(text)
    tokens = {source[i:i+2] for i in range(len(source)-1)}
    overlap = sum(token in spoken for token in tokens)
    return overlap >= 2 and overlap / max(1, len(tokens)) >= .45


def heard_turns(view):
    pending = view.get('pendingPlayback', {}) if view.get('speculative') else {}
    turns = [h for h in view.get('recentDialogue', []) if h.get('text')
             and h.get('presentation') in {'ended', 'interrupted'} and h.get('turnId') != pending.get('turnId')]
    return turns + ([pending] if pending.get('text') else [])


def used_attack_points(candidates, view):
    sources = {f['id']: (f, sid) for sid, facts in candidates.items() for f in facts}
    used = {}
    for turn in heard_turns(view):
        for fid in turn.get('evidenceIds', []):
            if fid not in sources:
                continue
            fact, owner = sources[fid]
            if owner == turn.get('restaurantId'):
                continue  # Answering a challenge about oneself is not a new attack.
            for point in criticism_points(fact, owner):
                if mentions_point(turn['text'], point):
                    used.setdefault(point['pointId'], {**point, 'turnId': turn.get('turnId')})
    return list(used.values())


def repeated_attack_points(text, evidence_ids, facts, speaker_id, view):
    used = {p['pointId'] for p in view.get('usedAttackPoints', [])}
    return [p for fact in facts if fact['id'] in evidence_ids and fact.get('restaurantId') != speaker_id
            for p in criticism_points(fact) if p['pointId'] in used and mentions_point(text, p)]


def explicit_review_followup(view, plan):
    return bool(plan and plan.get('speechAct') in {'answer', 'clarify'} and
                re.search(r'刚才|之前|那条|差评|为什么|怎么回事|具体|解释|详细|证据|再说', view.get('userQuestion', '')))
