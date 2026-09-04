"""``/ws/telemetry`` -- one poller, many subscribers.

A single background task consumes ``robot.stream()`` and pushes the latest frame
to every connected client. Slow clients keep only the newest frame (the send
buffer is size 1), so one stalled browser tab never backs up the others.

If the stream errors, the poller does **not** give up: it logs, waits a short
backoff, and re-opens ``robot.stream()``. Only an explicit ``stop()`` ends it,
and that wakes every subscriber so their socket closes and the client can
reconnect.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.robot.base import RobotService

log = logging.getLogger("indy_twin.telemetry")
router = APIRouter()

_STREAM_RETRY_BACKOFF_S = 1.0
_STOP = object()  # sentinel pushed to subscribers when the hub shuts down


class TelemetryHub:
    def __init__(self, robot: RobotService) -> None:
        self._robot = robot
        self._clients: set[asyncio.Queue[object]] = set()
        self._task: asyncio.Task | None = None
        self._stopping = False

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run())

    async def swap(self, robot: RobotService) -> None:
        """Point the poller at a different robot (connect / disconnect) without
        dropping subscribers -- the open WebSockets just start seeing the new
        source."""
        self._robot = robot
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None
        if not self._stopping:
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._stopping = True
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None
        for q in list(self._clients):
            self._offer(q, _STOP)

    def subscribe(self) -> asyncio.Queue[object]:
        q: asyncio.Queue[object] = asyncio.Queue(maxsize=1)
        self._clients.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[object]) -> None:
        self._clients.discard(q)

    @staticmethod
    def _offer(q: asyncio.Queue[object], item: object) -> None:
        """Put ``item`` on a size-1 queue, discarding whatever it already holds."""
        if q.full():
            with contextlib.suppress(asyncio.QueueEmpty):
                q.get_nowait()
        with contextlib.suppress(asyncio.QueueFull):
            q.put_nowait(item)

    async def _run(self) -> None:
        while not self._stopping:
            try:
                async for frame in self._robot.stream():
                    payload = frame.model_dump_json()
                    for q in list(self._clients):
                        self._offer(q, payload)
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001 - a bad frame must not kill telemetry
                log.exception("telemetry stream errored; retrying in %ss", _STREAM_RETRY_BACKOFF_S)
                await asyncio.sleep(_STREAM_RETRY_BACKOFF_S)


@router.websocket("/ws/telemetry")
async def telemetry(ws: WebSocket) -> None:
    hub: TelemetryHub = ws.app.state.telemetry_hub
    await ws.accept()
    q = hub.subscribe()
    try:
        while True:
            item = await q.get()
            if item is _STOP:
                break
            await ws.send_text(item)  # type: ignore[arg-type]
    except WebSocketDisconnect:
        pass
    finally:
        hub.unsubscribe(q)
        with contextlib.suppress(RuntimeError):
            await ws.close()
