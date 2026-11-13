"""Optional internet link: phones on any network (mobile data included) reach the demo over https.

Providers are tried in order (LINK_PROVIDERS, default "ngrok,cloudflare,localhostrun"); the first that works is used:
  ngrok         free account; with NGROK_AUTHTOKEN (and NGROK_DOMAIN) the address is FIXED, so QR codes never change
                and the link survives restarts. Install: brew install ngrok (Mac) or tools/ngrok.exe (Windows).
  cloudflare    Cloudflare quick tunnel, no account, random address each time. Install: brew install cloudflared.
  localhostrun  ssh-based, no account, random address. Uses the ssh that ships with macOS and Windows 10+.

Once asked for, a keeper thread owns the link: it tries every provider, retries, restarts the link when the
process dies (new address with the random providers), and reports its status for the Connect page.
The link is random and has no login, so it is shared only with the team and judges.
"""
import json
import os
import re
import shutil
import subprocess
import threading
import time
from pathlib import Path

from . import config

CF_RE = re.compile(r"https://(?!api\.)[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com")   # api.trycloudflare.com = error text
NGROK_RE = re.compile(r"https://[a-z0-9.-]+\.ngrok(?:-free)?\.(?:app|dev|io)")
# localhost.run gives <id>.lhr.life; its own pages (admin.localhost.run, sign-in) appear in the banner and are not links.
LHR_RE = re.compile(r"https://[a-z0-9-]+\.lhr\.life")
RETRY_EVERY_S = 30
VERIFY_S = 30      # how long a new link may take to start answering before it is rejected


def verify(url: str, budget_s: float = VERIFY_S) -> bool:
    """The link goes into the QR codes only after it really reaches this server (not a sign-in or error page)."""
    import httpx
    end = time.time() + budget_s
    while time.time() < end:
        try:
            r = httpx.get(url.rstrip("/") + "/api/health", timeout=6, follow_redirects=False,
                          headers={"ngrok-skip-browser-warning": "1"})
            if r.status_code == 200 and r.json().get("app") == "awaazsaathi":
                return True
        except Exception:  # noqa: BLE001 - not reachable yet (DNS still spreading, tunnel warming up)
            pass
        time.sleep(2)
    return False


class Provider:
    name = ""
    label = ""
    fixed = False          # a fixed address survives restarts
    tries = 1
    wait_s = 30.0

    def binary(self) -> str | None:
        return None

    def available(self) -> bool:
        return self.binary() is not None

    def command(self, port: int) -> list[str]:
        raise NotImplementedError

    def env(self) -> dict:
        return {}

    def url_from(self, line: str) -> str | None:
        return None

    def error_from(self, line: str) -> str | None:
        return None


def _find(*names: str) -> str | None:
    for n in names:
        c = shutil.which(n)
        if c:
            return c
    for n in names:
        for d in (config.ROOT / "tools", Path("/opt/homebrew/bin"), Path("/usr/local/bin")):
            p = d / (n + (".exe" if os.name == "nt" and not n.endswith(".exe") else ""))
            if p.is_file():
                return str(p)
    return None


class Ngrok(Provider):
    name, label, fixed, tries, wait_s = "ngrok", "ngrok", True, 2, 25.0 + VERIFY_S

    def binary(self):
        return _find("ngrok")

    def available(self):
        return bool(self.binary() and config.NGROK_AUTHTOKEN)

    def command(self, port):
        cmd = [self.binary(), "http", str(port), "--log", "stdout", "--log-format", "json"]
        if config.NGROK_DOMAIN:
            cmd += ["--url", config.NGROK_DOMAIN]
        return cmd

    def env(self):
        return {"NGROK_AUTHTOKEN": config.NGROK_AUTHTOKEN}

    def url_from(self, line):
        try:
            o = json.loads(line)
            if o.get("msg") == "started tunnel" and str(o.get("url", "")).startswith("https://"):
                return o["url"]
        except ValueError:
            pass
        m = NGROK_RE.search(line)
        return m.group(0) if m and "started tunnel" in line else None

    def error_from(self, line):
        try:
            o = json.loads(line)
            if o.get("lvl") in ("eror", "crit"):
                return str(o.get("err") or o.get("msg"))[:200]
        except ValueError:
            if "ERR_NGROK" in line or "error" in line.lower():
                return line.strip()[:200]
        return None


class Cloudflare(Provider):
    name, label, tries, wait_s = "cloudflare", "Cloudflare", 3, 35.0 + VERIFY_S

    def binary(self):
        return _find("cloudflared")

    def command(self, port):
        # http2 instead of the default QUIC (UDP): many campus and office networks block UDP.
        return [self.binary(), "tunnel", "--no-autoupdate", "--protocol", "http2", "--url", f"http://localhost:{port}"]

    def url_from(self, line):
        m = CF_RE.search(line)
        return m.group(0) if m else None

    def error_from(self, line):
        return line.strip()[-200:] if ("ERR" in line or "failed" in line) else None


class LocalhostRun(Provider):
    """ssh -R through localhost.run. Not exercised in this repo's own tests; it is the last fallback."""
    name, label, tries, wait_s = "localhostrun", "localhost.run", 1, 30.0 + VERIFY_S

    def binary(self):
        return _find("ssh")

    def command(self, port):
        return [self.binary(), "-T", "-o", "StrictHostKeyChecking=accept-new", "-o", "ServerAliveInterval=30",
                "-o", "ExitOnForwardFailure=yes", "-o", "ConnectTimeout=15", "-R", f"80:localhost:{port}", "nokey@localhost.run"]

    def url_from(self, line):
        m = LHR_RE.search(line)
        return m.group(0) if m else None

    def error_from(self, line):
        low = line.lower()
        return line.strip()[:200] if ("permission denied" in low or ("connection" in low and "closed" in low) or "could not resolve" in low) else None


ALL: dict[str, Provider] = {p.name: p for p in (Ngrok(), Cloudflare(), LocalhostRun())}


def providers() -> list[Provider]:
    return [ALL[n.strip()] for n in config.LINK_PROVIDERS if n.strip() in ALL]


# ---- state owned by the keeper thread ----
_lock = threading.Lock()
_proc: subprocess.Popen | None = None
_url: str | None = None
_provider: Provider | None = None
_error: str | None = None
_last = ""
_keep = False
_thread: threading.Thread | None = None
_phase = ""
_attempts = 0
_started_at = 0.0
_changes = 0
_rejected: set[str] = set()
_misses = 0
_checked = 0.0
_gen = 0          # each start() gets a new keeper; an older keeper sees the change and exits
CHECK_EVERY_S = 30
NO_TOOL = "No tunnel tool is installed. Mac: brew install cloudflared (or ngrok). The phone hotspot needs nothing."


def _url_file() -> Path:
    return config.VAR / "public_url.txt"


def running() -> bool:
    return _proc is not None and _proc.poll() is None


def status() -> dict:
    on = running() and bool(_url)
    avail = [p.name for p in providers() if p.available()]
    return {"available": bool(avail), "providers": avail, "running": on, "url": _url if on else None,
            "provider": _provider.label if on and _provider else None, "fixed": bool(on and _provider and _provider.fixed),
            "keeping": _keep, "phase": _phase if _keep and not on else "", "attempts": _attempts, "error": _error,
            "since": _started_at if on else None, "changes": _changes, "rejected": sorted(_rejected)[-3:]}


def public_url() -> str | None:
    """The link from this server's own tunnel, or one written by an outside script into var/public_url.txt."""
    if running() and _url:
        return _url
    try:
        u = _url_file().read_text("utf-8").strip()
    except OSError:
        return None
    return u if u.startswith("https://") else None


def _notify() -> None:
    try:
        from .ws import hub
        hub.publish("status", "link", status())
    except Exception:  # noqa: BLE001
        pass


def _reader(p: subprocess.Popen, prov: Provider) -> None:
    global _url, _last, _changes, _started_at, _error, _phase
    for line in p.stdout:  # type: ignore[union-attr]
        err = prov.error_from(line)
        if err:
            _last = err
        u = prov.url_from(line)
        if u and u != _url and p is _proc and u not in _rejected:
            if not verify(u):
                _rejected.add(u)
                _last = f"{u} did not reach AwaazSaathi, ignored"
                continue
            if p is not _proc:
                return
            _url, _started_at, _error, _phase = u, time.time(), None, ""
            _changes += 1
            try:
                _url_file().write_text(u, "utf-8")
            except OSError:
                pass
            _notify()


def _launch(prov: Provider, port: int) -> None:
    global _proc, _url, _last, _provider
    _url, _last, _provider = None, "", prov
    _rejected.clear()   # per attempt: a fixed address that failed once may well work on the next try
    flags = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}
    env = {**os.environ, **prov.env()}
    _proc = subprocess.Popen(prov.command(port), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                             text=True, env=env, **flags)
    threading.Thread(target=_reader, args=(_proc, prov), daemon=True).start()


def _kill() -> None:
    global _proc, _url
    with _lock:
        if _proc is not None and _proc.poll() is None:
            _proc.terminate()
            try:
                _proc.wait(5)
            except subprocess.TimeoutExpired:
                _proc.kill()
        had = bool(_url)
        _proc, _url = None, None
        try:
            _url_file().unlink()
        except OSError:
            pass
    if had:
        _notify()


def _attempt_all(port: int, gen: int) -> bool:
    """Tries every available tool once per round (up to each tool's tries), so one failing tool never holds up
    the next. True when a verified link is up."""
    global _error, _phase, _attempts
    avail = [p for p in providers() if p.available()]
    if not avail:
        _error = NO_TOOL
        return False
    for rnd in range(max(p.tries for p in avail)):
        for prov in [p for p in avail if rnd < p.tries]:
            if not _keep or gen != _gen:
                return False
            _attempts += 1
            _phase = f"Trying {prov.label}" + (f", round {rnd + 1}" if rnd else "")
            _notify()
            with _lock:
                _launch(prov, port)
            end = time.time() + prov.wait_s
            while time.time() < end and running() and not _url and _keep and gen == _gen:
                time.sleep(0.3)
            if gen != _gen:
                return False
            if _url:
                _error = None
                _phase = ""
                return True
            _kill()
            _error = f"{prov.label} did not start" + (f": {_last}" if _last else "")
    return False


def _keeper(port: int, gen: int) -> None:
    global _phase, _error, _misses, _checked
    while _keep and gen == _gen:
        if not running():
            if _url is not None:
                _error = "The link dropped and is being replaced."
                _kill()
            if not _attempt_all(port, gen):
                # Nothing worked: say so, wait, and try again. Phones can use the hotspot meanwhile.
                _phase = f"No link yet. Trying again in {RETRY_EVERY_S} s."
                _notify()
                for _ in range(RETRY_EVERY_S * 2):
                    if not _keep or gen != _gen:
                        break
                    time.sleep(0.5)
                continue
        # Health check: a tunnel can stay "running" while no traffic gets through.
        if _url and running() and time.time() - _checked > CHECK_EVERY_S:
            _checked = time.time()
            _misses = 0 if verify(_url, budget_s=8) else _misses + 1
            if _misses >= 3:
                _error = "The link stopped answering and is being replaced."
                _misses = 0
                _notify()
                _kill()
                continue
        time.sleep(0.5)
    if gen == _gen:
        _kill()


def start(port: int | None = None, wait_s: float = 3.0) -> dict:
    """Asks for a link and returns quickly; the keeper thread does the work and the page polls status()."""
    global _keep, _thread, _error, _attempts, _phase, _gen, _misses, _checked
    port = port or int(os.getenv("AWAAZ_PORT", "8000"))
    if running() and _url:
        return status()
    if not any(p.available() for p in providers()):
        _error = NO_TOOL
        return status()
    _gen += 1
    _keep, _error, _attempts, _phase, _misses, _checked = True, None, 0, "Starting", 0, 0.0
    _thread = threading.Thread(target=_keeper, args=(port, _gen), daemon=True)
    _thread.start()
    end = time.time() + wait_s   # a short wait so a fast link is reported in the same request
    while time.time() < end and not (running() and _url):
        time.sleep(0.2)
    return status()


def stop() -> dict:
    global _keep, _phase, _error, _gen
    _gen += 1
    _keep, _phase, _error = False, "", None
    _kill()
    return status()
