"""Exercise real LiveKit audio with synthetic speech; never opens a physical mic."""
from __future__ import annotations

import asyncio
import json
import sys
import time
import uuid
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server.config import ROOT
from server.providers.windows_tts import WindowsTTS
from livekit import rtc, api
import httpx
import numpy as np


async def main():
    session = f"voice-acceptance-{uuid.uuid4().hex[:8]}"
    events, audio = [], []
    changed, audible = asyncio.Event(), asyncio.Event()
    report = {"session": session, "passed": False}
    room = rtc.Room()
    readers = []

    @room.on("data_received")
    def received(packet):
        if packet.topic == "orchestrator":
            events.append({"time": time.perf_counter(), **json.loads(bytes(packet.data).decode("utf-8"))})
            changed.set()

    async def read_audio(track):
        stream = rtc.AudioStream(track, sample_rate=24000, num_channels=1)
        try:
            async for item in stream:
                pcm = bytes(item.frame.data)
                audio.append(pcm)
                if np.max(np.abs(np.frombuffer(pcm, dtype="<i2").astype("int32"))) > 100:
                    audible.set()
        finally:
            await stream.aclose()

    @room.on("track_subscribed")
    def subscribed(track, publication, participant):
        if track.kind == rtc.TrackKind.KIND_AUDIO:
            readers.append(asyncio.create_task(read_audio(track)))

    async def wait(kind, after=0, predicate=lambda payload: True, timeout=35):
        end = time.perf_counter() + timeout
        while True:
            for event in events[after:]:
                if event["type"] == kind and predicate(event["payload"]):
                    return event
            changed.clear()
            await asyncio.wait_for(changed.wait(), max(0.01, end - time.perf_counter()))

    async def control(kind, payload=None):
        await room.local_participant.publish_data(json.dumps({"type": kind, "payload": payload or {}}).encode(), reliable=True, topic="ui-control")

    source = rtc.AudioSource(16000, 1, queue_size_ms=40)
    try:
        # Reproduce reconnecting to an existing room with no agent attached.
        async with api.LiveKitAPI() as client:
            await client.room.create_room(api.CreateRoomRequest(name=session))
        async with httpx.AsyncClient() as client:
            response = await client.get("http://127.0.0.1:8770/api/livekit/token", params={"room": session, "identity": "synthetic-audio-check"})
            response.raise_for_status()
            credentials = response.json()
        await room.connect(credentials["url"], credentials["token"])
        track = rtc.LocalAudioTrack.create_audio_track("synthetic-input", source)
        await room.local_participant.publish_track(track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE))
        await control("ui.sync")
        async with httpx.AsyncClient() as client:
            response = await client.post("http://127.0.0.1:8770/api/livekit/ensure-agent", json={"session_id": session})
            response.raise_for_status()
        await wait("voice.ready")
        first = await wait("speech.started")
        assert first["payload"]["turn"]["speakerId"] != "host"
        await asyncio.wait_for(audible.wait(), 15)
        print("PASS: restaurant speaks automatically and real audio is received", flush=True)

        tts = WindowsTTS()
        try:
            pcm = b"".join([chunk async for chunk, rate in tts.stream("踢走丁香小仙", "hua")])
        finally:
            await tts.aclose()
        resampler = rtc.AudioResampler(24000, 16000)
        frames = resampler.push(rtc.AudioFrame(data=pcm, sample_rate=24000, num_channels=1, samples_per_channel=len(pcm) // 2)) + resampler.flush()
        speech = b"".join(bytes(frame.data) for frame in frames) + bytes(16000 * 2)
        start = len(events)
        before = time.perf_counter()
        for offset in range(0, len(speech), 640):
            chunk = speech[offset:offset + 640]
            await source.capture_frame(rtc.AudioFrame(data=chunk, sample_rate=16000, num_channels=1, samples_per_channel=len(chunk) // 2))
        transcript = await wait("user.transcript", start)
        report["transcript"] = transcript["payload"]["text"]
        roster = await wait("roster.changed", start)
        assert roster["payload"]["removedId"] == "dxx-ningbo"
        assert all(item["id"] != "dxx-ningbo" for item in roster["payload"]["snapshot"]["active"])
        interrupted = await wait("speech.interrupted", start, lambda p: p.get("reason") == "user_speech_started")
        report["inputToInterruptMs"] = round((interrupted["time"] - before) * 1000, 1)
        after_roster = events.index(roster) + 1
        following = await wait("speech.started", after_roster)
        assert following["payload"]["turn"]["speakerId"] in {"rong", "pierre"}
        print("PASS: spoken kick command removes the named restaurant and discussion resumes", flush=True)

        marker = len(events)
        await control("ui.discussion", {"paused": True})
        paused = await wait("voice.discussion", marker, lambda p: p["paused"])
        marker = events.index(paused) + 1
        await asyncio.sleep(0.9)
        assert not any(event["type"] == "speech.started" for event in events[marker:])
        await control("ui.discussion", {"paused": False})
        await wait("speech.started", marker)
        assert not any(event["type"] == "speech.started" and event["payload"]["turn"]["speakerId"] == "host" for event in events)
        report["passed"] = True
        print("PASS: pause/resume works and host never enters the audio turn stream", flush=True)
    except BaseException as exc:
        report["error"] = f"{type(exc).__name__}: {exc}"
        raise
    finally:
        await room.disconnect()
        for task in readers:
            task.cancel()
        await asyncio.gather(*readers, return_exceptions=True)
        await source.aclose()
        report["events"] = events
        (ROOT / "artifacts/voice-discussion-validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        if audio:
            with wave.open(str(ROOT / "artifacts/voice-discussion-output.wav"), "wb") as output:
                output.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
                output.writeframes(b"".join(audio))


if __name__ == "__main__":
    asyncio.run(main())
