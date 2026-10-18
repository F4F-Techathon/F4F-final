"""Manage only the F-drive local CosyVoice service (127.0.0.1:8772)."""
import argparse
import json
import subprocess
import time
from pathlib import Path

import httpx
import psutil

ROOT = Path(__file__).resolve().parents[1]
RECORD = ROOT / 'runtime/cosyvoice-service.json'
action = argparse.ArgumentParser()
action.add_argument('action', choices=['start', 'stop', 'restart', 'status'], default='status', nargs='?')
action = action.parse_args().action


def process():
    if RECORD.exists():
        data = json.loads(RECORD.read_text())
        try:
            p = psutil.Process(data['pid'])
            if abs(p.create_time() - data['created']) < 1 and Path(p.cwd()).resolve() == ROOT and any('cosyvoice_service.py' in s for s in p.cmdline()):
                return p
        except (KeyError, psutil.Error):
            pass
    # A Windows venv redirector may change its own cwd and launch a child.
    # Recover only processes with our exact script argument and an F-drive exe.
    for p in psutil.process_iter():
        try:
            args = p.cmdline()
            if (str(ROOT / 'scripts/cosyvoice_service.py') in args
                    and Path(p.exe()).is_relative_to(ROOT / 'runtime')):
                return p
        except (psutil.Error, ValueError):
            pass


if action in ('stop', 'restart'):
    p = process()
    while p:
        children = p.children(recursive=True)
        for child in children:
            try:
                args = child.cmdline()
                if str(ROOT / 'scripts/cosyvoice_service.py') in args and Path(child.exe()).is_relative_to(ROOT / 'runtime'):
                    child.terminate()
            except psutil.Error:
                pass
        p.terminate()
        p.wait(timeout=8)
        p = process()
    RECORD.write_text('{}')
if action in ('start', 'restart') and not process():
    with (ROOT / 'runtime/logs/cosyvoice.log').open('ab') as log:
        p = subprocess.Popen([str(ROOT / 'runtime/cosyvoice-env/Scripts/python.exe'), '-u', str(ROOT / 'scripts/cosyvoice_service.py')],
                             cwd=ROOT, stdout=log, stderr=subprocess.STDOUT,
                             creationflags=subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP)
    RECORD.write_text(json.dumps({'pid': p.pid, 'created': psutil.Process(p.pid).create_time()}))
if action != 'stop':
    if action in ('start', 'restart'):
        for _ in range(80):
            try:
                if httpx.get('http://127.0.0.1:8772/health', trust_env=False, timeout=1).json().get('ready'):
                    break
            except httpx.HTTPError:
                pass
            if not process():
                break
            time.sleep(.5)
    try:
        print(json.dumps(httpx.get('http://127.0.0.1:8772/health', trust_env=False, timeout=2).json()))
    except httpx.HTTPError:
        print(json.dumps({'running': bool(process()), 'ready': False, 'log': str(ROOT / 'runtime/logs/cosyvoice.log')}))
