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
LHR_RE = re.compile(r"https://[a-z0-9-]+(?:\.[a-z0-9-]+)*\.lhr\.life")   # e.g. https://b9ee5b69cd6710.app.lhr.life
RETRY_EVERY_S = 10     # pause between rounds when no tool managed a link
VERIFY_S = 30      # how long a new link may take to start answering before it is rejected


def _resolve(host: str) -> list[str]:
    """IPv4 addresses from public DNS over https (Cloudflare, then Google). Bypasses the computer's own DNS cache,
    which remembers "no such name" when a brand-new tunnel address is looked up a few seconds too early."""
    import httpx
    for url in ("https://1.1.1.1/dns-query", "https://8.8.8.8/resolve"):
        try:
            r = httpx.get(url, params={"name": host, "type": "A"}, headers={"accept": "application/dns-json"}, timeout=4)
            ips = [a["data"] for a in r.json().get("Answer", []) if a.get("type") == 1]
            if ips:
                return ips
        except Exception:  # noqa: BLE001
            continue
    return []


def _judge(r) -> str:
    """ok = our server answered; wrong = some other page answered (sign-in, ads, another site); wait = not ready yet."""
    if r.status_code == 200:
        try:
            return "ok" if r.json().get("app") == "awaazsaathi" else "wrong"
        except ValueError:
            return "wrong"                        # an html page: a sign-in or interstitial, not this server
    if 300 <= r.status_code < 400:
        return "wrong"                            # redirected elsewhere
    return "wait"                                 # 4xx/5xx while the tunnel warms up (Cloudflare 530, 502 ...)


def probe(url: str) -> str:
    """One look at url/api/health: 'ok', 'wrong' or 'none' (no answer at all)."""
    import httpx
    from urllib.parse import urlparse
    headers = {"ngrok-skip-browser-warning": "1", "User-Agent": "awaazsaathi-link-check"}
    path = url.rstrip("/") + "/api/health"
    seen = "none"
    try:
        verdict = _judge(httpx.get(path, timeout=6, follow_redirects=False, headers=headers))
        if verdict != "wait":
            return verdict
        seen = "wait"
    except Exception:  # noqa: BLE001 - often "name not known" for a few seconds after a new address appears
        pass
    host = urlparse(url).hostname or ""
    for ip in _resolve(host)[:2]:
        try:
            r = httpx.get(f"https://{ip}/api/health", timeout=6, follow_redirects=False,
                          headers={**headers, "Host": host}, extensions={"sni_hostname": host})
            verdict = _judge(r)
            if verdict != "wait":
                return verdict
            seen = "wait"
        except Exception:  # noqa: BLE001
            continue
    return "none" if seen == "none" else "wait"


SLOW_KBPS = 60      # below this the first page load on a phone takes too long for a demo


def measure_kbps(url: str) -> float | None:
    """Download speed through the link in KB/s (120 KB test, 15 s at most). None when it could not be measured."""
    import httpx
    t0 = time.time()
    got = 0
    try:
        with httpx.stream("GET", url.rstrip("/") + "/api/speedtest?kb=120", timeout=15,
                          headers={"Accept-Encoding": "identity", "ngrok-skip-browser-warning": "1"}) as r:
            if r.status_code != 200:
                return None
            for chunk in r.iter_bytes():
                got += len(chunk)
                if time.time() - t0 > 15:
                    break
    except Exception:  # noqa: BLE001
        if not got:
            return None
    dt = max(time.time() - t0, 0.05)
    return round(got / 1024 / dt, 1)


def verify(url: str, budget_s: float = VERIFY_S) -> bool | None:
    """True: the link reaches this server. False: it shows some other page, never use it.
    None: nothing answered within the budget (still spreading); the link is used and the health check watches it."""
    end = time.time() + budget_s
    answered = False
    while time.time() < end:
        v = probe(url)
        if v == "ok":
            return True
        if v == "wrong":
            return False
        answered = answered or v == "wait"
        time.sleep(2)
    return None


class Provider:
    name = ""
    label = ""
    fixed = False          # a fixed address survives restarts
    tries = 1
    parallel = 1           # how many copies to start at once (Cloudflare: one per connection type)
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
    name, label, tries, wait_s, parallel = "cloudflare", "Cloudflare", 4, 35.0 + VERIFY_S, 2

    def binary(self):
        return _find("cloudflared")

    launches = 0

    def command(self, port):
        # Alternate the connection type: some networks block QUIC (UDP), others block http2 to Cloudflare's port 7844.
        # "auto" tries QUIC first; "http2" is plain TCP. Whichever this network allows wins within two attempts.
        proto = "auto" if self.launches % 2 == 0 else "http2"
        self.launches += 1
        return [self.binary(), "tunnel", "--no-autoupdate", "--protocol", proto, "--url", f"http://localhost:{port}"]

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
_verified = False
_kbps: float | None = None
_last_upgrade = 0.0
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
            "since": _started_at if on else None, "changes": _changes, "rejected": sorted(_rejected)[-3:], "verified": bool(on and _verified), "kbps": _kbps if on else None, "slow": bool(on and _kbps is not None and _kbps < SLOW_KBPS)}


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
    """Reads one tool's output. The first candidate whose address checks out becomes the link; the rest are closed."""
    global _url, _last, _changes, _started_at, _error, _phase, _proc, _provider, _verified
    log = None
    try:
        log = open(config.VAR / "tunnel.log", "a", encoding="utf-8")
        log.write(f"\n--- {time.strftime('%H:%M:%S')} {prov.label} ---\n")
    except OSError:
        pass
    seen: set[str] = set()
    for line in p.stdout:  # type: ignore[union-attr]
        if log:
            try:
                log.write(line); log.flush()
            except OSError:
                pass
        err = prov.error_from(line)
        if err:
            _last = f"{prov.label}: {err}"
        u = prov.url_from(line)
        if not u or u in seen:
            continue
        seen.add(u)
        if p not in _candidates and p is not _proc:
            return                                    # this candidate already lost or was stopped
        if _url and p is not _proc and p not in _challengers:
            continue                                  # another tool already won
        ok = verify(u)
        if ok is False:
            _last = f"{prov.label}: {u} showed a different page, ignored"
            continue
        if p in _challengers:
            k = measure_kbps(u) if ok else None
            if not _upgrade_to(p, prov, u, k):
                _end(p)
            return
        with _lock:
            if (_url and p is not _proc) or (p not in _candidates and p is not _proc):
                continue
            _proc, _provider, _url, _verified = p, prov, u, ok is True
            _started_at, _error, _phase = time.time(), None, ""
            _changes += 1
        try:
            _url_file().write_text(u, "utf-8")
        except OSError:
            pass
        _notify()
        threading.Thread(target=_measure, args=(u,), daemon=True).start()


def _measure(u: str) -> None:
    global _kbps
    _kbps = None
    k = measure_kbps(u)
    if _url == u:
        _kbps = k
        _notify()


_candidates: list[subprocess.Popen] = []
_challengers: set = set()
UPGRADE_EVERY_S = 60


def _upgrade_to(p: subprocess.Popen, prov: Provider, u: str, k: float | None) -> bool:
    """A challenger replaces a slow link only when it is clearly faster."""
    global _proc, _provider, _url, _verified, _started_at, _changes, _kbps
    with _lock:
        _challengers.discard(p)
        if not _url or not k or (_kbps is not None and k < max(_kbps * 2, SLOW_KBPS)):
            return False
        old = _proc
        _proc, _provider, _url, _verified, _kbps = p, prov, u, True, k
        _started_at, _changes = time.time(), _changes + 1
        if old in _candidates:
            _candidates.remove(old)
    if old is not None:
        _end(old)
    try:
        _url_file().write_text(u, "utf-8")
    except OSError:
        pass
    _notify()
    return True


def _challenge(port: int, gen: int) -> None:
    """While the link is slow, race the other tools in the background; a faster link takes over by itself."""
    others = [x for x in providers() if x.available() and x is not _provider]
    for prov in others:
        for _ in range(prov.parallel):
            if not _keep or gen != _gen:
                return
            c = _spawn(prov, port)
            _challengers.add(c)
    end = time.time() + max((x.wait_s for x in others), default=0) + 20
    while time.time() < end and _keep and gen == _gen and any(c.poll() is None for c in list(_challengers)):
        time.sleep(0.5)
    for c in list(_challengers):
        _challengers.discard(c)
        if c is not _proc:
            with _lock:
                if c in _candidates:
                    _candidates.remove(c)
            _end(c)


def _spawn(prov: Provider, port: int) -> subprocess.Popen:
    flags = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}
    env = {**os.environ, **prov.env()}
    p = subprocess.Popen(prov.command(port), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                         text=True, env=env, **flags)
    _candidates.append(p)
    threading.Thread(target=_reader, args=(p, prov), daemon=True).start()
    return p


def _end(p: subprocess.Popen) -> None:
    if p.poll() is None:
        p.terminate()
        try:
            p.wait(5)
        except subprocess.TimeoutExpired:
            p.kill()


def _close_losers() -> None:
    with _lock:
        losers = [c for c in _candidates if c is not _proc]
        _candidates[:] = [c for c in _candidates if c is _proc]
    for c in losers:
        _end(c)


def _kill() -> None:
    """Closes the link and every candidate still trying."""
    global _proc, _url
    with _lock:
        everyone = list(_candidates) + ([_proc] if _proc is not None and _proc not in _candidates else [])
        _candidates.clear()
        _challengers.clear()
        had = bool(_url)
        _proc, _url = None, None
    for c in everyone:
        _end(c)
    try:
        _url_file().unlink()
    except OSError:
        pass
    if had:
        _notify()


def _launch(prov: Provider, port: int) -> None:
    """Kept for a single explicit launch (used by tests); the keeper races all tools instead."""
    global _last
    _last = ""
    _spawn(prov, port)


def _attempt_all(port: int, gen: int) -> bool:
    """Starts every available tool AT THE SAME TIME (Cloudflare twice: QUIC and http2) and keeps whichever link
    checks out first; the others are closed. A link usually appears in 10 to 20 seconds. True when one is up."""
    global _error, _phase, _attempts, _last
    avail = [p for p in providers() if p.available()]
    if not avail:
        _error = NO_TOOL
        return False
    _last = ""
    labels = []
    for prov in avail:
        for _ in range(prov.parallel):
            if not _keep or gen != _gen:
                return False
            _attempts += 1
            _spawn(prov, port)
        labels.append(prov.label)
    _phase = "Trying " + ", ".join(labels) + " together"
    _notify()
    end = time.time() + max(p.wait_s for p in avail)
    while time.time() < end and _keep and gen == _gen and not _url:
        with _lock:
            alive = any(c.poll() is None for c in _candidates)
        if not alive:
            break                                     # every tool gave up early: no point waiting
        time.sleep(0.25)
    if gen != _gen:
        return False
    if _url:
        _close_losers()
        _error = None
        _phase = ""
        return True
    _kill()
    _error = "No tool could make a link" + (f" ({_last})" if _last else "") + "."
    return False


def _keeper(port: int, gen: int) -> None:
    global _phase, _error, _misses, _checked, _verified, _last_upgrade
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
        # A slow link (localhost.run's free tier is throttled): look for a faster one in the background.
        if (_url and running() and _kbps is not None and _kbps < SLOW_KBPS and not _challengers
                and time.time() - _last_upgrade > UPGRADE_EVERY_S):
            _last_upgrade = time.time()
            threading.Thread(target=_challenge, args=(port, gen), daemon=True).start()
        # Health check: a tunnel can stay "running" while no traffic gets through.
        if _url and running() and time.time() - _checked > CHECK_EVERY_S:
            _checked = time.time()
            ok = verify(_url, budget_s=8)
            if ok is True:
                _misses, _verified = 0, True
            else:
                _misses += 1
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


def _cleanup_at_exit() -> None:
    """Safety net: whatever way the server ends, no tunnel tool keeps running on its own."""
    for c in list(_candidates) + ([_proc] if _proc is not None else []):
        try:
            if c.poll() is None:
                c.kill()
        except Exception:  # noqa: BLE001
            pass


import atexit  # noqa: E402

atexit.register(_cleanup_at_exit)
