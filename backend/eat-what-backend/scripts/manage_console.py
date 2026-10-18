"""Manage only the isolated workbench HTTP process on localhost:8771."""
import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import httpx
import psutil

ROOT = Path(__file__).resolve().parents[1]
RECORD = ROOT / "runtime/console-service.json"
parser = argparse.ArgumentParser()
parser.add_argument("action", choices=["start", "stop", "restart", "status"], nargs="?", default="start")
action = parser.parse_args().action

def process():
    if RECORD.exists():
        item = json.loads(RECORD.read_text())
        if not item.get("pid"):
            return None
        try:
            p = psutil.Process(item["pid"])
            if abs(p.create_time() - item["created"]) < 1 and Path(p.cwd()).resolve() == ROOT and "8771" in p.cmdline():
                return p
        except psutil.Error:
            pass

if action in {"stop", "restart"}:
    p = process()
    if p:
        for child in p.children(recursive=True):
            with __import__('contextlib').suppress(psutil.NoSuchProcess):
                child.terminate()
        p.terminate()
        psutil.wait_procs([p], timeout=5)
    RECORD.write_text("{}")
if action in {"start", "restart"} and not process():
    from server.config import settings
    if settings.tts_provider == 'cosyvoice-http':
        subprocess.run([str(ROOT / 'runtime/tools/python/python.exe'), str(ROOT / 'scripts/manage_cosyvoice.py'), 'start'], cwd=ROOT, check=True)
    with (ROOT / "runtime/logs/console.log").open("ab") as log:
        p = subprocess.Popen([str(ROOT / "runtime/tools/python/python.exe"), "-m", "uvicorn", "server.app:app", "--host", "127.0.0.1", "--port", "8771"],
                             cwd=ROOT, stdout=log, stderr=subprocess.STDOUT,
                             env={**os.environ, 'PYTHONUTF8': '1', 'PYTHONIOENCODING': 'utf-8'},
                             creationflags=subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP)
    RECORD.write_text(json.dumps({"pid": p.pid, "created": psutil.Process(p.pid).create_time()}))
    for _ in range(30):
        try:
            response = httpx.get("http://127.0.0.1:8771/api/debug/catalog", timeout=1)
            if response.status_code == 200:
                break
        except httpx.HTTPError:
            pass
        time.sleep(.4)
    else:
        raise SystemExit("Console not ready; check runtime/logs/console.log")
if action != "stop":
    print("http://127.0.0.1:8771/console.html" if process() else "Console stopped")
