import { useEffect, useState } from 'react'
import { T } from './theme'
import { getHealth, type Health } from './api/client'
import { useTelemetry } from './hooks/useTelemetry'
import { useJointAnimation } from './hooks/useJointAnimation'
import RobotViewer from './three/RobotViewer'
import StatusBar from './components/StatusBar'
import PosePanel from './components/PosePanel'
import JointBars from './components/JointBars'
import ViewportOverlays from './components/ViewportOverlays'

export default function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const { frame, link, stale } = useTelemetry()
  const { jointsDeg, animateTo } = useJointAnimation(frame?.q ?? null)

  useEffect(() => {
    getHealth().then(setHealth).catch(() => setHealth(null))
  }, [])

  const pose = frame?.p ?? null

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: T.bg,
        color: T.text,
      }}
    >
      <StatusBar health={health} link={link} onHealthChange={setHealth} />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div
          style={{
            flex: 1,
            position: 'relative',
            background: T.viewportBg,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `linear-gradient(${T.viewportGrid} 1px, transparent 1px), linear-gradient(90deg, ${T.viewportGrid} 1px, transparent 1px)`,
              backgroundSize: '46px 46px',
              pointerEvents: 'none',
            }}
          />
          <RobotViewer jointsDeg={jointsDeg} />
          <ViewportOverlays pose={pose} stale={stale} />
        </div>

        <aside
          style={{
            width: 388,
            flex: 'none',
            background: T.panel,
            borderLeft: `1px solid ${T.border}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 22,
            padding: '22px 22px 18px',
            overflow: 'auto',
          }}
        >
          <PosePanel
            pose={pose}
            jointsDeg={jointsDeg}
            stale={stale}
            mode={health?.mode ?? null}
            onApply={(jpos) => animateTo(jpos)}
          />
          <JointBars q={jointsDeg} />
          <div
            style={{
              marginTop: 'auto',
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: T.fontMono,
              fontSize: 11,
              color: T.muted,
              paddingTop: 12,
              borderTop: `1px solid ${T.border}`,
            }}
          >
            <span>mode {health?.mode ?? '—'}</span>
            <span>{frame ? `ts ${frame.ts.toFixed(0)}` : 'no telemetry'}</span>
          </div>
        </aside>
      </div>
    </div>
  )
}
