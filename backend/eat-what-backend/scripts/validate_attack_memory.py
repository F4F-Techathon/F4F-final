"""Repeat an already heard complaint, then let the real LLM repair and continue."""
import asyncio
import json
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server.console_attack_memory import criticism_points, repeated_attack_points
from server.realtime_console import ConsoleSession, catalog
from tests.test_console_workflow import Socket, proposal


async def main():
    logging.getLogger('server.realtime_console').setLevel(logging.ERROR)
    socket = Socket()
    session = ConsoleSession(socket)
    socket.session, session.audio_on = session, False
    delegate = session.llm
    assert delegate, 'real LLM required'
    a, b, c = list(catalog.shops)[:3]
    review = next(f for f in catalog.facts[b] if any(p['issue'] == '口味差' for p in criticism_points(f)))
    own = catalog.select(a, 0, set())
    report = {'turns': []}
    try:
        await session.start([a, b, c])
        session.introduced.add(a)
        session.history.append({'turnId': 'heard-attack', 'restaurantId': c, 'text': '你那味道一般般。',
                                'evidenceIds': [review['id']], 'presentation': 'ended', 'speechAct': 'attack', 'targetRestaurantId': b})
        original_planner = session.plan_turn
        async def repeat_plan():
            result = proposal(a, own)
            result.update(speechAct='attack', targetRestaurantId=b, evidenceIds=[own[0]['id'], review['id']])
            return result, [own[0], review]
        class Inject:
            async def stream_text(self, system, user):
                data = json.loads(user)
                if 'availableAgents' not in data and data['TurnPlan']['speechAct'] == 'attack' and 'proposal' not in data:
                    yield json.dumps({'text': '上校，你那味道一般般。', 'evidenceIds': [review['id']]}, ensure_ascii=False)
                    return
                async for delta in delegate.stream_text(system, user):
                    yield delta
        session.llm, session.plan_turn = Inject(), repeat_plan
        for index in range(2):
            if index:
                session.llm, session.plan_turn = delegate, original_planner
            before = len(socket.events)
            session.kickoff(once=True)
            await asyncio.wait_for(asyncio.shield(session.task), 90)
            events = socket.events[before:]
            assert not any(e['type'] == 'error' for e in events), 'repeated evidence stopped the session'
            final = next(e['data'] for e in events if e['type'] == 'text')
            generation = [e['data'] for e in events if e['type'] == 'workflow' and e['data']['stage'] == 'generate' and e['data']['status'] == 'running']
            view = generation[-1]['input']['SessionView']
            assert not repeated_attack_points(final['text'], [f['id'] for f in final['evidence']],
                                              final['evidence'], final['speakerId'], view), 'old complaint reached final output'
            report['turns'].append({'injectedRepeat': not index, 'text': final['text'], 'evidence': final['evidence'],
                                    'memory': view['usedAttackPoints']})
            print(json.dumps({'injectedRepeat': not index, 'continued': True, 'text': final['text']}, ensure_ascii=False), flush=True)
        assert any(e['type'] == 'trace' and e['data']['stage'] == 'evidence.check' and e['data'].get('repeatedAttackPoints') for e in socket.events)
        report['passed'] = True
        (ROOT / 'artifacts/attack-memory-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    finally:
        await session.close()


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    asyncio.run(main())
