"""Local CosyVoice 3 GPU service, isolated from the demo's Python runtime.

Devices (COSYVOICE_DEVICE): auto picks CUDA when present (the delivered NVIDIA route, unchanged: fp16 on the GPU),
otherwise Apple Silicon's GPU through MPS, otherwise CPU. On MPS the LLM and the flow model run on the GPU while the
HiFT vocoder stays on the CPU: its F0 predictor computes in float64, which MPS does not support.
COSYVOICE_DIR (code) and COSYVOICE_MODEL_DIR (weights) let an existing local install be reused as is.
"""
import asyncio
import os
import queue
import sys
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Caches live in the project runtime unless the environment already points somewhere (e.g. a wetext
# frontend another local install has downloaded into ~/.cache/modelscope).
for key, suffix in {'HF_HOME': 'cache/huggingface', 'TORCH_HOME': 'cache/torch',
                    'MODELSCOPE_CACHE': 'cache/modelscope', 'XDG_CACHE_HOME': 'cache/xdg',
                    'TEMP': 'tmp', 'TMP': 'tmp', 'MPLCONFIGDIR': 'cache/matplotlib',
                    'NUMBA_CACHE_DIR': 'cache/numba'}.items():
    if os.environ.get(key):
        continue
    folder = ROOT / 'runtime' / suffix
    folder.mkdir(parents=True, exist_ok=True)
    os.environ[key] = str(folder)
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TOKENIZERS_PARALLELISM'] = 'false'
# Ops MPS lacks fall back to the CPU instead of failing the request.
os.environ.setdefault('PYTORCH_ENABLE_MPS_FALLBACK', '1')
CODE_DIR = (ROOT / os.path.expanduser(os.getenv('COSYVOICE_DIR', 'runtime/CosyVoice'))).resolve()
MODEL_DIR = (ROOT / os.path.expanduser(os.getenv('COSYVOICE_MODEL_DIR', str(CODE_DIR / 'pretrained_models/Fun-CosyVoice3-0.5B')))).resolve()
sys.path[:0] = [str(CODE_DIR), str(CODE_DIR / 'third_party/Matcha-TTS')]

import numpy as np
import torch
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from cosyvoice.cli.cosyvoice import AutoModel

model = None
device = 'cpu'
gpu_lock = threading.Lock()
active_stop = None
stats = {'completed': 0, 'cancelled': 0}
PROMPT = 'You are a helpful assistant.<|endofprompt|>您好，欢迎光临！今天的招牌菜特别新鲜，快坐下来尝一尝吧。'
VOICES = {'rong': 'f_mid.wav', 'hua': 'm_mid.wav', 'pierre': 'm_fr.wav'}


def pick_device():
    wanted = os.getenv('COSYVOICE_DEVICE', 'auto').strip().lower()
    if wanted == 'auto':
        return 'cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu'
    if wanted == 'cuda' and not torch.cuda.is_available() or wanted == 'mps' and not torch.backends.mps.is_available():
        raise RuntimeError(f'COSYVOICE_DEVICE={wanted} is not available on this machine')
    return wanted


def move_to_mps(inner):
    """LLM and flow on Apple's GPU; the vocoder stays on the CPU (float64 F0 predictor)."""
    inner.device = torch.device('mps')
    inner.llm.to(inner.device)
    inner.flow.to(inner.device)
    vocode = inner.hift.inference
    # CosyVoice 2 passes (speech_feat, cache_source), CosyVoice 3 (speech_feat, finalize): move whatever tensors
    # arrive to the CPU and leave the rest as given.
    def cpu_vocoder(*args, **kwargs):
        cpu = lambda value: value.to('cpu', torch.float32) if torch.is_tensor(value) and value.is_floating_point() else value.to('cpu') if torch.is_tensor(value) else value
        return vocode(*[cpu(v) for v in args], **{k: cpu(v) for k, v in kwargs.items()})
    inner.hift.inference = cpu_vocoder


@asynccontextmanager
async def lifespan(app):
    global model, device
    device = pick_device()
    torch.set_num_threads(int(os.getenv('COSYVOICE_THREADS', '4')))
    # fp16 is a CUDA option upstream; MPS and CPU keep fp32.
    model = AutoModel(model_dir=str(MODEL_DIR), fp16=device == 'cuda' and os.getenv('COSY_FP16', '1') == '1')
    if device == 'mps':
        move_to_mps(model.model)
    # Upstream inference runs token generation in its own thread. End it at the
    # next token on disconnect, then let its normal finalization clean caches.
    original = model.model.llm.inference
    def cancellable_inference(*args, **kwargs):
        stop = active_stop
        source = original(*args, **kwargs)
        try:
            for token in source:
                if stop is not None and stop.is_set():
                    break
                yield token
        finally:
            source.close()
    model.model.llm.inference = cancellable_inference
    for voice, filename in VOICES.items():
        model.add_zero_shot_spk(PROMPT, str(ROOT / 'voices' / filename), voice)
    if device != 'cuda' and os.getenv('COSYVOICE_WARMUP', '1') == '1':
        # The first request on MPS/CPU pays kernel set-up; pay it before anyone listens.
        for _ in model.inference_zero_shot('你好。', '', '', zero_shot_spk_id='rong', stream=False, text_frontend=False):
            pass
    print(f'CosyVoice 3 ready: device={device} GPU={torch.cuda.is_available() or device == "mps"}', flush=True)
    yield


app = FastAPI(lifespan=lifespan)


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=600)
    voice: str = 'rong'
    # Non-streaming synthesizes the whole text in one pass: no per-hop flow recompute, so faster overall, but the
    # first PCM arrives only when all of it is ready.
    stream: bool = True


@app.get('/health')
def health():
    return {'ready': model is not None, 'provider': 'cosyvoice3-local', 'sampleRate': 24000,
            'cuda': torch.cuda.is_available(), 'device': device, 'modelDirectory': str(MODEL_DIR),
            'voices': list(VOICES), 'busy': gpu_lock.locked(), **stats}


@app.post('/tts')
async def tts(body: SpeechRequest, request: Request):
    packets, stop = queue.Queue(maxsize=8), threading.Event()
    def put(value):
        while not stop.is_set():
            try:
                packets.put(value, timeout=.1)
                return
            except queue.Full:
                pass
    def synthesize():
        global active_stop
        while not gpu_lock.acquire(timeout=.1):
            if stop.is_set():
                return
        try:
            if stop.is_set():
                return
            active_stop = stop
            model.model.token_hop_len = 25
            for item in model.inference_zero_shot(body.text, '', '',
                       zero_shot_spk_id=body.voice if body.voice in VOICES else 'rong', stream=body.stream, text_frontend=False):
                if not stop.is_set():
                    audio = item['tts_speech'].squeeze(0).float().cpu().numpy()
                    pcm = (np.clip(audio, -1, 1) * 32767).astype('<i2').tobytes()
                    for start in range(0, len(pcm), 960):
                        put(pcm[start:start + 960])
        except BaseException as exc:
            put(exc)
        finally:
            stats['cancelled' if stop.is_set() else 'completed'] += 1
            active_stop = None
            gpu_lock.release()
            put(None)
    async def stream():
        worker = threading.Thread(target=synthesize, daemon=True)
        worker.start()
        try:
            while True:
                try:
                    packet = await asyncio.to_thread(packets.get, True, .5)
                except queue.Empty:
                    if await request.is_disconnected():
                        break
                    continue
                if packet is None:
                    break
                if isinstance(packet, BaseException):
                    raise RuntimeError('CosyVoice synthesis failed') from packet
                yield packet
        finally:
            stop.set()
    return StreamingResponse(stream(), media_type='application/octet-stream', headers={
        'X-Sample-Rate': '24000', 'X-Audio-Format': 'pcm_s16le', 'X-Audio-Channels': '1'})


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host=os.getenv('COSYVOICE_HOST', '127.0.0.1'), port=int(os.getenv('COSYVOICE_PORT', '8772')), log_level='info')
