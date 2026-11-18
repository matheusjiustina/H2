import { inset, Rect } from '../../core/util';
import { PAL } from '../../render/materials';
import { GRID, P, SLAB_Y } from '../layout';
import { classical, midrise, tower } from '../buildings';
import { bench, billboard, furnish, lamp, patch, slab, tree } from '../props';
import { exchange, metro } from '../landmarks';
import type { World } from '../world';
import { blockSlab, GLASS } from './common';

const STONES = [0xe2d8c0, 0xd6ccb4, 0xcfc4ae, 0xe8dcc4, 0xbfb6a4];

function bank(w: World, s: Rect, i: number, j: number) {
  const r = w.rng;
  slab(w, s);
  furnish(w, s, { trees: null, lamps: 24, extras: true });
  const inner = inset(s, 3.6);
  const cx = (inner.x0 + inner.x1) / 2, cz = (inner.z0 + inner.z1) / 2;
  const W = inner.x1 - inner.x0, D = inner.z1 - inner.z0;
  const t = r.next();
  if (t < 0.5) {
    const h = r.range(70, 135) - Math.hypot(i - 2, j - 2) * 9;
    tower(w, cx, cz, W - 3, D - 3, h, { glass: r.pick(GLASS), base: r.pick(STONES), crown: r.pick(['step', 'spire', 'flat', 'slant'] as const), podium: 10 });
  } else if (t < 0.82) {
    const top = classical(w, cx, cz, W - 3, D - 3, r.int(5, 9), 0, r.pick(STONES), r.pick([1, 2, 3, 12, 15]));
    if (r.chance(0.5)) tower(w, cx, cz, W * 0.5, D * 0.5, top + 34, { glass: r.pick(GLASS), podium: 0.01, crown: 'flat' });
    if (r.chance(0.35)) w.collectSpots.push({ x: cx + W * 0.3, z: cz, y: top });
  } else {
    // two slimmer buildings with an alley courtyard
    midrise(w, cx - W / 4, cz, W / 2 - 3, D - 2, { wall: r.pick(STONES), floors: r.int(7, 11), shop: PAL.navy, glass: 0x3f506e });
    midrise(w, cx + W / 4, cz, W / 2 - 3, D - 2, { wall: r.pick(STONES), floors: r.int(6, 10), shop: 0x3a6a5c, glass: 0x3f506e });
    w.zones.push({ id: `alley-${i}-${j}`, kind: 'hide', rect: { x0: cx - 2, x1: cx + 2, z0: inner.z0 + 4, z1: inner.z1 - 4 } });
  }
}

export function buildWallStreet(w: World) {
  const { xs, zs } = GRID.wallstreet;
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < zs.length - 1; j++) {
      const key = `${i},${j}`;
      if (key === '3,2') continue; // merged into the exchange block
      if (key === '2,2') {
        const s = { ...blockSlab(xs, zs, 2, 2), x1: blockSlab(xs, zs, 3, 2).x1 };
        slab(w, s, { top: 0xe2d6b8 });
        furnish(w, s, { trees: null, lamps: 26, extras: false, sides: 12 });
        exchange(w);
        continue;
      }
      const s = blockSlab(xs, zs, i, j);
      if (key === '1,3') {
        // metro plaza + courtyard
        slab(w, s);
        furnish(w, s, { trees: null, lamps: 24 });
        const inner = inset(s, 3.6);
        patch(w, { x0: inner.x0, x1: inner.x1, z0: P.metroWall.z - 9, z1: P.metroWall.z + 9 }, 0xe2d6b8);
        metro(w, 'wallstreet', 'WALL STREET', P.metroWall.x, P.metroWall.z, Math.PI / 2);
        midrise(w, (inner.x0 + inner.x1) / 2, inner.z0 + 12, inner.x1 - inner.x0 - 2, 22, { wall: 0xd6ccb4, floors: 9, shop: PAL.navy });
        tower(w, (inner.x0 + inner.x1) / 2, inner.z1 - 13, inner.x1 - inner.x0 - 4, 22, 88, { glass: 0x9db6d0, crown: 'spire' });
        tree(w, P.metroWall.x - 22, P.metroWall.z + 3, 'autumn');
        tree(w, P.metroWall.x + 22, P.metroWall.z - 3, 'autumn');
        bench(w, P.metroWall.x + 12, P.metroWall.z + 5, Math.PI);
        continue;
      }
      if (key === '4,1') {
        // courtyard building (U shape opening south)
        slab(w, s);
        furnish(w, s, { trees: null, lamps: 24 });
        const inner = inset(s, 3.6);
        const cx = (inner.x0 + inner.x1) / 2, W = inner.x1 - inner.x0, D = inner.z1 - inner.z0;
        midrise(w, cx, inner.z0 + 8, W - 2, 14, { wall: 0xcfc4ae, floors: 8, shop: null });
        midrise(w, inner.x0 + 8, inner.z0 + D / 2 + 6, 14, D - 16, { wall: 0xcfc4ae, floors: 8, shop: null });
        midrise(w, inner.x1 - 8, inner.z0 + D / 2 + 6, 14, D - 16, { wall: 0xcfc4ae, floors: 8, shop: null });
        patch(w, { x0: inner.x0 + 16, x1: inner.x1 - 16, z0: inner.z0 + 16, z1: inner.z1 }, PAL.lawn);
        tree(w, cx, inner.z0 + D / 2 + 6, 'green', 1.3);
        bench(w, cx - 6, inner.z1 - 8, Math.PI / 2);
        bench(w, cx + 6, inner.z1 - 8, -Math.PI / 2);
        w.collectSpots.push({ x: cx, z: inner.z0 + 24 });
        w.zones.push({ id: 'courtyard', kind: 'hide', rect: { x0: inner.x0 + 16, x1: inner.x1 - 16, z0: inner.z0 + 16, z1: inner.z1 - 6 } });
        continue;
      }
      bank(w, s, i, j);
    }
  // market tickers and satirical signage
  const tick = (x: number, y: number, z: number, rot: number, t: string) => w.signs.text(x, y, z, rot, 16, 1.5, t, '#12141f', '#6fe08a', false);
  tick(285, 9, 20 + 4.8, 0, 'TRMP ▲ 45.47   BIGLY ▲ 9.99   FAKE ▼ 0.01');
  tick(425, 9, 90 - 4.8, Math.PI, 'GOLD ▲ 1776   WALL ▼ 20.20   BURGR ▲ 0.99');
  tick(250 + 4.8, 9, 55, Math.PI / 2, 'STONK ▲ ∞   TAXES ▼ ???   HAIR ▲ 4.5');
  billboard(w, 215, -86, 0, 10, { y: SLAB_Y, pole: 0.2, w: 10, h: 5, both: false });
  for (const [x, z] of [[355, -50], [460, 165], [250, 20]]) lamp(w, x + 6, z + 6, 0);
  w.protestSites.push({ x: 285, z: 55, r: 8, d: 'wallstreet' }, { x: 460, z: 127, r: 8, d: 'wallstreet' });
}
