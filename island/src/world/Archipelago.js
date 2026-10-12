// The archipelago around the main island: four explorable islands, a few shoals and
// the build pads, trails and keep-out zones the sites on them need. Everything here is
// metres in world space (+X east, -Z north, sea level 0). TerrainData folds these
// shapes into the same heightfield as the main island, so water depth, shore foam,
// splats, vegetation, collisions and the player all treat them like the main island.

import { Noise, smoothstep, lerp, clamp, saturate } from '../utils/MathUtils.js';

// Shapes are ellipses in island-local space (rotated by `rot`), roughened by a few lobes
// and noise. `bays` are carved out of the shape (calm, sandy water), `hills` raise the
// interior, `cliffDir` is the windward side where the shore is rocky instead of sandy.
export const ISLANDS = [
  {
    id: 'outpost', name: 'The Forgotten Outpost', x: -610, z: -565, rot: 0.35,
    rx: 82, rz: 60, h: 11, seed: 31, lobes: [[3, 0.11, 0.7], [5, 0.05, 2.1]],
    cliffDir: [-0.4, -0.9], cliffs: 0.55,
    hills: [{ x: -18, z: -14, r: 34, h: 7 }],
    bays: [],
  },
  {
    id: 'cove', name: "Smuggler's Cove", x: 705, z: -420, rot: -0.55,
    rx: 138, rz: 104, h: 30, seed: 37, lobes: [[2, 0.08, 0.3], [4, 0.07, 1.4], [7, 0.03, 0.2]],
    cliffDir: [0.7, -0.7], cliffs: 0.75,
    hills: [{ x: 40, z: 20, r: 60, h: 14 }],
    bays: [{ x: -98, z: 38, rx: 58, rz: 34, depth: 2.6 }],
  },
  {
    id: 'relic', name: 'Relic Island', x: -775, z: 290, rot: 0.9,
    rx: 142, rz: 112, h: 34, seed: 41, lobes: [[3, 0.09, 1.9], [5, 0.06, 0.4]],
    cliffDir: [-0.9, 0.3], cliffs: 0.7,
    hills: [{ x: -22, z: 10, r: 56, h: 9 }],
    bays: [],
  },
  {
    id: 'airstrip', name: 'Airstrip Island', x: 175, z: 830, rot: 0.12,
    rx: 236, rz: 104, h: 20, seed: 53, lobes: [[2, 0.05, 0.9], [5, 0.04, 2.6]],
    cliffDir: [0.1, 1], cliffs: 0.6,
    hills: [{ x: 120, z: 40, r: 50, h: 8 }],
    bays: [{ x: -10, z: -82, rx: 168, rz: 70, depth: 3.4 }],
  },
  {
    id: 'needle', name: 'Needle Rock', x: 395, z: -790, rot: 0,
    rx: 16, rz: 13, h: 16, seed: 61, lobes: [[3, 0.12, 0.2]],
    cliffDir: [0, -1], cliffs: 1, steep: true,
    hills: [], bays: [],
  },
];

// Shallow water away from any island: [x, z, rx, rz, rot, floor (m), calm 0..1]
export const SHOALS = [
  { id: 'wreckShoal', x: 560, z: -556, rx: 62, rz: 40, rot: -0.4, floor: -3.3, calm: 0.75 },
  { id: 'sandbar', x: -330, z: -640, rx: 44, rz: 13, rot: 0.25, floor: -0.42, calm: 0.7 },
  { id: 'needleSpit', x: 395, z: -772, rx: 30, rz: 16, rot: 0.1, floor: -0.35, calm: 0.85 },
];

// Level build pads (world space): the ground is blended to the height at the centre.
// `y` overrides the target height when given.
export const PADS = [
  { id: 'station', x: 66, z: 172, r: 12 },
  { id: 'outpostHut', x: -596, z: -552, r: 9 },
  { id: 'outpostMast', x: -612, z: -575, r: 6 },
  { id: 'coveShelter', x: 652, z: -392, r: 12 },
  { id: 'coveYard', x: 668, z: -372, r: 10 },
  { id: 'relicRuins', x: -760, z: 300, r: 12 },
  { id: 'relicSummit', x: -790, z: 298, r: 8 },
  { id: 'relicCave', x: -728, z: 258, r: 7 },
  { id: 'relicBuried', x: -700, z: 296, r: 4 },
  { id: 'stripShelter', x: 150, z: 847, r: 10 },
  { id: 'stripFuel', x: 212, z: 843, r: 9 },
  { id: 'stripCamp', x: 30, z: 890, r: 8 },
];

// Trails (centrelines). They get the same flattening and dirt splat as the island paths.
export const ISLAND_PATHS = [
  // ridge overlook -> radio station
  { width: 1.6, points: [[52, 154], [57, 160], [62, 166], [66, 170]] },
  // outpost: dock -> hut -> mast
  { width: 1.5, points: [[-563, -532], [-574, -540], [-584, -546], [-596, -550], [-606, -562], [-612, -572]] },
  // cove: beach -> shelter -> yard, then the narrow trail up into the trees
  { width: 1.7, points: [[640, -404], [648, -396], [658, -386], [668, -374]] },
  { width: 1.0, points: [[668, -374], [684, -380], [700, -392], [716, -402], [728, -400]] },
  // relic island: east beach -> ruins -> summit lookout; spur to the cave
  { width: 1.6, points: [[-690, 318], [-708, 314], [-728, 308], [-746, 302], [-760, 300]] },
  { width: 1.3, points: [[-760, 300], [-768, 290], [-778, 286], [-786, 292], [-790, 298]] },
  { width: 1.2, points: [[-746, 302], [-740, 284], [-734, 268], [-727, 258]] },
  // airstrip island: dock -> shelter -> fuel store -> beacon; and to the old expedition camp
  { width: 1.6, points: [[138, 803], [144, 819], [150, 837], [150, 847]] },
  { width: 1.5, points: [[150, 847], [176, 847], [200, 845], [212, 843], [236, 849]] },
  { width: 1.3, points: [[150, 847], [118, 857], [86, 869], [56, 881], [30, 890]] },
];

// Points the vegetation and rocks keep clear of: [x, z, radius]
export const EXCLUSIONS = [
  [66, 172, 13], [60, 163, 3],
  [-596, -552, 10], [-612, -575, 7], [-578, -541, 8], [-560, -536, 10],
  [652, -392, 13], [668, -372, 11], [636, -414, 9], [728, -400, 5],
  [-760, 300, 13], [-790, 298, 9], [-727, 258, 9], [-692, 318, 8], [-745, 335, 5],
  [150, 847, 11], [212, 843, 10], [236, 849, 6], [30, 890, 9], [138, 803, 8], [116, 787, 10],
];

// Rock formations placed by hand for the sites: [x, z, size, options for Rocks.add]
export const SITE_ROCKS = [
  // Relic Island: weathered stacks around the ruins and the cave's backdrop
  [-752, 322, 4.5, { sy: 2.2, tilt: 0.2 }], [-744, 331, 3.2, { sy: 1.6 }], [-773, 319, 5.0, { sy: 2.6 }],
  [-804, 300, 3.5, { sy: 1.8 }], [-716, 272, 4.0, { sy: 1.4 }], [-738, 249, 5.5, { sy: 2.0, sink: 0.25 }],
  [-719, 250, 3.8, { sy: 1.7 }], [-796, 268, 3.0, { sy: 1.5 }],
  // Smuggler's Cove: the cleft in the rocks at the end of the narrow trail
  [733, -395, 3.6, { sy: 2.0 }], [734, -406, 3.2, { sy: 1.8 }], [740, -400, 4.2, { sy: 2.4 }],
  // reef rocks around the wreck
  [538, -538, 2.4, { sy: 1.0 }], [592, -574, 3.0, { sy: 1.2 }], [546, -580, 1.8], [584, -536, 1.5],
  // Needle Rock and the outpost's windward point
  [381, -776, 2.2], [409, -771, 2.5], [400, -806, 3.0, { sy: 1.6 }],
  [-640, -592, 3.0, { sy: 1.5 }], [-626, -604, 2.4],
];

// Points of interest on the new islands (discoveries, chart labels).
export const ARCHIPELAGO_POIS = [
  { id: 'station', name: 'Ridge Radio Station', x: 66, z: 172, radius: 16 },
  { id: 'outpost', name: 'The Forgotten Outpost', x: -600, z: -556, radius: 40 },
  { id: 'cove', name: "Smuggler's Cove", x: 650, z: -395, radius: 50 },
  { id: 'lostVessel', name: 'The Lost Vessel', x: 560, z: -556, radius: 45 },
  { id: 'relic', name: 'Relic Island', x: -755, z: 300, radius: 60 },
  { id: 'airstrip', name: 'Airstrip Island', x: 160, z: 820, radius: 70 },
  { id: 'needle', name: 'Needle Rock', x: 395, z: -785, radius: 26 },
  { id: 'sandbar', name: 'Lost Sandbar', x: -330, z: -640, radius: 30 },
];

const noises = new Map();
const noiseFor = (seed) => noises.get(seed) || noises.set(seed, new Noise(seed)).get(seed);

function toLocal(o, x, z) {
  const dx = x - o.x, dz = z - o.z;
  const c = Math.cos(o.rot), s = Math.sin(o.rot);
  return [dx * c - dz * s, dx * s + dz * c];
}

/** Approximate signed distance (m, + inside) to a roughened ellipse in local space. */
function ellipseSD(lx, lz, rx, rz, warp = 1) {
  const len = Math.hypot(lx, lz) || 1e-6;
  const ux = lx / len, uz = lz / len;
  const dirR = 1 / Math.sqrt((ux / rx) ** 2 + (uz / rz) ** 2) * warp;
  return dirR - len;
}

/**
 * Surface of one island at a world point: { h, dc, calm } or null when the point is far
 * outside its influence. dc = signed distance to the coast (+ on land).
 */
function islandSample(o, x, z) {
  const reach = Math.max(o.rx, o.rz) + 200;
  if (Math.abs(x - o.x) > reach || Math.abs(z - o.z) > reach) return null;
  const n = noiseFor(o.seed);
  const [lx, lz] = toLocal(o, x, z);
  const th = Math.atan2(lz / o.rz, lx / o.rx);
  let warp = 1 + n.noise2(lx * 0.018, lz * 0.018) * 0.07;
  for (const [k, a, ph] of o.lobes) warp += a * Math.sin(k * th + ph);
  let dc = ellipseSD(lx, lz, o.rx, o.rz, warp);
  let calm = 0;
  let bayFloor = 0;
  for (const b of o.bays) {
    const bd = ellipseSD(lx - b.x, lz - b.z, b.rx, b.rz, 1 + n.noise2(lx * 0.03 + 5, lz * 0.03) * 0.06);
    // carve the bay: smooth min of the island and the outside of the bay
    const k = 10;
    const a = dc, bb = -bd;
    const hmin = clamp(0.5 + 0.5 * (bb - a) / k, 0, 1);
    dc = lerp(bb, a, hmin) - k * hmin * (1 - hmin);
    if (bd > -30) { calm = Math.max(calm, smoothstep(-30, 10, bd)); bayFloor = Math.max(bayFloor, smoothstep(-25, 15, bd) * b.depth); }
  }
  // windward side: rocky shore and low cliffs
  const len = Math.hypot(lx, lz) || 1;
  const wind = o.cliffDir ? saturate((lx / len) * o.cliffDir[0] + (lz / len) * o.cliffDir[1]) : 0;
  const cliff = saturate(o.cliffs * smoothstep(0.1, 0.7, wind) * (0.8 + 0.4 * n.noise2(lx * 0.04, lz * 0.04)));
  let h;
  if (dc >= 0) {
    const dirR = Math.max(10, Math.min(o.rx, o.rz) * warp);
    let beach = Math.min(dc, 18) * 0.075 + smoothstep(10, 26, dc) * 0.9;
    beach += n.noise2(lx * 0.07, lz * 0.07) * 0.15 * smoothstep(4, 16, dc);
    const cliffProfile = Math.min(dc * 1.3, 6 + 7 * cliff) * (0.9 + 0.2 * n.noise2(lx * 0.06, lz * 0.06));
    h = lerp(beach, cliffProfile, smoothstep(0.2, 0.7, cliff));
    if (o.steep) h = Math.min(dc * 2.2, o.h) * (0.85 + 0.3 * n.noise2(lx * 0.15, lz * 0.15));
    else {
      const inner = Math.pow(smoothstep(12, dirR * 0.85, dc), 1.35);
      const ridge = 0.65 + 0.45 * n.ridge2(lx * 0.012 + 3, lz * 0.012, 3);
      h += o.h * inner * ridge;
      h += n.fbm2(lx * 0.02, lz * 0.02, 3) * 2.2 * smoothstep(16, 50, dc);
      for (const hl of o.hills) {
        const d = Math.hypot(lx - hl.x, lz - hl.z) / hl.r;
        if (d < 1.6) h += hl.h * Math.pow(saturate(1 - d / 1.5), 1.6) * smoothstep(8, 30, dc);
      }
    }
  } else {
    const off = -dc;
    const shelf = (o.steep ? 14 : 30 + 26 * (1 - cliff)) * (0.8 + 0.4 * n.noise2(lx * 0.01 + 7, lz * 0.01));
    const shore = -off * (0.075 + 0.32 * cliff);
    const floor = -1.8 - 1.8 * smoothstep(8, shelf, off) + n.noise2(lx * 0.03, lz * 0.07) * 0.3;
    let hs = Math.max(shore, floor);
    // drop off to the deep beyond the shelf
    hs -= smoothstep(shelf, shelf + 95, off) * 34;
    // sandy, even bay floor (seaplane water and boat moorings) instead of the drop
    if (bayFloor > 0) hs = lerp(hs, Math.max(-bayFloor + n.noise2(lx * 0.05, lz * 0.05) * 0.2, shore), smoothstep(0, 0.6, calm));
    h = Math.max(hs, -38);
  }
  return { h, dc, calm };
}

function shoalSample(s, x, z) {
  const reach = Math.max(s.rx, s.rz) + 150;
  if (Math.abs(x - s.x) > reach || Math.abs(z - s.z) > reach) return null;
  const n = noiseFor(77);
  const [lx, lz] = toLocal(s, x, z);
  const d = ellipseSD(lx, lz, s.rx, s.rz, 1 + n.noise2(lx * 0.04 + s.x, lz * 0.04) * 0.1);
  const top = s.floor + n.noise2(lx * 0.08, lz * 0.08) * 0.18;
  // gentle bank, then down to the deep well inside the sampled square (no seams)
  const h = d >= 0 ? top - smoothstep(0, Math.max(s.rx, s.rz), d) * 0.3 : Math.max(top + d * 0.06 - smoothstep(0, 110, -d) * 30, -38);
  return { h, calm: s.calm * smoothstep(-40, 0, d) };
}

/**
 * Archipelago contribution at a world point: { h, dc, calm }. h = -999 / dc = -999 when
 * no island or shoal reaches this point.
 */
export function archipelagoSample(x, z, out = { h: -999, dc: -999, calm: 0 }) {
  out.h = -999; out.dc = -999; out.calm = 0;
  for (const o of ISLANDS) {
    const s = islandSample(o, x, z);
    if (!s) continue;
    if (s.h > out.h) out.h = s.h;
    if (s.dc > out.dc) out.dc = s.dc;
    out.calm = Math.max(out.calm, s.calm);
  }
  for (const sh of SHOALS) {
    const s = shoalSample(sh, x, z);
    if (!s) continue;
    if (s.h > out.h) out.h = s.h;
    out.calm = Math.max(out.calm, s.calm);
  }
  return out;
}

export const islandById = (id) => ISLANDS.find((o) => o.id === id);
