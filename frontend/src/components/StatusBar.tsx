import { useState, type CSSProperties } from 'react'
import { T, type ViewportTheme } from '../theme'
import { ApiError, connectController, disconnectController, type Health } from '../api/client'
import type { LinkState } from '../hooks/useTelemetry'

interface Props {
  health: Health | null
  link: LinkState
  /** Called with the fresh health after a connect / disconnect. */
  onHealthChange: (h: Health) => void
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  viewportTheme: ViewportTheme
  onToggleViewportTheme: () => void
}

export default function StatusBar({
  health,
  link,
  onHealthChange,
  theme,
  onToggleTheme,
  viewportTheme,
  onToggleViewportTheme,
}: Props) {
  const mock = health?.mode === 'mock'
  const [hostEdit, setHostEdit] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const host = hostEdit ?? health?.host ?? ''

  const run = async (fn: () => Promise<Health>) => {
    setBusy(true)
    setErr(null)
    try {
      const next = await fn()
      onHealthChange(next)
      setHostEdit(next.mode === 'mock' ? null : next.host)
    } catch (e) {
      setErr(e instanceof ApiError ? e.detail : 'request failed')
    } finally {
      setBusy(false)
    }
  }

  const toggle = () =>
    mock ? run(() => connectController(host.trim())) : run(disconnectController)

  return (
    <header style={header}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={dot} />
        <span style={brand}>INDY7 · DIGITAL TWIN</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
        <span style={{ ...badge, borderColor: mock ? T.badgeBorderMock : T.badgeBorderSim }}>
          {mock ? 'MOCK' : 'SIMULATION'}
        </span>

        {mock ? (
          <input
            value={host}
            onChange={(e) => setHostEdit(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !busy && host.trim() && toggle()}
            disabled={busy}
            spellCheck={false}
            aria-label="controller address"
            style={hostInput}
          />
        ) : (
          <span style={{ fontFamily: T.fontMono, color: T.muted }}>{health?.host ?? '—'}</span>
        )}

        <button
          onClick={toggle}
          disabled={busy || (mock && host.trim() === '')}
          title={err ?? (mock ? 'dial the controller' : 'drop the connection')}
          style={{ ...connBtn, ...(err ? connBtnErr : mock ? connBtnGo : null) }}
        >
          {busy ? '···' : mock ? 'CONNECT' : 'DISCONNECT'}
        </button>

        {err && <span style={errText}>{err}</span>}

        <button onClick={onToggleTheme} title="toggle light / dark theme" style={connBtn}>
          {theme === 'dark' ? '☀ LIGHT' : '☾ DARK'}
        </button>

        <button
          onClick={onToggleViewportTheme}
          title="toggle the 3D viewport background"
          style={connBtn}
        >
          {viewportTheme === 'black' ? '⬜ GRAY BG' : '⬛ BLACK BG'}
        </button>

        <LinkBadge link={link} real={health?.mode === 'real' && health.connected} />
      </div>
    </header>
  )
}

/** "LINKED" means connected to the real controller -- a mock session never
 *  claims to be linked, even while its (own, offline) telemetry is flowing. */
function LinkBadge({ link, real }: { link: LinkState; real: boolean }) {
  const map = {
    connecting: { text: 'CONNECTING', color: T.muted, blink: false },
    linked: real
      ? { text: 'LINKED', color: T.green, blink: false }
      : { text: 'NOT LINKED', color: T.muted, blink: false },
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

const header: CSSProperties = {
  height: 56,
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 24px',
  background: T.panel,
  borderBottom: `1px solid ${T.border}`,
}
const dot: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: T.teal,
  boxShadow: `0 0 12px ${T.teal}`,
}
const brand: CSSProperties = {
  fontFamily: T.fontDisplay,
  fontWeight: 600,
  fontSize: 15,
  letterSpacing: '0.14em',
}
const badge: CSSProperties = {
  padding: '5px 11px',
  border: `1px solid ${T.badgeBorderMock}`,
  color: T.amber,
  borderRadius: 999,
  letterSpacing: '0.1em',
  fontFamily: T.fontMono,
}
const hostInput: CSSProperties = {
  width: 116,
  background: T.bg,
  border: `1px solid ${T.borderInput}`,
  borderRadius: 6,
  padding: '4px 8px',
  color: T.text,
  fontFamily: T.fontMono,
  fontSize: 12,
}
const connBtn: CSSProperties = {
  background: 'transparent',
  border: `1px solid ${T.borderInput}`,
  color: T.muted,
  borderRadius: 6,
  padding: '4px 10px',
  fontFamily: T.fontMono,
  fontSize: 10,
  letterSpacing: '0.12em',
  cursor: 'pointer',
}
const connBtnGo: CSSProperties = {
  border: `1px solid ${T.teal}`,
  color: T.teal,
}
const connBtnErr: CSSProperties = {
  border: `1px solid ${T.amber}`,
  color: T.amber,
}
const errText: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 10,
  color: T.amber,
  maxWidth: 220,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
