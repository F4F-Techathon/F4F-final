import asyncio
import unittest

from server.console_playback import heard_view, speech_units
import tests.test_console_workflow as fixtures


class HeardTextTests(unittest.TestCase):
    def test_partial_sentence_only_commits_completed_short_units(self):
        record = {"playedSamples": 150, "units": [
            {"text": "我们人均33元，", "segmentId": "s0", "evidenceIds": ["price"], "sampleStart": 0, "sampleEnd": 100},
            {"text": "还可以比较套餐。", "segmentId": "s0", "evidenceIds": ["offer"], "sampleStart": 100, "sampleEnd": 200}]}
        result = heard_view(record)
        self.assertEqual("我们人均33元，", result["text"])
        self.assertEqual(["price"], result["evidenceIds"])
        self.assertFalse(result["partialAudio"]["textAvailable"])
        self.assertNotIn("套餐", str(result))

    def test_not_fully_synthesized_unit_cannot_enter_heard_history(self):
        result = heard_view({"playedSamples": 80, "units": [
            {"text": "不能整句放进上下文", "segmentId": "s0", "evidenceIds": ["x"], "sampleStart": 0, "sampleEnd": None}]})
        self.assertEqual("", result["text"])
        self.assertIsNotNone(result["partialAudio"])

    def test_segmentation_preserves_decimal_numbers_and_exact_text(self):
        text = "人均33.50元，适合午餐；营业到24点。"
        units = speech_units(text)
        self.assertEqual(text, "".join(units))
        self.assertIn("33.50", units[0])


class PipelineTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        await fixtures.WorkflowTests.asyncSetUp(self)

    async def asyncTearDown(self):
        await fixtures.WorkflowTests.asyncTearDown(self)

    async def test_completed_prefetch_is_discarded_on_barge_in_and_no_future_history(self):
        first_audio = asyncio.Event()
        original_send = self.ws.send_bytes
        async def send_pcm(raw):
            await original_send(raw)
            first_audio.set()
        self.ws.send_bytes = send_pcm
        class SlowSpeech:
            name = "test-pcm"
            async def stream(self, text, voice):
                yield bytes(960), 24000
                await asyncio.Future()
        self.session.tts = SlowSpeech()
        self.session.audio_on = True
        self.session.kickoff()
        await asyncio.wait_for(first_audio.wait(), 1)
        async def ready():
            while not self.session.prefetch_task or not self.session.prefetch_task.done():
                await asyncio.sleep(.005)
        await asyncio.wait_for(ready(), 1)
        self.assertEqual(4, len(self.session.llm.calls))
        tid, epoch = self.session.current["turnId"], self.session.epoch
        self.assertEqual("", self.session.view()["recentDialogue"][-1]["text"])
        await self.session.playback_report({"turnId": tid, "epoch": epoch, "status": "progress", "playedSamples": 240})
        self.session.speaking = True
        await self.session.interrupt("vad_speech_started")
        self.assertIsNone(self.session.prefetch_task)
        self.assertIsNone(self.session.prefetch_token)
        self.assertEqual(1, len(self.session.history))
        self.assertEqual("", self.session.history[0]["text"])
        self.assertIsNotNone(self.session.history[0]["partialAudio"])
        # A final stop report for the old epoch is accepted only as history feedback.
        await self.session.playback_report({"turnId": tid, "epoch": epoch, "status": "interrupted", "playedSamples": 300})
        self.assertEqual(300, self.session.history[0]["playedSamples"])
        self.assertEqual("", self.session.history[0]["text"])
        self.assertFalse(any(e["type"] == "text" for e in self.ws.events))
        self.assertTrue(any(e["type"] == "trace" and e["data"]["stage"] == "pipeline.discard" for e in self.ws.events))
        self.session.speaking = False
        await self.session.input_text("人均预算50元")
        async def new_context():
            while not any(e["type"] == "trace" and e["data"]["stage"] == "agent.context" and
                          e["data"]["SessionView"]["preferences"].get("maxBudget") == 50 for e in self.ws.events):
                await asyncio.sleep(.005)
        await asyncio.wait_for(new_context(), 1)
        context = next(e["data"]["SessionView"] for e in self.ws.events if e["type"] == "trace" and
                       e["data"]["stage"] == "agent.context" and e["data"]["SessionView"]["preferences"].get("maxBudget") == 50)
        self.assertNotIn("pendingPlayback", context)
        self.assertEqual("", context["recentDialogue"][0]["text"])
        self.assertEqual(2, len(context["recentDialogue"]))  # Heard/partial old turn and new user input only.
        await self.session.interrupt("done")

    async def test_inflight_prefetch_request_is_cancelled(self):
        entered, stopped = asyncio.Event(), asyncio.Event()
        base = fixtures.Model()
        class Model:
            async def stream_text(self, system, user):
                if '"speculative": true' in user:
                    try:
                        entered.set()
                        yield '{'
                        await asyncio.Future()
                    finally:
                        stopped.set()
                else:
                    async for delta in base.stream_text(system, user):
                        yield delta
        class SlowSpeech:
            name = "test-pcm"
            async def stream(self, text, voice):
                yield bytes(960), 24000
                await asyncio.Future()
        self.session.llm = Model()
        self.session.tts = SlowSpeech()
        self.session.audio_on = True
        self.session.kickoff()
        await asyncio.wait_for(entered.wait(), 1)
        await self.session.interrupt("vad_speech_started")
        self.assertTrue(stopped.is_set())
        self.assertFalse(self.session.work)
        self.assertIsNone(self.session.prefetch_task)
