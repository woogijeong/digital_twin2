import * as THREE from 'three'
import URDFLoader, { type URDFRobot } from 'urdf-loader'
import { SCENE } from '../theme'

export const JOINT_NAMES = ['joint0', 'joint1', 'joint2', 'joint3', 'joint4', 'joint5'] as const

const DEG2RAD = Math.PI / 180

export interface LoadedRobot {
  object: THREE.Object3D
  /** Drive the six revolute joints. `q` is in degrees, joint0..joint5 order. */
  setJoints(q: number[]): void
  /** World-space position of the TCP link, for the pose marker. */
  tcpWorldPosition(target: THREE.Vector3): THREE.Vector3
  dispose(): void
}

/** Loads `/robot/indy7.urdf` (URDF + STL). Rejects if the URDF or a mesh fails. */
export function loadIndy7(url = '/robot/indy7.urdf'): Promise<LoadedRobot> {
  return new Promise((resolve, reject) => {
    const manager = new THREE.LoadingManager()
    manager.onError = (u) => reject(new Error(`failed to load ${u}`))

    const loader = new URDFLoader(manager)
    loader.load(
      url,
      (robot: URDFRobot) => {
        // URDF is Z-up; three.js is Y-up.
        robot.rotation.x = -Math.PI / 2

        robot.traverse((c) => {
          const mesh = c as THREE.Mesh
          if (mesh.isMesh) {
            mesh.castShadow = true
            mesh.receiveShadow = true
            const mat = mesh.material as THREE.MeshStandardMaterial
            if (mat && 'metalness' in mat) {
              mat.metalness = 0.35
              mat.roughness = 0.55
            }
          }
        })

        const jointMarks = addJointMarkers(robot)
        const tcp = robot.links['tcp'] as THREE.Object3D | undefined

        resolve({
          object: robot,
          setJoints(q) {
            JOINT_NAMES.forEach((name, i) => {
              robot.joints[name]?.setJointValue(q[i] * DEG2RAD)
            })
            robot.updateMatrixWorld(true)
          },
          tcpWorldPosition(target) {
            if (tcp) return tcp.getWorldPosition(target)
            return target.copy(robot.position)
          },
          dispose() {
            jointMarks.forEach((m) => {
              m.geometry.dispose()
              ;(m.material as THREE.Material).dispose()
            })
            // Release the STL geometry + materials URDFLoader created (~9 MiB).
            robot.traverse((c) => {
              const mesh = c as THREE.Mesh
              if (!mesh.isMesh) return
              mesh.geometry?.dispose()
              const mat = mesh.material
              if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
              else mat?.dispose()
            })
          },
        })
      },
      undefined,
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
    )
  })
}

function addJointMarkers(robot: URDFRobot): THREE.Mesh[] {
  const geo = new THREE.SphereGeometry(0.022, 16, 12)
  const mat = new THREE.MeshBasicMaterial({ color: SCENE.joint })
  const marks: THREE.Mesh[] = []
  for (const name of JOINT_NAMES) {
    const joint = robot.joints[name]
    if (!joint) continue
    const m = new THREE.Mesh(geo, mat)
    joint.add(m)
    marks.push(m)
  }
  return marks
}
