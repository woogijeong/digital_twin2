import type { ReactNode } from 'react'
import { JOINT_LIMIT_DEG, T } from '../theme'

/** J1..J6 track bars. `q` is degrees, joint0..joint5. */
export default function JointBars({ q }: { q: number[] }) {
  return (
    <section>
      <SectionHead>JOINTS · deg</SectionHead>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {q.map((v, i) => {
          const pct = ((v + JOINT_LIMIT_DEG) / (2 * JOINT_LIMIT_DEG)) * 100
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  fontFamily: T.fontMono,
                  fontSize: 11,
                  color: T.muted,
                  width: 22,
                }}
              >
                J{i + 1}
              </span>
              <div
                style={{
                  flex: 1,
                  height: 6,
                  borderRadius: 3,
                  background: T.tealTrack,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.max(0, Math.min(100, pct))}%`,
                    height: '100%',
                    background: T.teal,
                    borderRadius: 3,
                  }}
                />
              </div>
              <span
                style={{
                  fontFamily: T.fontMono,
                  fontSize: 11,
                  width: 54,
                  textAlign: 'right',
                }}
              >
                {v.toFixed(1)}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function SectionHead({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: T.fontMono,
        fontSize: 10.5,
        letterSpacing: '0.2em',
        color: T.muted,
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  )
}
