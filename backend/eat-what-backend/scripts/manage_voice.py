"""Start/stop project-owned local services. All files stay under the project drive."""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server.config import RUNTIME
import httpx
import psutil

PYTHON = RUNTIME / "tools/python/python.exe"
RECORD = RUNTIME / "services.json"


def owned(process):
    try:
        return Path(process.cwd()).resolve() in {ROOT, RUNTIME} and (
            str(ROOT).lower() in process.exe().lower()
            or "server.app:app" in " ".join(process.cmdline()))
    except (psutil.Error, OSError):
        return False


def stop_process(process):
    if not owned(process):
        raise RuntimeError("Refusing to stop a process outside this project")
    children = process.children(recursive=True)
    for child in reversed(children):
        try:
            child.terminate()
        except psutil.NoSuchProcess:
            pass
    process.terminate()
    psutil.wait_procs([process, *children], timeout=5)


def stop():
    records = json.loads(RECORD.read_text()) if RECORD.exists() else {}
    for record in records.values():
        try:
            process = psutil.Process(record["pid"])
            if abs(process.create_time() - record["created"]) < 1:
                stop_process(process)
        except psutil.NoSuchProcess:
            pass
    # Adopt and stop the project's previous text-demo/LiveKit processes only.
    for connection in psutil.net_connections(kind="tcp"):
        if connection.status == "LISTEN" and connection.laddr.port in {8770, 7880} and connection.pid:
            process = psutil.Process(connection.pid)
            if owned(process):
                stop_process(process)
    RECORD.write_text("{}", encoding="utf-8")


def start():
    if RECORD.exists():
        records = json.loads(RECORD.read_text())
        if len(records) == 3 and all(psutil.pid_exists(item["pid"]) for item in records.values()):
            print("Voice services already running: http://127.0.0.1:8770", flush=True)
            return
    stop()
    (RUNTIME / "logs").mkdir(exist_ok=True)
    records = {}
    commands = {
        "livekit": [str(RUNTIME / "tools/livekit/livekit-server.exe"), "--dev", "--bind", "127.0.0.1", "--node-ip", "127.0.0.1"],
        "web": [str(PYTHON), "-m", "uvicorn", "server.app:app", "--host", "127.0.0.1", "--port", "8770"],
        "worker": [str(PYTHON), "-m", "server.livekit_worker", "start"],
    }
    for name, command in commands.items():
        with (RUNTIME / "logs" / f"{name}.log").open("ab") as output:
            process = subprocess.Popen(command, cwd=ROOT, stdout=output, stderr=subprocess.STDOUT,
                                       creationflags=subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP)
        records[name] = {"pid": process.pid, "created": psutil.Process(process.pid).create_time()}
        RECORD.write_text(json.dumps(records, indent=2), encoding="utf-8")
        print(f"Started {name}: PID {process.pid}", flush=True)
    for _ in range(90):
        if any(not psutil.pid_exists(item["pid"]) for item in records.values()):
            raise RuntimeError("A service exited. Check runtime/logs/*.log")
        try:
            result = httpx.get("http://127.0.0.1:8770/api/voice/status", timeout=2).json()
            if result["worker"].get("ready"):
                print("VOICE READY: http://127.0.0.1:8770", flush=True)
                return
        except (httpx.HTTPError, ValueError, KeyError):
            pass
        time.sleep(1)
    raise RuntimeError("Voice worker did not become ready. Check runtime/logs/worker.log")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["start", "stop", "restart", "status"], default="start", nargs="?")
    action = parser.parse_args().action
    if action in {"stop", "restart"}:
        stop()
    if action in {"start", "restart"}:
        start()
    if action == "status":
        print(httpx.get("http://127.0.0.1:8770/api/voice/status").text)
