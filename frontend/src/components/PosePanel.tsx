import { useEffect, useState, type CSSProperties } from 'react'
import { AXIS_LABELS, AXIS_UNITS, T } from '../theme'
import { ApiError, IkError, goHome, solveIk, type PoseTuple } from '../api/client'
import { resolveRelative } from '../pose'
import { fmt1 } from '../format'
import { SectionHead } from './JointBars'

interface Props {
  /** Live TCP pose from telemetry: [x,y,z,rx,ry,rz]. */
  pose: number[] | null
  /** Current joint angles (deg) — the IK seed. */
  jointsDeg: number[]
  /** telemetry gone quiet -> dim the live readout */
  stale: boolean
  /** Called with the IK joint solution (deg) when a target is applied. */
  onApply: (jpos: number[]) => void
  /** Live robot mode — RESET is disabled against the real controller. */
  mode: 'real' | 'mock' | null
}

const ZEROS = ['0', '0', '0', '0', '0', '0']

const MODES: Array<{ label: string; rel: boolean; title: string }> = [
  { label: 'ABS', rel: false, title: 'absolute pose in the base frame' },
  { label: 'REL', rel: true, title: 'offset from the current pose' },
]

export default function PosePanel({ pose, jointsDeg, stale, onApply, mode }: Props) {
  const [target, setTarget] = useState<string[] | null>(null)
  const [relative, setRelative] = useState(false)
  const [busy, setBusy] = useState(false)
  const [homing, setHoming] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // In absolute mode, seed the target inputs once from the first live pose.
  // After that (and always in relative mode) they are the user's to edit.
  useEffect(() => {
    if (target === null && pose && !relative) setTarget(pose.map((v) => v.toFixed(1)))
  }, [pose, target, relative])

  const fields = target ?? (relative ? ZEROS : ['', '', '', '', '', ''])

  const setField = (i: number, v: string) =>
    setTarget((t) => (t ?? fields).map((cur, j) => (j === i ? v : cur)))

  const liveFields = () => (pose ? pose.map((v) => v.toFixed(1)) : null)

  const setMode = (rel: boolean) => {
    setRelative(rel)
    setErr(null)
    setTarget(rel ? [...ZEROS] : liveFields())
  }

  // SYNC (absolute) copies the live pose in; ZERO (relative) clears the deltas.
  const resetFields = () => setTarget(relative ? [...ZEROS] : liveFields())

  const nums = fields.map(Number)
  const allNumeric = fields.every((f) => f.trim() !== '' && !Number.isNaN(Number(f)))
  const resolved: PoseTuple | null =
    relative && pose && allNumeric
      ? resolveRelative(pose as PoseTuple, nums as PoseTuple)
      : null

  const submit = async () => {
    if (!allNumeric) {
      setErr('all six values must be numbers')
      return
    }
    let tpos = nums as PoseTuple
    if (relative) {
      if (!pose) {
        setErr('waiting for live pose')
        return
      }
      tpos = resolveRelative(pose as PoseTuple, nums as PoseTuple)
    }
    setBusy(true)
    setErr(null)
    try {
      const jpos = await solveIk(tpos, jointsDeg)
      onApply(jpos)
    } catch (e) {
      setErr(e instanceof IkError ? e.detail : 'request failed')
    } finally {
      setBusy(false)
    }
  }

  const resetToHome = async () => {
    setHoming(true)
    setErr(null)
    try {
      onApply(await goHome())
    } catch (e) {
      setErr(e instanceof ApiError ? e.detail : 'reset failed')
    } finally {
      setHoming(false)
    }
  }

  return (
    <>
      <section>
        <SectionHead>TCP POSE&nbsp;&nbsp;/&nbsp;&nbsp;{stale ? 'STALE' : 'LIVE'}</SectionHead>
        <div style={{ ...grid3, opacity: stale ? T.dim : 1 }}>
          {AXIS_LABELS.map((label, i) => (
            <div key={label} style={cell}>
              <div style={cellLabel}>
                {label} · {AXIS_UNITS[i]}
              </div>
              <div style={cellValue}>{pose ? fmt1(pose[i]) : '—'}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <SectionHead>TARGET POSE</SectionHead>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={toggleWrap} role="group" aria-label="target coordinate mode">
              {MODES.map(({ label, rel, title }) => (
                <button
                  key={label}
                  onClick={() => setMode(rel)}
                  aria-pressed={relative === rel}
                  title={title}
                  style={{ ...toggleBtn, ...(relative === rel ? toggleBtnOn : null) }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={resetFields}
              style={syncBtn}
              title={relative ? 'zero all offsets' : 'copy live pose into target'}
            >
              {relative ? '⟲ ZERO' : '⟲ SYNC'}
            </button>
          </div>
        </div>
        <div style={grid3}>
          {AXIS_LABELS.map((label, i) => (
            <label key={label} style={{ display: 'block' }}>
              <span style={inputLabel}>
                {relative ? 'Δ' : ''}
                {label} {AXIS_UNITS[i]}
              </span>
              <input
                value={fields[i]}
                onChange={(e) => setField(i, e.target.value)}
                style={input}
                inputMode="decimal"
              />
            </label>
          ))}
        </div>
        {relative && (
          <div style={resolvedHint}>
            {resolved
              ? `→ abs [ ${fmt1(resolved[0])}, ${fmt1(resolved[1])}, ${fmt1(resolved[2])} ] mm`
              : '→ offset from the live pose'}
          </div>
        )}
        <button onClick={submit} disabled={busy} style={{ ...applyBtn, opacity: busy ? 0.6 : 1 }}>
          {busy ? 'SOLVING…' : 'APPLY TARGET'}
        </button>
        <button
          onClick={resetToHome}
          disabled={homing || mode === 'real'}
          title={
            mode === 'real'
              ? 'P0 never commands the real controller'
              : 'ease the twin back to its home pose'
          }
          style={{ ...homeBtn, opacity: homing || mode === 'real' ? 0.5 : 1 }}
        >
          {homing ? 'RESETTING…' : '⌂ RESET TO HOME'}
        </button>
        {err && (
          <div
            style={{
              marginTop: 8,
              fontFamily: T.fontMono,
              fontSize: 11,
              color: T.amber,
            }}
          >
            IK: {err}
          </div>
        )}
      </section>
    </>
  )
}

const grid3: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 10,
}
const cell: CSSProperties = {
  background: T.bg,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  padding: '10px 11px',
}
const cellLabel: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 9.5,
  color: T.muted,
  letterSpacing: '0.12em',
}
const cellValue: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 19,
  color: T.teal,
  marginTop: 4,
}
const inputLabel: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 9.5,
  color: T.muted,
  letterSpacing: '0.1em',
}
const input: CSSProperties = {
  width: '100%',
  marginTop: 4,
  background: T.bg,
  border: `1px solid ${T.borderInput}`,
  borderRadius: 7,
  padding: '8px 9px',
  color: T.text,
  fontFamily: T.fontMono,
  fontSize: 13,
}
const toggleWrap: CSSProperties = {
  display: 'flex',
  border: `1px solid ${T.borderInput}`,
  borderRadius: 6,
  overflow: 'hidden',
}
const toggleBtn: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: T.muted,
  padding: '3px 8px',
  fontFamily: T.fontMono,
  fontSize: 9,
  letterSpacing: '0.1em',
  cursor: 'pointer',
}
const toggleBtnOn: CSSProperties = {
  background: T.teal,
  color: T.onTeal,
}
const resolvedHint: CSSProperties = {
  marginTop: 8,
  fontFamily: T.fontMono,
  fontSize: 10,
  color: T.hint,
  letterSpacing: '0.04em',
}
const syncBtn: CSSProperties = {
  background: 'transparent',
  border: `1px solid ${T.borderInput}`,
  color: T.muted,
  borderRadius: 6,
  padding: '3px 8px',
  fontFamily: T.fontMono,
  fontSize: 9,
  letterSpacing: '0.1em',
}
const applyBtn: CSSProperties = {
  marginTop: 12,
  width: '100%',
  padding: 11,
  background: T.teal,
  color: T.onTeal,
  border: 'none',
  borderRadius: 8,
  fontFamily: T.fontDisplay,
  fontWeight: 600,
  fontSize: 13,
  letterSpacing: '0.14em',
}
const homeBtn: CSSProperties = {
  marginTop: 8,
  width: '100%',
  padding: 9,
  background: 'transparent',
  color: T.muted,
  border: `1px solid ${T.borderInput}`,
  borderRadius: 8,
  fontFamily: T.fontMono,
  fontSize: 11,
  letterSpacing: '0.12em',
  cursor: 'pointer',
}
