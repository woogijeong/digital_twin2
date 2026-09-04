import { T } from '../theme'

/** One base-frame axis, expressed as a unit vector in camera/view space:
 *  +x right, +y up, +z toward the viewer. */
export interface AxisProjection {
  key: 'X' | 'Y' | 'Z'
  color: string
  x: number
  y: number
  z: number
}

const LEN = 29 // axis length, in viewBox units

/** Bottom-left orientation gizmo. Shows the robot base frame (X/Y/Z) from the
 *  current camera angle, so it turns as you orbit the model. Driven by
 *  {@link RobotViewer}, which recomputes the projection each frame. */
export default function AxisGizmo({ axes }: { axes: AxisProjection[] }) {
  const farFirst = [...axes].sort((a, b) => a.z - b.z)

  return (
    <div style={{ position: 'absolute', left: 20, bottom: 18, pointerEvents: 'none' }}>
      <svg width="92" height="92" viewBox="-46 -46 92 92" aria-hidden="true">
        <circle cx="0" cy="0" r="42" fill="rgba(10,13,15,0.32)" stroke={T.border} strokeWidth="1" />
        {farFirst.map((a) => {
          const px = a.x * LEN
          const py = -a.y * LEN
          const opacity = 0.4 + 0.6 * ((a.z + 1) / 2) // fade the axis pointing away
          return (
            <g key={a.key} opacity={opacity}>
              <line
                x1="0"
                y1="0"
                x2={px}
                y2={py}
                stroke={a.color}
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx={px} cy={py} r="2.5" fill={a.color} />
              <text
                x={px * 1.32}
                y={py * 1.32}
                fill={a.color}
                fontSize="11"
                fontFamily={T.fontMono}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {a.key}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
