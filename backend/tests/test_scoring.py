from app import config
from app.pipeline import scoring


class E:
    def __init__(self, level="junior", reviewed=0, clean=0, rejected=0):
        self.level, self.reviewed_count, self.clean_count, self.rejected_count = level, reviewed, clean, rejected


def test_edit_ratio_and_outcome():
    assert scoring.edit_ratio("abc", "abc") == 0
    assert scoring.outcome("approve", 0.0) == "clean"
    assert scoring.outcome("edit_approve", 0.05) == "clean"          # small fix still counts as clean
    assert scoring.outcome("edit_approve", config.MAJOR_EDIT_RATIO + 0.1) == "major_edit"
    assert scoring.outcome("reject", 0.0) == "rejected"


def test_score_is_quality_not_volume():
    a, b = E(), E()
    for _ in range(10):
        scoring.apply_outcome(a, "clean")
    for o in ["clean"] * 30 + ["major_edit"] * 20:
        scoring.apply_outcome(b, o)
    assert scoring.score(a.clean_count, a.reviewed_count) == 1.0
    assert scoring.score(b.clean_count, b.reviewed_count) == 0.6     # more answers, lower score


def test_rejection_lowers_score():
    e = E(reviewed=10, clean=9)
    before = scoring.score(e.clean_count, e.reviewed_count)
    scoring.apply_outcome(e, "rejected")
    assert scoring.score(e.clean_count, e.reviewed_count) < before and e.rejected_count == 1


def test_promotion_thresholds():
    rule = config.PROMOTION["junior"]
    assert scoring.next_level("junior", rule["min_reviewed"], rule["min_score"]) == "verified"
    assert scoring.next_level("junior", rule["min_reviewed"] - 1, 1.0) is None       # not enough reviewed
    assert scoring.next_level("junior", rule["min_reviewed"], rule["min_score"] - 0.01) is None  # quality too low
    vr = config.PROMOTION["verified"]
    assert scoring.next_level("verified", vr["min_reviewed"], vr["min_score"]) == "senior"
    assert scoring.next_level("senior", 1000, 1.0) is None


def test_permissions():
    assert not scoring.can_handle("junior", "junior")
    assert scoring.can_handle("verified", "junior")
    assert not scoring.can_handle("verified", "senior_only")
    assert scoring.can_handle("senior", "senior_only")
