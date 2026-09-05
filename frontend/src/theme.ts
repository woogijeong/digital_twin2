/** Direction A — "Control Room" design tokens (see plan section 8). */
export const T = {
  bg: 'var(--twin-bg)',
  panel: 'var(--twin-panel)',
  border: 'var(--twin-border)',
  borderInput: 'var(--twin-border-input)',
  text: 'var(--twin-text)',
  muted: 'var(--twin-muted)',
  teal: 'var(--twin-teal)',
  onTeal: 'var(--twin-on-teal)', // text on a teal fill
  tealTrack: 'var(--twin-teal-track)',
  amber: 'var(--twin-amber)',
  green: 'var(--twin-green)',
  badgeBorderSim: 'var(--twin-badge-sim)',
  badgeBorderMock: 'var(--twin-badge-mock)',
  hint: 'var(--twin-hint)',
  axisX: 'var(--twin-axis-x)',
  axisY: 'var(--twin-axis-y)',
  axisZ: 'var(--twin-axis-z)',
  dim: 0.4, // opacity applied to data readouts when telemetry is stale
  viewportGrid: 'var(--twin-viewport-grid)',
  viewportBg:
    'radial-gradient(circle at 44% 36%, var(--twin-viewport-bg-a), var(--twin-viewport-bg-b) 72%)',
  fontDisplay: "'Space Grotesk', system-ui, sans-serif",
  fontMono: "'JetBrains Mono', ui-monospace, monospace",
} as const

/** three.js scene colors, derived from the same palette. Stays dark-always
 *  regardless of the page theme (see App.tsx's viewport `data-theme="dark"`
 *  pin) -- only the two VIEWPORT_PRESETS below are user-selectable. */
export const SCENE = {
  ambient: 0x8899aa,
  key: 0xffffff,
  joint: 0x46d6c0,
  tcp: 0xf2b03d,
} as const

export type ViewportTheme = 'black' | 'gray'

/** Scene background + grid colors, swapped live by the header's viewport
 *  toggle. `gridPrimary` is the GridHelper's center-cross color, `gridSecondary`
 *  the bulk of the grid lines. */
export const VIEWPORT_PRESETS: Record<
  ViewportTheme,
  { background: number; gridPrimary: number; gridSecondary: number }
> = {
  black: {
    background: 0x0a0d0f,
    gridPrimary: 0x2b4a48,
    gridSecondary: 0x1a2a2a,
  },
  gray: {
    background: 0x4a4d50,
    gridPrimary: 0x5ec9ba,
    gridSecondary: 0x35383b,
  },
}

export const AXIS_LABELS = ['X', 'Y', 'Z', 'Rx', 'Ry', 'Rz'] as const
export const AXIS_UNITS = ['mm', 'mm', 'mm', 'deg', 'deg', 'deg'] as const
export const JOINT_LIMIT_DEG = 180
