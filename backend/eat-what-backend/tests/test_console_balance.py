import unittest

from server.console_coordinator import conversation_balance


class ConversationBalanceTests(unittest.TestCase):
    def setUp(self):
        self.candidates = {'a': [{'id': 'review-a', 'reviewInsights': {'criticism': [
            {'dimension': '服务', 'snippet': '倒水不及时'}]}}], 'b': []}

    def test_unheard_turns_and_removed_restaurants_do_not_affect_balance(self):
        view = {'recentDialogue': [
            {'turnId': 'heard', 'restaurantId': 'a', 'text': '自荐', 'presentation': 'ended', 'speechAct': 'present'},
            {'turnId': 'empty', 'restaurantId': 'b', 'text': '', 'presentation': 'interrupted', 'speechAct': 'attack'},
            {'turnId': 'future', 'restaurantId': 'b', 'text': '没播放', 'presentation': 'cancelled', 'speechAct': 'attack'},
            {'turnId': 'removed', 'restaurantId': 'gone', 'text': '旧店', 'presentation': 'ended', 'speechAct': 'compare'}]}
        result = conversation_balance(self.candidates, view)
        self.assertEqual({'present': 1}, result['counts'])
        self.assertIn('attack', result['missingProactiveActs'])
        self.assertEqual('review-a', result['attackOpportunities'][0]['evidenceId'])

    def test_pending_attack_counted_once_and_invites_target_to_respond(self):
        attack = {'turnId': 'pending', 'restaurantId': 'b', 'text': '你倒水不及时。',
                  'speechAct': 'attack', 'targetRestaurantId': 'a', 'presentation': 'playing'}
        view = {'recentDialogue': [attack], 'speculative': True, 'pendingPlayback': attack}
        result = conversation_balance(self.candidates, view)
        self.assertEqual({'attack': 1}, result['counts'])
        self.assertEqual('a', result['responseOpportunity']['challengedRestaurantId'])
        self.assertEqual('pending', result['responseOpportunity']['turnId'])
        view['speculative'] = False
        self.assertFalse(conversation_balance(self.candidates, view)['counts'])
