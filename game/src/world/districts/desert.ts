import { Rect, TAU } from '../../core/util';
import { shade } from '../../render/geo';
import { PAL } from '../../render/materials';
import { FLAT_ZONES, P, RAIL_Z } from '../layout';
import { billboard, fence, flagpole, mesa, rock, tree } from '../props';
import { container } from './harbor';
import type { World } from '../world';

const TAN = 0xd9b98a, TAN_D = 0xb8946a;

/** Layout of the desert hideout; the boss script reads these. */
export const COMPOUND = {
  rect: { x0: 742, z0: -36, x1: 868, z1: 76 } as Rect,
  gate: { x: 742, z: 20 },
  yard: { x0: 808, z0: -6, x1: 862, z1: 46 } as Rect,
  generators: [{ x: 760, z: -22 }, { x: 792, z: 62 }, { x: 852, z: -24 }],
  bossSpot: { x: 848, z: 20 },
  switches: [{ x: 814, z: -1 }, { x: 814, z: 41 }, { x: 856, z: 41 }],
  towers: [{ x: 746, z: -32 }, { x: 864, z: -32 }, { x: 864, z: 72 }, { x: 746, z: 72 }],
};

function ground(w: World, r: Rect, c: number, y = 0.03) {
  const sw = r.x1 - r.x0, sd = r.z1 - r.z0;
  const nx = Math.max(1, Math.ceil(sw / 60)), nz = Math.max(1, Math.ceil(sd / 60));
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const tx = r.x0 + (sw * (i + 0.5)) / nx, tz = r.z0 + (sd * (j + 0.5)) / nz;
      w.geo.at('decal', tx, tz).flat(tx, y, tz, sw / nx, sd / nz, c);
    }
}

function adobe(w: World, x: number, z: number, bw: number, bd: number, h: number, rot = 0, c = TAN) {
  const b = w.geo.at('world', x, z);
  b.box(x, h / 2, z, bw, h, bd, c, rot, 8, shade(c, 0.86));
  b.box(x, h + 0.25, z, bw + 0.3, 0.5, bd + 0.3, shade(c, 0.9), rot, 4 | 8);
  w.addBox(x, z, bw, bd, 0, h + 0.5, rot);
}

function compound(w: World) {
  const C = COMPOUND, R = C.rect;
  ground(w, { x0: R.x0 - 6, z0: R.z0 - 6, x1: R.x1 + 6, z1: R.z1 + 6 }, 0xd6ae78);
  const wall = (ax: number, az: number, bx: number, bz: number, h = 5) => fence(w, ax, az, bx, bz, 'wall', h, 0, TAN);
  // perimeter with a gate on the west side
  wall(R.x0, R.z0, R.x1, R.z0);
  wall(R.x1, R.z0, R.x1, R.z1);
  wall(R.x0, R.z1, R.x1, R.z1);
  wall(R.x0, R.z0, R.x0, C.gate.z - 5);
  wall(R.x0, C.gate.z + 5, R.x0, R.z1);
  w.addGate('compound', R.x0, C.gate.z, 0.8, 10, 0, 4.6, 0, 0x6e5a48, true);
  // maze of inner walls between the gate and the courtyard
  const M = 3.6;
  const inner: number[][] = [
    [758, -36, 758, -8], [758, 4, 758, 34], [758, 48, 758, 76],
    [774, -24, 774, 12], [774, 26, 774, 64],
    [790, -36, 790, -14], [790, 0, 790, 40], [790, 54, 790, 76],
    [758, 34, 774, 34], [774, 12, 790, 12], [742, -8, 758, -8], [774, -24, 790, -24], [758, 48, 768, 48],
    [806, -36, 806, -20], [806, 6, 806, 34], [806, 48, 806, 76],
    [806, -8, 868, -8], [806, 48, 830, 48], [842, 48, 868, 48],
  ];
  for (const [ax, az, bx, bz] of inner) wall(ax, az, bx, bz, M);
  // corner guard towers
  for (const t of C.towers) {
    const b = w.geo.at('world', t.x, t.z);
    for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [1.6, 1.6], [-1.6, 1.6]]) b.box(t.x + dx, 4, t.z + dz, 0.3, 8, 0.3, PAL.woodDark, 0, 8);
    b.box(t.x, 8.1, t.z, 4.4, 0.3, 4.4, PAL.wood, 0, 0);
    b.box(t.x, 8.9, t.z, 4.4, 1.2, 4.4, TAN_D, 0, 4 | 8);
    b.pyramid(t.x, 10.6, t.z, 5.4, 5.4, 1.6, 0x8a6b4a);
    for (const [dx, dz] of [[-2, -2], [2, -2], [2, 2], [-2, 2]]) b.box(t.x + dx, 9.8, t.z + dz, 0.2, 1.8, 0.2, PAL.woodDark, 0, 12);
    w.geo.at('glow', t.x, t.z).box(t.x, 9.3, t.z, 0.7, 0.7, 0.7, PAL.paper, 0, 0);
  }
  // main building, barracks, tents, crates
  adobe(w, 858, 20, 14, 22, 7.5);
  adobe(w, 858, 20, 10, 12, 10.5);
  const b = w.geo.at('world', 850, 20);
  b.wallQuad(850.9, 0, 22, 0, -1, 4, 3.4, 0x3a2e28);
  b.box(849, 3.9, 20, 4.4, 0.4, 10, PAL.woodDark, 0, 0);
  for (const dz of [-4.6, 4.6]) b.box(847.2, 1.95, 20 + dz, 0.3, 3.9, 0.3, PAL.woodDark, 0, 12);
  adobe(w, 824, -22, 26, 10, 4.2);
  adobe(w, 836, 64, 30, 12, 4.2);
  adobe(w, 766, 64, 10, 12, 3.6);
  for (const [tx, tz] of [[748, 56], [782, -30], [798, 68]]) {
    w.geo.at('world', tx, tz).gable(tx, 0, tz, 6, 5, 2.6, 0x8a9a6a, 0.3);
    w.addBox(tx, tz, 5, 5, 0, 2.2, 0.3, { cam: false });
  }
  for (const g of C.generators) {
    const gb = w.geo.at('world', g.x, g.z);
    gb.box(g.x, 1.1, g.z, 3.4, 2.2, 2.2, 0x4f6f66, 0, 8, 0x3a5a50);
    gb.cyl(g.x + 1, 2.2, g.z, 0.2, 0.2, 1.4, 5, PAL.dark, true);
    gb.box(g.x - 1.9, 0.8, g.z, 0.4, 1, 1.4, PAL.lineYellow, 0, 8);
    w.addBox(g.x, g.z, 3.4, 2.2, 0, 2.2, 0, { cam: false });
  }
  for (let k = 0; k < 16; k++) {
    const x = w.rng.range(812, 858), z = w.rng.pick([w.rng.range(-4, 2), w.rng.range(40, 46), w.rng.range(8, 34)]);
    if (Math.hypot(x - 835, z - 20) < 9 || x > 846) continue;
    const s = w.rng.range(1.2, 1.9);
    w.geo.at('world', x, z).box(x, s / 2, z, s, s, s, k % 3 ? PAL.wood : 0x6f7a4a, w.rng.range(0, 1.5), 8, PAL.woodDark);
    w.addBox(x, z, s, s, 0, s, 0, { cam: false });
  }
  flagpole(w, 846, 10, 9, 0);
  // comms antenna
  b.cyl(864, 10.5, 12, 0.14, 0.06, 13, 4, 0x8b93a6, false);
  w.zones.push({ id: 'compound', kind: 'restricted', rect: R, label: 'Desert compound' }, { id: 'compound-yard', kind: 'arena', rect: C.yard });
  w.collectSpots.push({ x: 782, z: 20 }, { x: 858, z: 20, y: 11 });
  w.signs.text(R.x0 - 0.3, 3.2, C.gate.z - 9, -Math.PI / 2, 7, 1.4, 'PRIVATE · NO SOLICITORS', '#d9b98a', '#3a2e28');
}

function motel(w: World) {
  const x = P.motel.x, z = P.motel.z;
  ground(w, { x0: x - 30, z0: z - 16, x1: x + 34, z1: z + 26 }, PAL.asphaltDark);
  const b = w.geo.at('world', x, z);
  const wing = (cx: number, cz: number, len: number, alongX: boolean) => {
    const sx = alongX ? len : 8, sz = alongX ? 8 : len;
    b.box(cx, 1.9, cz, sx, 3.8, sz, 0xf2d6a8, 0, 8, 0xa85a44);
    b.box(cx + (alongX ? 0 : -5), 3.9, cz + (alongX ? 5 : 0), alongX ? len : 2.4, 0.2, alongX ? 2.4 : len, 0x3fa7c4, 0, 0);
    const n = Math.floor(len / 5.5);
    for (let k = 0; k < n; k++) {
      const o = -len / 2 + 2.8 + k * 5.5;
      if (alongX) {
        b.wallQuad(cx + o - 0.6, 0.05, cz + 4.06, 1, 0, 1.1, 2.3, k % 2 ? PAL.red : 0x3fa7c4);
        w.geo.at(w.rng.chance(0.4) ? 'glow' : 'world', x, z).wallQuad(cx + o + 1, 1.0, cz + 4.06, 1, 0, 1.6, 1.3, PAL.window);
      } else {
        b.wallQuad(cx - 4.06, 0.05, cz + o - 0.6, 0, 1, 1.1, 2.3, k % 2 ? PAL.red : 0x3fa7c4);
        w.geo.at(w.rng.chance(0.4) ? 'glow' : 'world', x, z).wallQuad(cx - 4.06, 1.0, cz + o + 1, 0, 1, 1.6, 1.3, PAL.window);
      }
    }
    w.addBox(cx, cz, sx, sz, 0, 4);
  };
  wing(x - 2, z - 10, 44, true);
  wing(x + 24, z + 6, 24, false);
  // office + neon pylon
  b.box(x - 26, 2.4, z + 4, 10, 4.8, 9, 0x3fa7c4, 0, 8, PAL.white);
  w.signs.text(x - 26, 3.6, z + 8.6, 0, 6, 1.1, 'OFFICE · VACANCY', '#f6ecd0', '#d43a34');
  w.addBox(x - 26, z + 4, 10, 9, 0, 4.8);
  b.box(x - 30, 5, z + 28, 0.5, 10, 0.5, 0x4a4f66, 0, 8);
  w.addBox(x - 30, z + 28, 0.6, 0.6, 0, 10, 0, { cam: false });
  w.signs.text(x - 30, 11.4, z + 28, Math.PI / 2, 9, 3.6, 'ATOMIC MOTEL', '#2b2e42', '#f2c94c', true);
  w.geo.at('glow', x - 30, z + 28).blob(x - 30, 14, z + 28, 1, 1, 1, PAL.orange, 12, 0.5);
  // tiny pool
  ground(w, { x0: x + 2, z0: z + 8, x1: x + 14, z1: z + 16 }, 0x5fc4e0, 0.06);
  fence(w, x + 1, z + 7, x + 15, z + 7, 'chain', 1.3, 0);
  for (let k = 0; k < 4; k++) w.parkSpots.push({ x: x - 14 + k * 6, z: z - 2.6, rot: 0, y: 0, kind: k === 1 ? 'muscle' : k === 3 ? 'moto' : undefined });
  w.interacts.push({ id: 'safe-desert', kind: 'safehouse', x: P.safeDesert.x, y: 0, z: P.safeDesert.z, r: 3, label: 'Hide out in Room 6', data: 'desert' });
  w.zones.push({ id: 'safe-desert', kind: 'safe', rect: { x0: x - 24, z0: z - 6, x1: x + 20, z1: z + 6 } });
  tree(w, x - 20, z + 20, 'palm', 1, 0);
  tree(w, x + 30, z + 24, 'palm', 1, 0);
}

function oldGas(w: World) {
  const x = P.oldGas.x, z = P.oldGas.z;
  const b = w.geo.at('world', x, z);
  ground(w, { x0: x - 12, z0: z - 10, x1: x + 12, z1: z + 12 }, 0xb9a58a);
  adobe(w, x, z - 5, 12, 7, 3.6, 0, 0xcfc0a0);
  b.wallQuad(x - 4, 0.8, z - 1.44, 1, 0, 3, 1.6, 0x6e5a48);
  b.wallQuad(x + 1, 0.05, z - 1.44, 1, 0, 1.2, 2.3, 0x6e5a48);
  b.box(x, 4.3, z + 4, 10, 0.4, 6, 0xb8946a, 0.03, 0);
  for (const dx of [-4, 4]) b.box(x + dx, 2.1, z + 6.4, 0.3, 4.2, 0.3, 0x8a6b4a, 0, 8);
  for (const dx of [-1.5, 1.5]) {
    b.box(x + dx, 0.9, z + 4.5, 0.7, 1.8, 0.5, 0xa85a44, 0.1 * dx, 8);
    w.addBox(x + dx, z + 4.5, 0.7, 0.5, 0, 1.8, 0, { cam: false });
  }
  b.box(x + 9, 3, z + 9, 0.3, 6, 0.3, 0x6e5a48, 0, 8);
  w.signs.text(x + 9, 6.4, z + 9, 0.5, 4.4, 2, 'LAST CHANCE GAS', '#b9a58a', '#6e3a2c', true);
  wreck(w, x - 8, z + 6, 0.6);
  w.collectSpots.push({ x: x - 3, z: z - 9.5 });
}

function wreck(w: World, x: number, z: number, rot: number) {
  const b = w.geo.at('world', x, z);
  const y = w.terrain.h(x, z);
  b.box(x, y + 0.6, z, 1.9, 0.8, 4.4, 0xa0613a, rot, 8, 0x8a4a2c);
  b.box(x, y + 1.25, z, 1.7, 0.6, 2, 0x8a4a2c, rot, 8);
  w.addBox(x, z, 1.9, 4.4, y, y + 1.4, rot, { cam: false });
}

function airstrip(w: World) {
  const z = P.airstrip.z;
  ground(w, { x0: 690, z0: z - 9, x1: 882, z1: z + 9 }, PAL.asphaltDark, 0.04);
  for (let x = 700; x < 876; x += 14) w.geo.at('decal', x, z).flat(x, 0.07, z, 7, 0.5, PAL.line);
  for (const x of [694, 878]) for (let k = -3; k <= 3; k++) w.geo.at('decal', x, z).flat(x, 0.07, z + k * 2.2, 5, 1, PAL.line);
  ground(w, { x0: 706, z0: z - 44, x1: 820, z1: z - 9 }, 0xa9a394, 0.035);
  // hangar (open toward the runway)
  const hx = P.hangar.x, hz = P.hangar.z - 6;
  const b = w.geo.at('world', hx, hz);
  b.box(hx - 13.5, 4, hz, 1, 8, 22, 0x9fb0c4, 0, 8);
  b.box(hx + 13.5, 4, hz, 1, 8, 22, 0x9fb0c4, 0, 8);
  b.box(hx, 4, hz - 10.5, 26, 8, 1, 0x9fb0c4, 0, 8);
  b.gable(hx, 8, hz, 23, 29, 3.2, 0x6f86a8, Math.PI / 2, 0x9fb0c4);
  b.quad(hx - 14, 8, hz + 11.5, hx - 14, 8, hz - 11.5, hx + 14, 8, hz - 11.5, hx + 14, 8, hz + 11.5, 0x7b8298);
  w.addBox(hx - 13.5, hz, 1, 22, 0, 8);
  w.addBox(hx + 13.5, hz, 1, 22, 0, 8);
  w.addBox(hx, hz - 10.5, 26, 1, 0, 8);
  w.addBox(hx, hz, 28, 23, 8, 11.2);
  w.signs.text(hx, 9.6, hz + 11.6, 0, 16, 1.8, 'ROUTE 66 AIRFIELD', '#6f86a8', '#f6ecd0');
  w.zones.push({ id: 'hangar', kind: 'hide', rect: { x0: hx - 13, z0: hz - 10, x1: hx + 13, z1: hz + 11 } });
  // parked prop plane
  const px = 776, pz = z - 26;
  const pb = w.geo.at('world', px, pz);
  pb.box(px, 1.5, pz, 1.4, 1.4, 8, PAL.white, 0.4, 0, PAL.red);
  pb.box(px, 1.9, pz, 11, 0.16, 1.7, PAL.red, 0.4, 0);
  pb.box(px - 1.4, 2.4, pz - 3.3, 0.14, 1.6, 1.3, PAL.red, 0.4, 0);
  pb.box(px - 1.4, 1.7, pz - 3.3, 3.6, 0.12, 1, PAL.white, 0.4, 0);
  pb.box(px + 1.65, 1.5, pz + 3.9, 2.4, 0.14, 0.14, PAL.dark, 0.4, 0);
  for (const s of [-1, 1]) pb.box(px + s * 1.2, 0.5, pz + s * 0.6 + 1, 0.2, 1, 0.2, PAL.dark, 0, 8);
  w.addBox(px, pz, 2, 8, 0, 2.3, 0.4, { cam: false });
  // windsock, fuel truck, helicopter stand
  pb.cyl(820, 0, z - 14, 0.08, 0.08, 6, 4, PAL.white, false);
  pb.cyl(821.3, 5.6, z - 14, 0.5, 0.15, 0.01, 6, PAL.orange, false);
  pb.box(821.2, 5.7, z - 14, 2.4, 0.5, 0.5, PAL.orange, 0, 0);
  w.parkSpots.push({ x: 800, z: z - 26, rot: 0, y: 0, kind: 'heli', id: 'desert-heli' }, { x: 746, z: z - 16, rot: 1.2, y: 0, kind: 'pickup' }, { x: 716, z: z - 30, rot: 0.2, y: 0, kind: 'moto' });
  w.signs.addFlat('hpad', 800, 0.07, z - 26, 0, 12, 12, 96, 96, () => {});
  w.collectSpots.push({ x: 880, z }, { x: hx, z: hz, y: 11.2 });
}

function freightYard(w: World) {
  const x0 = 660, x1 = 862;
  ground(w, { x0, z0: RAIL_Z - 22, x1, z1: RAIL_Z + 6 }, 0xb9a58a, 0.025);
  const car = (x: number, z: number, kind: number) => {
    const b = w.geo.at('world', x, z);
    b.box(x, 1.0, z, 13.5, 0.4, 2.7, PAL.dark, 0, 0);
    for (const dx of [-4.5, 4.5]) b.box(x + dx, 0.5, z, 2.4, 0.7, 2.2, PAL.ink, 0, 8);
    if (kind === 0) b.box(x, 2.9, z, 13.2, 3.4, 2.7, w.rng.pick([0x8f332f, 0x4f6f66, 0xb8843a, 0x6f7a8f]), 0, 8, 0x5a5a5a);
    else if (kind === 1) {
      for (let k = 0; k < 6; k++) {
        const a0 = (k / 6) * TAU, a1 = ((k + 1) / 6) * TAU;
        b.quad(x - 6, 2.7 + Math.sin(a0) * 1.4, z + Math.cos(a0) * 1.4, x + 6, 2.7 + Math.sin(a0) * 1.4, z + Math.cos(a0) * 1.4, x + 6, 2.7 + Math.sin(a1) * 1.4, z + Math.cos(a1) * 1.4, x - 6, 2.7 + Math.sin(a1) * 1.4, z + Math.cos(a1) * 1.4, k % 2 ? 0x2b2e42 : 0x3a3d55);
      }
      b.box(x - 6, 2.7, z, 0.1, 2.4, 2.4, 0x2b2e42, 0, 0);
      b.box(x + 6, 2.7, z, 0.1, 2.4, 2.4, 0x2b2e42, 0, 0);
    } else container(w, x, 1.2, z, 0);
    w.addBox(x, z, 13.5, 2.7, 0, kind === 2 ? 3.8 : 4.6);
  };
  let k = 0;
  for (const z of [RAIL_Z - 8, RAIL_Z - 16]) {
    w.railLines.push({ x0, x1, z });
    for (let x = x0 + 12; x < x1 - 10; x += 14.6) {
      if (w.rng.chance(0.3)) continue;
      car(x, z, k++ % 3);
    }
  }
  // locomotive on the main line
  const lx = 700, lz = RAIL_Z;
  const b = w.geo.at('world', lx, lz);
  b.box(lx, 1.0, lz, 16, 0.5, 2.8, PAL.dark, 0, 0);
  b.box(lx - 1, 2.6, lz, 11, 2.8, 2.5, PAL.orange, 0, 8, 0xb8843a);
  b.box(lx + 6, 3.1, lz, 3.2, 3.8, 2.8, PAL.orange, 0, 8, PAL.dark);
  b.box(lx + 6, 4.1, lz, 3.3, 1, 2.9, PAL.window, 0, 4 | 8);
  b.box(lx - 1, 2.0, lz, 11.1, 0.5, 2.6, PAL.dark, 0, 4 | 8);
  for (const dx of [-5, 5]) b.box(lx + dx, 0.5, lz, 3, 0.7, 2.2, PAL.ink, 0, 8);
  w.addBox(lx, lz, 16, 2.8, 0, 5);
  // water tower + loading shed
  const tx = 838, tz = RAIL_Z + 22;
  const tb = w.geo.at('world', tx, tz);
  for (const [dx, dz] of [[-2, -2], [2, -2], [2, 2], [-2, 2]]) tb.box(tx + dx, 5, tz + dz, 0.3, 10, 0.3, PAL.woodDark, 0, 8);
  tb.cyl(tx, 10, tz, 3.6, 3.6, 5, 10, 0xb8946a, true);
  tb.cyl(tx, 15, tz, 3.9, 0, 2.2, 10, 0x8a4a2c, false);
  w.signs.text(tx, 12.4, tz + 3.7, 0, 5, 1.6, 'ROUTE 66', '#f6ecd0', '#1d1a2e');
  w.addBox(tx, tz, 4.6, 4.6, 0, 10, 0, { cam: false });
  w.collectSpots.push({ x: 760, z: RAIL_Z - 12 }, { x: 724, z: RAIL_Z - 8, y: 4.6 });
}

function commsTower(w: World, x: number, z: number) {
  const y = w.terrain.h(x, z) - 0.5;
  const b = w.geo.at('world', x, z);
  const H = 42;
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const S = 6;
    for (let i = 0; i < S; i++) {
      const t = (i + 0.5) / S, k = 2.6 * (1 - t * 0.8);
      b.box(x + dx * k, y + H * t, z + dz * k, 0.22, H / S + 0.2, 0.22, i % 2 ? PAL.red : PAL.white, 0, 12);
    }
  }
  for (let i = 1; i < 7; i++) {
    const k = 2.6 * (1 - (i / 7) * 0.8) * 2;
    b.box(x, y + (H * i) / 7, z, k, 0.12, k, 0x8b93a6, 0, 0);
  }
  b.cyl(x, y + H, z, 0.1, 0.03, 6, 4, PAL.white, false);
  w.geo.at('glow', x, z).blob(x, y + H + 6.2, z, 0.45, 0.45, 0.45, PAL.red, 3, 0);
  b.cyl(x + 1.2, y + H * 0.8, z, 0.9, 0.9, 0.3, 8, PAL.white, true);
  w.addBox(x, z, 4, 4, y, y + 6, 0, { cam: false });
}

export function buildDesert(w: World) {
  compound(w);
  motel(w);
  oldGas(w);
  airstrip(w);
  freightYard(w);
  commsTower(w, 876, -110);
  commsTower(w, 590, 70);
  for (const [x, z, r, h] of [[690, -350, 26, 24], [762, -330, 20, 30], [610, -400, 24, 20], [600, -250, 22, 26], [780, -92, 20, 22], [596, 152, 22, 20], [852, 180, 24, 26], [820, -330, 15, 36], [575, -300, 14, 16]])
    if (w.roads.distToRoad(x, z) > r + 6) mesa(w, x, z, r, h);
  // scatter: cacti, rocks, scrub
  const inFlat = (x: number, z: number) => FLAT_ZONES.some((f) => Math.hypot(x - f.x, z - f.z) < f.r * 0.82);
  for (let i = 0; i < 520; i++) {
    const x = w.rng.range(545, 888), z = w.rng.range(-585, 372);
    if (w.roads.distToRoad(x, z) < 5 || inFlat(x, z) || Math.abs(z - RAIL_Z) < 9 || w.inside(x, 1, z)) continue;
    const y = w.terrain.h(x, z);
    if (y < 0.02 && z > 330) continue;
    const t = w.rng.next();
    if (t < 0.42) tree(w, x, z, 'cactus', w.rng.range(0.8, 1.3), y - 0.1);
    else if (t < 0.78) rock(w, x, z, w.rng.range(0.5, 2.2), w.rng.chance(0.5) ? PAL.rock : PAL.desertDark, y - 0.1);
    else w.geo.at('world', x, z).blob(x, y + 0.3, z, 0.8, 0.45, 0.8, 0xa9a86a, i, 0.3);
  }
  // Route 66 roadside
  billboard(w, 660, -168, Math.atan2(80, -60) + Math.PI / 2, 8, { y: 0, pole: 8 });
  billboard(w, 846, -340, -Math.PI / 2, 13, { y: 0, pole: 8 });
  billboard(w, 664, 86, Math.PI / 2, 2, { y: 0, pole: 8 });
  billboard(w, 716, -508, 0.2, 12, { y: 0, pole: 8 });
  const shield = (x: number, z: number, rot: number) => w.signs.addFlat('r66', x, 0.075, z, rot, 4.4, 4.4, 128, 128, (g, W, H) => {
    g.fillStyle = '#f4f1e6';
    g.beginPath();
    g.moveTo(W * 0.1, H * 0.12);
    g.lineTo(W * 0.9, H * 0.12);
    g.quadraticCurveTo(W * 1.0, H * 0.6, W * 0.5, H * 0.95);
    g.quadraticCurveTo(0, H * 0.6, W * 0.1, H * 0.12);
    g.fill();
    g.fillStyle = '#6f7892';
    g.font = 'bold 26px Arial';
    g.textAlign = 'center';
    g.fillText('ROUTE', W / 2, H * 0.38);
    g.font = 'bold 50px Arial';
    g.fillText('66', W / 2, H * 0.74);
  });
  shield(750, -182.6, 0);
  shield(860 + 2.6, -340, Math.PI / 2);
  shield(576, -120 - 2.6, 0);
  for (const [x, z, r] of [[812, -168, 0.4], [690, 60, 1.9], [588, -508, 0.2], [872, -196, 2.6]]) wreck(w, x, z, r);
  // road signs
  const sign = (x: number, z: number, rot: number, t: string) => {
    w.geo.at('world', x, z).box(x, 1.5, z, 0.14, 3, 0.14, 0x8b93a6, 0, 8);
    w.signs.text(x, 3.4, z, rot, 4.2, 1.4, t, '#4c9a5a', '#f6ecd0', true);
  };
  sign(560, -131, -Math.PI / 2, 'ROUTE 66 →');
  sign(672, -4, 1.2, 'PRIVATE ROAD');
  sign(694, 150, 1.7, 'AIRFIELD ↓');
  sign(540, 252, -Math.PI / 2, 'DESERT · NEXT 400 MI');
  w.protestSites.push({ x: 620, z: -120, r: 8, d: 'desert' });
  w.guardPosts.push({ x: 738, z: 14, rot: -Math.PI / 2, kind: 'merc' }, { x: 738, z: 26, rot: -Math.PI / 2, kind: 'merc' });
}
