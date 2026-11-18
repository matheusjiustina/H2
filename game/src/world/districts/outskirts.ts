import { TAU } from '../../core/util';
import { fbm } from '../../core/rng';
import { shade } from '../../render/geo';
import { PAL } from '../../render/materials';
import { BOUNDS, districtAt, FLAT_ZONES, P, RAIL_Z, ROAD_Y } from '../layout';
import { house, shop } from '../buildings';
import { billboard, fence, flagpole, powerLine, rock, tree } from '../props';
import type { World } from '../world';

function ground(w: World, x0: number, z0: number, x1: number, z1: number, c: number, y = 0.03) {
  const sw = x1 - x0, sd = z1 - z0;
  const nx = Math.max(1, Math.ceil(sw / 60)), nz = Math.max(1, Math.ceil(sd / 60));
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const tx = x0 + (sw * (i + 0.5)) / nx, tz = z0 + (sd * (j + 0.5)) / nz;
      w.geo.at('decal', tx, tz).flat(tx, y, tz, sw / nx, sd / nz, c);
    }
}

function barn(w: World, x: number, z: number, rot: number, big = false) {
  const b = w.geo.at('world', x, z);
  const W = big ? 16 : 12, D = big ? 24 : 18, H = big ? 7 : 6;
  const red = 0xa83a32;
  b.box(x, H / 2, z, W, H, D, red, rot, 8);
  b.gable(x, H, z, D + 1, W + 1.2, big ? 5 : 4, 0x5a5a66, rot + Math.PI / 2, red);
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const P2 = (lx: number, lz: number): [number, number] => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
  // white-trim doors with an X on both gable ends
  for (const s of [-1, 1]) {
    const [dx, dz] = P2(0, s * (D / 2 + 0.06));
    b.box(dx, 2.2, dz, 5, 4.4, 0.1, PAL.white, rot, 0);
    b.box(dx, 2.2, dz + 0, 4.4, 3.8, 0.14, red, rot, 0);
    b.box(dx, 2.2, dz, 6, 0.3, 0.18, PAL.white, rot + 0, 0);
    b.box(dx, H + 1.2, dz, 1.6, 1.6, 0.16, PAL.white, rot, 0);
  }
  w.addBox(x, z, W, D, 0, H + 2, rot);
}

function silo(w: World, x: number, z: number, h = 14) {
  const b = w.geo.at('world', x, z);
  b.cyl(x, 0, z, 3, 3, h, 10, 0xcfd6dc, false);
  for (let k = 1; k < 5; k++) b.cyl(x, (h * k) / 5, z, 3.06, 3.06, 0.2, 10, 0x9aa2b0, false);
  b.cyl(x, h, z, 3.1, 0, 2.6, 10, 0x8b93a6, false);
  w.addBox(x, z, 5.2, 5.2, 0, h);
}

function cornfield(w: World, x0: number, z0: number, x1: number, z1: number) {
  ground(w, x0, z0, x1, z1, 0x9a7a4a, 0.03);
  const corn = [0x7fa84a, 0x93b552, 0xb8b84a];
  for (let z = z0 + 1; z < z1; z += 2.2) {
    const parts = Math.ceil((x1 - x0) / 30);
    for (let i = 0; i < parts; i++) {
      const xa = x0 + ((x1 - x0) * i) / parts, xb = x0 + ((x1 - x0) * (i + 1)) / parts;
      const h = 1.6 + (Math.abs(Math.round(z) + i) % 3) * 0.25;
      w.geo.at('world', (xa + xb) / 2, z).box((xa + xb) / 2, h / 2, z, xb - xa - 0.2, h, 0.9, corn[Math.abs(Math.round(z * 3) + i) % 3], 0, 8);
    }
  }
  w.zones.push({ id: `corn-${x0}`, kind: 'hide', rect: { x0, z0, x1, z1 } });
}

function windmill(w: World, x: number, z: number) {
  const y = w.terrain.h(x, z);
  const b = w.geo.at('world', x, z);
  const H = 12;
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const S = 4;
    for (let i = 0; i < S; i++) {
      const t = (i + 0.5) / S, k = 1.8 * (1 - t * 0.8);
      b.box(x + dx * k, y + H * t, z + dz * k, 0.16, H / S + 0.15, 0.16, 0x8b93a6, 0, 12);
    }
  }
  for (let i = 1; i < 4; i++) {
    const k = 1.8 * (1 - (i / 4) * 0.8) * 2;
    b.box(x, y + (H * i) / 4, z, k, 0.08, k, 0x8b93a6, 0, 0);
  }
  b.box(x, y + H + 0.3, z, 0.6, 0.6, 1.6, 0x8b93a6, 0, 0);
  w.addBox(x, z, 2.4, 2.4, y, y + 4, 0, { cam: false });
  w.windmills.push({ x, y: y + H + 0.3, z: z + 1, rot: 0 });
}

function cow(w: World, x: number, z: number, rot: number) {
  const b = w.geo.at('world', x, z);
  b.box(x, 1.05, z, 0.9, 0.9, 1.9, PAL.white, rot, 0);
  b.box(x, 1.2, z, 0.94, 0.5, 0.8, PAL.ink, rot, 4 | 8 | 16 | 32);
  const cs = Math.cos(rot), sn = Math.sin(rot);
  b.box(x + 1.15 * sn, 1.25, z + 1.15 * cs, 0.6, 0.6, 0.7, PAL.white, rot, 0);
  b.box(x + 1.5 * sn, 1.15, z + 1.5 * cs, 0.5, 0.36, 0.2, 0xf2a0a8, rot, 0);
  for (const [lx, lz] of [[-0.3, -0.7], [0.3, -0.7], [-0.3, 0.7], [0.3, 0.7]]) b.box(x + lx * cs + lz * sn, 0.3, z - lx * sn + lz * cs, 0.2, 0.6, 0.2, PAL.white, rot, 8);
  w.addBox(x, z, 1, 2, 0, 1.5, rot, { cam: false });
}

function rail(w: World) {
  const lines = [{ x0: BOUNDS.x0 - 100, x1: BOUNDS.x1 + 100, z: RAIL_Z }, ...w.railLines];
  for (const L of lines) {
    for (let x = L.x0; x < L.x1; x += 60) {
      const xb = Math.min(L.x1, x + 60), mx = (x + xb) / 2;
      w.geo.at('decal', mx, L.z).flat(mx, 0.04, L.z, xb - x, 3.4, 0x9a8f7a);
      const b = w.geo.at('world', mx, L.z);
      for (const dz of [-0.75, 0.75]) b.box(mx, 0.14, L.z + dz, xb - x, 0.14, 0.12, 0x5a6280, 0, 8);
      for (let t = x + 1; t < xb; t += 2.4) w.geo.at('decal', t, L.z).flat(t, 0.06, L.z, 0.5, 2.6, 0x6e4a32);
    }
  }
  // level crossing on Railroad Lane
  const cx = P.crossing.x;
  const b = w.geo.at('world', cx, RAIL_Z);
  w.geo.at('decal', cx, RAIL_Z).flat(cx, ROAD_Y + 0.05, RAIL_Z, 6.4, 4, 0x6e4a32);
  for (const s of [-1, 1]) {
    const px = cx + s * 4.6, pz = RAIL_Z + s * 5;
    b.box(px, 2, pz, 0.16, 4, 0.16, PAL.white, 0, 8);
    b.box(px, 3.6, pz, 2.4, 0.3, 0.06, PAL.white, 0.7, 0);
    b.box(px, 3.6, pz, 2.4, 0.3, 0.06, PAL.white, -0.7, 0);
    w.geo.at('glow', px, pz).box(px - 0.4, 2.8, pz, 0.3, 0.3, 0.12, PAL.red, 0, 0);
    w.geo.at('glow', px, pz).box(px + 0.4, 2.8, pz, 0.3, 0.3, 0.12, PAL.red, 0, 0);
    b.box(px - s * 0.4, 2.6, pz - s * 1.6, 0.12, 4.4, 0.12, PAL.red, 0, 0);
  }
}

export function buildOutskirts(w: World) {
  // ---- family farm (safehouse)
  {
    const x = P.farm.x, z = P.farm.z;
    ground(w, x - 40, z - 34, x + 44, z + 30, 0xbfa678, 0.025);
    house(w, x, z - 15, 0, { wall: 0xf6f0e0, roof: 0x5a6a5c });
    barn(w, x + 26, z - 6, 0.1, false);
    silo(w, x + 38, z - 22);
    windmill(w, x - 26, z + 8);
    cornfield(w, x - 110, z + 6, x - 44, z + 62);
    cornfield(w, x + 50, z + 16, x + 110, z + 70);
    for (const [ax, az, bx, bz] of [[x - 40, z + 30, x + 44, z + 30], [x - 40, z - 34, x - 40, z + 30], [x + 44, z - 34, x + 44, z + 12]]) fence(w, ax, az, bx, bz, 'wood', 1.1, 0);
    w.parkSpots.push({ x: x + 10, z: z + 4, rot: 0.4, y: 0, kind: 'pickup', id: 'farm-truck' });
    w.interacts.push({ id: 'safe-farm', kind: 'safehouse', x, y: 0.16, z: z - 8, r: 3, label: 'Hide out at the farmhouse', data: 'outskirts' });
    w.zones.push({ id: 'safe-farm', kind: 'safe', rect: { x0: x - 9, z0: z - 22, x1: x + 9, z1: z - 4 } });
    // hay bales + scarecrow
    const b = w.geo.at('world', x, z);
    for (let k = 0; k < 6; k++) {
      const bx = x - 14 + (k % 3) * 2.2, bz = z + 16 + Math.floor(k / 3) * 2;
      b.box(bx, 0.6 + (k > 3 ? 1.2 : 0), bz, 2, 1.2, 1.4, 0xe2c27a, 0.1 * k, 8, 0xcfa85a);
    }
    w.addBox(x - 12, z + 17, 6, 4, 0, 1.2, 0, { cam: false });
    const sx = x - 78, sz = z + 34;
    b.box(sx, 1.4, sz, 0.14, 2.8, 0.14, PAL.woodDark, 0, 8);
    b.box(sx, 2.1, sz, 2.4, 0.14, 0.14, PAL.woodDark, 0, 0);
    b.box(sx, 2.0, sz, 0.9, 1.1, 0.4, PAL.navy, 0, 0);
    b.box(sx, 2.0, sz + 0.22, 0.14, 0.9, 0.04, PAL.red, 0, 0);
    b.box(sx, 2.9, sz, 0.6, 0.6, 0.6, 0xf0a05a, 0, 0);
    b.box(sx, 3.3, sz + 0.1, 0.8, 0.3, 0.9, 0xf2c94c, 0, 0);
    w.collectSpots.push({ x: sx, z: sz + 2 }, { x: x + 38, z: z - 22, y: 14 });
  }
  // ---- big barn + cattle
  {
    const x = P.barn.x, z = P.barn.z;
    ground(w, x - 34, z - 30, x + 40, z + 34, 0xbfa678, 0.025);
    barn(w, x, z - 6, -0.2, true);
    silo(w, x - 18, z - 20, 16);
    silo(w, x - 24, z - 12, 12);
    const pen = { x0: x + 12, z0: z - 4, x1: x + 38, z1: z + 28 };
    for (const [ax, az, bx, bz] of [[pen.x0, pen.z0, pen.x1, pen.z0], [pen.x1, pen.z0, pen.x1, pen.z1], [pen.x1, pen.z1, pen.x0, pen.z1], [pen.x0, pen.z1, pen.x0, pen.z0 + 6]]) fence(w, ax, az, bx, bz, 'wood', 1.2, 0);
    for (let k = 0; k < 7; k++) cow(w, w.rng.range(pen.x0 + 3, pen.x1 - 3), w.rng.range(pen.z0 + 3, pen.z1 - 3), w.rng.range(0, TAU));
    windmill(w, x - 28, z + 20);
    cornfield(w, x - 30, z + 40, x + 40, z + 84);
    // tractor
    const b = w.geo.at('world', x - 8, z + 22);
    b.box(x - 8, 1.3, z + 22, 1.6, 1.2, 3.4, 0x4c9a5a, 0.5, 8);
    b.box(x - 8.5, 2.4, z + 21.2, 1.5, 1.4, 1.5, 0x4c9a5a, 0.5, 8, PAL.dark);
    for (const [lx, lz, r] of [[-1, -0.9, 0.95], [1, -0.9, 0.95], [-0.9, 1.3, 0.55], [0.9, 1.3, 0.55]]) b.cyl(x - 8 + lx, 0, z + 22 + lz, r, r, r * 2, 8, PAL.ink, true);
    w.addBox(x - 8, z + 22, 2.4, 3.6, 0, 2.6, 0.5, { cam: false });
    w.parkSpots.push({ x: x + 4, z: z + 16, rot: -0.6, y: 0, kind: 'pickup' });
    w.collectSpots.push({ x: x + 25, z: z + 12 });
  }
  // ---- sheriff
  {
    const x = P.sheriff.x, z = P.sheriff.z;
    ground(w, x - 20, z - 16, x + 22, z + 16, PAL.asphaltDark, 0.03);
    const b = w.geo.at('world', x, z);
    b.box(x - 4, 2.2, z - 6, 18, 4.4, 10, 0xe8d8b0, 0, 8, 0x8a6b4a);
    b.box(x - 4, 4.6, z - 0.4, 18, 0.25, 3, 0x8a6b4a, 0, 0);
    for (const dx of [-12, -4, 4]) b.box(x + dx, 2.2, z + 0.9, 0.25, 4.4, 0.25, PAL.woodDark, 0, 12);
    b.wallQuad(x - 5, 0.05, z - 0.94, 1, 0, 1.3, 2.4, PAL.woodDark);
    for (const dx of [-11, 0]) w.geo.at('glow', x, z).wallQuad(x + dx, 1, z - 0.94, 1, 0, 2.6, 1.5, PAL.windowLight);
    w.signs.text(x - 4, 5.6, z - 0.9, 0, 9, 1.5, 'COUNTY SHERIFF', '#8a6b4a', '#f2c94c');
    w.addBox(x - 4, z - 6, 18, 10, 0, 4.6);
    flagpole(w, x + 9, z + 2, 9, 0);
    // radio mast
    b.cyl(x - 14, 0, z - 12, 0.12, 0.05, 16, 4, 0x8b93a6, false);
    w.parkSpots.push({ x: x + 12, z: z + 8, rot: Math.PI / 2, y: 0, kind: 'police' }, { x: x + 12, z: z + 12, rot: Math.PI / 2, y: 0, kind: 'police' }, { x: x - 12, z: z + 10, rot: 0.2, y: 0, kind: 'pickup' });
    w.guardPosts.push({ x: x - 2, z: z + 3, rot: 0, kind: 'police' }, { x: x + 6, z: z + 5, rot: 0, kind: 'police' });
  }
  // ---- roadside grill
  {
    const x = P.restaurant.x, z = P.restaurant.z;
    ground(w, x - 22, z - 14, x + 22, z + 22, 0xb9a58a, 0.03);
    shop(w, x, z - 4, 22, 12, 4.6, 0, 0xe8c9a0, PAL.red, "MOM'S ROADSIDE GRILL", '#b8262e', '#f6ecd0');
    const b = w.geo.at('world', x + 18, z + 22);
    b.box(x + 18, 4.5, z + 22, 0.5, 9, 0.5, PAL.woodDark, 0, 8);
    w.signs.text(x + 18, 10.2, z + 22, 0.2, 7, 2.8, 'EAT · PIE · GAS', '#f2c94c', '#b8262e', true);
    w.addBox(x + 18, z + 22, 0.6, 0.6, 0, 9, 0, { cam: false });
    w.parkSpots.push({ x: x - 10, z: z + 10, rot: 0.1, y: 0, kind: 'pickup' }, { x: x - 3, z: z + 10, rot: -0.1, y: 0 }, { x: x + 6, z: z + 11, rot: 0, y: 0, kind: 'moto' });
    w.interacts.push({ id: 'grill', kind: 'shop', x: x, y: 0.16, z: z + 4, r: 2.8, label: "Order Mom's pie ($15, restores health)", data: 'burger' });
  }
  // ---- cabin in the woods (hidden safe zone)
  {
    const x = P.cabin.x, z = P.cabin.z, y = w.terrain.h(x, z);
    const b = w.geo.at('world', x, z);
    b.box(x, y + 1.7, z, 8, 3.4, 6, 0x8a6b4a, 0.3, 8);
    for (let k = 1; k < 5; k++) b.box(x, y + k * 0.68, z, 8.1, 0.06, 6.1, 0x6e4a32, 0.3, 4 | 8);
    b.gable(x, y + 3.4, z, 9, 7.4, 2.2, 0x4f5a4a, 0.3, 0x8a6b4a);
    b.box(x - 2.4, y + 4.6, z - 1, 0.8, 2.6, 0.8, 0x8f8a80, 0.3, 8);
    w.addBox(x, z, 8, 6, y - 1, y + 4.6, 0.3);
    w.interacts.push({ id: 'safe-cabin', kind: 'safehouse', x: x + 1.5, y, z: z + 5, r: 3, label: 'Hide out in the secret cabin', data: 'cabin' });
    w.zones.push({ id: 'safe-cabin', kind: 'safe', rect: { x0: x - 8, z0: z - 6, x1: x + 8, z1: z + 9 } });
    w.collectSpots.push({ x: x - 5, z: z + 4, y });
  }
  // ---- orchard + field by Orchard Lane
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) tree(w, -430 + i * 11, -400 + j * 11, 'green', 0.85, 0);
  cornfield(w, -380, -420, -340, -372);
  // ---- west farm strip
  {
    barn(w, -806, 150, 0.3, false);
    windmill(w, -800, 110);
    cornfield(w, -818, 20, -780, 86);
    fence(w, -822, 100, -776, 100, 'wood', 1.1, 0);
    w.parkSpots.push({ x: -796, z: 170, rot: 1.2, y: 0, kind: 'pickup' });
  }
  rail(w);
  // ---- forests on the hills
  const inFlat = (x: number, z: number) => FLAT_ZONES.some((f) => Math.hypot(x - f.x, z - f.z) < f.r + 6);
  for (let x = BOUNDS.x0 - 60; x < 540; x += 13)
    for (let z = BOUNDS.z0 - 60; z < 250; z += 13) {
      const px = x + w.rng.range(-5, 5), pz = z + w.rng.range(-5, 5);
      const out = px < BOUNDS.x0 || pz < BOUNDS.z0;
      if (!out && districtAt(px, pz) !== 'outskirts') continue;
      if (w.roads.distToRoad(px, pz) < 6 || inFlat(px, pz) || Math.abs(pz - RAIL_Z) < 7) continue;
      const h = w.terrain.h(px, pz);
      const dens = fbm(px / 90 + 3, pz / 90 - 5) + Math.min(0.25, h / 60);
      if (dens < 0.5 || w.rng.chance(0.25) || w.inside(px, h + 1, pz)) continue;
      if (h > 4 || dens > 0.62) tree(w, px, pz, 'pine', w.rng.range(0.8, 1.3), h - 0.2);
      else if (w.rng.chance(0.75)) tree(w, px, pz, w.rng.chance(0.6) ? 'green' : 'autumn', w.rng.range(0.9, 1.4), h - 0.1);
      else rock(w, px, pz, w.rng.range(0.5, 1.4), 0x9a968c, h - 0.1);
    }
  // east/north mountain ring gets sparse trees so the horizon is not bare
  for (let i = 0; i < 260; i++) {
    const side = w.rng.next();
    const px = side < 0.5 ? w.rng.range(540, 1000) : w.rng.range(900, 1040);
    const pz = side < 0.5 ? w.rng.range(-760, -600) : w.rng.range(-700, 380);
    const h = w.terrain.h(px, pz);
    if (h > 6) rock(w, px, pz, w.rng.range(1.5, 4), shade(PAL.rock, 0.95), h - 0.4);
  }
  // country power line + billboards + fences along Farm Road 12
  powerLine(w, [[-196, -479], [-330, -479], [-474, -431], [-630, -450]], 0);
  billboard(w, -250, -482, Math.PI, 5, { y: 0, pole: 8 });
  billboard(w, -838, -40, Math.PI / 2, 14, { y: 0, pole: 8 });
  fence(w, -200, -462, -320, -462, 'wood', 1.1, 0);
  fence(w, -360, -456, -460, -422, 'wood', 1.1, 0);
  w.protestSites.push({ x: -480, z: -420, r: 8, d: 'outskirts' });
}
