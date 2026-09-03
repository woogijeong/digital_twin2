/** Direction A — "Control Room" design tokens (see plan section 8). */
export const T = {
  bg: '#0d1012',
  panel: '#12171a',
  border: '#232c31',
  borderInput: '#2b363b',
  text: '#cdd6d9',
  muted: '#7c8a90',
  teal: '#46d6c0',
  onTeal: '#08211f', // text on a teal fill
  tealTrack: '#1c2327',
  amber: '#f2b03d',
  green: '#4ade80',
  badgeBorderSim: '#6a5326',
  badgeBorderMock: '#5a6b33',
  hint: '#5a666b',
  axisX: '#e0574b',
  axisY: '#5b9bd5',
  axisZ: '#4ade80',
  dim: 0.4, // opacity applied to data readouts when telemetry is stale
  viewportGrid: 'rgba(70,214,192,0.055)',
  viewportBg: 'radial-gradient(circle at 44% 36%, #16201f, #0a0d0f 72%)',
  fontDisplay: "'Space Grotesk', system-ui, sans-serif",
  fontUi: "'IBM Plex Sans', system-ui, sans-serif",
  fontMono: "'JetBrains Mono', ui-monospace, monospace",
} as const

/** three.js scene colors, derived from the same palette. */
export const SCENE = {
  background: 0x0a0d0f,
  gridPrimary: 0x2b4a48,
  gridSecondary: 0x1a2a2a,
  ambient: 0x8899aa,
  key: 0xffffff,
  joint: 0x46d6c0,
  tcp: 0xf2b03d,
} as const

export const AXIS_LABELS = ['X', 'Y', 'Z', 'Rx', 'Ry', 'Rz'] as const
export const AXIS_UNITS = ['mm', 'mm', 'mm', 'deg', 'deg', 'deg'] as const
export const JOINT_LIMIT_DEG = 180
