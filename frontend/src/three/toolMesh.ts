import * as THREE from 'three'
import type { ToolId } from '../api/client'

/** Flange -> tool tip along the flange +Z axis, in metres. Must match the
 *  backend's `app/robot/tools.py` (FLANGE_TCP_MM + TOOL_EXTRA_MM) so the TCP
 *  marker sits where telemetry says the pose is. */
export const TOOL_TIP_M: Record<ToolId, number> = {
  none: 0.06,
  suction: 0.135,
  gripper: 0.175,
}

// Geometry is built in the flange (link6) local frame; the flange face sits a
// little below z = 0, so tools start just above it and reach exactly the tip.
const MOUNT_Z = 0.012

export interface ToolMesh {
  group: THREE.Group
  /** Empty object at the working point — anchors the TCP marker. */
  tip: THREE.Object3D
  /** Gripper only: 0 = closed, 1 = fully open. */
  setOpen(frac: number): void
  dispose(): void
}

const steel = () =>
  new THREE.MeshStandardMaterial({ color: 0x2b3136, metalness: 0.7, roughness: 0.35 })

/** A cylinder whose axis is local +Z (three.js cylinders are +Y by default),
 *  spanning [z0, z1]. */
function zCylinder(rTop: number, rBot: number, z0: number, z1: number, m: THREE.Material): THREE.Mesh {
  const g = new THREE.CylinderGeometry(rTop, rBot, z1 - z0, 28)
  g.rotateX(Math.PI / 2)
  const mesh = new THREE.Mesh(g, m)
  mesh.position.z = (z0 + z1) / 2
  return mesh
}

/** A box spanning [z0, z1] in Z, centred in X/Y unless offset. */
function zBox(w: number, h: number, z0: number, z1: number, m: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, z1 - z0), m)
  mesh.position.z = (z0 + z1) / 2
  return mesh
}

function tipAt(z: number): THREE.Object3D {
  const o = new THREE.Object3D()
  o.position.z = z
  return o
}

function buildSuction(): ToolMesh {
  const tipZ = TOOL_TIP_M.suction
  const group = new THREE.Group()
  const body = steel()
  const rubber = new THREE.MeshStandardMaterial({ color: 0x17191b, metalness: 0.1, roughness: 0.85 })

  const adapter = zCylinder(0.026, 0.026, MOUNT_Z, MOUNT_Z + 0.016, body)
  const stem = zCylinder(0.011, 0.011, MOUNT_Z + 0.016, tipZ - 0.032, body)
  const cup = zCylinder(0.032, 0.012, tipZ - 0.032, tipZ, rubber)

  const meshes = [adapter, stem, cup]
  const tip = tipAt(tipZ)
  group.add(...meshes, tip)

  return {
    group,
    tip,
    setOpen() {},
    dispose() {
      meshes.forEach((m) => m.geometry.dispose())
      body.dispose()
      rubber.dispose()
    },
  }
}

function buildGripper(): ToolMesh {
  const tipZ = TOOL_TIP_M.gripper
  const group = new THREE.Group()
  const body = steel()
  const fingerMat = new THREE.MeshStandardMaterial({
    color: 0x3c444a,
    metalness: 0.8,
    roughness: 0.3,
  })

  const base = zBox(0.074, 0.074, MOUNT_Z, MOUNT_Z + 0.048, body)
  const knuckle = zBox(0.062, 0.044, MOUNT_Z + 0.048, MOUNT_Z + 0.07, body)

  const fingerZ0 = MOUNT_Z + 0.07
  const fingerGeo = new THREE.BoxGeometry(0.016, 0.052, tipZ - fingerZ0)
  const left = new THREE.Mesh(fingerGeo, fingerMat)
  const right = new THREE.Mesh(fingerGeo, fingerMat)
  left.position.z = right.position.z = (fingerZ0 + tipZ) / 2

  const meshes = [base, knuckle, left, right]
  const tip = tipAt(tipZ)
  group.add(...meshes, tip)

  const setOpen = (frac: number) => {
    const half = 0.014 + Math.min(1, Math.max(0, frac)) * 0.032 // 14mm closed -> 46mm open
    left.position.x = half
    right.position.x = -half
  }
  setOpen(1)

  return {
    group,
    tip,
    setOpen,
    dispose() {
      base.geometry.dispose()
      knuckle.geometry.dispose()
      fingerGeo.dispose()
      body.dispose()
      fingerMat.dispose()
    },
  }
}

/** Procedural end-effector geometry, built in the flange (link6) local frame. */
export function buildTool(tool: Exclude<ToolId, 'none'>): ToolMesh {
  const t = tool === 'suction' ? buildSuction() : buildGripper()
  t.group.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) {
      m.castShadow = true
      m.receiveShadow = true
    }
  })
  return t
}
