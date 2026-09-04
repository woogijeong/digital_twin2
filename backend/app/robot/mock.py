"""Offline mock robot.

Deterministic 6-joint model so the whole app (viewer, telemetry, pose panel)
can run and be tested with no controller on the network. The robot holds a
"ready" pose at rest and eases to a new joint configuration whenever a target is
applied -- it never drifts on its own.

Kinematics come from :mod:`app.robot.kinematics`, which is derived straight from
the committed Indy7 URDF, so mock poses are expressed in the same **base
(reference) frame** the real controller reports (mm, and fixed-axis XYZ Euler
degrees) and line up with the rendered 3D model.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncIterator

from app.config import settings
from app.robot import kinematics
from app.robot.base import RobotService
from app.robot.tools import TOOL_EXTRA_MM, tcp_offset_mm
from app.schemas import PoseDTO, TelemetryFrame

# Natural "ready" pose the mock holds until the first target is applied --
# the URDF's ros2_control initial configuration (elbow and wrist at -90 deg).
_READY = [0.0, 0.0, -90.0, 0.0, -90.0, 0.0]

# Seconds to ease from the previous configuration to a newly applied target.
# Matched to the frontend joint tween so telemetry and the local animation
# converge on the target together, with no snap when the tween hands back.
_MOVE_DURATION_S = 1.0


def _ease(t: float) -> float:
    """Cubic ease-in-out on a clamped 0..1 progress value."""
    t = min(1.0, max(0.0, t))
    return 4 * t**3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


class MockRobot(RobotService):
    mode = "mock"

    def __init__(self) -> None:
        self._connected = False
        self.tool = "none"
        # Active move: ease ``_from`` -> ``_target`` starting at ``_move_start``.
        # Both endpoints equal ``_READY`` initially, so the robot sits still.
        self._from = list(_READY)
        self._target = list(_READY)
        self._move_start = time.monotonic()

    def _tcp(self) -> float:
        return tcp_offset_mm(self.tool)

    async def connect(self) -> None:
        self._connected = True

    async def close(self) -> None:
        self._connected = False

    @property
    def connected(self) -> bool:
        return self._connected

    def _joints_now(self) -> list[float]:
        frac = _ease((time.monotonic() - self._move_start) / _MOVE_DURATION_S)
        return [a + (b - a) * frac for a, b in zip(self._from, self._target)]

    async def get_joints(self) -> list[float]:
        return self._joints_now()

    async def forward_kin(self, jpos: list[float]) -> list[float]:
        return kinematics.fk(list(jpos), self._tcp())

    async def home(self) -> list[float]:
        self._from = self._joints_now()
        self._target = list(_READY)
        self._move_start = time.monotonic()
        return list(_READY)

    async def set_tool(self, tool: str) -> None:
        if tool not in TOOL_EXTRA_MM:
            raise ValueError(f"unknown tool {tool!r}")
        self.tool = tool

    async def solve_ik(self, tpos: list[float], init_jpos: list[float]) -> list[float]:
        # Real numerical IK against the URDF model; raises IkFailed when the
        # target is out of reach or the solution breaks a joint limit.
        solution = kinematics.ik(list(tpos), list(init_jpos), tcp_offset_mm=self._tcp())
        # Begin easing from the live position to the new solution, then hold.
        self._from = self._joints_now()
        self._target = list(solution)
        self._move_start = time.monotonic()
        return solution

    async def get_pose(self) -> PoseDTO:
        return PoseDTO.from_list(kinematics.fk(await self.get_joints(), self._tcp()))

    async def stream(self) -> AsyncIterator[TelemetryFrame]:
        period = 1.0 / max(settings.telemetry_hz, 1.0)
        while True:
            q = await self.get_joints()
            p = kinematics.fk(q, self._tcp())
            yield TelemetryFrame(q=q, p=p, ts=time.time())
            await asyncio.sleep(period)
