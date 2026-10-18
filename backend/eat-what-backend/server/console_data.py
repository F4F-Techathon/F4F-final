"""Read the supplied CSV snapshot; identity and facts never come from an avatar."""
from __future__ import annotations

import csv
import hashlib
import re
from pathlib import Path
from .console_persona import build_persona
from .console_reviews import review_insights


class ConsoleData:
    def __init__(self, directory: Path):
        self.directory = directory
        self.shops = {}
        self.facts = {}
        self.version = hashlib.sha256(b"".join(p.read_bytes() for p in sorted(directory.glob("*.csv")))).hexdigest()[:12]
        self.counts = {}
        self.skipped = {}
        for name in ("商户基础信息", "推荐菜", "最新评论", "差评", "代金券", "到店套餐"):
            with (directory / f"{name}.csv").open(encoding="utf-8-sig", newline="") as f:
                rows = list(csv.DictReader(f))
            self.counts[name] = len(rows)
            for row, raw in enumerate(rows, 2):
                sid = raw["shop_uuid"]
                # A scrape can hold dishes or reviews of a shop that is not in the shop list; those rows are skipped.
                if name != "商户基础信息" and sid not in self.facts:
                    self.skipped[name] = self.skipped.get(name, 0) + 1
                    continue
                if name == "商户基础信息":
                    self.shops[sid] = {
                        "id": sid, "name": raw["shop_name"], "category": raw["category"],
                        "avgPrice": float(raw["avg_price"]) if raw["avg_price"] else None,
                        "address": raw["address"], "hours": raw["business_time"],
                        "scoreText": raw["score"], "coordinates": [float(raw["lng"]), float(raw["lat"])],
                    }
                    self.facts[sid] = []
                    for field, text in [("avg_price", f"参考人均{raw['avg_price']}元"), ("category", raw["category"]), ("business_time", raw["business_time"])]:
                        self._add(sid, f"shop:{sid}:{field}", "shop", text, name, row, field)
                elif name == "推荐菜":
                    price = f"，资料菜价{raw['price']}元" if raw["price"] else "，菜价未提供"
                    self._add(sid, f"dish:{sid}:{raw['dish_id']}", "dish", raw["dish_name"] + price, name, row, "dish_name/price")
                elif name in ("最新评论", "差评"):
                    fid = f"review:{sid}:{raw['review_id']}"
                    old = next((f for f in self.facts[sid] if f["id"] == fid), None)
                    if old:
                        old["sources"].append({"file": name + ".csv", "row": row})
                        continue
                    self._add(sid, fid, "review", raw["content"], name, row, "content",
                              dateRaw=raw["time"], star=raw["star"], sourceLabel=name,
                              reviewInsights=review_insights(raw['content']))
                else:
                    coupon = name == "代金券"
                    fid = raw["coupon_id" if coupon else "meal_id"]
                    label = raw["coupon_name" if coupon else "meal_name"]
                    text = f"{label}，资料售价{raw['price']}元，展示面额/原价{raw['value']}元；使用规则和有效期未提供"
                    self._add(sid, f"offer:{sid}:{fid}", "coupon" if coupon else "package", text, name, row, "name/price/value")

    def _add(self, sid, fid, kind, text, source, row, field, **extra):
        self.facts[sid].append({"id": fid, "restaurantId": sid, "kind": kind, "quote": text,
                                "sourceFile": source + ".csv", "sourceRow": row, "sourceField": field,
                                "sources": [{"file": source + ".csv", "row": row}], **extra})

    def persona(self, sid, override=None):
        return build_persona(self.shops[sid], self.version, override)

    def select(self, sid, index, used, query=""):
        facts = self.facts[sid]
        terms = [t for t in ("服务", "环境", "安静", "价格", "套餐", "菜", "辣") if t in query]
        related = [f for f in facts if terms and any(t in f["quote"] for t in terms) and f["id"] not in used]
        if related:
            return related[:2]
        kinds = ["shop", "dish", "review", "package", "coupon"]
        for offset in range(len(kinds)):
            kind = kinds[(index + offset) % len(kinds)]
            candidates = [f for f in facts if f["kind"] == kind and f["id"] not in used]
            if candidates:
                return candidates[:1]
        return []

    def preference_candidates(self, sid, index, used, preferences, query="", recent_dialogue=()):
        """Mix preference relevance, current debate and unexplored evidence."""
        text = query + ' ' + ' '.join(preferences.get('userNotes', []))
        topics = ('价格', '省钱', '便宜', '预算', '安静', '环境', '吵', '服务', '聚餐', '约会',
                  '海鲜', '三文鱼', '鸡', '牛肉', '面', '三明治', '汉堡', '辣', '清淡', '素食', '套餐')
        terms = [t for t in topics if t in text]
        # Match user-mentioned dishes too, without sending every review to the LLM.
        chunks = re.findall(r'[\u4e00-\u9fff]{2,}', text)
        terms += [part[i:i+2] for part in chunks for i in range(len(part)-1)
                  if part[i:i+2] not in {'我想', '想吃', '吃点', '不要', '你们', '这个', '可以', '一下', '一点', '今天'}]
        fresh = self.select(sid, index, used, query)
        fresh_ids = {f['id'] for f in fresh}
        recent_text = ' '.join(h.get('text', '') for h in recent_dialogue[-2:])
        debate_terms = [t for t in topics if t in recent_text]
        def score(fact):
            quote, kind = fact['quote'], fact['kind']
            value = min(5, sum(1 for t in set(terms) if t in quote))
            value += min(6, sum(2 for t in debate_terms if t in quote))
            if preferences.get('maxBudget') or any(t in text for t in ('省钱', '便宜', '价格')):
                value += 5 if fact.get('sourceField') == 'avg_price' else 2 if kind in {'dish', 'package', 'coupon'} else 0
            if preferences.get('quiet') and kind == 'review':
                value += 5 if any(t in quote for t in ('安静', '吵', '嘈杂', '环境')) else 0
            if preferences.get('noSpice') and any(t in quote for t in ('辣', '清淡')):
                value += 5
            value += 1 if kind == 'shop' else 0
            value += 2 if fact['id'] in fresh_ids else 0
            value -= 7 if fact['id'] in used else 0
            return value
        ranked = sorted(self.facts[sid], key=score, reverse=True)
        selected, counts = [], {}
        def add(fact):
            if fact['id'] in {f['id'] for f in selected}:
                return
            selected.append(fact)
            counts[fact['kind']] = counts.get(fact['kind'], 0) + 1
        # Good reviews expose selling points; critical passages support replies
        # and attacks. Diversify the actual review dimensions, not file labels.
        covered = set()
        for polarity, count in (('praise', 3), ('criticism', 2)):
            for _ in range(count):
                choices = [f for f in ranked if f['kind'] == 'review' and f.get('reviewInsights', {}).get(polarity)
                           and f['id'] not in {x['id'] for x in selected}]
                if not choices:
                    break
                def review_score(f):
                    dimensions = {p['dimension'] for p in f['reviewInsights'][polarity]}
                    return score(f) + 5 * len(dimensions - covered)
                chosen = max(choices, key=review_score)
                add(chosen)
                covered.update(p['dimension'] for p in chosen['reviewInsights'][polarity])
        for kind in ('dish', 'package', 'coupon', 'review'):
            choice = next((f for f in ranked if f['kind'] == kind and f['id'] not in used
                           and f['id'] not in {x['id'] for x in selected}), None)
            if choice:
                add(choice)
        for fact in ranked:
            if len(selected) >= 10:
                break
            kind = fact['kind']
            if counts.get(kind, 0) >= (6 if kind == 'review' else 3):
                continue
            add(fact)
        return selected, [f['id'] for f in selected if f['id'] not in used]
