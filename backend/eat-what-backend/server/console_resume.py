"""Resuming a debate: the rounds the frontend has already performed, as the heard history of a new session.

The customer may leave the debate page and come back (a shop's details, a reload, a dropped connection). The new
session's session.start then carries what the stage has already said, and the debate goes on from there instead of
opening again. Only what the stage finished counts, so every restaurant round is presentation=ended.
"""
from __future__ import annotations

import re

ACCEPTED = 200  # rounds read from one session.start; introductions and cited sources are taken from all of them
KEPT = 40  # rounds kept as recentDialogue, as a live session keeps them
TEXT_LIMIT = 600
EVIDENCE_LIMIT = 12
TURN_ID = re.compile(r"^[\w:.\-]{1,64}$")


def parse_history(value, ids, known_evidence):
    """Performed rounds, oldest first: {turnId, restaurantId, text, evidenceIds} for restaurants in ids, and the
    customer's words {role: "user", text}. Malformed items, restaurants not in ids, repeated turnIds and evidence
    ids outside known_evidence are left out."""
    if not isinstance(value, list):
        return []
    rounds, seen = [], set()
    for item in value[-ACCEPTED:]:
        if not isinstance(item, dict) or not isinstance(item.get("text"), str):
            continue
        text = item["text"].strip()[:TEXT_LIMIT]
        if not text:
            continue
        if item.get("role") == "user":
            rounds.append({"role": "user", "text": text})
            continue
        turn_id, sid, evidence = item.get("turnId"), item.get("restaurantId"), item.get("evidenceIds", [])
        if (not isinstance(turn_id, str) or not TURN_ID.match(turn_id) or turn_id in seen
                or not isinstance(sid, str) or sid not in ids or not isinstance(evidence, list)):
            continue
        seen.add(turn_id)
        cited = [fid for fid in dict.fromkeys(x for x in evidence if isinstance(x, str)) if fid in known_evidence]
        rounds.append({"turnId": turn_id, "restaurantId": sid, "text": text, "evidenceIds": cited[:EVIDENCE_LIMIT],
                       "playedSamples": 0, "presentation": "ended", "introductionCompleted": True})
    return rounds
