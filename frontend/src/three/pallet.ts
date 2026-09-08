import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

/** Pallet placement, from the measured `pallet_corners.json` (also copied to
 *  `public/models/pallet_corners.json` for reference). Corner coordinates are in
 *  the robot base frame, mm; the pallet is a 190 mm square whose top surface
 *  sits at z = 184.5 mm. */
const PALLET_URL = '/models/pallet.glb'
const FOOTPRINT_MM = 190
const TOP_Z_MM = 184.5
/** Corners P1..P4 (clockwise), base frame mm, at the top surface. */
const CORNERS_MM: ReadonlyArray<readonly [number, number, number]> = [
  [322.3, -307.8, TOP_Z_MM],
  [322.3, -497.8, TOP_Z_MM],
  [132.3, -497.8, TOP_Z_MM],
  [132.3, -307.8, TOP_Z_MM],
]

/** Robot base frame (Z-up, mm) -> three.js scene (Y-up, m). The URDF root is
 *  rotated -90° about X, so `(x, y, z) -> (x, z, -y)`. */
function baseToScene(xMm: number, yMm: number, zMm: number): THREE.Vector3 {
  return new THREE.Vector3(xMm / 1000, zMm / 1000, -yMm / 1000)
}

const cornerAvg = (i: number) => CORNERS_MM.reduce((s, c) => s + c[i], 0) / CORNERS_MM.length
/** Scene position of the pallet's top-surface centre. */
const TOP_CENTRE = baseToScene(cornerAvg(0), cornerAvg(1), TOP_Z_MM)

export interface PalletHandle {
  group: THREE.Group
  dispose(): void
}


/** Load `public/models/pallet.glb`, scale it to the 190 mm footprint, and place
 *  it (with corner pins) at the measured pallet location. The returned group
 *  starts hidden; the caller adds it to the scene and toggles `group.visible`. */
export function loadPallet(): Promise<PalletHandle> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(
      PALLET_URL,
      (gltf) => {
        const model = gltf.scene
        const box = new THREE.Box3().setFromObject(model)
        const size = box.getSize(new THREE.Vector3())
        const centre = box.getCenter(new THREE.Vector3())
        const scale = FOOTPRINT_MM / 1000 / Math.max(size.x, size.z)

        // The mesh carries positions only (no normals, no material).
        const mat = new THREE.MeshStandardMaterial({
          color: 0x707880,
          metalness: 0.5,
          roughness: 0.55,
        })
        model.traverse((o) => {
          const m = o as THREE.Mesh
          if (!m.isMesh) return
          m.geometry.computeVertexNormals()
          m.material = mat
          m.castShadow = true
          m.receiveShadow = true
        })
        model.scale.setScalar(scale)
        // Centre X/Z on the group origin; bring the top surface to y = 0.
        model.position.set(-centre.x * scale, -box.max.y * scale, -centre.z * scale)

        const group = new THREE.Group()
        group.add(model)

        // The GLB is only the thin top deck; the pick surface sits 184.5 mm up.
        // Fill the gap to the floor with a plain block so the pallet reads as
        // grounded rather than floating.
        const footM = FOOTPRINT_MM / 1000
        const deckM = size.y * scale
        const supportH = Math.max(0, TOP_CENTRE.y - deckM)
        const supportGeo = new THREE.BoxGeometry(footM * 0.82, supportH, footM * 0.82)
        const supportMat = new THREE.MeshStandardMaterial({
          color: 0x3a3f45,
          metalness: 0.15,
          roughness: 0.85,
        })
        const support = new THREE.Mesh(supportGeo, supportMat)
        support.position.y = -deckM - supportH / 2
        support.castShadow = true
        support.receiveShadow = true
        group.add(support)

        const pinGeo = new THREE.SphereGeometry(0.006, 12, 8)
        const pinMat = new THREE.MeshBasicMaterial({ color: 0x46d6c0 })
        for (const [x, y, z] of CORNERS_MM) {
          const pin = new THREE.Mesh(pinGeo, pinMat)
          pin.position.copy(baseToScene(x, y, z).sub(TOP_CENTRE))
          group.add(pin)
        }

        group.position.copy(TOP_CENTRE)
        group.visible = false

        resolve({
          group,
          dispose() {
            mat.dispose()
            pinGeo.dispose()
            pinMat.dispose()
            supportGeo.dispose()
            supportMat.dispose()
            model.traverse((o) => {
              const m = o as THREE.Mesh
              if (m.isMesh) m.geometry?.dispose()
            })
          },
        })
      },
      undefined,
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
    )
  })
}
