"""Small streaming probe. Reads .env.local; never prints credentials or raw errors."""
import asyncio
import json
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import httpx
from server.config import settings
from server.providers.llm import OpenAICompatibleLLM


async def main():
    missing = [name for name, value in [("LLM_BASE_URL", settings.llm_base_url),
                                       ("LLM_MODEL", settings.llm_model),
                                       ("LLM_API_KEY", settings.llm_api_key)] if not value]
    if missing:
        print(json.dumps({"ok": False, "missing": missing, "requestSent": False}))
        return 2
    base = urlsplit(settings.llm_base_url)
    if base.scheme not in {"http", "https"} or not base.hostname or base.username or base.password or base.query or base.fragment:
        print(json.dumps({"ok": False, "reason": "Base URL must contain only scheme, host and API path", "requestSent": False}))
        return 2
    provider = OpenAICompatibleLLM(settings.llm_base_url, settings.llm_api_key, settings.llm_model, timeout=40)
    started = time.perf_counter()
    first = None
    count = 0
    result = ""
    try:
        async for delta in provider.stream_text(
            'Return exactly one JSON line: {"text":"连接成功","evidenceIds":[]}. No markdown.',
            "This is a connectivity probe, not a user conversation.",
        ):
            if first is None:
                first = round((time.perf_counter() - started) * 1000)
            count += 1
            result += delta
            if len(result) > 3000:
                raise ValueError("oversized_probe_response")
        value = json.loads(result.strip())
        ok = isinstance(value, dict) and isinstance(value.get("text"), str) and isinstance(value.get("evidenceIds"), list)
        print(json.dumps({"ok": ok, "requestSent": True, "model": settings.llm_model,
                          "firstTextMs": first, "deltaCount": count, "jsonLineValid": ok}))
        return 0 if ok else 1
    except httpx.HTTPStatusError as exc:
        print(json.dumps({"ok": False, "requestSent": True, "httpStatus": exc.response.status_code,
                          "reason": "Inspect provider credentials/model/endpoint; raw response omitted"}))
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        print(json.dumps({"ok": False, "requestSent": True, "errorType": type(exc).__name__, "rawErrorOmitted": True}))
    return 1


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(asyncio.run(main()))
