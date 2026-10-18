"""Realtime TTS through Alibaba Cloud Model Studio (百炼): Qwen3-TTS over its WebSocket realtime API.

One connection per request: session.update (voice, 24 kHz PCM) → input_text_buffer.append/commit → session.finish,
then response.audio.delta events carry base64 PCM until session.finished. First audio arrives in under a second and
synthesis runs well ahead of real time, so a line streams as it is made. Closing the generator (a barge-in) closes the
socket, which ends synthesis on the service side.

Regional hosts get the dialect voices (voices.py DIALECT_POOLS): 四川话 Eric/Sunny, 粤语 Rocky/Kiki, 上海话 Jada,
闽南话 Roy, 陕西话 Marcus, 天津话 Peter. Their line is already rewritten into the dialect (console_localize).
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import uuid

from websockets.asyncio.client import connect

DEFAULT_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime"
DEFAULT_MODEL = "qwen3-tts-flash-realtime"
# Every system voice of qwen3-tts-flash-realtime (Model Studio's Qwen3-TTS voice list); anything else is mapped below.
VOICES = {"Cherry", "Serena", "Ethan", "Chelsie", "Momo", "Vivian", "Moon", "Maia", "Kai", "Nofish", "Bella", "Jennifer",
          "Ryan", "Katerina", "Aiden", "Eldric Sage", "Mia", "Mochi", "Bellona", "Vincent", "Bunny", "Neil", "Elias",
          "Arthur", "Nini", "Seren", "Pip", "Stella", "Bodega", "Sonrisa", "Alek", "Dolce", "Sohee", "Ono Anna", "Lenn",
          "Emilien", "Andre", "Radio Gol", "Jada", "Dylan", "Li", "Marcus", "Roy", "Peter", "Sunny", "Eric", "Rocky", "Kiki"}
# The delivered reference ids (the stage's default rotation) onto similar system voices.
ALIASES = {"rong": "Cherry", "hua": "Ethan", "pierre": "Ryan", "host": "Cherry"}


class DashScopeTTS:
    name = "dashscope-qwen-tts"
    sample_rate = 24000
    # One request per sentence (realtime_console.tts_units) for natural intonation; with a short head start the
    # stream plays through (realtime_console holds tts_prebuffer seconds before a sentence starts).
    whole_sentences = True
    # Synthesis seconds per audio second measured on this API (about 0.4–0.5 with the connection included).
    expected_rtf = .5

    def __init__(self, api_key: str, model: str = DEFAULT_MODEL, url: str = DEFAULT_URL):
        self.api_key = api_key
        self.model = model
        self.url = url

    @classmethod
    def from_env(cls):
        return cls(os.getenv("DASHSCOPE_API_KEY", "").strip(), os.getenv("DASHSCOPE_TTS_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL,
                   os.getenv("DASHSCOPE_TTS_URL", DEFAULT_URL).strip() or DEFAULT_URL)

    @property
    def ready(self) -> bool:
        return bool(self.api_key)

    @staticmethod
    def voice_name(voice: str) -> str:
        return voice if voice in VOICES else ALIASES.get(voice, "Cherry")

    async def warm(self, voices) -> None:
        """Nothing to load: the voices live on the service."""

    async def aclose(self) -> None:
        pass

    async def stream(self, text, voice):
        if not self.api_key:
            raise RuntimeError("DASHSCOPE_API_KEY is not set")
        # The service is in mainland China: connect directly, not through a proxy set for overseas APIs.
        async with connect(f"{self.url}?model={self.model}", additional_headers={"Authorization": f"Bearer {self.api_key}"},
                           proxy=None, max_size=None, open_timeout=10) as ws:
            async def send(event):
                await ws.send(json.dumps({"event_id": uuid.uuid4().hex, **event}, ensure_ascii=False))
            await send({"type": "session.update", "session": {"mode": "commit", "voice": self.voice_name(voice), "language_type": "Auto",
                                                              "response_format": "pcm", "sample_rate": self.sample_rate}})
            await send({"type": "input_text_buffer.append", "text": text})
            await send({"type": "input_text_buffer.commit"})
            await send({"type": "session.finish"})
            pending = b""
            while True:
                event = json.loads(await asyncio.wait_for(ws.recv(), timeout=20))
                kind = event.get("type")
                if kind == "response.audio.delta":
                    pending += base64.b64decode(event["delta"])
                    while len(pending) >= 960:
                        yield pending[:960], self.sample_rate
                        pending = pending[960:]
                elif kind == "error":
                    error = event.get("error") or {}
                    raise RuntimeError(f"DashScope TTS error {error.get('code', '')}: {error.get('message', '')}"[:400])
                elif kind == "session.finished":
                    break
            if len(pending) % 2:
                pending = pending[:-1]
            if pending:
                yield pending, self.sample_rate
