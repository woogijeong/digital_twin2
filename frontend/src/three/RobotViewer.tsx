import { useEffect, useRef, useState, type CSSProperties } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { SCENE, T } from '../theme'
import { loadIndy7, type LoadedRobot } from './urdfRobot'

interface Props {
  /** Rendered joint angles, degrees, joint0..joint5. */
  jointsDeg: number[]
}

/** three.js viewport. Owns the render loop; joint state is pushed in via props. */
export default function RobotViewer({ jointsDeg }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const robotRef = useRef<LoadedRobot | null>(null)
  const jointsRef = useRef(jointsDeg)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    jointsRef.current = jointsDeg
  }, [jointsDeg])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(SCENE.background)

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

    const grid = new THREE.GridHelper(4, 20, SCENE.gridPrimary, SCENE.gridSecondary)
    ;(grid.material as THREE.Material).opacity = 0.35
    ;(grid.material as THREE.Material).transparent = true
    scene.add(grid)

    const tcpMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 16, 12),
      new THREE.MeshBasicMaterial({ color: SCENE.tcp }),
    )
    scene.add(tcpMarker)
    const tcpVec = new THREE.Vector3()

    let raf = 0
    let disposed = false

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
      grid.geometry.dispose()
      ;(grid.material as THREE.Material).dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
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
