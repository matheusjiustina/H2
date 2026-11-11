import { clamp, inset, Rect } from '../../core/util';
import { PAL } from '../../render/materials';
import { GARAGE, GRID, P, SLAB_Y, TUNNEL } from '../layout';
import { midrise, shop, tower } from '../buildings';
import { bench, billboard, flagpole, furnish, lamp, line, parkingLot, patch, slab, tree } from '../props';
import { fountain, garage, goldenTower, goldStatue, metro, parkingStructure } from '../landmarks';
import type { World } from '../world';
import { AWN, blockSlab, GLASS, Lot, splitLots, WALLS } from './common';

let adN = 0;

export function cityLot(w: World, L: Lot, tall: number, maxH = 120) {
  const r = w.rng;
  const t = r.next();
  if (t < 0.07) {
    // pocket park
    patch(w, { x0: L.x - L.w / 2 + 1, z0: L.z - L.d / 2 + 1, x1: L.x + L.w / 2 - 1, z1: L.z + L.d / 2 - 1 }, PAL.lawn);
    for (let i = 0; i < 5; i++) tree(w, L.x + r.range(-L.w / 2 + 3, L.w / 2 - 3), L.z + r.range(-L.d / 2 + 3, L.d / 2 - 3), r.chance(0.6) ? 'autumn' : 'green', 1.1);
    bench(w, L.x, L.z, L.rot);
    w.collectSpots.push({ x: L.x, z: L.z });
    return;
  }
  if (r.chance(0.18 + 0.7 * tall)) {
    const h = Math.min(maxH, r.range(38, 58) + tall * r.range(15, 70));
    tower(w, L.x, L.z, L.w - 2.5, L.d - 2.5, h, {
      glass: r.pick(GLASS), crown: r.pick(['flat', 'step', 'spire', 'slant', 'flat', 'step'] as const),
      base: r.pick([PAL.stone, PAL.stoneDark, 0xb9ad98, 0xd8cba8]),
    });
    return;
  }
  const floors = r.int(4, 8) + Math.round(tall * 3);
  const d = L.d - (r.chance(0.4) ? 4 : 0);
  const top = midrise(w, L.x, L.z + (L.rot === 0 ? 1 : -1) * (L.d - d) / 2, L.w, d, { wall: r.pick(WALLS), floors, shop: r.chance(0.8) ? r.pick(AWN) : null });
  if (r.chance(0.22)) billboard(w, L.x, L.z, L.rot + (r.chance(0.5) ? 0 : Math.PI / 2), adN++, { y: top, pole: 2.2, w: 11, h: 5.5 });
}

function genericBlock(w: World, s: Rect, i: number, j: number) {
  slab(w, s);
  furnish(w, s, { trees: 'autumn', treeGap: 15 });
  const tall = clamp(1 - Math.hypot(i - 2, j - 1) / 3.1, 0, 1);
  for (const L of splitLots(inset(s, 4.4), 31, 5)) cityLot(w, L, tall);
}

function towerBlock(w: World, s: Rect) {
  slab(w, s, { top: 0xe6dcc0 });
  furnish(w, s, { trees: null, sides: 13, extras: false });
  goldenTower(w);
  const cx = P.tower.x;
  // forecourt
  patch(w, { x0: cx - 24, z0: P.tower.z + 23, x1: cx + 24, z1: s.z1 - 1 }, 0xefe3c4);
  for (const dx of [-18, -12, 12, 18]) {
    w.geo.at('world', cx, P.tower.z + 30).cyl(cx + dx, SLAB_Y, P.tower.z + 36, 1.1, 1.3, 0.9, 8, PAL.stoneDark, true);
    w.geo.at('world', cx, P.tower.z + 30).blob(cx + dx, SLAB_Y + 1.7, P.tower.z + 36, 1.2, 1.1, 1.2, 0x6fa35f, dx + 40, 0.25);
    w.addBox(cx + dx, P.tower.z + 36, 2.2, 2.2, 0, SLAB_Y + 0.9, 0, { cam: false });
  }
  for (let x = s.x0 + 3; x < s.x1; x += 4) if (Math.abs(x - cx) > 5) w.geo.at('world', x, s.z1).cyl(x, SLAB_Y, s.z1 - 1, 0.16, 0.16, 0.9, 6, PAL.goldDark, true);
  // west wing: sculpture garden; east wing: burger joint
  for (let k = 0; k < 4; k++) tree(w, s.x0 + 8 + (k % 2) * 9, s.z0 + 12 + k * 15, 'autumn', 1.15);
  shop(w, s.x1 - 13, s.z0 + 30, 16, 12, 4.4, 0, 0xf6ecd0, PAL.red, 'TREMENDOUS BURGER', '#d43a34', '#f6ecd0');
  for (let k = 0; k < 3; k++) bench(w, s.x1 - 20 + k * 6, s.z0 + 42, 0);
  tree(w, s.x1 - 8, s.z0 + 58, 'autumn');
  tree(w, s.x1 - 20, s.z0 + 62, 'autumn');
  w.guardPosts.push({ x: cx - 6, z: P.towerDoor.z - 2, rot: 0, kind: 'doorman' }, { x: cx + 6, z: P.towerDoor.z - 2, rot: 0, kind: 'doorman' });
}

function squareBlock(w: World, s: Rect) {
  const hole = { x0: GARAGE.rampX0, x1: GARAGE.rampX1, z0: GARAGE.rampZ0, z1: GARAGE.rampZ1 };
  slab(w, s, { hole, top: 0xe6dcc0 });
  patch(w, inset(s, 3.4), 0xefe3c4, SLAB_Y + 0.02, { x0: hole.x0 - 1, x1: hole.x1 + 1, z0: hole.z0 - 4, z1: hole.z1 + 1 });
  const cx = P.square.x, cz = P.square.z;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    line(w, cx + Math.cos(a) * 6, cz + Math.sin(a) * 6, cx + Math.cos(a) * 30, cz + Math.sin(a) * 30, 0.35, PAL.goldDark, SLAB_Y + 0.03);
  }
  goldStatue(w, cx, cz);
  garage(w);
  fountain(w, cx + 30, cz - 22, 5);
  fountain(w, cx + 30, cz + 24, 5);
  for (const [dx, dz] of [[-28, -30], [-14, -32], [14, -32], [-28, 30], [-14, 32], [14, 32], [42, 0], [42, -34], [42, 34]]) tree(w, cx + dx, cz + dz, 'autumn', 1.2);
  for (const [dx, dz, r] of [[-10, -14, 0], [10, -14, 0], [-10, 14, Math.PI], [10, 14, Math.PI], [18, 0, -Math.PI / 2]]) bench(w, cx + dx, cz + dz, r);
  for (const dx of [-21, -7, 7, 21]) flagpole(w, cx + dx, s.z1 - 4, 10);
  for (const [dx, dz, r] of [[-30, -36, 0], [40, -36, 0], [-30, 36, Math.PI], [40, 36, Math.PI]]) lamp(w, cx + dx, cz + dz, r);
  // digital billboards facing the square
  billboard(w, s.x1 - 5, cz - 12, -Math.PI / 2, 4, { pole: 7, w: 13, h: 6.5, both: false });
  billboard(w, s.x1 - 5, cz + 12, -Math.PI / 2, 7, { pole: 7, w: 13, h: 6.5, both: false });
  w.protestSites.push({ x: cx + 4, z: cz + 22, r: 11, d: 'downtown' });
  w.collectSpots.push({ x: cx - 30, z: cz + 34 });
}

function parkingBlock(w: World, s: Rect) {
  slab(w, s, { top: 0xd9d0b8 });
  furnish(w, s, { trees: 'autumn', treeGap: 18, sides: 14 });
  parkingStructure(w, s.x0 + 9, s.z0 + 10);
  parkingLot(w, { x0: s.x0 + 9, z0: s.z0 + 50, x1: s.x0 + 64, z1: s.z1 - 5 }, true);
  midrise(w, s.x1 - 14, s.z0 + 26, 20, 40, { wall: PAL.brick, floors: 6, shop: PAL.green });
  w.signs.text(s.x0 + 30, 2.6, s.z1 - 4.4, 0, 8, 1.4, 'PARK & HIDE', '#2f5fa8', '#f6ecd0', true);
  w.geo.at('world', s.x0 + 30, s.z1 - 4.4).box(s.x0 + 30, 1.1, s.z1 - 4.4, 0.25, 2.2, 0.25, 0x4a4f66, 0, 8);
}

function showroomBlock(w: World, s: Rect) {
  slab(w, s);
  furnish(w, s, { trees: 'autumn', treeGap: 18 });
  const x = P.showroom.x - 8, z = s.z0 + 24;
  const b = w.geo.at('world', x, z);
  b.box(x, SLAB_Y + 4.5, z, 52, 9, 34, 0x9fd0d6, 0, 8, 0xf6ecd0);
  b.box(x, SLAB_Y + 9.4, z, 54, 0.8, 36, PAL.gold, 0, 0);
  for (let k = -3; k <= 3; k++) b.box(x + k * 8, SLAB_Y + 4.5, z + 17.1, 0.35, 9, 0.3, PAL.dark, 0, 12);
  for (const hy of [3, 6]) b.box(x, SLAB_Y + hy, z + 17.1, 52, 0.25, 0.3, PAL.dark, 0, 0);
  w.addBox(x, z, 52, 34, 0, SLAB_Y + 9.8);
  w.signs.text(x, SLAB_Y + 11.6, z + 17.4, 0, 30, 3, 'PRESIDENTIAL MOTORS', '#1d1a2e', '#f2c94c');
  b.box(x, SLAB_Y + 11.6, z + 17.1, 31, 3.6, 0.4, PAL.dark, 0, 0);
  // display lot
  const lot = { x0: s.x0 + 6, z0: z + 20, x1: s.x0 + 62, z1: s.z1 - 5 };
  patch(w, lot, PAL.asphaltDark);
  const kinds = ['sports', 'muscle', 'limo', 'sports', 'suv', 'moto', 'muscle'];
  kinds.forEach((k, i) => {
    const px = lot.x0 + 5 + i * 7.6, pz = (lot.z0 + lot.z1) / 2 + (i % 2 ? 3 : -3);
    w.geo.at('decal', px, pz).cyl(px, SLAB_Y + 0.035, pz, 3.6, 3.6, 0.01, 12, 0xf6ecd0, true);
    w.parkSpots.push({ x: px, z: pz, rot: 0.5, kind: k });
  });
  for (let i = 0; i < 5; i++) flagpole(w, lot.x0 + 2 + i * 13, lot.z1 + 1.5, 7);
  shop(w, s.x1 - 14, s.z1 - 14, 18, 14, 4.6, 0, PAL.mustard, PAL.red, 'COVFEFE COFFEE', '#4c9a5a', '#f6ecd0');
  tower(w, s.x1 - 15, s.z0 + 19, 22, 28, 62, { glass: 0x9cc6d6, crown: 'slant' });
}

function tunnelBlock(w: World, s: Rect) {
  const hole = { x0: TUNNEL.x0, x1: TUNNEL.x1, z0: TUNNEL.zOut, z1: TUNNEL.zEnd };
  slab(w, s, { hole });
  const drive = { x0: TUNNEL.x0 - 1.5, x1: TUNNEL.x1 + 1.5, z0: TUNNEL.zEnd, z1: s.z1 };
  patch(w, drive, PAL.asphaltDark);
  furnish(w, s, { trees: 'autumn', skip: [{ x0: drive.x0 - 3, x1: drive.x1 + 3, z0: s.z0 - 2, z1: s.z1 + 2 }] });
  tower(w, s.x0 + 21, s.z0 + 26, 30, 36, 74, { glass: 0x8cc4b6, crown: 'step' });
  midrise(w, s.x0 + 19, s.z1 - 17, 28, 20, { wall: PAL.mustard, floors: 5, shop: PAL.navy });
  midrise(w, s.x1 - 9, s.z0 + 30, 10, 44, { wall: 0xb9ad98, floors: 7, shop: null });
  w.signs.text(TUNNEL.x0 - 3.4, 2.6, TUNNEL.zEnd + 2, 0, 5, 1.2, 'SERVICE TUNNEL', '#1d1a2e', '#f2c230', true);
  w.geo.at('world', TUNNEL.x0 - 3.4, TUNNEL.zEnd + 2).box(TUNNEL.x0 - 3.4, 1.1, TUNNEL.zEnd + 2, 0.2, 2.2, 0.2, 0x4a4f66, 0, 8);
}

function hotelBlock(w: World, s: Rect) {
  slab(w, s);
  furnish(w, s, { trees: 'autumn', treeGap: 15 });
  const x = (s.x0 + s.x1) / 2, z = s.z1 - 22;
  const top = midrise(w, x, z, 64, 30, { wall: 0xf0e2c0, trim: PAL.gold, floors: 12, shop: 0x8f2a30, lit: 0.45 });
  const b = w.geo.at('world', x, z);
  b.box(x, SLAB_Y + 5, z + 18.5, 16, 0.6, 7, 0x8f2a30, 0, 0, PAL.gold);
  for (const dx of [-7, 7]) b.box(x + dx, SLAB_Y + 2.5, z + 21.4, 0.4, 5, 0.4, PAL.goldDark, 0, 12);
  w.signs.text(x, top + 2.2, z + 14, 0, 34, 3.4, 'HOTEL TREMENDOUS', '#1d1a2e', '#f2c94c');
  b.box(x, top + 2.2, z + 13.7, 35, 4, 0.5, PAL.dark, 0, 0);
  for (const dx of [-14, -10, 10, 14]) flagpole(w, x + dx, z + 22.5, 8);
  for (const L of splitLots({ x0: s.x0 + 4.4, z0: s.z0 + 4.4, x1: s.x1 - 4.4, z1: s.z0 + 34 }, 31)) cityLot(w, L, 0.85);
  w.parkSpots.push({ x: x - 22, z: s.z1 + 4.6, rot: Math.PI / 2, kind: 'taxi' }, { x: x + 22, z: s.z1 + 4.6, rot: Math.PI / 2, kind: 'limo' });
}

function metroBlock(w: World, s: Rect) {
  slab(w, s);
  furnish(w, s, { trees: 'autumn', treeGap: 15 });
  const inner = inset(s, 4.4);
  const mid = P.metroDowntown.z;
  for (const L of splitLots({ ...inner, z1: mid - 9 }, 31)) cityLot(w, { ...L, rot: Math.PI }, 0.7);
  for (const L of splitLots({ ...inner, z0: mid + 9 }, 31)) cityLot(w, L, 0.7);
  patch(w, { x0: inner.x0, x1: inner.x1, z0: mid - 8, z1: mid + 8 }, 0xe2d6b8);
  metro(w, 'downtown', 'GOLDEN SQUARE', P.metroDowntown.x, mid, Math.PI / 2);
  for (const dx of [-30, -18, 18, 30]) tree(w, P.metroDowntown.x + dx, mid + (dx > 0 ? 4 : -4), 'autumn');
  bench(w, P.metroDowntown.x + 10, mid - 5, 0);
  bench(w, P.metroDowntown.x - 10, mid + 5, Math.PI);
  // hot-dog cart
  const b = w.geo.at('world', P.metroDowntown.x + 24, mid);
  b.box(P.metroDowntown.x + 24, SLAB_Y + 0.8, mid - 1, 2.2, 1.1, 1.2, 0xcfd6dc, 0, 8);
  b.cyl(P.metroDowntown.x + 24, SLAB_Y + 1.4, mid - 1, 0.05, 0.05, 1.4, 4, PAL.dark, false);
  b.cyl(P.metroDowntown.x + 24, SLAB_Y + 2.6, mid - 1, 1.5, 0, 0.6, 8, PAL.red, false);
  w.addBox(P.metroDowntown.x + 24, mid - 1, 2.2, 1.2, 0, SLAB_Y + 1.4, 0, { cam: false });
}

export function buildDowntown(w: World) {
  const { xs, zs } = GRID.downtown;
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < zs.length - 1; j++) {
      const s = blockSlab(xs, zs, i, j);
      const key = `${i},${j}`;
      if (key === '2,1') towerBlock(w, s);
      else if (key === '2,2') squareBlock(w, s);
      else if (key === '0,3') parkingBlock(w, s);
      else if (key === '3,2') showroomBlock(w, s);
      else if (key === '4,0') tunnelBlock(w, s);
      else if (key === '1,1') hotelBlock(w, s);
      else if (key === '1,2') metroBlock(w, s);
      else genericBlock(w, s, i, j);
    }
  w.protestSites.push({ x: -120, z: 150, r: 9, d: 'downtown' }, { x: -10, z: -30, r: 9, d: 'downtown' }, { x: -230, z: 60, r: 9, d: 'downtown' });
}
