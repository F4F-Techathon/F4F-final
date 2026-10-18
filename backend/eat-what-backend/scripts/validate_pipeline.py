"""Real LLM/TTS with a simulated playback sink, never the physical microphone."""
import asyncio
import argparse
import json
import struct
import sys
import uuid
from pathlib import Path

import httpx
import websockets

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--user-barge-in', action='store_true', help='send a new user.text while audio and prefetch are active')
args = parser.parse_args()


async def main():
    ids = [s["id"] for s in httpx.get("http://127.0.0.1:8771/api/debug/catalog").json()["restaurants"][:3]]
    events, samples = [], {}
    async with websockets.connect("ws://127.0.0.1:8771/api/realtime", max_size=2**22) as ws:
        async def send(kind, data):
            await ws.send(json.dumps({"type": kind, "commandId": uuid.uuid4().hex, "data": data}))
        async def until(predicate, timeout=90):
            async with asyncio.timeout(timeout):
                while True:
                    raw = await ws.recv()
                    if isinstance(raw, bytes):
                        n = struct.unpack("<I", raw[:4])[0]
                        data = json.loads(raw[4:4+n])
                        samples[data["turnId"]] = data["sampleOffset"] + (len(raw)-4-n)//2
                        event = {"type": "pcm", "epoch": data["epoch"], "data": data}
                    else:
                        event = json.loads(raw)
                    events.append(event)
                    if event["type"] == "error":
                        (ROOT/"artifacts/pipeline-failure.json").write_text(json.dumps(events,ensure_ascii=False,indent=2),encoding="utf-8")
                        raise RuntimeError(event["data"])
                    if predicate(event):
                        return event
        await send("session.start", {"restaurantIds": ids, "audioEnabled": True})
        await until(lambda e: e["type"] == "state" and e["data"].get("restaurantIds") == ids)
        await send("control", {"action": "resume"})
        first_pcm = await until(lambda e: e["type"] == "pcm")
        first_tid = first_pcm["data"]["turnId"]
        prefetch = await until(lambda e: e["type"] == "workflow" and e["data"]["stage"] == "prefetch" and e["data"]["status"] == "running")
        assert not any(e["type"] == "audio" and e["data"]["phase"] == "end" for e in events)
        first_end = await until(lambda e: e["type"] == "turn" and e["data"]["phase"] == "generated")
        await send("playback", {"turnId": first_tid, "epoch": first_end["epoch"], "status": "ended", "playedSamples": samples[first_tid]})
        adopted = await until(lambda e: e["type"] == "workflow" and e["data"]["stage"] == "prefetch" and e["data"]["status"] == "completed")
        second_pcm = await until(lambda e: e["type"] == "pcm" and e["data"]["turnId"] != first_tid)
        second_tid, old_epoch = second_pcm["data"]["turnId"], second_pcm["epoch"]
        await send("playback", {"turnId": second_tid, "epoch": old_epoch, "status": "progress", "playedSamples": 240})
        ready = await until(lambda e: e["type"] == "workflow" and e["data"]["stage"] == "prefetch" and e["data"]["status"] == "waiting" and e["data"]["runId"] != prefetch["data"]["runId"])
        queued_tid = ready["data"]["output"]["nextTurnId"]
        user_input = '等等，人均预算改成50元，别一直聊价格，讲讲服务。' if args.user_barge_in else '人均预算50元'
        if args.user_barge_in:
            await send('user.text', {'text': user_input})
        else:
            await send("control", {"action": "interrupt"})
        await until(lambda e: e["type"] == "turn" and e["data"]["phase"] == "cancel" and e["data"]["turnId"] == second_tid)
        await send("playback", {"turnId": second_tid, "epoch": old_epoch, "status": "interrupted", "playedSamples": 240})
        await until(lambda e: e["type"] == "trace" and e["data"]["stage"] == "playback.ack" and e["data"].get("status") == "interrupted")
        if not args.user_barge_in:
            await send("user.text", {"text": user_input})
        context = await until(lambda e: e["type"] == "trace" and e["data"]["stage"] == "agent.context" and e["data"]["SessionView"]["preferences"].get("maxBudget") == 50)
        history = context["data"]["SessionView"]["recentDialogue"]
        partial = next(h for h in history if h.get("turnId") == second_tid)
        assert partial["text"] == "" and partial["partialAudio"]["textAvailable"] is False
        assert all(h.get("turnId") != queued_tid for h in history)
        assert not context["data"]["SessionView"].get("pendingPlayback")
        assert not any(e["type"] == "turn" and e["data"]["phase"] == "start" and e["data"]["turnId"] == queued_tid for e in events)
        assert not any(e["type"] == "text" and e["data"]["turnId"] == second_tid for e in events)
        await send("control", {"action": "pause"})
        await until(lambda e: e["type"] == "state" and e["data"].get("status") == "paused")
    report = {"passed": True, "input": "simulated audio-output playback acknowledgements; no physical microphone",
              'userInput': user_input, 'directUserBargeIn': args.user_barge_in,
              "checks": ["当前音频结束前已开始预调度", "完成回执后采用预生成", "打断丢弃已准备好的未来回合", "旧epoch停止回执仅更新已听历史", "当前未播完小分句不进入文本历史", "新用户输入重新生成且无未来历史污染"],
              "firstTurnId": first_tid, "interruptedTurnId": second_tid, "discardedTurnId": queued_tid, "heardPartial": partial}
    name = 'user-barge-in-validation.json' if args.user_barge_in else 'pipeline-validation.json'
    (ROOT/'artifacts'/name).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    asyncio.run(main())
