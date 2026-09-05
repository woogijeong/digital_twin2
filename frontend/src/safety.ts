/** Mirrors backend/app/robot/kinematics.py JOINT_LIMITS_DEG. Must stay in sync. */
export const JOINT_LIMITS_DEG = [175, 175, 175, 175, 175, 215] as const
export const LIMIT_WARN_MARGIN_DEG = 8
export const FLOOR_CLEARANCE_MM = 5

export interface SafetyAlert {
  kind: 'collision' | 'limit'
  message: string
}

/** Near-limit joint indices (0-based, joint0..joint5), for highlighting JointBars. */
export function nearLimitJoints(jointsDeg: number[]): Set<number> {
  const out = new Set<number>()
  jointsDeg.forEach((v, i) => {
    if (JOINT_LIMITS_DEG[i] - Math.abs(v) < LIMIT_WARN_MARGIN_DEG) out.add(i)
  })
  return out
}

export function checkSafety(pose: number[] | null, jointsDeg: number[]): SafetyAlert[] {
  const alerts: SafetyAlert[] = []
  if (pose && pose[2] < FLOOR_CLEARANCE_MM) {
    alerts.push({ kind: 'collision', message: `TCP ${pose[2].toFixed(0)}mm — below floor clearance` })
  }
  for (const i of nearLimitJoints(jointsDeg)) {
    const margin = JOINT_LIMITS_DEG[i] - Math.abs(jointsDeg[i])
    alerts.push({ kind: 'limit', message: `J${i + 1} ${margin.toFixed(0)}° from limit` })
  }
  return alerts
}
