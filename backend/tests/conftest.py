import os
import tempfile

# Isolated test DB, never touch the demo DB; never call external APIs.
os.environ["OFFLINE_MODE"] = "true"
import app.config as config  # noqa: E402
from pathlib import Path  # noqa: E402

config.DB_PATH = Path(tempfile.mkdtemp()) / "test.db"
