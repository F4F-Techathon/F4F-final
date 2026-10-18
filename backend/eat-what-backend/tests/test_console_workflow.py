import asyncio
import copy
import json
import struct
import unittest

from server.console_coordinator import parse_plan, restaurant_directive, candidate_evidence_refs, PlanEvidenceError, continuation_plan
from server.realtime_console import ConsoleSession, catalog


def proposal(sid, facts):
    return {"action": "speak", "restaurantId": sid, "evidenceIds": [facts[0]["id"]],
            "topic": "用餐取舍", "speechAct": "present", "targetRestaurantId": None,
            "replyTo": [], "summary": "让尚未发言的餐厅先介绍。"}


def introduction_prefix(sid):
    persona = catalog.persona(sid)
    return f"别急，{persona['displayRestaurantName']}的{persona['characterName']}在，"


def generated_text(payload, text):
    plan = payload.get('TurnPlan', {})
    return (introduction_prefix(plan['restaurantId']) if plan.get('introduce') else '') + text


class Socket:
    def __init__(self):
        self.events = []
        self.binary = []
        self.order = []
        self.session = None

    async def send_json(self, event):
        self.events.append(copy.deepcopy(event))
        self.order.append(("json", copy.deepcopy(event)))
        if event["type"] == "turn" and event["data"]["phase"] == "generated":
            self.session.ack.set_result(True)

    async def send_bytes(self, data):
        self.binary.append(data)
        self.order.append(("pcm", data))


class Model:
    def __init__(self):
        self.calls = []

    async def stream_text(self, system, user):
        payload = json.loads(user)
        self.calls.append((system, payload))
        if "availableAgents" in payload:
            agent = payload["availableAgents"][-1]  # Deliberately differs from round robin.
            result = proposal(agent["restaurant"]["id"], agent["evidence"])
        else:
            quote = payload['evidence'][0]['quote']
            result = {"text": generated_text(payload, quote if len(quote) <= 20 else '这点我可得接一句。'), "evidenceIds": [payload["evidence"][0]["id"]]}
        raw = json.dumps(result, ensure_ascii=False)
        for i in range(0, len(raw), 13):
            yield raw[i:i+13]
            await asyncio.sleep(0)


class PlanValidation(unittest.TestCase):
    def setUp(self):
        self.ids = list(catalog.shops)[:2]
        self.candidates = {sid: catalog.select(sid, 0, set()) for sid in self.ids}
        self.view = {"restaurantIds": self.ids, "recentDialogue": [{"turnId": "old", "presentation": "cancelled"}]}
        self.plan = proposal(self.ids[0], self.candidates[self.ids[0]])

    def test_foreign_facts_removed_speakers_and_unheard_replies_rejected(self):
        for patch in ({"restaurantId": "removed"}, {"restaurantId": []},
                      {"evidenceIds": [self.candidates[self.ids[1]][0]["id"]]},
                      {"replyTo": ["old"]}, {"targetRestaurantId": self.ids[0]},
                      {"action": "wait"}):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                parse_plan(json.dumps({**self.plan, **patch}), self.candidates, self.view)

    def test_only_played_turns_can_be_reply_targets(self):
        self.view["recentDialogue"][0]["presentation"] = "ended"
        result = parse_plan(json.dumps({**self.plan, "replyTo": ["old"]}), self.candidates, self.view)
        self.assertEqual(["old"], result["replyTo"])

    def test_short_choices_resolve_exactly_to_original_cross_store_records(self):
        choices = candidate_evidence_refs(self.candidates)
        ids = [self.candidates[sid][0]['id'] for sid in self.ids]
        raw = {k: v for k, v in self.plan.items() if k != 'evidenceIds'}
        raw.update(speechAct='compare', targetRestaurantId=self.ids[1],
                   evidenceRefs=[ref for ref, fid in choices.items() if fid in ids])
        result = parse_plan(json.dumps(raw), self.candidates, self.view)
        self.assertEqual(set(ids), set(result['evidenceIds']))
        self.assertNotIn('evidenceRefs', result)

    def test_bad_prefix_is_ignored_without_replacing_it_with_a_guessed_source(self):
        sid = self.ids[1]
        offer = next(f for f in catalog.facts[sid] if f['id'].startswith('offer:'))
        valid = catalog.facts[sid][0]
        candidates = {sid: [offer, valid]}
        wrong = 'review:' + offer['id'].split(':', 1)[1]
        raw = {**self.plan, 'restaurantId': sid, 'evidenceIds': [valid['id'], wrong]}
        result = parse_plan(json.dumps(raw), candidates, self.view)
        self.assertEqual([valid['id']], result['evidenceIds'])
        self.assertEqual(wrong, result['ignoredEvidence'][0]['value'])
        raw['evidenceIds'] = [wrong]
        with self.assertRaises(PlanEvidenceError) as caught:
            parse_plan(json.dumps(raw), candidates, self.view)
        self.assertEqual('NO_USABLE_EVIDENCE', caught.exception.validation['code'])

    def test_unknown_or_malformed_entries_are_dropped_and_valid_fields_combined(self):
        raw = {**self.plan, 'evidenceRefs': ['E001', 'E999', {'id': 'E001'}]}
        result = parse_plan(json.dumps(raw), self.candidates, self.view)
        self.assertEqual(self.plan['evidenceIds'], result['evidenceIds'])
        self.assertEqual(2, len(result['ignoredEvidence']))
        raw['evidenceRefs'] = {'bad': 'shape'}
        result = parse_plan(json.dumps(raw), self.candidates, self.view)
        self.assertEqual(self.plan['evidenceIds'], result['evidenceIds'])

    def test_more_than_four_valid_sources_are_preserved_and_duplicates_removed(self):
        sid = self.ids[0]
        candidates = {sid: catalog.facts[sid][:5]}
        refs = list(candidate_evidence_refs(candidates))
        raw = {k: v for k, v in self.plan.items() if k != 'evidenceIds'}
        raw['evidenceRefs'] = refs + [refs[0]]
        result = parse_plan(json.dumps(raw), candidates, self.view)
        self.assertEqual([f['id'] for f in candidates[sid]], result['evidenceIds'])

    def test_recovery_never_chooses_removed_restaurants_or_unprovided_facts(self):
        view = {**self.view, 'restaurantIds': self.ids[:1]}
        raw = json.dumps({**self.plan, 'restaurantId': self.ids[1]})
        result = continuation_plan(self.candidates, view, raw)
        self.assertEqual(self.ids[0], result['restaurantId'])
        self.assertTrue(set(result['evidenceIds']) <= {f['id'] for f in self.candidates[self.ids[0]]})
        self.assertEqual('wait', continuation_plan({}, view)['action'])
        only_one_readable = {self.ids[0]: self.candidates[self.ids[0]]}
        with self.assertRaises(PlanEvidenceError):
            parse_plan(raw, only_one_readable, self.view)
        self.assertEqual(self.ids[0], continuation_plan(only_one_readable, self.view, raw)['restaurantId'])

    def test_attacks_cannot_assign_only_the_speakers_own_evidence(self):
        raw = {**self.plan, 'speechAct': 'attack', 'targetRestaurantId': self.ids[1]}
        with self.assertRaises(PlanEvidenceError):
            parse_plan(json.dumps(raw), self.candidates, self.view)
        raw['evidenceIds'].append(self.candidates[self.ids[1]][0]['id'])
        self.assertEqual('attack', parse_plan(json.dumps(raw), self.candidates, self.view)['speechAct'])

    def test_review_theme_aliases_use_existing_discussion_dimensions(self):
        for alias, canonical in (('菜品选择', '菜品'), ('性价比', '价格'), ('体验', '综合')):
            result = parse_plan(json.dumps({**self.plan, 'discussionDimension': alias}), self.candidates, self.view)
            self.assertEqual(canonical, result['discussionDimension'])

    def test_missing_debug_summary_does_not_require_a_speech_goal(self):
        self.plan.pop("summary")
        result = parse_plan(json.dumps(self.plan), self.candidates, self.view)
        self.assertTrue(result["summary"])
        self.assertNotIn("goal", result)

    def test_comparison_can_cite_both_participating_restaurants(self):
        ids = [self.candidates[sid][0]["id"] for sid in self.ids]
        result = parse_plan(json.dumps({**self.plan, "evidenceIds": ids,
                                        "targetRestaurantId": self.ids[1]}), self.candidates, self.view)
        self.assertEqual(ids, result["evidenceIds"])

    def test_repetitive_pitches_are_replanned_but_real_attacks_and_new_questions_can_continue(self):
        self.view['recentDialogue'] = [{'turnId': str(i), 'restaurantId': self.ids[i], 'text': '环境安静。',
                                       'discussionDimension': '环境', 'presentation': 'ended'} for i in range(2)]
        raw = {**self.plan, 'discussionDimension': '环境'}
        with self.assertRaises(ValueError):
            parse_plan(json.dumps(raw), self.candidates, self.view)
        self.assertEqual('present', parse_plan(json.dumps(raw), self.candidates, self.view, '那你家安静吗')['speechAct'])
        attack = {**raw, 'speechAct': 'attack', 'targetRestaurantId': self.ids[1],
                  'evidenceIds': [self.candidates[sid][0]['id'] for sid in self.ids]}
        self.assertEqual('attack', parse_plan(json.dumps(attack), self.candidates, self.view)['speechAct'])

    def test_legacy_speech_guidance_is_discarded_not_forwarded(self):
        raw = {**self.plan, 'goal': '必须先说坐得舒服是加分，再贬低对方',
               'suggestedText': '固定台词', 'summary': '内部选择理由', 'topic': '调试标签'}
        result = parse_plan(json.dumps(raw), self.candidates, self.view)
        self.assertNotIn('goal', result)
        directive = restaurant_directive({**result, 'goal': '也不得泄漏', 'suggestedText': '台词'})
        self.assertFalse({'goal', 'suggestedText', 'summary', 'topic', 'preferenceFocus'} & directive.keys())
        self.assertEqual(result['evidenceIds'], directive['evidenceIds'])
        self.assertEqual(result['speechAct'], directive['speechAct'])

    def test_third_attack_changes_rhythm_unless_user_explicitly_asks(self):
        self.view['recentDialogue'] = [{'turnId': str(i), 'restaurantId': self.ids[i], 'text': '服务接不上。',
                                       'speechAct': 'attack', 'discussionDimension': '服务', 'presentation': 'ended'} for i in range(2)]
        raw = {**self.plan, 'speechAct': 'attack', 'discussionDimension': '菜品', 'targetRestaurantId': self.ids[1],
               'evidenceIds': [self.candidates[sid][0]['id'] for sid in self.ids]}
        with self.assertRaisesRegex(ValueError, '连续攻击'):
            parse_plan(json.dumps(raw), self.candidates, self.view)
        self.assertEqual('attack', parse_plan(json.dumps(raw), self.candidates, self.view, '还有什么槽点')['speechAct'])
        self.assertEqual('compare', parse_plan(json.dumps({**raw, 'speechAct': 'compare'}), self.candidates, self.view)['speechAct'])

    def test_response_requires_a_real_unanswered_challenge_to_that_restaurant(self):
        self.view['recentDialogue'] = [{'turnId': 'attack', 'restaurantId': self.ids[1], 'targetRestaurantId': self.ids[0],
                                       'text': '你倒水不及时。', 'speechAct': 'attack', 'presentation': 'ended'}]
        raw = {**self.plan, 'speechAct': 'respond', 'targetRestaurantId': self.ids[1], 'replyTo': ['attack']}
        self.assertEqual('respond', parse_plan(json.dumps(raw), self.candidates, self.view)['speechAct'])
        self.view['recentDialogue'].insert(0, {'turnId': 'older', 'restaurantId': self.ids[0], 'text': '菜新鲜。', 'discussionDimension': '食材', 'presentation': 'ended'})
        self.view['recentDialogue'][1]['discussionDimension'] = '食材'
        raw['discussionDimension'] = '食材'
        self.assertEqual('respond', parse_plan(json.dumps(raw), self.candidates, self.view)['speechAct'])
        self.view['recentDialogue'][1]['speechAct'] = 'compare'
        self.assertEqual('respond', parse_plan(json.dumps(raw), self.candidates, self.view)['speechAct'])
        self.view['recentDialogue'][1]['targetRestaurantId'] = self.ids[1]
        with self.assertRaisesRegex(ValueError, 'respond须'):
            parse_plan(json.dumps(raw), self.candidates, self.view)
        self.view['recentDialogue'][1]['targetRestaurantId'] = self.ids[0]
        self.view['recentDialogue'].append({'turnId': 'replied', 'restaurantId': self.ids[0], 'text': '接过招了。',
                                            'speechAct': 'respond', 'replyTo': ['attack'], 'presentation': 'ended'})
        with self.assertRaisesRegex(ValueError, 'respond须'):
            parse_plan(json.dumps(raw), self.candidates, self.view)

    def test_prefetch_counts_pending_price_turn_once(self):
        self.view['recentDialogue'] = [{'turnId': 'heard', 'restaurantId': self.ids[0], 'text': '价格有差别。',
                                       'discussionDimension': '价格', 'presentation': 'ended'}]
        raw = {**self.plan, 'speechAct': 'compare', 'discussionDimension': '价格', 'targetRestaurantId': self.ids[1],
               'evidenceIds': [self.candidates[sid][0]['id'] for sid in self.ids]}
        self.assertEqual('价格', parse_plan(json.dumps(raw), self.candidates, self.view)['discussionDimension'])
        self.view.update(speculative=True, pendingPlayback={'turnId': 'playing', 'restaurantId': self.ids[1],
                                                           'discussionDimension': '价格', 'speechAct': 'compare'})
        with self.assertRaisesRegex(ValueError, '连续比价'):
            parse_plan(json.dumps(raw), self.candidates, self.view)
        self.assertEqual('价格', parse_plan(json.dumps(raw), self.candidates, self.view, '具体多少钱')['discussionDimension'])

    def test_unknown_out_of_window_and_removed_restaurant_evidence_are_rejected(self):
        own = self.plan["evidenceIds"][0]
        unseen = next(f["id"] for f in catalog.facts[self.ids[0]] if f["kind"] == "dish")
        for fid in ("made-up", unseen):
            with self.subTest(fid=fid):
                result = parse_plan(json.dumps({**self.plan, "evidenceIds": [own, fid]}), self.candidates, self.view)
                self.assertEqual([own], result['evidenceIds'])
                self.assertEqual(fid, result['ignoredEvidence'][0]['value'])
        self.view["restaurantIds"] = self.ids[:1]
        result = parse_plan(json.dumps({**self.plan, "evidenceIds": [own, self.candidates[self.ids[1]][0]["id"]]}), self.candidates, self.view)
        self.assertEqual([own], result['evidenceIds'])



class WorkflowTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.ws = Socket()
        self.session = ConsoleSession(self.ws)
        self.ws.session = self.session
        self.session.llm = Model()
        self.session.audio_on = False
        self.ids = list(catalog.shops)[:2]
        await self.session.start(self.ids)

    async def asyncTearDown(self):
        await self.session.close()

    async def test_llm_selects_speaker_and_exposes_both_prompt_streams(self):
        self.session.running = True
        self.assertTrue(await self.session.turn())
        model = self.session.llm
        self.assertEqual(2, len(model.calls))
        turns = [e["data"] for e in self.ws.events if e["type"] == "turn"]
        self.assertEqual(self.ids[-1], turns[0]["restaurantId"])
        flows = [e["data"] for e in self.ws.events if e["type"] == "workflow"]
        for actor in ("coordinator", self.ids[-1]):
            start = next(e for e in flows if e["actor"] == actor and e["status"] == "running")
            deltas = [e["delta"] for e in flows if e["runId"] == start["runId"] and "delta" in e]
            end = next(e for e in flows if e["runId"] == start["runId"] and e["status"] == "completed")
            self.assertEqual(end["output"], "".join(deltas))
            self.assertIn("systemPrompt", start)
            self.assertIn("SessionView", start["input"])
        self.assertFalse(self.session.work)

    async def test_restaurant_sees_complete_heard_history_preferences_and_minimal_directive(self):
        sid = self.ids[0]
        self.session.preferences = {'quiet': True, 'userNotes': ['想聊得舒服']}
        self.session.query = '现在聊服务'
        self.session.history = [{'role': 'user', 'text': f'用户之前说的第{i}句'} for i in range(15)]
        facts = catalog.select(sid, 0, set())
        chosen = {**proposal(sid, facts), 'goal': '别按这句写', 'summary': '仅供调试', 'suggestedText': '不要传入'}
        async def plan():
            return chosen, facts
        self.session.plan_turn = plan
        await self.session.prepare_turn()
        payload = self.session.llm.calls[-1][1]
        self.assertEqual(15, len(payload['SessionView']['recentDialogue']))
        self.assertEqual('用户之前说的第0句', payload['SessionView']['recentDialogue'][0]['text'])
        self.assertEqual(self.session.preferences, payload['SessionView']['preferences'])
        self.assertEqual('现在聊服务', payload['userQuestion'])
        self.assertFalse({'goal', 'summary', 'suggestedText', 'topic'} & payload['TurnPlan'].keys())

    async def test_interrupt_during_planning_cancels_request_before_speech(self):
        entered = asyncio.Event()
        stopped = asyncio.Event()

        class SlowModel:
            async def stream_text(self, system, user):
                try:
                    entered.set()
                    yield '{"action":'
                    await asyncio.Future()
                finally:
                    stopped.set()

        self.session.llm = SlowModel()
        self.session.kickoff(once=True)
        await asyncio.wait_for(entered.wait(), 1)
        await self.session.interrupt("test")
        self.assertTrue(stopped.is_set())
        self.assertFalse(self.session.work)
        self.assertFalse(self.ws.binary)
        self.assertFalse(any(e["type"] == "turn" and e["data"]["phase"] == "start" for e in self.ws.events))
        self.assertTrue(any(e["type"] == "workflow" and e["data"]["status"] == "cancelled" for e in self.ws.events))

    async def test_restaurant_receives_only_coordinator_selected_evidence(self):
        sid, target = self.ids
        facts = catalog.select(sid, 0, set())
        chosen = {**proposal(sid, facts), "targetRestaurantId": target}
        async def plan():
            return chosen, facts
        self.session.plan_turn = plan
        self.assertTrue(await self.session.turn())
        context = self.session.llm.calls[0][1]["evidence"]
        source_ids = {f["id"] for f in context}
        self.assertEqual(set(chosen['evidenceIds']), source_ids)
        self.assertNotIn(f"shop:{target}:avg_price", source_ids)
        self.assertNotIn(f"shop:{sid}:business_time", source_ids)

    async def test_bad_model_plan_stops_without_silent_rule_scheduling(self):
        calls = []
        class BadModel:
            async def stream_text(self, system, user):
                calls.append(user)
                yield '{"action":"speak","restaurantId":"removed"}'

        self.session.llm = BadModel()
        self.session.kickoff(once=True)
        await self.session.task
        self.assertFalse(self.session.running)
        self.assertTrue(any(e["type"] == "error" for e in self.ws.events))
        self.assertFalse(any(e["type"] == "turn" for e in self.ws.events))
        self.assertEqual(2, len(calls))

    async def test_interrupt_cancels_planning_repair_before_any_speech(self):
        entered, stopped = asyncio.Event(), asyncio.Event()
        class RepairModel:
            async def stream_text(self, system, user):
                if "validation" not in json.loads(user):
                    yield '{"action":"speak","restaurantId":"removed"}'
                    return
                try:
                    entered.set()
                    yield '{"action":'
                    await asyncio.Future()
                finally:
                    stopped.set()
        self.session.llm = RepairModel()
        self.session.kickoff(once=True)
        await asyncio.wait_for(entered.wait(), 1)
        await self.session.interrupt("test")
        self.assertTrue(stopped.is_set())
        self.assertFalse(self.ws.binary)
        self.assertFalse(self.session.history)
        self.assertFalse(any(e["type"] == "turn" and e["data"]["phase"] == "start" for e in self.ws.events))

    async def test_invalid_plan_is_repaired_once_against_same_context(self):
        calls = []
        class RepairModel:
            async def stream_text(self, system, user):
                payload = json.loads(user)
                calls.append(payload)
                agent = payload["availableAgents"][0]
                result = proposal(agent["restaurant"]["id"], agent["evidence"])
                if "validation" not in payload:
                    result["evidenceIds"] = ["unknown-id"]
                else:
                    result.pop('evidenceIds')
                    result['evidenceRefs'] = [agent['evidence'][0]['selectionRef']]
                yield json.dumps(result)
        self.session.llm = RepairModel()
        plan, facts = await self.session.plan_turn()
        self.assertEqual(2, len(calls))
        self.assertEqual(calls[0]["SessionView"], calls[1]["SessionView"])
        self.assertIn("unknown-id", calls[1]["validation"]["previousOutput"])
        self.assertEqual('NO_USABLE_EVIDENCE', calls[1]['validation']['code'])
        self.assertIn(calls[1]['availableAgents'][0]['evidence'][0]['selectionRef'], calls[1]['validation']['evidenceChoices'])
        self.assertEqual(plan["evidenceIds"], [f["id"] for f in facts])
        self.assertFalse(self.session.history)
        self.assertFalse(self.ws.binary)

    async def test_all_missing_evidence_replans_once_then_continues_with_known_data(self):
        calls = []
        class MissingEvidenceModel:
            async def stream_text(self, system, user):
                payload = json.loads(user)
                calls.append(payload)
                agent = payload['availableAgents'][0]
                result = proposal(agent['restaurant']['id'], agent['evidence'])
                result['evidenceIds'] = ['missing-every-time']
                yield json.dumps(result)
        self.session.llm = MissingEvidenceModel()
        plan, facts = await self.session.plan_turn()
        self.assertEqual(2, len(calls))
        self.assertEqual('available_evidence', plan['recovery'])
        self.assertEqual(set(plan['evidenceIds']), {f['id'] for f in facts})
        self.assertFalse(any(e['type'] == 'error' for e in self.ws.events))
        self.assertTrue(any(e['type'] == 'trace' and e['data']['stage'] == 'coordinator.evidence_recovered' for e in self.ws.events))

    async def test_planner_receives_heard_evidence_and_forwards_cross_store_sources(self):
        sid, target = reversed(self.ids)
        dish = next(f for f in catalog.facts[target] if f["kind"] == "dish")
        self.session.history.append({"turnId": "heard", "restaurantId": target, "text": dish["quote"],
                                     "evidenceIds": [dish["id"]], "presentation": "ended"})
        calls = []
        class ComparisonModel:
            async def stream_text(self, system, user):
                payload = json.loads(user)
                calls.append(payload)
                agent = next(a for a in payload["availableAgents"] if a["restaurant"]["id"] == sid)
                result = proposal(agent["restaurant"]["id"], agent["evidence"])
                result.update(targetRestaurantId=target, replyTo=["heard"])
                result["evidenceIds"].append(dish["id"])
                yield json.dumps(result)
        self.session.llm = ComparisonModel()
        plan, facts = await self.session.plan_turn()
        self.assertEqual([sid, target], [f["restaurantId"] for f in facts])
        shown = {f["id"] for a in calls[0]["availableAgents"] for f in a["evidence"]}
        self.assertIn(dish["id"], shown)
        self.assertIn(f"shop:{target}:avg_price", shown)
        self.assertEqual(plan["evidenceIds"], [f["id"] for f in facts])

    async def test_unassigned_historical_dish_is_not_added_to_restaurant_evidence(self):
        previous_sid, sid = self.ids
        dish = next(f for f in catalog.facts[previous_sid] if f["kind"] == "dish")
        self.session.history.append({"turnId": "played", "restaurantId": previous_sid, "text": dish["quote"],
                                     "evidenceIds": [dish["id"]], "presentation": "ended"})
        facts = catalog.select(sid, 0, set())
        async def plan():
            return proposal(sid, facts), facts
        self.session.plan_turn = plan
        await self.session.turn()
        self.assertNotIn(dish["id"], {f["id"] for f in self.session.llm.calls[0][1]["evidence"]})

    async def test_next_generation_starts_before_ack_but_next_turn_waits(self):
        generated = asyncio.Event()
        original_send = self.ws.send_json
        async def send_without_ack(event):
            if event["type"] == "turn" and event["data"]["phase"] == "generated":
                self.ws.events.append(copy.deepcopy(event))
                generated.set()
            else:
                await original_send(event)
        self.ws.send_json = send_without_ack
        self.session.kickoff()
        await asyncio.wait_for(generated.wait(), 1)
        async def prepared_next():
            while not self.session.prefetch_task or not self.session.prefetch_task.done():
                await asyncio.sleep(0)
        await asyncio.wait_for(prepared_next(), 1)
        self.assertEqual(4, len(self.session.llm.calls))
        self.assertEqual(1, len([e for e in self.ws.events if e["type"] == "turn" and e["data"]["phase"] == "start"]))
        self.assertTrue(self.session.llm.calls[2][1]["SessionView"]["speculative"])
        self.assertEqual("", self.session.llm.calls[2][1]["SessionView"]["recentDialogue"][-1]["text"])
        self.assertTrue(self.session.llm.calls[2][1]["SessionView"]["pendingPlayback"]["text"])
        self.assertFalse(self.session.task.done())
        self.assertTrue(any(w["actor"] == "playback" for w in self.session.work.values()))
        await self.session.command({"type": "playback", "data": {"turnId": self.session.current["turnId"], "epoch": self.session.epoch, "status": "ended"}})
        async def next_request():
            while len([e for e in self.ws.events if e["type"] == "turn" and e["data"]["phase"] == "start"]) < 2:
                await asyncio.sleep(.01)
        await asyncio.wait_for(next_request(), 1)
        self.assertTrue(any(e["type"] == "workflow" and e["data"]["stage"] == "prefetch" and e["data"]["status"] == "completed" for e in self.ws.events))
        await self.session.interrupt("test_finished")

    async def test_invalid_segment_is_repaired_once_and_rechecked(self):
        sid = self.ids[0]
        facts = catalog.select(sid, 0, set())
        async def plan():
            return proposal(sid, facts), facts
        self.session.plan_turn = plan
        class RepairModel:
            async def stream_text(self, system, user):
                payload = json.loads(user)
                if "proposal" in payload:
                    yield json.dumps({"text": generated_text(payload, facts[0]["quote"]), "evidenceIds": [facts[0]["id"]]}, ensure_ascii=False)
                else:
                    yield json.dumps({"text": "虚构价格999999元", "evidenceIds": [facts[0]["id"]]}, ensure_ascii=False)
        self.session.llm = RepairModel()
        self.assertTrue(await self.session.turn())
        checks = [e["data"] for e in self.ws.events if e["type"] == "trace" and e["data"]["stage"] == "evidence.check"]
        self.assertEqual([False, True], [c["passed"] for c in checks])
        self.assertEqual(1, len([e for e in self.ws.events if e["type"] == "workflow" and e["data"]["stage"] == "repair" and e["data"]["status"] == "running"]))

    async def test_uncited_historical_price_gets_explicit_removal_instruction(self):
        sid = self.ids[1]
        facts = [f for f in catalog.facts[sid] if f['id'] in {
            f'offer:{sid}:1642769939', f'dish:{sid}:867939397'}]
        self.session.introduced.add(sid)
        self.session.history.append({'turnId': 'previous', 'restaurantId': self.ids[0],
                                     'text': '我128特价自助。', 'evidenceIds': [], 'presentation': 'ended'})
        async def plan():
            return {**proposal(sid, facts), 'evidenceIds': [f['id'] for f in facts]}, facts
        self.session.plan_turn = plan
        requests = []
        class RepairModel:
            async def stream_text(self, system, user):
                payload = json.loads(user)
                requests.append(payload)
                text = '阿乐那128自助得凑一顿，我下午茶双拼10.9元，薯条14元。'
                if 'requiredEdits' in payload:
                    text = '自助得凑一顿，我下午茶双拼10.9元，解个馋就走。'
                yield json.dumps({'text': text, 'evidenceIds': [f['id'] for f in facts]}, ensure_ascii=False)
        self.session.llm = RepairModel()
        with self.assertLogs('server.realtime_console', level='WARNING'):
            self.assertTrue(await self.session.turn())
        self.assertIn('数字128', ''.join(requests[1]['requiredEdits']))
        self.assertIn('必须删除', ''.join(requests[1]['requiredEdits']))
        self.assertEqual([f['id'] for f in facts], [f['id'] for f in requests[1]['evidence']])
        final = next(e['data'] for e in self.ws.events if e['type'] == 'text')
        self.assertNotIn('128', final['text'])

    async def test_failed_repair_exposes_exact_validation_and_sends_no_speech(self):
        sid = self.ids[0]
        facts = catalog.select(sid, 0, set())
        async def plan():
            return proposal(sid, facts), facts
        class BadSpeaker:
            async def stream_text(self, system, user):
                yield json.dumps({'text': '虚构报价999999元', 'evidenceIds': [facts[0]['id']]})
        self.session.plan_turn, self.session.llm = plan, BadSpeaker()
        with self.assertLogs('server.realtime_console', level='WARNING'):
            self.session.kickoff(once=True)
            await self.session.task
        error = next(e['data'] for e in self.ws.events if e['type'] == 'error')
        self.assertIn('999999', error['message'])
        self.assertEqual(['999999'], error['validation']['invalidNumbers'])
        self.assertFalse(any(e['type'] in ('text', 'speech.ready', 'audio') for e in self.ws.events))

    async def test_generation_keeps_receiving_while_consumer_is_busy(self):
        received = asyncio.Event()
        sid = self.ids[0]
        facts = catalog.select(sid, 0, set())

        class TwoClauses:
            async def stream_text(self, system, user):
                yield json.dumps({"text": "第一句", "evidenceIds": [facts[0]["id"]]}, ensure_ascii=False) + "\n"
                await asyncio.sleep(0)
                yield json.dumps({"text": "第二句", "evidenceIds": [facts[0]["id"]]}, ensure_ascii=False)
                received.set()

        self.session.llm = TwoClauses()
        stream = self.session.buffered_segments(sid, facts, self.session.view(), {})
        await anext(stream)
        await asyncio.wait_for(received.wait(), 1)
        await stream.aclose()
        self.assertTrue(self.session.generation_task.done())

    async def test_only_one_final_text_packet_and_exact_audio_segment_binding(self):
        sid = self.ids[0]
        facts = catalog.select(sid, 0, set()) + catalog.select(self.ids[1], 0, set())
        async def plan():
            return {**proposal(sid, facts), 'evidenceIds': [f['id'] for f in facts], 'speechAct': 'attack', "targetRestaurantId": self.ids[1], "replyTo": ["played-turn"]}, facts
        self.session.plan_turn = plan
        class Clauses:
            async def stream_text(self, system, user):
                payload = json.loads(user)
                for lead in ("资料注明", "再补充"):
                    yield json.dumps({"text": generated_text(payload, lead + facts[0]["quote"]), "evidenceIds": [f['id'] for f in facts]}, ensure_ascii=False) + "\n"
        class Speech:
            name = "test-pcm"
            async def stream(self, text, voice):
                yield bytes(960), 24000
                yield bytes(960), 24000
        self.session.llm = Clauses()
        self.session.tts = Speech()
        self.session.audio_on = True
        self.assertTrue(await self.session.turn())
        texts = [e for e in self.ws.events if e["type"] == "text"]
        self.assertEqual(1, len(texts))
        result = texts[0]["data"]
        self.assertEqual("done", result["phase"])
        self.assertEqual(sid, result["speakerId"])
        self.assertEqual([self.ids[1]], result["targetIds"])
        self.assertEqual(["played-turn"], result["replyTo"])
        self.assertEqual('attack', result['speechAct'])
        self.assertEqual(result['speechAct'], next(e['data']['speechAct'] for e in self.ws.events if e['type'] == 'speech.ready'))
        self.assertEqual(result["text"], "".join(s["text"] for s in result["segments"]))
        self.assertEqual(1, len(result["segments"]))
        self.assertTrue(result["segments"][0]["isIntroduction"])
        headers = []
        for raw in self.ws.binary:
            n = struct.unpack("<I", raw[:4])[0]
            headers.append(json.loads(raw[4:4+n]))
        for segment in result["segments"]:
            frames = [h for h in headers if h["segmentId"] == segment["segmentId"]]
            self.assertEqual(segment["audio"]["sampleStart"], frames[0]["sampleOffset"])
            self.assertEqual(segment["audio"]["sampleEnd"], frames[-1]["sampleOffset"] + 480)
            self.assertTrue(all(h["speakerId"] == sid and h["turnId"] == result["turnId"] for h in frames))
        last_pcm = max(i for i, (kind, _) in enumerate(self.ws.order) if kind == "pcm")
        final_index = next(i for i, (kind, e) in enumerate(self.ws.order) if kind == "json" and e["type"] == "text")
        self.assertLess(last_pcm, final_index)

    async def test_interrupted_audio_has_no_final_text_packet(self):
        first_pcm = asyncio.Event()
        original_send = self.ws.send_bytes
        async def send_pcm(data):
            await original_send(data)
            first_pcm.set()
        self.ws.send_bytes = send_pcm
        class SlowSpeech:
            name = "test-pcm"
            async def stream(self, text, voice):
                yield bytes(960), 24000
                await asyncio.Future()
        self.session.tts = SlowSpeech()
        self.session.audio_on = True
        self.session.kickoff(once=True)
        await asyncio.wait_for(first_pcm.wait(), 1)
        preview = next(e for e in self.ws.events if e['type'] == 'speech.ready')
        self.assertTrue(preview['data']['text'])
        self.assertEqual('', self.session.history[-1]['text'])
        self.assertFalse(any(e['type'] == 'text' for e in self.ws.events))
        self.assertLess(next(i for i, (kind, e) in enumerate(self.ws.order) if kind == 'json' and e['type'] == 'speech.ready'),
                        next(i for i, (kind, _) in enumerate(self.ws.order) if kind == 'pcm'))
        await self.session.interrupt("cancel_audio")
        self.assertFalse(any(e["type"] == "text" for e in self.ws.events))
