from __future__ import annotations

import json
import logging
import os
import re
import time
from urllib.parse import urlsplit
from typing import Any

import httpx


class OpenAICompatibleLLM:
    """Small OpenAI-compatible adapter; credentials are read by config, never logged."""

    def __init__(self, base_url: str, api_key: str, model: str, timeout: float = 22.0, reasoning_effort: str | None = None):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout = timeout
        self.trust_env = os.getenv("LLM_TRUST_ENV", "1").strip().lower() not in {"0", "false", "no"}
        self.reasoning_effort = (os.getenv("LLM_REASONING_EFFORT", "") if reasoning_effort is None else reasoning_effort).strip()

    def _extras(self, payload: dict[str, Any]) -> dict[str, Any]:
        if urlsplit(self.base_url).hostname == "api.deepseek.com":
            payload["thinking"] = {"type": "disabled"}
        elif self.reasoning_effort:
            payload["reasoning_effort"] = self.reasoning_effort
        return payload

    @property
    def configured(self) -> bool:
        # Local OpenAI-compatible servers such as Ollama do not require a key.
        return bool(self.base_url and self.model)

    async def stream_text(self, system: str, user: str):
        """Yield actual provider deltas; never emulate streaming with a full reply."""
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        payload = {"model": self.model, "messages": [{"role": "system", "content": system},
                   {"role": "user", "content": user}], "temperature": 0.35, "max_tokens": 600, "stream": True}
        self._extras(payload)
        async with httpx.AsyncClient(timeout=self.timeout, trust_env=self.trust_env) as client:
            async with client.stream("POST", f"{self.base_url}/chat/completions", headers=headers, json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    body = line[5:].strip()
                    if body == "[DONE]":
                        return
                    if body:
                        choices = json.loads(body).get("choices", [])
                        if choices and choices[0].get("delta", {}).get("content"):
                            yield choices[0]["delta"]["content"]

    async def complete_json(self, system: str, user: str) -> dict[str, Any]:
        if not self.configured:
            raise RuntimeError("LLM provider is not configured")
        payload = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": 0.35,
            "max_tokens": 700,
            "stream": False,
        }
        self._extras(payload)
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        async with httpx.AsyncClient(timeout=self.timeout, trust_env=self.trust_env) as client:
            response = await client.post(f"{self.base_url}/chat/completions", json=payload, headers=headers)
            response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        content = re.sub(r"^\s*<think>.*?</think>\s*", "", content, flags=re.S)
        match = re.search(r"\{.*\}", content, flags=re.S)
        if not match:
            raise ValueError("LLM did not return a JSON object")
        return json.loads(match.group(0))



class FallbackLLM:
    """The configured provider first; a backup provider when it fails.

    A failure is anything that stops the primary before its first output: unreachable, a rejected key, an unknown
    model, a server error, a timeout. The backup then answers, and keeps answering for a cool-down before the primary
    is tried again, so a dead provider does not add its timeout to every turn. A provider that fails after it has
    started streaming is not swapped mid-sentence: that error goes to the caller as before. Keys are never logged.
    """

    def __init__(self, primary: OpenAICompatibleLLM, fallback: OpenAICompatibleLLM, cooldown: float = 300.0):
        self.primary, self.fallback, self.cooldown = primary, fallback, cooldown
        self.primary_failed_at: float | None = None
        self.active = primary

    @property
    def configured(self) -> bool:
        return self.primary.configured or self.fallback.configured

    @property
    def model(self) -> str:
        return self.active.model

    def _order(self):
        resting = self.primary_failed_at is not None and time.monotonic() - self.primary_failed_at < self.cooldown
        return [self.fallback, self.primary] if resting else [self.primary, self.fallback]

    def _failed(self, provider, exc):
        status = getattr(getattr(exc, "response", None), "status_code", None)
        logging.getLogger(__name__).warning("llm_provider_failed %s", json.dumps({
            "model": provider.model, "host": urlsplit(provider.base_url).hostname, "error": type(exc).__name__,
            "status": status, "next": "fallback" if provider is self.primary else "primary"}, ensure_ascii=False))
        if provider is self.primary:
            self.primary_failed_at = time.monotonic()

    async def stream_text(self, system: str, user: str):
        order = self._order()
        for index, provider in enumerate(order):
            started = False
            try:
                async for delta in provider.stream_text(system, user):
                    started = True
                    yield delta
                self.active = provider
                if provider is self.primary:
                    self.primary_failed_at = None
                return
            except Exception as exc:
                if started or index == len(order) - 1:
                    raise
                self._failed(provider, exc)

    async def complete_json(self, system: str, user: str) -> dict[str, Any]:
        order = self._order()
        for index, provider in enumerate(order):
            try:
                result = await provider.complete_json(system, user)
                self.active = provider
                if provider is self.primary:
                    self.primary_failed_at = None
                return result
            except Exception as exc:
                if index == len(order) - 1:
                    raise
                self._failed(provider, exc)
        raise RuntimeError("no LLM provider")


def make_llm(settings):
    """The primary LLM_* provider, with LLM_FALLBACK_* behind it when both are set; either alone works too."""
    primary = (OpenAICompatibleLLM(settings.llm_base_url, settings.llm_api_key, settings.llm_model, settings.llm_timeout_seconds)
               if settings.llm_base_url and settings.llm_model else None)
    fallback = (OpenAICompatibleLLM(settings.llm_fallback_base_url, settings.llm_fallback_api_key, settings.llm_fallback_model,
                                    settings.llm_timeout_seconds, reasoning_effort=settings.llm_fallback_reasoning_effort)
                if settings.llm_fallback_base_url and settings.llm_fallback_model else None)
    if primary and fallback:
        return FallbackLLM(primary, fallback, settings.llm_fallback_cooldown)
    return primary or fallback
