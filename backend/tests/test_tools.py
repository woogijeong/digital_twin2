"""End-effector selection: TCP offset in kinematics, /api/tool, tool frame."""

from __future__ import annotations

import sys
from unittest.mock import MagicMock

from app.robot import kinematics
from app.robot.tools import tcp_offset_mm, tool_frame_fpos


def test_tool_extends_the_tcp_along_the_flange_axis():
    zero = [0.0] * 6  # arm straight up -> flange axis is world +Z
    bare = kinematics.fk(zero)
    grip = kinematics.fk(zero, tcp_offset_mm("gripper"))
    extra = tcp_offset_mm("gripper") - tcp_offset_mm("none")
    # only Z grows, by exactly the extra reach
    assert abs(grip[2] - bare[2] - extra) < 1e-6
    assert abs(grip[0] - bare[0]) < 1e-6 and abs(grip[1] - bare[1]) < 1e-6


def test_tool_ik_fk_round_trips_with_the_offset():
    joints = [20.0, -10.0, -70.0, 15.0, -60.0, 5.0]
    pose = kinematics.fk(joints, tcp_offset_mm("suction"))
    solved = kinematics.ik(pose, joints, tcp_offset_mm=tcp_offset_mm("suction"))
    back = kinematics.fk(solved, tcp_offset_mm("suction"))
    assert all(abs(a - b) < 0.2 for a, b in zip(pose[:3], back[:3]))


def test_select_tool_shifts_the_reported_pose(client):
    pose_none = client.get("/api/pose").json()

    r = client.post("/api/tool", json={"tool": "suction"})
    assert r.status_code == 200
    assert r.json()["tool"] == "suction"

    pose_suction = client.get("/api/pose").json()
    # the ready pose points the tool straight down: +92 mm of tool -> -92 mm of Z
    delta = tcp_offset_mm("suction") - tcp_offset_mm("none")
    assert abs((pose_none["z"] - pose_suction["z"]) - delta) < 0.05
    assert client.get("/api/health").json()["tool"] == "suction"


def test_unknown_tool_is_rejected(client):
    assert client.post("/api/tool", json={"tool": "laser"}).status_code == 422


def test_connecting_pushes_the_tool_frame_to_the_controller(client, monkeypatch):
    indy = MagicMock()
    indy.get_control_data.return_value = {"q": [0.0] * 6, "p": [0.0] * 6}
    module = MagicMock()
    module.IndyDCP3.return_value = indy
    monkeypatch.setitem(sys.modules, "neuromeka", module)

    client.post("/api/tool", json={"tool": "gripper"})
    assert client.post("/api/connect", json={"host": "10.0.0.9"}).status_code == 200

    indy.set_tool_frame.assert_called_with(tool_frame_fpos("gripper"))
    assert client.get("/api/health").json()["tool"] == "gripper"
