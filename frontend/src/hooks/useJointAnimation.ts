import { useCallback, useEffect, useRef, useState } from 'react'
import { tweenJoints, type Tween } from '../three/jointTween'

const ZERO = [0, 0, 0, 0, 0, 0]

/** Merges live telemetry with user-driven IK moves.
 *
 *  - Normally the rendered joints follow `telemetryQ` (live mirror).
 *  - While an IK move is animating, the tween owns the joints and telemetry is
 *    ignored until it finishes (or is superseded by a newer move). */
export function useJointAnimation(telemetryQ: number[] | null) {
  const [jointsDeg, setJointsDeg] = useState<number[]>(ZERO)
  const tweening = useRef(false)
  const activeTween = useRef<Tween | null>(null)
  const latest = useRef<number[]>(ZERO)

  useEffect(() => {
    if (telemetryQ && !tweening.current) {
      latest.current = telemetryQ
      setJointsDeg(telemetryQ)
    }
  }, [telemetryQ])

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

  return { jointsDeg, animateTo, stopAnimation }
}
