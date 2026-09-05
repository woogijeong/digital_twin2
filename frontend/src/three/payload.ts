import * as THREE from 'three'

/** Demo pick/place workpiece: rests on the grid floor directly under the
 *  arm's home X/Y (base frame ~[350, -186.5, *] mm), so from RESET TO HOME +
 *  GRIPPER, lowering the target Z reaches it. */
export const PAYLOAD_HOME = new THREE.Vector3(0.35, 0.035, 0.1865)
export const PAYLOAD_SIZE_M = 0.07
/** Gripper tip must be within this distance of the payload to pick it up. */
export const PICK_RADIUS_M = 0.08

export function buildPayload(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(PAYLOAD_SIZE_M, PAYLOAD_SIZE_M, PAYLOAD_SIZE_M),
    new THREE.MeshStandardMaterial({ color: 0xc76b3f, metalness: 0.1, roughness: 0.75 }),
  )
  mesh.position.copy(PAYLOAD_HOME)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}
