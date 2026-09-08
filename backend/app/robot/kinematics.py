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

# Sum of the link lengths from the base (metres) -- an absolute upper bound on
# reach. A target further than this from the base origin cannot possibly be
# solved, so the IK solver rejects it up front instead of grinding every seed.
_MAX_REACH_M = 1.5

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


# Task-error score used to rank descent states and accept LM steps.
def _score(pos_mm: float, rot_deg: float) -> float:
    return pos_mm + rot_deg


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
        if _score(t_pos_mm, t_rot_deg) < _score(pos_mm, rot_deg):
            q, err, pos_mm, rot_deg = trial, t_err, t_pos_mm, t_rot_deg
            lam = max(lam * 0.5, 1e-9)
        else:
            lam = min(lam * 3.0, 1e6)
    return q, pos_mm, rot_deg


def _wrap(a: float) -> float:
    return math.atan2(math.sin(a), math.cos(a))


def _ik_seeds(seed_deg: list[float], target_pose: list[float]) -> list[list[float]]:
    """Seed configurations for the IK descent, ordered cheapest-first.

    The caller's seed comes first (an incremental target move converges straight
    from it). The rest are a structured sweep over shoulder azimuth (toward the
    target and its mirror), shoulder pitch, elbow bend, and two wrist flips --
    enough to land at least one seed in the basin of an in-limit branch for any
    reachable pose, since this is a local solver with no analytic branch
    enumeration.
    """
    az = math.atan2(target_pose[1], target_pose[0])
    seeds = [[math.radians(v) for v in seed_deg]]
    for base in (az, _wrap(az + math.pi)):
        for j1 in (-1.4, -0.6, 0.3, 1.2):
            for j2 in (-2.3, -1.4, -0.5):
                # keep the flange roughly level so the wrist joints have room to
                # orient the tool toward the target.
                j4 = _wrap(-j1 - j2 - _HALF_PI)
                for j3, j5 in ((0.0, 0.0), (math.pi, 0.0)):
                    seeds.append([_wrap(base), j1, j2, j3, _wrap(j4), j5])
    return seeds


def _in_limits(q_deg: list[float]) -> int | None:
    """Index of the first joint outside its limit (wrapping ±360° where that
    helps), or ``None`` if every joint is in range. Mutates ``q_deg`` in place."""
    for i, lim in enumerate(JOINT_LIMITS_DEG):
        v = q_deg[i]
        if v > lim and v - 360.0 >= -lim - 1e-6:
            v = q_deg[i] = v - 360.0
        elif v < -lim and v + 360.0 <= lim + 1e-6:
            v = q_deg[i] = v + 360.0
        if abs(v) > lim + 1e-6:
            return i
    return None


def ik(
    target_pose: list[float],
    seed_deg: list[float],
    *,
    tcp_offset_mm: float = _FLANGE_TCP_M * 1000.0,
    max_iters: int = 220,
    tol_pos_mm: float = 0.5,
    tol_rot_deg: float = 0.2,
) -> list[float]:
    """Joint solution (deg) whose FK reaches ``target_pose``, seeded from ``seed_deg``.

    Levenberg-Marquardt descent from a structured set of seeds (see
    :func:`_ik_seeds`), coarse-to-fine: every seed gets a short screening
    descent, then the most promising is refined to tolerance. A converged
    solution that breaks a joint limit does *not* stop the search -- the next
    seed may reach an in-limit branch. This is a local solver, not a full
    analytic IK, so a genuinely reachable pose is only rejected when no seed
    lands within tolerance and in limits.

    Raises :class:`IkFailed` when nothing converges (target out of reach) or the
    only convergent branches break a joint limit.

    The tolerance (``tol_pos_mm`` / ``tol_rot_deg``) is what "reached" means: a
    sub-millimetre visual twin needs far less precision than a machining
    controller, and a tight tolerance here only shrinks the apparent workspace.
    """
    if target_pose[2] < FLOOR_CLEARANCE_MM:
        raise IkFailed(
            f"target z={target_pose[2]:.0f}mm is below the floor clearance ({FLOOR_CLEARANCE_MM:.0f}mm)"
        )
    tgt_pos = (target_pose[0] / 1000.0, target_pose[1] / 1000.0, target_pose[2] / 1000.0)
    if math.sqrt(sum(c * c for c in tgt_pos)) > _MAX_REACH_M:
        raise IkFailed(
            f"target unreachable (beyond the {_MAX_REACH_M * 1000:.0f} mm reach envelope)"
        )
    tgt_rot = _rpy_matrix(*(math.radians(v) for v in target_pose[3:6]))
    tcp_z = tcp_offset_mm / 1000.0

    def _within(pm: float, rd: float) -> bool:
        return pm < tol_pos_mm and rd < tol_rot_deg

    # The best few in-limit descents (by task score) to refine, the nearest
    # descent of any branch as a fallback start, and the first in-tolerance
    # solution that broke a limit (for the error message).
    top_ok: list[tuple[float, list[float]]] = []  # (score, q_rad), ascending
    closest: tuple[list[float], float, float] | None = None
    limited_joint: int | None = None

    def _consider(q_rad: list[float], pm: float, rd: float) -> list[float] | None:
        nonlocal closest, limited_joint
        q_deg = [math.degrees(v) for v in q_rad]
        bad = _in_limits(q_deg)  # wraps q_deg into range where it can
        if _within(pm, rd) and bad is None:
            return q_deg
        if _within(pm, rd) and limited_joint is None:
            limited_joint = bad
        s = _score(pm, rd)
        if closest is None or s < _score(closest[1], closest[2]):
            closest = (q_rad, pm, rd)
        if bad is None:
            top_ok.append((s, q_rad))
            top_ok.sort(key=lambda t: t[0])
            del top_ok[3:]
        return None

    all_seeds = _ik_seeds(seed_deg, target_pose)

    # The caller's seed (an incremental target move, or a warm compile step) is
    # by far the most likely basin -- give it the full iteration budget first.
    got = _consider(*_solve_from_seed(all_seeds[0], tgt_pos, tgt_rot, tcp_z, max_iters))
    if got is not None:
        return got

    # Screening pass: a short descent from every other seed. Stop early once one
    # lands close on an in-limit branch -- refinement will finish it -- so a
    # solvable target does not pay for the whole seed sweep.
    for seed in all_seeds[1:]:
        got = _consider(*_solve_from_seed(seed, tgt_pos, tgt_rot, tcp_z, 45))
        if got is not None:
            return got
        if top_ok and top_ok[0][0] < 15.0:  # ~1.5 mm / 0.4° in score units
            break

    # Refinement pass: the best in-limit screened starts, then the nearest of any.
    starts = [q for _, q in top_ok]
    if closest is not None:
        starts.append(closest[0])
    for start in starts:
        got = _consider(*_solve_from_seed(start, tgt_pos, tgt_rot, tcp_z, max_iters))
        if got is not None:
            return got

    if limited_joint is not None:
        raise IkFailed(f"solution exceeds joint {limited_joint + 1} limit")
    assert closest is not None
    _, pm, rd = closest
    raise IkFailed(f"target unreachable (closest solution is {pm:.0f} mm / {rd:.0f}° off)")


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
