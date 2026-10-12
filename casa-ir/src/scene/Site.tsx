/**
 * Site: ground, beach sand, wooden deck, gravel, driveway, sidewalk, street,
 * boundary walls and stepping slabs — all from ARQ p.2 polygons.
 */
import { useMemo } from 'react'
import { GeoBuilder } from '../architecture/builder'
import { extrudePoly, flatPoly } from '../architecture/shapes'
import { POOL, SAND, DECK, GRAVEL, DRIVEWAY, GARDEN_CENTER, STEP_SLABS } from '../data/site'
import { BOUNDARY, HEIGHTS } from '../data/houseSpec'
import { SlotMeshes } from '../configurator/SlotMeshes'

export function Site() {
  const { ground, deck, boundary } = useMemo(() => {
    const ground = new GeoBuilder()
    // base terrain with a hole for the pool
    ground.geo('grass', flatPoly([[-90, -70], [130, -70], [130, 90], [-90, 90]], 0, [POOL]))
    ground.geo('sand', extrudePoly(SAND, 0, HEIGHTS.sand))
    for (const g of GRAVEL) ground.geo('gravel', extrudePoly(g, 0, 0.03))
    ground.geo('concrete_drive', extrudePoly(DRIVEWAY, 0, 0.045))
    for (const [x1, z1, x2, z2] of STEP_SLABS) ground.box('concrete_slab', [x1, 0, z1], [x2, 0.05, z2])

    // sidewalk, curb and street (ARQ p.4/5)
    ground.box('pavers', [40, 0, -60], [42.5, 0.12, 80])
    ground.box('concrete_slab', [42.5, -0.05, -60], [42.66, 0.15, 80])
    ground.box('asphalt', [42.66, -0.06, -60], [52.4, 0.012, 80]) // above the lawn plane (no z-fighting)
    ground.box('concrete_slab', [52.4, -0.05, -60], [52.56, 0.15, 80])
    ground.box('pavers', [52.56, 0, -60], [55.2, 0.12, 80])
    for (let z = -58; z < 78; z += 4.2) ground.box('paper', [47.45, 0.012, z], [47.6, 0.016, z + 2.2])
    // driveway ramp over the sidewalk
    ground.box('concrete_drive', [40, 0.0, 11.2], [42.5, 0.125, 17.8])

    const deck = new GeoBuilder()
    deck.geo('external_deck', extrudePoly(DECK, 0, HEIGHTS.deck))
    deck.geo('grass', extrudePoly(GARDEN_CENTER, 0, HEIGHTS.deck + 0.025))

    const boundary = new GeoBuilder()
    for (const [x1, z1, x2, z2] of BOUNDARY) boundary.box('boundary_wall', [x1, 0, z1], [x2, HEIGHTS.boundaryWall, z2])
    // capping
    for (const [x1, z1, x2, z2] of BOUNDARY) boundary.box('boundary_wall', [x1 - 0.02, HEIGHTS.boundaryWall, z1 - 0.02], [x2 + 0.02, HEIGHTS.boundaryWall + 0.05, z2 + 0.02])

    return { ground: ground.build(), deck: deck.build(), boundary: boundary.build() }
  }, [])

  return (
    <group>
      <SlotMeshes geos={ground} selectable={null} cast={false} />
      <SlotMeshes geos={deck} bySlot cast={false} />
      <SlotMeshes geos={boundary} bySlot />
      <Neighbours />
    </group>
  )
}

/** Very light context massing for the neighbouring lots (ARQ p.4/5 show neighbours). */
function Neighbours() {
  const geos = useMemo(() => {
    const b = new GeoBuilder()
    const nb: [number, number, number, number, number][] = [
      [6, -14, 34, -3.5, 4.2],
      [8, 21.5, 33, 31, 3.8],
    ]
    for (const [x1, z1, x2, z2, h] of nb) {
      b.box('external_facade_secondary', [x1, 0, z1], [x2, h - 0.6, z2])
      b.box('boundary_wall', [x1 - 0.4, h - 0.6, z1 - 0.4], [x2 + 0.4, h, z2 + 0.4])
    }
    return b.build()
  }, [])
  return (
    <group>
      {[...geos.entries()].map(([slot, g]) => (
        <mesh key={slot} geometry={g} receiveShadow castShadow>
          <meshStandardMaterial color={slot === 'boundary_wall' ? '#a39b90' : '#e3ded6'} roughness={0.95} />
        </mesh>
      ))}
    </group>
  )
}

