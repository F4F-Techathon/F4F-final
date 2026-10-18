import asyncio
import unittest
from types import SimpleNamespace

import httpx

from server.providers.llm import FallbackLLM, OpenAICompatibleLLM, make_llm


class FakeProvider:
    def __init__(self, model, fail=None, deltas=("{\"text\":\"好\"}",), fail_after_start=False):
        self.model, self.fail, self.deltas, self.fail_after_start = model, fail, deltas, fail_after_start
        self.base_url = f"https://{model}.example.test/v1"
        self.configured = True
        self.calls = 0

    async def stream_text(self, system, user):
        self.calls += 1
        if self.fail and not self.fail_after_start:
            raise self.fail
        for delta in self.deltas:
            yield delta
            if self.fail and self.fail_after_start:
                raise self.fail

    async def complete_json(self, system, user):
        self.calls += 1
        if self.fail:
            raise self.fail
        return {"model": self.model}


def rejected(status):
    request = httpx.Request("POST", "https://example.test/v1/chat/completions")
    return httpx.HTTPStatusError("rejected", request=request, response=httpx.Response(status, request=request))


async def collect(llm):
    return "".join([delta async for delta in llm.stream_text("system", "user")])


class FallbackTests(unittest.IsolatedAsyncioTestCase):
    async def test_primary_answers_while_it_works(self):
        primary, backup = FakeProvider("primary"), FakeProvider("backup")
        llm = FallbackLLM(primary, backup)
        self.assertEqual(await collect(llm), "{\"text\":\"好\"}")
        self.assertEqual((primary.calls, backup.calls, llm.model), (1, 0, "primary"))

    async def test_backup_answers_when_primary_fails_before_output_and_stays_for_the_cooldown(self):
        for failure in (rejected(401), rejected(404), rejected(503), httpx.ConnectError("down"), httpx.ReadTimeout("slow")):
            primary, backup = FakeProvider("primary", fail=failure), FakeProvider("backup")
            llm = FallbackLLM(primary, backup, cooldown=300)
            with self.assertLogs("server.providers.llm", "WARNING") as logs:
                self.assertEqual(await collect(llm), "{\"text\":\"好\"}")
            self.assertEqual(llm.model, "backup")
            self.assertNotIn("Bearer", "".join(logs.output))
            # The dead primary is not retried on every turn.
            primary.fail = None
            await collect(llm)
            self.assertEqual((primary.calls, backup.calls), (1, 2))

    async def test_primary_is_tried_again_after_the_cooldown(self):
        primary, backup = FakeProvider("primary", fail=rejected(500)), FakeProvider("backup")
        llm = FallbackLLM(primary, backup, cooldown=0)
        with self.assertLogs("server.providers.llm", "WARNING"):
            await collect(llm)
        primary.fail = None
        await collect(llm)
        self.assertEqual((primary.calls, backup.calls, llm.model), (2, 1, "primary"))

    async def test_a_failure_mid_stream_is_not_swapped(self):
        primary = FakeProvider("primary", fail=httpx.ReadError("cut"), fail_after_start=True)
        backup = FakeProvider("backup")
        with self.assertRaises(httpx.ReadError):
            await collect(FallbackLLM(primary, backup))
        self.assertEqual(backup.calls, 0)

    async def test_both_failing_raises_the_backup_error(self):
        llm = FallbackLLM(FakeProvider("primary", fail=rejected(401)), FakeProvider("backup", fail=rejected(403)))
        with self.assertLogs("server.providers.llm", "WARNING"), self.assertRaises(httpx.HTTPStatusError) as caught:
            await collect(llm)
        self.assertEqual(caught.exception.response.status_code, 403)

    async def test_json_completion_falls_back_too(self):
        llm = FallbackLLM(FakeProvider("primary", fail=httpx.ConnectError("down")), FakeProvider("backup"))
        with self.assertLogs("server.providers.llm", "WARNING"):
            self.assertEqual(await llm.complete_json("s", "u"), {"model": "backup"})

    def test_factory_uses_whichever_providers_are_configured(self):
        base = dict(llm_base_url="", llm_api_key="", llm_model="", llm_timeout_seconds=5,
                    llm_fallback_base_url="", llm_fallback_api_key="", llm_fallback_model="",
                    llm_fallback_reasoning_effort="", llm_fallback_cooldown=300)
        self.assertIsNone(make_llm(SimpleNamespace(**base)))
        primary = make_llm(SimpleNamespace(**{**base, "llm_base_url": "https://a.test/v1", "llm_model": "m1"}))
        self.assertIsInstance(primary, OpenAICompatibleLLM)
        backup_only = make_llm(SimpleNamespace(**{**base, "llm_fallback_base_url": "https://b.test/v1", "llm_fallback_model": "m2"}))
        self.assertEqual(backup_only.model, "m2")
        both = make_llm(SimpleNamespace(**{**base, "llm_base_url": "https://a.test/v1", "llm_model": "m1",
                                           "llm_fallback_base_url": "https://b.test/v1", "llm_fallback_model": "m2"}))
        self.assertIsInstance(both, FallbackLLM)
        # The backup gets its own reasoning setting, not the primary's.
        self.assertEqual(both.fallback.reasoning_effort, "")


if __name__ == "__main__":
    unittest.main()
