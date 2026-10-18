"""Transparent source-ID and numeric checks; not a semantic truth verifier."""
import re
from decimal import Decimal


def repair_requirements(check):
    """Give the model concrete edits without expanding its assigned evidence."""
    edits = list(check['reasons'])
    if check.get('forbiddenPhrases'):
        edits.append('把台词中的“' + '、'.join(check['forbiddenPhrases']) + '”这些字删掉并重组句子，'
                     '不要换成其他转述来源的说法。攻击时直接向对手说具体问题，例如“你那道菜…”；证据ID保留，不把出处念进台词。')
    if check.get('unknownEvidenceIds'):
        edits.append('这些ID未分配给你：' + '、'.join(check['unknownEvidenceIds']) + '。'
                     '不能只删除ID却保留相应事实；删除由它们支持的台词，或改为当前evidence原文明示支持的内容，不能拿历史台词当新依据。')
    for number in check.get('invalidNumbers', []):
        candidates = check.get('availableCitations', {}).get(number, [])
        if candidates:
            edits.append(f'数字{number}只能在确实使用相应事实时引用这些已分配ID：' + '、'.join(candidates))
        else:
            edits.append(f'数字{number}在本轮分配资料中没有依据，必须删除这一金额/数量或改为不带数字的指代。'
                         '即便它出现在recentDialogue、pendingPlayback或上一稿中，也不能重复；不要为它编造或追加ID。')
    return edits


def numbers(text):
    return {format(Decimal(x).normalize(), 'f') for x in re.findall(r"\d+(?:\.\d+)?", text)}


def check_segment(proposal, facts, context_numbers=()):
    refs = {f["id"]: f for f in facts}
    if not isinstance(proposal, dict):
        return {"passed": False, "text": "", "evidence": [], "reasons": ["输出不是对象"], "invalidNumbers": [], "unknownEvidenceIds": []}
    text = proposal.get("text", "")
    ids = proposal.get("evidenceIds", [])
    reasons = []
    if not isinstance(text, str):
        text = ""
    text = text.strip()
    if not text:
        reasons.append("发言为空")
    elif len(text) > 300:
        reasons.append("发言超过300字")
    if not isinstance(ids, list) or any(not isinstance(x, str) for x in ids):
        ids = []
        reasons.append("evidenceIds必须是字符串数组")
    unknown = [x for x in ids if x not in refs]
    evidence = [refs[x] for x in dict.fromkeys(ids) if x in refs]
    if unknown:
        reasons.append("包含不在本轮上下文的证据ID")
    if not evidence:
        reasons.append("没有有效引用")
    # Check cited evidence, not unrelated facts that merely happen to contain the number.
    allowed = numbers(" ".join(f["quote"] for f in evidence)) | numbers(' '.join(str(x) for x in context_numbers))
    invalid = sorted(numbers(text) - allowed)
    suggestions = {n: [f["id"] for f in facts if n in numbers(f["quote"])] for n in invalid}
    if invalid:
        reasons.append("这些数字不在所引用的证据中：" + "、".join(invalid))
    return {"passed": not reasons, "text": text, "evidence": evidence, "reasons": reasons,
            "invalidNumbers": invalid, "unknownEvidenceIds": unknown, "availableCitations": suggestions,
            "checks": ["引用ID全部存在", "非空短句", "数字来自实际引用或明确用户预算"],
            "limitation": "不验证完整语义、中文数字或单位匹配"}
