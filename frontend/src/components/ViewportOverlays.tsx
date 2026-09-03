import { fmt1 } from '../format'
import { T } from '../theme'

interface Props {
  pose: number[] | null
  /** telemetry gone quiet -> dim the readout */
  stale: boolean
}

/** Non-interactive HUD drawn over the 3D canvas. */
export default function ViewportOverlays({ pose, stale }: Props) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 28,
          top: 24,
          pointerEvents: 'none',
          opacity: stale ? T.dim : 1,
        }}
      >
        <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.teal }}>
          <span style={{ opacity: 0.55 }}>TCP · </span>
          {pose ? `[ ${fmt1(pose[0])}, ${fmt1(pose[1])}, ${fmt1(pose[2])} ] mm` : '[ … ]'}
        </span>
      </div>

      <div style={{ position: 'absolute', left: 26, bottom: 22, pointerEvents: 'none' }}>
        <svg width="88" height="66" viewBox="0 0 88 66" fill="none">
          <path d="M14 52 L74 52" stroke={T.axisX} strokeWidth="2" />
          <path d="M74 52 l-7 -4 v8 z" fill={T.axisX} />
          <text x="78" y="55" fill={T.axisX} fontSize="11" fontFamily={T.fontMono}>
            X
          </text>
          <path d="M14 52 L14 10" stroke={T.axisZ} strokeWidth="2" />
          <path d="M14 10 l-4 7 h8 z" fill={T.axisZ} />
          <text x="4" y="8" fill={T.axisZ} fontSize="11" fontFamily={T.fontMono}>
            Z
          </text>
          <path d="M14 52 L40 40" stroke={T.axisY} strokeWidth="2" />
          <path d="M40 40 l-8 0 l3 6 z" fill={T.axisY} />
          <text x="42" y="38" fill={T.axisY} fontSize="11" fontFamily={T.fontMono}>
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
          color: T.hint,
          letterSpacing: '0.08em',
          pointerEvents: 'none',
        }}
      >
        DRAG · ORBIT&nbsp;&nbsp;SCROLL · ZOOM
      </div>
    </>
  )
}
