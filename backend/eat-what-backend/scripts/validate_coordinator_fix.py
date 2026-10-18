"""Replay the captured cross-restaurant failure and call the real model again."""
import asyncio
import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server.console_coordinator import parse_plan
from server.realtime_console import ConsoleSession
from tests.test_console_workflow import Socket


async def main():
    replay = json.loads((ROOT / 'artifacts/coordinator-failure-replay.json').read_text(encoding='utf-8'))
    inp = replay['input']
    view = inp['SessionView']
    candidates = {a['restaurant']['id']: a['evidence'] for a in inp['availableAgents']}
    original = parse_plan(replay['rawOutput'], candidates, view)
    ws = Socket()
    session = ConsoleSession(ws)
    ws.session = session
    try:
        await session.start(view['restaurantIds'])
        session.history = copy.deepcopy(view['recentDialogue'])
        session.introduced = set(view['introducedRestaurantIds'])
        session.used = set(view['discussedEvidenceIds'])
        session.query = inp['userQuestion']
        session.preferences = copy.deepcopy(view['preferences'])
        session.index = sum(h.get('presentation') == 'ended' for h in session.history)
        prepared = await session.prepare_turn()
        assert prepared and prepared['segments']
        assert not any(e['type'] == 'trace' and 'fallback' in e['data']['stage'] for e in ws.events)
        report = {'passed': True, 'originalCrossRestaurantPlanAccepted': original,
                  'realModelPlan': prepared['plan'], 'text': prepared['text'],
                  'evidenceIds': [f['id'] for f in prepared['evidence']],
                  'modelRequests': len([e for e in ws.events if e['type'] == 'workflow'
                                       and e['data']['status'] == 'running' and 'systemPrompt' in e['data']]),
                  'noPhysicalMicrophone': True}
        (ROOT / 'artifacts/coordinator-fix-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(report, ensure_ascii=False, indent=2))
    finally:
        await session.close()


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    asyncio.run(main())
