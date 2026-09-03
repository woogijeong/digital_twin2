/** cubic ease-in-out */
const k = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

export interface Tween {
  cancel(): void
  readonly done: Promise<void>
}

/** Interpolates `from` -> `to` (per-joint) over `durationMs`, calling `onStep`
 *  every animation frame. Returns a handle whose `done` resolves on completion
 *  and rejects on `cancel()`. */
export function tweenJoints(
  from: number[],
  to: number[],
  onStep: (q: number[]) => void,
  durationMs = 1000,
): Tween {
  let raf = 0
  let settled = false
  const start = performance.now()
  let rejectDone!: (reason: Error) => void

  const done = new Promise<void>((resolve, reject) => {
    rejectDone = reject
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      onStep(from.map((v, i) => v + (to[i] - v) * k(t)))
      if (t < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        settled = true
        resolve()
      }
    }
    raf = requestAnimationFrame(tick)
  })

  return {
    cancel() {
      if (settled) return
      settled = true
      cancelAnimationFrame(raf)
      rejectDone(new Error('tween cancelled'))
    },
    done,
  }
}
