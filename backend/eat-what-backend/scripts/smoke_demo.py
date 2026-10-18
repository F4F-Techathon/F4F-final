"""Check the running local demo and save a reproducible acceptance report."""
from __future__ import annotations

import json
import uuid
from pathlib import Path

import httpx


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    session = f"acceptance-{uuid.uuid4().hex[:8]}"
    report = {"sessionId": session, "steps": []}
    with httpx.Client(base_url="http://127.0.0.1:8770", timeout=60) as client:
        def get(path):
            response = client.get(path)
            response.raise_for_status()
            return response.json()

        def turn(text):
            response = client.post("/api/demo/turn", json={"session_id": session, "text": text})
            response.raise_for_status()
            result = response.json()
            report["steps"].append({"input": text, "result": result})
            return result

        report["health"] = get("/api/health")
        assert report["health"]["ok"] and report["health"]["data"] == 3
        snapshot = get(f"/api/session/bootstrap?session_id={session}")["snapshot"]
        assert len(snapshot["active"]) == 2 and len(snapshot["holding"]) == 1
        first = turn("人均预算150，想找适合朋友聚餐的")
        assert first["snapshot"]["profile"]["budget"] == 150
        assert not any(event["type"] == "decision.final" for event in first["events"])
        second = turn("我花生过敏")
        assert "花生" in second["snapshot"]["profile"]["allergies"]
        third = turn("我不要蓉姐川味了，换一家")
        assert {r["agentId"] for r in third["snapshot"]["active"]} == {"hua", "pierre"}
        assert third["snapshot"]["profile"] == second["snapshot"]["profile"]
        refs = [ref for event in third["events"] if event["type"] == "evidence.available"
                for ref in event["payload"]["evidence"] if not ref["isDemo"]]
        assert refs
        evidence = get(f"/api/evidence/{refs[0]['id']}")["evidence"]
        assert evidence["sourceRow"] > 0 and evidence["sourceSheet"]
        assert evidence["sourceText"][evidence["highlightStart"]:evidence["highlightEnd"]] == evidence["quote"]
        report["evidence"] = evidence
        final = turn("现在帮我总结并推荐一个")
        decision = next(event for event in final["events"] if event["type"] == "decision.final")
        assert decision["payload"]["turn"]["targetAgentId"] == "hua"
        report["passed"] = True
    output = root / "artifacts" / "demo-validation.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("PASS: bootstrap, budget, allergy, replacement, preserved profile, source highlight, final decision")


if __name__ == "__main__":
    main()
