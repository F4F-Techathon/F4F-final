from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import suppress
from pathlib import Path

from .config import ROOT, RUNTIME, settings
from .data import RestaurantRepository
from .orchestrator import MultiAgentOrchestrator
from .providers import CosyVoiceTTS, FasterWhisperSTT, OpenAICompatibleLLM
from .providers.llm import make_llm
from .store import SessionStore
from .voice_turns import VoiceTurnController
from .providers.windows_tts import WindowsTTS
from .providers.cosyvoice_http import CosyVoiceHTTP
from .discussion import ContinuousDiscussion

logger = logging.getLogger("tonight-eats.worker")

try:
    from livekit import rtc
    from livekit.agents import AgentServer, JobContext, JobProcess, cli
    from livekit.agents.vad import VADEventType
    from livekit.plugins import silero
except ImportError as exc:  # keeps API/demo imports usable without GPU dependencies
    raise SystemExit("LiveKit dependencies are missing. Install requirements-livekit.txt") from exc


server = AgentServer(num_idle_processes=1, initialize_process_timeout=90, host="127.0.0.1", load_threshold=float("inf"))


def setup_process(proc: JobProcess) -> None:
    proc.userdata["vad"] = silero.VAD.load(
        min_speech_duration=0.12,
        min_silence_duration=0.55,
        prefix_padding_duration=0.35,
        force_cpu=True,
    )
    proc.userdata["stt"] = FasterWhisperSTT(
        model_name=settings.whisper_model,
        device=settings.whisper_device,
        compute_type=settings.whisper_compute_type,
    )
    proc.userdata["stt"].load()
    (RUNTIME / "voice-status.json").write_text(json.dumps({
        "pid": os.getpid(), "ready": True, "sttReady": True,
        "vadReady": True, "ttsProvider": settings.tts_provider,
    }), encoding="utf-8")


server.setup_fnc = setup_process


async def publish_event(ctx: JobContext, event_type: str, payload: dict) -> None:
    body = json.dumps({"type": event_type, "payload": payload}, ensure_ascii=False).encode("utf-8")
    await ctx.room.local_participant.publish_data(body, reliable=True, topic="orchestrator")


@server.rtc_session(agent_name=settings.livekit_agent_name)
async def restaurant_host(ctx: JobContext) -> None:
    await ctx.connect()
    repo = RestaurantRepository(settings.data_path)
    store = SessionStore(settings.database_path, repo.ordered_ids())
    llm = (
        make_llm(settings)
        if settings.llm_ready
        else None
    )
    orchestrator = MultiAgentOrchestrator(repo, store, llm, runtime_mode="livekit")
    session_id = ctx.room.name or "livekit-room"
    stt: FasterWhisperSTT = ctx.proc.userdata["stt"]
    cosyvoice_dir = os.getenv("COSYVOICE_DIR", "").strip()
    tts = (CosyVoiceHTTP(os.getenv('COSYVOICE_URL', 'http://127.0.0.1:8772')) if settings.tts_provider == 'cosyvoice-http'
           else WindowsTTS() if settings.tts_provider == 'windows'
           else CosyVoiceTTS(root=Path(cosyvoice_dir), voice_dir=ROOT / 'voices') if cosyvoice_dir else None)
    audio_source = rtc.AudioSource(sample_rate=24000, num_channels=1, queue_size_ms=160)
    audio_track = rtc.LocalAudioTrack.create_audio_track("host-voice", audio_source)
    await ctx.room.local_participant.publish_track(
        audio_track,
        rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE),
    )
    playback_task: asyncio.Task | None = None
    transcription_task: asyncio.Task | None = None
    speech_sequence = 0

    async def interrupt() -> None:
        await controller.interrupt()

    async def play_turn(turn: dict, evidence_payload: list[dict]) -> None:
        if turn["speakerId"] == "host":
            await publish_event(ctx, "host.note", {"turn": turn, "evidence": evidence_payload})
            return
        await publish_event(ctx, "speech.started", {"turn": turn})
        await publish_event(ctx, "speech.chunk", {"turnId": turn["turnId"], "text": turn["text"]})
        if evidence_payload:
            await publish_event(ctx, "evidence.available", {"turnId": turn["turnId"], "evidence": evidence_payload})
        if tts is None:
            await publish_event(ctx, "speech.interrupted", {"reason": "tts_unavailable", "turnId": turn["turnId"]})
        else:
            try:
                voice = turn["speakerId"] if turn["speakerId"] in {"rong", "hua", "pierre"} else "host"
                resampler = None
                async for pcm, sample_rate in tts.stream(turn["text"], voice):
                    frame = rtc.AudioFrame(
                        data=pcm,
                        sample_rate=sample_rate,
                        num_channels=1,
                        samples_per_channel=len(pcm) // 2,
                    )
                    if sample_rate != 24000:
                        if resampler is None:
                            resampler = rtc.AudioResampler(sample_rate, 24000, num_channels=1)
                        for output in resampler.push(frame):
                            await audio_source.capture_frame(output)
                    else:
                        await audio_source.capture_frame(frame)
                if resampler:
                    for output in resampler.flush():
                        await audio_source.capture_frame(output)
                await audio_source.wait_for_playout()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("TTS unavailable; keeping text-only events")
                await publish_event(ctx, "speech.interrupted", {"reason": "tts_unavailable", "turnId": turn["turnId"]})
        await publish_event(ctx, "speech.ended", {"turnId": turn["turnId"], "speakerId": turn["speakerId"]})

    async def dispatch_result(text: str) -> None:
        await publish_event(ctx, "voice.state", {"state": "thinking"})
        result = await orchestrator.handle(session_id, text, include_restaurants=False)
        if any(event.type == "decision.final" for event in result.events):
            discussion.paused = True
            await publish_event(ctx, "voice.discussion", {"paused": True, "reason": "decision"})
        await emit_result(result)

    async def emit_result(result):
        nonlocal playback_task
        events = [event.public() for event in result.events]
        if result.degraded_reason:
            for event in events:
                if event["type"] == "room.snapshot":
                    event["payload"]["degradedReason"] = result.degraded_reason
        evidence_by_turn = {
            event["payload"]["turnId"]: event["payload"]["evidence"]
            for event in events
            if event["type"] == "evidence.available"
        }
        for event in events:
            if event["type"] == "speech.started":
                turn = event["payload"]["turn"]
                playback_task = asyncio.create_task(play_turn(turn, evidence_by_turn.get(turn["turnId"], [])))
                try:
                    await playback_task
                except asyncio.CancelledError:
                    raise
            elif event["type"] not in {"speech.chunk", "speech.ended", "evidence.available"}:
                await publish_event(ctx, event["type"], event["payload"])
        if not discussion.paused:
            await publish_event(ctx, "voice.state", {"state": "listening"})

    async def publish(kind, payload):
        await publish_event(ctx, kind, payload)

    controller = VoiceTurnController(dispatch_result, audio_source.clear_queue, publish)

    async def next_turn():
        result = await orchestrator.next_discussion(session_id)
        if result is None:
            discussion.paused = True
            await publish_event(ctx, "voice.discussion", {"paused": True, "reason": "no_candidates"})
            return
        await emit_result(result)

    discussion = ContinuousDiscussion(controller, next_turn, publish)

    async def interrupt_then_dispatch(text: str) -> None:
        if not await discussion.control_text(text):
            await controller.submit(text)

    async def sync():
        await publish_event(ctx, "room.snapshot", orchestrator.snapshot(store.get(session_id)))
        await publish_event(ctx, "voice.ready", {"stt": settings.whisper_device, "tts": tts.name if tts else "none", "hostSilent": True})
        await publish_event(ctx, "voice.discussion", {"paused": discussion.paused})

    async def reset():
        await controller.interrupt("session_reset")
        store.reset(session_id)
        discussion.paused = False
        await publish_event(ctx, "session.reset", {})
        await sync()

    def on_data(packet) -> None:
        if packet.topic != "ui-control":
            return
        try:
            data = json.loads(bytes(packet.data).decode("utf-8"))
            if data.get("type") == "ui.intent" and data.get("payload", {}).get("text"):
                asyncio.create_task(interrupt_then_dispatch(str(data["payload"]["text"])))
            elif data.get("type") == "ui.interrupt":
                asyncio.create_task(discussion.set_paused(True))
            elif data.get("type") == "ui.discussion":
                asyncio.create_task(discussion.set_paused(bool(data.get("payload", {}).get("paused", False))))
            elif data.get("type") == "ui.sync":
                asyncio.create_task(sync())
            elif data.get("type") == "ui.reset":
                asyncio.create_task(reset())
        except Exception:
            logger.exception("invalid data packet")

    ctx.room.on("data_received", on_data)
    await publish_event(ctx, "room.snapshot", orchestrator.snapshot(store.get(session_id)))
    participant = await ctx.wait_for_participant()
    await sync()
    audio_stream = rtc.AudioStream.from_participant(
        participant=participant,
        track_source=rtc.TrackSource.SOURCE_MICROPHONE,
        sample_rate=16000,
        num_channels=1,
        frame_size_ms=20,
    )
    vad_stream = ctx.proc.userdata["vad"].stream()

    async def forward_audio() -> None:
        async for event in audio_stream:
            vad_stream.push_frame(event.frame)

    async def recognize(frames, sequence):
        try:
            await publish_event(ctx, "voice.state", {"state": "transcribing"})
            transcript = await stt.transcribe_frames(frames)
            if sequence != speech_sequence:
                return
            if transcript:
                await publish_event(ctx, "user.transcript", {"text": transcript})
                await interrupt_then_dispatch(transcript)
            else:
                await publish_event(ctx, "voice.state", {"state": "listening"})
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("STT unavailable")
            await publish_event(ctx, "speech.interrupted", {"reason": "stt_unavailable"})
        finally:
            if sequence == speech_sequence:
                discussion.user_speaking = False

    async def process_vad() -> None:
        nonlocal transcription_task, speech_sequence
        async for event in vad_stream:
            if event.type == VADEventType.START_OF_SPEECH:
                speech_sequence += 1
                discussion.user_speaking = True
                if transcription_task and not transcription_task.done():
                    transcription_task.cancel()
                await interrupt()
                await publish_event(ctx, "user.speech_started", {})
            elif event.type == VADEventType.END_OF_SPEECH:
                transcription_task = asyncio.create_task(recognize(list(event.frames), speech_sequence))

    tasks = [asyncio.create_task(forward_audio()), asyncio.create_task(process_vad()), asyncio.create_task(discussion.run())]
    disconnected = asyncio.Event()
    ctx.room.on("participant_disconnected", lambda p: disconnected.set() if p.identity == participant.identity else None)
    ctx.room.on("disconnected", lambda *_: disconnected.set())
    try:
        await disconnected.wait()
    finally:
        pending = [task for task in [*tasks, controller.task, transcription_task] if task]
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        await audio_stream.aclose()
        await vad_stream.aclose()
        audio_source.clear_queue()
        await audio_source.aclose()
        if hasattr(tts, "aclose"):
            await tts.aclose()


if __name__ == "__main__":
    cli.run_app(server)

