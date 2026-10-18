"""Real LLM/socket validation, without opening a microphone or exposing credentials."""
import asyncio
import json
import struct
import sys
import time
import uuid
from pathlib import Path

import httpx
import websockets

ROOT = Path(__file__).resolve().parents[1]


async def main():
    shops = httpx.get("http://127.0.0.1:8771/api/debug/catalog").json()["restaurants"]
    ids = [s["id"] for s in shops[:3]]
    events = []
    speakers = []
    async with websockets.connect("ws://127.0.0.1:8771/api/realtime", max_size=2**22) as ws:
        async def send(kind, data):
            await ws.send(json.dumps({"commandId": uuid.uuid4().hex, "type": kind, "data": data}))

        async def until(predicate, timeout=90):
            async with asyncio.timeout(timeout):
                while True:
                    raw = await ws.recv()
                    if isinstance(raw, bytes):
                        n = struct.unpack("<I", raw[:4])[0]
                        event = {"type": "pcm", "data": json.loads(raw[4:4+n])}
                        event["data"]["sampleCount"] = (len(raw)-4-n)//2
                    else:
                        event = json.loads(raw)
                    events.append(event)
                    if event["type"] == "error":
                        (ROOT / "artifacts/workflow-failure.json").write_text(json.dumps(events, ensure_ascii=False, indent=2), encoding="utf-8")
                        raise RuntimeError(json.dumps(event["data"], ensure_ascii=False))
                    if predicate(event):
                        return event

        await send("session.start", {"restaurantIds": ids, "audioEnabled": True})
        await until(lambda e: e["type"] == "state" and e["data"].get("restaurantIds") == ids)
        for number in range(2):
            if number:
                await send("control", {"action": "audio", "enabled": False})
            await send("control", {"action": "next"})
            end = await until(lambda e: e["type"] == "turn" and e["data"]["phase"] == "generated")
            speakers.append(end["data"]["restaurantId"])
            tid = end["data"]["turnId"]
            final = [e for e in events if e["type"] == "text" and e["data"]["turnId"] == tid]
            assert len(final) == 1 and final[0]["data"]["phase"] == "done"
            data = final[0]["data"]
            assert data["text"] == "".join(s["text"] for s in data["segments"])
            assert data["speakerId"] == end["data"]["restaurantId"]
            if not number:
                for segment in data["segments"]:
                    frames = [e["data"] for e in events if e["type"] == "pcm" and e["data"]["turnId"] == tid and e["data"]["segmentId"] == segment["segmentId"]]
                    assert frames and all(h["speakerId"] == data["speakerId"] for h in frames)
                    assert frames[0]["sampleOffset"] == segment["audio"]["sampleStart"]
                    assert frames[-1]["sampleOffset"] + frames[-1]["sampleCount"] == segment["audio"]["sampleEnd"]
                assert max(i for i,e in enumerate(events) if e["type"] == "pcm" and e["data"]["turnId"] == tid) < events.index(final[0])
                (ROOT / "artifacts/final-text-contract.json").write_text(json.dumps(final[0],ensure_ascii=False,indent=2),encoding="utf-8")
            played = sum(e["data"]["sampleCount"] for e in events if e["type"] == "pcm" and e["data"]["turnId"] == tid)
            await send("playback", {"turnId": end["data"]["turnId"], "epoch": end["epoch"], "status": "ended", "playedSamples": played})
            await until(lambda e: e["type"] == "state" and e["data"].get("status") == "paused")
        await send("control", {"action": "audio", "enabled": True})
        await send("control", {"action": "next"})
        audio = await until(lambda e: e["type"] == "pcm")
        await send("control", {"action": "interrupt"})
        await until(lambda e: e["type"] == "turn" and e["data"]["phase"] == "cancel")
        await until(lambda e: e["type"] == "state" and e["data"].get("status") == "paused")
        old_epoch = audio["data"]["epoch"]
        assert not any(e["type"] == "text" and e["data"]["turnId"] == audio["data"]["turnId"] for e in events)
        # Also cancel a request while the Coordinator is still calling the model.
        await send("control", {"action": "next"})
        started = await until(lambda e: e["type"] == "workflow" and e["data"]["actor"] == "coordinator" and e["data"]["status"] == "running")
        t0 = time.perf_counter()
        await send("control", {"action": "interrupt"})
        await until(lambda e: e["type"] == "workflow" and e["data"]["runId"] == started["data"]["runId"] and e["data"]["status"] == "cancelled")
        cancel_ms = round((time.perf_counter() - t0) * 1000, 1)
        await until(lambda e: e["type"] == "state" and e["data"].get("status") == "paused")
        assert not any(e["type"] == "pcm" and e["data"]["epoch"] <= old_epoch for e in events[events.index(started):])
    requests = [e["data"] for e in events if e["type"] == "workflow" and e["data"]["status"] == "running" and "systemPrompt" in e["data"]]
    assert len([e for e in requests if e["actor"] == "coordinator"]) == 4
    assert len([e for e in requests if e["actor"] in ids and e["stage"] == "generate"]) == 3
    restaurant_requests = [e for e in requests if e["actor"] in ids and e["stage"] == "generate"]
    assert any(h.get("presentation") == "ended" for h in restaurant_requests[1]["input"]["SessionView"]["recentDialogue"])
    assert all(any(e["type"] == "workflow" and e["data"].get("runId") == r["runId"] and e["data"].get("delta") for e in events) for r in requests[:-1])
    assert not any(e["type"] == "trace" and "fallback" in e["data"]["stage"] for e in events)
    report = {"passed": True, "speakers": speakers, "realModelRequests": len(requests),
              "checks": ["LLM调度与餐厅真实增量", "完整提示词及输入可见", "读取已播放会话", "TTS PCM及打断", "调度请求中打断", "每轮仅一次完整文本JSON", "音频帧与最终segments逐段绑定", "音频中断无半成品最终文本"],
              "planningCancelCommandMs": cancel_ms, "note": "合成本机测试，无实体麦克风；取消时间不代表端到端语音时延"}
    (ROOT / "artifacts/workflow-validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    asyncio.run(main())
