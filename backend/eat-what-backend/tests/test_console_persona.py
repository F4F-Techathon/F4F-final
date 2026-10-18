import asyncio
import unittest

from server.console_persona import build_persona, choose_identity, speech_system, strip_repeated_setup, speech_style_violations, style_context
from server.console_playback import speech_units
from server.realtime_console import catalog
import tests.test_console_workflow as fixtures


class NamingTests(unittest.TestCase):
    def test_rejects_self_criticism_and_shared_concession_frames(self):
        for text in ('热菜少我认，得改。', '卷好上桌是凉过，这点我不遮。', '这事不回避，我再补个菜。', '我承认服务有问题。', '坐得舒服是加分，可菜呢？', '多菜自选是好，可吃啥？', '量足归量足，可新鲜吗？', '二十几块是便宜，可菜呢？'):
            with self.subTest(text=text):
                self.assertTrue(speech_style_violations(text))
        self.assertFalse(speech_style_violations('我认为菜得趁热吃。你那盘已经凉了。'))
        self.assertFalse(speech_style_violations('你那服务得改。等位的人还在门口呢。'))

    def test_style_reference_excludes_unheard_speech_and_counts_pending_once(self):
        pending = {'turnId': 'p', 'restaurantId': 'b', 'text': '刚开始播放，后面还没听。', 'presentation': 'playing'}
        view = {'recentDialogue': [{'turnId': 'h', 'restaurantId': 'a', 'text': '我这儿直接端菜。', 'presentation': 'ended'}, pending]}
        self.assertEqual(['我这儿直接端菜。'], style_context(view, 'a')['ownRecentTexts'])
        self.assertEqual(1, len(style_context(view, 'b')['recentOpenings']))
        view.update(speculative=True, pendingPlayback=pending)
        self.assertEqual(2, len(style_context(view, 'b')['recentOpenings']))

    def test_removing_repeated_setup_preserves_identity_prices_and_real_rebuttals(self):
        text = '我是阿甬，甬悦柒鲜。约会要安静，我这儿沙发座聊天方便，参考人均157元。'
        self.assertEqual('我是阿甬，甬悦柒鲜。我这儿沙发座聊天方便，参考人均157元。', strip_repeated_setup(text))
        rebuttal = '你说约会要安静，可你刚才只讲了便宜。'
        self.assertEqual(rebuttal, strip_repeated_setup(rebuttal))

    def identity(self, name):
        return choose_identity({"name": name, "category": "家常菜"})

    def test_confirmed_brand_character_has_priority_over_name(self):
        self.assertEqual("雪王", self.identity("蜜雪冰城（蓉姐店）")["characterName"])
        self.assertEqual("brand_mascot", self.identity("蜜雪冰城")["nameSource"])
        self.assertEqual("上校", self.identity("肯德基环科店")["characterName"])
        self.assertTrue(self.identity("KFC")["sourceUrl"])

    def test_clear_merchant_person_name_is_reused(self):
        for name, expected in (("蓉姐家常菜", "蓉姐"), ("老王面馆", "老王"), ("阿香米线", "阿香"), ("杨国福麻辣烫", "杨国福")):
            with self.subTest(name=name):
                self.assertEqual(expected, self.identity(name)["characterName"])
                self.assertEqual("merchant_name", self.identity(name)["nameSource"])

    def test_generated_name_is_stable_and_never_labelled_official(self):
        for sid, shop in catalog.shops.items():
            a, b = catalog.persona(sid), catalog.persona(sid)
            self.assertEqual(a["characterName"], b["characterName"])
            self.assertNotIn('introductionText', a)
            self.assertIn(a['characterName'], speech_system(a, True))
        alias = self.identity("SUBWAY赛百味")
        self.assertEqual(("小麦", "generated"), (alias["characterName"], alias["nameSource"]))

    def test_name_and_informal_prompt_are_built_together(self):
        persona = build_persona({"id": "shop", "name": "蓉姐家常菜", "category": "家常菜"}, "test")
        self.assertIn("你叫蓉姐", persona["systemPrompt"])
        self.assertIn("首次亮相", speech_system(persona, True))
        self.assertIn("不再重复", speech_system(persona, False))
        self.assertIn("别每轮重复", persona["systemPrompt"])

    def test_personal_syntax_and_interaction_styles_are_in_each_system_prompt(self):
        personas = [catalog.persona(sid) for sid in catalog.shops]
        for field in ('rhythm', 'syntax', 'attack', 'respond'):
            self.assertEqual(7, len({p['speechStyle'][field] for p in personas}))
            for persona in personas:
                self.assertIn(persona['speechStyle'][field], persona['systemPrompt'])
        self.assertTrue(all('你自己负责构思回复' in p['systemPrompt'] for p in personas))

    def test_seven_restaurants_have_distinct_voices_and_grounded_regional_styles(self):
        personas = [catalog.persona(sid) for sid in catalog.shops]
        self.assertEqual(7, len({tuple(p['speakingStyle']) for p in personas}))
        xiang = next(p for p in personas if p['characterName'] == '小湘')
        self.assertIn('湘', xiang['regionalStyle']['basis'])
        kfc = next(p for p in personas if p['characterName'] == '上校')
        self.assertIn('虚拟角色', kfc['regionalStyle']['basis'])
        self.assertIn('不设定真实人物国籍', kfc['regionalStyle']['description'])


class IntroductionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        await fixtures.WorkflowTests.asyncSetUp(self)
        sid = self.ids[0]
        facts = catalog.select(sid, 0, set())
        async def plan():
            return fixtures.proposal(sid, facts), facts
        self.session.plan_turn = plan
        self.sid = sid

    async def asyncTearDown(self):
        await fixtures.WorkflowTests.asyncTearDown(self)

    async def test_first_turn_starts_with_introduction_and_later_turn_does_not(self):
        await self.session.turn()
        text = next(e["data"] for e in self.ws.events if e["type"] == "text")
        self.assertTrue(text["text"].startswith(fixtures.introduction_prefix(self.sid)))
        self.assertIn(self.sid, self.session.introduced)
        self.session.history = []  # Rolling context must not lose the introduction flag.
        prepared = await self.session.prepare_turn()
        self.assertFalse(prepared["introducesCharacter"])
        self.assertFalse(any(s.get("isIntroduction") for s in prepared["segments"]))

    async def test_preparing_introduction_never_commits_it_as_heard(self):
        prepared = await self.session.prepare_turn()
        self.assertTrue(prepared["introducesCharacter"])
        self.assertNotIn(self.sid, self.session.introduced)
        self.assertFalse(self.session.history)

    async def test_partial_introduction_is_retried_after_interruption(self):
        entered = asyncio.Event()
        class Speech:
            name = "test"
            async def stream(self, text, voice):
                yield bytes(960), 24000
                entered.set()
                await asyncio.Future()
        self.session.tts = Speech()
        self.session.audio_on = True
        self.session.kickoff(once=True)
        await asyncio.wait_for(entered.wait(), 1)
        tid, epoch = self.session.current["turnId"], self.session.epoch
        await self.session.playback_report({"turnId": tid, "epoch": epoch, "status": "progress", "playedSamples": 240})
        await self.session.interrupt("test")
        await self.session.playback_report({"turnId": tid, "epoch": epoch, "status": "interrupted", "playedSamples": 240})
        self.assertNotIn(self.sid, self.session.introduced)
        self.assertTrue((await self.session.prepare_turn())["introducesCharacter"])

    async def test_heard_introduction_is_preserved_if_body_is_interrupted(self):
        entered = asyncio.Event()
        intro_units = speech_units(fixtures.introduction_prefix(self.sid))
        class Speech:
            name = "test"
            async def stream(self, text, voice):
                yield bytes(960), 24000
                if text not in intro_units:
                    entered.set()
                    await asyncio.Future()
        self.session.tts = Speech()
        self.session.audio_on = True
        self.session.kickoff(once=True)
        await asyncio.wait_for(entered.wait(), 1)
        tid, epoch = self.session.current["turnId"], self.session.epoch
        end = self.session.playbacks[tid]["introSampleEnd"]
        await self.session.playback_report({"turnId": tid, "epoch": epoch, "status": "progress", "playedSamples": end})
        await self.session.interrupt("test")
        await self.session.playback_report({"turnId": tid, "epoch": epoch, "status": "interrupted", "playedSamples": end})
        self.assertIn(self.sid, self.session.introduced)
        self.assertFalse((await self.session.prepare_turn())["introducesCharacter"])

    @unittest.skip("Removal by keyword moved to the page: the host Orb proposes it and the customer approves (DebateView)")

    async def test_character_name_can_target_a_restaurant_removal(self):
        nickname = self.session.personas[self.ids[1]]["characterName"]
        await self.session.input_text("踢走" + nickname)
        self.assertNotIn(self.ids[1], self.session.ids)
        await self.session.interrupt("test")
