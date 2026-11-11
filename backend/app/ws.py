"""Tiny pub/sub over one WebSocket endpoint. Clients subscribe to topics; server broadcasts JSON events."""
import asyncio
import json

from fastapi import WebSocket


class Hub:
    def __init__(self) -> None:
        self.clients: dict[WebSocket, set[str]] = {}
        self.loop: asyncio.AbstractEventLoop | None = None

    async def connect(self, ws: WebSocket, topics: set[str]) -> None:
        await ws.accept()
        self.clients[ws] = topics

    def disconnect(self, ws: WebSocket) -> None:
        self.clients.pop(ws, None)

    async def _send(self, topic: str, payload: dict) -> None:
        msg = json.dumps({"topic": topic, **payload}, ensure_ascii=False, default=str)
        dead = []
        for ws, topics in list(self.clients.items()):
            if topic in topics or "*" in topics or any(topic.startswith(t.rstrip("*")) for t in topics if t.endswith("*")):
                try:
                    await ws.send_text(msg)
                except Exception:
                    dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    def publish(self, topic: str, event: str, data: dict | None = None) -> None:
        """Safe to call from sync code running in a worker thread."""
        payload = {"event": event, "data": data or {}}
        if self.loop is None:
            return
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is self.loop:
            self.loop.create_task(self._send(topic, payload))
        else:
            asyncio.run_coroutine_threadsafe(self._send(topic, payload), self.loop)


hub = Hub()
