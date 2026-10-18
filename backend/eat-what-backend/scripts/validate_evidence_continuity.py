"""Inject failed citations into real restaurant generation; conversation must continue."""
import asyncio
import json
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server.realtime_console import ConsoleSession, catalog
from tests.test_console_workflow import Socket, proposal


async def main():
    logging.getLogger('server.realtime_console').setLevel(logging.ERROR)
    socket = Socket()
    session = ConsoleSession(socket)
    socket.session = session
    delegate = session.llm
    assert delegate, 'real LLM required'

    class Inject:
        mode = 'partial'
        async def stream_text(self, system, user):
            payload = json.loads(user)
            if 'availableAgents' not in payload or self.mode == 'normal':
                async for part in delegate.stream_text(system, user):
                    yield part
                return
            agent = payload['availableAgents'][1]
            result = proposal(agent['restaurant']['id'], agent['evidence'])
            result.pop('evidenceIds')
            result['discussionDimension'] = '综合'
            result['evidenceRefs'] = (['E999999'] if self.mode == 'missing' else
                                      [f['selectionRef'] for f in agent['evidence'][:5 if self.mode == 'overlimit' else 1]] + ['E999999'])
            yield json.dumps(result, ensure_ascii=False)

    injected = Inject()
    session.llm, session.audio_on = injected, False
    report = {'turns': []}
    try:
        await session.start(list(catalog.shops)[:3], {'userNotes': ['我喜欢吃炸鸡']})
        for mode in ('partial', 'overlimit', 'missing', 'normal'):
            injected.mode = mode
            before = len(socket.events)
            session.kickoff(once=True)
            await asyncio.wait_for(asyncio.shield(session.task), 90)
            events = socket.events[before:]
            assert not any(e['type'] == 'error' for e in events), f'{mode} stopped conversation'
            final = next(e['data'] for e in events if e['type'] == 'text')
            plan = next(e['data']['plan'] for e in events if e['type'] == 'trace' and e['data']['stage'] == 'coordinator.plan')
            assert final['text'] and final['evidence']
            if mode == 'overlimit':
                assert len(plan['evidenceIds']) == 5, 'valid sources were capped or truncated'
            if mode == 'missing':
                assert plan.get('recovery') == 'available_evidence', 'all-missing recovery not exercised'
            if mode in ('partial', 'overlimit'):
                assert plan.get('ignoredEvidence'), 'bad reference was not reported'
            report['turns'].append({'mode': mode, 'plan': plan, 'text': final['text'], 'evidence': final['evidence']})
            print(json.dumps({'mode': mode, 'continued': True, 'text': final['text']}, ensure_ascii=False), flush=True)
        assert len([h for h in session.history if h.get('presentation') == 'ended']) == 4
        report['passed'] = True
        (ROOT / 'artifacts/evidence-continuity-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    except Exception:
        (ROOT / 'artifacts/evidence-continuity-failure.json').write_text(json.dumps({'report': report, 'events': socket.events}, ensure_ascii=False, indent=2), encoding='utf-8')
        raise
    finally:
        await session.close()


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    asyncio.run(main())
