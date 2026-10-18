from __future__ import annotations

import asyncio
import re
import unicodedata


class ContinuousDiscussion:
    """Keep restaurants talking while yielding to speech, controls and decisions."""

    def __init__(self, controller, next_turn, publish, interval=0.4):
        self.controller = controller
        self.next_turn = next_turn
        self.publish = publish
        self.interval = interval
        self.paused = False
        self.user_speaking = False

    async def set_paused(self, value):
        self.paused = value
        if value:
            await self.controller.interrupt("discussion_paused")
        await self.publish("voice.discussion", {"paused": value})

    async def control_text(self, text):
        normalized = re.sub(r"[\W_]", "", unicodedata.normalize("NFKC", text)).translate(
            str.maketrans({"繼": "继", "續": "续", "暫": "暂", "討": "讨", "論": "论", "說": "说"}))
        normalized = re.sub(r"^(?:请|麻烦你们|麻烦你)", "", normalized)
        if normalized in {"暂停", "暂停一下", "停", "停下", "停一下", "等一下", "别说了", "先别说了", "安静", "停止讨论", "先停一下"}:
            await self.set_paused(True)
            return True
        if normalized in {"继续", "继续说", "继续讲", "继续讨论", "接着聊", "你们继续", "继续聊"}:
            await self.set_paused(False)
            return True
        if self.paused:
            await self.set_paused(False)
        return False

    async def run(self):
        # A gap between turns lets audio buffers settle and provides a natural handoff.
        while True:
            if not self.paused and not self.user_speaking:
                await self.controller.start_background(self.next_turn, lambda: not self.paused and not self.user_speaking)
            await asyncio.sleep(self.interval)
