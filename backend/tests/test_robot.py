"""RobotService behaviour: sim-mode gate, mock fallback, no motion commands."""

from __future__ import annotations

import ast
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


async def test_mock_gripper_and_suction_are_harmless_no_ops():
    robot = MockRobot()
    await robot.set_gripper(True)
    await robot.set_gripper(False)
    await robot.set_suction(True)
    await robot.set_suction(False)
    # no exception means success -- the mock has no physical I/O to check


async def test_mock_ik_rejects_unreachable():
    robot = MockRobot()
    with pytest.raises(IkFailed):
        await robot.solve_ik([9999, 0, 0, 0, 0, 0], [0] * 6)


async def test_indy_connect_forces_simulation_mode(monkeypatch):
    fake = MagicMock()
    fake_module = MagicMock()
    fake_module.IndyDCP3.return_value = fake
    monkeypatch.setitem(__import__("sys").modules, "neuromeka", fake_module)

    robot = IndyDCP3Robot("10.0.0.9")
    await robot.connect()

    fake.set_simulation_mode.assert_called_once_with(True)
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
    for name in ("movej", "movel", "start_teleop"):
        with pytest.raises(RuntimeError, match="not permitted in P0"):
            await robot._call(name, [0] * 6)
    # allow-listed calls still dispatch (read, kinematics, TCP tool frame)
    await robot._call("get_control_data")
    robot._indy.get_control_data.assert_called_once()
    await robot._call("set_tool_frame", [0, 0, 60, 0, 0, 0])
    robot._indy.set_tool_frame.assert_called_once()


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
