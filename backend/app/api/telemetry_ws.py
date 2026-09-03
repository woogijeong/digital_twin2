"""``/ws/telemetry`` -- one poller, many subscribers.

A single background task consumes ``robot.stream()`` and pushes the latest frame
to every connected client. Slow clients keep only the newest frame (the send
buffer is size 1), so one stalled browser tab never backs up the others.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.robot.base import RobotService

log = logging.getLogger("indy_twin.telemetry")
router = APIRouter()


class TelemetryHub:
    def __init__(self, robot: RobotService) -> None:
        self._robot = robot
        self._clients: set[asyncio.Queue[str]] = set()
        self._task: asyncio.Task | None = None

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None

    def subscribe(self) -> asyncio.Queue[str]:
        q: asyncio.Queue[str] = asyncio.Queue(maxsize=1)
        self._clients.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[str]) -> None:
        self._clients.discard(q)

    async def _run(self) -> None:
        try:
            async for frame in self._robot.stream():
                payload = frame.model_dump_json()
                for q in list(self._clients):
                    if q.full():
                        with contextlib.suppress(asyncio.QueueEmpty):
                            q.get_nowait()
                    with contextlib.suppress(asyncio.QueueFull):
                        q.put_nowait(payload)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - keep the hub alive across transient errors
            log.exception("telemetry stream errored; stopping hub")


@router.websocket("/ws/telemetry")
async def telemetry(ws: WebSocket) -> None:
    hub: TelemetryHub = ws.app.state.telemetry_hub
    await ws.accept()
    q = hub.subscribe()
    try:
        while True:
            await ws.send_text(await q.get())
    except WebSocketDisconnect:
        pass
    finally:
        hub.unsubscribe(q)
