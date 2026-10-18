"""Real-model short dialogue, preference persistence and exact evidence assignment."""
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server.realtime_console import ConsoleSession, catalog
from tests.test_console_workflow import Socket


async def scenario(note):
    ws = Socket()
    session = ConsoleSession(ws)
    ws.session = session
    session.audio_on = False
    turns = []
    try:
        await session.start(list(catalog.shops), {'userNotes': [note]})
        for _ in range(2):
            before = len(ws.events)
            await session.turn()
            events = ws.events[before:]
            final = next(e['data'] for e in events if e['type'] == 'text')
            context = next(e['data'] for e in events if e['type'] == 'trace' and e['data']['stage'] == 'agent.context')
            plan = next(e['data']['plan'] for e in events if e['type'] == 'trace' and e['data']['stage'] == 'coordinator.plan')
            assert set(plan['evidenceIds']) == {f['id'] for f in context['evidence']}
            assert context['SessionView']['preferences']['userNotes'] == [note]
            assert len(final['text']) <= (55 if plan['introduce'] else 40)
            assert not any(e['type'] == 'trace' and 'fallback' in e['data']['stage'] for e in events)
            assert len([e for e in events if e['type'] == 'text']) == 1
            assert any(e['type'] == 'speech.ready' for e in events)
            turns.append({'plan': plan, 'text': final['text'], 'length': len(final['text']),
                          'evidence': context['evidence']})
        return {'userPreference': note, 'turns': turns}
    except Exception:
        (ROOT / 'artifacts/preferences-failure.json').write_text(json.dumps(ws.events, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps([e['data'] for e in ws.events if e['type'] == 'trace' and e['data']['stage'] == 'evidence.check'][-3:], ensure_ascii=False))
        raise
    finally:
        await session.close()


async def main():
    results = []
    for note in ('预算不限，今天约会，最在意环境安静，别只比谁便宜。', '人均四十以内，想吃得划算，先比价格。'):
        results.append(await scenario(note))
    report = {'passed': True, 'input': 'text-only real model; no physical microphone', 'scenarios': results}
    (ROOT / 'artifacts/preferences-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'passed': True, 'scenarios': [{'preference': x['userPreference'], 'turns': [{'speaker': t['plan']['speaker'], 'text': t['text'], 'length': t['length'], 'focus': t['plan']['preferenceFocus']} for t in x['turns']]} for x in results]}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    asyncio.run(main())
