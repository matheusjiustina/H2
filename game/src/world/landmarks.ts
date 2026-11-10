import { Rect, TAU } from '../core/util';
import { MeshBuilder, shade } from '../render/geo';
import { PAL } from '../render/materials';
import { BRIDGE, GARAGE, ISLAND, P, ROAD_Y, SLAB_Y, TUNNEL } from './layout';
import { classical, curtain, windows } from './buildings';
import { fence, fenceRect, flagpole, lamp, line, patch, stairs, tree } from './props';
import { HEAD_FONT } from './signs';
import type { World } from './world';

const GOLD = 0xd8b24a, GOLD_FRAME = 0x9a7420, GOLD_HI = PAL.gold;
const CONC = 0xcfc8b8;

/** Down-facing quad. */
function ceil(b: MeshBuilder, x0: number, z0: number, x1: number, z1: number, y: number, c: number) {
  b.quad(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1, c);
}

// =============================================================================== Golden Tower
export function goldenTower(w: World) {
  const cx = P.tower.x, cz = P.tower.z;
  const b = w.geo.at('world', cx, cz);
  const y0 = SLAB_Y, H = 7, half = 23;
  const wall = (x: number, z: number, sx: number, sz: number, yb = y0, yt = y0 + H) => {
    b.box(x, (yb + yt) / 2, z, sx, yt - yb, sz, 0x34364f, 0, 0);
    w.addBox(x, z, sx, sz, yb - 0.2, yt);
  };
  wall(cx, cz - half + 0.5, 46, 1);
  wall(cx - half + 0.5, cz, 1, 44);
  wall(cx + half - 0.5, cz, 1, 44);
  wall(cx - 13.25, cz + half - 0.5, 19.5, 1);
  wall(cx + 13.25, cz + half - 0.5, 19.5, 1);
  wall(cx, cz + half - 0.5, 7, 1, y0 + 4.6, y0 + H);
  windows(w, cx, cz, 46, 46, 0, y0, 1, { floorH: 7, w: 3, h: 5, gap: 1.1, sill: 0.7, glass: PAL.glassDark, frame: GOLD_HI, lit: 0.7, margin: 1.4 }, 14);
  for (const sx of [-1, 1])
    for (let k = 0; k < 4; k++) {
      const x = cx + sx * (6 + k * 4.2);
      b.wallQuad(x - 1.7, y0 + 0.55, cz + half + 0.09, 1, 0, 3.4, 5.3, GOLD_HI);
      w.geo.at('glow', cx, cz).wallQuad(x - 1.5, y0 + 0.7, cz + half + 0.18, 1, 0, 3, 5, PAL.windowLight);
    }
  // lobby interior
  patch(w, { x0: cx - 22, z0: cz - 22, x1: cx + 22, z1: cz + 22 }, 0xf3e7c8, y0 + 0.02);
  for (let i = -2; i <= 2; i++) line(w, cx - 21, cz + i * 8, cx + 21, cz + i * 8, 0.25, GOLD, y0 + 0.03);
  patch(w, { x0: cx - 2, z0: cz - 20, x1: cx + 2, z1: cz + 44 }, 0xb8262e, y0 + 0.04);
  b.box(cx, y0 + H - 0.12, cz, 44, 0.2, 44, 0xf3e7c8, 0, 4);
  b.box(cx, y0 + 2.2, cz - 21.6, 6, 4.4, 0.8, GOLD_HI, 0, 0);
  b.wallQuad(cx - 2.2, y0 + 0.1, cz - 21.15, 1, 0, 2.1, 3.6, GOLD_FRAME);
  b.wallQuad(cx + 0.1, y0 + 0.1, cz - 21.15, 1, 0, 2.1, 3.6, GOLD_FRAME);
  w.signs.text(cx, y0 + 5.2, cz - 21.9, 0, 7, 1.1, 'PRIVATE ELEVATOR · ROOF', '#1d1a2e', '#f2c94c');
  b.box(cx + 13, y0 + 0.6, cz + 4, 8, 1.2, 1.8, 0x5a3a2c, 0, 8, GOLD_HI);
  w.addBox(cx + 13, cz + 4, 8, 1.8, 0, y0 + 1.2, 0, { cam: false });
  w.signs.text(cx + 21.8, y0 + 3.4, cz + 4, -Math.PI / 2, 8, 1.6, 'EMPLOYEE OF THE MONTH: ME', '#f6ecd0', '#b8262e');
  w.signs.text(cx - 21.8, y0 + 3.4, cz - 4, Math.PI / 2, 9, 1.6, 'THE BEST LOBBY. EVERYONE SAYS SO.', '#1d1a2e', '#f2c94c');
  for (const [dx, dz] of [[-11, -9], [11, -9], [-11, 11], [11, 11]]) {
    b.cyl(cx + dx, y0, cz + dz, 0.9, 0.9, H - 0.2, 8, GOLD_HI, false);
    w.addBox(cx + dx, cz + dz, 1.7, 1.7, 0, y0 + H, 0, { cam: false });
  }
  for (const [dx, dz] of [[-19, 19], [19, 19], [-19, -19], [19, -19]]) {
    b.cyl(cx + dx, y0, cz + dz, 0.7, 0.9, 1, 6, 0x8f3f36, true);
    b.blob(cx + dx, y0 + 1.9, cz + dz, 1, 1.2, 1, 0x5fa35a, dx * 7 + dz, 0.3);
  }
  // entrance canopy + signage
  b.box(cx, y0 + 5.1, cz + half + 3, 12, 0.5, 6, GOLD_HI, 0, 0);
  for (const dx of [-5.4, 5.4]) b.box(cx + dx, y0 + 2.5, cz + half + 5.6, 0.35, 5, 0.35, GOLD_FRAME, 0, 12);
  w.signs.text(cx, y0 + 9.6, cz + half + 0.35, 0, 18, 2.8, 'GOLDEN TOWER', '#1d1a2e', '#f2c94c');
  flagpole(w, cx - 10, cz + half + 7, 11);
  flagpole(w, cx + 10, cz + half + 7, 11);
  // shaft tiers
  curtain(w, cx, cz, 46, 46, y0 + H, 110, GOLD, GOLD_FRAME, 0, 0.5);
  curtain(w, cx, cz, 36, 36, 110, 135, GOLD, GOLD_FRAME, 0, 0.5);
  curtain(w, cx, cz, 26, 26, 135, 150, GOLD, GOLD_FRAME, 0, 0.5);
  b.box(cx, 110.4, cz, 47.5, 1, 47.5, GOLD_HI, 0, 0);
  b.box(cx, 135.4, cz, 37.5, 1, 37.5, GOLD_HI, 0, 0);
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(cx + dx * 23, 58.5, cz + dz * 23, 1.6, 103, 1.6, GOLD_HI, 0, 12);
  // giant T emblems
  for (const s of [-1, 1]) {
    b.box(cx, 97, cz + s * 23.6, 18, 4.6, 1.1, GOLD_HI, 0, 0);
    b.box(cx, 83, cz + s * 23.6, 5, 24, 1.1, GOLD_HI, 0, 0);
    b.box(cx + s * 23.6, 97, cz, 1.1, 4.6, 18, GOLD_HI, 0, 0);
    b.box(cx + s * 23.6, 83, cz, 1.1, 24, 5, GOLD_HI, 0, 0);
  }
  // roof: helipad, parapet, penthouse elevator, spire
  const ry = 150;
  for (const [dx, dz, sx, sz] of [[0, -12.8, 26, 0.4], [0, 12.8, 26, 0.4], [-12.8, 0, 0.4, 26], [12.8, 0, 0.4, 26]]) {
    b.box(cx + dx, ry + 0.5, cz + dz, sx, 1, sz, GOLD_FRAME, 0, 8);
    w.addBox(cx + dx, cz + dz, sx, sz, ry - 0.5, ry + 1, 0, { cam: false });
  }
  b.box(cx, ry + 2, cz - 10.4, 6, 4, 4, 0x34364f, 0, 8, GOLD_FRAME);
  b.wallQuad(cx - 1.2, ry + 0.1, cz - 8.35, 1, 0, 2.4, 3, GOLD_HI);
  w.addBox(cx, cz - 10.4, 6, 4, ry - 0.5, ry + 4);
  b.cyl(cx, ry + 4, cz - 10.4, 0.5, 0.08, 24, 5, GOLD_HI, false);
  w.geo.at('glow', cx, cz).blob(cx, ry + 28.2, cz - 10.4, 0.5, 0.5, 0.5, PAL.red, 5, 0);
  w.signs.addFlat('helipad', P.helipad.x, ry + 0.06, P.helipad.z, 0, 15, 15, 160, 160, (g, W, Hh) => {
    g.fillStyle = '#6f7892';
    g.fillRect(0, 0, W, Hh);
    g.strokeStyle = '#f2c230';
    g.lineWidth = 9;
    g.beginPath();
    g.arc(W / 2, Hh / 2, W / 2 - 10, 0, TAU);
    g.stroke();
    g.fillStyle = '#f4f1e6';
    g.font = `110px ${HEAD_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('T', W / 2, Hh / 2 + 8);
  });
  w.interacts.push(
    { id: 'tower-up', kind: 'elevator', x: cx, y: y0, z: cz - 19.5, r: 3.2, label: 'Ride the golden elevator to the roof', to: { x: cx, y: ry, z: cz - 6 } },
    { id: 'tower-down', kind: 'elevator', x: cx, y: ry, z: cz - 7.6, r: 2.6, label: 'Ride the elevator down to the lobby', to: { x: cx, y: y0, z: cz - 17 } },
  );
  w.parkSpots.push({ x: P.helipad.x, z: P.helipad.z, rot: 0, y: ry, kind: 'heli', id: 'tower-heli' });
  w.collectSpots.push({ x: cx - 10, z: cz + 10, y: ry }, { x: cx + 19, z: cz - 19, y: 110 });
}

export function goldStatue(w: World, x: number, z: number) {
  const b = w.geo.at('world', x, z);
  const y = SLAB_Y;
  b.box(x, y + 0.5, z, 7, 1, 7, PAL.stoneDark, 0, 8);
  b.box(x, y + 2.5, z, 4.6, 3, 4.6, PAL.stone, 0, 8);
  const g = PAL.gold, gd = PAL.goldDark, py = y + 4;
  b.box(x - 0.75, py + 1.2, z, 1.15, 2.4, 1.3, gd, 0, 8);
  b.box(x + 0.75, py + 1.2, z, 1.15, 2.4, 1.3, gd, 0, 8);
  b.box(x, py + 4.0, z, 3.3, 3.4, 2.0, g, 0, 0);
  b.box(x, py + 3.6, z + 1.03, 0.5, 3.4, 0.12, gd, 0, 0);
  b.box(x, py + 6.6, z, 1.9, 1.9, 1.9, g, 0, 0);
  b.box(x, py + 7.65, z + 0.2, 2.3, 0.7, 2.7, shade(g, 1.12), 0, 0);
  b.box(x + 0.25, py + 7.5, z + 1.45, 2.0, 0.5, 0.8, shade(g, 1.12), 0.15, 0);
  b.box(x - 2.1, py + 3.9, z, 0.95, 3.0, 1.0, g, 0, 0);
  b.box(x + 2.15, py + 5.7, z, 0.95, 1.6, 1.0, g, 0, 0);
  b.box(x + 2.35, py + 7.3, z, 0.95, 2.2, 1.0, g, 0, 0);
  b.blob(x + 2.35, py + 8.7, z, 0.75, 0.75, 0.75, shade(g, 1.1), 9, 0.1);
  w.signs.text(x, y + 2.6, z + 2.34, 0, 4, 1.2, 'THE GREATEST STATUE. EVER.', '#1d1a2e', '#f2c94c');
  w.addBox(x, z, 7, 7, 0, y + 1, 0, { cam: false });
  w.addBox(x, z, 4.6, 4.6, 0, y + 12);
}

// =============================================================================== underground
export function garage(w: World) {
  const G = GARAGE, R = G.room;
  const yT = SLAB_Y, yB = G.depth;
  const mx = (G.rampX0 + G.rampX1) / 2;
  const b = w.geo.at('world', mx, 90);
  // open ramp
  b.quad(G.rampX0, yT, G.rampZ0, G.rampX0, yB, G.rampZ1, G.rampX1, yB, G.rampZ1, G.rampX1, yT, G.rampZ0, PAL.asphaltDark);
  b.tri(G.rampX0, yB, G.rampZ1, G.rampX0, yT, G.rampZ0, G.rampX0, yT, G.rampZ1, CONC);
  b.tri(G.rampX1, yB, G.rampZ1, G.rampX1, yT, G.rampZ1, G.rampX1, yT, G.rampZ0, CONC);
  w.addBox(mx, (G.rampZ0 + G.rampZ1) / 2, 10, G.rampZ1 - G.rampZ0, yB - 1, yT, 0, { ramp: { axis: 'z', ya: yT, yb: yB }, cam: false });
  fence(w, G.rampX0 - 0.3, G.rampZ0, G.rampX0 - 0.3, G.rampZ1 + 0.5, 'wall', 1.0, SLAB_Y);
  fence(w, G.rampX1 + 0.3, G.rampZ0, G.rampX1 + 0.3, G.rampZ1 + 0.5, 'wall', 1.0, SLAB_Y);
  fence(w, G.rampX0 - 0.3, G.rampZ1 + 0.3, G.rampX1 + 0.3, G.rampZ1 + 0.3, 'wall', 1.0, SLAB_Y);
  w.signs.text(mx, 3.6, G.rampZ1 + 0.62, Math.PI, 8, 1.5, 'GOLDEN TOWER PARKING', '#2f5fa8', '#f6ecd0');
  b.box(mx - 4.6, 2.1, G.rampZ1 + 0.3, 0.3, 4, 0.3, PAL.dark, 0, 8);
  b.box(mx + 4.6, 2.1, G.rampZ1 + 0.3, 0.3, 4, 0.3, PAL.dark, 0, 8);
  // room
  const rb = w.geo.at('world', (R.x0 + R.x1) / 2, (R.z0 + R.z1) / 2);
  const rw = R.x1 - R.x0, rd = R.z1 - R.z0, ch = 4.2;
  rb.flat((R.x0 + R.x1) / 2, yB, (R.z0 + R.z1) / 2, rw, rd, 0x7b8298);
  ceil(rb, R.x0, R.z0, R.x1, R.z1, yB + ch, 0xb9b4a6);
  rb.wallQuad(R.x0, yB, R.z1, 0, -1, rd, ch, CONC); // west wall facing +x
  rb.wallQuad(R.x1, yB, R.z0, 0, 1, rd, ch, CONC); // east wall facing -x
  rb.wallQuad(R.x1, yB, R.z1, -1, 0, rw, ch, CONC); // south wall facing -z
  rb.wallQuad(G.rampX1, yB, R.z0, 1, 0, R.x1 - G.rampX1, ch, CONC); // north wall facing +z (east of the ramp mouth)
  rb.wallQuad(G.rampX1, yB + ch, R.z0, -1, 0, 10, yT - (yB + ch) + 0.01, CONC); // lintel over the ramp mouth, facing the ramp
  w.addRect(R, yB - 1, yB, { cam: false });
  w.addRect(R, -0.8, 0);
  w.addBox(R.x0 - 0.5, (G.rampZ0 + R.z1) / 2, 1, R.z1 - G.rampZ0, yB - 1, 0);
  w.addBox(R.x1 + 0.5, (R.z0 + R.z1) / 2, 1, rd, yB - 1, 0);
  w.addBox((R.x0 + R.x1) / 2, R.z1 + 0.5, rw + 2, 1, yB - 1, 0);
  w.addBox((G.rampX1 + R.x1) / 2, R.z0 - 0.5, R.x1 - G.rampX1, 1, yB - 1, 0);
  w.addBox(G.rampX1 + 0.5, (G.rampZ0 + G.rampZ1) / 2 - 0.5, 1, G.rampZ1 - G.rampZ0 - 1, yB - 1, 0);
  for (let x = R.x0 + 16; x < R.x1 - 4; x += 16)
    for (const z of [R.z0 + 10, R.z1 - 10]) {
      rb.box(x, yB + ch / 2, z, 0.9, ch, 0.9, CONC, 0, 12);
      rb.box(x, yB + 0.6, z, 1.0, 1.2, 1.0, PAL.lineYellow, 0, 12);
      w.addBox(x, z, 0.9, 0.9, yB - 1, 0, 0, { cam: false });
    }
  const gl = w.geo.at('glow', (R.x0 + R.x1) / 2, (R.z0 + R.z1) / 2);
  for (let x = R.x0 + 8; x < R.x1; x += 12) gl.box(x, yB + ch - 0.06, (R.z0 + R.z1) / 2, 5, 0.1, 0.5, PAL.paper, 0, 4);
  for (let x = R.x0 + 14; x < R.x1 - 3; x += 3.1) {
    rb.flat(x, yB + 0.02, R.z1 - 3, 0.12, 5.4, PAL.line);
    rb.flat(x, yB + 0.02, R.z0 + 3, 0.12, 5.4, PAL.line);
  }
  w.parkSpots.push(
    { x: R.x1 - 12, z: R.z1 - 3.2, rot: Math.PI, y: yB, kind: 'limo', id: 'garage-limo' },
    { x: R.x1 - 24, z: R.z1 - 3.2, rot: Math.PI, y: yB, kind: 'sports' },
    { x: R.x1 - 34, z: R.z0 + 3.2, rot: 0, y: yB, kind: 'suv' },
    { x: R.x1 - 46, z: R.z0 + 3.2, rot: 0, y: yB, kind: 'moto' },
  );
  w.interacts.push({ id: 'safe-garage', kind: 'safehouse', x: R.x1 - 4, y: yB, z: (R.z0 + R.z1) / 2, r: 3.5, label: 'Lay low in the VIP garage', data: 'downtown' });
  rb.box(R.x1 - 1.2, yB + 1.2, (R.z0 + R.z1) / 2, 1.6, 2.4, 3, GOLD_HI, 0, 8);
  w.zones.push({ id: 'garage', kind: 'hide', rect: R }, { id: 'garage-safe', kind: 'safe', rect: { x0: R.x1 - 10, z0: R.z0, x1: R.x1, z1: R.z1 } });
  w.collectSpots.push({ x: R.x0 + 6, z: R.z1 - 5, y: yB });
}

export function tunnel(w: World) {
  const T = TUNNEL;
  const yT = SLAB_Y, yB = T.depth, ch = 5;
  const x0 = T.x0, x1 = T.x1, mx = (x0 + x1) / 2;
  const wallC = 0xbfb9a8;
  // north ramp (descends toward +z)
  let b = w.geo.at('world', mx, (T.zTop + T.zIn) / 2);
  b.quad(x0, yT, T.zTop, x0, yB, T.zIn, x1, yB, T.zIn, x1, yT, T.zTop, PAL.asphaltDark);
  b.tri(x0, yB, T.zIn, x0, yT, T.zTop, x0, yT, T.zIn, wallC);
  b.tri(x1, yB, T.zIn, x1, yT, T.zIn, x1, yT, T.zTop, wallC);
  b.wallQuad(x1, yB + ch, T.zIn, -1, 0, 10, yT - (yB + ch), wallC);
  w.signs.text(mx, yB + ch + 0.6, T.zIn - 0.05, Math.PI, 8, 0.9, 'GOVERNMENT SERVICE TUNNEL', '#1d1a2e', '#f2c230');
  w.addBox(mx, (T.zTop + T.zIn) / 2, 10, T.zIn - T.zTop, yB - 1, yT, 0, { ramp: { axis: 'z', ya: yT, yb: yB }, cam: false });
  // south ramp (rises toward +z)
  b = w.geo.at('world', mx, (T.zOut + T.zEnd) / 2);
  b.quad(x0, yB, T.zOut, x0, yT, T.zEnd, x1, yT, T.zEnd, x1, yB, T.zOut, PAL.asphaltDark);
  b.tri(x0, yB, T.zOut, x0, yT, T.zOut, x0, yT, T.zEnd, wallC);
  b.tri(x1, yB, T.zOut, x1, yT, T.zEnd, x1, yT, T.zOut, wallC);
  b.wallQuad(x0, yB + ch, T.zOut, 1, 0, 10, yT - (yB + ch), wallC);
  w.signs.text(mx, yB + ch + 0.6, T.zOut + 0.05, 0, 8, 0.9, 'AUTHORIZED VEHICLES ONLY', '#1d1a2e', '#f2c230');
  w.addBox(mx, (T.zOut + T.zEnd) / 2, 10, T.zEnd - T.zOut, yB - 1, yT, 0, { ramp: { axis: 'z', ya: yB, yb: yT }, cam: false });
  // covered bore
  const len = T.zOut - T.zIn;
  const parts = Math.ceil(len / 52);
  for (let i = 0; i < parts; i++) {
    const z0 = T.zIn + (len * i) / parts, z1 = T.zIn + (len * (i + 1)) / parts;
    b = w.geo.at('world', mx, (z0 + z1) / 2);
    b.flat(mx, yB, (z0 + z1) / 2, 10, z1 - z0, PAL.asphaltDark);
    ceil(b, x0, z0, x1, z1, yB + ch, 0xa9a394);
    b.wallQuad(x0, yB, z1, 0, -1, z1 - z0, ch, wallC);
    b.wallQuad(x1, yB, z0, 0, 1, z1 - z0, ch, wallC);
    b.wallQuad(x0 + 0.02, yB + 1.1, z1, 0, -1, z1 - z0, 0.35, PAL.lineYellow);
    b.wallQuad(x1 - 0.02, yB + 1.1, z0, 0, 1, z1 - z0, 0.35, PAL.lineYellow);
    b.flat(mx, yB + 0.02, (z0 + z1) / 2, 0.16, z1 - z0, PAL.lineYellow);
    const gl = w.geo.at('glow', mx, (z0 + z1) / 2);
    for (let z = z0 + 6; z < z1; z += 13) gl.box(mx, yB + ch - 0.06, z, 5, 0.1, 0.6, PAL.paper, 0, 4);
  }
  w.addBox(mx, (T.zIn + T.zOut) / 2, 10, len, yB - 1, yB, 0, { cam: false });
  w.addBox(mx, (T.zIn + T.zOut) / 2, 10, len, -0.9, 0);
  const full = T.zEnd - T.zTop;
  w.addBox(x0 - 0.5, (T.zTop + T.zEnd) / 2, 1, full, yB - 1, 0);
  w.addBox(x1 + 0.5, (T.zTop + T.zEnd) / 2, 1, full, yB - 1, 0);
  // surface railings around the open cuts
  for (const [za, zb, endZ] of [[T.zTop, T.zIn, T.zIn + 0.3], [T.zOut, T.zEnd, T.zOut - 0.3]]) {
    fence(w, x0 - 0.3, za, x0 - 0.3, zb, 'wall', 1.0, SLAB_Y);
    fence(w, x1 + 0.3, za, x1 + 0.3, zb, 'wall', 1.0, SLAB_Y);
    fence(w, x0 - 0.3, endZ, x1 + 0.3, endZ, 'wall', 1.0, SLAB_Y);
  }
  w.addGate('tunnel', mx, T.zIn + 1.2, 10, 0.6, yB, yB + ch, 0, 0x4a4f66, false);
  w.zones.push({ id: 'tunnel', kind: 'hide', rect: { x0, x1, z0: T.zIn, z1: T.zOut } });
  w.collectSpots.push({ x: mx, z: -230, y: yB });
}

/** Three-level open parking structure with drivable ramps. */
export function parkingStructure(w: World, x0: number, z0: number) {
  const W = 56, D = 34, L = [SLAB_Y, 3.7, 7.3];
  const b = w.geo.at('world', x0 + W / 2, z0 + D / 2);
  const deck = (r: Rect, y: number) => {
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    b.box(cx, y - 0.2, cz, r.x1 - r.x0, 0.4, r.z1 - r.z0, CONC, 0, 0, 0x8a8fa2);
    w.addBox(cx, cz, r.x1 - r.x0, r.z1 - r.z0, y - 0.4, y);
  };
  // level 1 (hole above ramp A: x0+12..x0+40, z0..z0+8)
  deck({ x0, x1: x0 + W, z0: z0 + 8, z1: z0 + D }, L[1]);
  deck({ x0, x1: x0 + 12, z0, z1: z0 + 8 }, L[1]);
  deck({ x0: x0 + 40, x1: x0 + W, z0, z1: z0 + 8 }, L[1]);
  // level 2 / roof (hole above ramp B: x0+16..x0+44, z0+26..z0+34)
  deck({ x0, x1: x0 + W, z0, z1: z0 + 26 }, L[2]);
  deck({ x0, x1: x0 + 16, z0: z0 + 26, z1: z0 + D }, L[2]);
  deck({ x0: x0 + 44, x1: x0 + W, z0: z0 + 26, z1: z0 + D }, L[2]);
  const ramp = (xa: number, xb: number, zc: number, ya: number, yb: number, solidBase: number) => {
    // surface rises from xa (ya) to xb (yb)
    const lo = Math.min(xa, xb), hi = Math.max(xa, xb);
    const yl = xa < xb ? ya : yb, yh = xa < xb ? yb : ya;
    b.quad(lo, yl, zc - 4, lo, yl, zc + 4, hi, yh, zc + 4, hi, yh, zc - 4, 0x8a8fa2);
    b.quad(lo, yl - 0.4, zc - 4, hi, yh - 0.4, zc - 4, hi, yh - 0.4, zc + 4, lo, yl - 0.4, zc + 4, CONC);
    b.quad(lo, yl - 0.4, zc + 4, hi, yh - 0.4, zc + 4, hi, yh, zc + 4, lo, yl, zc + 4, CONC);
    b.quad(hi, yh - 0.4, zc - 4, lo, yl - 0.4, zc - 4, lo, yl, zc - 4, hi, yh, zc - 4, CONC);
    w.addBox((lo + hi) / 2, zc, hi - lo, 8, solidBase, Math.max(yl, yh), 0, { ramp: { axis: 'x', ya: yl, yb: yh }, cam: false });
  };
  ramp(x0 + 12, x0 + 40, z0 + 4, L[0], L[1], 0);
  ramp(x0 + 44, x0 + 16, z0 + 30, L[1], L[2], L[1] - 0.4);
  // columns
  for (let x = x0 + 1; x <= x0 + W; x += 13.5)
    for (const z of [z0 + 0.5, z0 + 9, z0 + 25, z0 + D - 0.5]) {
      b.box(x, L[2] / 2, z, 0.8, L[2], 0.8, shade(CONC, 0.9), 0, 12);
      w.addBox(x, z, 0.8, 0.8, 0, L[2], 0, { cam: false });
    }
  // parapets on the upper decks (ground level stays open)
  for (const y of [L[1], L[2]]) {
    const wallSeg = (ax: number, az: number, bx: number, bz: number) => {
      const cx = (ax + bx) / 2, cz = (az + bz) / 2, sx = Math.abs(bx - ax) + 0.3, sz = Math.abs(bz - az) + 0.3;
      b.box(cx, y + 0.55, cz, sx, 1.1, sz, CONC, 0, 8);
      w.addBox(cx, cz, sx, sz, y - 0.4, y + 1.1, 0, { cam: false });
    };
    wallSeg(x0, z0 + D, x0 + W, z0 + D);
    wallSeg(x0 + W, z0, x0 + W, z0 + D);
    wallSeg(x0, z0, x0, z0 + D);
    if (y === L[1]) {
      wallSeg(x0, z0, x0 + 12, z0);
      wallSeg(x0 + 40, z0, x0 + W, z0);
    } else wallSeg(x0, z0, x0 + W, z0);
  }
  // stalls on every level
  L.forEach((y, li) => {
    for (let x = x0 + 5; x < x0 + W - 4; x += 3) {
      b.flat(x, y + 0.03, z0 + 17, 0.12, 5, PAL.line);
      if (w.rng.chance(li === 2 ? 0.25 : 0.45)) w.parkSpots.push({ x: x + 1.5, z: z0 + 17, rot: w.rng.chance(0.5) ? 0 : Math.PI, y });
    }
  });
  // stair tower + roof ladder
  b.box(x0 + W + 2.2, 5.4, z0 + D - 3, 4, 10.8, 5, 0xb8433a, 0, 8);
  w.addBox(x0 + W + 2.2, z0 + D - 3, 4, 5, 0, 10.8);
  w.signs.text(x0 + W + 2.2, 9, z0 + D - 0.4, 0, 3.6, 1.4, 'PARKING', '#2f5fa8', '#f6ecd0');
  w.signs.text(x0 + 6, 2.9, z0 - 0.2, Math.PI, 9, 1.2, 'PUBLIC PARKING · ENTER', '#2f5fa8', '#f6ecd0');
  w.interacts.push(
    { id: 'park-up', kind: 'ladder', x: x0 + W + 2.2, y: SLAB_Y, z: z0 + D + 0.4, r: 2.4, label: 'Take the stairs to the roof deck', to: { x: x0 + W - 3, y: L[2], z: z0 + D - 4 } },
    { id: 'park-down', kind: 'ladder', x: x0 + W - 2, y: L[2], z: z0 + D - 3, r: 2.2, label: 'Take the stairs down', to: { x: x0 + W + 2.2, y: SLAB_Y, z: z0 + D + 2 } },
  );
  w.zones.push({ id: 'parking', kind: 'hide', rect: { x0, z0, x1: x0 + W, z1: z0 + D } });
  w.collectSpots.push({ x: x0 + 6, z: z0 + 12, y: L[2] });
}

// =============================================================================== Government
export function whiteHouse(w: World, slabR: Rect) {
  const cx = P.whiteHouse.x, cz = P.whiteHouse.z;
  const b = w.geo.at('world', cx, cz);
  const y = SLAB_Y, white = PAL.white;
  const H = 11;
  b.box(cx, y + H / 2, cz, 54, H, 18, white, 0, 8, 0xb9bcc4);
  b.box(cx, y + H + 0.5, cz, 55, 1, 19, shade(white, 0.92), 0, 0);
  windows(w, cx, cz, 54, 18, 0, y + 0.6, 2, { floorH: 4.8, w: 1.5, h: 2.8, gap: 2.2, sill: 1.0, glass: PAL.window, frame: 0xd9d6cc, lit: 0.5, margin: 2 });
  w.addBox(cx, cz, 54, 18, 0, y + H + 1);
  for (const s of [-1, 1]) {
    b.box(cx + s * 37, y + 2.8, cz, 20, 5.6, 10, white, 0, 8, 0xb9bcc4);
    windows(w, cx + s * 37, cz, 20, 10, 0, y + 0.4, 1, { floorH: 5, w: 1.3, h: 2.6, gap: 1.8, sill: 1.1, glass: PAL.window, frame: 0xd9d6cc, lit: 0.4 });
    w.addBox(cx + s * 37, cz, 20, 10, 0, y + 5.6);
  }
  // north portico with pediment
  for (let i = 0; i < 4; i++) b.cyl(cx - 6 + i * 4, y, cz - 13, 0.6, 0.55, 9.5, 8, white, false);
  b.box(cx, y + 9.9, cz - 11.5, 15, 0.8, 5, white, 0, 0);
  b.gable(cx, y + 10.3, cz - 11.5, 5, 15, 2.6, shade(white, 0.95), Math.PI / 2, white);
  b.box(cx, y + 0.25, cz - 11.5, 15, 0.5, 5, 0xd9d6cc, 0, 8);
  // south bow with roof terrace (the boss balcony)
  b.cyl(cx, y, cz + 9, 7, 7, 9.2, 12, white, true);
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * Math.PI;
    b.cyl(cx + Math.cos(a) * 8.2, y, cz + 9 + Math.sin(a) * 8.2, 0.5, 0.45, 9.2, 6, white, false);
  }
  b.cyl(cx, y + 9.2, cz + 9, 9, 9, 0.5, 14, shade(white, 0.94), true);
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI;
    b.box(cx + Math.cos(a) * 8.7, y + 10.2, cz + 9 + Math.sin(a) * 8.7, 0.25, 1.0, 0.25, white, 0, 8);
  }
  w.addBox(cx, cz + 13, 17, 9, 0, y + 9.7);
  flagpole(w, cx, cz, 7, y + H + 1, 1.2);
  // grounds
  patch(w, { x0: slabR.x0 + 3.5, z0: slabR.z0 + 3.5, x1: slabR.x1 - 3.5, z1: slabR.z1 - 3.5 }, PAL.lawn, SLAB_Y + 0.02, { x0: TUNNEL.x0 - 1, x1: TUNNEL.x1 + 1, z0: TUNNEL.zTop, z1: TUNNEL.zIn + 1 });
  const F = { x0: slabR.x0 + 3.5, z0: slabR.z0 + 3.5, x1: slabR.x1 - 3.5, z1: slabR.z1 - 3.5 };
  fenceRect(w, F, 'iron', [[3, P.whGate.z, 9], [2, cx + 30, 6]], 2.4);
  w.addGate('wh-west', F.x0, P.whGate.z, 0.5, 9, 0, 3.2, 0, 0x26283a, true);
  w.addGate('wh-south', cx + 30, F.z1, 6, 0.5, 0, 3.2, 0, 0x26283a, true);
  // driveway from the west gate to the service-tunnel ramp
  patch(w, { x0: F.x0, z0: P.whGate.z - 3.5, x1: TUNNEL.x1 + 1.5, z1: P.whGate.z + 3.5 }, PAL.asphaltDark);
  patch(w, { x0: TUNNEL.x0 - 0.5, z0: P.whGate.z - 3.5, x1: TUNNEL.x1 + 0.5, z1: TUNNEL.zTop + 0.2 }, PAL.asphaltDark);
  // guard booth
  b.box(F.x0 + 3, y + 1.4, P.whGate.z - 7, 3, 2.8, 3, white, 0, 8, PAL.navy);
  w.addBox(F.x0 + 3, P.whGate.z - 7, 3, 3, 0, y + 2.8);
  w.guardPosts.push({ x: F.x0 + 3, z: P.whGate.z + 6, rot: -Math.PI / 2, kind: 'security' }, { x: cx + 26, z: F.z1 - 3, rot: 0, kind: 'security' },
    { x: cx - 20, z: cz + 22, rot: 0, kind: 'security' }, { x: cx + 40, z: cz + 30, rot: 0, kind: 'security' });
  // fountain on the south lawn + path
  fountain(w, cx + 22, cz + 44, 6);
  patch(w, { x0: cx + 28.5, z0: cz + 26, x1: cx + 31.5, z1: F.z1 }, 0xe9dfc4);
  for (const [dx, dz] of [[-45, 30], [-38, 60], [48, 22], [50, 62], [10, 64], [-50, -22], [50, -22], [-30, -24], [30, -24], [5, 30], [-48, 45]])
    tree(w, cx + dx, cz + dz, 'green', 1.15);
  fence(w, cx - 9, cz + 30, cx + 9, cz + 30, 'hedge', 0.9);
  w.zones.push({ id: 'whitehouse', kind: 'restricted', rect: F, label: 'White House grounds' });
  w.collectSpots.push({ x: cx - 44, z: cz + 20 }, { x: cx, z: cz + 12, y: y + 9.7 });
}

export function fountain(w: World, x: number, z: number, r: number) {
  const b = w.geo.at('world', x, z);
  b.cyl(x, SLAB_Y, z, r, r, 0.7, 12, PAL.stone, false);
  b.cyl(x, SLAB_Y + 0.45, z, r - 0.5, r - 0.5, 0.05, 12, PAL.water, true);
  b.cyl(x, SLAB_Y, z, 0.8, 0.5, 2.2, 8, PAL.stone, true);
  b.cyl(x, SLAB_Y + 2.2, z, 1.8, 0.9, 0.35, 10, PAL.stoneDark, true);
  b.blob(x, SLAB_Y + 3.2, z, 0.7, 1, 0.7, 0xd6f0f2, 4, 0.3);
  w.addBox(x, z, r * 1.7, r * 1.7, 0, SLAB_Y + 0.7, 0, { cam: false });
}

export function capitol(w: World) {
  const cx = P.capitol.x + 7, cz = P.capitol.z;
  const b = w.geo.at('world', cx, cz);
  const y = SLAB_Y, white = 0xf3efe2, T = 3.2;
  b.box(cx, y + T / 2, cz, 60, T, 84, PAL.stone, 0, 8, 0xe9dfc4);
  w.addBox(cx, cz, 60, 84, 0, y + T);
  stairs(w, cx - 36, cz, Math.PI / 2, 30, 12, y, y + T, PAL.stone);
  const ty = y + T;
  const block = (dz: number, sx: number, sz: number, h: number) => {
    b.box(cx + 2, ty + h / 2, cz + dz, sx, h, sz, white, 0, 8, 0xb9bcc4);
    b.box(cx + 2, ty + h + 0.4, cz + dz, sx + 1, 0.8, sz + 1, shade(white, 0.93), 0, 0);
    windows(w, cx + 2, cz + dz, sx, sz, 0, ty + 0.5, Math.floor(h / 4.4), { floorH: 4.4, w: 1.4, h: 2.7, gap: 2.0, sill: 1, glass: PAL.window, frame: 0xd9d6cc, lit: 0.35, margin: 2.4 });
    w.addBox(cx + 2, cz + dz, sx, sz, ty - 0.2, ty + h + 0.8);
    // west portico
    const n = Math.round(sz / 3.4);
    for (let i = 0; i < n; i++) b.cyl(cx + 2 - sx / 2 - 2.6, ty, cz + dz - sz / 2 + 1.6 + ((sz - 3.2) * i) / (n - 1), 0.65, 0.6, h - 1.6, 8, white, false);
    b.box(cx + 2 - sx / 2 - 1.6, ty + h - 1.2, cz + dz, 4, 0.8, sz, white, 0, 0);
    b.gable(cx + 2 - sx / 2 - 1.6, ty + h - 0.8, cz + dz, 4, sz, 2.4, shade(white, 0.95), 0, white);
  };
  block(0, 34, 30, 16);
  block(-30, 28, 22, 12.5);
  block(30, 28, 22, 12.5);
  b.box(cx + 4, ty + 5.5, cz - 17, 20, 11, 8, white, 0, 8);
  b.box(cx + 4, ty + 5.5, cz + 17, 20, 11, 8, white, 0, 8);
  // drum, colonnade and dome
  let dy = ty + 16.8;
  b.cyl(cx + 2, dy, cz, 11, 11, 9, 16, white, true);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    b.cyl(cx + 2 + Math.cos(a) * 12.2, dy, cz + Math.sin(a) * 12.2, 0.5, 0.45, 8.2, 6, white, false);
  }
  b.cyl(cx + 2, dy + 8.2, cz, 13, 13, 0.8, 16, shade(white, 0.94), true);
  dy += 9;
  b.cyl(cx + 2, dy, cz, 10.4, 9, 4, 16, white, false);
  b.cyl(cx + 2, dy + 4, cz, 9, 6.2, 4.2, 16, shade(white, 0.97), false);
  b.cyl(cx + 2, dy + 8.2, cz, 6.2, 2.6, 3.4, 16, white, true);
  b.cyl(cx + 2, dy + 11.6, cz, 2.1, 2.1, 4, 8, white, true);
  b.cyl(cx + 2, dy + 15.6, cz, 2.3, 0.6, 1.6, 8, shade(white, 0.92), true);
  b.cyl(cx + 2, dy + 17.2, cz, 0.5, 0.2, 3, 5, 0x8a8f80, true);
  w.addBox(cx + 2, cz, 21, 21, ty + 16, dy + 12);
  flagpole(w, cx - 12, cz - 20, 8, ty + 13.3);
  flagpole(w, cx - 12, cz + 20, 8, ty + 13.3);
  w.collectSpots.push({ x: cx - 20, z: cz + 36, y: ty }, { x: cx + 2, z: cz + 13, y: ty + 16.8 });
}

export function obelisk(w: World) {
  const x = P.obelisk.x, z = P.obelisk.z;
  const b = w.geo.at('world', x, z);
  w.geo.at('decal', x, z).cyl(x, SLAB_Y + 0.025, z, 24, 24, 0.01, 20, 0xe9dfc4, true);
  b.cyl(x, SLAB_Y, z, 4.9, 2.9, 58, 4, 0xf0ead8, false, Math.PI / 4);
  b.cyl(x, SLAB_Y + 58, z, 2.9, 0, 5.5, 4, 0xe2dcc8, false, Math.PI / 4);
  w.geo.at('glow', x, z).box(x, SLAB_Y + 55, z, 4.6, 0.5, 4.6, PAL.red, 0, 12);
  w.addBox(x, z, 6.6, 6.6, 0, SLAB_Y + 60);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    flagpole(w, x + Math.cos(a) * 19, z + Math.sin(a) * 19, 7.5);
  }
  w.collectSpots.push({ x: x + 8, z: z + 8 });
}

export function memorial(w: World) {
  const x = P.memorial.x, z = P.memorial.z;
  const b = w.geo.at('world', x, z);
  const y = SLAB_Y, white = 0xf3efe2;
  const W = 28, D = 44, T = 3;
  b.box(x, y + 0.5, z, W + 8, 1, D + 8, PAL.stone, 0, 8);
  b.box(x, y + 1.5, z, W + 5, 1, D + 5, PAL.stone, 0, 8);
  b.box(x, y + 2.5, z, W + 2, 1, D + 2, white, 0, 8);
  w.addBox(x, z, W + 2, D + 2, 0, y + T);
  stairs(w, x + W / 2 + 5.5, z, -Math.PI / 2, 16, 9, y, y + T, PAL.stone);
  const ty = y + T, CH = 11;
  const col = (cx: number, cz: number) => b.cyl(cx, ty, cz, 0.95, 0.85, CH, 8, white, false);
  for (let i = 0; i < 12; i++) {
    const cz = z - D / 2 + 1.6 + ((D - 3.2) * i) / 11;
    col(x - W / 2 + 1.4, cz);
    if (Math.abs(cz - z) > 4) col(x + W / 2 - 1.4, cz);
  }
  for (let i = 1; i < 7; i++) {
    const cx = x - W / 2 + 1.4 + ((W - 2.8) * i) / 7;
    col(cx, z - D / 2 + 1.6);
    col(cx, z + D / 2 - 1.6);
  }
  b.box(x, ty + CH + 1.5, z, W + 1.5, 3, D + 1.5, white, 0, 0);
  b.box(x, ty + CH + 3.6, z, W - 4, 1.4, D - 4, shade(white, 0.94), 0, 8);
  // cella (open toward the pool on the east)
  b.box(x - 4, ty + CH / 2, z, 12, CH, D - 9, shade(white, 0.9), 0, 8);
  w.addBox(x - 4, z, 12, D - 9, ty - 0.2, ty + CH);
  // seated statue
  b.box(x + 5, ty + 0.9, z, 5, 1.8, 6, white, 0, 8);
  b.box(x + 4.6, ty + 3.4, z, 3.2, 3.2, 3.6, 0xe6e0d0, 0, 8);
  b.box(x + 6.6, ty + 2.6, z - 1.1, 2.8, 1.2, 1.1, 0xe6e0d0, 0, 0);
  b.box(x + 6.6, ty + 2.6, z + 1.1, 2.8, 1.2, 1.1, 0xe6e0d0, 0, 0);
  b.box(x + 4.8, ty + 5.9, z, 1.7, 1.9, 1.7, 0xe6e0d0, 0, 0);
  w.addBox(x + 5, z, 5, 6, ty - 0.2, ty + 6.8, 0, { cam: false });
  w.signs.text(x + 7.6, ty + 0.9, z, Math.PI / 2, 5, 1, 'HONEST. ALLEGEDLY.', '#f3efe2', '#5a5a66');
  w.collectSpots.push({ x: x + 9, z: z + 12, y: ty });
}

// =============================================================================== Wall Street
export function exchange(w: World) {
  const x = P.exchange.x, z = 39;
  const b = w.geo.at('world', x, z);
  const y = SLAB_Y, st = 0xe2d8c0;
  const top = classical(w, x, z, 70, 26, 5, 0, st, 0);
  // porch + giant colonnade facing the plaza (south)
  b.box(x, y + 0.9, z + 15, 46, 1.8, 4, PAL.stone, 0, 8, 0xe9dfc4);
  w.addBox(x, z + 15, 46, 4, 0, y + 1.8, 0, { cam: false });
  stairs(w, x, z + 19.5, Math.PI, 44, 5, y, y + 1.8, PAL.stone);
  for (let i = 0; i < 6; i++) b.cyl(x - 17.5 + i * 7, y + 1.8, z + 15.6, 1.25, 1.1, 15.5, 10, 0xf0e8d4, false);
  b.box(x, y + 18.1, z + 15.4, 42, 1.6, 4, st, 0, 0);
  b.gable(x, y + 18.9, z + 15.4, 4, 42, 5, shade(st, 0.95), Math.PI / 2, 0xf0e8d4);
  w.signs.text(x, y + 18.1, z + 17.45, 0, 30, 1.3, 'UNITED STATES CITY STOCK EXCHANGE', '#e2d8c0', '#3a3550');
  b.box(x, y + 12, z + 13.25, 9, 10, 0.2, PAL.red, 0, 0);
  for (let i = 0; i < 4; i++) b.box(x, y + 8.3 + i * 2.4, z + 13.38, 9, 1.1, 0.05, PAL.white, 0, 0);
  b.box(x - 2.6, y + 14.6, z + 13.4, 3.8, 4.6, 0.06, PAL.navy, 0, 0);
  // plaza
  const plaza = { x0: 326, z0: 61, x1: 454, z1: 84 };
  patch(w, plaza, 0xe2d6b8);
  for (let px = plaza.x0 + 8; px < plaza.x1; px += 16) line(w, px, plaza.z0, px, plaza.z1, 0.3, 0xcfc4a6);
  for (const px of [338, 372, 408, 442]) {
    // stone planters double as cover
    b.box(px, y + 0.6, 70, 5, 1.2, 2.4, PAL.stoneDark, 0, 8);
    b.blob(px, y + 1.7, 70, 2.2, 0.9, 1, 0x7fb069, px, 0.25);
    w.addBox(px, 70, 5, 2.4, 0, y + 1.2, 0, { cam: false });
  }
  flagpole(w, x - 26, 58, 12);
  flagpole(w, x + 26, 58, 12);
  for (const lx of [332, 448]) for (const lz of [58, 80]) lamp(w, lx, lz, lx < x ? Math.PI / 2 : -Math.PI / 2);
  bull(w, P.bull.x, P.bull.z);
  w.zones.push({ id: 'exchange', kind: 'arena', rect: plaza });
  w.collectSpots.push({ x: x + 30, z: z, y: top });
  w.protestSites.push({ x: x + 30, z: 72, r: 9, d: 'wallstreet' });
}

export function bull(w: World, x: number, z: number) {
  const b = w.geo.at('world', x, z);
  const y = SLAB_Y, g = PAL.gold, gd = PAL.goldDark;
  b.box(x, y + 0.3, z, 7, 0.6, 3.4, PAL.stoneDark, 0, 8);
  const py = y + 0.6;
  b.box(x, py + 2.0, z, 4.4, 1.9, 1.8, g, 0, 0);
  b.box(x + 1.7, py + 2.6, z, 1.6, 1.6, 2.0, shade(g, 1.06), 0, 0);
  b.box(x + 2.9, py + 1.7, z, 1.5, 1.3, 1.2, g, 0.0, 0);
  b.box(x + 3.5, py + 1.2, z, 0.6, 0.7, 0.9, gd, 0, 0);
  for (const s of [-1, 1]) {
    b.cyl(x + 2.9, py + 2.3, z + s * 0.75, 0.2, 0.05, 0.9, 5, 0xf6ecd0, false);
    b.box(x + 1.5, py + 0.55, z + s * 0.6, 0.55, 1.1, 0.55, gd, 0, 8);
    b.box(x - 1.6, py + 0.55, z + s * 0.6, 0.6, 1.1, 0.6, gd, 0, 8);
  }
  b.box(x - 2.5, py + 2.6, z, 0.9, 0.25, 0.25, gd, 0.4, 0);
  w.signs.text(x, y + 0.34, z + 1.72, 0, 4, 0.5, 'CHARGING BULL (MARKET) · DO NOT RIDE', '#3a3550', '#f2c94c');
  w.addBox(x, z, 6.4, 2.6, 0, py + 3);
}

/** Metro kiosk: fast travel + a way to vanish from pursuers. */
export function metro(w: World, id: string, name: string, x: number, z: number, rot = 0) {
  const b = w.geo.at('world', x, z);
  const y = SLAB_Y;
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const L = (lx: number, lz: number): [number, number] => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
  // sunken stairwell illusion: dark recess with steps, glass canopy
  const [sx, sz] = L(0, 0);
  b.box(sx, y + 0.02, sz, 3.4, 0.04, 6, 0x2b2e42, rot, 8);
  for (let i = 0; i < 5; i++) {
    const [px, pz] = L(0, -2.4 + i * 1.1);
    b.box(px, y + 0.06 + i * 0.01, pz, 3.2, 0.03, 0.5, 0x4a4f66, rot, 8);
  }
  for (const lx of [-1.9, 1.9]) {
    const [px, pz] = L(lx, 0);
    b.box(px, y + 0.55, pz, 0.25, 1.1, 6.2, 0x3a6a5c, rot, 8);
    w.addBox(px, pz, 0.25, 6.2, 0, y + 1.1, rot, { cam: false });
  }
  const [bx2, bz2] = L(0, -3.1);
  b.box(bx2, y + 0.55, bz2, 4.05, 1.1, 0.25, 0x3a6a5c, rot, 8);
  w.addBox(bx2, bz2, 4.05, 0.25, 0, y + 1.1, rot, { cam: false });
  for (const [lx, lz] of [[-1.9, -3], [1.9, -3], [-1.9, 3], [1.9, 3]]) {
    const [px, pz] = L(lx, lz);
    b.box(px, y + 1.6, pz, 0.16, 3.2, 0.16, 0x3a6a5c, rot, 12);
  }
  b.box(sx, y + 3.3, sz, 4.6, 0.16, 7, 0x8cc3cb, rot, 0);
  const [gx, gz] = L(0, 3.2);
  b.cyl(gx + 2.6 * cs, y, gz - 2.6 * sn, 0.1, 0.1, 4.2, 5, 0x3a6a5c, false);
  w.geo.at('glow', x, z).blob(gx + 2.6 * cs, y + 4.5, gz - 2.6 * sn, 0.5, 0.5, 0.5, 0x8fd08a, 2, 0);
  w.signs.text(gx, y + 3.9, gz, rot, 4.4, 0.9, `METRO · ${name}`, '#2f8f86', '#f6ecd0', true);
  w.interacts.push({ id: `metro-${id}`, kind: 'metro', x: sx, y, z: sz, r: 3, label: `Take the Metro (${name})`, data: id });
}

// =============================================================================== Harbor / island
export function libertyStatue(w: World) {
  const x = P.liberty.x, z = P.liberty.z;
  const b = w.geo.at('world', x, z);
  const y0 = w.terrain.h(x, z) - 0.3;
  const st = 0xd9cdb0, cu = 0x7fbfa5, cud = 0x62a58c;
  b.box(x, y0 + 2.5, z, 34, 5, 34, st, Math.PI / 4, 8, 0xc9bea5);
  b.box(x, y0 + 2.5, z, 34, 5, 34, shade(st, 0.96), 0, 8, 0xc9bea5);
  b.box(x, y0 + 9, z, 19, 8, 19, st, 0, 8);
  b.cyl(x, y0 + 13, z, 9.2, 6.6, 15, 4, shade(st, 1.04), true, Math.PI / 4);
  w.addBox(x, z, 32, 32, y0, y0 + 5);
  w.addBox(x, z, 19, 19, y0, y0 + 13);
  w.addBox(x, z, 11, 11, y0, y0 + 28);
  const fy = y0 + 28;
  b.cyl(x, fy, z, 4.4, 2.7, 17, 8, cu, false);
  for (let i = 0; i < 8; i += 2) {
    const a = (i / 8) * TAU + 0.2;
    b.box(x + Math.cos(a) * 3.2, fy + 7, z + Math.sin(a) * 3.2, 0.5, 14, 0.9, cud, -a, 12);
  }
  b.box(x, fy + 19, z, 5.6, 5, 3.6, cu, 0, 0);
  b.box(x, fy + 23.2, z, 2.7, 3.2, 2.9, shade(cu, 1.06), 0, 0);
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.12 + (0.76 * i) / 6);
    b.cyl(x + Math.cos(a) * 1.5, fy + 24.6, z + 0.2 + Math.sin(a) * 0.4, 0.28, 0, 2.6, 4, cud, false);
  }
  b.box(x, fy + 25.2, z, 3.1, 0.6, 3.2, cud, 0, 0);
  // raised torch arm (toward +x / up), tablet arm
  b.box(x + 3.6, fy + 23.5, z, 1.5, 7.5, 1.5, cu, 0.0, 0);
  b.box(x + 3.6, fy + 28, z, 1.2, 2.2, 1.2, cud, 0, 0);
  b.cyl(x + 3.6, fy + 29, z, 0.7, 1.4, 1.2, 6, PAL.goldDark, true);
  w.geo.at('glow', x, z).blob(x + 3.6, fy + 31.4, z, 1.1, 1.7, 1.1, PAL.gold, 7, 0.25);
  b.box(x - 3.3, fy + 18.6, z + 1.4, 1.4, 3.8, 1.4, cu, 0, 0);
  b.box(x - 3.4, fy + 19.2, z + 2.4, 2.4, 3.4, 0.5, cud, 0.2, 0);
  w.signs.text(x, y0 + 9, z - 9.6, Math.PI, 12, 1.6, 'LIBERTY · ENLIGHTENING THE CITY', '#d9cdb0', '#3a3550');
  // island paths, trees, benches, dock
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + 0.2;
    if (Math.abs(Math.cos(a)) < 0.25 && Math.sin(a) < 0) continue;
    tree(w, x + Math.cos(a) * 36, z + Math.sin(a) * 36, i % 3 ? 'green' : 'autumn', 1.1, w.terrain.h(x + Math.cos(a) * 36, z + Math.sin(a) * 36));
  }
  dock(w, { x0: ISLAND.x + 38, z0: ISLAND.z - 22, x1: ISLAND.x + 62, z1: ISLAND.z - 18 }, 0.9);
  w.parkSpots.push({ x: ISLAND.x + 60, z: ISLAND.z - 27, rot: Math.PI / 2, kind: 'boat' });
  w.collectSpots.push({ x, z: z + 12, y: y0 + 5 }, { x: x + 7, z: z - 7, y: y0 + 13 });
  w.interacts.push({ id: 'liberty-info', kind: 'info', x, y: y0, z: z - 20, r: 4, label: 'Read the plaque', data: 'Give me your tired, your poor, your huddled masses yearning to yell at each other online.' });
}

/** Wooden dock platform over water. */
export function dock(w: World, r: Rect, y = 0.5, c = PAL.wood) {
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, sw = r.x1 - r.x0, sd = r.z1 - r.z0;
  const b = w.geo.at('world', cx, cz);
  b.box(cx, y - 0.2, cz, sw, 0.4, sd, c, 0, 0, shade(c, 1.1));
  const horiz = sw > sd;
  const n = Math.max(2, Math.round((horiz ? sw : sd) / 7));
  for (let i = 0; i <= n; i++)
    for (const s of [-1, 1]) {
      const px = horiz ? r.x0 + (sw * i) / n : cx + s * (sw / 2 - 0.3);
      const pz = horiz ? cz + s * (sd / 2 - 0.3) : r.z0 + (sd * i) / n;
      b.cyl(px, -7, pz, 0.28, 0.28, 7 + y + 0.5, 5, PAL.woodDark, true);
    }
  w.addBox(cx, cz, sw, sd, y - 0.7, y, 0, { cam: false, tag: 'dock' });
}

export function libertyBridge(w: World) {
  const B = BRIDGE, hw = B.w / 2;
  const mid = (B.z0 + B.zUp) / 2;
  const conc = 0xc7c3b8, road = PAL.asphalt;
  const b1 = w.geo.at('world', 0, mid);
  /** Double-sided quad (bridge skirts are seen from both sides). */
  const dq = (b: MeshBuilder, v: number[], c: number | readonly [number, number, number]) => {
    b.quad(v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8], v[9], v[10], v[11], c);
    b.quad(v[9], v[10], v[11], v[6], v[7], v[8], v[3], v[4], v[5], v[0], v[1], v[2], c);
  };
  const slope = (b: MeshBuilder, za: number, zb: number, ya: number, yb: number, solidWall: boolean) => {
    b.quad(-hw, ya, za, -hw, yb, zb, hw, yb, zb, hw, ya, za, road);
    b.quad(-0.1, ya + 0.04, za, -0.1, yb + 0.04, zb, 0.1, yb + 0.04, zb, 0.1, ya + 0.04, za, PAL.lineYellow);
    const da = solidWall ? ya + 2.5 : 0.8, db = solidWall ? yb + 2.5 : 0.8;
    if (!solidWall) dq(b, [-hw, ya - 0.8, za, hw, ya - 0.8, za, hw, yb - 0.8, zb, -hw, yb - 0.8, zb], conc);
    for (const s of [-1, 1]) {
      const px = s * hw;
      dq(b, [px, ya - da, za, px, yb - db, zb, px, yb, zb, px, ya, za], conc);
      // parapet: outer face, inner face, cap
      const ox = s * (hw + 0.35);
      dq(b, [ox, ya - 0.3, za, ox, yb - 0.3, zb, ox, yb + 1.1, zb, ox, ya + 1.1, za], shade(conc, 0.95));
      dq(b, [px, ya, za, px, yb, zb, px, yb + 1.1, zb, px, ya + 1.1, za], conc);
      b.quad(Math.min(px, ox), ya + 1.1, za, Math.min(px, ox), yb + 1.1, zb, Math.max(px, ox), yb + 1.1, zb, Math.max(px, ox), ya + 1.1, za, shade(conc, 1.06));
      w.addBox(s * (hw + 0.2), (za + zb) / 2, 0.4, zb - za, Math.min(ya, yb) - 0.8, 0, 0, { ramp: { axis: 'z', ya: ya + 1.1, yb: yb + 1.1 }, cam: false });
    }
  };
  // north approach: solid embankment then elevated ramp
  const yMid = B.h / 2;
  slope(b1, B.z0, mid, ROAD_Y, yMid, true);
  w.addBox(0, (B.z0 + mid) / 2, B.w, mid - B.z0, -2, yMid, 0, { ramp: { axis: 'z', ya: ROAD_Y, yb: yMid } });
  slope(b1, mid, B.zUp, yMid, B.h, false);
  w.addBox(0, (mid + B.zUp) / 2, B.w, B.zUp - mid, yMid - 0.8, B.h, 0, { ramp: { axis: 'z', ya: yMid, yb: B.h }, cam: false });
  // main deck
  const parts = 2;
  for (let i = 0; i < parts; i++) {
    const za = B.zUp + ((B.zDown - B.zUp) * i) / parts, zb = B.zUp + ((B.zDown - B.zUp) * (i + 1)) / parts;
    slope(w.geo.at('world', 0, (za + zb) / 2), za, zb, B.h, B.h, false);
  }
  w.addBox(0, (B.zUp + B.zDown) / 2, B.w, B.zDown - B.zUp, B.h - 0.8, B.h, 0, { cam: false });
  // south ramp down to the island
  const yi = w.terrain.h(0, B.z1) + 0.05;
  const b3 = w.geo.at('world', 0, (B.zDown + B.z1) / 2);
  slope(b3, B.zDown, B.z1, B.h, yi, false);
  w.addBox(0, (B.zDown + B.z1) / 2, B.w, B.z1 - B.zDown, yi - 1.5, B.h, 0, { ramp: { axis: 'z', ya: B.h, yb: yi }, cam: false });
  // towers, cables, piers
  const tz = [B.zUp + 22, B.zDown - 22];
  const TH = 34;
  for (const z of tz) {
    const b = w.geo.at('world', 0, z);
    for (const s of [-1, 1]) {
      b.box(s * (hw + 1.4), TH / 2 - 4, z, 1.6, TH + 8, 2.2, 0xb8433a, 0, 8);
      w.addBox(s * (hw + 1.4), z, 1.6, 2.2, -9, TH, 0, { cam: false });
    }
    b.box(0, TH - 1, z, B.w + 4.4, 1.6, 1.8, 0xb8433a, 0, 0);
    b.box(0, TH * 0.62, z, B.w + 4.4, 1.2, 1.6, 0xb8433a, 0, 0);
    w.geo.at('glow', 0, z).box(0, TH + 0.4, z, 0.6, 0.6, 0.6, PAL.red, 0, 0);
  }
  const cable = (za: number, ya: number, zb: number, yb: number, sag: number) => {
    const S = 8;
    for (const s of [-1, 1]) {
      const px = s * (hw + 1.4);
      for (let i = 0; i < S; i++) {
        const t0 = i / S, t1 = (i + 1) / S;
        const f = (t: number) => ya + (yb - ya) * t - Math.sin(t * Math.PI) * sag;
        const z0 = za + (zb - za) * t0, z1 = za + (zb - za) * t1;
        const b = w.geo.at('world', 0, (z0 + z1) / 2);
        b.quad(px, f(t0), z0, px, f(t1), z1, px, f(t1) + 0.3, z1, px, f(t0) + 0.3, z0, 0x8f332f);
        b.quad(px, f(t1), z1, px, f(t0), z0, px, f(t0) + 0.3, z0, px, f(t1) + 0.3, z1, 0x8f332f);
        // suspender
        if (i > 0 && f(t0) > B.h + 2) b.box(px, (f(t0) + B.h) / 2, z0, 0.08, f(t0) - B.h, 0.08, 0x8f332f, 0, 12);
      }
    }
  };
  cable(B.zUp - 14, B.h + 1.2, tz[0], TH, 1);
  cable(tz[0], TH, tz[1], TH, 17);
  cable(tz[1], TH, B.zDown + 14, B.h + 1.2, 1);
  for (let z = B.zUp + 4; z < B.z1 - 6; z += 26) {
    if (Math.abs(z - tz[0]) < 6 || Math.abs(z - tz[1]) < 6) continue;
    w.geo.at('world', 0, z).box(0, -1, z, 3.2, 16, 2.4, conc, 0, 8);
  }
  for (let z = B.zUp; z < B.zDown; z += 34) lamp(w, hw - 0.4, z, -Math.PI / 2, B.h);
  w.signs.text(-hw - 3.5, 4.2, B.z0 + 3, Math.PI, 6, 1.6, 'LIBERTY BRIDGE', '#4c9a5a', '#f6ecd0', true);
  w.geo.at('world', 0, B.z0).box(-hw - 3.5, 1.9, B.z0 + 3, 0.25, 3.6, 0.25, 0x4a4f66, 0, 8);
  w.collectSpots.push({ x: 0, z: (B.zUp + B.zDown) / 2, y: B.h });
}
