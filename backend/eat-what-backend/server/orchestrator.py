from __future__ import annotations

import json
import re
import uuid
import unicodedata
from dataclasses import dataclass
from typing import Any

from .data import RestaurantRepository
from .evidence import EvidenceVerifier
from .models import RealtimeEvent, Restaurant, SessionState, TurnEnvelope
from .providers.base import LLMProvider
from .store import SessionStore


VISUAL_STATE = {
    "present": "presenting",
    "recommend": "presenting",
    "challenge": "challenging",
    "defend": "defending",
    "clarify": "thinking",
    "conclude": "selected",
}

ALLERGIES = ["花生", "坚果", "海鲜", "虾", "蟹", "乳制品", "牛奶", "鸡蛋", "麸质", "酒精"]
CUISINES = ["川菜", "火锅", "浙菜", "宁波菜", "海鲜", "法餐", "西餐", "粤菜", "清淡", "辣"]
RESTAURANT_ALIASES = {
    "dxx-ningbo": ("丁香小鲜", "丁香小仙", "叮香小仙", "叮香小鲜", "丁香"),
    "rong-hotpot": ("蓉姐", "荣姐", "容姐"),
    "pierre-bistro": ("pierre", "皮埃尔", "皮耶尔", "皮尔"),
}
REMOVE_ACTIONS = ("踢走", "踢掉", "淘汰", "移除", "赶走", "请走", "换掉", "排除", "出局")


def normalized_name(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).lower()
    text = text.translate(str.maketrans({"叮": "丁", "仙": "鲜", "晓": "小", "荣": "蓉", "容": "蓉"}))
    return re.sub(r"[\W_]", "", text)


@dataclass
class OrchestrationResult:
    events: list[RealtimeEvent]
    state: SessionState
    degraded_reason: str | None = None

    def public(self, snapshot: dict[str, Any]) -> dict[str, Any]:
        return {"events": [event.public() for event in self.events], "snapshot": snapshot, "degradedReason": self.degraded_reason}


class MultiAgentOrchestrator:
    def __init__(self, repo: RestaurantRepository, store: SessionStore, llm: LLMProvider | None = None, runtime_mode: str = "demo"):
        self.repo = repo
        self.store = store
        self.llm = llm
        self.runtime_mode = runtime_mode
        self.verifier = EvidenceVerifier(repo)

    def snapshot(self, state: SessionState) -> dict[str, Any]:
        by_ids = lambda ids: [self.repo.get(item).public() for item in ids]
        return {
            "sessionId": state.session_id,
            "active": by_ids(state.active),
            "holding": by_ids(state.holding),
            "removed": by_ids(state.removed),
            "profile": state.profile.public(),
            "transcript": state.transcript[-30:],
            "mode": self.runtime_mode,
        }

    async def handle(self, session_id: str, user_text: str, *, include_restaurants: bool = True) -> OrchestrationResult:
        text = user_text.strip()
        if not text:
            raise ValueError("user text is empty")
        state = self.store.get(session_id)
        state.turn_index += 1
        state.transcript.append({"role": "user", "text": text, "turn": state.turn_index})
        events: list[RealtimeEvent] = []

        profile_changed = self._update_profile(state, text)
        if profile_changed:
            events.append(RealtimeEvent("profile.updated", {"profile": state.profile.public(), "changes": profile_changed}))

        roster_change = self._update_roster(state, text)
        if roster_change and roster_change["status"] == "changed":
            events.append(RealtimeEvent("roster.changed", {**roster_change, "snapshot": self.snapshot(state)}))

        # New speech can cancel a slow response. Preserve the user's preferences first.
        self.store.save(state)

        wants_decision = any(word in text for word in ("选哪个", "推荐一个", "做决定", "总结", "最终", "就选"))
        turns: list[TurnEnvelope] = []
        degraded_reason = None
        if wants_decision and not roster_change:
            turns.append(self._judge_turn(state))
        else:
            turns.append(self._host_turn(state, text, profile_changed, roster_change))
            discuss = include_restaurants and (not roster_change or roster_change["status"] == "changed")
            for index, restaurant_id in enumerate(state.active if discuss else []):
                target_id = state.active[0] if index == 1 else None
                try:
                    turn = await self._restaurant_turn(state, self.repo.get(restaurant_id), text, target_id)
                except Exception as exc:
                    degraded_reason = f"LLM unavailable: {type(exc).__name__}"
                    turn = self._rule_restaurant_turn(state, self.repo.get(restaurant_id), text, target_id)
                turns.append(turn)

        for turn in turns:
            state.transcript.append({"role": "agent", **turn.public(), "turn": state.turn_index})
            events.extend(self._turn_events(turn))

        self.store.save(state)
        events.append(RealtimeEvent("room.snapshot", self.snapshot(state)))
        return OrchestrationResult(events=events, state=state, degraded_reason=degraded_reason)

    def _update_profile(self, state: SessionState, text: str) -> dict[str, Any]:
        changes: dict[str, Any] = {}
        budget = re.search(r"(?:人均|预算|每人|不要超过|控制在)\D{0,4}(\d{2,4})", text)
        if budget:
            value = int(budget.group(1))
            if state.profile.budget != value:
                state.profile.budget = value
                changes["budget"] = value
        found_allergies = [item for item in ALLERGIES if item in text and item not in state.profile.allergies]
        if ("过敏" in text or "不能吃" in text or "忌口" in text) and found_allergies:
            state.profile.allergies.extend(found_allergies)
            changes["allergies"] = found_allergies
        found_cuisines = [item for item in CUISINES if item in text and item not in state.profile.cuisines]
        if found_cuisines:
            state.profile.cuisines.extend(found_cuisines)
            changes["cuisines"] = found_cuisines
        occasion_map = {"约会": "约会", "商务": "商务宴请", "请客": "请客", "聚餐": "朋友聚餐", "家庭": "家庭聚餐"}
        for word, value in occasion_map.items():
            if word in text and state.profile.occasion != value:
                state.profile.occasion = value
                changes["occasion"] = value
                break
        return changes

    def _update_roster(self, state: SessionState, text: str) -> dict[str, Any] | None:
        normalized = normalized_name(text)
        actions = "|".join(REMOVE_ACTIONS)
        if re.search(rf"(?:不要|别|不用|不必)(?:再)?(?:{actions})", normalized) or re.search(
            rf"(?:不要|别|不用|不必)(?:把|将).{{0,20}}(?:{actions})", normalized
        ):
            return None
        mentions = []
        for restaurant in self.repo.restaurants.values():
            names = (restaurant.name, restaurant.short_name, *RESTAURANT_ALIASES.get(restaurant.id, ()))
            if any(normalized_name(name) in normalized for name in names if name):
                mentions.append(restaurant.id)
        generic_switch = any(word in normalized for word in ("换一家", "换家", "换一个餐厅", "换个餐厅", "换一间")) or bool(
            re.search(r"(?:要|找|来|给|推荐|需要).*(?:一家新的|新的?[店点]|新的?餐厅)", normalized))
        rejection = any(word in normalized for word in (*REMOVE_ACTIONS, "不要", "不想吃", "不选", "不考虑", "不去", "别推荐"))
        if not generic_switch and not (rejection and (mentions or any(word in normalized for word in REMOVE_ACTIONS))):
            return None
        if len(mentions) > 1:
            return {"status": "needs_target"}
        if mentions:
            remove_id = mentions[0]
            if remove_id not in state.active:
                return {"status": "already_removed" if remove_id in state.removed else "not_active", "removedId": remove_id}
        elif generic_switch and state.active:
            if not state.holding:
                return {"status": "no_replacement"}
            remove_id = state.active[-1]
        else:
            return {"status": "needs_target"}
        position = state.active.index(remove_id)
        state.active.remove(remove_id)
        state.removed.append(remove_id)
        add_id = state.holding.pop(0) if state.holding else None
        if add_id:
            state.active.insert(position, add_id)
        state.discussion_index = 0
        return {"status": "changed", "removedId": remove_id, "addedId": add_id, "reason": "user_explicit_rejection"}

    def _host_turn(self, state: SessionState, text: str, profile_changes: dict[str, Any], roster_change: dict[str, Any] | None) -> TurnEnvelope:
        if roster_change:
            status = roster_change["status"]
            remaining = "、".join(self.repo.get(item).short_name for item in state.active)
            if status == "changed":
                old = self.repo.get(roster_change["removedId"]).short_name
                if roster_change["addedId"]:
                    new = self.repo.get(roster_change["addedId"]).short_name
                    line = f"已移出{old}，由{new}补位。预算和忌口保留。"
                else:
                    line = f"已移出{old}。" + (f"候场已空，接下来由{remaining}继续；预算和忌口保留。" if remaining else "目前没有剩余候选，可以重新开始选择。")
            elif status == "already_removed":
                old = self.repo.get(roster_change["removedId"]).short_name
                line = f"{old}已经离场，不会再参与讨论。" + (f"当前在场：{remaining}。" if remaining else "目前没有剩余候选。")
            elif status == "not_active":
                line = "这家还在候场，没有参与当前讨论。"
            elif status == "no_replacement":
                line = "候场餐厅已经用完，现有资料里没有新店可以补位。可以重新开始选择，或补充更多餐厅资料。"
            else:
                line = f"请明确要移出哪一家。当前在场：{remaining or '没有候选'}。"
        elif profile_changes.get("allergies"):
            line = f"记下了：你对{'、'.join(profile_changes['allergies'])}过敏。接下来所有推荐都会避开这项。"
        elif profile_changes:
            line = "已更新偏好，接下来按你的新要求继续讨论。"
        else:
            line = "餐厅将按当前偏好继续讨论，你可以随时补充要求。"
        return self._make_turn("host", line, "clarify", "thinking", [])

    async def _restaurant_turn(self, state: SessionState, restaurant: Restaurant, user_text: str, target_id: str | None) -> TurnEnvelope:
        if not self.llm or not self.llm.configured:
            return self._rule_restaurant_turn(state, restaurant, user_text, target_id)
        target = self.repo.get(target_id) if target_id else None
        evidence_pool = restaurant.evidence[:4] + (target.evidence[-2:] if target else [])
        system = (
            "你是餐厅多智能体讨论中的一个餐厅角色。只能依据给出的商户资料和证据发言。"
            "输出一个 JSON 对象，字段为 text、speechAct、emotion、targetAgentId、evidenceIds。"
            "speechAct 只能是 present/recommend/challenge/defend/clarify；emotion 只能是 neutral/happy/confident/tense/thinking。"
            "具体价格、菜品、环境、服务或批评必须引用 evidenceIds。控制在70个汉字内，不要说自己是AI。"
        )
        prompt = {
            "userText": user_text,
            "userProfile": state.profile.public(),
            "recentDiscussion": [{"speaker": item.get("speakerId", "user"), "text": item["text"]} for item in state.transcript[-6:]],
            "restaurant": restaurant.public(),
            "target": target.public() if target else None,
            "evidence": [{"id": e.id, "restaurantId": e.restaurant_id, "quote": e.quote} for e in evidence_pool],
        }
        raw = await self.llm.complete_json(system, json.dumps(prompt, ensure_ascii=False))
        speech_act = raw.get("speechAct") if raw.get("speechAct") in VISUAL_STATE else "recommend"
        emotion = raw.get("emotion") if raw.get("emotion") in {"neutral", "happy", "confident", "tense", "thinking"} else "confident"
        target_restaurant_id = target.id if target else None
        evidence_ids = self.verifier.valid_ids(
            list(raw.get("evidenceIds") or []), restaurant.id, target_restaurant_id
        )
        text = str(raw.get("text") or "").strip()
        if not text or len(text) > 180:
            raise ValueError("invalid LLM turn")
        return self._make_turn(
            restaurant.agent_id,
            text,
            speech_act,
            emotion,
            evidence_ids,
            target.agent_id if target and speech_act == "challenge" else None,
        )

    def _rule_restaurant_turn(self, state: SessionState, restaurant: Restaurant, user_text: str, target_id: str | None) -> TurnEnvelope:
        conflict = self._conflicting_allergy(restaurant, state.profile.allergies)
        positive = next((ev for ev in restaurant.evidence if ev.sentiment == "positive"), restaurant.evidence[0])
        evidence_ids = [positive.id]
        if conflict:
            line = f"先坦白说：你提到{conflict}过敏，我家部分菜品可能涉及，现场确认前我不会推荐相关菜。"
            return self._make_turn(restaurant.agent_id, line, "clarify", "thinking", evidence_ids)
        budget = state.profile.budget
        dish = restaurant.recommended_dishes[0]
        if target_id:
            target = self.repo.get(target_id)
            negative = next((ev for ev in target.evidence if ev.sentiment == "negative"), None)
            if negative:
                evidence_ids.append(negative.id)
                line = f"我家人均约{restaurant.avg_price}元，招牌是{dish}。不过你也要留意，{target.short_name}有顾客提到“{negative.quote[:24]}”。"
                return self._make_turn(restaurant.agent_id, line, "challenge", "confident", evidence_ids, target.agent_id)
        budget_note = "在你的预算内" if budget and restaurant.avg_price <= budget else f"人均约{restaurant.avg_price}元"
        line = f"我是{restaurant.short_name}，主打{restaurant.cuisine}，{budget_note}。我推荐{dish}；顾客原话里也提到了“{positive.quote[:28]}”。"
        return self._make_turn(restaurant.agent_id, line, "recommend", "happy", evidence_ids)

    def _judge_turn(self, state: SessionState) -> TurnEnvelope:
        if not state.active:
            return self._make_turn("host", "目前所有候选都已离场，暂时无法推荐。可以重新开始选择。", "clarify", "thinking", [])
        ranked = sorted((self._score(self.repo.get(item), state) for item in state.active), key=lambda item: item[0], reverse=True)
        _, chosen, reasons = ranked[0]
        line = f"综合你现在的偏好，我建议选{chosen.short_name}。主要因为{'、'.join(reasons[:2])}。如果这是过敏相关选择，到店仍要再次确认配料。"
        evidence = next((ev for ev in chosen.evidence if ev.sentiment == "positive"), chosen.evidence[0])
        return self._make_turn("host", line, "conclude", "confident", [evidence.id], chosen.agent_id, False)

    async def next_discussion(self, session_id: str) -> OrchestrationResult | None:
        """Advance one restaurant's discussion without inventing a user command."""
        state = self.store.get(session_id)
        if not state.active:
            return None
        index = state.discussion_index
        restaurant = self.repo.get(state.active[index % len(state.active)])
        others = [item for item in state.active if item != restaurant.id]
        target_id = others[0] if others else None
        degraded = None
        if self.llm and self.llm.configured:
            try:
                turn = await self._restaurant_turn(state, restaurant,
                    "继续自然讨论，回应上一位的具体观点，换一个新角度，不要重复自我介绍。", target_id)
            except Exception as exc:
                degraded = type(exc).__name__
                turn = self._discussion_rule_turn(state, restaurant, target_id)
        else:
            turn = self._discussion_rule_turn(state, restaurant, target_id)
        state.discussion_index += 1
        state.transcript.append({"role": "agent", **turn.public(), "turn": state.turn_index, "automatic": True})
        state.transcript = state.transcript[-100:]
        self.store.save(state)
        events = self._turn_events(turn)
        events.append(RealtimeEvent("room.snapshot", self.snapshot(state)))
        return OrchestrationResult(events, state, degraded)

    def _discussion_rule_turn(self, state: SessionState, restaurant: Restaurant, target_id: str | None) -> TurnEnvelope:
        round_index = state.discussion_index // max(1, len(state.active))
        positive = [ev for ev in restaurant.evidence if ev.sentiment == "positive"] or restaurant.evidence
        evidence = positive[round_index % len(positive)]
        refs = [evidence.id]
        conflict = self._conflicting_allergy(restaurant, state.profile.allergies)
        theme = round_index % 6
        dish = restaurant.recommended_dishes[round_index % len(restaurant.recommended_dishes)]
        if conflict:
            lines = [f"你有{conflict}过敏，我家资料里存在相关风险，我不能把相关菜当作安全选择。",
                     f"过敏这点我需要让步：我家可能涉及{conflict}，必须向门店确认配料和交叉接触。",
                     f"我不会继续推荐可能涉及{conflict}的菜。你也可以直接让我离场，缩小候选范围。"]
            line = lines[round_index % len(lines)]
        elif theme == 0:
            line = f"先看价格，我家人均约{restaurant.avg_price}元。" + (
                f"比你的预算高出{restaurant.avg_price - state.profile.budget}元，这点需要考虑。"
                if state.profile.budget and restaurant.avg_price > state.profile.budget
                else f"评论里有一句：“{evidence.quote[:24]}”。")
        elif theme == 1:
            line = f"换个角度看菜品，我家有{dish}。顾客的体验是：“{evidence.quote[:26]}”。"
        elif theme == 2:
            line = f"如果看重{state.profile.occasion or '用餐体验'}，我家的特点是{restaurant.highlights[round_index % len(restaurant.highlights)]}。不过评论只是参考，不能保证每次体验相同。"
        elif theme == 3:
            negative = next((ev for ev in restaurant.evidence if ev.sentiment == "negative"), None)
            if negative:
                refs = [negative.id]
                line = f"我也说一个短板，有顾客提到：“{negative.quote[:32]}”。你在决定前应该知道这一点。"
            else:
                line = f"也提醒一下，我家资料注明：{restaurant.cautions[round_index % len(restaurant.cautions)]}。"
        elif theme == 4 and target_id:
            target = self.repo.get(target_id)
            line = f"和{target.short_name}相比，我家人均{restaurant.avg_price}元，对方约{target.avg_price}元。价格差距可以帮助你取舍，口味则要看你更偏好哪种菜系。"
        else:
            line = f"再补充一条原评：“{evidence.quote[:34]}”。这是其他顾客的反馈，你可以点原评核对完整上下文。"
        return self._make_turn(restaurant.agent_id, line, "challenge" if target_id and theme == 4 else "present", "confident", refs,
                               self.repo.get(target_id).agent_id if target_id and theme == 4 else None)

    def _score(self, restaurant: Restaurant, state: SessionState) -> tuple[float, Restaurant, list[str]]:
        score = restaurant.rating * 10
        reasons: list[str] = [f"评分{restaurant.rating:.1f}"]
        if state.profile.budget:
            if restaurant.avg_price <= state.profile.budget:
                score += 12
                reasons.append("符合预算")
            else:
                score -= min(20, (restaurant.avg_price - state.profile.budget) / 5)
        if any(word in restaurant.cuisine for word in state.profile.cuisines):
            score += 10
            reasons.append("菜系匹配")
        conflict = self._conflicting_allergy(restaurant, state.profile.allergies)
        if conflict:
            score -= 100
            reasons.append(f"可能涉及{conflict}")
        return score, restaurant, reasons

    @staticmethod
    def _conflicting_allergy(restaurant: Restaurant, allergies: list[str]) -> str | None:
        haystack = " ".join([restaurant.cuisine, *restaurant.recommended_dishes, *restaurant.cautions])
        return next((allergy for allergy in allergies if allergy in haystack), None)

    def _turn_events(self, turn: TurnEnvelope) -> list[RealtimeEvent]:
        refs = [self.repo.evidence[evidence_id].public() for evidence_id in turn.evidence_ids if evidence_id in self.repo.evidence]
        events = [RealtimeEvent("speech.started", {"turn": turn.public()})]
        events.append(RealtimeEvent("speech.chunk", {"turnId": turn.turn_id, "text": turn.text}))
        if refs:
            events.append(RealtimeEvent("evidence.available", {"turnId": turn.turn_id, "evidence": refs}))
        events.append(RealtimeEvent("speech.ended", {"turnId": turn.turn_id, "speakerId": turn.speaker_id}))
        if turn.speech_act == "conclude":
            events.append(RealtimeEvent("decision.final", {"turn": turn.public()}))
        return events

    @staticmethod
    def _make_turn(
        speaker_id: str,
        text: str,
        speech_act: str,
        emotion: str,
        evidence_ids: list[str],
        target_agent_id: str | None = None,
        interruptible: bool = True,
    ) -> TurnEnvelope:
        return TurnEnvelope(
            turn_id=f"turn_{uuid.uuid4().hex[:12]}",
            speaker_id=speaker_id,
            text=text,
            speech_act=speech_act,  # type: ignore[arg-type]
            emotion=emotion,  # type: ignore[arg-type]
            target_agent_id=target_agent_id,
            evidence_ids=evidence_ids,
            visual_state=VISUAL_STATE[speech_act],
            interruptible=interruptible,
        )

