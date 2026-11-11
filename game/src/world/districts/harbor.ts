import { shade } from '../../render/geo';
import { PAL } from '../../render/materials';
import { GRID, P, SLAB_Y } from '../layout';
import { midrise, shop } from '../buildings';
import { billboard, fence, flagpole, furnish, lamp, parkingLot, slab, tree } from '../props';
import { dock, libertyBridge, libertyStatue } from '../landmarks';
import type { World } from '../world';
import { blockSlab } from './common';

const CCOL = [0xc9523a, 0x2f5fa8, 0x2f8f86, 0xee8a3a, 0xe8b84a, 0x8b93a6, 0x4c9a5a, 0x7a62a8, 0xb8433a];
const SHED = [0xb8433a, 0x4f8f8a, 0xb9bcc4, 0xe8d8b0, 0x6f86a8];

export function container(w: World, x: number, y: number, z: number, rot: number, len = 12.2, c?: number) {
  const col = c ?? w.rng.pick(CCOL);
  const b = w.geo.at('world', x, z);
  b.box(x, y + 1.3, z, len, 2.6, 2.44, col, rot, 8, shade(col, 0.85));
  // corrugation ribs + door end
  b.box(x, y + 1.3, z, len * 0.98, 2.2, 2.5, shade(col, 0.9), rot, 4 | 8 | 1 | 2);
  b.box(x, y + 1.3, z, len + 0.06, 2.3, 2.1, shade(col, 0.72), rot, 4 | 8 | 16 | 32);
}

function stack(w: World, x: number, z: number, n: number, y = 0, rot = 0) {
  for (let i = 0; i < n; i++) container(w, x, y + i * 2.6, z, rot);
  if (rot === 0) w.addBox(x, z, 12.2, 2.44, y - 0.2, y + n * 2.6);
  else w.addBox(x, z, 12.2, 2.44, y - 0.2, y + n * 2.6, rot);
}

function warehouse(w: World, x: number, z: number, bw: number, bd: number, h: number, col: number, name?: string) {
  const b = w.geo.at('world', x, z);
  b.box(x, SLAB_Y + h / 2, z, bw, h, bd, col, 0, 8);
  b.gable(x, SLAB_Y + h, z, bw + 1, bd + 1, 3.4, shade(col, 0.72), 0, col);
  for (let k = -1; k <= 1; k++) {
    b.wallQuad(x + k * (bw / 3.2) - 2.6, SLAB_Y + 0.1, z + bd / 2 + 0.1, 1, 0, 5.2, 4.6, 0xd9d6cc);
    for (let i = 1; i < 6; i++) b.wallQuad(x + k * (bw / 3.2) - 2.6, SLAB_Y + 0.1 + i * 0.76, z + bd / 2 + 0.16, 1, 0, 5.2, 0.06, 0x8b93a6);
  }
  for (let k = 0; k < Math.floor(bw / 6); k++) w.geo.at(w.rng.chance(0.3) ? 'glow' : 'world', x, z).wallQuad(x - bw / 2 + 2 + k * 6, SLAB_Y + h - 2, z + bd / 2 + 0.1, 1, 0, 3, 1.1, PAL.window);
  if (name) w.signs.text(x, SLAB_Y + h + 1.2, z + bd / 2 + 0.6, 0, Math.min(bw - 4, name.length * 0.9 + 2), 1.8, name, '#f6ecd0', '#1d1a2e');
  w.addBox(x, z, bw, bd, 0, SLAB_Y + h + 1.6);
}

function crane(w: World, x: number) {
  const b = w.geo.at('world', x, 392);
  const c = 0xee8a3a, H = 30;
  for (const dx of [-9, 9])
    for (const z of [383, 398]) {
      b.box(x + dx, H / 2, z, 1.3, H, 1.3, c, 0, 8);
      w.addBox(x + dx, z, 1.3, 1.3, 0, H, 0, { cam: false });
    }
  for (const z of [383, 398]) {
    b.box(x, H - 1, z, 19.3, 1.4, 1.3, c, 0, 0);
    b.box(x, 11, z, 19.3, 1, 1, c, 0, 0);
  }
  for (const dx of [-9, 9]) b.box(x + dx, 18, 390.5, 1, 1, 15, c, 0, 0);
  // boom over the water with trolley and a hanging container
  b.box(x, H + 1.2, 408, 3, 2, 70, shade(c, 0.92), 0, 0);
  b.box(x, H + 6, 388, 1, 9, 1, c, 0, 0);
  b.quad(x, H + 10.5, 388, x, H + 2.2, 440, x + 0.3, H + 2.2, 440, x + 0.3, H + 10.5, 388, PAL.dark);
  b.quad(x + 0.3, H + 10.5, 388, x + 0.3, H + 2.2, 440, x, H + 2.2, 440, x, H + 10.5, 388, PAL.dark);
  b.box(x, H - 1.2, 372, 4, 3, 4, 0xf6ecd0, 0, 0);
  const tz = 412 + ((x * 7) % 16);
  b.box(x, H - 0.6, tz, 3.4, 1.6, 4, PAL.dark, 0, 0);
  for (const dx of [-1.2, 1.2]) b.box(x + dx, H - 8, tz, 0.08, 14, 0.08, PAL.ink, 0, 12);
  container(w, x, H - 17.6, tz, Math.PI / 2);
  w.geo.at('glow', x, 392).box(x, H + 11, 388, 0.6, 0.6, 0.6, PAL.red, 0, 0);
  // rails on the quay
  for (const z of [383, 398]) w.geo.at('decal', x, z).flat(x, 0.05, z, 60, 0.3, 0x5a6280);
}

function fishingBoat(w: World, x: number, z: number, rot: number, c: number) {
  const b = w.geo.at('world', x, z);
  b.box(x, -0.5, z, 3.4, 1.7, 9, c, rot, 0);
  b.box(x, 0.45, z, 3.5, 0.25, 9.1, PAL.white, rot, 8);
  const cs = Math.cos(rot), sn = Math.sin(rot);
  b.box(x - 1.6 * sn, 1.5, z - 1.6 * cs, 2.4, 2, 3, PAL.white, rot, 8, shade(c, 0.8));
  b.cyl(x + 1.4 * sn, 0.5, z + 1.4 * cs, 0.08, 0.05, 5, 4, PAL.wood, false);
  w.addBox(x, z, 3.4, 9, -1.4, 0.55, rot, { cam: false });
}

function ship(w: World) {
  const x0 = 220, x1 = 388, zc = 423, hw = 12, deck = 3.2;
  const hull = 0x34425e, red = 0xb8433a;
  for (let x = x0; x < x1; x += 42) {
    const xe = Math.min(x1, x + 42);
    const b = w.geo.at('world', (x + xe) / 2, zc);
    b.box((x + xe) / 2, deck / 2 - 1.2, zc, xe - x, deck + 2.4, hw * 2, hull, 0, 8 | (x > x0 ? 2 : 0) | (xe < x1 ? 1 : 0), 0x8f8a80);
    b.box((x + xe) / 2, -1.6, zc, xe - x + 0.02, 1.6, hw * 2 + 0.1, red, 0, 4 | 8 | 1 | 2);
  }
  // bow wedge (toward -x)
  const b = w.geo.at('world', x0 - 8, zc);
  b.quad(x0, -2.4, zc - hw, x0 - 20, -2.4, zc, x0 - 22, deck + 1.5, zc, x0, deck, zc - hw, hull);
  b.quad(x0 - 20, -2.4, zc, x0, -2.4, zc + hw, x0, deck, zc + hw, x0 - 22, deck + 1.5, zc, hull);
  b.tri(x0, deck, zc - hw, x0 - 22, deck + 1.5, zc, x0, deck, zc + hw, 0x8f8a80);
  w.addBox((x0 + x1) / 2, zc, x1 - x0, hw * 2, -3, deck);
  w.addBox(x0 - 7, zc, 14, 14, -3, deck + 0.4);
  // superstructure at the stern
  const sx = x1 - 16;
  const sb = w.geo.at('world', sx, zc);
  sb.box(sx, deck + 7, zc, 16, 14, 20, PAL.white, 0, 8);
  for (let f = 0; f < 4; f++) sb.box(sx, deck + 2.6 + f * 3.2, zc, 16.1, 1, 18, PAL.window, 0, 4 | 8);
  sb.box(sx - 2, deck + 15, zc, 10, 2.6, 26, PAL.white, 0, 8);
  sb.box(sx - 2, deck + 15.4, zc, 10.1, 1.1, 24, PAL.window, 0, 4 | 8);
  sb.cyl(sx + 4, deck + 14, zc, 2, 1.7, 7, 8, red, true);
  sb.cyl(sx - 4, deck + 16.3, zc, 0.15, 0.08, 9, 4, PAL.dark, false);
  w.addBox(sx, zc, 16, 20, deck - 0.2, deck + 14);
  w.addBox(sx - 2, zc, 10, 26, deck + 13.9, deck + 16.3);
  // deck cargo
  for (let x = x0 + 10; x < sx - 16; x += 13.4)
    for (const dz of [-8, -4.6, -1.2, 2.2, 5.6]) {
      const n = w.rng.int(0, 3);
      if (n === 0) continue;
      for (let i = 0; i < n; i++) container(w, x, deck + i * 2.6, zc + dz + 1.2, 0);
      w.addBox(x, zc + dz + 1.2, 12.2, 2.44, deck - 0.1, deck + n * 2.6, 0, { cam: false });
    }
  // gangway from the quay
  const gx = x1 - 34;
  const gb = w.geo.at('world', gx, 405);
  gb.quad(gx - 1.2, 0.05, 399, gx - 1.2, deck, 411.4, gx + 1.2, deck, 411.4, gx + 1.2, 0.05, 399, 0xcfd6dc);
  gb.quad(gx - 1.2, deck - 0.2, 411.4, gx - 1.2, -0.15, 399, gx + 1.2, -0.15, 399, gx + 1.2, deck - 0.2, 411.4, 0x8b93a6);
  w.addBox(gx, 405.2, 2.4, 12.4, -1, deck, 0, { ramp: { axis: 'z', ya: 0.05, yb: deck }, cam: false });
  w.signs.text((x0 + x1) / 2 - 40, 0.8, zc - hw - 0.08, Math.PI, 30, 2.4, 'S.S. FREE TRADE', '#34425e', '#f6ecd0');
  w.collectSpots.push({ x: sx - 2, z: zc, y: deck + 16.3 }, { x: x0 + 4, z: zc, y: deck });
}

export function buildHarbor(w: World) {
  const { xs, zs } = GRID.harbor;
  for (let i = 0; i < xs.length - 1; i++) {
    const s = blockSlab(xs, zs, i, 0);
    slab(w, s, { top: 0xd6d0c0 });
    furnish(w, s, { trees: null, lamps: 30, extras: i < 2 });
    const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
    if (i === 0) {
      warehouse(w, cx + 8, s.z0 + 20, 48, 26, 9, SHED[0], 'ATLANTIC COLD STORAGE');
      shop(w, cx + 8, s.z1 - 12, 30, 12, 5, 0, 0xbfe3dc, PAL.navy, 'FISH MARKET · FRESH-ISH DAILY', '#2f5fa8', '#f6ecd0');
      for (let k = 0; k < 4; k++) tree(w, s.x0 + 5, s.z0 + 10 + k * 16, 'green');
    } else if (i === 1) {
      shop(w, cx - 16, cz + 10, 30, 16, 5.4, 0, 0xf6ecd0, PAL.red, 'THE CODFATHER · SEAFOOD', '#b8262e', '#f6ecd0');
      midrise(w, cx + 22, cz - 4, 26, 40, { wall: PAL.brick, floors: 4, shop: null });
      parkingLot(w, { x0: s.x0 + 6, z0: s.z0 + 6, x1: cx + 4, z1: s.z0 + 24 }, true);
    } else if (i === 2) {
      // safehouse warehouse
      warehouse(w, P.safeHarbor.x, P.safeHarbor.z - 8, 44, 30, 10, SHED[1], 'DEFINITELY NOT A HIDEOUT LLC');
      w.interacts.push({ id: 'safe-harbor', kind: 'safehouse', x: P.safeHarbor.x, y: SLAB_Y, z: P.safeHarbor.z + 9.5, r: 3.4, label: 'Hide out in the warehouse', data: 'harbor' });
      w.zones.push({ id: 'safe-harbor', kind: 'safe', rect: { x0: P.safeHarbor.x - 10, z0: P.safeHarbor.z + 4, x1: P.safeHarbor.x + 10, z1: P.safeHarbor.z + 16 } });
      warehouse(w, s.x0 + 22, cz, 30, 50, 9, SHED[3]);
      warehouse(w, s.x1 - 22, cz, 30, 50, 11, SHED[2], 'UNION LOCAL 1776');
      w.parkSpots.push({ x: P.safeHarbor.x + 14, z: P.safeHarbor.z + 14, rot: Math.PI / 2, kind: 'van' });
    } else if (i === 3) {
      warehouse(w, s.x0 + 30, s.z0 + 22, 48, 30, 10, SHED[4], 'INTERMODAL DEPOT 7');
      warehouse(w, s.x1 - 30, s.z0 + 22, 44, 30, 9, SHED[0]);
      parkingLot(w, { x0: s.x0 + 8, z0: s.z1 - 26, x1: s.x1 - 8, z1: s.z1 - 6 }, true, 'van');
    } else {
      // fuel depot
      const b = w.geo.at('world', cx, cz);
      const tanks: number[][] = [[s.x0 + 20, s.z0 + 20, 11], [s.x0 + 48, s.z0 + 20, 11], [s.x0 + 76, s.z0 + 20, 11], [s.x0 + 30, s.z1 - 18, 9], [s.x0 + 62, s.z1 - 18, 9]];
      for (const [tx, tz, r] of tanks) {
        b.cyl(tx, SLAB_Y, tz, r, r, 13, 14, PAL.white, true);
        b.cyl(tx, SLAB_Y + 9, tz, r + 0.1, r + 0.1, 1.4, 14, PAL.red, false);
        b.cyl(tx, SLAB_Y + 13, tz, r, r * 0.4, 1.2, 14, 0xd9d6cc, true);
        b.box(tx + r + 0.5, SLAB_Y + 6.5, tz, 0.9, 13, 0.25, 0x8b93a6, 0, 8);
        w.addBox(tx, tz, r * 1.7, r * 1.7, 0, SLAB_Y + 13.5);
      }
      for (const [ax, az, bx, bz] of [[s.x0 + 20, s.z0 + 20, s.x0 + 76, s.z0 + 20], [s.x0 + 30, s.z1 - 18, s.x0 + 62, s.z1 - 18]]) b.box((ax + bx) / 2, SLAB_Y + 1.2, (az + bz) / 2 + 12, Math.abs(bx - ax), 0.5, 0.5, PAL.mustard, 0, 0);
      fence(w, s.x0 + 4, s.z0 + 4, s.x1 - 4, s.z0 + 4, 'chain');
      fence(w, s.x0 + 4, s.z1 - 4, s.x0 + 40, s.z1 - 4, 'chain');
      fence(w, s.x0 + 50, s.z1 - 4, s.x1 - 4, s.z1 - 4, 'chain');
      fence(w, s.x0 + 4, s.z0 + 4, s.x0 + 4, s.z1 - 4, 'chain');
      fence(w, s.x1 - 4, s.z0 + 4, s.x1 - 4, s.z1 - 4, 'chain');
      w.signs.text(s.x0 + 45, SLAB_Y + 3.4, s.z1 - 3.9, 0, 8, 1.5, 'NO SMOKING · NO TWEETING', '#f2c230', '#1d1a2e', true);
      w.collectSpots.push({ x: s.x0 + 48, z: s.z0 + 20, y: SLAB_Y + 14.2 });
    }
  }
  // ---- quay apron
  for (let x = 20; x < 520; x += 34) lamp(w, x, 332.4, 0, 0);
  parkingLot(w, { x0: 14, z0: 340, x1: 54, z1: 392 }, false, undefined, 0);
  // container yard: rows of stacks with drivable aisles
  for (const z of [342, 352, 362, 372]) {
    for (let x = 196; x < 408; x += 12.9) {
      const r = w.rng.next();
      if (r < 0.22) continue;
      stack(w, x, z, r < 0.5 ? 1 : r < 0.82 ? 2 : 3);
    }
  }
  w.collectSpots.push({ x: 300, z: 357, y: 0 }, { x: 247.6, z: 362, y: 5.4 });
  w.zones.push({ id: 'containers', kind: 'hide', rect: { x0: 190, z0: 338, x1: 412, z1: 376 } });
  for (const x of [232, 304, 372]) crane(w, x);
  ship(w);
  // marina
  for (const x of [70, 100, 130, 160]) dock(w, { x0: x - 1.6, z0: 399, x1: x + 1.6, z1: 438 }, 0.35);
  dock(w, { x0: 60, z0: 399, x1: 172, z1: 403 }, 0.35);
  const cols = [0xb8433a, 0x2f5fa8, 0x4c9a5a, 0xe8b84a, 0xf6ecd0];
  [[78, 418], [92, 428], [108, 416], [138, 430], [152, 418]].forEach(([x, z], k) => fishingBoat(w, x, z, k % 2 ? 0.05 : Math.PI - 0.05, cols[k]));
  w.parkSpots.push({ x: 122, z: 424, rot: 0, kind: 'boat', id: 'harbor-boat' }, { x: 166, z: 432, rot: 0, kind: 'boat' }, { x: 64, z: 430, rot: 0, kind: 'boat' });
  w.interacts.push({ id: 'dock-harbor', kind: 'dock', x: P.marina.x, y: 0.35, z: 401, r: 4, label: 'Freedom Harbor marina', data: 'harbor' });
  w.signs.text(116, 3.4, 398.6, Math.PI, 12, 1.6, 'FREEDOM HARBOR MARINA', '#2f5fa8', '#f6ecd0', true);
  for (const dx of [-5.6, 5.6]) w.geo.at('world', 116, 398.6).box(116 + dx, 1.7, 398.6, 0.25, 3.4, 0.25, PAL.wood, 0, 8);
  // coast guard station
  {
    const x = P.coastGuard.x, z = P.coastGuard.z;
    const b = w.geo.at('world', x, z);
    b.box(x, 3.6, z, 24, 7.2, 14, PAL.white, 0, 8, 0xd9d6cc);
    b.box(x - 4, 3.6, z + 7.06, 3, 7.2, 0.1, PAL.orange, 0.0, 0);
    b.box(x - 0.2, 3.6, z + 7.06, 1.2, 7.2, 0.1, PAL.navy, 0, 0);
    w.signs.text(x + 6, 5.2, z + 7.12, 0, 9, 1.4, 'COAST GUARD', '#f6ecd0', '#1e2f5c');
    w.addBox(x, z, 24, 14, 0, 7.2);
    // lattice radar mast
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(x + 9 + dx, 7.2 + 6, z - 3 + dz, 0.16, 12, 0.16, 0x8b93a6, 0, 12);
    for (let k = 0; k < 4; k++) b.box(x + 9, 8.5 + k * 3, z - 3, 2.2, 0.12, 2.2, 0x8b93a6, 0, 0);
    b.box(x + 9, 19.6, z - 3, 3.2, 0.3, 0.6, PAL.white, 0.6, 0);
    flagpole(w, x - 14, z + 9, 10, 0);
    dock(w, { x0: x - 2, z0: 399, x1: x + 2, z1: 432 }, 0.35);
    w.parkSpots.push({ x: x + 6, z: 420, rot: 0, kind: 'boat', id: 'patrol-boat' });
    w.guardPosts.push({ x: x - 6, z: z + 10, rot: 0, kind: 'police' }, { x: x + 3, z: 396, rot: 0, kind: 'police' });
    w.parkSpots.push({ x: x + 18, z: z + 4, rot: Math.PI, kind: 'police' });
  }
  // fuel dock
  {
    const b = w.geo.at('world', 432, 396);
    b.box(432, 0.9, 396, 1.2, 1.8, 0.8, PAL.red, 0, 8, PAL.white);
    b.box(436, 0.9, 396, 1.2, 1.8, 0.8, PAL.red, 0, 8, PAL.white);
    w.signs.text(434, 3, 396, 0, 5, 1, 'MARINE FUEL', '#d43a34', '#f6ecd0', true);
    b.box(434, 1.5, 396, 0.2, 3, 0.2, 0x4a4f66, 0, 8);
  }
  billboard(w, 60, 362, Math.PI / 2, 11, { y: 0, pole: 8 });
  libertyBridge(w);
  libertyStatue(w);
  w.protestSites.push({ x: 180, z: 325, r: 9, d: 'harbor' }, { x: 420, z: 332, r: 8, d: 'harbor' });
}
