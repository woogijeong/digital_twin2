import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Tween } from '../three/jointTween'
import type { PoseTuple, ToolId } from '../api/client'
import { BASE_MOVE_MS, parseSequence, type SequenceStep, type SpeedFactor } from '../sequence'
import { compileSequence, type CompiledStep } from '../sequenceCompile'

export type PlaybackStatus =
  | 'idle'
  | 'compiling'
  | 'playing'
  | 'paused'
  | 'done'
  | 'error'
  | 'resetting'

interface Deps {
  /** `health.mode` — playback is mock-only. */
  mode: 'real' | 'mock' | null
  /** currently mounted end-effector (shown in the panel header). */
  tool: ToolId
  animateTo: (jpos: number[], durationMs?: number) => Tween
  holdTelemetry: (on: boolean) => void
  goHome: () => Promise<number[]>
  seedJoints: () => number[]
  seedPose: () => PoseTuple | null
  setGripper: (open: boolean) => void
  setSuction: (on: boolean) => void
  selectTool: (tool: ToolId) => Promise<void>
}

/** ~ms delay after a gripper/suction toggle so the pick/place proximity check
 *  runs against the joints the preceding move already flushed to the scene. */
const IO_SETTLE_MS = 140

function abortableDelay(ms: number, cancelled: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = () => {
      if (cancelled()) return reject(new Error('aborted'))
      if (Date.now() - start >= ms) return resolve()
      setTimeout(tick, 40)
    }
    setTimeout(tick, Math.min(40, ms))
  })
}

/** Owns the mock-mode JSON motion-sequence panel: the pasted text, its parse
 *  state, and an async PLAY / PAUSE / STEP / RESET loop over compiled steps.
 *
 *  All transport methods are stable across renders (they read the latest deps
 *  through a ref), so `abort` can be wired straight into the E-STOP handler. */
export function useSequencePlayback(deps: Deps) {
  const depsRef = useRef(deps)
  depsRef.current = deps

  const [text, setTextState] = useState('')
  const [status, setStatus] = useState<PlaybackStatus>('idle')
  const [index, setIndex] = useState(-1)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [speed, setSpeedState] = useState<SpeedFactor>(1)

  const runIdRef = useRef(0)
  const pauseRef = useRef(false)
  const compiledRef = useRef<CompiledStep[] | null>(null)
  const indexRef = useRef(-1)
  const speedRef = useRef<SpeedFactor>(1)
  const statusRef = useRef<PlaybackStatus>('idle')

  const setStatusBoth = useCallback((s: PlaybackStatus) => {
    statusRef.current = s
    setStatus(s)
  }, [])
  const setIndexBoth = useCallback((i: number) => {
    indexRef.current = i
    setIndex(i)
  }, [])

  const parsed = useMemo(() => parseSequence(text), [text])
  const steps: SequenceStep[] = parsed.ok ? parsed.steps : []
  const total = steps.length
  const parseError = parsed.ok || text.trim() === '' ? null : parsed.error

  const cancelRun = useCallback(() => {
    runIdRef.current += 1
    pauseRef.current = false
  }, [])

  const setText = useCallback(
    (t: string) => {
      cancelRun()
      compiledRef.current = null
      depsRef.current.holdTelemetry(false)
      setIndexBoth(-1)
      setErrorMsg(null)
      setStatusBoth('idle')
      setTextState(t)
    },
    [cancelRun, setIndexBoth, setStatusBoth],
  )

  const setSpeed = useCallback((s: SpeedFactor) => {
    speedRef.current = s
    setSpeedState(s)
  }, [])

  const runLoop = useCallback(
    async (fromIndex: number, oneStep: boolean) => {
      const myRun = runIdRef.current
      const compiled = compiledRef.current
      if (!compiled) return
      const d = depsRef.current

      for (let i = fromIndex; i < compiled.length; i++) {
        if (myRun !== runIdRef.current) return
        if (pauseRef.current && !oneStep) {
          setStatusBoth('paused')
          return
        }
        setIndexBoth(i)
        const s = compiled[i]
        try {
          switch (s.kind) {
            case 'move':
              await d.animateTo(s.jpos, BASE_MOVE_MS / speedRef.current).done
              break
            case 'gripper':
              d.setGripper(s.open)
              await abortableDelay(IO_SETTLE_MS / speedRef.current, () => myRun !== runIdRef.current)
              break
            case 'suction':
              d.setSuction(s.on)
              await abortableDelay(IO_SETTLE_MS / speedRef.current, () => myRun !== runIdRef.current)
              break
            case 'tool':
              await d.selectTool(s.tool)
              break
            case 'wait':
              await abortableDelay(s.ms / speedRef.current, () => myRun !== runIdRef.current)
              break
          }
        } catch {
          return // tween cancelled or delay aborted
        }
        if (myRun !== runIdRef.current) return
        if (oneStep) {
          setStatusBoth('paused')
          return
        }
      }
      setIndexBoth(compiled.length)
      setStatusBoth('done')
    },
    [setIndexBoth, setStatusBoth],
  )

  const compileAndArm = useCallback(async (): Promise<boolean> => {
    cancelRun()
    const myRun = runIdRef.current
    const d = depsRef.current
    setErrorMsg(null)
    setStatusBoth('compiling')
    d.holdTelemetry(true)
    const p = parseSequence(text)
    const res = await compileSequence(p.ok ? p.steps : [], {
      joints: d.seedJoints(),
      pose: d.seedPose(),
    })
    if (myRun !== runIdRef.current) return false
    if (!res.ok) {
      compiledRef.current = null
      setIndexBoth(res.failedStep - 1)
      setErrorMsg(`step ${res.failedStep}: ${res.error}`)
      setStatusBoth('error')
      return false
    }
    compiledRef.current = res.compiled
    setIndexBoth(-1)
    return true
  }, [cancelRun, text, setIndexBoth, setStatusBoth])

  const canStart =
    depsRef.current.mode === 'mock' &&
    parsed.ok &&
    (status === 'idle' || status === 'paused' || status === 'done' || status === 'error')

  const play = useCallback(async () => {
    const d = depsRef.current
    if (d.mode !== 'mock') return
    if (!parseSequence(text).ok) return
    if (statusRef.current === 'paused' && compiledRef.current) {
      pauseRef.current = false
      setStatusBoth('playing')
      void runLoop(indexRef.current + 1, false)
      return
    }
    if (!(await compileAndArm())) return
    setStatusBoth('playing')
    void runLoop(0, false)
  }, [text, compileAndArm, runLoop, setStatusBoth])

  const step = useCallback(async () => {
    const d = depsRef.current
    if (d.mode !== 'mock') return
    if (!parseSequence(text).ok) return
    if (statusRef.current === 'paused' && compiledRef.current) {
      void runLoop(indexRef.current + 1, true)
      return
    }
    if (!(await compileAndArm())) return
    void runLoop(0, true)
  }, [text, compileAndArm, runLoop])

  const pause = useCallback(() => {
    if (statusRef.current === 'playing') pauseRef.current = true
  }, [])

  const reset = useCallback(async () => {
    cancelRun()
    const myRun = runIdRef.current
    const d = depsRef.current
    compiledRef.current = null
    setErrorMsg(null)
    setStatusBoth('resetting')
    d.holdTelemetry(true)
    try {
      const home = await d.goHome()
      if (myRun !== runIdRef.current) return
      await d.animateTo(home, BASE_MOVE_MS).done
    } catch {
      /* goHome failed (never in mock) or the tween was superseded */
    }
    if (myRun !== runIdRef.current) return
    d.holdTelemetry(false)
    setIndexBoth(-1)
    setStatusBoth('idle')
  }, [cancelRun, setIndexBoth, setStatusBoth])

  /** Called by the E-STOP handler before it freezes the twin. */
  const abort = useCallback(() => {
    const wasActive =
      statusRef.current === 'playing' ||
      statusRef.current === 'compiling' ||
      statusRef.current === 'paused'
    cancelRun()
    if (wasActive) {
      setErrorMsg('stopped by E-STOP — press RESET')
      setStatusBoth('error')
    }
  }, [cancelRun, setStatusBoth])

  useEffect(
    () => () => {
      runIdRef.current += 1
      depsRef.current.holdTelemetry(false)
    },
    [],
  )

  return {
    text,
    setText,
    steps,
    total,
    index,
    status,
    errorMsg,
    parseError,
    speed,
    setSpeed,
    canStart,
    isMock: deps.mode === 'mock',
    tool: deps.tool,
    play,
    pause,
    step,
    reset,
    abort,
  }
}

export type SequencePlayback = ReturnType<typeof useSequencePlayback>
