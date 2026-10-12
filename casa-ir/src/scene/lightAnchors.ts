/**
 * Exterior architectural light anchors (used by the light pool at night).
 * [x, y, z, intensity, distance]
 */
export const EXTERIOR_LIGHTS: [number, number, number, number, number?][] = [
  // gourmet pergola cylindrical spots (ARQ p.6)
  [10.0, 2.6, 10.0, 0.6, 6],
  [13.2, 2.6, 10.0, 0.6, 6],
  [16.4, 2.6, 10.0, 0.6, 6],
  // stone recess with hanging chair (ARQ p.8)
  [10.9, 2.5, 12.3, 0.5, 5],
  // sala frame uplights towards the patio (ARQ p.14)
  [27.1, 0.4, 7.15, 0.5, 6],
  [27.1, 0.4, 10.6, 0.5, 6],
  // front facade: garage canopy spots, stone pillar uplights, high slab LED (ARQ p.4/5)
  [31.5, 3.0, 14.5, 0.8, 8],
  [34.5, 3.0, 13.0, 0.7, 8],
  [36.6, 0.4, 6.1, 0.6, 7],
  [35.0, 5.6, 6.5, 0.6, 9],
  // garden uplights on the central tree (ARQ p.6 / p.14)
  [23.1, 0.35, 8.4, 0.55, 6],
  [24.1, 0.35, 9.3, 0.45, 6],
  // pool underwater light
  [6.0, -0.5, 4.2, 0.9, 9],
  // suite frame / deck
  [17.0, 0.4, 6.4, 0.4, 5],
]
