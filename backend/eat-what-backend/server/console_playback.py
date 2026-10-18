"""Conservative heard-text projection. No proportional character estimates."""
import re


def speech_units(text):
    # Keep the exact text, including punctuation. Decimal numbers stay together.
    return re.findall(r"[^，。！？；!?;\n]+[，。！？；!?;\n]*|[，。！？；!?;\n]+", text)


def sentence_units(text):
    """speech_units joined up to each sentence end (。！？!?\\n), exact text kept: the units for a TTS that needs the whole
    sentence for natural intonation. Heard-text accounting stays exact, at sentence rather than clause granularity."""
    units, current = [], ""
    for unit in speech_units(text):
        current += unit
        if re.search(r"[。！？!?\n]\s*$", unit):
            units.append(current)
            current = ""
    if current:
        units.append(current)
    return units


def heard_view(record):
    played = record.get("playedSamples", 0)
    complete = [u for u in record["units"] if u.get("sampleEnd") is not None and u["sampleStart"] < u["sampleEnd"] <= played]
    partial = next((u for u in record["units"] if u["sampleStart"] < played and
                    (u.get("sampleEnd") is None or u["sampleEnd"] > played)), None)
    return {"text": "".join(u["text"] for u in complete),
            "evidenceIds": sorted({fid for u in complete for fid in u["evidenceIds"]}),
            "playedSamples": played, "heardUnitCount": len(complete),
            "partialAudio": {"segmentId": partial["segmentId"], "playedSamplesInUnit": played - partial["sampleStart"],
                             "textAvailable": False, "note": "没有字级时间戳，未完整播放的小分句不计入历史文本"} if partial else None}
