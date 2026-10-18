from __future__ import annotations

import asyncio
import threading
from typing import Iterable


class FasterWhisperSTT:
    """Batch-at-end-of-turn STT; Silero supplies immediate speech start/end events."""

    def __init__(self, model_name: str = "small", device: str = "cuda", compute_type: str = "int8_float16"):
        self.model_name = model_name
        self.device = device
        self.compute_type = compute_type
        self.model = None
        self.error: str | None = None
        self.lock = threading.RLock()

    def load(self) -> None:
        with self.lock:
            if self.model is not None:
                return
            try:
                import os
                import sys
                from pathlib import Path
                self.dll_handles = []
                if os.name == "nt" and self.device == "cuda":
                    package_root = Path(__file__).resolve().parents[2] / ".venv/Lib/site-packages/nvidia"
                    dll_dirs = list(package_root.glob("*/bin"))
                    for directory in dll_dirs:
                        self.dll_handles.append(os.add_dll_directory(str(directory)))
                    os.environ["PATH"] = os.pathsep.join(str(d) for d in dll_dirs) + os.pathsep + os.environ["PATH"]
                from faster_whisper import WhisperModel
                self.model = WhisperModel(self.model_name, device=self.device, compute_type=self.compute_type)
            except Exception as exc:
                self.error = f"{type(exc).__name__}: {exc}"
                raise

    async def transcribe_frames(self, frames: Iterable[object], initial_prompt: str | None = None) -> str:
        if self.model is None:
            await asyncio.to_thread(self.load)

        def run() -> str:
            import numpy as np

            chunks = []
            for frame in frames:
                chunks.append(bytes(frame.data))
            if not chunks:
                return ""
            audio = np.frombuffer(b"".join(chunks), dtype="<i2").astype("float32") / 32768.0
            with self.lock:
                segments, _ = self.model.transcribe(audio, language="zh", vad_filter=False, beam_size=3,
                                                  condition_on_previous_text=False,
                                                  initial_prompt=initial_prompt or "餐厅：丁香小鲜、蓉姐川味、Pierre小馆。预算、过敏、踢走、换一家。")
                text = "".join(segment.text for segment in segments).strip()
            # Whisper sometimes writes Chinese in traditional characters (dialect or unclear audio); the app is simplified.
            try:
                from zhconv import convert
                return convert(text, "zh-cn")
            except ImportError:
                return text

        return await asyncio.to_thread(run)

