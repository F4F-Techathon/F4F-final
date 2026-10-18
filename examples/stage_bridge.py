#!/usr/bin/env python3
"""多智能体后端接入舞台的最小示例（Python 3.8+，只用标准库）。

Same behaviour as examples/stage-bridge.mjs, for frameworks written in Python. It plays the "console" role on the
stage relay, like the test console (/director/):
  - subscribes to GET /api/stage/events?role=console (Server-Sent Events) for what the phone reports:
    snapshot (page and cast), line-state (each line's progress), decision (how Jev staged it),
    user-line (the customer cut in by voice), agent (each generated host's profile);
  - posts lines to POST /api/stage/send as {"from": "console", "message": {"kind": "line", ...}}.
The phone decides how every line is performed; this side only decides who says what. Replace the two functions
under "The brain" with your multi-agent framework; the plumbing stays.

Usage: python3 examples/stage_bridge.py [--base http://localhost:3000] [--once] [--quiet]
"""
from __future__ import annotations

import argparse
import json
import os
import random
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

TEXT_MAX, TOPIC_MAX = 600, 40
LINE_TIMEOUT_S = float(os.environ.get("LINE_TIMEOUT_MS", "180000")) / 1000


# ── The brain: who says what. Swap these for your agents; each returns the lines to perform, in order. ──
# `cast` is the phone's line-up on stage: [{"id", "name", "restaurant", "greeting", "evidenceIds", "kind", ...}].
# A line is {"speaker", "text", "topic"?, "replyTo"?, "evidenceIds"?}; speaker is a cast id or "host" (the Orb).

def opening_lines(cast: list[dict]) -> list[dict]:
    lines = [{"speaker": "host", "topic": "开场", "text": f"欢迎来到今晚的饭局！{len(cast)} 位选手来争取你的一票，先请各位自我介绍。"}]
    for member in cast:
        lines.append({
            "speaker": member["id"],
            "topic": "自我介绍",
            "text": member.get("greeting") or f"我是{member['name']}，{member['restaurant']}欢迎你！",
            # The evidence ids the phone listed for this host; the first one is the shop's own facts.
            "evidenceIds": (member.get("evidenceIds") or [])[:1],
        })
    return lines


def replies_to_customer(text: str, cast: list[dict], user_line_id: str) -> list[dict]:
    lines = [{"speaker": "host", "topic": "回应顾客", "replyTo": [user_line_id], "text": f"收到！你说「{text[:40]}」，各位怎么看？"}]
    if cast:
        first = cast[0]
        lines.append({"speaker": first["id"], "topic": "回应顾客", "replyTo": [user_line_id], "text": f"这个要求{first['restaurant']}接得住，来我们家准没错！"})
    return lines


# ── Plumbing: the relay connection, sending, and pacing on the phone's reports. ──

class Bridge:
    def __init__(self, base: str, once: bool, quiet: bool):
        self.base, self.once, self.quiet = base.rstrip("/"), once, quiet
        self.snapshot: dict | None = None
        self.opened = False
        self.generation = 0  # a new round (the customer cut in) stops the rounds before it
        self.lock = threading.Lock()
        self.waiters: dict[str, tuple[threading.Event, dict]] = {}  # line id → (event, final state)
        self.names = {"host": "主持人 Orb", "user": "顾客"}
        self.stopped = threading.Event()

    def log(self, text: str) -> None:
        if not self.quiet:
            print(text, flush=True)

    def on_stage(self) -> list[dict]:
        return [m for m in (self.snapshot or {}).get("cast", []) if m.get("onStage") is not False]

    @staticmethod
    def new_id(prefix: str = "bridge") -> str:
        return f"{prefix}-{int(time.time() * 1000):x}-{random.randrange(16 ** 6):06x}"

    def send(self, message: dict) -> str:
        body = json.dumps({"from": "console", "message": message}, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(f"{self.base}/api/stage/send", data=body, method="POST", headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                return json.load(response).get("id", "")
        except urllib.error.HTTPError as error:
            detail = json.loads(error.read() or b"{}")
            raise RuntimeError(f"relay {error.code}: {detail.get('error', '')} {detail.get('detail', '')}".strip()) from None

    def speak(self, line: dict) -> dict:
        """Sends one line and returns when the phone has performed it (or dropped it, or the wait ran out)."""
        line_id = self.new_id()
        message = {"kind": "line", "id": line_id, "speaker": line["speaker"], "text": line["text"].strip()[:TEXT_MAX]}
        if line.get("topic"):
            message["topic"] = line["topic"][:TOPIC_MAX]
        for key in ("replyTo", "evidenceIds"):
            if line.get(key):
                message[key] = line[key][:12]
        done, state = threading.Event(), {}
        with self.lock:
            self.waiters[line_id] = (done, state)
        try:
            self.send(message)
            print(f"→ {self.names.get(line['speaker'], line['speaker'])}：{message['text']}", flush=True)
            if not done.wait(LINE_TIMEOUT_S):
                return {"phase": "timeout"}
            return state
        finally:
            with self.lock:
                self.waiters.pop(line_id, None)

    def perform(self, lines: list[dict]) -> None:
        """Lines in order, each after the phone finished the one before; a newer round stops this one."""
        with self.lock:
            self.generation += 1
            round_ = self.generation
        for line in lines:
            if round_ != self.generation or self.stopped.is_set():
                return
            try:
                result = self.speak(line)
            except Exception as error:  # noqa: BLE001 — report and keep the show going
                result = {"phase": "error", "note": str(error)}
            if result.get("phase") != "done":
                self.log(f"  （{result.get('phase')}{'：' + result['note'] if result.get('note') else ''}）")
        if round_ == self.generation and self.once and self.opened:
            self.stopped.set()

    def start_round(self, lines: list[dict]) -> None:
        threading.Thread(target=self.perform, args=(lines,), daemon=True).start()

    def on_envelope(self, envelope: dict) -> None:
        # A console receives every message, its own lines and other consoles' included; only the phone's matter here.
        if envelope.get("from") != "app":
            return
        message = envelope["message"]
        kind = message.get("kind")
        if kind == "snapshot":
            self.snapshot = message
            for member in message.get("cast", []):
                self.names[member["id"]] = member["name"]
            self.log(f"← 手机在「{message['phase']}」，台上 {'、'.join(m['name'] for m in self.on_stage()) or '无人'}")
            if not self.opened and message["phase"] == "debate" and self.on_stage():
                self.opened = True
                self.start_round(opening_lines(self.on_stage()))
        elif kind == "line-state":
            if message["phase"] == "queued" and message.get("note"):
                self.log(f"  … 排队中：{message['note']}")
            if message["phase"] in ("done", "dropped"):
                with self.lock:
                    waiter = self.waiters.get(message["id"])
                if waiter:
                    waiter[1].update(message)
                    waiter[0].set()
        elif kind == "decision":
            speaker = message.get("speaker") or {}
            parts = [f"{label} {speaker[key]['zh']}" for key, label in (("expr", "表情"), ("gesture", "手势"), ("act", "动作")) if speaker.get(key)]
            self.log(f"  ← {'Jev' if message.get('source') == 'jev' else '关键词基线'}：{' · '.join(parts) or '（无）'}")
        elif kind == "user-line":
            print(f"← 顾客：{message['text']}", flush=True)
            self.start_round(replies_to_customer(message["text"], self.on_stage(), message["id"]))
        elif kind == "agent":
            self.names[message["contract"]["id"]] = message["contract"]["name"]

    def listen(self) -> None:
        """Server-Sent Events, reconnecting with the last event id so nothing reported in between is missed."""
        last_event_id = ""
        while not self.stopped.is_set():
            query = {"role": "console", **({"lastEventId": last_event_id} if last_event_id else {})}
            url = f"{self.base}/api/stage/events?{urllib.parse.urlencode(query)}"
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={"Accept": "text/event-stream"}), timeout=60) as stream:
                    self.log(f"已连上舞台中继 {self.base}")
                    data, event, frame_id = [], "", ""
                    for raw in stream:  # the relay sends a heartbeat comment every 15 s, inside the 60 s timeout
                        if self.stopped.is_set():
                            return
                        line = raw.decode("utf-8").rstrip("\r\n")
                        if line == "":
                            if frame_id:
                                last_event_id = frame_id
                            if data and (event or "message") == "message":
                                self.on_envelope(json.loads("\n".join(data)))
                            elif data and event == "presence":
                                presence = json.loads("\n".join(data))
                                self.log(f"  （在线：手机 {presence['app']} · 控制端 {presence['console']}）")
                            data, event, frame_id = [], "", ""
                        elif line.startswith(":"):
                            continue
                        else:
                            field, _, value = line.partition(":")
                            value = value[1:] if value.startswith(" ") else value
                            if field == "data":
                                data.append(value)
                            elif field == "event":
                                event = value
                            elif field == "id":
                                frame_id = value
            except Exception as error:  # noqa: BLE001 — the relay restarted or the network dropped
                if self.stopped.is_set():
                    return
                self.log(f"中继连接断开（{error}），2 秒后重连…")
            self.stopped.wait(2)


def main() -> None:
    parser = argparse.ArgumentParser(description="多智能体后端接入舞台的最小示例")
    parser.add_argument("--base", default=os.environ.get("STAGE_BASE", "http://localhost:3000"), help="运行界面的服务（npm start 为 3000，npm run dev 为 5173）")
    parser.add_argument("--once", action="store_true", help="开场一轮说完就退出")
    parser.add_argument("--quiet", action="store_true", help="只打印台词")
    options = parser.parse_args()
    bridge = Bridge(options.base, options.once, options.quiet)
    bridge.log(f"等待手机进入辩论页（{bridge.base}/）…")
    listener = threading.Thread(target=bridge.listen, daemon=True)
    listener.start()
    try:
        while not bridge.stopped.wait(0.5):
            pass
    except KeyboardInterrupt:
        bridge.stopped.set()


if __name__ == "__main__":
    main()
