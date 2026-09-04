"""IndyDCP3-backed robot service.

Wraps the synchronous ``neuromeka`` gRPC client. Every SDK call is pushed to a
worker thread so the event loop is never blocked. The controller is put into
**simulation mode** on connect -- P0 mirrors and solves kinematics but never
commands real motion.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncIterator

from app.config import settings
from app.robot.base import (
    IkFailed,
    MotionNotPermitted,
    RobotService,
    RobotUnavailable,
)
from app.robot.tools import TOOL_EXTRA_MM, tool_frame_fpos
from app.schemas import PoseDTO, TelemetryFrame

# P0 is read + kinematics + the TCP tool frame. Every SDK call goes through
# ``_call`` and only these may pass -- so no code path (or future edit) can
# command physical motion (``movej`` / ``movel`` / teleop), whatever string it
# hands to ``_call``. ``set_tool_frame`` is a TCP-reference config, not motion.
_ALLOWED_SDK_CALLS = frozenset(
    {
        "get_control_data",
        "inverse_kin",
        "forward_kin",
        "set_simulation_mode",
        "set_tool_frame",
    }
)


class IndyDCP3Robot(RobotService):
    mode = "real"

    def __init__(self, host: str | None = None) -> None:
        self._host = host or settings.host
        self._indy = None
        self._connected = False
        self.tool = "none"

    @property
    def host(self) -> str:
        return self._host

    async def connect(self) -> None:
        try:
            self._indy = await asyncio.wait_for(
                asyncio.to_thread(self._blocking_connect),
                timeout=settings.connect_timeout_s,
            )
        except (TimeoutError, asyncio.TimeoutError) as exc:
            raise RobotUnavailable(f"controller {self._host} did not respond") from exc
        except Exception as exc:  # noqa: BLE001 - SDK raises a grab-bag of errors
            raise RobotUnavailable(f"cannot connect to {self._host}: {exc}") from exc
        self._connected = True

    def _blocking_connect(self):
        from neuromeka import IndyDCP3

        indy = IndyDCP3(self._host)
        # Safety gate: never let P0 drive the physical robot.
        indy.set_simulation_mode(True)
        # Touch the control channel so a dead host fails here, not later.
        indy.get_control_data()
        return indy

    async def close(self) -> None:
        self._connected = False
        self._indy = None

    @property
    def connected(self) -> bool:
        return self._connected

    async def _call(self, name: str, *args):
        if name not in _ALLOWED_SDK_CALLS:
            raise RuntimeError(f"SDK method {name!r} is not permitted in P0 (read + kinematics only)")
        if self._indy is None:
            raise RobotUnavailable("not connected")
        return await asyncio.to_thread(getattr(self._indy, name), *args)

    async def get_joints(self) -> list[float]:
        data = await self._call("get_control_data")
        return list(data["q"])

    async def get_pose(self) -> PoseDTO:
        data = await self._call("get_control_data")
        return PoseDTO.from_list(list(data["p"]))

    async def solve_ik(self, tpos: list[float], init_jpos: list[float]) -> list[float]:
        res = await self._call("inverse_kin", list(tpos), list(init_jpos))
        code = (res.get("response") or {}).get("code", 0)
        jpos = list(res.get("jpos") or [])
        if code not in (0, None) or len(jpos) != 6:
            raise IkFailed(
                (res.get("response") or {}).get("msg") or "no inverse kinematics solution"
            )
        return jpos

    async def forward_kin(self, jpos: list[float]) -> list[float]:
        res = await self._call("forward_kin", list(jpos))
        return list(res["tpos"])

    async def home(self) -> list[float]:
        # P0 mirrors the real controller and never commands its motion.
        raise MotionNotPermitted(
            "connected to the real controller -- P0 does not command robot motion"
        )

    async def set_tool(self, tool: str) -> None:
        if tool not in TOOL_EXTRA_MM:
            raise ValueError(f"unknown tool {tool!r}")
        # Configures the controller's TCP reference; not a motion command.
        await self._call("set_tool_frame", tool_frame_fpos(tool))
        self.tool = tool

    async def stream(self) -> AsyncIterator[TelemetryFrame]:
        period = 1.0 / max(settings.telemetry_hz, 1.0)
        while True:
            data = await self._call("get_control_data")
            yield TelemetryFrame(q=list(data["q"]), p=list(data["p"]), ts=time.time())
            await asyncio.sleep(period)
