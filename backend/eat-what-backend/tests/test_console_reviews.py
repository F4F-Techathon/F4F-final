import unittest

from server.console_reviews import review_insights
from server.realtime_console import catalog


class ReviewRetrievalTests(unittest.TestCase):
    def test_mixed_review_keeps_specific_positive_and_negative_passages(self):
        text = '鱼肉很新鲜，座位宽敞，不过上菜慢，服务员倒水不及时。'
        hints = review_insights(text)
        self.assertTrue({'食材', '座位'} <= {p['dimension'] for p in hints['praise']})
        self.assertTrue({'上菜', '服务'} <= {p['dimension'] for p in hints['criticism']})
        for points in hints.values():
            for point in points:
                self.assertIn(point['snippet'], text)

    def test_negated_complaints_are_not_attack_material(self):
        for text in ('口味不会过于油腻', '价格不太贵', '环境不会很吵'):
            with self.subTest(text=text):
                self.assertFalse(review_insights(text)['criticism'])
        self.assertTrue(review_insights('鱼肉不太新鲜')['criticism'])
        self.assertFalse(review_insights('没有特别好吃')['praise'])
        mixed = review_insights('环境不错 确实比较安静 服务员倒水不够及时')
        self.assertNotIn('环境', {p['dimension'] for p in mixed['criticism']})

    def test_candidate_pool_contains_review_breadth_and_original_prices(self):
        sid = next(iter(catalog.shops))
        records, _ = catalog.preference_candidates(sid, 0, set(), {})
        positive = {p['dimension'] for f in records for p in f.get('reviewInsights', {}).get('praise', [])}
        negative = [p for f in records for p in f.get('reviewInsights', {}).get('criticism', [])]
        self.assertGreaterEqual(len(positive), 3)
        self.assertTrue(negative)
        self.assertTrue(any(f.get('sourceField') == 'avg_price' for f in records))
        self.assertLessEqual(len(records), 10)

    def test_concrete_food_and_reception_complaints_are_retrievable(self):
        mold = review_insights('馒头发霉了哦')
        self.assertEqual('食材', mold['criticism'][0]['dimension'])
        self.assertFalse(review_insights('馒头没有发霉')['criticism'])
        self.assertEqual('服务', review_insights('7点到门口无人接待')['criticism'][0]['dimension'])
