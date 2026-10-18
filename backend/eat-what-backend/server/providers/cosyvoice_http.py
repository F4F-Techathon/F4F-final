"""Cancellable PCM client for the isolated local CosyVoice process."""
import httpx


class CosyVoiceHTTP:
    name = 'cosyvoice3-local'
    sample_rate = 24000
    # Synthesis runs near real time on a laptop GPU. realtime_console then sends one request per sentence (intonation
    # across commas, start-up cost paid once) and holds each sentence back until it can play through without gaps.
    whole_sentences = True

    def __init__(self, base_url='http://127.0.0.1:8772', stream=True):
        self.base_url = base_url.rstrip('/')
        self.stream_mode = stream

    async def stream(self, text, voice):
        # Closing the response on cancellation tells the service to end token
        # generation; no stale PCM can continue into a later epoch.
        async with httpx.AsyncClient(trust_env=False, timeout=httpx.Timeout(120, connect=5)) as client:
            async with client.stream('POST', self.base_url + '/tts', json={'text': text, 'voice': voice, 'stream': self.stream_mode}) as response:
                response.raise_for_status()
                sr = int(response.headers.get('X-Sample-Rate', 24000))
                pending = b''
                async for data in response.aiter_bytes():
                    pending += data
                    while len(pending) >= 960:
                        yield pending[:960], sr
                        pending = pending[960:]
                if len(pending) % 2:
                    raise RuntimeError('CosyVoice returned an incomplete PCM sample')
                if pending:
                    yield pending, sr
