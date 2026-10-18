"""Download the official inference model to F, checking ModelScope SHA256."""
import concurrent.futures
import hashlib
import json
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'runtime/CosyVoice/pretrained_models/Fun-CosyVoice3-0.5B'
REPO = 'FunAudioLLM/Fun-CosyVoice3-0.5B-2512'
sys.stdout.reconfigure(encoding='utf-8')
DEST.mkdir(parents=True, exist_ok=True)


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(8 * 1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def download(item):
    path = DEST / item['Path']
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.stat().st_size == item['Size'] and digest(path) == item['Sha256']:
        print('Verified existing ' + item['Path'], flush=True)
        return
    partial = path.with_name(path.name + '.part')
    for attempt in range(4):
        try:
            with httpx.Client(trust_env=False, follow_redirects=True, timeout=120) as client:
                url = f'https://modelscope.cn/models/{REPO}/resolve/master/{item["Path"]}'
                with client.stream('GET', url) as response:
                    response.raise_for_status()
                    with partial.open('wb') as f:
                        for chunk in response.iter_bytes(4 * 1024 * 1024):
                            f.write(chunk)
                if partial.stat().st_size != item['Size'] or digest(partial) != item['Sha256']:
                    raise ValueError('Checksum/size mismatch: ' + item['Path'])
                partial.replace(path)
                print('Verified ' + item['Path'], flush=True)
                return
        except Exception as exc:
            print(f'Retry {attempt + 1}: {item["Path"]}: {type(exc).__name__}', flush=True)
            if attempt == 3:
                raise
            time.sleep(2)


with httpx.Client(trust_env=False, timeout=40) as client:
    result = client.get(f'https://modelscope.cn/api/v1/models/{REPO}/repo/files', params={'Revision': 'master', 'Recursive': 'true'})
    result.raise_for_status()
    files = [f for f in result.json()['Data']['Files'] if f['Type'] == 'blob'
             and f['Path'] not in {'llm.rl.pt', 'flow.decoder.estimator.fp32.onnx', 'speech_tokenizer_v3.batch.onnx'}
             and not f['Path'].startswith('asset/')]
print(f'Downloading {sum(f["Size"] for f in files)/1024**3:.2f} GiB to {DEST}', flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    list(pool.map(download, files))
(DEST / 'download-manifest.json').write_text(json.dumps({'repository': REPO, 'files': files}, indent=2), encoding='utf-8')
print('Model download and SHA256 verification complete.', flush=True)
