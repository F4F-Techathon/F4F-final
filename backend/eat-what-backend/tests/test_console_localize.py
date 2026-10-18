"""Regional hosts: the verified Mandarin line rewritten into their dialect, the Mandarin kept as its gloss."""
import asyncio
import unittest

from server.console_localize import Localizer, clean, dialect_of, problem, system_for
from server.voices import assign_voices, parse_characters


class FakeLLM:
    def __init__(self, reply, delay=0.0):
        self.reply, self.delay, self.calls = reply, delay, []

    async def stream_text(self, system, user):
        self.calls.append((system, user))
        if self.delay:
            await asyncio.sleep(self.delay)
        for index in range(0, len(self.reply), 4):
            yield self.reply[index:index + 4]


def run(coro):
    return asyncio.run(coro)


class LocalizerTests(unittest.TestCase):
    def test_a_regional_host_speaks_dialect_with_the_mandarin_as_gloss(self):
        llm = FakeLLM("四川话：来我屋头嘛，人均才85，巴适得很！")
        localizer = Localizer(llm)
        result = run(localizer.localize("来我家吧，人均才85，很舒服！", "sc", ("蓉姐",)))
        self.assertEqual(result["text"], "来我屋头嘛，人均才85，巴适得很！")
        self.assertEqual(result["gloss"], "来我家吧，人均才85，很舒服！")
        # The prompt is agent-studio's, with the film's pairs as examples.
        self.assertIn("四川话", llm.calls[0][0])
        self.assertIn("屋头", llm.calls[0][0])
        # The same line again is not rewritten twice.
        self.assertTrue(run(localizer.localize("来我家吧，人均才85，很舒服！", "sc", ("蓉姐",))).get("cached"))
        self.assertEqual(len(llm.calls), 1)

    def test_a_rewrite_that_loses_a_number_or_a_name_is_not_used(self):
        lost_number = run(Localizer(FakeLLM("嚟饮早茶啦，好平㗎！")).localize("来饮早茶，人均45元！", "yue"))
        self.assertEqual((lost_number["text"], lost_number["gloss"]), ("来饮早茶，人均45元！", None))
        self.assertIn("45", lost_number["note"])
        lost_name = run(Localizer(FakeLLM("我系华记嘅老板！")).localize("我是华记的华叔！", "yue", ("华叔",)))
        self.assertIsNone(lost_name["gloss"])
        self.assertIn("华叔", lost_name["note"])

    def test_mandarin_and_accented_hosts_are_left_alone_and_a_slow_model_falls_back(self):
        llm = FakeLLM("不该用到")
        for language in ("zh", "enzh", "jazh", None):
            self.assertIsNone(run(Localizer(llm).localize("人均三十三。", language))["gloss"])
        self.assertEqual(llm.calls, [])
        slow = run(Localizer(FakeLLM("太慢了", delay=0.2), timeout=0.05).localize("人均三十三。", "hunan"))
        self.assertEqual((slow["text"], slow["gloss"]), ("人均三十三。", None))
        self.assertIn("TimeoutError", slow["note"])

    def test_every_regional_language_has_a_prompt(self):
        for language in ("sc", "yue", "hunan", "shanghai", "dongbei", "shaanxi", "gansu", "guizhou", "jiangxi", "yunnan", "fr"):
            self.assertTrue(dialect_of(language))
            self.assertIn("数字和价格", system_for(language))
        self.assertIsNone(dialect_of("zh"))
        self.assertEqual(clean("“改写：辣到个嘴都肿晒”"), "辣到个嘴都肿晒")
        self.assertIsNone(problem("人均23", "人均23啦", ()))


class DialectVoiceTests(unittest.TestCase):
    def test_the_host_language_arrives_with_its_character_and_cantonese_gets_a_cantonese_voice(self):
        characters = parse_characters({"a": {"gender": "female", "language": "yue"}, "b": {"gender": "male", "language": "yue"},
                                       "c": {"gender": "male", "language": "enzh"}}, ["a", "b", "c"])
        self.assertEqual(characters["a"]["language"], "yue")
        self.assertNotIn("language", characters["c"])
        voices = assign_voices("macos-say", ["a", "b", "c"], characters)
        self.assertEqual(voices["a"], "Sinji")
        self.assertNotEqual(voices["b"], "Sinji")  # no male Cantonese voice on macOS: a Mandarin one says it


if __name__ == "__main__":
    unittest.main()
