import { inset, Rect } from '../../core/util';
import { PAL } from '../../render/materials';
import { GRID, P, SLAB_Y, TUNNEL } from '../layout';
import { classical, midrise } from '../buildings';
import { bench, fence, flagpole, furnish, lamp, parkingLot, patch, slab, stairs, tree } from '../props';
import { capitol, fountain, memorial, metro, obelisk, whiteHouse } from '../landmarks';
import type { World } from '../world';
import { blockSlab } from './common';

function mallTrees(w: World, s: Rect, skipMid = 0) {
  for (let x = s.x0 + 10; x < s.x1 - 6; x += 12) {
    for (const z of [s.z0 + 9, s.z0 + 18, s.z1 - 18, s.z1 - 9]) {
      if (skipMid && Math.abs(x - (s.x0 + s.x1) / 2) < skipMid) continue;
      tree(w, x, z, w.rng.chance(0.65) ? 'green' : 'autumn', 1.2);
    }
  }
}

function offices(w: World, s: Rect, n: number, floors: number, opts: { front?: number; lawn?: boolean } = {}) {
  slab(w, s, { inner: opts.lawn === false ? undefined : PAL.lawn, innerInset: 4 });
  furnish(w, s, { trees: 'green', treeGap: 13 });
  const inner = inset(s, 9);
  const W = (inner.x1 - inner.x0) / n;
  for (let i = 0; i < n; i++) {
    const x = inner.x0 + W * (i + 0.5);
    classical(w, x, (inner.z0 + inner.z1) / 2, W - 8, inner.z1 - inner.z0 - 6, floors + (i % 2), 0, w.rng.pick([0xe6dcc6, 0xded4be, 0xece4d0]), opts.front ?? 3);
    flagpole(w, x, inner.z1 + 4, 9);
  }
}

function checkpoint(w: World, x: number, z: number, rot: number) {
  const b = w.geo.at('world', x, z);
  b.box(x, SLAB_Y + 1.3, z, 2.4, 2.6, 2.4, PAL.white, rot, 8, PAL.navy);
  b.box(x, SLAB_Y + 2.75, z, 3, 0.2, 3, PAL.navy, rot, 0);
  w.addBox(x, z, 2.4, 2.4, 0, SLAB_Y + 2.7, rot);
  // raised boom
  const cs = Math.cos(rot), sn = Math.sin(rot);
  b.box(x + 2 * cs, SLAB_Y + 0.6, z - 2 * sn, 0.3, 1.2, 0.3, PAL.dark, rot, 8);
  b.box(x + 2 * cs + 1.6 * cs, SLAB_Y + 3.2, z - 2 * sn + 1.6 * sn * -1, 0.14, 4.6, 0.14, PAL.red, rot, 0);
  w.guardPosts.push({ x: x + 1.2 * sn + 2 * cs, z: z + 1.2 * cs, rot, kind: 'security' });
}

export function buildGovernment(w: World) {
  const { xs, zs } = GRID.government;
  const S = (i: number, j: number) => blockSlab(xs, zs, i, j);

  // ---- north row
  offices(w, S(0, 0), 2, 5);
  {
    // Treasury
    const s = S(1, 0);
    slab(w, s, { inner: PAL.lawn, innerInset: 4 });
    furnish(w, s, { trees: 'green', treeGap: 13 });
    const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
    const top = classical(w, cx, cz - 6, 84, 62, 5, 0, 0xe9e0cc, 15);
    stairs(w, cx, cz + 29, Math.PI, 30, 6, SLAB_Y, SLAB_Y + 1.2, PAL.stone);
    w.signs.text(cx, SLAB_Y + 17, cz + 25.8, 0, 26, 1.6, 'DEPARTMENT OF THE TREASURY', '#e9e0cc', '#4a4458');
    w.collectSpots.push({ x: cx, z: cz, y: top });
    checkpoint(w, s.x1 - 5, s.z1 - 5, 0);
  }
  {
    const s = S(2, 0);
    slab(w, s, { hole: { x0: TUNNEL.x0, x1: TUNNEL.x1, z0: TUNNEL.zTop, z1: TUNNEL.zIn }, top: 0xe6dcc0 });
    whiteHouse(w, s);
    furnish(w, s, { trees: null, lamps: 26, extras: false });
    checkpoint(w, s.x0 + 1.6, P.whGate.z - 12, Math.PI / 2);
  }
  offices(w, S(3, 0), 2, 6);
  {
    // Supreme-court style temple + annex
    const s = S(4, 0);
    slab(w, s, { inner: PAL.lawn, innerInset: 4 });
    furnish(w, s, { trees: 'green', treeGap: 13 });
    const cx = s.x0 + 46, cz = (s.z0 + s.z1) / 2;
    const b = w.geo.at('world', cx, cz);
    classical(w, cx, cz - 8, 56, 60, 4, 0, 0xf3efe2, 0);
    stairs(w, cx, cz + 28, Math.PI, 36, 8, SLAB_Y, SLAB_Y + 3, PAL.stone);
    b.box(cx, SLAB_Y + 1.5, cz + 23, 40, 3, 2, PAL.stone, 0, 8);
    w.addBox(cx, cz + 23, 40, 2, 0, SLAB_Y + 3, 0, { cam: false });
    for (let i = 0; i < 8; i++) b.cyl(cx - 17.5 + i * 5, SLAB_Y + 3, cz + 23.2, 0.9, 0.8, 13, 8, 0xf7f3e6, false);
    b.box(cx, SLAB_Y + 16.6, cz + 23, 40, 1.4, 3.6, 0xf3efe2, 0, 0);
    b.gable(cx, SLAB_Y + 17.3, cz + 23, 3.6, 40, 5, 0xe9e4d6, Math.PI / 2, 0xf7f3e6);
    w.signs.text(cx, SLAB_Y + 16.6, cz + 24.9, 0, 24, 1.1, 'EQUAL JUSTICE UNDER AUDIT', '#f3efe2', '#4a4458');
    classical(w, s.x1 - 20, cz, 26, 80, 5, 0, 0xe6dcc6, 8);
  }

  // ---- the Mall
  {
    const s = S(0, 1);
    slab(w, s, { inner: PAL.lawn, innerInset: 4 });
    memorial(w);
    furnish(w, s, { trees: 'green', treeGap: 14, extras: false });
    for (let k = 0; k < 6; k++) tree(w, s.x0 + 10 + k * 5, s.z0 + 10 + (k % 2) * 60, 'green', 1.2);
  }
  {
    const s = S(1, 1);
    slab(w, s, { inner: PAL.lawn, innerInset: 4 });
    furnish(w, s, { trees: null, extras: false, lamps: 28 });
    const pool = { x0: s.x0 + 8, x1: s.x1 - 8, z0: P.obelisk.z - 10, z1: P.obelisk.z + 10 };
    const b = w.geo.at('world', (pool.x0 + pool.x1) / 2, P.obelisk.z);
    patch(w, { x0: pool.x0 - 2.5, x1: pool.x1 + 2.5, z0: pool.z0 - 2.5, z1: pool.z1 + 2.5 }, 0xe9dfc4, SLAB_Y + 0.025);
    patch(w, pool, PAL.water, SLAB_Y + 0.05);
    for (const [ax, az, bx, bz] of [[pool.x0, pool.z0, pool.x1, pool.z0], [pool.x0, pool.z1, pool.x1, pool.z1], [pool.x0, pool.z0, pool.x0, pool.z1], [pool.x1, pool.z0, pool.x1, pool.z1]]) {
      b.box((ax + bx) / 2, SLAB_Y + 0.2, (az + bz) / 2, Math.abs(bx - ax) + 0.6, 0.4, Math.abs(bz - az) + 0.6, PAL.stone, 0, 8);
      w.addBox((ax + bx) / 2, (az + bz) / 2, Math.abs(bx - ax) + 0.6, Math.abs(bz - az) + 0.6, 0, SLAB_Y + 0.4, 0, { cam: false });
    }
    mallTrees(w, s);
    for (let x = pool.x0 + 6; x < pool.x1; x += 18) {
      bench(w, x, pool.z0 - 5, 0);
      bench(w, x, pool.z1 + 5, Math.PI);
    }
  }
  {
    const s = S(2, 1);
    slab(w, s, { inner: PAL.lawn, innerInset: 4 });
    furnish(w, s, { trees: null, extras: false, lamps: 28 });
    obelisk(w);
    mallTrees(w, s, 30);
  }
  {
    const s = S(3, 1);
    slab(w, s, { inner: PAL.lawn, innerInset: 4 });
    furnish(w, s, { trees: null, extras: false, lamps: 28 });
    const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
    patch(w, { x0: s.x0 + 4, x1: s.x1 - 4, z0: cz - 5, z1: cz + 5 }, 0xe9dfc4, SLAB_Y + 0.03);
    fountain(w, cx - 36, cz, 7);
    fountain(w, cx + 36, cz, 7);
    mallTrees(w, s);
    for (const dx of [-14, 14]) {
      bench(w, cx + dx, cz - 7, 0);
      bench(w, cx + dx, cz + 7, Math.PI);
    }
    w.protestSites.push({ x: cx, z: cz, r: 13, d: 'government' });
    // little stage for speeches
    const b = w.geo.at('world', cx, cz - 26);
    b.box(cx, SLAB_Y + 0.5, cz - 26, 10, 1, 6, PAL.wood, 0, 8);
    b.box(cx, SLAB_Y + 1.6, cz - 25, 1.2, 1.2, 0.8, PAL.navy, 0, 8);
    w.addBox(cx, cz - 26, 10, 6, 0, SLAB_Y + 1);
    w.signs.text(cx, SLAB_Y + 3.4, cz - 28.6, 0, 9, 2, 'FREE SPEECH ZONE (BRING YOUR OWN)', '#f6ecd0', '#2f5fa8', true);
    b.box(cx - 4, SLAB_Y + 1.7, cz - 28.6, 0.2, 3.4, 0.2, PAL.dark, 0, 8);
    b.box(cx + 4, SLAB_Y + 1.7, cz - 28.6, 0.2, 3.4, 0.2, PAL.dark, 0, 8);
  }
  {
    const s = S(4, 1);
    slab(w, s, { inner: PAL.lawn, innerInset: 4 });
    furnish(w, s, { trees: 'green', treeGap: 16, extras: false });
    capitol(w);
    fence(w, s.x0 + 6, s.z0 + 6, s.x0 + 6, s.z0 + 30, 'hedge', 1);
    fence(w, s.x0 + 6, s.z1 - 30, s.x0 + 6, s.z1 - 6, 'hedge', 1);
    w.guardPosts.push({ x: s.x0 + 22, z: P.capitol.z - 18, rot: -Math.PI / 2, kind: 'police' }, { x: s.x0 + 22, z: P.capitol.z + 18, rot: -Math.PI / 2, kind: 'police' });
  }

  // ---- south row
  {
    const s = S(0, 2);
    slab(w, s, { inner: PAL.lawn, innerInset: 4 });
    furnish(w, s, { trees: 'green', treeGap: 13 });
    classical(w, s.x0 + 44, (s.z0 + s.z1) / 2, 66, 70, 6, 0, 0xe2d9c4, 5);
    // small park with a statue
    const px = s.x1 - 30, pz = (s.z0 + s.z1) / 2;
    for (let k = 0; k < 9; k++) tree(w, px + w.rng.range(-22, 22), pz + w.rng.range(-42, 42), 'green', 1.2);
    fountain(w, px, pz, 5);
    bench(w, px - 8, pz, Math.PI / 2);
    bench(w, px + 8, pz, -Math.PI / 2);
    w.collectSpots.push({ x: px, z: pz + 30 });
  }
  {
    // Police HQ
    const s = S(1, 2);
    slab(w, s);
    furnish(w, s, { trees: 'green', treeGap: 16 });
    const x = P.policeHQ.x - 14, z = P.policeHQ.z - 8;
    const top = midrise(w, x, z, 46, 44, { wall: 0x9fb0c4, trim: 0xf4f1e6, floors: 6, shop: null, glass: 0x34425e });
    w.signs.text(x, SLAB_Y + 5, z + 22.3, 0, 22, 2.4, 'CITY POLICE · PRECINCT 45', '#1e2f5c', '#f6ecd0');
    w.geo.at('world', x, z).box(x, SLAB_Y + 5, z + 22.05, 23, 2.9, 0.3, PAL.dark, 0, 0);
    flagpole(w, x - 16, z + 26, 10);
    flagpole(w, x + 16, z + 26, 10);
    const lot = { x0: s.x1 - 46, z0: s.z0 + 8, x1: s.x1 - 6, z1: s.z1 - 8 };
    parkingLot(w, lot, false, 'police');
    fence(w, lot.x0 - 1, lot.z0 - 1, lot.x1 + 1, lot.z0 - 1, 'chain');
    fence(w, lot.x0 - 1, lot.z1 + 1, lot.x1 + 1, lot.z1 + 1, 'chain');
    w.guardPosts.push({ x: x - 6, z: z + 27, rot: 0, kind: 'police' }, { x: x + 6, z: z + 27, rot: 0, kind: 'police' }, { x: lot.x0 + 4, z: lot.z1 - 6, rot: 0, kind: 'police' });
    w.parkSpots.push({ x: x, z: z, rot: 0, y: top, kind: 'heli', id: 'police-heli' });
    w.signs.addFlat('hpad', x, top + 0.05, z, 0, 12, 12, 96, 96, (g, W, H) => {
      g.fillStyle = '#5a6280';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = '#f4f1e6';
      g.lineWidth = 6;
      g.beginPath();
      g.arc(W / 2, H / 2, W / 2 - 8, 0, 6.3);
      g.stroke();
      g.fillStyle = '#f4f1e6';
      g.font = 'bold 56px Arial';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('H', W / 2, H / 2 + 3);
    });
  }
  {
    // Federal complex above the service tunnel
    const s = S(2, 2);
    slab(w, s, { inner: PAL.lawn, innerInset: 4 });
    furnish(w, s, { trees: 'green', treeGap: 13 });
    const cz = (s.z0 + s.z1) / 2;
    classical(w, s.x0 + 30, cz, 40, 80, 7, 0, 0xded4be, 12);
    classical(w, s.x1 - 30, cz, 40, 80, 6, 0, 0xe6dcc6, 12);
    patch(w, { x0: s.x0 + 52, x1: s.x1 - 52, z0: s.z0 + 5, z1: s.z1 - 5 }, 0xe9dfc4, SLAB_Y + 0.03);
    for (let z = s.z0 + 14; z < s.z1 - 8; z += 16) lamp(w, (s.x0 + s.x1) / 2 - 4, z, Math.PI / 2);
    w.signs.text((s.x0 + s.x1) / 2, SLAB_Y + 2.2, s.z1 - 5, 0, 9, 1.6, 'BUREAU OF BUREAUCRACY', '#f6ecd0', '#2f5fa8', true);
    w.geo.at('world', (s.x0 + s.x1) / 2, s.z1 - 5).box((s.x0 + s.x1) / 2, SLAB_Y + 0.7, s.z1 - 5, 0.3, 1.4, 0.3, PAL.dark, 0, 8);
  }
  {
    const s = S(3, 2);
    slab(w, s);
    furnish(w, s, { trees: 'green', treeGap: 14 });
    const inner = inset(s, 6);
    const mz = P.metroGov.z;
    metro(w, 'government', 'CAPITOL MALL', P.metroGov.x, mz, Math.PI / 2);
    patch(w, { x0: inner.x0, x1: inner.x1, z0: mz - 9, z1: mz + 9 }, 0xe2d6b8);
    classical(w, (inner.x0 + inner.x1) / 2, inner.z0 + 14, inner.x1 - inner.x0 - 6, 26, 6, 0, 0xe2d9c4, 1);
    // brutalist federal bureau
    const bx = (inner.x0 + inner.x1) / 2, bz = inner.z1 - 22;
    midrise(w, bx, bz, inner.x1 - inner.x0 - 10, 38, { wall: 0xbfb9a8, trim: 0xa9a394, floors: 8, shop: null, winW: 2.6, glass: 0x2f3a52 });
    tree(w, P.metroGov.x - 30, mz, 'green');
    tree(w, P.metroGov.x + 30, mz, 'green');
  }
  {
    // museum with rotunda
    const s = S(4, 2);
    slab(w, s, { inner: PAL.lawn, innerInset: 4 });
    furnish(w, s, { trees: 'green', treeGap: 13 });
    const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2 + 6;
    const top = classical(w, cx, cz, 90, 60, 4, 0, 0xece4d0, 2);
    const b = w.geo.at('world', cx, cz);
    b.cyl(cx, top, cz, 13, 13, 5, 14, 0xece4d0, true);
    b.cyl(cx, top + 5, cz, 12, 4, 6, 14, 0x9fc0b0, true);
    w.signs.text(cx, SLAB_Y + 19, cz - 31, Math.PI, 30, 1.5, 'MUSEUM OF ALTERNATIVE FACTS', '#ece4d0', '#4a4458');
    stairs(w, cx, cz - 34.5, 0, 30, 8, SLAB_Y, SLAB_Y + 1.2, PAL.stone);
  }
  w.protestSites.push({ x: 100, z: -345, r: 10, d: 'government' }, { x: 230, z: -245, r: 10, d: 'government' });
}
