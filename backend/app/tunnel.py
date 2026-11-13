"""Optional internet link for the demo: a free Cloudflare quick tunnel (no account, no key).

Phones on any network can then open the apps at https://<random>.trycloudflare.com. Because that link is HTTPS,
phone browsers also allow the microphone, which they block on a plain http://<LAN IP> address.
The link is random and changes every time; it stops when the server stops.
"""
import os
import re
import shutil
import subprocess
import threading
import time
from pathlib import Path

from . import config

# The link is <words-with-hyphens>.trycloudflare.com. api.trycloudflare.com appears in error messages and is not a link.
URL_RE = re.compile(r"https://(?!api\.)[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com")
_lock = threading.Lock()
_proc: subprocess.Popen | None = None
_url: str | None = None
_error: str | None = None
_last = ""


def binary() -> str | None:
    for c in (shutil.which("cloudflared"), "/opt/homebrew/bin/cloudflared", "/usr/local/bin/cloudflared",
              str(config.ROOT / "tools" / "cloudflared.exe")):
        if c and Path(c).is_file():
            return c
    return None


def _url_file() -> Path:
    return config.VAR / "public_url.txt"


def running() -> bool:
    return _proc is not None and _proc.poll() is None


def status() -> dict:
    return {"available": binary() is not None, "running": running(), "url": _url if running() else None, "error": _error}


def _reader(p: subprocess.Popen) -> None:
    global _url, _last
    for line in p.stdout:  # type: ignore[union-attr]
        if "ERR" in line or "failed" in line:
            _last = line.strip()[-200:]
        m = URL_RE.search(line)
        if m and not _url and p is _proc:
            _url = m.group(0)
            try:
                _url_file().write_text(_url, "utf-8")
            except OSError:
                pass


def _launch(b: str, port: int) -> None:
    global _proc, _url, _last
    _url, _last = None, ""
    flags = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}
    # http2 instead of the default QUIC (UDP): many campus and office networks block UDP.
    _proc = subprocess.Popen([b, "tunnel", "--no-autoupdate", "--protocol", "http2", "--url", f"http://localhost:{port}"],
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, **flags)
    threading.Thread(target=_reader, args=(_proc,), daemon=True).start()


def start(port: int | None = None, wait_s: float = 35, tries: int = 2) -> dict:
    global _error
    port = port or int(os.getenv("AWAAZ_PORT", "8000"))
    b = binary()
    if not b:
        _error = "cloudflared is not installed (Mac: brew install cloudflared)"
        return status()
    if running() and _url:
        return status()
    for attempt in range(tries):
        with _lock:
            _error = None
            _launch(b, port)
        end = time.time() + wait_s
        while time.time() < end and running() and not _url:
            time.sleep(0.3)
        if _url and running():
            return status()
        stop()   # failed or timed out: clean up before trying again
    hint = f" ({_last})" if _last else ""
    _error = "The internet link did not start: Cloudflare did not answer in time. Check the internet connection and press the button again." + hint
    return status()


def stop() -> dict:
    global _proc, _url
    with _lock:
        if _proc is not None and _proc.poll() is None:
            _proc.terminate()
            try:
                _proc.wait(5)
            except subprocess.TimeoutExpired:
                _proc.kill()
        _proc, _url = None, None
        try:
            _url_file().unlink()
        except OSError:
            pass
    return status()


def public_url() -> str | None:
    """The link from this server's own tunnel, or one written by scripts/share-online.sh."""
    if running() and _url:
        return _url
    try:
        u = _url_file().read_text("utf-8").strip()
    except OSError:
        return None
    return u if u.startswith("https://") else None
