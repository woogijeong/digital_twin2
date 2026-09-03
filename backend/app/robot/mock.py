"""Offline mock robot.

Deterministic 6-joint motion so the whole app (viewer, telemetry, pose panel)
can run and be tested with no controller on the network. The kinematics here
are a lightweight planar stand-in -- good enough to prove the data path and the
IK round-trip contract, not a faithful Indy7 model.
"""

from __future__ import annotations

import asyncio
import math
import time
from collections.abc import AsyncIterator

from app.config import settings
from app.robot.base import IkFailed, RobotService
from app.schemas import PoseDTO, TelemetryFrame

# Gentle idle "breathing" motion around a natural ready pose.
_AMP = [18.0, 10.0, 14.0, 16.0, 12.0, 28.0]
_PERIOD = [13.0, 9.0, 7.0, 11.0, 6.0, 5.0]
_BIAS = [0.0, -15.0, 75.0, 0.0, 55.0, 0.0]

# Joint limits (deg) -- matches Indy7 URDF revolute ranges closely enough for
# the mock to reject clearly out-of-range IK targets.
_LIMIT = 175.0


class MockRobot(RobotService):
    mode = "mock"

    def __init__(self) -> None:
        self._t0 = time.monotonic()
        self._connected = False
        # After an IK solve the idle motion re-centres on the new joints, so an
        # applied target actually "sticks" instead of snapping back.
        self._center = list(_BIAS)

    async def connect(self) -> None:
        self._connected = True

    async def close(self) -> None:
        self._connected = False

    @property
    def connected(self) -> bool:
        return self._connected

    def _joints_at(self, t: float) -> list[float]:
        return [
            self._center[i] + 0.5 * _AMP[i] * math.sin(2 * math.pi * t / _PERIOD[i])
            for i in range(6)
        ]

    async def get_joints(self) -> list[float]:
        return self._joints_at(time.monotonic() - self._t0)

    async def _fk(self, jpos: list[float]) -> list[float]:
        # Planar 3-link stand-in in the X-Z plane; orientation echoes wrist joints.
        l1, l2, l3 = 300.0, 250.0, 120.0
        a1 = math.radians(jpos[1])
        a2 = a1 + math.radians(jpos[2])
        a3 = a2 + math.radians(jpos[4])
        x = l1 * math.cos(a1) + l2 * math.cos(a2) + l3 * math.cos(a3)
        z = 250.0 + l1 * math.sin(a1) + l2 * math.sin(a2) + l3 * math.sin(a3)
        y = 2.0 * jpos[0]
        return [x, y, z, 180.0 - jpos[3], jpos[4] - 20.0, -jpos[0] - 90.0]

    async def forward_kin(self, jpos: list[float]) -> list[float]:
        return await self._fk(list(jpos))

    async def solve_ik(self, tpos: list[float], init_jpos: list[float]) -> list[float]:
        # No real controller: nudge the seed toward the requested pose so the
        # rendered model moves, and reject targets outside a plausible envelope.
        reach = math.sqrt(tpos[0] ** 2 + tpos[1] ** 2 + tpos[2] ** 2)
        if reach > 1100.0 or reach < 150.0:
            raise IkFailed(f"target out of reach ({reach:.0f} mm)")
        seed = list(init_jpos)
        seed[0] = max(-_LIMIT, min(_LIMIT, -(tpos[5] + 90.0)))
        seed[1] = max(-_LIMIT, min(_LIMIT, (tpos[2] - 400.0) / 6.0))
        seed[2] = max(-_LIMIT, min(_LIMIT, (tpos[0] - 350.0) / 4.0 + 90.0))
        seed[3] = max(-_LIMIT, min(_LIMIT, 180.0 - tpos[3]))
        seed[4] = max(-_LIMIT, min(_LIMIT, tpos[4] + 20.0))
        if any(abs(v) >= _LIMIT for v in seed):
            raise IkFailed("solution exceeds joint limits")
        self._center = list(seed)
        return seed

    async def get_pose(self) -> PoseDTO:
        return PoseDTO.from_list(await self._fk(await self.get_joints()))

    async def stream(self) -> AsyncIterator[TelemetryFrame]:
        period = 1.0 / max(settings.telemetry_hz, 1.0)
        while True:
            q = await self.get_joints()
            p = await self._fk(q)
            yield TelemetryFrame(q=q, p=p, ts=time.time())
            await asyncio.sleep(period)
