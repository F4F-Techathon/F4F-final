import unittest
import tests.test_console_workflow as fixtures

from server.console_preferences import initial_preferences, update_preferences
from server.realtime_console import catalog


class PreferenceTests(unittest.TestCase):
    def test_initial_preferences_and_later_corrections_preserve_raw_requirements(self):
        prefs = initial_preferences({'userNotes': ['人均五十以内，想安静点，不能吃辣，想吃鱼']})
        self.assertEqual(50, prefs['maxBudget'])
        self.assertTrue(prefs['quiet'])
        self.assertTrue(prefs['noSpice'])
        prefs = update_preferences(prefs, '预算不限了，吵一点没关系，可以吃辣')
        self.assertNotIn('maxBudget', prefs)
        self.assertFalse(prefs['quiet'])
        self.assertFalse(prefs['noSpice'])
        self.assertIn('想吃鱼', prefs['userNotes'][0])

    def test_bad_initial_preferences_are_rejected(self):
        for value in ([], {'userNotes': 'abc'}, {'maxBudget': -1}, {'noSpice': 'false'}):
            with self.subTest(value=value), self.assertRaises(ValueError):
                initial_preferences(value)

    def test_quiet_preference_retrieves_reviews_beyond_the_rotating_first_record(self):
        sid = next(iter(catalog.shops))
        records, _ = catalog.preference_candidates(sid, 0, set(), {'quiet': True})
        self.assertTrue(any(f['kind'] == 'review' and any(t in f['quote'] for t in ('安静', '吵', '嘈杂', '环境')) for f in records))
        self.assertLessEqual(len(records), 10)

    def test_budget_candidates_keep_original_price_sources(self):
        sid = next(iter(catalog.shops))
        records, _ = catalog.preference_candidates(sid, 8, set(), {'maxBudget': 50})
        self.assertTrue(any(f.get('sourceField') == 'avg_price' for f in records))
        self.assertTrue(all(f['id'] in {x['id'] for x in catalog.facts[sid]} for f in records))

    def test_quiet_preference_still_exposes_new_dishes_and_offers(self):
        sid = next(iter(catalog.shops))
        records, _ = catalog.preference_candidates(sid, 2, set(), {'quiet': True, 'userNotes': ['想安静约会']})
        kinds = {f['kind'] for f in records}
        self.assertIn('review', kinds)
        self.assertIn('dish', kinds)
        self.assertTrue(kinds.intersection({'package', 'coupon'}))


class PreferenceSessionTests(unittest.IsolatedAsyncioTestCase):
    async def test_preferences_reach_both_agents_after_latest_question_is_cleared(self):
        await fixtures.WorkflowTests.asyncSetUp(self)
        try:
            self.session.kickoff = lambda **kwargs: None
            await self.session.input_text('人均50以内，环境安静，想吃鱼')
            self.session.query = ''
            await self.session.prepare_turn()
            requests = self.session.llm.calls
            self.assertTrue(requests)
            for _, payload in requests:
                self.assertEqual(50, payload['SessionView']['preferences']['maxBudget'])
                self.assertTrue(payload['SessionView']['preferences']['quiet'])
                self.assertIn('想吃鱼', payload['SessionView']['preferences']['userNotes'][-1])
        finally:
            await self.session.close()
