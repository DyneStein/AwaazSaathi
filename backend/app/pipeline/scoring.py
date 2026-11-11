"""Expert scoring & promotion. Score = share of reviewed answers the senior approved WITHOUT major edits.
Volume does not raise the score; rejections lower it."""
from difflib import SequenceMatcher

from .. import config


def edit_ratio(draft: str, final: str) -> float:
    """0 = identical, 1 = completely different."""
    return 1.0 - SequenceMatcher(None, draft or "", final or "").ratio()


def outcome(action: str, ratio: float) -> str:
    if action == "reject":
        return "rejected"
    return "major_edit" if ratio > config.MAJOR_EDIT_RATIO else "clean"


def score(clean: int, reviewed: int) -> float:
    return round(clean / reviewed, 3) if reviewed else 0.0


def apply_outcome(expert, result: str) -> None:
    expert.reviewed_count += 1
    if result == "clean":
        expert.clean_count += 1
    elif result == "rejected":
        expert.rejected_count += 1


def next_level(level: str, reviewed: int, sc: float) -> str | None:
    rule = config.PROMOTION.get(level)
    if rule and reviewed >= rule["min_reviewed"] and sc >= rule["min_score"]:
        return rule["to"]
    return None


def progress(level: str, reviewed: int, sc: float) -> dict:
    rule = config.PROMOTION.get(level)
    if not rule:
        return {"next": None}
    return {"next": rule["to"], "reviewed": reviewed, "need_reviewed": rule["min_reviewed"],
            "score": sc, "need_score": rule["min_score"],
            "pct": round(min(1.0, reviewed / rule["min_reviewed"]) * 100)}


def can_handle(level: str, route: str) -> bool:
    """Who may give the FINAL answer for a route. Juniors only draft; senior-only topics need a senior."""
    if route == "senior_only":
        return level == "senior"
    return level in ("verified", "senior")
