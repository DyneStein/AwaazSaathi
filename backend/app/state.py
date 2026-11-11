"""Runtime state: offline switch + per-service health (shown on /admin)."""
import time

from .config import OFFLINE_MODE_DEFAULT

offline = {"on": OFFLINE_MODE_DEFAULT}
health: dict[str, dict] = {}


def is_offline() -> bool:
    return offline["on"]


def mark(service: str, ok: bool, detail: str = "", ms: int | None = None) -> None:
    health[service] = {"ok": ok, "detail": detail[:200], "ms": ms, "at": time.time()}
