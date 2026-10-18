"""Coming back to a debate: session.start history resumes it instead of opening again (server/console_resume.py)."""
import unittest

from server.console_resume import ACCEPTED, KEPT, parse_history
from server.realtime_console import ConsoleSession, catalog
import tests.test_console_workflow as fixtures


class ParseHistoryTests(unittest.TestCase):
    def test_only_well_formed_rounds_of_restaurants_on_stage_are_kept(self):
        known = {"dish:a:1", "review:b:2"}
        rounds = parse_history([
            {"turnId": "t-1", "restaurantId": "a", "text": " 我家剁椒鱼头。 ", "evidenceIds": ["dish:a:1", "made-up", "dish:a:1", 7]},
            {"turnId": "user-1", "role": "user", "text": "不吃辣，人均五十", "restaurantId": "a"},
            {"turnId": "t-1", "restaurantId": "a", "text": "重复的回合"},
            {"turnId": "t-2", "restaurantId": "outsider", "text": "不在台上"},
            {"turnId": "t 3", "restaurantId": "a", "text": "turnId 不合格"},
            {"turnId": "t-4", "restaurantId": "b", "text": "   "},
            {"turnId": "t-5", "restaurantId": "b", "text": "证据格式不对", "evidenceIds": "review:b:2"},
            {"turnId": "t-6", "restaurantId": ["a"], "text": "店 ID 不是字符串"},
            {"turnId": "t-7", "restaurantId": "b", "text": "长" * 700, "evidenceIds": ["review:b:2"]},
            {"restaurantId": "b", "text": "没有 turnId"}, {"role": "user", "text": 5}, "nonsense", None,
        ], ["a", "b"], known)
        self.assertEqual(["t-1", None, "t-7"], [r.get("turnId") for r in rounds])
        self.assertEqual({"turnId": "t-1", "restaurantId": "a", "text": "我家剁椒鱼头。", "evidenceIds": ["dish:a:1"],
                          "playedSamples": 0, "presentation": "ended", "introductionCompleted": True}, rounds[0])
        self.assertEqual({"role": "user", "text": "不吃辣，人均五十"}, rounds[1])
        self.assertEqual(600, len(rounds[2]["text"]))
        self.assertEqual([], parse_history({"t-1": {}}, ["a"], known))
        self.assertEqual([], parse_history(None, ["a"], known))

    def test_one_start_reads_a_bounded_number_of_the_latest_rounds(self):
        value = [{"turnId": f"t-{i}", "restaurantId": "a", "text": f"第{i}句"} for i in range(ACCEPTED + 50)]
        rounds = parse_history(value, ["a"], set())
        self.assertEqual(ACCEPTED, len(rounds))
        self.assertEqual("t-50", rounds[0]["turnId"])


class ResumeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        await fixtures.WorkflowTests.asyncSetUp(self)

    async def asyncTearDown(self):
        await self.session.close()

    def traces(self, stage):
        return [e["data"] for e in self.ws.events if e["type"] == "trace" and e["data"]["stage"] == stage]

    async def opening(self):
        """A fresh debate's first round, as the frontend's history keeps it once performed."""
        self.session.running = True
        self.assertTrue(await self.session.turn())
        self.assertTrue(self.traces("persona.introduction"))
        done = next(e["data"] for e in self.ws.events if e["type"] == "text")
        return {"turnId": done["turnId"], "restaurantId": done["speakerId"], "text": done["text"],
                "evidenceIds": [f["id"] for f in done["evidence"]]}

    async def come_back(self, history, preferences=None):
        """A new session, as the debate page opens when the customer returns to it."""
        await self.session.close()
        self.ws = fixtures.Socket()
        self.session = ConsoleSession(self.ws)
        self.ws.session = self.session
        self.session.llm = fixtures.Model()
        await self.session.command({"type": "session.start", "data": {
            "restaurantIds": self.ids, "audioEnabled": False, "history": history,
            **({"preferences": preferences} if preferences else {})}})

    async def test_a_resumed_debate_goes_on_without_introducing_anyone_again(self):
        opening = await self.opening()
        speaker = opening["restaurantId"]
        await self.come_back([opening])
        resumed, = self.traces("session.resumed")
        self.assertEqual((1, 0, [speaker]), (resumed["rounds"], resumed["userLines"], resumed["introducedRestaurantIds"]))
        view = self.session.view()
        self.assertEqual([speaker], view["introducedRestaurantIds"])
        self.assertEqual(sorted(opening["evidenceIds"]), view["discussedEvidenceIds"])
        self.assertEqual("ended", view["recentDialogue"][0]["presentation"])

        self.session.running = True
        self.assertTrue(await self.session.turn())
        start = next(e["data"] for e in self.ws.events if e["type"] == "turn" and e["data"]["phase"] == "start")
        self.assertEqual(speaker, start["restaurantId"])  # The test model picks the same restaurant again.
        self.assertFalse(start["introduce"])
        self.assertFalse(self.traces("persona.introduction"))
        system = next(s for s, payload in self.session.llm.calls if "TurnPlan" in payload)
        self.assertIn("你已经亮过相", system)
        self.assertNotIn("首次亮相", system)
        coordinator = next(p for _, p in self.session.llm.calls if "availableAgents" in p)
        needs = {a["restaurant"]["id"]: a["character"]["needsIntroduction"] for a in coordinator["availableAgents"]}
        self.assertEqual({sid: sid != speaker for sid in self.ids}, needs)
        # Sources already cited are no longer fresh, and the new round cites something else.
        agent = next(a for a in coordinator["availableAgents"] if a["restaurant"]["id"] == speaker)
        self.assertFalse(set(opening["evidenceIds"]) & set(agent["freshEvidenceIds"]))
        done = next(e["data"] for e in self.ws.events if e["type"] == "text")
        self.assertTrue(done["evidence"])
        self.assertFalse(set(opening["evidenceIds"]) & {f["id"] for f in done["evidence"]})
        self.assertEqual([opening["turnId"], done["turnId"]], [h["turnId"] for h in self.session.history])

    async def test_the_customers_last_unanswered_question_is_answered_first(self):
        opening = await self.opening()
        question = {"turnId": "user-1", "role": "user", "text": "我不吃辣，预算八十"}
        await self.come_back([opening, question], {"maxBudget": 150})
        self.assertEqual(question["text"], self.session.query)
        self.assertEqual((80, True), (self.session.preferences["maxBudget"], self.session.preferences["noSpice"]))
        self.assertIn(question["text"], self.session.preferences["userNotes"])
        self.assertEqual({"maxBudget": 150}, self.session.initial_preferences)
        self.assertEqual({"role": "user", "text": question["text"]}, self.session.view()["recentDialogue"][-1])
        self.session.running = True
        self.assertTrue(await self.session.turn())
        coordinator = next(p for _, p in self.session.llm.calls if "availableAgents" in p)
        self.assertEqual(question["text"], coordinator["userQuestion"])
        self.assertEqual("", self.session.query)

    async def test_long_debates_keep_forty_rounds_and_every_introduction_and_reset_starts_afresh(self):
        early, late = self.ids
        facts = {sid: [f["id"] for f in catalog.facts[sid]] for sid in self.ids}
        history = [{"turnId": "t-early", "restaurantId": early, "text": "我先来。", "evidenceIds": facts[early][:1]}]
        history += [{"turnId": f"t-{i}", "restaurantId": late, "text": f"第{i}句。", "evidenceIds": [facts[late][i % len(facts[late])]]}
                    for i in range(59)]
        await self.come_back(history)
        self.assertEqual(KEPT, len(self.session.history))
        self.assertNotIn("t-early", [h["turnId"] for h in self.session.history])
        self.assertEqual(set(self.ids), self.session.introduced)
        self.assertIn(facts[early][0], self.session.used)
        self.assertEqual(60, self.session.index)
        await self.session.command({"type": "control", "data": {"action": "reset"}})
        self.assertEqual(([], set(), set(), 0, ""), (self.session.history, self.session.introduced, self.session.used,
                                                     self.session.index, self.session.query))

    async def test_a_start_without_history_opens_as_before(self):
        await self.come_back([])
        self.assertFalse(self.traces("session.resumed"))
        self.assertEqual(([], []), (self.session.view()["recentDialogue"], self.session.view()["introducedRestaurantIds"]))


if __name__ == "__main__":
    unittest.main()
