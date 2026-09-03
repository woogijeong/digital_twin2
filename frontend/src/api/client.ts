export interface Health {
  status: string
  mode: 'real' | 'mock'
  connected: boolean
  model: string
  host: string
}

export interface Pose {
  x: number
  y: number
  z: number
  rx: number
  ry: number
  rz: number
}

export type PoseTuple = [number, number, number, number, number, number]

export class IkError extends Error {
  detail: string
  constructor(detail: string) {
    super(detail)
    this.name = 'IkError'
    this.detail = detail
  }
}

export async function getHealth(): Promise<Health> {
  const r = await fetch('/api/health')
  if (!r.ok) throw new Error(`health ${r.status}`)
  return r.json()
}

export async function getPose(): Promise<Pose> {
  const r = await fetch('/api/pose')
  if (!r.ok) throw new Error(`pose ${r.status}`)
  return r.json()
}

/** Solve IK on the controller. Throws {@link IkError} on an unreachable target. */
export async function solveIk(
  tpos: PoseTuple,
  initJpos: number[],
): Promise<number[]> {
  const r = await fetch('/api/ik', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tpos, init_jpos: initJpos }),
  })
  if (r.status === 422) {
    const body = await r.json().catch(() => null)
    throw new IkError(body?.detail?.detail ?? 'inverse kinematics failed')
  }
  if (!r.ok) throw new Error(`ik ${r.status}`)
  const body = (await r.json()) as { jpos: number[] }
  return body.jpos
}

export const poseToTuple = (p: Pose): PoseTuple => [p.x, p.y, p.z, p.rx, p.ry, p.rz]
