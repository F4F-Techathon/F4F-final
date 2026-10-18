import unittest

from server.console_evidence import check_segment, repair_requirements


class EvidenceChecks(unittest.TestCase):
    def setUp(self):
        self.facts = [{"id": "avg", "quote": "参考人均33元"}, {"id": "dish", "quote": "鸡腿堡资料菜价38元"}]

    def test_existing_but_uncited_price_is_rejected_with_actionable_reason(self):
        result = check_segment({"text": "鸡腿堡38元", "evidenceIds": ["avg"]}, self.facts)
        self.assertFalse(result["passed"])
        self.assertEqual(["38"], result["invalidNumbers"])
        self.assertEqual(["dish"], result["availableCitations"]["38"])
        self.assertTrue(result["reasons"])

    def test_correct_reference_passes_and_decimal_format_is_normalized(self):
        result = check_segment({"text": "鸡腿堡38.00元", "evidenceIds": ["dish"]}, self.facts)
        self.assertTrue(result["passed"])

    def test_unknown_id_is_not_silently_dropped(self):
        result = check_segment({"text": "人均33元", "evidenceIds": ["avg", "invented"]}, self.facts)
        self.assertFalse(result["passed"])
        self.assertEqual(["invented"], result["unknownEvidenceIds"])

    def test_style_repair_identifies_actual_phrase_without_changing_citations(self):
        edits = repair_requirements({'reasons': ['转述口吻'], 'forbiddenPhrases': ['评论里'], 'invalidNumbers': []})
        self.assertIn('评论里', edits[-1])
        self.assertIn('删掉并重组', edits[-1])
        self.assertIn('证据ID保留', edits[-1])
