// Terrain relief for the outer farmland: gentle rolling country and a belt
// of hills, grown on top of the original (nearly flat) farm terrain.
//
// The farm core — strip, base, hangar, headquarters, every original field
// and their run-in lines — is exactly untouched: the relief weight is zero
// inside CORE and rises smoothly beyond it, so heights there are bit-for-bit
// the old ones. Pure JS, deterministic, no three.js: the renderer, the flight
// environment and the tests all read the same function through TerrainData.
import { smoothstep, lerp, valueNoise } from '../core/math.js';

// Rectangle (x0, x1, z0, z1) that keeps the original terrain: the strip and
// base, the headquarters, the whole original field blocks and their roads.
export const CORE = { x0: -1750, x1: 2850, z0: -1500, z1: 2050 };
const CORE_FALL = 700; // metres beyond the core over which the relief fades in

// Zones of relief (the terrain class that the missions' LEVEL 2 / 3 refer to).
// Each is a warped ellipse: c = centre, r = semi-axes, rot = rotation (rad).
export const ZONES = {
  // LEVEL 3 — hilly agricultural land, north-east.
  hills: { c: [2050, -2800], r: [1950, 1150], rot: -0.3, level: 3, name: 'Serra do Norte' },
  // LEVEL 2 — rolling fields, south-east and north-west.
  rollSE: { c: [1500, 2800], r: [2600, 1150], rot: 0.12, level: 2, name: 'Campos do Sul' },
  rollNW: { c: [-2450, -2700], r: [1800, 1200], rot: 0.3, level: 2, name: 'Chapada Oeste' },
  // Scenery only (no contracts): the western ridge country and the south.
  rollW: { c: [-3150, 700], r: [950, 1900], rot: 0.08, level: 2, name: 'Vale do Oeste' },
  rollS: { c: [-1050, 3300], r: [1050, 650], rot: -0.1, level: 2, name: 'Baixada Sul' },
  // (off: where this zone samples the hill waves, so it gets its own hills
  // rather than whatever the north-east ridges would be at that spot.)
  hillsSW: { c: [-2600, 2900], r: [850, 700], rot: 0.5, level: 3, name: 'Morro do Sudoeste', off: [1300, 1200] },
};

// Relief is a sum of a few smooth waves (long wavelengths carry most of the
// height, short ones add the secondary undulation), sampled at a warped point
// so ridges meander. Smooth by construction: the steepest possible slope is
// the sum of amplitude x wavenumber, so it is bounded by design.
//   [wavelength m, amplitude m, direction rad, phase rad]
const RIDGE = 0.62 + Math.PI / 2; // hill waves travel across the ridge direction
const HILL_WAVES = [
  [2600, 15, RIDGE, 0.4], [1800, 12, RIDGE + 0.35, 2.1], [1300, 8, RIDGE - 0.3, 4.2],
  [880, 4.5, RIDGE + 0.8, 5.6], [600, 2, RIDGE - 0.9, 1.1],
];
const ROLL_WAVES = [
  [2000, 11, 1.1, 1.7], [1400, 8, 2.4, 3.9], [900, 5, 0.3, 0.6], [560, 2.5, 1.9, 5.1],
];

// Overall height scale of the two classes (tuned against the slope limits
// the farm machinery can work: rolling ~ 3°, hills ~ 7° typical).
const ROLL_SCALE = 1.45;
const HILL_SCALE = 1.75;

function waves(list, x, z) {
  // Warp: ridges and swells meander instead of running straight.
  const wx = x + 170 * valueNoise(x / 1700 + 2.1, z / 1700 - 5.5);
  const wz = z + 170 * valueNoise(x / 1700 - 8.8, z / 1700 + 1.7);
  let h = 0;
  for (const [L, A, dir, ph] of list) {
    const k = (Math.PI * 2) / L;
    h += A * Math.sin(k * (wx * Math.cos(dir) + wz * Math.sin(dir)) + ph);
  }
  return h;
}

function warp(x, z) {
  // Low-frequency domain warp so zone outlines are never clean ellipses.
  return [
    x + 330 * valueNoise(x / 1500 + 11.3, z / 1500 - 4.1) + 120 * valueNoise(x / 520 - 2.2, z / 520 + 7.7),
    z + 330 * valueNoise(x / 1500 - 6.7, z / 1500 + 9.4) + 120 * valueNoise(x / 520 + 5.1, z / 520 - 3.3),
  ];
}

// 0 outside, 1 deep inside, smooth in between (compact support).
function zoneWeight(zone, wx, wz, inner) {
  const c = Math.cos(zone.rot), s = Math.sin(zone.rot);
  const dx = wx - zone.c[0], dz = wz - zone.c[1];
  const u = (dx * c + dz * s) / zone.r[0], v = (-dx * s + dz * c) / zone.r[1];
  return 1 - smoothstep(inner, 1, Math.hypot(u, v));
}

function coreFree(x, z) {
  const dx = Math.max(CORE.x0 - x, 0, x - CORE.x1);
  const dz = Math.max(CORE.z0 - z, 0, z - CORE.z1);
  // Also calm towards the edge of the detailed terrain (the horizon ring
  // continues from flat farmland).
  const edge = 1 - smoothstep(3300, 3900, Math.max(Math.abs(x), Math.abs(z)));
  return smoothstep(0, CORE_FALL, Math.hypot(dx, dz)) * edge;
}

// Class weights at a point: how much rolling and how much hilly relief.
export function reliefWeights(x, z) {
  const cf = coreFree(x, z);
  if (cf <= 0) return { roll: 0, hill: 0, sw: 0 };
  const [wx, wz] = warp(x, z);
  const hNE = zoneWeight(ZONES.hills, wx, wz, 0.1), hSW = zoneWeight(ZONES.hillsSW, wx, wz, 0.1);
  const h = Math.max(hNE, hSW);
  // The hills sit in a wider rolling shoulder: relief grows continuously
  // from flat land through rolling country to hills.
  const wide = (z) => ({ ...z, r: [z.r[0] * 1.45, z.r[1] * 1.6] });
  const shoulder = Math.max(zoneWeight(wide(ZONES.hills), wx, wz, 0.1), zoneWeight(wide(ZONES.hillsSW), wx, wz, 0.1));
  const roll = Math.max(zoneWeight(ZONES.rollSE, wx, wz, 0.1), zoneWeight(ZONES.rollNW, wx, wz, 0.1),
    zoneWeight(ZONES.rollW, wx, wz, 0.1), zoneWeight(ZONES.rollS, wx, wz, 0.1), shoulder);
  // sw: share of the south-west hills (the two hill zones never touch).
  return { roll: roll * cf, hill: smoothstep(0.05, 0.7, h) * cf, sw: hSW > 0 ? hSW / (hNE + hSW) : 0 };
}

// Relief height added to the original terrain at (x, z), metres.
export function reliefAt(x, z) {
  const w = reliefWeights(x, z);
  if (w.roll <= 0 && w.hill <= 0) return 0;
  const r = waves(ROLL_WAVES, x, z) * ROLL_SCALE * w.roll;
  let hw = 0;
  if (w.hill > 0) {
    const o = ZONES.hillsSW.off;
    hw = w.sw < 1 ? waves(HILL_WAVES, x, z) : 0;
    if (w.sw > 0) hw = lerp(hw, waves(HILL_WAVES, x + o[0], z + o[1]), w.sw);
  }
  const h = hw * HILL_SCALE * w.hill;
  // The two classes blend: where the hills take over, the swells fade out.
  return lerp(r, h, w.hill);
}

// Terrain class at a point (1 flat farmland, 2 rolling, 3 hilly) from the
// actual relief weights.
export function terrainLevel(x, z) {
  const w = reliefWeights(x, z);
  if (w.hill > 0.45) return 3;
  if (w.roll > 0.35 || w.hill > 0.1) return 2;
  return 1;
}
