from __future__ import annotations

from typing import Any, AsyncIterator, Iterable, Protocol


class STTProvider(Protocol):
    async def transcribe_frames(self, frames: Iterable[object]) -> str: ...


class LLMProvider(Protocol):
    @property
    def configured(self) -> bool: ...

    async def complete_json(self, system: str, user: str) -> dict[str, Any]: ...


class TTSProvider(Protocol):
    async def stream(self, text: str, voice: str) -> AsyncIterator[tuple[bytes, int]]: ...
