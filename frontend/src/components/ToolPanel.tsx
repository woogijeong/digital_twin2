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
}

const TOOLS: Array<{ id: ToolId; label: string }> = [
  { id: 'none', label: 'NONE' },
  { id: 'suction', label: 'SUCTION' },
  { id: 'gripper', label: 'GRIPPER' },
]

export default function ToolPanel({ tool, gripperOpen, busy, onSelect, onGripperToggle }: Props) {
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
      )}
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
