"""Indy7 forward / inverse kinematics for the offline mock.

Derived straight from the committed URDF (``frontend/public/robot/indy7.urdf``),
so the mock's poses match the rendered 3D model and are expressed in the same
**base (reference) coordinate frame** the real controller reports:

* X / Y / Z in millimetres,
* Rx / Ry / Rz as fixed-axis XYZ Euler angles in degrees
  (``R = Rz(Rz) @ Ry(Ry) @ Rx(Rx)`` -- the same convention the URDF uses for
  ``rpy`` and the Neuromeka controller uses for the task-space ``p`` vector).

Pure Python (no numpy) so the mock stays dependency-free. Transforms are carried
as a ``(R, t)`` pair: ``R`` a row-major 9-tuple, ``t`` a 3-tuple in metres.
"""

from __future__ import annotations

import math

from app.robot.base import IkFailed

_HALF_PI = 1.570796327  # the URDF's rounded value; kept identical on purpose

# (translation xyz [m], rpy [rad]) of each revolute joint origin, joint0..joint5,
# then the fixed TCP offset -- copied verbatim from indy7.urdf.
_JOINT_ORIGINS: list[tuple[tuple[float, float, float], tuple[float, float, float]]] = [
    ((0.0, 0.0, 0.0775), (0.0, 0.0, 0.0)),
    ((0.0, -0.109, 0.222), (_HALF_PI, _HALF_PI, 0.0)),
    ((-0.45, 0.0, -0.0305), (0.0, 0.0, 0.0)),
    ((-0.267, 0.0, -0.075), (-_HALF_PI, 0.0, _HALF_PI)),
    ((0.0, -0.114, 0.083), (_HALF_PI, _HALF_PI, 0.0)),
    ((-0.168, 0.0, 0.069), (-_HALF_PI, 0.0, _HALF_PI)),
]
# Bare-flange TCP: link6 -> tcp from the URDF. A tool extends this along +Z.
_FLANGE_TCP_M = 0.06

# URDF revolute limits, joint0..joint5, in degrees (±175° for J1-J5, ±215° J6).
JOINT_LIMITS_DEG: list[float] = [175.0, 175.0, 175.0, 175.0, 175.0, 215.0]

# Tool tip must stay above the base-frame floor (Z=0) by at least this much;
# below it the tool would physically collide with the table even though the
# math is solvable.
FLOOR_CLEARANCE_MM = 5.0

_IDENTITY = (1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0)


def _rpy_matrix(r: float, p: float, y: float) -> tuple[float, ...]:
    """Row-major 3x3 for ``R = Rz(y) @ Ry(p) @ Rx(r)`` (URDF fixed-axis XYZ)."""
    cr, sr = math.cos(r), math.sin(r)
    cp, sp = math.cos(p), math.sin(p)
    cy, sy = math.cos(y), math.sin(y)
    return (
        cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr,
        sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr,
        -sp, cp * sr, cp * cr,
    )


def _rotz(a: float) -> tuple[float, ...]:
    c, s = math.cos(a), math.sin(a)
    return (c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0)


def _mat_mul(a: tuple[float, ...], b: tuple[float, ...]) -> tuple[float, ...]:
    return tuple(
        a[3 * i] * b[j] + a[3 * i + 1] * b[3 + j] + a[3 * i + 2] * b[6 + j]
        for i in range(3)
        for j in range(3)
    )


def _mat_vec(r: tuple[float, ...], v: tuple[float, float, float]) -> tuple[float, float, float]:
    return (
        r[0] * v[0] + r[1] * v[1] + r[2] * v[2],
        r[3] * v[0] + r[4] * v[1] + r[5] * v[2],
        r[6] * v[0] + r[7] * v[1] + r[8] * v[2],
    )


def _transpose(r: tuple[float, ...]) -> tuple[float, ...]:
    return (r[0], r[3], r[6], r[1], r[4], r[7], r[2], r[5], r[8])


def _rotvec(r: tuple[float, ...]) -> list[float]:
    """Rotation of ``r`` as an axis-angle vector (axis * angle, radians)."""
    cos_a = max(-1.0, min(1.0, (r[0] + r[4] + r[8] - 1.0) / 2.0))
    angle = math.acos(cos_a)
    if angle < 1e-9:
        return [0.0, 0.0, 0.0]
    axis = [r[7] - r[5], r[2] - r[6], r[3] - r[1]]
    scale = angle / (2.0 * math.sin(angle)) if abs(math.pi - angle) > 1e-6 else angle / 2.0
    return [c * scale for c in axis]


def _frame(
    q_rad: list[float], tcp_z: float = _FLANGE_TCP_M
) -> tuple[tuple[float, ...], tuple[float, float, float]]:
    """Base -> TCP transform for joint angles in radians.

    ``tcp_z`` is the flange -> tool-tip distance along the flange normal, in
    metres (default: the bare-flange URDF value).
    """
    rot = _IDENTITY
    pos = (0.0, 0.0, 0.0)
    for i, (xyz, rpy) in enumerate(_JOINT_ORIGINS):
        off = _mat_vec(rot, xyz)
        pos = (pos[0] + off[0], pos[1] + off[1], pos[2] + off[2])
        rot = _mat_mul(_mat_mul(rot, _rpy_matrix(*rpy)), _rotz(q_rad[i]))
    tip = _mat_vec(rot, (0.0, 0.0, tcp_z))
    pos = (pos[0] + tip[0], pos[1] + tip[1], pos[2] + tip[2])
    return rot, pos


def _euler_xyz(r: tuple[float, ...]) -> tuple[float, float, float]:
    """Inverse of :func:`_rpy_matrix` -- (Rx, Ry, Rz) in radians."""
    sy = math.hypot(r[0], r[3])
    if sy > 1e-9:
        return math.atan2(r[7], r[8]), math.atan2(-r[6], sy), math.atan2(r[3], r[0])
    # Gimbal lock: pitch = ±90°, roll and yaw are coupled -> pin yaw to 0.
    return math.atan2(-r[5], r[4]), math.atan2(-r[6], sy), 0.0


def fk(q_deg: list[float], tcp_offset_mm: float = _FLANGE_TCP_M * 1000.0) -> list[float]:
    """TCP pose ``[x, y, z, rx, ry, rz]`` (mm, deg) in the base frame.

    ``tcp_offset_mm`` is the flange -> tool-tip distance (default: bare flange).
    """
    rot, pos = _frame([math.radians(v) for v in q_deg], tcp_offset_mm / 1000.0)
    rx, ry, rz = _euler_xyz(rot)
    return [
        pos[0] * 1000.0,
        pos[1] * 1000.0,
        pos[2] * 1000.0,
        math.degrees(rx),
        math.degrees(ry),
        math.degrees(rz),
    ]


def _jacobian(
    q_rad: list[float], tcp_z: float = _FLANGE_TCP_M, h: float = 1e-6
) -> list[list[float]]:
    """6x6 finite-difference Jacobian: rows [dpx dpy dpz dwx dwy dwz], cols per joint."""
    rot0, pos0 = _frame(q_rad, tcp_z)
    rot0_t = _transpose(rot0)
    cols: list[list[float]] = []
    for i in range(6):
        qp = list(q_rad)
        qp[i] += h
        rot1, pos1 = _frame(qp, tcp_z)
        dp = [(pos1[k] - pos0[k]) / h for k in range(3)]
        dw = [c / h for c in _rotvec(_mat_mul(rot1, rot0_t))]
        cols.append(dp + dw)
    return [[cols[j][i] for j in range(6)] for i in range(6)]


def _solve6(a: list[list[float]], b: list[float]) -> list[float]:
    """Gaussian elimination with partial pivoting for a 6x6 system."""
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    n = 6
    for col in range(n):
        piv = max(range(col, n), key=lambda r: abs(m[r][col]))
        if abs(m[piv][col]) < 1e-12:
            raise IkFailed("target unreachable (singular configuration)")
        m[col], m[piv] = m[piv], m[col]
        inv = 1.0 / m[col][col]
        for r in range(n):
            if r == col:
                continue
            f = m[r][col] * inv
            if f:
                for c in range(col, n + 1):
                    m[r][c] -= f * m[col][c]
    return [m[r][n] / m[r][r] for r in range(n)]


def _pose_residual(
    q_rad: list[float],
    tgt_pos: tuple[float, float, float],
    tgt_rot: tuple[float, ...],
    tcp_z: float,
) -> tuple[list[float], float, float]:
    """6-vector task error and its (position mm, rotation deg) magnitudes."""
    rot, pos = _frame(q_rad, tcp_z)
    err = [tgt_pos[k] - pos[k] for k in range(3)]
    err += _rotvec(_mat_mul(tgt_rot, _transpose(rot)))
    return err, math.hypot(*err[:3]) * 1000.0, math.degrees(math.hypot(*err[3:]))


def _solve_from_seed(
    seed_rad: list[float],
    tgt_pos: tuple[float, float, float],
    tgt_rot: tuple[float, ...],
    tcp_z: float,
    max_iters: int,
) -> tuple[list[float], float, float]:
    """Levenberg-Marquardt descent from one seed. Returns the best (q, pos_mm, rot_deg)."""
    q = list(seed_rad)
    err, pos_mm, rot_deg = _pose_residual(q, tgt_pos, tgt_rot, tcp_z)
    lam = 1e-3
    for _ in range(max_iters):
        if pos_mm < 1e-4 and rot_deg < 1e-3:
            break
        j = _jacobian(q, tcp_z)
        # (JᵀJ + λ·diag(JᵀJ)) dq = Jᵀ e   -- LM normal equations.
        jtj = [[sum(j[r][a] * j[r][b] for r in range(6)) for b in range(6)] for a in range(6)]
        jte = [sum(j[r][a] * err[r] for r in range(6)) for a in range(6)]
        damped = [row[:] for row in jtj]
        for d in range(6):
            damped[d][d] += lam * (jtj[d][d] + 1e-9)
        try:
            dq = _solve6(damped, jte)
        except IkFailed:
            lam = min(lam * 4.0, 1e6)
            continue
        biggest = max(abs(v) for v in dq)
        if biggest > 0.5:  # rad; cap the per-step joint change
            dq = [v * (0.5 / biggest) for v in dq]
        trial = [q[i] + dq[i] for i in range(6)]
        t_err, t_pos_mm, t_rot_deg = _pose_residual(trial, tgt_pos, tgt_rot, tcp_z)
        if t_pos_mm + t_rot_deg < pos_mm + rot_deg:
            q, err, pos_mm, rot_deg = trial, t_err, t_pos_mm, t_rot_deg
            lam = max(lam * 0.5, 1e-9)
        else:
            lam = min(lam * 3.0, 1e6)
    return q, pos_mm, rot_deg


def ik(
    target_pose: list[float],
    seed_deg: list[float],
    *,
    tcp_offset_mm: float = _FLANGE_TCP_M * 1000.0,
    max_iters: int = 160,
    tol_pos_mm: float = 0.05,
    tol_rot_deg: float = 0.01,
) -> list[float]:
    """Joint solution (deg) whose FK reaches ``target_pose``, seeded from ``seed_deg``.

    Levenberg-Marquardt descent. The caller's seed is tried first (an incremental
    target move always converges from it); if it stalls, a few fallback seeds
    around the target azimuth and its elbow-up / elbow-down / mirror branches are
    tried. This is a local solver, not a full analytic IK -- a cold seed to a pose
    on a distant arm branch can still miss. Raises :class:`IkFailed` when nothing
    converges (target out of reach) or the solution breaks a joint limit.
    """
    if target_pose[2] < FLOOR_CLEARANCE_MM:
        raise IkFailed(
            f"target z={target_pose[2]:.0f}mm is below the floor clearance ({FLOOR_CLEARANCE_MM:.0f}mm)"
        )
    tgt_pos = (target_pose[0] / 1000.0, target_pose[1] / 1000.0, target_pose[2] / 1000.0)
    tgt_rot = _rpy_matrix(*(math.radians(v) for v in target_pose[3:6]))
    tcp_z = tcp_offset_mm / 1000.0

    def _wrap(a: float) -> float:
        return math.atan2(math.sin(a), math.cos(a))

    az = math.atan2(target_pose[1], target_pose[0])
    r45, r90 = math.radians(45.0), math.radians(90.0)
    seeds = [[math.radians(v) for v in seed_deg]]
    for base in (az, _wrap(az + math.pi)):
        seeds += [
            [_wrap(base), 0.0, -r90, 0.0, -r90, 0.0],
            [_wrap(base), r45, r90, 0.0, r45, 0.0],
            [_wrap(base), -r45, -r90, 0.0, -r45, 0.0],
        ]

    best: tuple[list[float], float, float] | None = None
    for seed in seeds:
        q, pos_mm, rot_deg = _solve_from_seed(seed, tgt_pos, tgt_rot, tcp_z, max_iters)
        if pos_mm < tol_pos_mm and rot_deg < tol_rot_deg:
            best = (q, pos_mm, rot_deg)
            break
        if best is None or pos_mm + rot_deg < best[1] + best[2]:
            best = (q, pos_mm, rot_deg)

    assert best is not None
    q, pos_mm, rot_deg = best
    if pos_mm >= tol_pos_mm or rot_deg >= tol_rot_deg:
        raise IkFailed(
            f"target unreachable (closest solution is {pos_mm:.0f} mm / {rot_deg:.0f}° off)"
        )

    q_deg = [math.degrees(v) for v in q]
    for i, (v, lim) in enumerate(zip(q_deg, JOINT_LIMITS_DEG)):
        if abs(v) > lim + 1e-6:
            raise IkFailed(f"solution exceeds joint {i + 1} limit (±{lim:.0f}°)")
    return q_deg


def _det6(m: list[list[float]]) -> float:
    """Determinant of a 6x6 matrix via Gaussian elimination with partial pivoting."""
    a = [row[:] for row in m]
    det = 1.0
    for col in range(6):
        piv = max(range(col, 6), key=lambda r: abs(a[r][col]))
        if abs(a[piv][col]) < 1e-14:
            return 0.0
        if piv != col:
            a[col], a[piv] = a[piv], a[col]
            det = -det
        det *= a[col][col]
        inv = 1.0 / a[col][col]
        for r in range(col + 1, 6):
            f = a[r][col] * inv
            if f:
                for c in range(col, 6):
                    a[r][c] -= f * a[col][c]
    return det


def manipulability(q_deg: list[float], tcp_offset_mm: float = _FLANGE_TCP_M * 1000.0) -> float:
    """Yoshikawa manipulability index -- for this 6-DOF arm's square Jacobian,
    sqrt(det(J·Jᵀ)) reduces to |det(J)|. ~0 at a singularity (the arm loses
    freedom of motion in some direction); larger away from one."""
    j = _jacobian([math.radians(v) for v in q_deg], tcp_offset_mm / 1000.0)
    return abs(_det6(j))
