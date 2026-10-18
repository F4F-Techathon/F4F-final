"""Exercise the actual console socket; synthesized input never opens a microphone."""
import asyncio
import json
import struct
import sys
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import websockets
import httpx

URL = "ws://127.0.0.1:8771/api/realtime"
report = {"checks": {}, "input": "synthetic audio only; no physical microphone"}

class Client:
    def __init__(self, ws):
        self.ws = ws
        self.events = []
        self.frames = []
    async def send(self, typ, data):
        await self.ws.send(json.dumps({"commandId": uuid.uuid4().hex, "type": typ, "data": data}))
    async def until(self, predicate, timeout=40):
        async with asyncio.timeout(timeout):
            while True:
                raw = await self.ws.recv()
                if isinstance(raw, bytes):
                    size = struct.unpack("<I", raw[:4])[0]
                    item = {"header": json.loads(raw[4:4+size]), "bytes": len(raw)-4-size}
                    self.frames.append(item)
                    if predicate({"type": "binary", "data": item}):
                        return item
                    continue
                item = json.loads(raw); self.events.append(item)
                if item["type"] == "error":
                    raise AssertionError(item)
                if predicate(item):
                    return item

async def main():
    shops = httpx.get("http://127.0.0.1:8771/api/debug/catalog").json()["restaurants"]
    ids = [s["id"] for s in shops[:2]]
    async with websockets.connect(URL, max_size=2**22) as ws:
        c = Client(ws)
        await c.send("session.start", {"restaurantIds": ids, "audioEnabled": False})
        await c.until(lambda e:e["type"]=="state" and e["data"].get("restaurantIds")==ids)
        personas = [e["data"]["persona"] for e in c.events if e["type"]=="trace" and e["data"]["stage"]=="persona.ready"]
        assert len(personas)==2 and personas[0]["systemPrompt"] != personas[1]["systemPrompt"]
        report["checks"]["data_and_dynamic_personas"] = True
        for number in range(2):
            await c.send("control", {"action":"next"})
            end = await c.until(lambda e:e["type"]=="turn" and e["data"]["phase"]=="generated")
            assert end["data"]["restaurantId"] in ids
            if number:
                context = [e for e in c.events if e["type"]=="trace" and e["data"]["stage"]=="agent.context"][-1]
                assert context["data"]["SessionView"]["recentDialogue"][0]["presentation"]=="ended"
                assert "replyTo" in end["data"]
            await c.send("playback", {"turnId":end["data"]["turnId"],"epoch":end["epoch"],"status":"ended"})
            await c.until(lambda e:e["type"]=="state" and e["data"].get("status")=="paused" and e["data"].get("currentTurn") is None)
        report["checks"]["agent_reads_presented_session_state"] = True
        await c.send("control", {"action":"audio","enabled":True})
        await c.send("control", {"action":"next"})
        first = await c.until(lambda e:e["type"]=="binary")
        started = time.perf_counter()
        await c.send("control", {"action":"interrupt"})
        cancelled = await c.until(lambda e:e["type"]=="turn" and e["data"]["phase"]=="cancel")
        report["interruptCommandToCancelMs"] = round((time.perf_counter()-started)*1000,1)
        assert cancelled["data"]["turnId"]==first["header"]["turnId"]
        report["checks"]["actual_tts_pcm_and_interrupt"] = True
        old_epoch = first["header"]["epoch"]
        try:
            async with asyncio.timeout(.45):
                while True:
                    raw = await ws.recv()
                    if isinstance(raw,bytes):
                        n=struct.unpack('<I',raw[:4])[0]
                        assert json.loads(raw[4:4+n])["epoch"]>old_epoch
        except TimeoutError:
            pass
        report["checks"]["no_old_pcm_after_cancel"] = True

    # The speech decoder, VAD, PCM framing and final transcription run server-side.
    from server.providers.windows_tts import WindowsTTS
    import numpy as np
    tts = WindowsTTS()
    audio = bytearray()
    async for pcm, sr in tts.stream("人均预算一百五十元。", "hua"):
        audio.extend(pcm)
    await tts.aclose()
    x=np.frombuffer(audio,dtype='<i2')
    y=np.interp(np.arange(int(len(x)*16000/sr))*sr/16000,np.arange(len(x)),x).astype('<i2').tobytes()
    raw_input=bytes(3200)+y+bytes(32000)
    raw_input+=bytes((-len(raw_input))%640)
    async with websockets.connect(URL,max_size=2**22) as ws:
        c=Client(ws)
        await c.send('session.start',{'restaurantIds':ids,'audioEnabled':True})
        await c.until(lambda e:e['type']=='state' and e['data'].get('restaurantIds')==ids)
        await c.send('mic.start',{'streamId':'synthetic'})
        await c.until(lambda e:e['type']=='state' and e['data'].get('micReady'))
        await c.send('control',{'action':'next'})
        talking = await c.until(lambda e:e['type']=='binary')
        async def feed():
            for i in range(0,len(raw_input),640):
                h=json.dumps({'kind':'mic','streamId':'synthetic','chunkSeq':i//640,'sampleOffset':i//2}).encode()
                await ws.send(struct.pack('<I',len(h))+h+raw_input[i:i+640])
                await asyncio.sleep(.02)
        task=asyncio.create_task(feed())
        transcript=await c.until(lambda e:e['type']=='transcript',timeout=60)
        await task
        report['transcript']=transcript['data']['text']
        assert '150' in report['transcript'] or '一百五十' in report['transcript']
        assert any(e['type']=='turn' and e['data'].get('phase')=='cancel'
                   and e['data'].get('reason')=='vad_speech_started'
                   and e['data']['turnId']==talking['header']['turnId'] for e in c.events)
        report['checks']['vad_barge_in_stops_tts']=True
        await c.send('control',{'action':'pause'})
        await c.send('mic.stop',{})
        report['checks']['synthetic_pcm_vad_stt']=True
    report['passed']=all(report['checks'].values())
    (ROOT/'artifacts/console-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    asyncio.run(main())
