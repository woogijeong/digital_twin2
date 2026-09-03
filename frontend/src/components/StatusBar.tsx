import { T } from '../theme'
import type { Health } from '../api/client'
import type { LinkState } from '../hooks/useTelemetry'

interface Props {
  health: Health | null
  link: LinkState
}

export default function StatusBar({ health, link }: Props) {
  const mock = health?.mode === 'mock'

  return (
    <header
      style={{
        height: 56,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        background: T.panel,
        borderBottom: `1px solid ${T.border}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: T.teal,
            boxShadow: `0 0 12px ${T.teal}`,
          }}
        />
        <span
          style={{
            fontFamily: T.fontDisplay,
            fontWeight: 600,
            fontSize: 15,
            letterSpacing: '0.14em',
          }}
        >
          INDY7 · DIGITAL TWIN
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12 }}>
        <span
          style={{
            padding: '5px 11px',
            border: `1px solid ${mock ? '#5a6b33' : '#6a5326'}`,
            color: T.amber,
            borderRadius: 999,
            letterSpacing: '0.1em',
            fontFamily: T.fontMono,
          }}
        >
          {mock ? 'MOCK' : 'SIMULATION'}
        </span>
        <span style={{ fontFamily: T.fontMono, color: T.muted }}>
          {health?.model === 'indy7' ? '192.168.3.4' : '—'}
        </span>
        <LinkBadge link={link} />
      </div>
    </header>
  )
}

function LinkBadge({ link }: { link: LinkState }) {
  const map = {
    connecting: { text: 'CONNECTING', color: T.muted, blink: false },
    linked: { text: 'LINKED', color: T.green, blink: false },
    reconnecting: { text: 'RECONNECTING', color: T.amber, blink: true },
  }[link]

  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        color: map.color,
        animation: map.blink ? 'blink 1s steps(2) infinite' : undefined,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: map.color }} />
      {map.text}
    </span>
  )
}
