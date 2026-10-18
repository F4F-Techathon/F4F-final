"""Real multi-round debate: first appearances, active voice, topic breadth."""
import asyncio
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server.realtime_console import ConsoleSession, catalog
from tests.test_console_workflow import Socket


async def main():
    ws = Socket()
    session = ConsoleSession(ws)
    ws.session = session
    session.audio_on = False
    turns = []
    ids = [sid for sid, shop in catalog.shops.items() if any(clue in shop['name'] for clue in ('聚聚乐', '甬悦', '知竹'))]
    try:
        await session.start(ids, {'userNotes': ['今天约会，喜欢安静一点，预算不限。']})
        for _ in range(5):
            before = len(ws.events)
            await session.turn()
            events = ws.events[before:]
            final = next(e['data'] for e in events if e['type'] == 'text')
            plan = next(e['data']['plan'] for e in events if e['type'] == 'trace' and e['data']['stage'] == 'coordinator.plan')
            assert len(final['text']) <= (55 if plan['introduce'] else 40)
            assert not re.search('被夸|替.{0,16}[接说]一句', final['text'])
            assert not any(e['type'] == 'trace' and 'fallback' in e['data']['stage'] for e in events)
            turns.append({'speaker': plan['speaker'], 'firstAppearance': plan['introduce'],
                          'action': plan['speechAct'],
                          'dimension': plan['discussionDimension'], 'directive': {k: plan.get(k) for k in ('speechAct', 'targetRestaurantId', 'replyTo', 'evidenceIds')},
                          'text': final['text'], 'evidence': final['evidence']})
        assert len({t['dimension'] for t in turns}) >= 2, '讨论仍被单一维度锁住'
        assert any(f['kind'] in {'dish', 'package', 'coupon'} for t in turns for f in t['evidence']) or any(
            re.search('鱼|虾|鸡|牛排|烤鸭|小龙虾|豆腐|毛血旺', t['text']) for t in turns), '没有让具体菜品或套餐进入讨论'
        assert any(not t['firstAppearance'] for t in turns), '未覆盖后续轮次'
        report = {'passed': True, 'input': 'text-only real model; no microphone', 'turns': turns}
        (ROOT / 'artifacts/debate-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'passed': True, 'turns': [{k:v for k,v in t.items() if k != 'evidence'} for t in turns]}, ensure_ascii=False, indent=2))
    except Exception:
        (ROOT / 'artifacts/debate-failure.json').write_text(json.dumps(ws.events, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'turns': turns, 'checks': [e['data'] for e in ws.events if e['type']=='trace' and e['data']['stage']=='evidence.check'][-2:]}, ensure_ascii=False))
        raise
    finally:
        await session.close()


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    asyncio.run(main())
