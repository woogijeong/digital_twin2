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


def test_no_motion_commands_in_p0_code():
    """P0 must never command real motion: no movej/movel/movec calls anywhere."""
    offenders: list[str] = []
    for path in APP_DIR.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Attribute) and node.attr in {
                "movej",
                "movel",
                "movec",
                "movej_time",
                "movel_time",
            }:
                offenders.append(f"{path.name}:{node.lineno} .{node.attr}")
    assert not offenders, f"motion commands found: {offenders}"
