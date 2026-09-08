"""Indy7 FK/IK: base-frame poses, round-trip consistency, reach + limit gates."""

from __future__ import annotations

import math

import pytest

from app.robot.base import IkFailed
from app.robot.kinematics import JOINT_LIMITS_DEG, fk, ik, manipulability

# Joint configurations across the workspace. Their FK poses are reachable by
# construction, so IK must drive back to the same TCP pose (possibly via a
# different arm branch). The later cases sit far out / high up / folded in --
# regions a weak seed set used to reject as "unreachable".
JOINT_CASES = [
    [0.0, 0.0, -90.0, 0.0, -90.0, 0.0],  # the mock "ready" pose
    [30.0, -20.0, -70.0, 10.0, -80.0, 15.0],
    [-45.0, 30.0, 60.0, -20.0, 50.0, -30.0],
    [90.0, -40.0, -100.0, 0.0, -60.0, 0.0],
    [120.0, 20.0, 80.0, 40.0, 70.0, -50.0],
    [15.0, 55.0, 55.0, 25.0, 60.0, -40.0],  # elbow out, reaching high
    [-70.0, -55.0, -115.0, -30.0, -80.0, 25.0],  # folded to one side, low
    [150.0, 30.0, 95.0, 55.0, 70.0, -60.0],  # extended, behind-ish
    [40.0, 65.0, 35.0, 0.0, 95.0, 10.0],  # near-vertical extension
    [-120.0, -25.0, -95.0, 45.0, -70.0, -80.0],  # wide swing, wrist rolled
]

_NEUTRAL_SEED = [0.0, 0.0, -90.0, 0.0, -90.0, 0.0]


def _ang_close(a: float, b: float, tol: float) -> bool:
    return abs((a - b + 180.0) % 360.0 - 180.0) < tol


def _perturbed(joints: list[float]) -> list[float]:
    """A seed a few degrees off the true joints -- how the mock actually calls
    IK (the current pose, nudged)."""
    return [j + 6.0 for j in joints]


def test_fk_zero_pose_points_straight_up():
    x, y, z, rx, ry, rz = fk([0, 0, 0, 0, 0, 0])
    assert z > 1300.0  # TCP high on +Z
    assert abs(x) < 1.0
    assert all(abs(v) < 0.01 for v in (rx, ry, rz))


def test_fk_is_deterministic():
    assert fk([10, -20, 30, 5, 60, -15]) == fk([10, -20, 30, 5, 60, -15])


@pytest.mark.parametrize("joints", JOINT_CASES)
def test_ik_reaches_the_fk_pose(joints):
    pose = fk(joints)
    solved = ik(pose, _perturbed(joints))

    assert len(solved) == 6
    assert all(abs(v) <= lim for v, lim in zip(solved, JOINT_LIMITS_DEG))

    back = fk(solved)
    assert all(math.isclose(a, b, abs_tol=0.2) for a, b in zip(pose[:3], back[:3]))
    assert all(_ang_close(a, b, 0.1) for a, b in zip(pose[3:], back[3:]))


def test_ik_reaches_ready_neighbourhood_from_a_cold_seed():
    """Poses near the mock's ready pose resolve even without a warm seed."""
    for pose in ([350.0, -186.5, 521.5, 180.0, 0.0, 180.0],
                 [300.0, 0.0, 480.0, 180.0, 0.0, -90.0],
                 [420.0, -120.0, 300.0, 178.0, 2.0, -60.0]):
        solved = ik(pose, _NEUTRAL_SEED)
        back = fk(solved)
        assert all(math.isclose(a, b, abs_tol=0.2) for a, b in zip(pose[:3], back[:3]))


def test_ik_keeps_a_good_seed_close():
    """Seeded from the true joints, IK should stay on that branch."""
    joints = [25.0, -15.0, -75.0, 12.0, -70.0, 8.0]
    solved = ik(fk(joints), [j + 3.0 for j in joints])
    assert all(_ang_close(a, b, 1.0) for a, b in zip(joints, solved))


def test_ik_rejects_target_out_of_reach():
    with pytest.raises(IkFailed):
        ik([9999.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.0] * 6)


def test_ik_rejects_target_inside_the_base():
    with pytest.raises(IkFailed):
        ik([0.0, 0.0, 40.0, 0.0, 0.0, 0.0], _NEUTRAL_SEED)


def test_ik_rejects_target_below_the_floor():
    with pytest.raises(IkFailed):
        ik([350.0, -186.5, -15.0, 180.0, 0.0, 180.0], _NEUTRAL_SEED)


def test_manipulability_drops_near_a_singularity():
    bent = manipulability([0.0, 0.0, -90.0, 0.0, -90.0, 0.0])
    fully_extended = manipulability([0.0, 0.0, 0.0, 0.0, 0.0, 0.0])
    wrist_singular = manipulability([0.0, 0.0, -90.0, 0.0, 0.0, 0.0])
    assert fully_extended < 1e-6 < bent
    assert wrist_singular < bent
