"""AwaazSaathi API + static front end on one port."""
import asyncio
import json
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .api import admin, dealer, expert, farmer
from .db import SessionLocal
from .models import KBEntry
from .pipeline import retrieval
from . import tls, tunnel
from .ws import hub

STATIC = config.BACKEND / "static"
TLS_POLL_S = 4   # how often the https listener checks whether the Mac changed network


async def _sla_loop():
    while True:
        await asyncio.sleep(30)
        db = SessionLocal()
        try:
            await asyncio.to_thread(expert.sla_sweep, db)
        except Exception:  # noqa: BLE001
            pass
        finally:
            db.close()


async def _tls_loop(app):
    """Serves https on the Mac's current Wi-Fi address. When the Mac moves to another Wi-Fi or a phone hotspot,
    the certificate is re-issued for the new address and the listener restarts, so phones only need a refresh."""
    try:
        while True:
            ip = lan_ip()
            server = asyncio.create_task(tls.serve(app, ip))
            while not server.done():
                await asyncio.sleep(TLS_POLL_S)
                if lan_ip() != ip:
                    tls.stop()
                    break
            try:
                await asyncio.wait_for(server, 8)
            except Exception:  # noqa: BLE001 - slow shutdown or a failed listener: start over either way
                server.cancel()
            if tls.state["error"]:
                await asyncio.sleep(30)   # e.g. the port is taken: try again later instead of spinning
    except asyncio.CancelledError:
        tls.stop()
        raise


@asynccontextmanager
async def lifespan(_app):
    hub.loop = asyncio.get_running_loop()
    from . import seed
    db = SessionLocal()
    try:
        try:
            has = db.query(KBEntry).count() > 0
        except Exception:  # noqa: BLE001
            has = False
        if not has:
            seed.run()
        retrieval.rebuild(db)
    finally:
        db.close()
    task = asyncio.create_task(_sla_loop())
    secure = asyncio.create_task(_tls_loop(_app)) if tls.enabled() else None
    if os.getenv("AWAAZ_ONLINE") == "1":   # ./scripts/start.sh --online: get the internet link without pressing anything
        tunnel.start(wait_s=0)
    yield
    tunnel.stop()          # first: an internet link must never outlive the server
    task.cancel()
    if secure:
        secure.cancel()
        try:
            await asyncio.wait_for(secure, 5)
        except BaseException:  # noqa: BLE001 - shutting down either way
            pass
    hub.loop = None


app = FastAPI(title="AwaazSaathi", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
# Compress pages, scripts and data (about a third of the size): faster on slow links and phone hotspots.
# Audio, photos and recordings are left alone (already compressed; players fetch them in ranges).
from fastapi.middleware.gzip import GZipMiddleware  # noqa: E402

_NO_GZIP = ("/media", "/uploads", "/recordings", "/ws")


class SelectiveGZip:
    def __init__(self, app_):
        self.plain, self.gzip = app_, GZipMiddleware(app_, minimum_size=800)

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and not scope["path"].startswith(_NO_GZIP):
            return await self.gzip(scope, receive, send)
        return await self.plain(scope, receive, send)


app.add_middleware(SelectiveGZip)
for mod in (farmer, expert, dealer, admin):
    app.include_router(mod.r)

app.mount("/media", StaticFiles(directory=config.MEDIA), name="media")
app.mount("/uploads", StaticFiles(directory=config.UPLOAD_DIR), name="uploads")
app.mount("/recordings", StaticFiles(directory=config.RECORDING_DIR), name="recordings")


@app.websocket("/ws")
async def ws(socket: WebSocket, topics: str = "*"):
    await hub.connect(socket, set(topics.split(",")))
    try:
        while True:
            raw = await socket.receive_text()
            # Relay for live video-call signalling (WebRTC offer/answer/ICE). Only rtc_* events are relayed.
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
            if isinstance(msg, dict) and str(msg.get("event", "")).startswith("rtc_") and msg.get("to"):
                await hub._send(str(msg["to"]), {"event": msg["event"], "data": msg.get("data") or {}})
    except WebSocketDisconnect:
        hub.disconnect(socket)


@app.get("/api/health")
def ping():
    return {"ok": True, "app": "awaazsaathi"}  # "app" lets the Windows launcher recognise this server on the network


def lan_ip() -> str:
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))  # no packet is sent; picks the LAN interface
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


@app.get("/api/lan")
def lan():
    ip = lan_ip()
    base = f"http://{ip}:8000"
    pub = tunnel.public_url()
    secure = f"https://{ip}:{tls.PORT}" if tls.state["running"] else None
    return {"ip": ip, "base": base, "secure": secure, "public": pub, "dealer": f"{base}/dealer", "farmer": f"{base}/farmer", "expert": f"{base}/expert", "admin": f"{base}/admin"}


@app.get("/api/speedtest")
def speedtest(kb: int = 120):
    """Incompressible bytes for measuring how fast a link is (used by the internet link check)."""
    from fastapi.responses import Response
    return Response(os.urandom(max(1, min(kb, 1024)) * 1024), media_type="application/octet-stream",
                    headers={"Cache-Control": "no-store"})


@app.get("/api/tunnel")
def tunnel_status():
    return tunnel.status()


@app.post("/api/tunnel/start")
def tunnel_start():
    return tunnel.start()


@app.post("/api/tunnel/stop")
def tunnel_stop():
    return tunnel.stop()


@app.get("/api/qr.svg")
def qr_svg(u: str):
    import io

    import qrcode
    import qrcode.image.svg
    from fastapi.responses import Response
    buf = io.BytesIO()
    qrcode.make(u, image_factory=qrcode.image.svg.SvgPathFillImage, box_size=12, border=2).save(buf)
    return Response(buf.getvalue(), media_type="image/svg+xml")


if STATIC.exists():
    app.mount("/assets", StaticFiles(directory=STATIC / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = STATIC / path
        if path and f.is_file():
            return FileResponse(f)
        return FileResponse(STATIC / "index.html")
