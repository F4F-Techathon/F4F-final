import copy
import json
import unittest

from server.console_attack_memory import criticism_points, used_attack_points, repeated_attack_points, explicit_review_followup
from server.console_coordinator import parse_plan, PlanEvidenceError, conversation_balance


class AttackMemoryTests(unittest.TestCase):
    def setUp(self):
        self.review = {'id': 'review:b:1', 'restaurantId': 'b', 'kind': 'review',
                       'quote': '倒水不及时，菜太咸。包间宽敞。'}
        self.own = {'id': 'shop:a:1', 'restaurantId': 'a', 'kind': 'shop', 'quote': '现炒面馆'}
        self.candidates = {'a': [self.own], 'b': [self.review], 'c': []}
        self.turn = {'turnId': 'heard', 'restaurantId': 'a', 'text': '你倒水不及时。',
                     'evidenceIds': [self.review['id']], 'presentation': 'ended',
                     'speechAct': 'attack', 'targetRestaurantId': 'b'}
        self.view = {'restaurantIds': ['a', 'b', 'c'], 'recentDialogue': [self.turn]}

    def memory(self):
        return used_attack_points(self.candidates, self.view)

    def test_same_review_has_distinct_problems_and_only_spoken_problem_is_spent(self):
        self.assertEqual({'服务迟缓', '太咸'}, {p['issue'] for p in criticism_points(self.review)})
        self.assertEqual(['服务迟缓'], [p['issue'] for p in self.memory()])
        opportunities = conversation_balance(self.candidates, self.view)['attackOpportunities']
        self.assertEqual(['太咸'], [p['issue'] for p in opportunities])

    def test_changed_speaker_or_action_does_not_reset_attack_memory(self):
        self.view['usedAttackPoints'] = self.memory()
        for actor in ('a', 'c'):
            repeated = repeated_attack_points('你加水不及时，服务还吹得响。', [self.review['id']],
                                             [self.review], actor, self.view)
            self.assertEqual(['服务迟缓'], [p['issue'] for p in repeated])
        self.turn['speechAct'] = 'present'
        self.assertEqual(1, len(self.memory()))

    def test_different_problem_and_positive_content_remain_available(self):
        self.view['usedAttackPoints'] = self.memory()
        for text in ('你菜太咸。', '你包间宽敞。'):
            self.assertFalse(repeated_attack_points(text, [self.review['id']], [self.review], 'c', self.view))

    def test_own_defense_is_not_a_new_attack(self):
        self.view['usedAttackPoints'] = self.memory()
        self.assertFalse(repeated_attack_points('倒水不及时？这话我接着。', [self.review['id']], [self.review], 'b', self.view))
        self.turn['restaurantId'] = 'b'
        self.assertFalse(self.memory())

    def test_unheard_or_cancelled_text_is_not_committed(self):
        for patch in ({'text': ''}, {'presentation': 'cancelled'}, {'text': '你，', 'presentation': 'interrupted'}):
            view = {**self.view, 'recentDialogue': [{**self.turn, **patch}]}
            self.assertFalse(used_attack_points(self.candidates, view))
        self.turn.update(text='你倒水不及时。', presentation='interrupted')
        self.assertEqual(1, len(self.memory()))

    def test_pending_is_provisional_once_and_disappears_after_interruption(self):
        self.turn['presentation'] = 'playing'
        self.view.update(speculative=True, pendingPlayback=copy.deepcopy(self.turn))
        self.assertEqual(1, len(self.memory()))
        self.view.pop('pendingPlayback')
        self.view['speculative'] = False
        self.assertFalse(self.memory())

    def test_different_review_can_provide_new_evidence(self):
        second = {**self.review, 'id': 'review:b:2'}
        self.view['usedAttackPoints'] = self.memory()
        self.assertFalse(repeated_attack_points('你倒水不及时。', [second['id']], [second], 'c', self.view))

    def test_negated_complaint_is_not_an_attack(self):
        fact = {**self.review, 'quote': '炸鸡不油腻，没有腥味，没有发霉。'}
        self.assertFalse(criticism_points(fact))

    def test_answer_label_does_not_bypass_memory_without_an_explicit_followup(self):
        self.assertFalse(explicit_review_followup({'userQuestion': '我喜欢炸鸡'}, {'speechAct': 'answer'}))
        self.assertTrue(explicit_review_followup({'userQuestion': '刚才那条差评具体说了什么'}, {'speechAct': 'answer'}))

    def test_fully_used_review_replans_but_other_problem_is_allowed(self):
        raw = {'action': 'speak', 'restaurantId': 'a', 'speechAct': 'attack', 'targetRestaurantId': 'b',
               'replyTo': [], 'evidenceIds': [self.own['id'], self.review['id']], 'topic': '服务', 'summary': '继续交锋'}
        self.assertEqual('attack', parse_plan(json.dumps(raw), self.candidates, self.view)['speechAct'])
        self.turn['text'] += '菜还太咸。'
        with self.assertRaises(PlanEvidenceError) as caught:
            parse_plan(json.dumps(raw), self.candidates, self.view)
        self.assertEqual('REPEATED_ATTACK', caught.exception.validation['code'])


class RepeatedSpeechRecoveryTests(unittest.IsolatedAsyncioTestCase):
    async def test_repeated_attack_that_survives_repair_continues_without_broadcasting_it(self):
        from server.realtime_console import ConsoleSession, catalog
        from tests.test_console_workflow import Socket, proposal
        socket = Socket()
        session = ConsoleSession(socket)
        socket.session, session.audio_on = session, False
        a, b, c = list(catalog.shops)[:3]
        review = next(f for f in catalog.facts[b] if any(p['issue'] == '口味差' for p in criticism_points(f)))
        own = catalog.select(a, 0, set())
        try:
            await session.start([a, b, c])
            session.introduced.add(a)
            session.history.append({'turnId': 'old', 'restaurantId': c, 'text': '你那味道一般般。',
                                    'evidenceIds': [review['id']], 'presentation': 'ended', 'speechAct': 'attack', 'targetRestaurantId': b})
            async def plan():
                result = proposal(a, own)
                result.update(speechAct='attack', targetRestaurantId=b, evidenceIds=[own[0]['id'], review['id']])
                return result, [own[0], review]
            session.plan_turn = plan
            class Model:
                async def stream_text(self, system, user):
                    data = json.loads(user)
                    repeated = data['TurnPlan']['speechAct'] == 'attack'
                    yield json.dumps({'text': '你那味道一般般。' if repeated else own[0]['quote'],
                                      'evidenceIds': [review['id']] if repeated else [own[0]['id']]}, ensure_ascii=False)
            session.llm = Model()
            session.kickoff(once=True)
            await session.task
            self.assertFalse(any(e['type'] == 'error' for e in socket.events))
            final = next(e['data'] for e in socket.events if e['type'] == 'text')
            self.assertEqual(own[0]['quote'], final['text'])
            self.assertNotIn('一般般', final['text'])
            self.assertTrue(any(e['type'] == 'trace' and e['data']['stage'] == 'coordinator.repeated_attack_avoided' for e in socket.events))
        finally:
            await session.close()
