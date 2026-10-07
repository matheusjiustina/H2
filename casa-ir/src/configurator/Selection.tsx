/**
 * Picking + subtle selection highlight.
 *
 * Picking is centralised: the nearest pickable hit decides (glass / LEDs are
 * transparent to picking), then we walk up the hierarchy to find a semantic
 * `userData.selectable` id. Clicks that were drags are ignored.
 *
 * Highlight: a soft warm fresnel overlay rendered on top of every mesh that
 * belongs to the selected object (works for merged and instanced meshes).
 */
import { useEffect, useMemo, type ReactNode } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../app/store'

export function findSelectable(o: THREE.Object3D | null): string | null {
  while (o) {
    const s = o.userData?.selectable
    if (s) return s as string
    o = o.parent
  }
  return null
}

export function Pickable({ children }: { children: ReactNode }) {
  const select = useStore((s) => s.select)
  const nav = useStore((s) => s.nav)
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta > 6) return
    // desktop walk mode: clicks capture the mouse; picking uses the crosshair (WalkControls)
    if (nav === 'walk' && !useStore.getState().isTouch) return
    const hit = e.intersections.find((i) => !i.object.userData?.noPick && (i.object as THREE.Mesh).visible !== false && isVisible(i.object))
    const id = hit ? findSelectable(hit.object) : null
    select(id)
  }
  return (
    <group onClick={onClick} onPointerMissed={() => useStore.getState().selectedId && select(null)}>
      {children}
    </group>
  )
}

export function isVisible(o: THREE.Object3D | null): boolean {
  while (o) {
    if (!o.visible) return false
    o = o.parent
  }
  return true
}

const hlMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  depthTest: true,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
  uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#ffd9a0') } },
  vertexShader: `
    #include <common>
    #include <morphtarget_pars_vertex>
    varying vec3 vN; varying vec3 vV;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position,1.0);
      #ifdef USE_INSTANCING
        mv = modelViewMatrix * instanceMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
      #else
        vN = normalize(normalMatrix * normal);
      #endif
      vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform float uTime; uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
    void main(){
      float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
      float pulse = 0.75 + 0.25 * sin(uTime * 3.0);
      float a = (0.10 + f * 0.55) * pulse;
      gl_FragColor = vec4(uColor, a);
    }`,
})

export function SelectionHighlight() {
  const selectedId = useStore((s) => s.selectedId)
  const capturing = useStore((s) => s.capturing)
  const scene = useThree((s) => s.scene)
  const overlays = useMemo(() => new THREE.Group(), [])

  useEffect(() => {
    scene.add(overlays)
    return () => {
      scene.remove(overlays)
    }
  }, [scene, overlays])

  useEffect(() => {
    overlays.clear()
    if (!selectedId) return
    const targets: THREE.Mesh[] = []
    scene.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh || o.parent === overlays) return
      if (findSelectable(o) === selectedId) targets.push(o as THREE.Mesh)
    })
    for (const t of targets) {
      let m: THREE.Mesh
      if ((t as THREE.InstancedMesh).isInstancedMesh) {
        const im = t as THREE.InstancedMesh
        const c = new THREE.InstancedMesh(im.geometry, hlMaterial, im.count)
        c.instanceMatrix = im.instanceMatrix
        m = c
      } else m = new THREE.Mesh(t.geometry, hlMaterial)
      t.updateWorldMatrix(true, false)
      m.matrixAutoUpdate = false
      m.matrix.copy(t.matrixWorld)
      m.renderOrder = 10
      m.raycast = () => {}
      overlays.add(m)
    }
  }, [selectedId, scene, overlays])

  useFrame((s) => {
    hlMaterial.uniforms.uTime.value = s.clock.elapsedTime
    overlays.visible = !capturing
  })
  return null
}
