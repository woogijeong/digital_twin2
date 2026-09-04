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
