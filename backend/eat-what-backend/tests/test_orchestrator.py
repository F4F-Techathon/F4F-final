from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from server.config import ROOT
from server.data import RestaurantRepository
from server.orchestrator import MultiAgentOrchestrator
from server.store import SessionStore


class OrchestratorTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.repo = RestaurantRepository(ROOT / "data" / "restaurants.json")
        self.store = SessionStore(Path(self.tempdir.name) / "sessions.sqlite3", self.repo.ordered_ids())
        self.orchestrator = MultiAgentOrchestrator(self.repo, self.store)

    def tearDown(self):
        self.tempdir.cleanup()

    async def test_bootstrap_has_two_active_and_one_holding(self):
        state = self.store.get("a")
        snapshot = self.orchestrator.snapshot(state)
        self.assertEqual(2, len(snapshot["active"]))
        self.assertEqual(1, len(snapshot["holding"]))

    async def test_profile_and_explicit_replacement(self):
        first = await self.orchestrator.handle("b", "人均预算150，我花生过敏")
        self.assertEqual(150, first.state.profile.budget)
        self.assertIn("花生", first.state.profile.allergies)
        before = list(first.state.active)
        result = await self.orchestrator.handle("b", "我不要蓉姐川味了，换一家")
        self.assertNotEqual(before, result.state.active)
        self.assertIn("rong-hotpot", result.state.removed)
        roster = [event for event in result.events if event.type == "roster.changed"]
        self.assertEqual(1, len(roster))

    async def test_every_citation_resolves_and_belongs_to_speaker_or_target(self):
        result = await self.orchestrator.handle("c", "想找适合朋友聚餐的，人均200")
        speech = [event.payload["turn"] for event in result.events if event.type == "speech.started"]
        for turn in speech:
            speaker = self.repo.by_agent(turn["speakerId"])
            target = self.repo.by_agent(turn.get("targetAgentId")) if turn.get("targetAgentId") else None
            allowed = {item.id for item in (speaker, target) if item}
            for evidence_id in turn["evidenceIds"]:
                self.assertIn(evidence_id, self.repo.evidence)
                self.assertIn(self.repo.evidence[evidence_id].restaurant_id, allowed or {"dxx-ningbo", "rong-hotpot", "pierre-bistro"})

    async def test_decision_event_is_emitted(self):
        result = await self.orchestrator.handle("d", "现在帮我总结并推荐一个")
        self.assertTrue(any(event.type == "decision.final" for event in result.events))

    def test_fake_sources_are_explicit(self):
        for restaurant in self.repo.restaurants.values():
            for evidence in restaurant.evidence:
                self.assertEqual(restaurant.is_demo, evidence.is_demo)

    async def test_voice_homophone_and_kick_command_select_correct_restaurant(self):
        for text in ("踢走丁香小仙", "打叮香小鲜踢走", "我不要叮香小仙"):
            with self.subTest(text=text):
                self.store.reset("kick")
                result = await self.orchestrator.handle("kick", text)
                self.assertNotIn("dxx-ningbo", result.state.active)
                self.assertIn("rong-hotpot", result.state.active)
                self.assertIn("pierre-bistro", result.state.active)
                host = next(e.payload["turn"] for e in result.events if e.type == "speech.started")
                self.assertIn("已移出丁香小鲜", host["text"])

    async def test_removal_works_when_holding_is_empty(self):
        await self.orchestrator.handle("empty-holding", "预算150，我花生过敏")
        await self.orchestrator.handle("empty-holding", "我不要蓉姐川味，换一家")
        result = await self.orchestrator.handle("empty-holding", "踢走叮香小仙")
        self.assertEqual(["pierre-bistro"], result.state.active)
        self.assertEqual(150, result.state.profile.budget)
        self.assertIn("花生", result.state.profile.allergies)
        roster = next(e for e in result.events if e.type == "roster.changed")
        self.assertIsNone(roster.payload["addedId"])
        self.assertFalse(any(e.type == "speech.started" and e.payload["turn"]["speakerId"] == "hua" for e in result.events))
        repeated = await self.orchestrator.handle("empty-holding", "再踢走丁香小仙")
        self.assertEqual(["pierre-bistro"], repeated.state.active)
        turns = [e.payload["turn"] for e in repeated.events if e.type == "speech.started"]
        self.assertEqual(1, len(turns))
        self.assertIn("已经离场", turns[0]["text"])
        new_request = await self.orchestrator.handle("empty-holding", "我需要一家新的点")
        self.assertEqual(["pierre-bistro"], new_request.state.active)
        note = next(e.payload["turn"]["text"] for e in new_request.events if e.type == "speech.started")
        self.assertIn("没有新店可以补位", note)

    async def test_non_rejections_do_not_remove_restaurants(self):
        for text in ("预算不要超过150", "别踢走丁香小鲜", "不要把丁香小鲜踢走", "我喜欢丁香小鲜"):
            with self.subTest(text=text):
                result = await self.orchestrator.handle("keep", text)
                self.assertEqual(self.repo.ordered_ids()[:2], result.state.active)

    async def test_unknown_target_clarifies_without_removing_someone_else(self):
        result = await self.orchestrator.handle("unknown", "踢走海底捞")
        self.assertEqual(self.repo.ordered_ids()[:2], result.state.active)
        turns = [e.payload["turn"] for e in result.events if e.type == "speech.started"]
        self.assertEqual(1, len(turns))
        self.assertIn("请明确", turns[0]["text"])

    async def test_no_recommendation_when_all_candidates_removed(self):
        for name in ("丁香小鲜", "蓉姐", "Pierre"):
            await self.orchestrator.handle("remove-all", f"踢走{name}")
        result = await self.orchestrator.handle("remove-all", "总结推荐一个")
        self.assertEqual([], result.state.active)
        self.assertFalse(any(e.type == "decision.final" for e in result.events))
        self.assertIsNone(await self.orchestrator.next_discussion("remove-all"))

    async def test_autonomous_discussion_has_no_fake_user_or_host_and_rotates(self):
        speakers, texts = [], []
        for _ in range(8):
            result = await self.orchestrator.next_discussion("auto")
            turn = next(e.payload["turn"] for e in result.events if e.type == "speech.started")
            speakers.append(turn["speakerId"])
            texts.append(turn["text"])
        self.assertEqual(["hua", "rong"] * 4, speakers)
        self.assertEqual(8, len(set(texts)))
        self.assertFalse(any(item["role"] == "user" for item in result.state.transcript))
        self.assertEqual(8, result.state.discussion_index)

    async def test_silent_coordination_then_discussion_uses_updated_roster(self):
        result = await self.orchestrator.handle("silent", "踢走丁香小仙", include_restaurants=False)
        turns = [e.payload["turn"] for e in result.events if e.type == "speech.started"]
        self.assertEqual(["host"], [turn["speakerId"] for turn in turns])
        for _ in range(3):
            following = await self.orchestrator.next_discussion("silent")
            turn = next(e.payload["turn"] for e in following.events if e.type == "speech.started")
            self.assertNotIn(turn["speakerId"], {"host", "hua"})


if __name__ == "__main__":
    unittest.main()

