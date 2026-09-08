/** JSON motion-sequence format for the mock-mode playback panel.
 *
 *  A sequence is a JSON array of step objects. Poses are `[x,y,z,rx,ry,rz]` in
 *  the same units the rest of the app uses (mm, fixed-axis XYZ Euler degrees);
 *  joint targets are six angles in degrees. `movel` deltas in the `rel` / `tool`
 *  frame resolve against the previous step's pose, exactly like the target
 *  panel's REL / TOOL modes (see `pose.ts`).
 *
 *  This module is pure — no React, no `fetch` — so it can be exercised directly.
 */

import type { PoseTuple, ToolId } from './api/client'

/** Base ease time for a move step, ms. Matches `jointTween`'s default and the
 *  mock robot's `_MOVE_DURATION_S`. Playback divides this by the speed factor. */
export const BASE_MOVE_MS = 1000

export type SpeedFactor = 0.5 | 1 | 2 | 4
export const SPEEDS: readonly SpeedFactor[] = [0.5, 1, 2, 4]

/** Upper bound on a `wait` step so a typo can't wedge playback for minutes. */
export const MAX_WAIT_S = 30

export type Frame = 'abs' | 'rel' | 'tool'
const FRAMES: readonly Frame[] = ['abs', 'rel', 'tool']
const TOOLS: readonly ToolId[] = ['none', 'suction', 'gripper']

export interface MoveJStep {
  type: 'movej'
  jpos: [number, number, number, number, number, number]
}
export interface MoveLStep {
  type: 'movel'
  pose: PoseTuple
  /** defaults to `abs` when omitted */
  frame?: Frame
}
export interface GripperStep {
  type: 'gripper'
  open: boolean
}
export interface SuctionStep {
  type: 'suction'
  on: boolean
}
export interface WaitStep {
  type: 'wait'
  seconds: number
}
export interface HomeStep {
  type: 'home'
}
export interface ToolStep {
  type: 'tool'
  tool: ToolId
}

export type SequenceStep =
  | MoveJStep
  | MoveLStep
  | GripperStep
  | SuctionStep
  | WaitStep
  | HomeStep
  | ToolStep

export type ParseResult =
  | { ok: true; steps: SequenceStep[] }
  | { ok: false; error: string }

function isSixNumbers(v: unknown): v is [number, number, number, number, number, number] {
  return Array.isArray(v) && v.length === 6 && v.every((n) => typeof n === 'number' && Number.isFinite(n))
}

/** Parse and validate a sequence. On failure `error` names the offending step
 *  1-based ("step 3: ...") so the panel can point the user at it. */
export function parseSequence(text: string): ParseResult {
  if (text.trim() === '') return { ok: false, error: 'paste a JSON array of steps' }

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: `invalid JSON: ${e instanceof Error ? e.message : 'parse error'}` }
  }
  if (!Array.isArray(raw)) return { ok: false, error: 'expected a JSON array of steps' }
  if (raw.length === 0) return { ok: false, error: 'the sequence is empty' }

  const steps: SequenceStep[] = []
  for (let i = 0; i < raw.length; i++) {
    const at = `step ${i + 1}`
    const s = raw[i]
    if (typeof s !== 'object' || s === null || Array.isArray(s)) {
      return { ok: false, error: `${at}: each step must be an object` }
    }
    const step = s as Record<string, unknown>
    const type = step.type
    if (typeof type !== 'string') return { ok: false, error: `${at}: missing "type"` }

    switch (type) {
      case 'movej':
        if (!isSixNumbers(step.jpos)) {
          return { ok: false, error: `${at}: movej.jpos must be an array of 6 numbers` }
        }
        steps.push({ type: 'movej', jpos: step.jpos })
        break
      case 'movel': {
        if (!isSixNumbers(step.pose)) {
          return { ok: false, error: `${at}: movel.pose must be an array of 6 numbers` }
        }
        let frame: Frame = 'abs'
        if (step.frame !== undefined) {
          if (typeof step.frame !== 'string' || !FRAMES.includes(step.frame as Frame)) {
            return { ok: false, error: `${at}: movel.frame must be abs, rel or tool` }
          }
          frame = step.frame as Frame
        }
        steps.push({ type: 'movel', pose: step.pose as PoseTuple, frame })
        break
      }
      case 'gripper':
        if (typeof step.open !== 'boolean') {
          return { ok: false, error: `${at}: gripper.open must be true or false` }
        }
        steps.push({ type: 'gripper', open: step.open })
        break
      case 'suction':
        if (typeof step.on !== 'boolean') {
          return { ok: false, error: `${at}: suction.on must be true or false` }
        }
        steps.push({ type: 'suction', on: step.on })
        break
      case 'wait':
        if (typeof step.seconds !== 'number' || !Number.isFinite(step.seconds) || step.seconds <= 0) {
          return { ok: false, error: `${at}: wait.seconds must be a positive number` }
        }
        if (step.seconds > MAX_WAIT_S) {
          return { ok: false, error: `${at}: wait.seconds must be ${MAX_WAIT_S} or less` }
        }
        steps.push({ type: 'wait', seconds: step.seconds })
        break
      case 'home':
        steps.push({ type: 'home' })
        break
      case 'tool':
        if (typeof step.tool !== 'string' || !TOOLS.includes(step.tool as ToolId)) {
          return { ok: false, error: `${at}: tool.tool must be none, suction or gripper` }
        }
        steps.push({ type: 'tool', tool: step.tool as ToolId })
        break
      default:
        return { ok: false, error: `${at}: unknown step type "${type}"` }
    }
  }
  return { ok: true, steps }
}

const n1 = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))

/** One-line label for the step list. */
export function describeStep(step: SequenceStep): string {
  switch (step.type) {
    case 'movej':
      return `movej [${step.jpos.map(n1).join(', ')}]`
    case 'movel':
      return `movel ${step.frame ?? 'abs'} [${step.pose.slice(0, 3).map(n1).join(', ')}]`
    case 'gripper':
      return `gripper ${step.open ? 'open' : 'close'}`
    case 'suction':
      return `suction ${step.on ? 'on' : 'off'}`
    case 'wait':
      return `wait ${step.seconds}s`
    case 'home':
      return 'home'
    case 'tool':
      return `tool ${step.tool}`
  }
}
