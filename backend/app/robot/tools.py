"""End-effector (tool) definitions.

The TCP offset is measured from the robot flange (URDF ``link6``) out along the
flange normal (+Z) to the tool's working point:

* ``none``    -- bare flange; 60 mm matches the URDF ``link6 -> tcp`` joint.
* ``suction`` -- vacuum cup: stem + cup face.
* ``gripper`` -- 2-finger parallel gripper: body + fingertip centre.

The same number feeds the mock's kinematics and the real controller's
``set_tool_frame`` (a TCP-reference config -- it does not command motion), so the
twin and the controller agree on where the tool tip is.
"""

from __future__ import annotations

# Flange -> bare-flange TCP, from the URDF (link6 -> tcp origin).
FLANGE_TCP_MM = 60.0

# Extra reach beyond the bare flange TCP, per tool (approx real hardware).
TOOL_EXTRA_MM: dict[str, float] = {
    "none": 0.0,
    "suction": 75.0,
    "gripper": 115.0,
}

TOOL_IDS = tuple(TOOL_EXTRA_MM)


def tcp_offset_mm(tool: str) -> float:
    """Flange -> working point, in mm (equals the URDF TCP for ``none``)."""
    return FLANGE_TCP_MM + TOOL_EXTRA_MM[tool]


def tool_frame_fpos(tool: str) -> list[float]:
    """``set_tool_frame`` pose ``[x, y, z, u, v, w]`` (mm, deg) for a tool id."""
    return [0.0, 0.0, tcp_offset_mm(tool), 0.0, 0.0, 0.0]
