import { useEffect, useRef, useState, type CSSProperties } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ToolId } from '../api/client'
import { SCENE, T, VIEWPORT_PRESETS, type ViewportTheme } from '../theme'
import AxisGizmo, { type AxisProjection } from '../components/AxisGizmo'
import { loadIndy7, type LoadedRobot } from './urdfRobot'
import { usePayload } from '../hooks/usePayload'

// URDF is Z-up; the scene is Y-up (the robot object is rotated to match). The
// gizmo shows the URDF base axes, so they get the same rotation.
const URDF_TO_SCENE = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(-Math.PI / 2, 0, 0),
)
const BASE_AXES: Array<{ key: AxisProjection['key']; color: string; v: THREE.Vector3 }> = [
  { key: 'X', color: T.axisX, v: new THREE.Vector3(1, 0, 0).applyQuaternion(URDF_TO_SCENE) },
  { key: 'Y', color: T.axisY, v: new THREE.Vector3(0, 1, 0).applyQuaternion(URDF_TO_SCENE) },
  { key: 'Z', color: T.axisZ, v: new THREE.Vector3(0, 0, 1).applyQuaternion(URDF_TO_SCENE) },
]

const toHex = (c: string) => Number.parseInt(c.slice(1), 16)

/** Builds a GridHelper from a viewport preset, with the same opacity/transparency
 *  every preset uses. */
function buildGrid(preset: { gridPrimary: number; gridSecondary: number }): THREE.GridHelper {
  const grid = new THREE.GridHelper(4, 20, preset.gridPrimary, preset.gridSecondary)
  const mat = grid.material as THREE.Material
  mat.opacity = 0.35
  mat.transparent = true
  return grid
}

interface Props {
  /** Rendered joint angles, degrees, joint0..joint5. */
  jointsDeg: number[]
  /** Mounted end-effector. */
  tool: ToolId
  /** Gripper finger state (ignored unless `tool === 'gripper'`). */
  gripperOpen: boolean
  /** Body colors for each tool, as `#rrggbb`. */
  gripperColor: string
  suctionColor: string
  /** Scene background + grid preset. */
  viewportTheme: ViewportTheme
}

/** three.js viewport. Owns the render loop; joint state is pushed in via props. */
export default function RobotViewer({
  jointsDeg,
  tool,
  gripperOpen,
  gripperColor,
  suctionColor,
  viewportTheme,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const robotRef = useRef<LoadedRobot | null>(null)
  const jointsRef = useRef(jointsDeg)
  const toolRef = useRef(tool)
  const gripperRef = useRef(gripperOpen)
  const gripperColorRef = useRef(gripperColor)
  const suctionColorRef = useRef(suctionColor)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const gridRef = useRef<THREE.GridHelper | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [gizmoAxes, setGizmoAxes] = useState<AxisProjection[] | null>(null)

  const { payload, attached } = usePayload(robotRef, sceneRef, tool, gripperOpen)

  /** Body color for the tool being mounted, read live so the mount effect need
   *  not re-run on every color change. */
  const toolHex = (t: ToolId) =>
    t === 'gripper'
      ? toHex(gripperColorRef.current)
      : t === 'suction'
        ? toHex(suctionColorRef.current)
        : undefined

  useEffect(() => {
    jointsRef.current = jointsDeg
  }, [jointsDeg])

  useEffect(() => {
    gripperColorRef.current = gripperColor
  }, [gripperColor])

  useEffect(() => {
    suctionColorRef.current = suctionColor
  }, [suctionColor])

  useEffect(() => {
    toolRef.current = tool
    robotRef.current?.setTool(tool, toolHex(tool))
  }, [tool])

  useEffect(() => {
    if (toolRef.current === 'gripper') robotRef.current?.setToolColor(toHex(gripperColor))
  }, [gripperColor])

  useEffect(() => {
    if (toolRef.current === 'suction') robotRef.current?.setToolColor(toHex(suctionColor))
  }, [suctionColor])

  useEffect(() => {
    gripperRef.current = gripperOpen
    robotRef.current?.setGripperOpen(gripperOpen)
  }, [gripperOpen])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    const preset = VIEWPORT_PRESETS[viewportTheme]
    ;(scene.background as THREE.Color).set(preset.background)
    const nextGrid = buildGrid(preset)
    scene.add(nextGrid)
    const prevGrid = gridRef.current
    gridRef.current = nextGrid
    if (prevGrid) {
      scene.remove(prevGrid)
      prevGrid.geometry.dispose()
      ;(prevGrid.material as THREE.Material).dispose()
    }
  }, [viewportTheme])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(VIEWPORT_PRESETS[viewportTheme].background)

    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100)
    camera.position.set(1.5, 1.15, 1.9)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.display = 'block'

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 0.42, 0)

    scene.add(new THREE.AmbientLight(SCENE.ambient, 1.1))
    const key = new THREE.DirectionalLight(SCENE.key, 1.6)
    key.position.set(2, 3, 2)
    key.castShadow = true
    scene.add(key)

    const grid = buildGrid(VIEWPORT_PRESETS[viewportTheme])
    gridRef.current = grid
    scene.add(grid)

    const tcpMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 16, 12),
      new THREE.MeshBasicMaterial({ color: SCENE.tcp }),
    )
    scene.add(tcpMarker)
    const tcpVec = new THREE.Vector3()

    scene.add(payload)
    sceneRef.current = scene

    let raf = 0
    let disposed = false

    // Orientation gizmo: project the base axes into view space, ~30 fps.
    const viewInv = new THREE.Matrix4()
    const axisDir = new THREE.Vector3()
    let gizmoAt = 0

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount
      if (!w || !h) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(mount)
    resize()

    loadIndy7()
      .then((robot) => {
        if (disposed) {
          robot.dispose()
          return
        }
        robotRef.current = robot
        scene.add(robot.object)
        robot.setJoints(jointsRef.current)
        robot.setTool(toolRef.current, toolHex(toolRef.current))
        robot.setGripperOpen(gripperRef.current)
        setLoading(false)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const robot = robotRef.current
      if (robot) {
        robot.setJoints(jointsRef.current)
        robot.tcpWorldPosition(tcpVec)
        tcpMarker.position.copy(tcpVec)
      }
      controls.update()

      const now = performance.now()
      if (now - gizmoAt > 33) {
        gizmoAt = now
        camera.updateMatrixWorld()
        viewInv.copy(camera.matrixWorld).invert()
        setGizmoAxes(
          BASE_AXES.map(({ key, color, v }) => {
            axisDir.copy(v).transformDirection(viewInv)
            return { key, color, x: axisDir.x, y: axisDir.y, z: axisDir.z }
          }),
        )
      }

      renderer.render(scene, camera)
    }
    tick()

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      robotRef.current?.dispose()
      robotRef.current = null
      tcpMarker.geometry.dispose()
      ;(tcpMarker.material as THREE.Material).dispose()
      payload.parent?.remove(payload)
      gridRef.current?.geometry.dispose()
      ;(gridRef.current?.material as THREE.Material | undefined)?.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
      {gizmoAxes && !error && <AxisGizmo axes={gizmoAxes} />}
      {attached && !error && (
        <div
          style={{
            position: 'absolute',
            left: 28,
            top: 52,
            fontFamily: T.fontMono,
            fontSize: 12,
            color: T.amber,
            pointerEvents: 'none',
          }}
        >
          ● PAYLOAD ATTACHED
        </div>
      )}
      {loading && !error && (
        <div style={overlayCenter}>
          <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.muted }}>
            LOADING MODEL…
          </span>
        </div>
      )}
      {error && (
        <div style={overlayCenter}>
          <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.amber }}>
            MODEL LOAD FAILED — {error}
          </span>
        </div>
      )}
    </div>
  )
}

const overlayCenter: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
}
