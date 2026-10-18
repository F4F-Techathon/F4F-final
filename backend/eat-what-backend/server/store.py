from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from dataclasses import asdict
from pathlib import Path

from .models import SessionState, UserProfile


class SessionStore:
    def __init__(self, path: Path, candidate_ids: list[str]):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self.candidate_ids = candidate_ids
        self.lock = threading.RLock()
        with self._connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS sessions (session_id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)"
            )

    @contextmanager
    def _connect(self):
        db = sqlite3.connect(self.path)
        try:
            with db:
                yield db
        finally:
            db.close()

    def get(self, session_id: str) -> SessionState:
        with self.lock, self._connect() as db:
            row = db.execute("SELECT payload FROM sessions WHERE session_id = ?", (session_id,)).fetchone()
        if not row:
            state = SessionState(
                session_id=session_id,
                active=self.candidate_ids[:2],
                holding=self.candidate_ids[2:],
            )
            self.save(state)
            return state
        raw = json.loads(row[0])
        raw["profile"] = UserProfile(**raw.get("profile", {}))
        return SessionState(**raw)

    def save(self, state: SessionState) -> None:
        payload = json.dumps(asdict(state), ensure_ascii=False)
        with self.lock, self._connect() as db:
            db.execute(
                "INSERT INTO sessions(session_id, payload) VALUES(?, ?) "
                "ON CONFLICT(session_id) DO UPDATE SET payload=excluded.payload, updated_at=CURRENT_TIMESTAMP",
                (state.session_id, payload),
            )

    def reset(self, session_id: str) -> SessionState:
        with self.lock, self._connect() as db:
            db.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))
        return self.get(session_id)

