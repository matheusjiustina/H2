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
import { Bvh } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../app/store'
import { ROOM_BY_ID } from '../data/houseSpec'

export function findSelectable(o: THREE.Object3D | null): string | null {
  while (o) {
    const s = o.userData?.selectable
    if (s) return s as string
    o = o.parent
  }
  return null
}

const firstPickable = (hits: THREE.Intersection[]) => hits.find((i) => !i.object.userData?.noPick && (i.object as THREE.Mesh).visible !== false && isVisible(i.object))

export function Pickable({ children }: { children: ReactNode }) {
  const select = useStore((s) => s.select)
  const nav = useStore((s) => s.nav)
  // hover outline only while customising finishes with a mouse
  const hoverOn = useStore((s) => s.panel === 'acabamentos' && !s.isTouch && s.nav === 'orbit' && !s.presentation)
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta > 6) return
    // desktop walk mode: clicks capture the mouse; picking uses the crosshair (WalkControls)
    if (nav === 'walk' && !useStore.getState().isTouch) return
    const hit = firstPickable(e.intersections)
    const id = hit ? findSelectable(hit.object) : null
    select(id)
  }
  const setHover = (id: string | null) => {
    if (useStore.getState().hoverId !== id) useStore.setState({ hoverId: id })
    document.body.style.cursor = id ? 'pointer' : ''
  }
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const hit = firstPickable(e.intersections)
    setHover(hit ? findSelectable(hit.object) : null)
  }
  useEffect(() => {
    if (!hoverOn) setHover(null)
  }, [hoverOn])
  return (
    <Bvh firstHitOnly>
      <group onClick={onClick} onPointerMove={hoverOn ? onMove : undefined} onPointerOut={hoverOn ? () => setHover(null) : undefined} onPointerMissed={() => useStore.getState().selectedId && select(null)}>
        {children}
      </group>
    </Bvh>
  )
}

/** Meshes (merged, instanced or prefab) that belong to a selectable object. */
function meshesOf(scene: THREE.Object3D, id: string, skip?: THREE.Object3D) {
  const out: THREE.Mesh[] = []
  scene.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh || o.parent === skip || !isVisible(o)) return
    if (findSelectable(o) === id) out.push(o as THREE.Mesh)
  })
  return out
}

/**
 * Bounding sphere used by VER DETALHE. Objects shared by several rooms (a
 * continuous floor, a wall finish) are clipped to the current room.
 */
export function selectableBounds(scene: THREE.Object3D, id: string, room: string | null) {
  const box = new THREE.Box3()
  for (const m of meshesOf(scene, id)) box.expandByObject(m)
  if (box.isEmpty()) return null
  const r = room ? ROOM_BY_ID[room] : null
  if (r && (box.max.x - box.min.x > 5 || box.max.z - box.min.z > 5)) {
    const rb = new THREE.Box3()
    for (const [x0, z0, x1, z1] of r.rects) rb.union(new THREE.Box3(new THREE.Vector3(x0 - 0.3, -1, z0 - 0.3), new THREE.Vector3(x1 + 0.3, 10, z1 + 0.3)))
    const clipped = box.clone().intersect(rb)
    if (!clipped.isEmpty()) box.copy(clipped)
  }
  const sphere = box.getBoundingSphere(new THREE.Sphere())
  return { center: sphere.center.toArray() as [number, number, number], radius: Math.min(sphere.radius, 3.5) }
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

/** Hover: a faint rim only (no fill, no pulse) — a subtle outline. */
const hoverMaterial = hlMaterial.clone()
hoverMaterial.fragmentShader = `
    uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
    void main(){
      float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0);
      gl_FragColor = vec4(uColor, 0.04 + f * 0.42);
    }`
hoverMaterial.uniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color('#fff1dc') } }

function fillOverlays(group: THREE.Group, scene: THREE.Object3D, id: string | null, mat: THREE.Material, skip: THREE.Object3D[]) {
  group.clear()
  if (!id) return
  const targets: THREE.Mesh[] = []
  scene.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh || skip.includes(o.parent!)) return
    if (findSelectable(o) === id) targets.push(o as THREE.Mesh)
  })
  for (const t of targets) {
    let m: THREE.Mesh
    if ((t as THREE.InstancedMesh).isInstancedMesh) {
      const im = t as THREE.InstancedMesh
      const c = new THREE.InstancedMesh(im.geometry, mat, im.count)
      c.instanceMatrix = im.instanceMatrix
      m = c
    } else m = new THREE.Mesh(t.geometry, mat)
    t.updateWorldMatrix(true, false)
    m.matrixAutoUpdate = false
    m.matrix.copy(t.matrixWorld)
    m.renderOrder = 10
    m.raycast = () => {}
    group.add(m)
  }
}

export function SelectionHighlight() {
  const selectedId = useStore((s) => s.selectedId)
  const hoverId = useStore((s) => s.hoverId)
  const capturing = useStore((s) => s.capturing)
  const scene = useThree((s) => s.scene)
  const overlays = useMemo(() => new THREE.Group(), [])
  const hover = useMemo(() => new THREE.Group(), [])

  useEffect(() => {
    scene.add(overlays, hover)
    return () => {
      scene.remove(overlays, hover)
    }
  }, [scene, overlays, hover])

  useEffect(() => fillOverlays(overlays, scene, selectedId, hlMaterial, [overlays, hover]), [selectedId, scene, overlays, hover])
  useEffect(() => fillOverlays(hover, scene, hoverId && hoverId !== selectedId ? hoverId : null, hoverMaterial, [overlays, hover]), [hoverId, selectedId, scene, overlays, hover])

  useFrame((s) => {
    hlMaterial.uniforms.uTime.value = s.clock.elapsedTime
    overlays.visible = !capturing
    hover.visible = !capturing
  })
  return null
}
