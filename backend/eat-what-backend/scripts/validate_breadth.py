"""Replay the reported citation failure, then measure real-model topic breadth."""
import asyncio
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server.realtime_console import ConsoleSession, catalog
from tests.test_console_workflow import Socket, proposal


async def replay():
    ws = Socket()
    session = ConsoleSession(ws)
    ws.session, session.audio_on = session, False
    ids = list(catalog.shops)[:2]
    await session.start(ids)
    sid = ids[1]
    session.introduced.add(sid)
    session.history.append({'turnId': 'old128', 'restaurantId': ids[0], 'text': '我128特价自助。',
                            'evidenceIds': [], 'presentation': 'ended'})
    facts = [f for f in catalog.facts[sid] if f['id'] in {f'offer:{sid}:1642769939', f'dish:{sid}:867939397'}]
    async def plan():
        return {**proposal(sid, facts), 'evidenceIds': [f['id'] for f in facts], 'speechAct': 'respond',
                'targetRestaurantId': ids[0], 'goal': '接对方自助话头，讲本店下午茶双拼，报价只用分配资料'}, facts
    real = session.llm
    class ReplayModel:
        async def stream_text(self, system, user):
            payload = json.loads(user)
            if 'requiredEdits' not in payload:
                yield json.dumps({'text': '阿乐那128自助得凑一顿，我下午茶双拼10.9元，薯条14元，一个人解馋不用等。',
                                  'evidenceIds': [f['id'] for f in facts]}, ensure_ascii=False)
            else:
                async for delta in real.stream_text(system, user):
                    yield delta
    session.plan_turn, session.llm = plan, ReplayModel()
    try:
        await session.turn()
        final = next(e['data'] for e in ws.events if e['type'] == 'text')
        checks = [e['data'] for e in ws.events if e['type'] == 'trace' and e['data']['stage'] == 'evidence.check']
        assert [c['passed'] for c in checks] == [False, True]
        assert '128' not in final['text']
        result = {'passed': True, 'text': final['text'], 'checks': checks}
        print('Citation replay: ' + final['text'], flush=True)
        return result
    finally:
        await session.close()


async def scenario(label, ids, preferences, count):
    ws, turns = Socket(), []
    session = ConsoleSession(ws)
    ws.session, session.audio_on = session, False
    try:
        await session.start(ids, preferences)
        for index in range(count + 1):
            if index == count:
                session.query = '说说你们的参考人均价格'
                session.history.append({'role': 'user', 'text': session.query})
            before = len(ws.events)
            await session.turn()
            current = ws.events[before:]
            final = next(e['data'] for e in current if e['type'] == 'text')
            plan = next(e['data']['plan'] for e in current if e['type'] == 'trace' and e['data']['stage'] == 'coordinator.plan')
            turn = {'speaker': final['characterName'], 'action': final['speechAct'], 'dimension': final['discussionDimension'],
                    'text': final['text'], 'plan': plan, 'evidence': final['evidence'], 'priceQuestion': index == count}
            turns.append(turn)
            print(json.dumps({'scenario': label, 'round': index+1, **{k: turn[k] for k in ('speaker', 'action', 'dimension', 'text')}}, ensure_ascii=False), flush=True)
        automatic = turns[:count]
        dimensions = Counter(t['dimension'] for t in automatic)
        actions = Counter(t['action'] for t in automatic)
        review_turns = sum(any(f['kind'] == 'review' for f in t['evidence']) for t in automatic)
        for n in range(2, count):
            assert not all(t['action'] == 'attack' for t in automatic[n-2:n+1]), 'three consecutive attacks'
            assert not all(t['dimension'] == '价格' for t in automatic[n-2:n+1]), 'three consecutive price rounds'
        assert len(dimensions) >= 4, 'too few actual discussion dimensions'
        assert review_turns >= count//2, 'reviews not regularly used'
        assert sum(t['dimension'] != '价格' for t in automatic) >= count//2, 'prices still dominate'
        assert turns[-1]['dimension'] == '价格', 'explicit price request was ignored'
        return {'passed': True, 'label': label, 'dimensions': dict(dimensions), 'actions': dict(actions),
                'reviewTurns': review_turns, 'automaticRounds': count, 'turns': turns}
    except Exception:
        (ROOT / f'artifacts/breadth-{label}-failure.json').write_text(json.dumps(ws.events, ensure_ascii=False, indent=2), encoding='utf-8')
        raise
    finally:
        await session.close()


async def review_attack():
    ws = Socket()
    session = ConsoleSession(ws)
    ws.session, session.audio_on = session, False
    ids = [sid for sid, s in catalog.shops.items() if any(x in s['name'] for x in ('甬悦', '知竹'))]
    try:
        await session.start(ids)
        question = '让甬悦柒鲜指出知竹服务方面的槽点，别比价格。'
        session.query = question
        session.history.append({'role': 'user', 'text': session.query})
        await session.turn()
        final = next(e['data'] for e in ws.events if e['type'] == 'text')
        assert final['speechAct'] == 'attack'
        assert final['discussionDimension'] == '服务'
        own = final['speakerId']
        critical = [f for f in final['evidence'] if f['restaurantId'] != own and f.get('reviewInsights', {}).get('criticism')]
        assert critical, 'attack lacks an assigned opposing review'
        result = {'passed': True, 'input': question, 'output': final}
        (ROOT / 'artifacts/review-attack-validation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(result, ensure_ascii=False), flush=True)
        return result
    finally:
        await session.close()


async def main():
    report = {'citationReplay': await replay(), 'scenarios': []}
    cases = [('current-roster', [sid for sid, s in catalog.shops.items() if any(x in s['name'] for x in ('聚聚乐', '肯德基', '赛百味', '湘稻香'))], {}, 10),
             ('quiet-preference', [sid for sid, s in catalog.shops.items() if any(x in s['name'] for x in ('聚聚乐', '甬悦', '知竹'))], {'userNotes': ['今天约会，喜欢安静一点，预算不限。']}, 8)]
    for label, ids, prefs, count in cases:
        report['scenarios'].append(await scenario(label, ids, prefs, count))
        (ROOT / 'artifacts/breadth-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    report['reviewAttack'] = await review_attack()
    report['passed'] = True
    (ROOT / 'artifacts/breadth-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('Breadth and citation replay checks passed.', flush=True)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    asyncio.run(main())
