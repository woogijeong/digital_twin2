import { useCallback, useEffect, useRef, useState } from 'react'
import { tweenJoints, type Tween } from '../three/jointTween'

const ZERO = [0, 0, 0, 0, 0, 0]

/** Merges live telemetry with user-driven IK moves.
 *
 *  - Normally the rendered joints follow `telemetryQ` (live mirror).
 *  - While an IK move is animating, the tween owns the joints and telemetry is
 *    ignored until it finishes (or is superseded by a newer move).
 *  - `holdTelemetry(true)` extends that "ignore telemetry" state across a whole
 *    sequence-playback program: `movej` / `home` steps animate the twin
 *    client-side without ever commanding the mock, so between steps the stale
 *    mock telemetry frame would otherwise snap the twin backward. */
export function useJointAnimation(telemetryQ: number[] | null) {
  const [jointsDeg, setJointsDeg] = useState<number[]>(ZERO)
  const tweening = useRef(false)
  const programHold = useRef(false)
  const activeTween = useRef<Tween | null>(null)
  const latest = useRef<number[]>(ZERO)
  const lastTelemetry = useRef<number[] | null>(null)

  useEffect(() => {
    if (telemetryQ) lastTelemetry.current = telemetryQ
    if (telemetryQ && !tweening.current && !programHold.current) {
      latest.current = telemetryQ
      setJointsDeg(telemetryQ)
    }
  }, [telemetryQ])

  /** Freeze the rendered joints against live telemetry for a whole playback
   *  program. Releasing re-syncs to the latest telemetry frame. */
  const holdTelemetry = useCallback((on: boolean) => {
    programHold.current = on
    if (!on && lastTelemetry.current && !tweening.current) {
      latest.current = lastTelemetry.current
      setJointsDeg(lastTelemetry.current)
    }
  }, [])

  /** Halt any in-progress IK move and freeze the rendered joints where they
   *  are, handing control back to live telemetry. Used by the E-STOP button. */
  const stopAnimation = useCallback(() => {
    activeTween.current?.cancel()
    activeTween.current = null
    tweening.current = false
  }, [])

  const animateTo = useCallback((targetJpos: number[], durationMs = 1000) => {
    activeTween.current?.cancel()
    tweening.current = true
    const from = latest.current
    const tw = tweenJoints(
      from,
      targetJpos,
      (q) => {
        latest.current = q
        setJointsDeg(q)
      },
      durationMs,
    )
    activeTween.current = tw
    tw.done
      .then(() => {
        tweening.current = false
      })
      .catch(() => {
        /* superseded by a newer move */
      })
    return tw
  }, [])

  useEffect(() => () => activeTween.current?.cancel(), [])

  return { jointsDeg, animateTo, stopAnimation, holdTelemetry }
}
