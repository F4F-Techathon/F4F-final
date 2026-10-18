"""Persist user statements; structured hints aid retrieval, never replace them."""
import copy
import re


def chinese_number(value):
    if value.isdigit():
        return int(value)
    digits = dict(zip('零一二三四五六七八九', range(10)))
    digits['两'] = 2
    total = current = 0
    for char in value:
        if char in digits:
            current = digits[char]
        elif char in '十百千':
            total += (current or 1) * {'十': 10, '百': 100, '千': 1000}[char]
            current = 0
    return total + current


def update_preferences(previous, text):
    prefs = copy.deepcopy(previous)
    text = text.strip()[:600]
    if not text:
        return prefs
    notes = prefs.setdefault('userNotes', [])
    if not notes or notes[-1] != text:
        notes.append(text)
    prefs['userNotes'] = notes[-20:]
    prefs['latestUserStatement'] = text
    budget = re.search(r'(?:预算|人均|最多|不超过)[^\d零一二两三四五六七八九十百千]{0,4}(\d+|[零一二两三四五六七八九十百千]+)', text)
    if budget:
        prefs['maxBudget'] = chinese_number(budget.group(1))
    elif any(w in text for w in ('预算不限', '不限预算', '不限制预算', '不用考虑预算')):
        prefs.pop('maxBudget', None)
    if any(w in text for w in ('不用安静', '不需要安静', '吵一点没关系', '想热闹')):
        prefs['quiet'] = False
    elif any(w in text for w in ('安静', '不吵', '别太吵')):
        prefs['quiet'] = True
    spice = list(re.finditer('不能吃辣|不吃辣|不要辣|不辣|可以吃辣|(?<!不)能吃辣|想吃辣', text))
    if spice:
        prefs['noSpice'] = spice[-1].group() in {'不能吃辣', '不吃辣', '不要辣', '不辣'}
    if '过敏' in text:
        prefs['allergySource'] = text
    return prefs


def initial_preferences(value):
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValueError('preferences必须是对象')
    prefs = {}
    if 'maxBudget' in value:
        budget = value['maxBudget']
        if isinstance(budget, bool) or not isinstance(budget, (int, float)) or not 0 < budget < 100000:
            raise ValueError('maxBudget必须是有效正数')
        prefs['maxBudget'] = budget
    for key in ('quiet', 'noSpice'):
        if key in value:
            if not isinstance(value[key], bool):
                raise ValueError(key + '必须是布尔值')
            prefs[key] = value[key]
    if isinstance(value.get('allergySource'), str):
        prefs['allergySource'] = value['allergySource'][:600]
    notes = value.get('userNotes', [])
    if not isinstance(notes, list) or any(not isinstance(x, str) for x in notes):
        raise ValueError('userNotes必须是字符串数组')
    for note in notes[-20:]:
        prefs = update_preferences(prefs, note)
    return prefs
