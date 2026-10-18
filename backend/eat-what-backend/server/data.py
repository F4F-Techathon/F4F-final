from __future__ import annotations

import json
from pathlib import Path

from .models import Evidence, Restaurant


class RestaurantRepository:
    def __init__(self, path: Path):
        raw = json.loads(path.read_text(encoding="utf-8"))
        self.source = raw.get("source", {})
        self.restaurants: dict[str, Restaurant] = {}
        self.evidence: dict[str, Evidence] = {}
        for item in raw["restaurants"]:
            evidence = [
                Evidence(
                    id=e["id"],
                    restaurant_id=item["id"],
                    source_sheet=e["sourceSheet"],
                    source_row=int(e["sourceRow"]),
                    source_text=e["sourceText"],
                    quote=e["quote"],
                    highlight_start=int(e["highlightStart"]),
                    highlight_end=int(e["highlightEnd"]),
                    sentiment=e["sentiment"],
                    tags=list(e.get("tags", [])),
                    is_demo=bool(e.get("isDemo", item.get("isDemo", False))),
                )
                for e in item.get("evidence", [])
            ]
            restaurant = Restaurant(
                id=item["id"],
                shop_uuid=item["shopUuid"],
                agent_id=item["agentId"],
                asset_id=item["assetId"],
                name=item["name"],
                short_name=item["shortName"],
                cuisine=item["cuisine"],
                district=item["district"],
                address=item["address"],
                avg_price=int(item["avgPrice"]),
                rating=float(item["rating"]),
                hours=item["hours"],
                recommended_dishes=list(item["recommendedDishes"]),
                highlights=list(item["highlights"]),
                cautions=list(item["cautions"]),
                evidence=evidence,
                is_demo=bool(item.get("isDemo", False)),
            )
            self.restaurants[restaurant.id] = restaurant
            for ev in evidence:
                if ev.id in self.evidence:
                    raise ValueError(f"duplicate evidence id: {ev.id}")
                self.evidence[ev.id] = ev

    def ordered_ids(self) -> list[str]:
        return list(self.restaurants)

    def get(self, restaurant_id: str) -> Restaurant:
        return self.restaurants[restaurant_id]

    def by_agent(self, agent_id: str) -> Restaurant | None:
        return next((r for r in self.restaurants.values() if r.agent_id == agent_id), None)

    def public_restaurants(self) -> list[dict]:
        return [r.public() for r in self.restaurants.values()]

