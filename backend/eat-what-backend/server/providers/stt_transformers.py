"""Whisper through Hugging Face transformers, on Apple Silicon's GPU (MPS) or the CPU.

The delivered STT is faster-whisper (CTranslate2), which runs on NVIDIA GPUs or the CPU but not on Apple's GPU. This
provider is the Mac alternative behind the same interface (WHISPER_BACKEND=transformers): WHISPER_MODEL is a local
transformers checkpoint, e.g. the openai/whisper-large-v3-turbo snapshot already in a Hugging Face cache, and
WHISPER_DEVICE is mps (default when available) or cpu. Like the delivered adapter it transcribes once, at the end of
the user's turn (no partial results).
"""
from __future__ import annotations

import asyncio
import os
import re
import threading
from typing import Iterable


VOCABULARY = "预算、人均、过敏、不吃辣、不能吃辣、安静、踢走、换一家。"


def plain_hint(initial_prompt: str | None) -> str:
    """Whisper copies a hint's punctuation: the realtime console's "店名（角色）、…" list made it answer in
    full-width brackets and cut the last character. Names as a plain list, plus the words customers use here
    (it also turned 不吃辣 into 不吃啦 without them), transcribe cleanly."""
    words = [w for w in re.findall(r"[\u4e00-\u9fffA-Za-z0-9·]+", initial_prompt or "") if w not in {"餐厅和角色", "餐厅", "角色"}]
    names = "、".join(dict.fromkeys(words))[:120]
    return (f"餐厅：{names}。" if names else "") + VOCABULARY


class TransformersWhisperSTT:
    def __init__(self, model_path: str, device: str = "mps"):
        self.model_path = os.path.expanduser(model_path)
        self.device = device
        self.model = None
        self.processor = None
        self.dtype = None
        self.error: str | None = None
        self.lock = threading.RLock()

    @property
    def name(self) -> str:
        return f"transformers-whisper ({os.path.basename(self.model_path.rstrip('/')) or self.model_path}, {self.device})"

    def load(self) -> None:
        with self.lock:
            if self.model is not None:
                return
            try:
                os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
                import torch
                from transformers import WhisperForConditionalGeneration, WhisperProcessor

                if self.device == "mps" and not torch.backends.mps.is_available():
                    self.device = "cpu"
                self.dtype = torch.float16 if self.device != "cpu" else torch.float32
                self.processor = WhisperProcessor.from_pretrained(self.model_path)
                model = WhisperForConditionalGeneration.from_pretrained(self.model_path, torch_dtype=self.dtype)
                self.model = model.to(self.device).eval()
                # The first pass on the GPU sets up its kernels (seconds); do it before anyone is waiting.
                import numpy as np
                self.transcribe_array(np.zeros(16000, dtype="float32"))
            except Exception as exc:
                self.error = f"{type(exc).__name__}: {exc}"
                raise

    def transcribe_array(self, audio, initial_prompt: str | None = None) -> str:
        """16 kHz mono float32 samples to text."""
        import torch

        with self.lock, torch.inference_mode():
            features = self.processor(audio, sampling_rate=16000, return_tensors="pt").input_features
            features = features.to(self.device, self.dtype)
            kwargs = {"language": "zh", "task": "transcribe", "max_new_tokens": 160}
            hint = plain_hint(initial_prompt)
            kwargs["prompt_ids"] = torch.tensor(self.processor.get_prompt_ids(hint), device=self.device)
            ids = self.model.generate(features, **kwargs)
            text = self.processor.batch_decode(ids, skip_special_tokens=True)[0].strip()
            # Some transformers versions return the prompt in front of the transcript.
            if text.startswith(hint):
                text = text[len(hint):].strip()
            return text.replace("\ufffd", "").strip()

    async def transcribe_frames(self, frames: Iterable[object], initial_prompt: str | None = None) -> str:
        if self.model is None:
            await asyncio.to_thread(self.load)

        def run() -> str:
            import numpy as np

            chunks = [bytes(frame.data) for frame in frames]
            if not chunks:
                return ""
            audio = np.frombuffer(b"".join(chunks), dtype="<i2").astype("float32") / 32768.0
            return self.transcribe_array(audio, initial_prompt)

        return await asyncio.to_thread(run)
