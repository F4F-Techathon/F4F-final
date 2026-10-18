from __future__ import annotations

import asyncio
import os
import re
from pathlib import Path
from typing import AsyncIterator


def _clauses(text: str) -> list[str]:
    """Short clauses lower first-audio latency and create cancellation points."""
    parts = [part.strip() for part in re.findall(r"[^，。！？；!?;]+[，。！？；!?;]?", text) if part.strip()]
    merged: list[str] = []
    for part in parts:
        if merged and len(part.rstrip("，。！？；!?;")) < 4:
            merged[-1] += part
        else:
            merged.append(part)
    return merged or [text]


class NullTTS:
    name = "none"

    @property
    def ready(self) -> bool:
        return False

    async def stream(self, text: str, voice: str) -> AsyncIterator[tuple[bytes, int]]:
        if False:
            yield b"", 24000


class CosyVoiceTTS:
    """Lazy local CosyVoice3 adapter using the included zero-shot reference voices."""

    name = "cosyvoice"
    name = "cosyvoice"
    prompt_text = "您好，欢迎光临！今天的招牌菜特别新鲜，快坐下来尝一尝吧。"

    def __init__(self, root: Path, voice_dir: Path):
        self.root = root
        self.voice_dir = voice_dir
        self.model = None
        self.sample_rate = 24000
        self.error: str | None = None
        self.voice_map = {"rong": "f_mid.wav", "hua": "m_mid.wav", "pierre": "m_fr.wav", "host": "f_mid.wav"}

    @property
    def ready(self) -> bool:
        return self.model is not None

    def load(self) -> None:
        if self.model is not None:
            return
        try:
            import sys

            sys.path.insert(0, str(self.root))
            sys.path.insert(0, str(self.root / "third_party" / "Matcha-TTS"))
            from cosyvoice.cli.cosyvoice import AutoModel

            model_dir = self.root / "pretrained_models" / "Fun-CosyVoice3-0.5B"
            self.model = AutoModel(model_dir=str(model_dir), fp16=os.getenv("COSY_FP16", "1") == "1")
            self.sample_rate = int(self.model.sample_rate)
        except Exception as exc:
            self.error = f"{type(exc).__name__}: {exc}"
            raise

    async def stream(self, text: str, voice: str) -> AsyncIterator[tuple[bytes, int]]:
        if not self.ready:
            await asyncio.to_thread(self.load)
        import numpy as np
        import torch

        ref = self.voice_dir / self.voice_map.get(voice, "f_mid.wav")

        def synthesize(clause: str):
            torch.manual_seed(3)
            result = self.model.inference_zero_shot(
                clause,
                f"You are a helpful assistant.<|endofprompt|>{self.prompt_text}",
                str(ref),
                stream=False,
                speed=1.05,
            )
            audio = torch.cat([part["tts_speech"] for part in result], dim=1).squeeze(0).float().cpu().numpy()
            return (np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes()

        frame_bytes = self.sample_rate // 50 * 2
        for clause in _clauses(text):
            pcm = await asyncio.to_thread(synthesize, clause)
            for offset in range(0, len(pcm), frame_bytes):
                yield pcm[offset : offset + frame_bytes], self.sample_rate
            # A short natural pause is part of the same cancellable stream.
            pause = bytes(int(self.sample_rate * 0.06) * 2)
            for offset in range(0, len(pause), frame_bytes):
                yield pause[offset : offset + frame_bytes], self.sample_rate

