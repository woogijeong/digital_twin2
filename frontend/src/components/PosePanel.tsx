import { useEffect, useState, type CSSProperties } from 'react'
import { AXIS_LABELS, AXIS_UNITS, T } from '../theme'
import { IkError, solveIk, type PoseTuple } from '../api/client'
import { SectionHead } from './JointBars'

interface Props {
  /** Live TCP pose from telemetry: [x,y,z,rx,ry,rz]. */
  pose: number[] | null
  /** Current joint angles (deg) — the IK seed. */
  jointsDeg: number[]
  /** Called with the IK joint solution (deg) when a target is applied. */
  onApply: (jpos: number[]) => void
}

export default function PosePanel({ pose, jointsDeg, onApply }: Props) {
  const [target, setTarget] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Seed the target inputs once, from the first live pose we receive. After
  // that they are the user's to edit -- telemetry never overwrites them.
  useEffect(() => {
    if (target === null && pose) setTarget(pose.map((v) => v.toFixed(1)))
  }, [pose, target])

  const fields = target ?? ['', '', '', '', '', '']

  const setField = (i: number, v: string) =>
    setTarget((t) => (t ?? fields).map((cur, j) => (j === i ? v : cur)))

  const syncToLive = () => pose && setTarget(pose.map((v) => v.toFixed(1)))

  const submit = async () => {
    const tpos = fields.map(Number)
    if (tpos.some((n) => Number.isNaN(n))) {
      setErr('all six values must be numbers')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const jpos = await solveIk(tpos as PoseTuple, jointsDeg)
      onApply(jpos)
    } catch (e) {
      setErr(e instanceof IkError ? e.detail : 'request failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <section>
        <SectionHead>TCP POSE&nbsp;&nbsp;/&nbsp;&nbsp;LIVE</SectionHead>
        <div style={grid3}>
          {AXIS_LABELS.map((label, i) => (
            <div key={label} style={cell}>
              <div style={cellLabel}>
                {label} · {AXIS_UNITS[i]}
              </div>
              <div style={cellValue}>{pose ? fmt(pose[i]) : '—'}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <SectionHead>TARGET POSE</SectionHead>
          <button onClick={syncToLive} style={syncBtn} title="copy live pose into target">
            ⟲ SYNC
          </button>
        </div>
        <div style={grid3}>
          {AXIS_LABELS.map((label, i) => (
            <label key={label} style={{ display: 'block' }}>
              <span style={inputLabel}>
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
        <button onClick={submit} disabled={busy} style={{ ...applyBtn, opacity: busy ? 0.6 : 1 }}>
          {busy ? 'SOLVING…' : 'APPLY TARGET'}
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

const fmt = (n: number) => (n < 0 ? '−' : '') + Math.abs(n).toFixed(1)

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
  color: '#08211f',
  border: 'none',
  borderRadius: 8,
  fontFamily: T.fontDisplay,
  fontWeight: 600,
  fontSize: 13,
  letterSpacing: '0.14em',
}
