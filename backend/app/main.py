"""FastAPI application entry point."""

from __future__ import annotations

import contextlib
import logging
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as api_router
from app.api.telemetry_ws import TelemetryHub, router as ws_router
from app.config import settings
from app.robot.factory import create_robot

logging.basicConfig(level=logging.INFO)


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    robot = await create_robot()
    hub = TelemetryHub(robot)
    hub.start()
    app.state.robot = robot
    app.state.telemetry_hub = hub
    app.state.active_host = settings.host
    try:
        yield
    finally:
        await hub.stop()
        await app.state.robot.close()  # may have been swapped by /connect


app = FastAPI(title="Indy7 Digital Twin", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router)
app.include_router(ws_router)
