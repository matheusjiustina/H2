import { TAU } from '../../core/util';
import { shade } from '../../render/geo';
import { PAL } from '../../render/materials';
import { GRID, P, SLAB_Y } from '../layout';
import { midrise, shop } from '../buildings';
import { bench, billboard, fence, flagpole, furnish, lamp, parkingLot, patch, slab, stairs, tree } from '../props';
import { dock, metro } from '../landmarks';
import type { World } from '../world';
import { blockSlab } from './common';

const PASTEL = [0xf6c9c0, 0xbfe3dc, 0xf7e2a8, 0xc9d8f0, 0xf2d0e0, 0xd6efc8];
const BOARD = 0xc9a678;
export const PIER = { x: -440, w: 30, z0: 345, z1: 440, endX0: -486, endX1: -394, endZ1: 500, y: 1.3 };

function artDeco(w: World, x: number, z: number, bw: number, bd: number, floors: number, col: number, name: string) {
  const top = midrise(w, x, z, bw, bd, { wall: col, trim: PAL.white, floors, shop: 0x3fa7c4, lit: 0.45, roof: false, winW: 2.2 });
  const b = w.geo.at('world', x, z);
  // rounded corner fins + rooftop sign
  b.box(x, top / 2 + 2, z + bd / 2 + 0.4, 3, top + 4, 0.8, PAL.white, 0, 8);
  b.box(x, top + 4.6, z + bd / 2 + 0.4, 1, 1.4, 0.5, shade(col, 0.8), 0, 8);
  w.signs.text(x, top + 1.8, z + bd / 2 + 0.85, 0, Math.min(bw - 4, 16), 2.2, name, '#f6ecd0', '#d43a34');
  for (const dx of [-bw / 2 + 2, bw / 2 - 2]) tree(w, x + dx, z + bd / 2 + 3, 'palm');
}

function umbrella(w: World, x: number, z: number, c: number) {
  const y = w.terrain.h(x, z);
  const b = w.geo.at('world', x, z);
  b.cyl(x, y, z, 0.05, 0.05, 2.2, 4, PAL.white, false);
  b.cyl(x, y + 1.9, z, 1.7, 0, 0.6, 8, c, false);
  b.box(x + 1.2, y + 0.04, z + 0.4, 0.9, 0.04, 2, w.rng.pick([0xf6ecd0, 0xf2a0a8, 0x8cc3cb, 0xf2c94c]), 0.3, 8);
}

function lifeguard(w: World, x: number, z: number) {
  const y = w.terrain.h(x, z);
  const b = w.geo.at('world', x, z);
  for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [1.2, 1.2], [-1.2, 1.2]]) b.box(x + dx, y + 1.1, z + dz, 0.16, 2.2, 0.16, PAL.white, 0, 8);
  b.box(x, y + 2.3, z, 3.2, 0.2, 3.2, PAL.white, 0, 0);
  b.box(x, y + 3.3, z - 0.4, 2.4, 1.8, 2.2, PAL.red, 0, 8);
  b.gable(x, y + 4.2, z - 0.4, 2.8, 2.6, 0.8, PAL.white, 0);
  stairs(w, x, z + 3, Math.PI, 1.2, 2.8, y, y + 2.4, PAL.wood);
  w.addBox(x, z, 3.2, 3.2, y + 2.0, y + 2.4, 0, { cam: false });
  w.collectSpots.push({ x, z: z + 1, y: y + 2.4 });
}

function ferrisWheel(w: World, x: number, z: number, y0: number) {
  const b = w.geo.at('world', x, z);
  const R = 17, hub = y0 + R + 3.5;
  // A-frame supports
  for (const s of [-1, 1])
    for (const d of [-1, 1]) {
      const ax = x + d * 9, az = z + s * 2.2;
      const len = Math.hypot(9, hub - y0);
      const ang = Math.atan2(d * 9, hub - y0);
      // slanted leg as a thin rotated box approximated by segments
      const S = 6;
      for (let i = 0; i < S; i++) {
        const t = (i + 0.5) / S;
        b.box(ax - d * 9 * t, y0 + (hub - y0) * t, az, 0.7, len / S + 0.4, 0.5, PAL.white, 0, 0);
      }
      void ang;
    }
  b.box(x, hub, z, 1.4, 1.4, 6, PAL.red, 0, 0);
  w.addBox(x, z, 20, 5, y0 - 0.5, y0 + 1.2, 0, { cam: false });
  // The rotating rim, spokes and gondolas are dynamic meshes (see dynamic.ts)
  w.ferris = { x, y: hub, z, r: R };
}

function coaster(w: World, x0: number, x1: number, z: number) {
  const b = w.geo.at('world', (x0 + x1) / 2, z);
  const y = (x: number) => w.terrain.h(x, z);
  const N = 40;
  const f = (t: number) => 4 + 7 * Math.abs(Math.sin(t * Math.PI * 3)) * (1 - t * 0.4);
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    const xa = x0 + (x1 - x0) * t0, xb = x0 + (x1 - x0) * t1;
    const ya = y(xa) + f(t0), yb = y(xb) + f(t1);
    for (const dz of [-0.6, 0.6]) {
      b.quad(xa, ya, z + dz - 0.1, xa, ya, z + dz + 0.1, xb, yb, z + dz + 0.1, xb, yb, z + dz - 0.1, PAL.red);
      b.quad(xa, ya - 0.15, z + dz + 0.1, xa, ya, z + dz + 0.1, xb, yb, z + dz + 0.1, xb, yb - 0.15, z + dz + 0.1, shade(PAL.red, 0.8));
      b.quad(xb, yb - 0.15, z + dz - 0.1, xb, yb, z + dz - 0.1, xa, ya, z + dz - 0.1, xa, ya - 0.15, z + dz - 0.1, shade(PAL.red, 0.8));
    }
    if (i % 2 === 0) {
      b.box(xa, (y(xa) + ya) / 2, z, 0.2, ya - y(xa), 0.2, PAL.white, 0, 12);
      b.box(xa, ya - 0.1, z, 0.12, 0.12, 1.5, PAL.white, 0, 0);
    }
  }
  fence(w, x0 - 2, z - 3, x1 + 2, z - 3, 'chain', 1.6, y((x0 + x1) / 2));
  fence(w, x0 - 2, z + 3, x1 + 2, z + 3, 'chain', 1.6, y((x0 + x1) / 2));
}

export function buildBeach(w: World) {
  const { xs, zs } = GRID.beach;
  const names = ['THE FLAMINGO', 'OCEAN BREEZE', 'HOTEL COVFEFE', 'SUNSET INN', 'THE COLONNADE'];
  for (let i = 0; i < xs.length - 1; i++) {
    const s = blockSlab(xs, zs, i, 0);
    slab(w, s);
    furnish(w, s, { trees: 'palm', treeGap: 15, lamps: 32 });
    const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
    if (i === 0) {
      artDeco(w, s.x0 + 30, cz, 44, 30, 7, PASTEL[0], names[0]);
      artDeco(w, s.x1 - 34, cz, 44, 30, 5, PASTEL[1], names[1]);
      parkingLot(w, { x0: cx - 12, z0: s.z0 + 8, x1: cx + 6, z1: s.z1 - 8 }, false);
    } else if (i === 1) {
      // beach bungalow safehouse, surf shops, parking
      const b = w.geo.at('world', P.safeBeach.x, P.safeBeach.z);
      b.box(P.safeBeach.x, SLAB_Y + 2, P.safeBeach.z, 14, 4, 10, 0xbfe3dc, 0, 8);
      b.gable(P.safeBeach.x, SLAB_Y + 4, P.safeBeach.z, 15, 11.4, 2.2, 0xf6c9c0, 0, 0xbfe3dc);
      b.wallQuad(P.safeBeach.x - 0.7, SLAB_Y + 0.1, P.safeBeach.z + 5.1, 1, 0, 1.4, 2.4, PAL.gold);
      w.addBox(P.safeBeach.x, P.safeBeach.z, 14, 10, 0, SLAB_Y + 5);
      flagpole(w, P.safeBeach.x + 9, P.safeBeach.z + 6, 7);
      w.interacts.push({ id: 'safe-beach', kind: 'safehouse', x: P.safeBeach.x, y: SLAB_Y, z: P.safeBeach.z + 7, r: 3, label: 'Hide out at the beach bungalow', data: 'beach' });
      w.zones.push({ id: 'safe-beach', kind: 'safe', rect: { x0: P.safeBeach.x - 9, z0: P.safeBeach.z - 6, x1: P.safeBeach.x + 9, z1: P.safeBeach.z + 10 } });
      shop(w, s.x0 + 22, cz + 8, 24, 14, 5, 0, PASTEL[2], 0x3fa7c4, 'SURF · SUN · SELFIES', '#3fa7c4', '#f6ecd0');
      shop(w, s.x0 + 50, cz + 8, 20, 14, 5, 0, PASTEL[4], PAL.red, 'TACO LIBERTY', '#f2c94c', '#1d1a2e');
      parkingLot(w, { x0: s.x1 - 56, z0: s.z0 + 6, x1: s.x1 - 8, z1: s.z0 + 30 }, true);
      parkingLot(w, { x0: s.x0 + 8, z0: s.z0 + 5, x1: s.x0 + 64, z1: s.z0 + 20 }, true, 'moto');
    } else if (i === 2) {
      artDeco(w, s.x0 + 34, cz, 46, 30, 8, PASTEL[3], names[2]);
      metro(w, 'beach', 'LIBERTY BEACH', P.metroBeach.x, P.metroBeach.z, Math.PI / 2);
      artDeco(w, s.x1 - 28, cz, 36, 30, 4, PASTEL[5], names[3]);
    } else if (i === 3) {
      for (let k = 0; k < 4; k++) shop(w, s.x0 + 20 + k * 22, s.z1 - 14, 20, 14, 4.6, 0, PASTEL[(k + 2) % 6], [PAL.red, 0x3fa7c4, PAL.mustard, PAL.green][k], ['ICE CREAM', 'BIKINI BOTTOMS', 'FREEDOM FRIES', 'T-SHIRTS 3 FOR $10'][k]);
      parkingLot(w, { x0: s.x0 + 8, z0: s.z0 + 6, x1: s.x1 - 50, z1: s.z0 + 30 }, true);
      artDeco(w, s.x1 - 26, s.z0 + 20, 36, 24, 6, PASTEL[0], names[4]);
    } else {
      shop(w, cx - 20, cz + 6, 26, 16, 5, 0, 0xf6ecd0, PAL.navy, 'BOAT & JET-SKI RENTALS', '#2f5fa8', '#f6ecd0');
      parkingLot(w, { x0: cx + 2, z0: s.z0 + 8, x1: s.x1 - 8, z1: s.z1 - 8 }, false);
      billboard(w, s.x0 + 14, s.z0 + 10, Math.PI, 9, { pole: 8 });
    }
  }
  // west lot: palms + billboard
  for (let k = 0; k < 9; k++) tree(w, w.rng.range(-822, -772), w.rng.range(250, 316), 'palm', 1, 0);
  billboard(w, -796, 282, Math.PI / 2, 9, { y: 0, pole: 9 });

  // ---- boardwalk
  const bw = { x0: -826, z0: 331, x1: -36, z1: 345 };
  slab(w, bw, { top: BOARD, joints: false });
  for (let x = bw.x0 + 2; x < bw.x1; x += 2) w.geo.at('decal', x, 338).flat(x, SLAB_Y + 0.012, 338, 0.07, 13.6, 0xa98a62);
  for (let x = bw.x0 + 10; x < bw.x1 - 6; x += 15) {
    if (Math.abs(x - PIER.x) < 20) continue;
    tree(w, x, 343.4, 'palm');
    if ((x | 0) % 2 === 0) bench(w, x + 5, 343, Math.PI);
    if ((x | 0) % 3 === 0) lamp(w, x + 8, 332.2, 0);
  }
  // food stands
  const stands: [number, string, number][] = [[-760, 'HOT DOGS', PAL.red], [-640, 'LEMONADE', PAL.mustard], [-540, 'COTTON CANDY', 0xf2a0a8], [-360, 'FUNNEL CAKE', PAL.orange], [-250, 'SNOW CONES', 0x3fa7c4], [-130, 'CORN DOGS', PAL.green]];
  for (const [x, name, c] of stands) {
    const b = w.geo.at('world', x, 336);
    b.box(x, SLAB_Y + 1.3, 335, 3.6, 2.6, 2.6, 0xf6ecd0, 0, 8);
    b.box(x, SLAB_Y + 2.9, 335.6, 4.4, 0.2, 4, c, 0, 0, PAL.white);
    b.box(x, SLAB_Y + 1.1, 336.5, 3.6, 0.15, 0.6, PAL.wood, 0, 0);
    w.signs.text(x, SLAB_Y + 3.6, 336.3, 0, 4, 0.9, name, '#f6ecd0', '#d43a34', true);
    w.addBox(x, 335, 3.6, 2.6, 0, SLAB_Y + 2.8, 0, { cam: false });
  }
  // ---- sand life
  const cols = [PAL.red, 0x3fa7c4, PAL.mustard, 0xf2a0a8, PAL.white, PAL.green, PAL.orange];
  for (let k = 0; k < 90; k++) {
    const x = w.rng.range(-810, -50), z = w.rng.range(352, 400);
    if (Math.abs(x - PIER.x) < 26 || (Math.abs(x - P.stage.x) < 22 && z < 392) || (x > -570 && x < -470 && z < 378) || Math.abs(x - P.boatRental.x) < 8) continue;
    umbrella(w, x, z, w.rng.pick(cols));
  }
  for (const x of [-730, -600, -330, -150]) lifeguard(w, x, 392);
  // volleyball
  {
    const x = -280, z = 372, y = w.terrain.h(x, z);
    const b = w.geo.at('world', x, z);
    for (const dz of [-5, 5]) b.box(x, y + 1.3, z + dz, 0.14, 2.6, 0.14, PAL.dark, 0, 8);
    b.box(x, y + 2.0, z, 0.05, 1, 10, PAL.white, 0, 0);
  }
  // ---- outdoor stage
  {
    const x = P.stage.x, z = P.stage.z, y = w.terrain.h(x, z);
    const b = w.geo.at('world', x, z);
    b.box(x, y + 0.7, z, 18, 1.4, 11, 0x3a3550, 0, 8, 0x5a5670);
    w.addBox(x, z, 18, 11, y - 1, y + 1.4);
    stairs(w, x - 10.5, z + 2, Math.PI / 2, 4, 3, y, y + 1.4, PAL.wood);
    for (const [dx, dz] of [[-8.5, -5], [8.5, -5], [-8.5, 5], [8.5, 5]]) b.box(x + dx, y + 5, z + dz, 0.4, 8, 0.4, 0x8b93a6, 0, 8);
    b.box(x, y + 9.2, z, 18.5, 0.6, 11.5, 0x4a4f66, 0, 0);
    b.box(x, y + 5, z - 5.2, 17, 7, 0.3, PAL.navy, 0, 0);
    w.signs.text(x, y + 6, z - 5.0, 0, 15, 3, 'LIBERTY BEACH LIVE', '#1e2f5c', '#f2c94c');
    for (const dx of [-7.2, 7.2]) b.box(x + dx, y + 2.6, z + 3.6, 1.6, 2.4, 1.4, PAL.ink, 0, 8);
    w.protestSites.push({ x, z: z + 16, r: 10, d: 'beach' });
    w.collectSpots.push({ x: x + 6, z: z - 2, y: y + 1.4 });
  }
  // ---- pier with amusements
  {
    const p = PIER;
    stairs(w, p.x, 349, 0, p.w - 2, 8, SLAB_Y, p.y, BOARD);
    const deck = (x0: number, z0: number, x1: number, z1: number) => {
      dock(w, { x0, z0, x1, z1 }, p.y, BOARD);
    };
    deck(p.x - p.w / 2, 353, p.x + p.w / 2, p.z1);
    deck(p.endX0, p.z1, p.endX1, p.endZ1);
    const rail = (ax: number, az: number, bx: number, bz: number) => fence(w, ax, az, bx, bz, 'wood', 1.1, p.y, PAL.white);
    rail(p.x - p.w / 2, 353, p.x - p.w / 2, p.z1);
    rail(p.x + p.w / 2, 353, p.x + p.w / 2, p.z1);
    rail(p.endX0, p.z1, p.x - p.w / 2, p.z1);
    rail(p.x + p.w / 2, p.z1, p.endX1, p.z1);
    rail(p.endX0, p.z1, p.endX0, p.endZ1);
    rail(p.endX1, p.z1, p.endX1, p.endZ1);
    rail(p.endX0, p.endZ1, p.x - 6, p.endZ1);
    rail(p.x + 6, p.endZ1, p.endX1, p.endZ1);
    for (let z = 360; z < p.z1; z += 20) {
      lamp(w, p.x - p.w / 2 + 1, z, -Math.PI / 2, p.y);
      lamp(w, p.x + p.w / 2 - 1, z + 10, Math.PI / 2, p.y);
    }
    ferrisWheel(w, P.ferris.x, P.ferris.z + 6, p.y);
    // carousel
    const cx = p.x - 30, cz = 462;
    const b = w.geo.at('world', cx, cz);
    b.cyl(cx, p.y, cz, 6, 6, 0.4, 12, PAL.red, true);
    b.cyl(cx, p.y + 0.4, cz, 0.5, 0.5, 4, 6, PAL.gold, false);
    b.cyl(cx, p.y + 4.2, cz, 6.6, 0, 2.6, 12, PAL.white, false);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      b.cyl(cx + Math.cos(a) * 4.4, p.y + 0.4, cz + Math.sin(a) * 4.4, 0.06, 0.06, 3.8, 4, PAL.gold, false);
      b.box(cx + Math.cos(a) * 4.4, p.y + 1.5, cz + Math.sin(a) * 4.4, 0.5, 0.8, 1.3, k % 2 ? 0xf6ecd0 : 0xf2a0a8, -a, 0);
      b.quad(cx + Math.cos(a) * 6.6, p.y + 4.2, cz + Math.sin(a) * 6.6, cx, p.y + 6.8, cz, cx + Math.cos(a + 0.39) * 6.6, p.y + 4.2, cz + Math.sin(a + 0.39) * 6.6, cx + Math.cos(a + 0.2) * 6.6, p.y + 4.2, cz + Math.sin(a + 0.2) * 6.6, PAL.red);
    }
    w.addBox(cx, cz, 10, 10, p.y - 0.5, p.y + 0.4, 0, { cam: false });
    // ticket booth + arcade tent
    shopOnDeck(w, p.x + 30, 456, 'TICKETS', p.y);
    shopOnDeck(w, p.x + 30, 486, 'ARCADE', p.y);
    w.signs.text(p.x, p.y + 5.4, 354, Math.PI, 18, 2.4, 'LIBERTY PIER · FUN ZONE', '#d43a34', '#f6ecd0', true);
    for (const dx of [-9.4, 9.4]) w.geo.at('world', p.x, 354).box(p.x + dx, p.y + 2.5, 354, 0.4, 5, 0.4, PAL.white, 0, 8);
    w.collectSpots.push({ x: p.x, z: p.endZ1 - 3, y: p.y }, { x: cx, z: cz + 9, y: p.y });
    w.parkSpots.push({ x: p.x, z: p.endZ1 + 5, rot: Math.PI / 2, kind: 'boat' });
  }
  coaster(w, -566, -474, 364);
  // ---- boat rental dock
  {
    const x = P.boatRental.x;
    dock(w, { x0: x - 3, z0: 396, x1: x + 3, z1: 436 }, 0.5);
    dock(w, { x0: x - 14, z0: 430, x1: x + 14, z1: 436 }, 0.5);
    stairs(w, x, 392.5, 0, 5, 7, w.terrain.h(x, 389) - 0.1, 0.5, PAL.wood);
    w.parkSpots.push({ x: x - 10, z: 425, rot: 0, kind: 'boat' }, { x: x + 10, z: 425, rot: 0, kind: 'boat' }, { x: x - 9, z: 441, rot: Math.PI / 2, kind: 'boat' });
    w.signs.text(x, 3.2, 396, Math.PI, 5, 1.2, 'BOAT RENTAL', '#2f5fa8', '#f6ecd0', true);
    w.geo.at('world', x, 396).box(x - 2.4, 1.6, 396, 0.2, 3.2, 0.2, PAL.wood, 0, 8);
    w.geo.at('world', x, 396).box(x + 2.4, 1.6, 396, 0.2, 3.2, 0.2, PAL.wood, 0, 8);
    w.interacts.push({ id: 'dock-beach', kind: 'dock', x, y: 0.5, z: 433, r: 4, label: 'Liberty Beach boat rental', data: 'beach' });
  }
  patch(w, { x0: -60, z0: 331, x1: -36, z1: 345 }, BOARD, SLAB_Y + 0.02);
  w.protestSites.push({ x: -440, z: 325, r: 9, d: 'beach' }, { x: -600, z: 240, r: 9, d: 'beach' });
}

function shopOnDeck(w: World, x: number, z: number, name: string, y: number) {
  const b = w.geo.at('world', x, z);
  b.box(x, y + 1.6, z, 9, 3.2, 7, 0xf6ecd0, 0, 8);
  for (let k = 0; k < 5; k++) b.box(x - 3.6 + k * 1.8, y + 1.6, z, 0.9, 3.22, 7.04, PAL.red, 0, 12);
  b.pyramid(x, y + 3.2, z, 10, 8, 2.4, PAL.red);
  w.signs.text(x - 4.6, y + 2.6, z, -Math.PI / 2, 5, 1, name, '#f6ecd0', '#d43a34');
  w.addBox(x, z, 9, 7, y - 0.5, y + 3.2);
}
