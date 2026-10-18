import copy
import unittest

from server.realtime_console import catalog
import tests.test_console_workflow as fixtures


class RosterTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        await fixtures.WorkflowTests.asyncSetUp(self)

    async def asyncTearDown(self):
        await self.session.close()

    def updates(self):
        return [e for e in self.ws.events if e['type'] == 'restaurants.updated']

    async def test_initial_room_returns_complete_named_roster_before_any_speech(self):
        event, = self.updates()
        self.assertEqual('session.start', event['data']['reason'])
        self.assertEqual(self.ids, [r['restaurantId'] for r in event['data']['restaurants']])
        self.assertEqual(self.ids, event['data']['addedRestaurantIds'])
        self.assertEqual([], event['data']['removedRestaurantIds'])
        for row in event['data']['restaurants']:
            self.assertEqual(catalog.persona(row['restaurantId'])['characterName'], row['characterName'])
            self.assertNotIn('systemPrompt', row)
        last_persona = max(i for i,e in enumerate(self.ws.events) if e['type']=='trace' and e['data']['stage']=='persona.ready')
        self.assertGreater(self.ws.events.index(event), last_persona)
        self.assertFalse(any(e['type']=='turn' for e in self.ws.events))

    async def test_update_returns_one_authoritative_snapshot_and_preserves_context(self):
        new_id = list(catalog.shops)[2]
        self.session.preferences = {'quiet': True}
        self.session.history = [{'role': 'user', 'text': '想安静点'}]
        self.session.introduced = {self.ids[0]}
        before = copy.deepcopy(self.session.history)
        self.ws.events.clear()
        await self.session.command({'type':'restaurants.update', 'data':{'restaurantIds':[self.ids[0], new_id]}})
        event, = self.updates()
        self.assertEqual([self.ids[0], new_id], [r['restaurantId'] for r in event['data']['restaurants']])
        self.assertEqual([new_id], event['data']['addedRestaurantIds'])
        self.assertEqual([self.ids[1]], event['data']['removedRestaurantIds'])
        self.assertEqual('restaurants.update', event['data']['reason'])
        self.assertEqual(self.session.revision, event['data']['revision'])
        self.assertEqual({'quiet':True}, self.session.preferences)
        self.assertEqual(before, self.session.history)
        self.assertIn(self.ids[0], self.session.introduced)

    async def test_invalid_update_publishes_nothing_and_does_not_interrupt_room(self):
        self.ws.events.clear()
        version = self.session.epoch, self.session.revision
        with self.assertRaises(ValueError):
            await self.session.update_restaurants(['missing'])
        self.assertEqual(version, (self.session.epoch, self.session.revision))
        self.assertEqual([], self.ws.events)

    @unittest.skip("Removal by keyword moved to the page: the host Orb proposes it and the customer approves (DebateView)")

    async def test_voice_or_text_removal_returns_named_remaining_roster(self):
        self.session.kickoff = lambda **kwargs: None
        self.ws.events.clear()
        await self.session.input_text('踢走' + self.session.personas[self.ids[1]]['characterName'])
        event, = self.updates()
        self.assertEqual('user.remove', event['data']['reason'])
        self.assertEqual([self.ids[1]], event['data']['removedRestaurantIds'])
        self.assertEqual([self.ids[0]], [r['restaurantId'] for r in event['data']['restaurants']])

    async def test_reset_reissues_names(self):
        old_names = [r['characterName'] for r in self.updates()[0]['data']['restaurants']]
        self.ws.events.clear()
        await self.session.command({'type':'control', 'data':{'action':'reset'}})
        event, = self.updates()
        self.assertEqual('reset', event['data']['reason'])
        self.assertEqual(old_names, [r['characterName'] for r in event['data']['restaurants']])
