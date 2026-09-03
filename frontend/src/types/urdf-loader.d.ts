/**
 * Minimal ambient types for `urdf-loader` 0.12.x (the package ships no
 * declarations). Only the surface this app uses is modelled.
 */
declare module 'urdf-loader' {
  import type { LoadingManager, Object3D } from 'three'

  export interface URDFJoint extends Object3D {
    jointType: string
    setJointValue(...values: (number | null)[]): boolean
    angle: number
  }

  export interface URDFRobot extends Object3D {
    joints: Record<string, URDFJoint>
    links: Record<string, Object3D>
  }

  export default class URDFLoader {
    constructor(manager?: LoadingManager)
    packages: string | Record<string, string> | ((pkg: string) => string)
    loadMeshCb: (
      path: string,
      manager: LoadingManager,
      done: (mesh: Object3D | null, err?: Error) => void,
    ) => void
    parseCollision: boolean
    parseVisual: boolean
    load(
      url: string,
      onLoad: (robot: URDFRobot) => void,
      onProgress?: (progress: ProgressEvent) => void,
      onError?: (err: unknown) => void,
    ): void
  }
}
