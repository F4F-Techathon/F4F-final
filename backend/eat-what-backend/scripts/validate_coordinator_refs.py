"""Replay the captured review/offer typo against the real configured model."""
import asyncio
import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server.console_coordinator import COORDINATOR_PROMPT, candidate_evidence_refs, parse_plan, PlanEvidenceError
from server.realtime_console import ConsoleSession
from tests.test_console_workflow import Socket


async def main():
    saved = json.loads((ROOT / 'artifacts/coordinator-id-request.json').read_text(encoding='utf-8'))['data']['input']
    failure = json.loads((ROOT / 'artifacts/coordinator-id-failure.json').read_text(encoding='utf-8'))['data']
    candidates = {a['restaurant']['id']: a['evidence'] for a in saved['availableAgents']}
    choices = candidate_evidence_refs(candidates)
    refs = {fid: ref for ref, fid in choices.items()}
    payload = copy.deepcopy(saved)
    payload.pop('validation', None)
    for agent in payload['availableAgents']:
        for fact in agent['evidence']:
            fact['selectionRef'] = refs[fact['id']]
    view, query = payload['SessionView'], payload['userQuestion']
    filtered = parse_plan(failure['rawOutput'], candidates, view, query)
    assert filtered.get('ignoredEvidence'), 'incorrect prefix should be filtered'
    assert all(x in set(choices.values()) for x in filtered['evidenceIds'])
    rejected = {'code': 'EVIDENCE_FILTERED', 'reasons': ['无效引用已忽略，可重新选择所需资料'],
                'ignoredEvidence': filtered['ignoredEvidence']}
    socket = Socket()
    session = ConsoleSession(socket)
    socket.session = session
    report = {'input': query, 'initialFailure': rejected, 'runs': []}
    try:
        assert session.llm, 'real LLM not configured'
        for repair in (False, True):
            data = copy.deepcopy(payload)
            if repair:
                data['validation'] = {'error': str(rejected['reasons'][0]), 'previousOutput': failure['rawOutput'],
                                      **rejected, 'evidenceChoices': choices}
            system = COORDINATOR_PROMPT + ('\n上一份调度未通过。按validation修正，使用本轮evidenceRefs短选择码。' if repair else '')
            raw = ''.join([x async for x in session.llm.stream_text(system, json.dumps(data, ensure_ascii=False))])
            proposed = json.loads(raw)
            assert proposed.get('evidenceRefs'), 'model did not adopt short references'
            result = parse_plan(raw, candidates, view, query)
            assert result['evidenceIds'] == [choices[x] for x in dict.fromkeys(proposed['evidenceRefs'])]
            report['runs'].append({'repair': repair, 'raw': proposed, 'validated': result})
        await session.start(view['restaurantIds'], view['preferences'])
        session.audio_on = False
        prepared = await session.prepare_turn({'view': view, 'query': query,
                    'used': set(view.get('discussedEvidenceIds', [])), 'index': len(view['recentDialogue'])})
        assert prepared and prepared['text'] and prepared['evidence']
        report.update(passed=True, integratedPlan=prepared['plan'], integratedText=prepared['text'])
        (ROOT / 'artifacts/coordinator-ref-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'passed': True, 'checks': ['原始前缀错误已过滤，不影响其他有效引用', '真实模型选短码', '同一失败上下文修正成功',
                         '短码精确还原原始ID', '完整调度与餐厅生成通过'], 'text': prepared['text']}, ensure_ascii=False))
    finally:
        await session.close()


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    asyncio.run(main())
