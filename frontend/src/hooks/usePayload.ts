import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import type { ToolId } from '../api/client'
import type { LoadedRobot } from '../three/urdfRobot'
import { buildPayload, PAYLOAD_HOME, PICK_RADIUS_M } from '../three/payload'

/** Owns the demo pick/place workpiece: attaches it to the gripper tip when the
 *  gripper closes near it, releases it back onto the floor when the gripper
 *  opens (or the tool is swapped away from the gripper). The caller is
 *  responsible for adding/removing `payload` from its three.js scene. */
export function usePayload(
  robotRef: RefObject<LoadedRobot | null>,
  sceneRef: RefObject<THREE.Scene | null>,
  tool: ToolId,
  gripperOpen: boolean,
) {
  const payload = useMemo(() => buildPayload(), [])
  const attachedRef = useRef(false)
  const tmpVec = useRef(new THREE.Vector3()).current
  const [attached, setAttached] = useState(false)

  useEffect(
    () => () => {
      payload.geometry.dispose()
      ;(payload.material as THREE.Material).dispose()
    },
    [payload],
  )

  useEffect(() => {
    const tryAttach = () => {
      const robot = robotRef.current
      if (!robot || attachedRef.current) return
      robot.tcpWorldPosition(tmpVec)
      if (tmpVec.distanceTo(payload.position) <= PICK_RADIUS_M) {
        robot.attachPayload(payload)
        attachedRef.current = true
        setAttached(true)
      }
    }
    const release = () => {
      const scene = sceneRef.current
      if (!scene || !attachedRef.current) return
      scene.attach(payload)
      payload.position.y = PAYLOAD_HOME.y
      attachedRef.current = false
      setAttached(false)
    }
    if (tool !== 'gripper' || gripperOpen) release()
    else tryAttach()
  }, [tool, gripperOpen, robotRef, sceneRef, payload, tmpVec])

  return { payload, attached }
}
