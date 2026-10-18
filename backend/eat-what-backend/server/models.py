from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal


SpeechAct = Literal["present", "recommend", "challenge", "defend", "clarify", "conclude"]
Emotion = Literal["neutral", "happy", "confident", "tense", "thinking"]


@dataclass(frozen=True)
class Evidence:
    id: str
    restaurant_id: str
    source_sheet: str
    source_row: int
    source_text: str
    quote: str
    highlight_start: int
    highlight_end: int
    sentiment: str
    tags: list[str] = field(default_factory=list)
    is_demo: bool = False

    def public(self, include_source: bool = False) -> dict[str, Any]:
        data = {
            "id": self.id,
            "restaurantId": self.restaurant_id,
            "sourceSheet": self.source_sheet,
            "sourceRow": self.source_row,
            "quote": self.quote,
            "highlightStart": self.highlight_start,
            "highlightEnd": self.highlight_end,
            "sentiment": self.sentiment,
            "tags": self.tags,
            "isDemo": self.is_demo,
        }
        if include_source:
            data["sourceText"] = self.source_text
        return data


@dataclass(frozen=True)
class Restaurant:
    id: str
    shop_uuid: str
    agent_id: str
    asset_id: str
    name: str
    short_name: str
    cuisine: str
    district: str
    address: str
    avg_price: int
    rating: float
    hours: str
    recommended_dishes: list[str]
    highlights: list[str]
    cautions: list[str]
    evidence: list[Evidence]
    is_demo: bool = False

    def public(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "shopUuid": self.shop_uuid,
            "agentId": self.agent_id,
            "assetId": self.asset_id,
            "name": self.name,
            "shortName": self.short_name,
            "cuisine": self.cuisine,
            "district": self.district,
            "address": self.address,
            "avgPrice": self.avg_price,
            "rating": self.rating,
            "hours": self.hours,
            "recommendedDishes": self.recommended_dishes,
            "highlights": self.highlights,
            "cautions": self.cautions,
            "isDemo": self.is_demo,
        }


@dataclass
class UserProfile:
    budget: int | None = None
    cuisines: list[str] = field(default_factory=list)
    allergies: list[str] = field(default_factory=list)
    dislikes: list[str] = field(default_factory=list)
    occasion: str | None = None
    location: str | None = None

    def public(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class SessionState:
    session_id: str
    active: list[str]
    holding: list[str]
    removed: list[str] = field(default_factory=list)
    profile: UserProfile = field(default_factory=UserProfile)
    transcript: list[dict[str, Any]] = field(default_factory=list)
    turn_index: int = 0
    discussion_index: int = 0


@dataclass(frozen=True)
class TurnEnvelope:
    turn_id: str
    speaker_id: str
    text: str
    speech_act: SpeechAct
    emotion: Emotion
    evidence_ids: list[str]
    visual_state: str
    target_agent_id: str | None = None
    interruptible: bool = True

    def public(self) -> dict[str, Any]:
        return {
            "turnId": self.turn_id,
            "speakerId": self.speaker_id,
            "text": self.text,
            "speechAct": self.speech_act,
            "emotion": self.emotion,
            "targetAgentId": self.target_agent_id,
            "evidenceIds": self.evidence_ids,
            "visualState": self.visual_state,
            "interruptible": self.interruptible,
        }


@dataclass(frozen=True)
class RealtimeEvent:
    type: str
    payload: dict[str, Any]

    def public(self) -> dict[str, Any]:
        return {"type": self.type, "payload": self.payload}

