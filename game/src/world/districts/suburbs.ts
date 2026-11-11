import { Rect } from '../../core/util';
import { PAL } from '../../render/materials';
import { GRID, P, SLAB_Y } from '../layout';
import { house, midrise, shop } from '../buildings';
import { bench, fence, flagpole, furnish, lamp, line, mailbox, parkingLot, patch, powerLine, slab, tree } from '../props';
import type { World } from '../world';
import { blockSlab, HOUSE_ROOFS, HOUSE_WALLS } from './common';

function pool(w: World, x: number, z: number) {
  const b = w.geo.at('world', x, z);
  patch(w, { x0: x - 3.6, z0: z - 2.6, x1: x + 3.6, z1: z + 2.6 }, 0xe9dfc4, SLAB_Y + 0.03);
  patch(w, { x0: x - 3, z0: z - 2, x1: x + 3, z1: z + 2 }, 0x5fc4e0, SLAB_Y + 0.05);
  b.box(x + 3.3, SLAB_Y + 0.5, z, 0.08, 1, 0.5, 0xcfd6dc, 0, 8);
}

function homeLot(w: World, x: number, z: number, south: boolean, lotW: number, safe = false) {
  const r = w.rng;
  const rot = south ? 0 : Math.PI;
  const dir = south ? 1 : -1;
  const wall = safe ? 0xf2e6c8 : r.pick(HOUSE_WALLS), roof = safe ? 0x8f2a30 : r.pick(HOUSE_ROOFS);
  const hx = x - dir * 2.6;
  house(w, hx, z, rot, { wall, roof });
  // driveway + front path
  const gx = hx + dir * 7.1;
  const curb = z + dir * 12.7;
  patch(w, { x0: gx - 2.1, x1: gx + 2.1, z0: Math.min(z + dir * 3.7, curb), z1: Math.max(z + dir * 3.7, curb) }, 0xd6ccb4, SLAB_Y + 0.03);
  patch(w, { x0: hx - 0.6, x1: hx + 0.6, z0: Math.min(z + dir * 6, curb - dir * 2.6), z1: Math.max(z + dir * 6, curb - dir * 2.6) }, 0xe9dfc4, SLAB_Y + 0.03);
  if (r.chance(0.5) || safe) w.parkSpots.push({ x: gx, z: z + dir * 8.2, rot: south ? Math.PI : 0, kind: safe ? 'muscle' : undefined });
  mailbox(w, hx + dir * 3.4, curb - dir * 3.4, rot + Math.PI / 2);
  // front yard fence + yard decor
  const fk = r.pick(['picket', 'picket', 'hedge', 'none']);
  const fz = curb - dir * 3.3;
  if (fk !== 'none') {
    const gaps = [[hx - 1.3, hx + 1.3], [gx - 2.7, gx + 2.7]].sort((p, q) => p[0] - q[0]);
    let cur = x - lotW / 2 + 0.8;
    const end = x + lotW / 2 - 0.8;
    const fh = fk === 'hedge' ? 0.8 : 0.95;
    for (const [g0, g1] of gaps) {
      if (g0 - cur > 0.8) fence(w, cur, fz, g0, fz, fk as 'picket' | 'hedge', fh);
      cur = Math.max(cur, g1);
    }
    if (end - cur > 0.8) fence(w, cur, fz, end, fz, fk as 'picket' | 'hedge', fh);
  }
  if (r.chance(0.7)) tree(w, x - dir * (lotW / 2 - 3.5), z + dir * 8.5, r.chance(0.5) ? 'green' : 'autumn', 1.05);
  if (safe) flagpole(w, hx - dir * 6, z + dir * 8, 6.5);
  // back yard
  const by = z - dir * 9;
  if (r.chance(0.3)) pool(w, x, by);
  else if (r.chance(0.6)) tree(w, x + r.range(-5, 5), by, 'green', 1.2);
  fence(w, x - lotW / 2, z - dir * 4.5, x - lotW / 2, z - dir * 14.5, 'wood', 1.5);
}

function houses(w: World, s: Rect, safeAt = -1) {
  slab(w, s, { inner: PAL.lawn, innerInset: 2.4 });
  furnish(w, s, { trees: w.rng.chance(0.5) ? 'green' : 'autumn', treeGap: 22, lamps: 44, extras: false, sides: 12 });
  const n = 4;
  const lotW = (s.x1 - s.x0 - 6) / n;
  for (let i = 0; i < n; i++) {
    const x = s.x0 + 3 + lotW * (i + 0.5);
    homeLot(w, x, s.z0 + 15.2, false, lotW, false);
    homeLot(w, x, s.z1 - 15.2, true, lotW, safeAt === i);
  }
  fence(w, s.x0 + 3, (s.z0 + s.z1) / 2, s.x1 - 3, (s.z0 + s.z1) / 2, 'wood', 1.6);
}

function diner(w: World, x: number, z: number) {
  const b = w.geo.at('world', x, z);
  b.box(x, SLAB_Y + 0.35, z, 25, 0.7, 9.6, 0x9a9fb0, 0, 8);
  b.box(x, SLAB_Y + 2.3, z, 24, 3.2, 8.6, 0xcfd6dc, 0, 8);
  b.box(x, SLAB_Y + 1.5, z, 24.2, 0.5, 8.8, PAL.red, 0, 12);
  b.box(x, SLAB_Y + 4.1, z, 25, 0.5, 9.6, PAL.red, 0, 0, 0xcfd6dc);
  b.cyl(x - 12, SLAB_Y + 0.7, z, 4.3, 4.3, 3.2, 10, 0xcfd6dc, true);
  for (let i = 0; i < 7; i++) {
    b.wallQuad(x - 10.4 + i * 3, SLAB_Y + 2.0, z + 4.42, 1, 0, 2.5, 1.5, PAL.dark);
    w.geo.at('glow', x, z).wallQuad(x - 10.25 + i * 3, SLAB_Y + 2.1, z + 4.5, 1, 0, 2.2, 1.3, PAL.windowLight);
  }
  b.wallQuad(x + 9.4, SLAB_Y + 0.7, z + 4.42, 1, 0, 1.6, 2.6, PAL.red);
  w.addBox(x, z, 25, 9.6, 0, SLAB_Y + 4.4);
  // roof sign
  b.box(x, SLAB_Y + 6.2, z + 2, 15, 3.2, 0.5, PAL.dark, 0, 0);
  w.signs.text(x, SLAB_Y + 6.2, z + 2.3, 0, 14, 2.8, 'LIBERTY DINER', '#d43a34', '#f6ecd0');
  w.signs.text(x, SLAB_Y + 6.2, z + 1.7, Math.PI, 14, 2.8, 'EAT HERE · GET GAS', '#f6ecd0', '#d43a34');
  for (const dx of [-6, 6]) b.box(x + dx, SLAB_Y + 4.5, z + 2, 0.25, 0.6, 0.25, PAL.dark, 0, 12);
  w.interacts.push({ id: 'diner', kind: 'shop', x: x + 10.2, y: SLAB_Y, z: z + 6, r: 2.6, label: 'Order a Tremendous Burger ($15, restores health)', data: 'burger' });
}

function gasStation(w: World, x: number, z: number) {
  const b = w.geo.at('world', x, z);
  patch(w, { x0: x - 16, z0: z - 4, x1: x + 16, z1: z + 16 }, PAL.asphaltDark, SLAB_Y + 0.025);
  b.box(x, SLAB_Y + 5.4, z + 7, 20, 0.7, 10, PAL.white, 0, 0, 0xd9d6cc);
  b.box(x, SLAB_Y + 5.4, z + 7, 20.2, 0.3, 10.2, PAL.red, 0, 12);
  for (const [dx, dz] of [[-8, 4], [8, 4], [-8, 10], [8, 10]]) {
    b.box(x + dx, SLAB_Y + 2.5, z + dz, 0.45, 5, 0.45, 0xd9d6cc, 0, 12);
    w.addBox(x + dx, z + dz, 0.5, 0.5, 0, SLAB_Y + 5, 0, { cam: false });
  }
  for (const dx of [-4.5, 4.5]) {
    b.box(x + dx, SLAB_Y + 0.12, z + 7, 2.2, 0.24, 5.2, 0xcfc8b8, 0, 8);
    for (const dz of [-1.4, 1.4]) {
      b.box(x + dx, SLAB_Y + 1.1, z + 7 + dz, 0.9, 1.8, 0.7, PAL.red, 0, 8, PAL.white);
      w.addBox(x + dx, z + 7 + dz, 0.9, 0.7, 0, SLAB_Y + 2, 0, { cam: false });
    }
  }
  shop(w, x, z - 9, 16, 9, 4, 0, PAL.white, PAL.blue, 'GAS · SNACKS · LOTTO', '#2f5fa8', '#f6ecd0');
  // price pylon
  b.box(x + 15, SLAB_Y + 3.4, z + 15, 0.4, 6.8, 0.4, 0x4a4f66, 0, 8);
  w.signs.text(x + 15, SLAB_Y + 7.6, z + 15, 0, 4.4, 2.6, 'GAS $1.776', '#d43a34', '#f6ecd0', true);
  w.addBox(x + 15, z + 15, 0.5, 0.5, 0, SLAB_Y + 7, 0, { cam: false });
  w.parkSpots.push({ x: x - 2, z: z + 7, rot: Math.PI / 2 }, { x: x + 7, z: z + 7, rot: -Math.PI / 2, kind: 'pickup' });
}

function court(w: World, x: number, z: number) {
  patch(w, { x0: x - 8, z0: z - 13, x1: x + 8, z1: z + 13 }, 0xc9785a, SLAB_Y + 0.03);
  const y = SLAB_Y + 0.045;
  for (const [ax, az, bx, bz] of [[-7.5, -12.5, 7.5, -12.5], [-7.5, 12.5, 7.5, 12.5], [-7.5, -12.5, -7.5, 12.5], [7.5, -12.5, 7.5, 12.5], [-7.5, 0, 7.5, 0]]) line(w, x + ax, z + az, x + bx, z + bz, 0.14, PAL.line, y);
  const b = w.geo.at('world', x, z);
  for (const s of [-1, 1]) {
    b.box(x, SLAB_Y + 1.7, z + s * 13.4, 0.2, 3.4, 0.2, PAL.dark, 0, 8);
    b.box(x, SLAB_Y + 3.4, z + s * 12.8, 1.8, 1.2, 0.1, PAL.white, 0, 0);
    b.cyl(x, SLAB_Y + 3.0, z + s * 12.3, 0.3, 0.3, 0.06, 6, PAL.orange, false);
    w.addBox(x, z + s * 13.4, 0.3, 0.3, 0, SLAB_Y + 3.4, 0, { cam: false });
  }
}

function playground(w: World, x: number, z: number) {
  const b = w.geo.at('world', x, z);
  patch(w, { x0: x - 7, z0: z - 6, x1: x + 7, z1: z + 6 }, 0xe2c27a, SLAB_Y + 0.03);
  // swing set
  for (const dx of [-3, 3]) {
    b.box(x + dx, SLAB_Y + 1.5, z - 3, 0.15, 3, 0.15, PAL.red, 0, 8);
  }
  b.box(x, SLAB_Y + 3, z - 3, 6.3, 0.15, 0.15, PAL.red, 0, 0);
  for (const dx of [-1.4, 1.4]) {
    b.box(x + dx, SLAB_Y + 1.9, z - 3, 0.04, 2.2, 0.04, PAL.dark, 0, 12);
    b.box(x + dx, SLAB_Y + 0.75, z - 3, 0.6, 0.06, 0.3, PAL.blue, 0, 0);
  }
  // slide
  b.box(x + 3, SLAB_Y + 1.1, z + 3, 1.4, 2.2, 1.4, PAL.mustard, 0, 8);
  b.quad(x + 2.3, SLAB_Y + 2.1, z + 3.6, x - 1.8, SLAB_Y + 0.1, z + 3.6, x - 1.8, SLAB_Y + 0.1, z + 2.4, x + 2.3, SLAB_Y + 2.1, z + 2.4, PAL.blue);
  w.addBox(x + 3, z + 3, 1.4, 1.4, 0, SLAB_Y + 2.2, 0, { cam: false });
}

function schoolBus(w: World, x: number, z: number, rot: number) {
  const b = w.geo.at('world', x, z);
  b.box(x, SLAB_Y + 1.75, z, 2.6, 2.5, 10, 0xf2b632, rot, 8);
  b.box(x, SLAB_Y + 2.2, z, 2.66, 0.8, 8.6, PAL.dark, rot, 12);
  b.box(x, SLAB_Y + 0.75, z, 2.7, 0.3, 10.1, PAL.dark, rot, 12);
  const cs = Math.cos(rot), sn = Math.sin(rot);
  for (const lz of [-3.4, 3.2]) for (const lx of [-1.25, 1.25]) b.cyl(x + lx * cs + lz * sn, SLAB_Y + 0.02, z - lx * sn + lz * cs, 0.5, 0.5, 0.9, 8, PAL.ink, true);
  w.addBox(x, z, 2.6, 10, 0, SLAB_Y + 3, rot);
}

export function buildSuburbs(w: World) {
  const { xs, zs } = GRID.suburbs;
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < zs.length - 1; j++) {
      const s = blockSlab(xs, zs, i, j);
      const key = `${i},${j}`;
      if (key === '0,0') {
        slab(w, s, { inner: PAL.lawn, innerInset: 2.4 });
        furnish(w, s, { trees: 'green', treeGap: 22, lamps: 40 });
        diner(w, P.diner.x, P.diner.z + 4);
        parkingLot(w, { x0: s.x0 + 8, z0: s.z1 - 26, x1: s.x1 - 8, z1: s.z1 - 6 }, true);
        house(w, s.x0 + 18, s.z0 + 16, Math.PI, { wall: 0xd8e2c4, roof: 0x4f5a6e });
        house(w, s.x1 - 28, s.z0 + 16, Math.PI, { wall: 0xf0cfa8, roof: 0x7a4a3c });
      } else if (key === '1,0') {
        slab(w, s, { inner: PAL.lawn, innerInset: 2.4 });
        furnish(w, s, { trees: 'green', treeGap: 22, lamps: 40 });
        gasStation(w, P.gasStation.x, P.gasStation.z - 6);
        house(w, s.x0 + 22, s.z1 - 16, 0, { wall: 0xc9d8e6, roof: 0x5a6a5c });
        house(w, s.x1 - 30, s.z1 - 16, 0, { wall: 0xe8c9c0, roof: 0x6e5a48 });
      } else if (key === '2,1') {
        // elementary school
        slab(w, s, { inner: PAL.lawn, innerInset: 2.4 });
        furnish(w, s, { trees: 'green', treeGap: 20, lamps: 40 });
        const x = (s.x0 + s.x1) / 2, z = s.z0 + 22;
        const top = midrise(w, x, z, 62, 20, { wall: PAL.brick, trim: 0xf6ecd0, floors: 2, shop: null, lit: 0.1, roof: false });
        w.signs.text(x, top - 1.6, z + 10.3, 0, 30, 1.6, 'G. WASHINGTON ELEMENTARY · HOME OF THE EAGLES', '#f6ecd0', '#8f332f');
        flagpole(w, x - 20, z + 16, 9);
        court(w, s.x1 - 16, s.z1 - 20);
        playground(w, s.x0 + 16, s.z1 - 18);
        for (let k = 0; k < 3; k++) schoolBus(w, x - 12 + k * 6.5, s.z1 - 12, 0.02 * k);
        patch(w, { x0: x - 18, z0: s.z1 - 20, x1: x + 8, z1: s.z1 - 3 }, PAL.asphaltDark, SLAB_Y + 0.025);
        w.collectSpots.push({ x: x + 20, z: z, y: top });
      } else if (key === '1,2') {
        // neighbourhood park
        slab(w, s, { inner: PAL.lawn, innerInset: 2.4 });
        furnish(w, s, { trees: 'green', treeGap: 16, lamps: 36 });
        const cx = P.park.x, cz = P.park.z;
        patch(w, { x0: cx - 16, z0: cz - 9, x1: cx + 4, z1: cz + 9 }, 0x6fbfd6, SLAB_Y + 0.03);
        patch(w, { x0: s.x0 + 4, z0: cz + 14, x1: s.x1 - 4, z1: cz + 17 }, 0xe9dfc4, SLAB_Y + 0.03);
        patch(w, { x0: cx + 9, z0: s.z0 + 4, x1: cx + 12, z1: s.z1 - 4 }, 0xe9dfc4, SLAB_Y + 0.03);
        court(w, s.x1 - 16, cz - 16);
        playground(w, s.x1 - 16, cz + 26);
        for (let k = 0; k < 16; k++) {
          const tx = w.rng.range(s.x0 + 6, cx + 6), tz = w.rng.range(s.z0 + 6, s.z1 - 6);
          if (Math.abs(tx - (cx - 6)) < 12 && Math.abs(tz - cz) < 11) continue;
          tree(w, tx, tz, w.rng.chance(0.6) ? 'green' : 'autumn', 1.25);
        }
        // gazebo
        const b = w.geo.at('world', cx - 30, cz + 26);
        b.cyl(cx - 30, SLAB_Y, cz + 26, 4, 4, 0.5, 8, 0xf6ecd0, true);
        for (let k = 0; k < 8; k++) b.cyl(cx - 30 + Math.cos(k * 0.785) * 3.6, SLAB_Y + 0.5, cz + 26 + Math.sin(k * 0.785) * 3.6, 0.12, 0.12, 2.8, 4, PAL.white, false);
        b.cyl(cx - 30, SLAB_Y + 3.3, cz + 26, 4.6, 0, 2, 8, 0x8f3f36, false);
        w.addBox(cx - 30, cz + 26, 6, 6, 0, SLAB_Y + 0.5, 0, { cam: false });
        for (const [dx, dz, r] of [[8, -6, Math.PI / 2], [8, 6, Math.PI / 2], [-6, 12, 0]]) bench(w, cx + dx, cz + dz, r);
        w.collectSpots.push({ x: cx - 30, z: cz + 26, y: SLAB_Y + 0.5 });
      } else if (key === '3,2') {
        // strip mall
        slab(w, s);
        furnish(w, s, { trees: 'green', treeGap: 20, lamps: 34 });
        const names = ['NAILS & TAXES', 'PIZZA', 'VAPE & BAKE', 'DOLLAR PALACE', 'RED HAT OUTLET', 'BIG MIKE TV'];
        const cols = [0xf6ecd0, 0xe8c9c0, 0xd8e2c4, 0xf2e6c8, 0xf0cfa8, 0xc9d8e6];
        const aw = [PAL.red, PAL.green, PAL.purple, PAL.mustard, PAL.red, PAL.blue];
        for (let k = 0; k < 6; k++) shop(w, s.x0 + 14 + k * 13.2, s.z0 + 13, 13, 14, 5, 0, cols[k], aw[k], names[k]);
        parkingLot(w, { x0: s.x0 + 8, z0: s.z0 + 26, x1: s.x1 - 8, z1: s.z1 - 8 }, true);
        const b = w.geo.at('world', s.x1 - 6, s.z1 - 6);
        b.box(s.x1 - 6, SLAB_Y + 4, s.z1 - 6, 0.5, 8, 0.5, 0x4a4f66, 0, 8);
        w.signs.text(s.x1 - 6, SLAB_Y + 9.4, s.z1 - 6, 0, 7, 3, 'MAPLE PLAZA', '#2f8f86', '#f6ecd0', true);
        w.addBox(s.x1 - 6, s.z1 - 6, 0.6, 0.6, 0, SLAB_Y + 8, 0, { cam: false });
      } else houses(w, s, key === '0,3' ? 1 : -1);
    }
  // the safehouse (block 0,3, south row, lot 1)
  w.interacts.push({ id: 'safe-suburb', kind: 'safehouse', x: P.safeSuburb.x, y: SLAB_Y, z: P.safeSuburb.z + 7, r: 3, label: 'Hide out at the safehouse', data: 'suburbs' });
  w.zones.push({ id: 'safe-suburb', kind: 'safe', rect: { x0: P.safeSuburb.x - 8, z0: P.safeSuburb.z - 6, x1: P.safeSuburb.x + 8, z1: P.safeSuburb.z + 10 } });
  // overhead wires along the residential streets
  for (const z of [-30, 60, 150]) {
    const pts: number[][] = [];
    for (let i = 0; i < xs.length - 1; i++) {
      const s = blockSlab(xs, zs, i, 1);
      pts.push([s.x0 + 5, z + 5.6], [(s.x0 + s.x1) / 2, z + 5.6], [s.x1 - 5, z + 5.6]);
    }
    powerLine(w, pts);
  }
  w.protestSites.push({ x: -550, z: 60, r: 9, d: 'suburbs' }, { x: -445, z: -30, r: 8, d: 'suburbs' }, { x: -655, z: 150, r: 8, d: 'suburbs' });
  lamp(w, -700, -62, 0);
}
