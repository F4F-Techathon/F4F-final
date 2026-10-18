from __future__ import annotations

import asyncio
from contextlib import suppress
from time import perf_counter


class VoiceTurnController:
    """Cancel the whole response, including pending LLM work, on every new utterance."""

    def __init__(self, dispatch, clear_audio, publish):
        self.dispatch = dispatch
        self.clear_audio = clear_audio
        self.publish = publish
        self.task = None
        self.generation = 0
        self.transition = asyncio.Lock()

    async def interrupt(self, reason="user_speech_started"):
        async with self.transition:
            await self._interrupt(reason)

    async def _interrupt(self, reason):
        start = perf_counter()
        self.generation += 1
        # Flush buffered media before waiting on cancellation of model work.
        self.clear_audio()
        task, self.task = self.task, None
        if task and not task.done():
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task
        await self.publish("speech.interrupted", {
            "reason": reason, "generation": self.generation,
            "serverStopMs": round((perf_counter() - start) * 1000, 1),
        })

    async def submit(self, text):
        async with self.transition:
            await self._interrupt("new_intent")
            self.task = asyncio.create_task(self._run_callback(lambda: self.dispatch(text)))

    async def start_background(self, callback, can_start=lambda: True):
        async with self.transition:
            if not can_start() or (self.task and not self.task.done()):
                return False
            self.task = asyncio.create_task(self._run_callback(callback))
            return True

    async def _run_callback(self, callback):
        try:
            await callback()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            await self.publish("voice.error", {"component": "response", "message": type(exc).__name__})
