import os
import tempfile

# Isolated test DB and upload folders, never touch the demo data; never call external APIs or local models.
os.environ["OFFLINE_MODE"] = "true"
import app.config as config  # noqa: E402
from pathlib import Path  # noqa: E402

_tmp = Path(tempfile.mkdtemp())
config.DB_PATH = _tmp / "test.db"
config.UPLOAD_DIR = _tmp / "uploads"
config.RECORDING_DIR = _tmp / "recordings"
config.UPLOAD_DIR.mkdir()
config.RECORDING_DIR.mkdir()
config.LLM_ORDER = []      # rules only: tests must not depend on a local model being installed
config.STT_ORDER = []

import app.pipeline.cache as _cache  # noqa: E402

_cache.CACHE_DIR = _tmp / "cache"   # never replay answers cached from real model runs
_cache.CACHE_DIR.mkdir()

import pytest  # noqa: E402


@pytest.fixture()
def client():
    """A fresh, re-seeded app for every test."""
    from fastapi.testclient import TestClient

    from app import seed, state
    from app.main import app
    state.offline["on"] = True
    config.RETRIEVAL_MIN, config.GROUNDING_MIN = 0.30, 0.6
    with TestClient(app) as c:
        seed.run()
        yield c
