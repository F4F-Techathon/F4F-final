from __future__ import annotations

import asyncio
import base64
import json
import subprocess
from pathlib import Path

from .tts import _clauses


class WindowsTTS:
    """Offline Chinese SAPI voices, with a cancellable, persistent synthesis process."""

    name = "windows-offline"
    sample_rate = 24000

    def __init__(self):
        self.process = None
        self.lock = asyncio.Lock()

    async def _start(self):
        if self.process is None or self.process.returncode is not None:
            script = Path(__file__).resolve().parents[2] / "scripts" / "windows_tts.ps1"
            self.process = await asyncio.create_subprocess_exec(
                str(script.parent.parent / "runtime/tools/powershell/pwsh.exe"),
                "-NoProfile", "-NonInteractive", "-File", str(script),
                stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE, limit=8 * 1024 * 1024,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )

    async def aclose(self):
        process, self.process = self.process, None
        if process is not None:
            if process.returncode is None:
                process.kill()
            await process.communicate()

    async def stream(self, text, voice):
        async with self.lock:
            try:
                await self._start()
                for clause in _clauses(text):
                    body = json.dumps({"text": clause, "voice": voice}, ensure_ascii=False) + "\n"
                    self.process.stdin.write(body.encode("utf-8"))
                    await self.process.stdin.drain()
                    line = await asyncio.wait_for(self.process.stdout.readline(), timeout=20)
                    if not line:
                        error = (await self.process.stderr.read()).decode("utf-8", errors="replace")
                        raise RuntimeError(f"Windows TTS exited without audio: {error[:1200]}")
                    result = json.loads(line)
                    if "error" in result:
                        raise RuntimeError(result["error"])
                    pcm = base64.b64decode(result["pcm"])
                    for offset in range(0, len(pcm), 960):
                        yield pcm[offset:offset + 960], self.sample_rate
                        await asyncio.sleep(0)
            except BaseException:
                await self.aclose()
                raise
