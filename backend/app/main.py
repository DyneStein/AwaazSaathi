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
    return {"ok": True}


if STATIC.exists():
    app.mount("/assets", StaticFiles(directory=STATIC / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = STATIC / path
        if path and f.is_file():
            return FileResponse(f)
        return FileResponse(STATIC / "index.html")
