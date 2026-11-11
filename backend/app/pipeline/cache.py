"""File-based cache for every external AI call, keyed by a hash of the input.

Lives in backend/media/cache (committed), so it survives demo resets and a fresh clone
replays rehearsed answers even with no internet."""
import hashlib
import json

from ..config import MEDIA

CACHE_DIR = MEDIA / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)


def key(*parts: str | bytes) -> str:
    h = hashlib.sha256()
    for p in parts:
        h.update(p if isinstance(p, bytes) else p.encode("utf-8"))
        h.update(b"\x00")
    return h.hexdigest()[:32]


def get(k: str):
    f = CACHE_DIR / f"{k}.json"
    if f.exists():
        try:
            return json.loads(f.read_text("utf-8"))
        except Exception:
            return None
    return None


def put(k: str, value) -> None:
    (CACHE_DIR / f"{k}.json").write_text(json.dumps(value, ensure_ascii=False, indent=1), "utf-8")
