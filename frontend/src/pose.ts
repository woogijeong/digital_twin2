/** Pose math shared by the target panel.
 *
 *  Orientation uses the same convention as the backend / URDF: fixed-axis XYZ
 *  Euler angles in degrees, `R = Rz(rz) · Ry(ry) · Rx(rx)`.
 */

import type { PoseTuple } from './api/client'

type Mat3 = [number, number, number, number, number, number, number, number, number]

const D2R = Math.PI / 180
const R2D = 180 / Math.PI

function matFromEuler(rxDeg: number, ryDeg: number, rzDeg: number): Mat3 {
  const cr = Math.cos(rxDeg * D2R)
  const sr = Math.sin(rxDeg * D2R)
  const cp = Math.cos(ryDeg * D2R)
  const sp = Math.sin(ryDeg * D2R)
  const cy = Math.cos(rzDeg * D2R)
  const sy = Math.sin(rzDeg * D2R)
  return [
    cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr,
    sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr,
    -sp, cp * sr, cp * cr,
  ]
}

function eulerFromMat(m: Mat3): [number, number, number] {
  const sy = Math.hypot(m[0], m[3])
  if (sy > 1e-9) {
    return [Math.atan2(m[7], m[8]) * R2D, Math.atan2(-m[6], sy) * R2D, Math.atan2(m[3], m[0]) * R2D]
  }
  // Gimbal lock (pitch = ±90°): pin yaw to 0.
  return [Math.atan2(-m[5], m[4]) * R2D, Math.atan2(-m[6], sy) * R2D, 0]
}

function mul(a: Mat3, b: Mat3): Mat3 {
  const out = [0, 0, 0, 0, 0, 0, 0, 0, 0] as Mat3
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[3 * r + c] = a[3 * r] * b[c] + a[3 * r + 1] * b[3 + c] + a[3 * r + 2] * b[6 + c]
    }
  }
  return out
}

/** Resolve a relative target (deltas along the base-frame axes, rotations about
 *  the base-frame axes) against the current pose into an absolute base-frame
 *  pose ready for IK. */
export function resolveRelative(current: PoseTuple, delta: PoseTuple): PoseTuple {
  const rNew = mul(
    matFromEuler(delta[3], delta[4], delta[5]),
    matFromEuler(current[3], current[4], current[5]),
  )
  const [rx, ry, rz] = eulerFromMat(rNew)
  return [current[0] + delta[0], current[1] + delta[1], current[2] + delta[2], rx, ry, rz]
}
