from __future__ import annotations

from .data import RestaurantRepository


class EvidenceVerifier:
    def __init__(self, repo: RestaurantRepository):
        self.repo = repo

    def valid_ids(self, evidence_ids: list[str], speaker_restaurant_id: str | None, target_restaurant_id: str | None = None) -> list[str]:
        allowed = {x for x in (speaker_restaurant_id, target_restaurant_id) if x}
        valid: list[str] = []
        for evidence_id in evidence_ids:
            evidence = self.repo.evidence.get(evidence_id)
            if evidence and evidence.restaurant_id in allowed and evidence_id not in valid:
                valid.append(evidence_id)
        return valid

