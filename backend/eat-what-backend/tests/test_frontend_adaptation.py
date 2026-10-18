"""The adaptations made for the 饭店请就位 frontend: its hosts' names, per-host voices, macOS TTS and settings."""
import asyncio
import shutil
import sys
import unittest

from server.console_persona import build_persona, choose_identity
from server.voices import assign_voices, parse_characters

SHOP = {"id": "k4ltYupc8AF8MBV1", "name": "湘稻香", "category": "湘菜"}


class PersonaOverrideTests(unittest.TestCase):
    def test_frontend_name_is_spoken_and_tuned_tone_kept(self):
        own = build_persona(SHOP, "v")
        renamed = build_persona(SHOP, "v", {"characterName": "郑姐"})
        self.assertEqual(choose_identity(SHOP)["characterName"], "小湘")
        self.assertEqual((renamed["characterName"], renamed["nameSource"], renamed["backendCharacterName"]), ("郑姐", "frontend", "小湘"))
        self.assertIn("你叫郑姐", renamed["systemPrompt"])
        self.assertNotIn("你叫小湘", renamed["systemPrompt"])
        # The tuned 小湘 interaction habits survive the new name.
        self.assertEqual(renamed["speechStyle"]["attack"], own["speechStyle"]["attack"])
        self.assertEqual(build_persona(SHOP, "v", {})["characterName"], "小湘")


class CharacterAndVoiceTests(unittest.TestCase):
    def test_parse_keeps_only_valid_entries_for_listed_restaurants(self):
        parsed = parse_characters({"a": {"characterName": " 郑姐 ", "gender": "female", "age": "old"},
                                   "b": {"characterName": "x" * 20, "gender": "robot"}, "c": {"characterName": "外人"},
                                   "d": "nonsense"}, ["a", "b", "d"])
        self.assertEqual(parsed, {"a": {"characterName": "郑姐", "gender": "female", "age": "old"}})
        self.assertEqual(parse_characters(None, ["a"]), {})

    def test_voices_follow_gender_and_age_and_stay_distinct(self):
        characters = {"a": {"gender": "female"}, "b": {"gender": "female"}, "c": {"gender": "male", "age": "old"}, "d": {"gender": "male"}}
        mac = assign_voices("macos-say", ["a", "b", "c", "d"], characters)
        self.assertEqual(len(set(mac.values())), 4)
        self.assertTrue(mac["c"].startswith("Grandpa"))
        cosy = assign_voices("cosyvoice3-local", ["a", "c", "d"], characters)
        self.assertEqual((cosy["a"], cosy["c"], cosy["d"]), ("rong", "hua", "pierre"))
        # Without a description the delivered rotation stays.
        self.assertEqual(assign_voices("cosyvoice3-local", ["x", "y", "z", "w"], {}), {"x": "rong", "y": "hua", "z": "pierre", "w": "rong"})


class ParticipationTests(unittest.TestCase):
    def test_silent_shops_are_named_once_two_have_traded_lines(self):
        from server.console_coordinator import conversation_balance
        candidates = {"a": [], "b": [], "c": [], "d": []}
        heard = [{"turnId": f"t{i}", "restaurantId": sid, "text": "话", "presentation": "ended", "speechAct": act}
                 for i, (sid, act) in enumerate([("a", "present"), ("b", "attack"), ("a", "respond")])]
        balance = conversation_balance(candidates, {"recentDialogue": heard})
        self.assertEqual(balance["notYetSpoken"], ["c", "d"])
        self.assertEqual(balance["speakerCounts"], {"a": 2, "b": 1, "c": 0, "d": 0})
        self.assertIn("没开口", balance["mixReminder"])
        # Everyone has spoken: the delivered pacing reminders apply again.
        everyone = heard + [{"turnId": "t9", "restaurantId": sid, "text": "话", "presentation": "ended", "speechAct": "present"} for sid in "cd"]
        self.assertNotIn("没开口", conversation_balance(candidates, {"recentDialogue": everyone})["mixReminder"])


@unittest.skipUnless(sys.platform == "darwin" and shutil.which("say"), "macOS system voices only")
class MacOSTTSTests(unittest.IsolatedAsyncioTestCase):
    async def test_renders_20ms_frames_of_24khz_pcm(self):
        from server.providers.macos_tts import MacOSTTS
        tts = MacOSTTS()
        frames = [frame async for frame in tts.stream("你好，我是郑姐。", "Tingting")]
        self.assertTrue(frames)
        self.assertTrue(all(rate == 24000 for _, rate in frames))
        self.assertTrue(all(len(pcm) <= 960 and len(pcm) % 2 == 0 for pcm, _ in frames))
        self.assertGreater(sum(len(pcm) for pcm, _ in frames) / 2 / 24000, 0.5)

    async def test_cancelling_kills_the_render(self):
        from server.providers.macos_tts import MacOSTTS
        tts = MacOSTTS()
        task = asyncio.create_task(tts._render("这是一段很长的台词，" * 30, "rong"))
        await asyncio.sleep(0.2)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task


if __name__ == "__main__":
    unittest.main()
