import type { CSSProperties } from 'react'
import { T } from '../theme'
import type { ToolId } from '../api/client'
import { SectionHead } from './JointBars'

interface Props {
  tool: ToolId
  gripperOpen: boolean
  busy?: boolean
  onSelect: (tool: ToolId) => void
  onGripperToggle: (open: boolean) => void
  gripperColor: string
  onGripperColorChange: (hex: string) => void
  suctionOn: boolean
  onSuctionToggle: (on: boolean) => void
  suctionColor: string
  onSuctionColorChange: (hex: string) => void
  onAllDoOff: () => void
}

const TOOLS: Array<{ id: ToolId; label: string }> = [
  { id: 'none', label: 'NONE' },
  { id: 'suction', label: 'SUCTION' },
  { id: 'gripper', label: 'GRIPPER' },
]

export default function ToolPanel({
  tool,
  gripperOpen,
  busy,
  onSelect,
  onGripperToggle,
  gripperColor,
  onGripperColorChange,
  suctionOn,
  onSuctionToggle,
  suctionColor,
  onSuctionColorChange,
  onAllDoOff,
}: Props) {
  return (
    <section>
      <SectionHead>END EFFECTOR</SectionHead>
      <div style={row} role="group" aria-label="end effector">
        {TOOLS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onSelect(id)}
            disabled={busy}
            aria-pressed={tool === id}
            style={{ ...seg, ...(tool === id ? segOn : null) }}
          >
            {label}
          </button>
        ))}
      </div>
      {tool === 'gripper' && (
        <>
          <div style={{ ...row, marginTop: 6 }} role="group" aria-label="gripper">
            {([true, false] as const).map((open) => (
              <button
                key={open ? 'open' : 'close'}
                onClick={() => onGripperToggle(open)}
                aria-pressed={gripperOpen === open}
                style={{ ...seg, ...(gripperOpen === open ? segOn : null) }}
              >
                {open ? 'OPEN' : 'CLOSE'}
              </button>
            ))}
          </div>
          <div style={colorRow}>
            <span style={colorLabel}>GRIPPER COLOR</span>
            <input
              type="color"
              aria-label="gripper color"
              value={gripperColor}
              onChange={(e) => onGripperColorChange(e.target.value)}
              style={colorInput}
            />
          </div>
        </>
      )}
      {tool === 'suction' && (
        <>
          <div style={{ ...row, marginTop: 6 }} role="group" aria-label="suction">
            {([true, false] as const).map((on) => (
              <button
                key={on ? 'on' : 'off'}
                onClick={() => onSuctionToggle(on)}
                aria-pressed={suctionOn === on}
                style={{ ...seg, ...(suctionOn === on ? segOn : null) }}
              >
                {on ? 'ON' : 'OFF'}
              </button>
            ))}
          </div>
          <div style={colorRow}>
            <span style={colorLabel}>SUCTION COLOR</span>
            <input
              type="color"
              aria-label="suction color"
              value={suctionColor}
              onChange={(e) => onSuctionColorChange(e.target.value)}
              style={colorInput}
            />
          </div>
        </>
      )}
      <button
        onClick={onAllDoOff}
        title="drive every end-effector digital output LOW (gripper solenoids + suction)"
        style={allOffBtn}
      >
        ALL DO OFF
      </button>
    </section>
  )
}

const row: CSSProperties = { display: 'flex', gap: 6 }
const seg: CSSProperties = {
  flex: 1,
  padding: '7px 0',
  background: 'transparent',
  border: `1px solid ${T.borderInput}`,
  borderRadius: 6,
  color: T.muted,
  fontFamily: T.fontMono,
  fontSize: 10,
  letterSpacing: '0.1em',
  cursor: 'pointer',
}
const segOn: CSSProperties = {
  background: T.teal,
  color: T.onTeal,
  border: `1px solid ${T.teal}`,
}
const colorRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: 8,
}
const colorLabel: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 9.5,
  color: T.muted,
  letterSpacing: '0.1em',
}
const allOffBtn: CSSProperties = {
  width: '100%',
  marginTop: 10,
  padding: '7px 0',
  background: 'transparent',
  border: `1px solid ${T.amber}`,
  borderRadius: 6,
  color: T.amber,
  fontFamily: T.fontMono,
  fontSize: 10,
  letterSpacing: '0.12em',
  cursor: 'pointer',
}
const colorInput: CSSProperties = {
  width: 40,
  height: 24,
  padding: 0,
  border: `1px solid ${T.borderInput}`,
  borderRadius: 4,
  background: 'transparent',
  cursor: 'pointer',
}
