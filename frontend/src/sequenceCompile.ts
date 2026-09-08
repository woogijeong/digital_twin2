/** Compile a parsed motion sequence into a flat list of playable steps.
 *
 *  Every `movej` / `movel` / `home` is pre-solved to a joint array here, before
 *  playback moves anything, so an unreachable target surfaces as a "step N: ..."
 *  error up front rather than mid-run. `rel` / `tool` `movel` deltas resolve
 *  against a running cursor pose using the same helpers as the target panel.
 */

import { IkError, solveIk, type PoseTuple, type ToolId } from './api/client'
import { resolveRelative, resolveToolRelative } from './pose'
import type { SequenceStep } from './sequence'

/** Mock robot's rest pose (`_READY` in backend/app/robot/mock.py). */
export const READY_JPOS: [number, number, number, number, number, number] = [0, 0, -90, 0, -90, 0]

export type CompiledStep =
  | { kind: 'move'; jpos: number[] }
  | { kind: 'gripper'; open: boolean }
  | { kind: 'suction'; on: boolean }
  | { kind: 'tool'; tool: ToolId }
  | { kind: 'wait'; ms: number }

export type CompileResult =
  | { ok: true; compiled: CompiledStep[] }
  | { ok: false; failedStep: number; error: string }

export interface CompileStart {
  /** Current rendered joint angles — the IK seed and the FK-free cursor start. */
  joints: number[]
  /** Current live TCP pose, or `null` when telemetry hasn't arrived yet. */
  pose: PoseTuple | null
}

/** Walk the steps, resolving Cartesian targets and solving IK per move. */
export async function compileSequence(
  steps: SequenceStep[],
  start: CompileStart,
): Promise<CompileResult> {
  const compiled: CompiledStep[] = []
  let cursorJoints = start.joints
  let cursorPose: PoseTuple | null = start.pose

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const n = i + 1
    switch (step.type) {
      case 'movej':
        cursorJoints = step.jpos
        cursorPose = null // no client FK — a following rel/tool movel can't resolve
        compiled.push({ kind: 'move', jpos: step.jpos })
        break
      case 'home':
        cursorJoints = READY_JPOS
        cursorPose = null
        compiled.push({ kind: 'move', jpos: READY_JPOS })
        break
      case 'movel': {
        const frame = step.frame ?? 'abs'
        let target: PoseTuple
        if (frame === 'abs') {
          target = step.pose
        } else {
          if (!cursorPose) {
            return {
              ok: false,
              failedStep: n,
              error: `movel ${frame} needs a known pose to offset from — put a movel with "frame":"abs" before it`,
            }
          }
          target =
            frame === 'tool'
              ? resolveToolRelative(cursorPose, step.pose)
              : resolveRelative(cursorPose, step.pose)
        }
        try {
          cursorJoints = await solveIk(target, cursorJoints)
        } catch (e) {
          return {
            ok: false,
            failedStep: n,
            error: e instanceof IkError ? e.detail : 'IK request failed',
          }
        }
        cursorPose = target
        compiled.push({ kind: 'move', jpos: cursorJoints })
        break
      }
      case 'tool':
        compiled.push({ kind: 'tool', tool: step.tool })
        break
      case 'gripper':
        compiled.push({ kind: 'gripper', open: step.open })
        break
      case 'suction':
        compiled.push({ kind: 'suction', on: step.on })
        break
      case 'wait':
        compiled.push({ kind: 'wait', ms: Math.round(step.seconds * 1000) })
        break
    }
  }
  return { ok: true, compiled }
}
