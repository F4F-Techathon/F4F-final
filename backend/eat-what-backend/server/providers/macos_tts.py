"""Offline macOS system voices through `say`: the realtime TTS for Macs without an NVIDIA GPU.

The delivered TTS is CosyVoice 3 (scripts/cosyvoice_service.py). On Apple Silicon that service also runs on the
GPU through MPS, but on an M1 Pro it is about 7x slower than real time, too slow to voice a live debate. `say`
renders faster than real time on the CPU. Each clause is rendered to 24 kHz s16le PCM and streamed in 20 ms frames,
and a stream that is cancelled (a new epoch) kills the render in progress.
"""
from __future__ import annotations

import asyncio
import os
import tempfile
import wave
from pathlib import Path

from .tts import _clauses

# Installed Mandarin voices (macOS 14+; `say -v '?'` lists them). Several share an English name with voices in
# other languages, so the locale suffix is part of the name.
CN = "（中文（中国大陆）)"
FEMALE = ["Tingting", "Sandy (中文（中国大陆）)", "Shelley (中文（中国大陆）)", "Flo (中文（中国大陆）)"]
MALE = ["Reed (中文（中国大陆）)", "Eddy (中文（中国大陆）)", "Rocko (中文（中国大陆）)"]
OLD = {"female": "Grandma (中文（中国大陆）)", "male": "Grandpa (中文（中国大陆）)"}
# The delivered voice ids (CosyVoice reference speakers) map onto the nearest system voice.
ALIASES = {"rong": "Tingting", "hua": "Reed (中文（中国大陆）)", "pierre": "Eddy (中文（中国大陆）)", "host": "Tingting"}


class MacOSTTS:
    name = "macos-say"
    sample_rate = 24000

    def __init__(self, rate: int | None = None):
        self.rate = int(rate or os.getenv("MACOS_TTS_RATE", "220"))
        self.warmed: set[str] = set()

    @staticmethod
    def voice_name(voice: str) -> str:
        return ALIASES.get(voice, voice)

    async def _render(self, text: str, voice: str) -> bytes:
        fd, path = tempfile.mkstemp(suffix=".wav")
        os.close(fd)
        # Text goes in on stdin, never as an argument.
        process = await asyncio.create_subprocess_exec(
            "say", "-v", self.voice_name(voice), "-r", str(self.rate), "--file-format=WAVE",
            "--data-format=LEI16@24000", "-o", path, "-f", "-",
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE)
        try:
            _, error = await asyncio.wait_for(process.communicate(text.encode("utf-8")), timeout=30)
            if process.returncode != 0:
                raise RuntimeError(f"say failed: {error.decode('utf-8', errors='replace')[:300]}")
            with wave.open(path, "rb") as audio:
                if audio.getframerate() != self.sample_rate or audio.getnchannels() != 1 or audio.getsampwidth() != 2:
                    raise RuntimeError("say returned an unexpected audio format")
                return audio.readframes(audio.getnframes())
        except BaseException:
            if process.returncode is None:
                process.kill()
                await process.wait()
            raise
        finally:
            Path(path).unlink(missing_ok=True)

    async def warm(self, voices) -> None:
        """A voice's first render loads it (seconds); pay that before the debate needs it."""
        for voice in voices:
            name = self.voice_name(voice)
            if name not in self.warmed:
                await self._render("好。", voice)
                self.warmed.add(name)

    async def stream(self, text, voice):
        frame = self.sample_rate // 50 * 2
        for clause in _clauses(text):
            pcm = await self._render(clause, voice)
            self.warmed.add(self.voice_name(voice))
            for offset in range(0, len(pcm), frame):
                yield pcm[offset:offset + frame], self.sample_rate
            pause = bytes(int(self.sample_rate * 0.06) * 2)
            for offset in range(0, len(pause), frame):
                yield pause[offset:offset + frame], self.sample_rate
