"""RobotService behaviour: sim-mode gate, mock fallback, no motion commands."""

from __future__ import annotations

import ast
import asyncio
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from app.robot.base import IkFailed, RobotUnavailable
from app.robot.indy import IndyDCP3Robot
from app.robot.mock import MockRobot

APP_DIR = Path(__file__).resolve().parent.parent / "app"


async def test_mock_stream_yields_frames():
    robot = MockRobot()
    await robot.connect()
    gen = robot.stream()
    frame = await anext(gen)
    assert len(frame.q) == 6 and len(frame.p) == 6
    await gen.aclose()


async def test_mock_stream_reports_manipulability_and_no_error():
    robot = MockRobot()
    await robot.connect()
    gen = robot.stream()
    frame = await anext(gen)
    assert frame.error is None
    assert frame.manipulability > 0
    await gen.aclose()


def _fake_indy(
    op_state: int = 5,
    robot_connected: bool = True,
    do0: int = 0,
    do2: int = 2,
    sim_mode: bool = True,
) -> MagicMock:
    indy = MagicMock()
    indy.get_control_data.return_value = {
        "q": [1.0] * 6,
        "p": [2.0] * 6,
        "op_state": op_state,
        "is_robot_connected": robot_connected,
        "sim_mode": sim_mode,
    }
    indy.get_control_state.return_value = {"manipulability": 0.3}
    indy.get_do.return_value = {
        "signals": [{"address": 0, "state": do0}, {"address": 2, "state": do2}]
    }
    return indy


async def test_indy_stream_mirrors_live_gripper_and_suction_from_digital_outputs():
    robot = IndyDCP3Robot("10.0.0.9")
    robot._indy = _fake_indy(do0=1, do2=2)  # DO0 ON (gripper open), DO2 unused
    robot._connected = True
    gen = robot.stream()
    frame = await anext(gen)
    assert frame.gripper_open is True
    assert frame.suction_on is None  # DO2 not configured -> unknown
    await gen.aclose()


async def test_indy_stream_reports_closed_gripper():
    robot = IndyDCP3Robot("10.0.0.9")
    robot._indy = _fake_indy(do0=0, do2=1)  # DO0 OFF (closed), DO2 ON (suction)
    robot._connected = True
    gen = robot.stream()
    frame = await anext(gen)
    assert frame.gripper_open is False
    assert frame.suction_on is True
    await gen.aclose()


async def test_indy_stream_reports_controller_simulation_flag_without_changing_it():
    robot = IndyDCP3Robot("10.0.0.9")
    robot._indy = _fake_indy(sim_mode=False)  # controller is live, not simulating
    robot._connected = True
    gen = robot.stream()
    frame = await anext(gen)
    assert frame.simulation is False
    robot._indy.set_simulation_mode.assert_not_called()
    await gen.aclose()


async def test_indy_set_tool_skips_the_controller_write_when_unchanged():
    robot = IndyDCP3Robot("10.0.0.9")
    robot._indy = _fake_indy()
    robot._connected = True
    await robot.set_tool("none")  # already "none" -> no SDK write
    robot._indy.set_tool_frame.assert_not_called()
    await robot.set_tool("gripper")  # real change -> writes
    robot._indy.set_tool_frame.assert_called_once()


async def test_indy_stream_maps_estop_op_state_to_a_readable_fault():
    robot = IndyDCP3Robot("10.0.0.9")
    robot._indy = _fake_indy(op_state=9)  # OpState.STOP_AND_OFF
    robot._connected = True
    gen = robot.stream()
    frame = await anext(gen)
    assert frame.error is not None and "EMERGENCY STOP" in frame.error
    assert frame.link_ok is True
    await gen.aclose()


async def test_indy_stream_reports_detached_arm():
    robot = IndyDCP3Robot("10.0.0.9")
    robot._indy = _fake_indy(op_state=5, robot_connected=False)
    robot._connected = True
    gen = robot.stream()
    frame = await anext(gen)
    assert frame.error is None  # op_state 5 (IDLE) is not itself a fault
    assert frame.robot_connected is False
    await gen.aclose()


async def test_indy_stream_surfaces_a_dropped_link_then_recovers(monkeypatch):
    robot = IndyDCP3Robot("10.0.0.9")
    indy = _fake_indy()
    robot._indy = indy
    robot._connected = True

    async def _no_redial() -> None:
        return None

    monkeypatch.setattr(robot, "_redial", _no_redial)

    calls = {"n": 0}
    ok = indy.get_control_data.return_value

    def flaky():
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("gRPC channel down")
        return ok

    indy.get_control_data.side_effect = flaky

    gen = robot.stream()
    lost = await anext(gen)
    assert lost.link_ok is False
    assert lost.error is not None and "LINK LOST" in lost.error
    assert robot.connected is False

    restored = await anext(gen)
    assert restored.link_ok is True
    assert robot.connected is True
    await gen.aclose()


async def test_mock_gripper_and_suction_are_harmless_no_ops():
    robot = MockRobot()
    await robot.set_gripper(True)
    await robot.set_gripper(False)
    await robot.set_suction(True)
    await robot.set_suction(False)
    await robot.set_all_do_off()
    # no exception means success -- the mock has no physical I/O to check


async def test_indy_set_all_do_off_drives_every_tool_output_low():
    robot = IndyDCP3Robot("10.0.0.9")
    robot._indy = _fake_indy()
    robot._connected = True
    await robot.set_all_do_off()
    robot._indy.set_do.assert_called_once_with([(0, False), (1, False), (2, False)])


async def test_indy_emergency_stop_issues_a_category_1_stop():
    robot = IndyDCP3Robot("10.0.0.9")
    robot._indy = _fake_indy()
    robot._connected = True
    await robot.emergency_stop()
    robot._indy.stop_motion.assert_called_once_with(1)  # StopCategory.CAT1 / SMOOTH_BRAKE
    # e-stop halts a move; it must never issue one
    robot._indy.movej.assert_not_called()
    robot._indy.movel.assert_not_called()


async def test_mock_emergency_stop_freezes_the_arm_in_place():
    robot = MockRobot()
    await robot.connect()
    await robot.solve_ik([400, 0, 400, 180, 0, 0], [0] * 6)  # start an eased move
    await robot.emergency_stop()
    frozen = await robot.get_joints()
    await asyncio.sleep(0.05)
    assert await robot.get_joints() == pytest.approx(frozen)


async def test_mock_ik_rejects_unreachable():
    robot = MockRobot()
    with pytest.raises(IkFailed):
        await robot.solve_ik([9999, 0, 0, 0, 0, 0], [0] * 6)


async def test_indy_connect_does_not_change_the_controller_mode(monkeypatch):
    """Connecting must never touch set_simulation_mode -- the twin observes
    whatever mode the controller is already in."""
    fake = MagicMock()
    fake_module = MagicMock()
    fake_module.IndyDCP3.return_value = fake
    monkeypatch.setitem(__import__("sys").modules, "neuromeka", fake_module)

    robot = IndyDCP3Robot("10.0.0.9")
    await robot.connect()

    fake.set_simulation_mode.assert_not_called()
    assert robot.connected


async def test_indy_connect_failure_raises_robot_unavailable(monkeypatch):
    fake_module = MagicMock()
    fake_module.IndyDCP3.side_effect = OSError("no route to host")
    monkeypatch.setitem(__import__("sys").modules, "neuromeka", fake_module)

    robot = IndyDCP3Robot("10.0.0.9")
    with pytest.raises(RobotUnavailable):
        await robot.connect()


async def test_factory_falls_back_to_mock(monkeypatch):
    monkeypatch.setattr("app.config.settings.use_mock", False)
    fake_module = MagicMock()
    fake_module.IndyDCP3.side_effect = OSError("unreachable")
    monkeypatch.setitem(__import__("sys").modules, "neuromeka", fake_module)

    from app.robot.factory import create_robot

    robot = await create_robot()
    assert robot.mode == "mock"
    assert robot.connected


_MOTION = {"movej", "movel", "movec", "movej_time", "movel_time", "movelf", "amove_j", "amove_l"}


async def test_call_rejects_non_allowlisted_sdk_method():
    """The runtime chokepoint refuses anything but read + kinematics."""
    robot = IndyDCP3Robot("10.0.0.9")
    robot._indy = MagicMock()  # pretend connected
    # motion is blocked, and so is set_simulation_mode -- connecting or running
    # the twin must never change the controller's operating mode
    for name in ("movej", "movel", "start_teleop", "set_simulation_mode"):
        with pytest.raises(RuntimeError, match="not permitted in P0"):
            await robot._call(name, [0] * 6)
    # allow-listed calls still dispatch (read, kinematics, TCP tool frame)
    await robot._call("get_control_data")
    robot._indy.get_control_data.assert_called_once()
    await robot._call("set_tool_frame", [0, 0, 60, 0, 0, 0])
    robot._indy.set_tool_frame.assert_called_once()
    # stop_motion is allow-listed: it halts motion for an operator e-stop
    await robot._call("stop_motion", 1)
    robot._indy.stop_motion.assert_called_once()


def test_no_motion_commands_in_p0_code():
    """Static backstop: no movej/movel appear as an attribute *or* a string
    literal (the SDK is reached via getattr, so a string is the real risk)."""
    offenders: list[str] = []
    for path in APP_DIR.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Attribute) and node.attr in _MOTION:
                offenders.append(f"{path.name}:{node.lineno} .{node.attr}")
            elif isinstance(node, ast.Constant) and node.value in _MOTION:
                offenders.append(f"{path.name}:{node.lineno} {node.value!r}")
    assert not offenders, f"motion commands found: {offenders}"
