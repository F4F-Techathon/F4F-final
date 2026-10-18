import asyncio
import unittest

from server.discussion import ContinuousDiscussion
from server.voice_turns import VoiceTurnController


class DiscussionTests(unittest.IsolatedAsyncioTestCase):
    async def test_silence_continues_and_user_speech_cancels_before_resuming(self):
        spoken = []
        started = asyncio.Queue()
        cancelled = asyncio.Event()

        async def publish(kind, payload):
            pass

        async def next_turn():
            spoken.append(len(spoken))
            await started.put(True)
            try:
                await asyncio.Future()
            finally:
                cancelled.set()

        async def dispatch(text):
            await asyncio.sleep(0)

        controller = VoiceTurnController(dispatch, lambda: None, publish)
        discussion = ContinuousDiscussion(controller, next_turn, publish, interval=0.005)
        loop = asyncio.create_task(discussion.run())
        try:
            await asyncio.wait_for(started.get(), 1)
            discussion.user_speaking = True
            await controller.interrupt()
            self.assertTrue(cancelled.is_set())
            await asyncio.sleep(0.03)
            self.assertEqual(1, len(spoken))
            await controller.submit("踢走丁香小仙")
            await controller.task
            discussion.user_speaking = False
            await asyncio.wait_for(started.get(), 1)
            self.assertEqual(2, len(spoken))
            await discussion.control_text("暂停")
            await asyncio.sleep(0.03)
            self.assertEqual(2, len(spoken))
            await discussion.control_text("繼續")
            await asyncio.wait_for(started.get(), 1)
            self.assertEqual(3, len(spoken))
        finally:
            loop.cancel()
            await asyncio.gather(loop, return_exceptions=True)
            await controller.interrupt()
