"""Exercise the actual local GPU TTS stream, saving WAVs and cancel metrics."""
import asyncio
import json
import math
import struct
import sys
import time
import wave
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server.providers.cosyvoice_http import CosyVoiceHTTP


async def main():
    client = CosyVoiceHTTP()
    results = []
    examples = [('rong', '你好，我是阿乐，聚聚乐这边我来招呼。先坐，咱们边吃边聊。'),
                ('hua', 'Hello，我是上校，肯德基的。先别忙着争，吃顿饭也得痛快点。'),
                ('pierre', '侬好，我是阿甬，甬悦柒鲜的。先坐一坐，慢慢聊。')]
    for voice, text in examples:
        start, first, pieces = time.perf_counter(), None, []
        async for pcm, sr in client.stream(text, voice):
            if first is None:
                first = time.perf_counter() - start
            pieces.append(pcm)
        audio = b''.join(pieces)
        assert sr == 24000 and len(pieces) > 10
        values = struct.unpack('<' + 'h' * (len(audio)//2), audio)
        rms = math.sqrt(sum(x*x for x in values) / len(values))
        assert rms > 20, 'silent output'
        path = ROOT / f'artifacts/cosyvoice-{voice}.wav'
        with wave.open(str(path), 'wb') as wav:
            wav.setparams((1, 2, sr, 0, 'NONE', 'not compressed'))
            wav.writeframes(audio)
        results.append({'voice': voice, 'text': text, 'file': str(path), 'chunks': len(pieces),
                        'duration': len(audio)/2/sr, 'firstAudioSeconds': first,
                        'totalSeconds': time.perf_counter() - start, 'rms': rms})
        print(json.dumps(results[-1], ensure_ascii=False), flush=True)
    async with httpx.AsyncClient(trust_env=False) as http:
        before = (await http.get('http://127.0.0.1:8772/health')).json()
    stream = client.stream('这是一段用来检查打断的测试语音。' * 15, 'rong')
    await anext(stream)
    await stream.aclose()
    async with httpx.AsyncClient(trust_env=False) as http:
        for _ in range(80):
            after = (await http.get('http://127.0.0.1:8772/health')).json()
            if after['cancelled'] > before['cancelled']:
                break
            await asyncio.sleep(.25)
        else:
            raise AssertionError('cancelled request did not end')
    report = {'passed': True, 'cuda': after['cuda'], 'samples': results, 'cancellationConfirmed': True}
    (ROOT / 'artifacts/cosyvoice-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('CosyVoice real audio and cancellation checks passed.', flush=True)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    asyncio.run(main())
