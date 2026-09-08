import type { CSSProperties } from 'react'
import { T } from '../theme'
import { SPEEDS, describeStep, type SpeedFactor } from '../sequence'
import type { SequencePlayback } from '../hooks/useSequencePlayback'
import { SectionHead } from './JointBars'

const EXAMPLE_3_MOVE = `[
  { "type": "home" },
  { "type": "movej", "jpos": [0, -15, -110, 0, -55, 0] },
  { "type": "movel", "pose": [400, 0, 500, 180, 0, -90] },
  { "type": "movel", "pose": [0, 0, -120, 0, 0, 0], "frame": "tool" }
]`

const EXAMPLE_PICK_PLACE = `[
  { "type": "home" },
  { "type": "tool", "tool": "gripper" },
  { "type": "gripper", "open": true },
  { "type": "movel", "pose": [350, -186.5, 250, 180, 0, -90] },
  { "type": "movel", "pose": [0, 0, -210, 0, 0, 0], "frame": "rel" },
  { "type": "wait", "seconds": 0.3 },
  { "type": "gripper", "open": false },
  { "type": "wait", "seconds": 0.4 },
  { "type": "movel", "pose": [0, 0, 210, 0, 0, 0], "frame": "rel" },
  { "type": "movel", "pose": [250, 120, 250, 180, 0, -90] },
  { "type": "movel", "pose": [0, 0, -180, 0, 0, 0], "frame": "rel" },
  { "type": "wait", "seconds": 0.3 },
  { "type": "gripper", "open": true },
  { "type": "movel", "pose": [0, 0, 180, 0, 0, 0], "frame": "rel" },
  { "type": "home" }
]`

export default function SequencePanel(pb: SequencePlayback) {
  const {
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
    isMock,
    play,
    pause,
    step,
    reset,
  } = pb

  const running = status === 'playing' || status === 'compiling' || status === 'resetting'
  const editable = !running
  const playLabel =
    status === 'compiling' ? 'COMPILING…' : status === 'paused' ? 'RESUME' : '▶ PLAY'
  const counter =
    total === 0
      ? null
      : status === 'done'
        ? `done · ${total} steps`
        : index >= 0
          ? `step ${Math.min(index + 1, total)} / ${total}`
          : `${total} steps`

  return (
    <section>
      <SectionHead>MOTION SEQUENCE</SectionHead>

      {!isMock && (
        <div style={note}>
          Simulation runs on the mock only. Disconnect the controller to play a sequence.
        </div>
      )}

      <div style={exampleRow}>
        <span style={{ ...miniLabel, flex: 1 }}>JSON STEPS</span>
        <button style={miniBtn} disabled={!editable} onClick={() => setText(EXAMPLE_3_MOVE)}>
          3-MOVE
        </button>
        <button style={miniBtn} disabled={!editable} onClick={() => setText(EXAMPLE_PICK_PLACE)}>
          PICK+PLACE
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={!editable}
        spellCheck={false}
        placeholder={'[\n  { "type": "movel", "pose": [400, 0, 500, 180, 0, -90] }\n]'}
        aria-label="motion sequence JSON"
        style={{ ...textarea, opacity: editable ? 1 : 0.6 }}
      />

      {parseError && <div style={errText}>{parseError}</div>}
      {errorMsg && <div style={errText}>{errorMsg}</div>}

      <div style={transportRow}>
        <button
          style={{ ...btn, ...primaryBtn, ...(canStart ? null : disabledBtn) }}
          disabled={!canStart}
          onClick={play}
        >
          {playLabel}
        </button>
        <button
          style={{ ...btn, ...(status === 'playing' ? null : disabledBtn) }}
          disabled={status !== 'playing'}
          onClick={pause}
        >
          ⏸ PAUSE
        </button>
        <button
          style={{ ...btn, ...(canStart ? null : disabledBtn) }}
          disabled={!canStart}
          onClick={step}
        >
          ⏭ STEP
        </button>
        <button
          style={{ ...btn, ...(running ? disabledBtn : null) }}
          disabled={running}
          onClick={reset}
        >
          {status === 'resetting' ? 'HOMING…' : '↺ RESET'}
        </button>
      </div>

      <div style={speedRow}>
        <span style={miniLabel}>SPEED</span>
        <div style={segGroup} role="group" aria-label="playback speed">
          {SPEEDS.map((s: SpeedFactor) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              aria-pressed={speed === s}
              style={{ ...seg, ...(speed === s ? segOn : null) }}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {counter && <div style={counterText}>{counter}</div>}

      {total > 0 && (
        <ol style={stepList}>
          {steps.map((s, i) => (
            <li
              key={i}
              style={{
                ...stepRow,
                ...(i === index && status !== 'done'
                  ? status === 'error'
                    ? stepRowError
                    : stepRowActive
                  : null),
              }}
            >
              <span style={stepNum}>{i + 1}</span>
              {describeStep(s)}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

const note: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 10,
  color: T.muted,
  lineHeight: 1.5,
  marginBottom: 10,
}
const exampleRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }
const miniLabel: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 9,
  letterSpacing: '0.12em',
  color: T.muted,
}
const miniBtn: CSSProperties = {
  background: 'transparent',
  border: `1px solid ${T.borderInput}`,
  borderRadius: 5,
  color: T.muted,
  fontFamily: T.fontMono,
  fontSize: 9,
  letterSpacing: '0.08em',
  padding: '3px 7px',
  cursor: 'pointer',
}
const textarea: CSSProperties = {
  width: '100%',
  minHeight: 150,
  resize: 'vertical',
  background: T.bg,
  border: `1px solid ${T.borderInput}`,
  borderRadius: 7,
  padding: '9px 10px',
  color: T.text,
  fontFamily: T.fontMono,
  fontSize: 11.5,
  lineHeight: 1.5,
}
const errText: CSSProperties = {
  marginTop: 8,
  fontFamily: T.fontMono,
  fontSize: 10.5,
  color: T.amber,
  lineHeight: 1.5,
}
const transportRow: CSSProperties = { display: 'flex', gap: 6, marginTop: 12 }
const btn: CSSProperties = {
  flex: 1,
  padding: '8px 0',
  background: 'transparent',
  border: `1px solid ${T.borderInput}`,
  borderRadius: 6,
  color: T.text,
  fontFamily: T.fontMono,
  fontSize: 9.5,
  letterSpacing: '0.08em',
  cursor: 'pointer',
}
const primaryBtn: CSSProperties = {
  background: T.teal,
  color: T.onTeal,
  border: `1px solid ${T.teal}`,
}
const disabledBtn: CSSProperties = { opacity: 0.4, cursor: 'default' }
const speedRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }
const segGroup: CSSProperties = {
  display: 'flex',
  gap: 4,
  flex: 1,
}
const seg: CSSProperties = {
  flex: 1,
  padding: '5px 0',
  background: 'transparent',
  border: `1px solid ${T.borderInput}`,
  borderRadius: 5,
  color: T.muted,
  fontFamily: T.fontMono,
  fontSize: 9.5,
  cursor: 'pointer',
}
const segOn: CSSProperties = { background: T.teal, color: T.onTeal, border: `1px solid ${T.teal}` }
const counterText: CSSProperties = {
  marginTop: 10,
  fontFamily: T.fontMono,
  fontSize: 10,
  letterSpacing: '0.1em',
  color: T.muted,
}
const stepList: CSSProperties = {
  listStyle: 'none',
  margin: '6px 0 0',
  padding: 0,
  maxHeight: 168,
  overflow: 'auto',
  border: `1px solid ${T.border}`,
  borderRadius: 6,
}
const stepRow: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  padding: '5px 9px',
  fontFamily: T.fontMono,
  fontSize: 10.5,
  color: T.muted,
  borderBottom: `1px solid ${T.border}`,
}
const stepRowActive: CSSProperties = { background: T.tealTrack, color: T.teal }
const stepRowError: CSSProperties = { background: 'rgba(224,87,75,0.12)', color: T.red }
const stepNum: CSSProperties = { width: 16, textAlign: 'right', opacity: 0.6, flex: 'none' }
