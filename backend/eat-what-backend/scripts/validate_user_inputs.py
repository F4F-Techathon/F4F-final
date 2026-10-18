"""Real LLM conversation with user commands routed through ConsoleSession.command.

The test sink acknowledges completed text turns. It runs one turn per step so
that scenarios stay reproducible; no microphone or browser session is used.
"""
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server.realtime_console import ConsoleSession, catalog
from tests.test_console_workflow import Socket


async def main():
    socket = Socket()
    session = ConsoleSession(socket)
    socket.session, session.audio_on = session, False
    start_turn = session.kickoff
    session.kickoff = lambda **kwargs: start_turn(once=True)
    ids = [sid for sid, s in catalog.shops.items() if any(x in s['name'] for x in ('聚聚乐', '肯德基', '赛百味', '湘稻香'))]
    by_name = {catalog.persona(sid)['characterName']: sid for sid in ids}
    report = {'inputMode': 'simulated user.text commands; real LLM; completed text acknowledged; no physical microphone', 'steps': []}
    try:
        await session.command({'type': 'session.start', 'data': {'restaurantIds': ids, 'audioEnabled': False,
                               'preferences': {'userNotes': ['我喜欢环境安静一点。']}}})

        async def step(text=None, check=None):
            before = len(socket.events)
            if text is None:
                await session.command({'type': 'control', 'data': {'action': 'next'}})
            else:
                await session.command({'type': 'user.text', 'data': {'text': text}})
            if session.task:
                await asyncio.wait_for(asyncio.shield(session.task), 90)
            events = socket.events[before:]
            errors = [e['data'] for e in events if e['type'] == 'error']
            assert not errors, errors
            speech = next((e['data'] for e in events if e['type'] == 'text'), None)
            plan = next((e['data']['plan'] for e in events if e['type'] == 'trace' and e['data']['stage'] == 'coordinator.plan'), None)
            if text != '暂停':
                assert speech, 'no response to user input'
                assert speech['speakerId'] in session.ids, 'removed restaurant spoke'
                assert speech['speechAct'] == plan['speechAct']
            if check:
                check(speech, events)
            row = {'input': text or '(用户暂不说话，让餐厅自行推进)', 'speech': speech, 'plan': plan,
                   'preferences': session.preferences.copy(), 'restaurantIds': list(session.ids), 'passed': True}
            report['steps'].append(row)
            print(json.dumps({'input': row['input'], 'speaker': speech and speech['characterName'],
                              'action': speech and speech['speechAct'], 'dimension': speech and speech['discussionDimension'],
                              'text': speech and speech['text']}, ensure_ascii=False), flush=True)
            return speech

        def require(condition, message):
            assert condition, message
        await step()
        await step()
        await step('先别比价格，讲讲服务和上菜速度。', lambda s, e: require(s['discussionDimension'] in {'服务', '上菜'}, 'ignored topic switch'))
        await step('上校，你家出餐快不快？', lambda s, e: require(s['speakerId'] == by_name['上校'] and s['speechAct'] == 'answer', 'ignored named question'))
        await step('人均预算改成50元，不能吃辣。', lambda s, e: require(session.preferences.get('maxBudget') == 50 and session.preferences.get('noSpice') is True, 'budget/spice change lost'))
        await step('预算不限了，可以吃辣；吵一点没关系。', lambda s, e: require('maxBudget' not in session.preferences and session.preferences.get('noSpice') is False and session.preferences.get('quiet') is False, 'latest correction not applied'))
        def removed(speech, events):
            require(by_name['上校'] not in session.ids, 'remove command not applied')
            roster = next(e['data'] for e in events if e['type'] == 'restaurants.updated')
            require(roster['reason'] == 'user.remove' and by_name['上校'] in roster['removedRestaurantIds'], 'missing formal roster update')
        await step('踢走上校', removed)
        await step('小麦，你的三明治具体好在哪？', lambda s, e: require(s['speakerId'] == by_name['小麦'] and s['speechAct'] == 'answer', 'did not answer named follow-up'))
        await step()
        await step('暂停', lambda s, e: require(s is None and not session.running, 'pause still produced speech'))
        report['passed'] = True
        (ROOT / 'artifacts/user-input-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print('Simulated user input checks passed.', flush=True)
    except Exception:
        (ROOT / 'artifacts/user-input-failure.json').write_text(json.dumps({'report': report, 'events': socket.events}, ensure_ascii=False, indent=2), encoding='utf-8')
        raise
    finally:
        await session.close()


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    asyncio.run(main())
