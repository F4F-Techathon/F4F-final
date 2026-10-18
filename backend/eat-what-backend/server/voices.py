"""A voice per restaurant, from the frontend's description of its host (gender, age, language).

Without that description the delivered rotation stays (rong, hua, pierre by list position). With it, each host gets
a voice of its gender and, where the provider has enough, one nobody else on stage is using. A host who speaks
粤语 (console_localize) gets the system's Cantonese voice when it has one of that host's gender: macOS has a female one.
On DashScope (百炼 Qwen3-TTS) every regional host whose dialect has a cloud voice speaks with it (DIALECT_POOLS), of
the host's gender when there is one; a dialect without a cloud voice keeps its dialect wording in a Mandarin voice.
"""
from __future__ import annotations

import re

from .console_localize import LANGUAGES
from .providers.macos_tts import FEMALE, MALE, OLD

ROTATION = ["rong", "hua", "pierre"]
# CosyVoice and the Windows voices both take the delivered reference ids.
POOLS = {
    "macos-say": {"female": FEMALE, "male": MALE, "old_female": [OLD["female"]], "old_male": [OLD["male"]]},
    "default": {"female": ["rong"], "male": ["hua", "pierre"], "old_female": [], "old_male": []},
    # Qwen3-TTS system voices that speak Mandarin (providers/dashscope_tts.py).
    "dashscope-qwen-tts": {"female": ["Cherry", "Serena", "Chelsie", "Momo", "Vivian", "Maia"],
                           "male": ["Ethan", "Moon", "Kai", "Ryan", "Aiden", "Vincent"],
                           "old_female": [], "old_male": ["Eldric Sage"]},
}
ROTATIONS = {"dashscope-qwen-tts": ["Cherry", "Ethan", "Serena"]}
# Qwen3-TTS dialect voices by the frontend's language id: a regional host speaks with these whatever voices are free.
# 甘肃话、宁夏话 have no voice of their own and take the nearest northwestern one, 陕西话.
DIALECT_POOLS = {
    "dashscope-qwen-tts": {
        "sc": {"male": ["Eric"], "female": ["Sunny"]}, "yue": {"male": ["Rocky"], "female": ["Kiki"]},
        "shanghai": {"female": ["Jada"]}, "minnan": {"male": ["Roy"]}, "tianjin": {"male": ["Peter"]},
        "shaanxi": {"male": ["Marcus"]}, "gansu": {"male": ["Marcus"]}, "ningxia": {"male": ["Marcus"]},
    },
}
# Voices for a language other than Mandarin, by provider and gender.
DIALECT_VOICES = {"macos-say": {("yue", "female"): "Sinji"}}
NAME = re.compile(r"^[^\x00-\x1f\x7f]{1,12}$")


def parse_characters(value, ids):
    """The frontend's hosts, by restaurant id: {characterName?, gender?, age?, language?}. Anything malformed is left out;
    `language` is kept only for a dialect the localizer rewrites into."""
    if not isinstance(value, dict):
        return {}
    characters = {}
    for sid, item in value.items():
        if sid not in ids or not isinstance(item, dict):
            continue
        entry = {}
        name = item.get("characterName")
        if isinstance(name, str) and NAME.match(name.strip()):
            entry["characterName"] = name.strip()
        if item.get("gender") in {"female", "male"}:
            entry["gender"] = item["gender"]
        if item.get("age") in {"young", "middle", "old"}:
            entry["age"] = item["age"]
        if item.get("language") in LANGUAGES:
            entry["language"] = item["language"]
        if entry:
            characters[sid] = entry
    return characters


def assign_voices(provider, ids, characters):
    pools = POOLS.get(provider, POOLS["default"])
    voices, used = {}, set()
    rotation = ROTATIONS.get(provider, ROTATION)
    for index, sid in enumerate(ids):
        character = characters.get(sid, {})
        gender = character.get("gender")
        # The accent matters more than a unique voice: two Sichuan hosts may share one, a male Shanghainese host takes
        # the only (female) Shanghainese voice.
        dialects = DIALECT_POOLS.get(provider, {}).get(character.get("language"))
        if dialects:
            own = dialects.get(gender) or next(iter(dialects.values()))
            voice = next((v for v in own if v not in used), own[0])
            voices[sid] = voice
            used.add(voice)
            continue
        if gender not in {"female", "male"}:
            voices[sid] = rotation[index % len(rotation)]
            continue
        older = pools["old_" + gender] if character.get("age") == "old" else []
        dialect = DIALECT_VOICES.get(provider, {}).get((character.get("language"), gender))
        candidates = [*([dialect] if dialect else []), *older, *pools[gender]] or ROTATION
        voice = next((v for v in candidates if v not in used), candidates[index % len(candidates)])
        voices[sid] = voice
        used.add(voice)
    return voices
