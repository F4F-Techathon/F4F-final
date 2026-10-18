from __future__ import annotations

import secrets
import asyncio
import time
from datetime import timedelta
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .config import ROOT, RUNTIME, settings
from .data import RestaurantRepository
from .orchestrator import MultiAgentOrchestrator
from .providers.llm import make_llm
from .store import SessionStore


repo = RestaurantRepository(settings.data_path)
store = SessionStore(settings.database_path, repo.ordered_ids())
llm = make_llm(settings) if settings.llm_ready else None
orchestrator = MultiAgentOrchestrator(repo, store, llm, runtime_mode="demo")

app = FastAPI(title="Tonight Eats", version="0.1.0")
from .realtime_console import router as console_router
app.include_router(console_router)
dispatch_locks: dict[str, asyncio.Lock] = {}


class TurnRequest(BaseModel):
    session_id: str = Field(default="demo", min_length=1, max_length=80)
    text: str = Field(min_length=1, max_length=600)


class ResetRequest(BaseModel):
    session_id: str = Field(default="demo", min_length=1, max_length=80)


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "livekit": settings.livekit_ready,
        "llm": settings.llm_ready,
        "llmModel": settings.llm_model if settings.llm_ready else None,
        "data": len(repo.restaurants),
    }


@app.get("/api/config")
def client_config():
    return {
        "appName": settings.app_name,
        "livekitConfigured": settings.livekit_ready,
        "llmConfigured": settings.llm_ready,
        "llmModel": settings.llm_model if settings.llm_ready else "rule-fallback",
        "eventTopic": "orchestrator",
        "ttsProvider": settings.tts_provider,
        "voiceEnabled": settings.livekit_ready,
    }


@app.get("/api/session/bootstrap")
def bootstrap(session_id: str = Query(default="demo", min_length=1, max_length=80)):
    state = store.get(session_id)
    return {"snapshot": orchestrator.snapshot(state), "config": client_config()}


@app.post("/api/demo/turn")
async def demo_turn(request: TurnRequest):
    try:
        result = await orchestrator.handle(request.session_id, request.text)
        return result.public(orchestrator.snapshot(result.state))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/session/reset")
def reset_session(request: ResetRequest):
    state = store.reset(request.session_id)
    return {"snapshot": orchestrator.snapshot(state)}


@app.get("/api/evidence/{evidence_id}")
def get_evidence(evidence_id: str):
    evidence = repo.evidence.get(evidence_id)
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")
    restaurant = repo.get(evidence.restaurant_id)
    return {"evidence": evidence.public(include_source=True), "restaurant": restaurant.public()}


@app.get("/api/livekit/token")
def livekit_token(
    room: str = Query(default="restaurant-demo", min_length=1, max_length=80),
    identity: str | None = Query(default=None, max_length=80),
):
    if not settings.livekit_ready:
        raise HTTPException(status_code=503, detail="LiveKit is not configured; use demo mode")
    try:
        from livekit import api
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="Install requirements-livekit.txt") from exc
    participant_identity = identity or f"guest-{secrets.token_hex(4)}"
    token = (
        api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(participant_identity)
        .with_name("现场用户")
        .with_grants(api.VideoGrants(room_join=True, room=room, can_publish=True, can_subscribe=True, can_publish_data=True))
        .with_ttl(timedelta(hours=1))
        .with_room_config(api.RoomConfiguration(agents=[api.RoomAgentDispatch(agent_name=settings.livekit_agent_name)]))
        .to_jwt()
    )
    return {"url": settings.livekit_url, "token": token, "room": room, "identity": participant_identity, "expiresAt": int(time.time()) + 3600}


@app.get("/api/voice/status")
def voice_status():
    import json
    import os
    worker = {"ready": False}
    try:
        worker = json.loads((RUNTIME / "voice-status.json").read_text(encoding="utf-8"))
        import psutil
        worker["running"] = psutil.pid_exists(worker.get("pid", 0))
        if not worker["running"]:
            worker["ready"] = False
    except (OSError, ValueError, ImportError):
        pass
    return {"configured": settings.livekit_ready, "worker": worker,
            "ttsProvider": settings.tts_provider, "sttDevice": settings.whisper_device,
            "modelDownloaded": (Path(settings.whisper_model) / "model.bin").is_file()}


@app.post("/api/livekit/ensure-agent")
async def ensure_agent(request: ResetRequest):
    """Recover a room created while its named worker was temporarily offline."""
    if not settings.livekit_ready:
        raise HTTPException(status_code=503, detail="LiveKit is not configured")
    from livekit import api
    room = request.session_id
    async with dispatch_locks.setdefault(room, asyncio.Lock()):
        try:
            async with api.LiveKitAPI(settings.livekit_url, settings.livekit_api_key, settings.livekit_api_secret) as client:
                dispatches = await client.agent_dispatch.list_dispatch(room)
                named = [item for item in dispatches if item.agent_name == settings.livekit_agent_name]
                if any(job.state.status in (api.JobStatus.JS_PENDING, api.JobStatus.JS_RUNNING)
                       for item in named for job in item.state.jobs):
                    return {"state": "running"}
                # Allow a just-created dispatch time to be assigned before retrying.
                if any(time.time() - item.state.created_at / 1e9 < 4 for item in named):
                    return {"state": "starting"}
                result = await client.agent_dispatch.create_dispatch(api.CreateAgentDispatchRequest(
                    agent_name=settings.livekit_agent_name, room=room))
                return {"state": "starting", "dispatchId": result.id}
        except Exception as exc:
            raise HTTPException(status_code=503, detail="语音后台暂未连接，请稍后重试") from exc


web_dir = ROOT / "web"
app.mount("/assets", StaticFiles(directory=web_dir), name="assets")


@app.get("/")
def index():
    return FileResponse(web_dir / "index.html")


@app.get("/{path:path}")
def spa_fallback(path: str):
    candidate = (web_dir / path).resolve()
    if candidate.is_file() and web_dir.resolve() in candidate.parents:
        return FileResponse(candidate)
    return FileResponse(web_dir / "index.html")

