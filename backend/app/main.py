"""AwaazSaathi API + static front end on one port."""
import asyncio
import json
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
from .ws import hub

STATIC = config.BACKEND / "static"


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
    yield
    task.cancel()


app = FastAPI(title="AwaazSaathi", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
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
    return {"ip": ip, "base": base, "dealer": f"{base}/dealer", "farmer": f"{base}/farmer", "expert": f"{base}/expert", "admin": f"{base}/admin"}


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
