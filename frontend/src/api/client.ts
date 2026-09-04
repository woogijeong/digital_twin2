export type ToolId = 'none' | 'suction' | 'gripper'

export interface Health {
  status: string
  mode: 'real' | 'mock'
  connected: boolean
  model: string
  host: string
  tool: ToolId
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

/** Thrown by {@link connectController} / {@link goHome} for an expected,
 *  user-facing failure (controller unreachable, motion not permitted). */
export class ApiError extends Error {
  detail: string
  constructor(detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.detail = detail
  }
}

async function postJson(path: string, body?: unknown): Promise<unknown> {
  const r = await fetch(path, {
    method: 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!r.ok) {
    const payload = await r.json().catch(() => null)
    throw new ApiError(payload?.detail?.detail ?? `${path} ${r.status}`)
  }
  return r.json()
}

/** Dial the real IndyDCP3 controller (simulation mode). Throws {@link ApiError}
 *  when it cannot be reached — the twin stays on the mock. */
export function connectController(host: string): Promise<Health> {
  return postJson('/api/connect', { host }) as Promise<Health>
}

/** Drop the controller connection and fall back to the offline mock. */
export function disconnectController(): Promise<Health> {
  return postJson('/api/disconnect') as Promise<Health>
}

/** Select the end-effector. Shifts the reported TCP to the tool tip; against a
 *  real controller also pushes `set_tool_frame`. */
export function setTool(tool: ToolId): Promise<Health> {
  return postJson('/api/tool', { tool }) as Promise<Health>
}

/** Send the twin to its home pose; resolves to the home joint angles (deg).
 *  Throws {@link ApiError} against a real controller (P0 never commands motion). */
export async function goHome(): Promise<number[]> {
  const body = (await postJson('/api/home')) as { jpos: number[] }
  return body.jpos
}

export async function getHealth(): Promise<Health> {
  const r = await fetch('/api/health')
  if (!r.ok) throw new Error(`health ${r.status}`)
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
