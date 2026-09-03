import { T } from '../theme'

const fmt = (n: number) => (n < 0 ? '−' : '') + Math.abs(n).toFixed(1)

/** Non-interactive HUD drawn over the 3D canvas. */
export default function ViewportOverlays({ pose }: { pose: number[] | null }) {
  return (
    <>
      <div style={{ position: 'absolute', left: 28, top: 24, pointerEvents: 'none' }}>
        <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.teal }}>
          <span style={{ opacity: 0.55 }}>TCP · </span>
          {pose ? `[ ${fmt(pose[0])}, ${fmt(pose[1])}, ${fmt(pose[2])} ] mm` : '[ … ]'}
        </span>
      </div>

      <div style={{ position: 'absolute', left: 26, bottom: 22, pointerEvents: 'none' }}>
        <svg width="88" height="66" viewBox="0 0 88 66" fill="none">
          <path d="M14 52 L74 52" stroke="#e0574b" strokeWidth="2" />
          <path d="M74 52 l-7 -4 v8 z" fill="#e0574b" />
          <text x="78" y="55" fill="#e0574b" fontSize="11" fontFamily={T.fontMono}>
            X
          </text>
          <path d="M14 52 L14 10" stroke="#4ade80" strokeWidth="2" />
          <path d="M14 10 l-4 7 h8 z" fill="#4ade80" />
          <text x="4" y="8" fill="#4ade80" fontSize="11" fontFamily={T.fontMono}>
            Z
          </text>
          <path d="M14 52 L40 40" stroke="#5b9bd5" strokeWidth="2" />
          <path d="M40 40 l-8 0 l3 6 z" fill="#5b9bd5" />
          <text x="42" y="38" fill="#5b9bd5" fontSize="11" fontFamily={T.fontMono}>
            Y
          </text>
        </svg>
      </div>

      <div
        style={{
          position: 'absolute',
          right: 24,
          bottom: 20,
          fontFamily: T.fontMono,
          fontSize: 11,
          color: '#5a666b',
          letterSpacing: '0.08em',
          pointerEvents: 'none',
        }}
      >
        DRAG · ORBIT&nbsp;&nbsp;SCROLL · ZOOM
      </div>
    </>
  )
}
