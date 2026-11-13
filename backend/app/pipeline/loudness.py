"""Makes every voice clip loud enough for a phone speaker in a room.

Synthesised Urdu speech comes out around -22 LUFS (quiet, like a calm reading). Clips are raised to a streaming-style
-14 LUFS with a limiter so nothing clips. Measured and applied with ffmpeg; silently skipped when ffmpeg is missing.
"""
import json
import os
import shutil
import subprocess
from pathlib import Path

from .. import config

TARGET_I = -14.0      # integrated loudness, LUFS
TARGET_TP = -1.5      # true peak ceiling, dBFS


def ffmpeg() -> str | None:
    return shutil.which(config.FFMPEG_BIN) or shutil.which("ffmpeg")


def measure(path: Path) -> tuple[float, float] | None:
    """(integrated LUFS, true peak dBFS) or None when it cannot be measured."""
    f = ffmpeg()
    if not f:
        return None
    try:
        r = subprocess.run([f, "-nostats", "-hide_banner", "-i", str(path), "-af", "loudnorm=print_format=json", "-f", "null", "-"],
                           capture_output=True, text=True, timeout=60)
        js = json.loads(r.stderr[r.stderr.rfind("{"):r.stderr.rfind("}") + 1])
        i, tp = float(js["input_i"]), float(js["input_tp"])
        if i < -60 or i != i:   # silence or NaN
            return None
        return i, tp
    except (ValueError, KeyError, subprocess.SubprocessError, OSError):
        return None


BITRATE = "32k"       # plenty for speech; small enough to download quickly on a weak phone link
RATE = "22050"


def normalize(path: Path, target_i: float = TARGET_I, target_tp: float = TARGET_TP, force: bool = False) -> bool:
    """Raises (or lowers) the clip to target_i with a limiter at target_tp, encoded small for phones.
    True when the file changed. force re-encodes even when the loudness is already right."""
    m = measure(path)
    if not m:
        return False
    gain = target_i - m[0]
    if abs(gain) < 1.0 and not force:
        return False
    tmp = path.with_name(path.stem + ".norm" + path.suffix)
    try:
        subprocess.run([ffmpeg(), "-y", "-loglevel", "error", "-i", str(path),
                        "-af", f"volume={gain:.2f}dB,alimiter=limit={10 ** (target_tp / 20):.3f}:attack=5:release=60:level=false",
                        "-ac", "1", "-ar", RATE, "-b:a", BITRATE, str(tmp)], check=True, timeout=120)
        os.replace(tmp, path)
        return True
    except (subprocess.SubprocessError, OSError):
        tmp.unlink(missing_ok=True)
        return False
