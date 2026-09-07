"""IndyDCP3-backed robot service.

Wraps the synchronous ``neuromeka`` gRPC client. Every SDK call is pushed to a
worker thread so the event loop is never blocked. The controller is put into
**simulation mode** on connect -- P0 mirrors and solves kinematics but never
commands real motion.
"""

from __future__ import annotations

import asyncio
import logging
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

log = logging.getLogger("indy_twin.robot")

# P0 is read + kinematics + the TCP tool frame + fault recovery. Every SDK
# call goes through ``_call`` and only these may pass -- so no code path (or
# future edit) can command physical motion (``movej`` / ``movel`` / teleop),
# whatever string it hands to ``_call``. ``set_tool_frame`` is a TCP-reference
# config, not motion; ``recover`` only clears a fault flag (e.g. after a
# collision stop) -- it does not move the robot either; ``set_do`` toggles
# end-effector I/O (the gripper/suction solenoids) -- it actuates the *tool*,
# not the arm, so it's not motion either. ``get_do`` is a read of those same
# digital outputs -- so the twin can mirror the live gripper / suction state.
_ALLOWED_SDK_CALLS = frozenset(
    {
        "get_control_data",
        "get_control_state",
        "get_do",
        "inverse_kin",
        "forward_kin",
        "set_simulation_mode",
        "set_tool_frame",
        "recover",
        "set_do",
    }
)

# Digital-output addresses the twin drives (see ``set_gripper`` / ``set_suction``).
_DO_GRIPPER_OPEN = 0  # DO0 HIGH = gripper open
_DO_SUCTION = 2  # DO2 HIGH = suction on
_DO_STATE_ON = 1  # neuromeka DigitalState: 0 = OFF, 1 = ON, 2 = UNUSED

# How often to poll digital outputs while streaming (s). Gripper/suction state
# changes rarely, so this runs well below the telemetry rate.
_DO_POLL_INTERVAL_S = 0.25

# OpState codes (neuromeka.enums.OpState) the operator should see. Some clear
# with `recover()` (VIOLATE / COLLISION), others need action at the controller
# (E-stop release, manual recovery, power-on). Anything not listed here --
# SYSTEM_ON(1), IDLE(5), MOVING(6), TEACHING(7), COMPLIANCE(10) -- is a normal
# operating state and reports no error.
_FAULT_MESSAGES = {
    0: "CONTROLLER SYSTEM OFF",  # OpState.SYSTEM_OFF
    2: "SAFETY VIOLATION",  # OpState.VIOLATE -- clears with RECOVER
    3: "RECOVERING (HARD) -- controller is clearing a fault",  # OpState.RECOVER_HARD
    4: "RECOVERING (SOFT) -- controller is clearing a fault",  # OpState.RECOVER_SOFT
    8: "COLLISION DETECTED",  # OpState.COLLISION -- clears with RECOVER
    9: "EMERGENCY STOP -- controller stopped and powered off",  # OpState.STOP_AND_OFF
    15: "HARD SAFETY VIOLATION -- controller powered off",  # OpState.POWER_OFF / VIOLATE_HARD
    16: "MANUAL RECOVERY REQUIRED at the teach pendant",  # OpState.MANUAL_RECOVER
}

# Emitted while the gRPC channel to the controller is down. Distinct from a
# controller-reported fault: RECOVER cannot help, the twin just keeps re-dialing.
_LINK_LOST_MESSAGE = "CONTROLLER LINK LOST -- reconnecting..."

# Floor between re-dial attempts while the link is down, seconds.
_REDIAL_INTERVAL_S = 2.0


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

    async def set_gripper(self, open: bool) -> None:
        # DO0/DO1 are a latching dual-solenoid pair -- exactly one is HIGH.
        await self._call("set_do", [(0, open), (1, not open)])

    async def set_suction(self, on: bool) -> None:
        await self._call("set_do", [(2, on)])

    async def recover(self) -> None:
        await self._call("recover")

    async def _redial(self) -> None:
        """Best-effort reconnect of a dropped gRPC channel. Silent on failure --
        the stream loop keeps emitting link-lost frames until it succeeds."""
        try:
            self._indy = await asyncio.wait_for(
                asyncio.to_thread(self._blocking_connect),
                timeout=settings.connect_timeout_s,
            )
        except Exception as exc:  # noqa: BLE001 - SDK raises a grab-bag of errors
            log.debug("controller re-dial failed: %s", exc)

    async def _read_do(self) -> tuple[bool | None, bool | None]:
        """Live (gripper_open, suction_on) from the controller's digital outputs.
        ``None`` for an output that is not configured (state UNUSED)."""
        res = await self._call("get_do")
        by_addr = {int(s["address"]): int(s["state"]) for s in res.get("signals", [])}

        def state(addr: int) -> bool | None:
            raw = by_addr.get(addr)
            return None if raw is None or raw not in (0, 1) else raw == _DO_STATE_ON

        return state(_DO_GRIPPER_OPEN), state(_DO_SUCTION)

    async def stream(self) -> AsyncIterator[TelemetryFrame]:
        period = 1.0 / max(settings.telemetry_hz, 1.0)
        last_q = [0.0] * 6
        last_p = [0.0] * 6
        last_redial = 0.0
        last_do_poll = 0.0
        gripper_open: bool | None = None
        suction_on: bool | None = None
        while True:
            try:
                data = await self._call("get_control_data")
                state = await self._call("get_control_state")
            except Exception as exc:  # noqa: BLE001 - channel/SDK failure; surface it, keep polling
                if self._connected:
                    self._connected = False
                    log.warning("controller link lost: %s", exc)
                yield TelemetryFrame(
                    q=last_q,
                    p=last_p,
                    ts=time.time(),
                    manipulability=0.0,
                    error=_LINK_LOST_MESSAGE,
                    link_ok=False,
                    robot_connected=False,
                )
                now = time.monotonic()
                if now - last_redial >= _REDIAL_INTERVAL_S:
                    last_redial = now
                    await self._redial()
                await asyncio.sleep(period)
                continue

            if not self._connected:
                self._connected = True
                log.info("controller link restored")
            last_q = list(data["q"])
            last_p = list(data["p"])

            now = time.monotonic()
            if now - last_do_poll >= _DO_POLL_INTERVAL_S:
                last_do_poll = now
                try:
                    gripper_open, suction_on = await self._read_do()
                except Exception as exc:  # noqa: BLE001 - a DO read hiccup must not drop the frame
                    log.debug("digital-output read failed: %s", exc)

            yield TelemetryFrame(
                q=last_q,
                p=last_p,
                ts=time.time(),
                manipulability=float(state.get("manipulability", 0.0)),
                error=_FAULT_MESSAGES.get(int(data.get("op_state", 0))),
                link_ok=True,
                robot_connected=bool(data.get("is_robot_connected", True)),
                gripper_open=gripper_open,
                suction_on=suction_on,
            )
            await asyncio.sleep(period)
