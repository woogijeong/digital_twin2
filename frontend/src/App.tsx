import { useEffect, useState } from 'react'
import { T } from './theme'
import {
  getHealth,
  setGripperDo,
  setSuctionDo,
  setTool,
  type Health,
  type ToolId,
} from './api/client'
import { useTelemetry } from './hooks/useTelemetry'
import { useJointAnimation } from './hooks/useJointAnimation'
import { useTheme } from './hooks/useTheme'
import { useViewportTheme } from './hooks/useViewportTheme'
import RobotViewer from './three/RobotViewer'
import StatusBar from './components/StatusBar'
import PosePanel from './components/PosePanel'
import ToolPanel from './components/ToolPanel'
import JointBars from './components/JointBars'
import ViewportOverlays from './components/ViewportOverlays'
import { checkSafety, nearLimitJoints } from './safety'

export default function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [gripperOpen, setGripperOpen] = useState(true)
  const [suctionOn, setSuctionOn] = useState(false)
  const [toolBusy, setToolBusy] = useState(false)
  const [gripperColor, setGripperColor] = useState('#2b3136')
  const [suctionColor, setSuctionColor] = useState('#2b3136')
  const { theme, toggleTheme } = useTheme()
  const { viewportTheme, toggleViewportTheme } = useViewportTheme()
  const { frame, link, stale } = useTelemetry()
  const { jointsDeg, animateTo } = useJointAnimation(frame?.q ?? null)

  useEffect(() => {
    getHealth().then(setHealth).catch(() => setHealth(null))
  }, [])

  const pose = frame?.p ?? null
  const tool: ToolId = health?.tool ?? 'none'
  const safetyAlerts = checkSafety(pose, jointsDeg)
  const warnJoints = nearLimitJoints(jointsDeg)

  const selectTool = async (next: ToolId) => {
    setToolBusy(true)
    try {
      setHealth(await setTool(next))
    } catch {
      /* keep the current tool on failure */
    } finally {
      setToolBusy(false)
    }
  }

  const toggleGripper = (open: boolean) => {
    setGripperOpen(open)
    setGripperDo(open).catch(() => {
      /* mock ignores it; a real controller failure shouldn't revert the twin's visual state */
    })
  }

  const toggleSuction = (on: boolean) => {
    setSuctionOn(on)
    setSuctionDo(on).catch(() => {
      /* same as above */
    })
  }

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
      <StatusBar
        health={health}
        link={link}
        onHealthChange={setHealth}
        theme={theme}
        onToggleTheme={toggleTheme}
        viewportTheme={viewportTheme}
        onToggleViewportTheme={toggleViewportTheme}
      />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div
          data-theme="dark"
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
          <RobotViewer
            jointsDeg={jointsDeg}
            tool={tool}
            gripperOpen={gripperOpen}
            gripperColor={gripperColor}
            suctionColor={suctionColor}
            viewportTheme={viewportTheme}
          />
          <ViewportOverlays pose={pose} stale={stale} alerts={safetyAlerts} />
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
            error={frame?.error ?? null}
          />
          <ToolPanel
            tool={tool}
            gripperOpen={gripperOpen}
            busy={toolBusy}
            onSelect={selectTool}
            onGripperToggle={toggleGripper}
            gripperColor={gripperColor}
            onGripperColorChange={setGripperColor}
            suctionOn={suctionOn}
            onSuctionToggle={toggleSuction}
            suctionColor={suctionColor}
            onSuctionColorChange={setSuctionColor}
          />
          <JointBars q={jointsDeg} warnJoints={warnJoints} />
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
            <span>{frame ? `manipulability ${frame.manipulability.toFixed(3)}` : '—'}</span>
            <span>{frame ? `ts ${frame.ts.toFixed(0)}` : 'no telemetry'}</span>
          </div>
        </aside>
      </div>
    </div>
  )
}
