"""Real LLM action mix, followed by simulated user questions and corrections."""
import asyncio
import json
import logging
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server.realtime_console import ConsoleSession, catalog
from server.console_persona import speech_style_violations
from tests.test_console_workflow import Socket


async def main():
    logging.getLogger('server.realtime_console').setLevel(logging.ERROR)
    socket = Socket()
    session = ConsoleSession(socket)
    socket.session, session.audio_on = session, False
    kickoff = session.kickoff
    session.kickoff = lambda **kwargs: kickoff(once=True)
    ids = [sid for sid, s in catalog.shops.items() if any(x in s['name'] for x in ('聚聚乐', '甬悦', '知竹', '湘稻香'))]
    report = {'inputMode': 'real LLM; simulated user.text commands; completed text acknowledged; no microphone', 'turns': []}
    try:
        await session.start(ids)
        async def step(text=None):
            before = len(socket.events)
            if text:
                await session.command({'type': 'user.text', 'data': {'text': text}})
            else:
                await session.command({'type': 'control', 'data': {'action': 'next'}})
            await asyncio.wait_for(asyncio.shield(session.task), 90)
            events = socket.events[before:]
            assert not [e for e in events if e['type'] == 'error'], 'turn failed; inspect saved events'
            model_inputs = [e['data']['input'] for e in events if e['type'] == 'workflow'
                            and e['data'].get('stage') in {'generate', 'repair'} and e['data'].get('status') == 'running']
            for payload in model_inputs:
                assert not {'goal', 'summary', 'topic', 'suggestedText'} & payload['TurnPlan'].keys(), 'scheduler prose leaked'
                assert payload['SessionView']['preferences'] == session.preferences, 'preferences missing'
                assert 'userQuestion' in payload, 'latest user input missing'
            final = next(e['data'] for e in events if e['type'] == 'text')
            plan = next(e['data']['plan'] for e in events if e['type'] == 'trace' and e['data']['stage'] == 'coordinator.plan')
            balance = next(e['data']['input']['conversationBalance'] for e in events if e['type'] == 'workflow'
                           and e['data']['stage'] == 'plan' and e['data']['status'] == 'running')
            row = {'input': text, 'speaker': final['characterName'], 'action': final['speechAct'],
                   'dimension': final['discussionDimension'], 'text': final['text'], 'plan': plan,
                   'evidence': final['evidence'], 'balance': balance, 'preferences': dict(session.preferences)}
            assert not speech_style_violations(final['text']), 'self-criticism or shared concession template survived'
            report['turns'].append(row)
            print(json.dumps({k: row[k] for k in ('input', 'speaker', 'action', 'dimension', 'text')}, ensure_ascii=False), flush=True)
            return row
        for _ in range(12):
            await step()
        automatic = list(report['turns'])
        counts = Counter(t['action'] for t in automatic)
        answer = await step('阿甬，你先回答我：你家停车方便吗？')
        assert answer['action'] == 'answer' and answer['speaker'] == '阿甬', 'ignored named question'
        clarify = await step('我有点忌口，先别推销，问我一个最关键的问题。')
        assert clarify['action'] == 'clarify' and any(s in clarify['text'] for s in ('？', '?', '吗', '哪', '什么')), 'did not clarify missing information'
        await step('只是不能吃辣，预算不限了，接着聊。')
        assert session.preferences.get('noSpice') is True and 'maxBudget' not in session.preferences
        scenario_counts = Counter(t['action'] for t in report['turns'])
        assert all(scenario_counts[act] for act in ('present', 'attack', 'respond', 'compare', 'answer', 'clarify')), f'missing action in full automatic/user-input scenario: {scenario_counts}'
        assert counts['attack'] >= 4, f'not enough unprompted attacks: {counts}'
        assert counts['attack'] + counts['respond'] >= 7, 'competitive exchanges no longer dominate'
        assert len({t['dimension'] for t in automatic}) >= 4, 'topic range collapsed'
        attacks = [t for t in automatic if t['action'] == 'attack']
        assert any(t['dimension'] != '价格' and any(f['kind'] == 'review' and f['restaurantId'] != t['plan']['restaurantId']
                   for f in t['evidence']) for t in attacks), 'no evidence-backed non-price attack'
        assert any(t['action'] == 'respond' and t['plan']['replyTo'] for t in automatic), 'responses do not reply to actual turns'
        for index in range(2, len(automatic)):
            assert not all(t['action'] == 'attack' for t in automatic[index-2:index+1])
            assert not all(t['dimension'] == '价格' for t in automatic[index-2:index+1])
        report['passed'] = True
        report['automaticActionCounts'] = dict(counts)
        report['scenarioActionCounts'] = dict(scenario_counts)
        report['actionMixPolicy'] = '自动交锋为主；六种行为覆盖完整自动+模拟用户场景，不要求每12轮强制轮转全部行为'
        report['automaticDimensions'] = dict(Counter(t['dimension'] for t in automatic))
        (ROOT / 'artifacts/speech-mix-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'passed': True, 'automaticActionCounts': dict(counts), 'totalTurns': len(report['turns'])}, ensure_ascii=False), flush=True)
    except Exception:
        (ROOT / 'artifacts/speech-mix-failure.json').write_text(json.dumps({'report': report, 'events': socket.events}, ensure_ascii=False, indent=2), encoding='utf-8')
        raise
    finally:
        await session.close()


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    asyncio.run(main())
