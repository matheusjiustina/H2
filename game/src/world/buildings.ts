import { MeshBuilder, RGB, shade } from '../render/geo';
import { PAL } from '../render/materials';
import { SLAB_Y } from './layout';
import type { World } from './world';

type Col = number | RGB;

/** Rotate a local offset into world space around (cx,cz). */
export function rotP(cx: number, cz: number, rot: number, lx: number, lz: number): [number, number] {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  return [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs];
}

// ----------------------------------------------------------------------------- windows
export interface WinSpec {
  floorH: number;
  w: number;
  h: number;
  gap: number;
  sill: number;
  glass: Col;
  frame?: Col;
  lit: number;
  margin?: number;
}

/** Window grid on the four faces of a (possibly rotated) box. sides bitmask: 1=+z 2=-z 4=+x 8=-x. */
export function windows(w: World, cx: number, cz: number, bw: number, bd: number, rot: number, y0: number, floors: number, s: WinSpec, sides = 15) {
  const b = w.geo.at('world', cx, cz), g = w.geo.at('glow', cx, cz);
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const faces = [[0, 1, bw, bd / 2], [0, -1, bw, bd / 2], [1, 0, bd, bw / 2], [-1, 0, bd, bw / 2]];
  const margin = s.margin ?? 1;
  for (let i = 0; i < 4; i++) {
    if (!(sides & (1 << i))) continue;
    const [nx, nz, fw, dist] = faces[i];
    const n = Math.floor((fw - margin * 2 + s.gap) / (s.w + s.gap));
    if (n <= 0) continue;
    const total = n * s.w + (n - 1) * s.gap;
    const rxl = nz, rzl = -nx;
    const rwx = rxl * cs + rzl * sn, rwz = -rxl * sn + rzl * cs;
    const nwx = nx * cs + nz * sn, nwz = -nx * sn + nz * cs;
    for (let f = 0; f < floors; f++) {
      const y = y0 + f * s.floorH + s.sill;
      for (let k = 0; k < n; k++) {
        const off = -total / 2 + k * (s.w + s.gap);
        const lx = nx * dist + rxl * off, lz = nz * dist + rzl * off;
        const wx = cx + lx * cs + lz * sn, wz = cz - lx * sn + lz * cs;
        if (s.frame !== undefined)
          b.wallQuad(wx + nwx * 0.09 - rwx * 0.16, y - 0.16, wz + nwz * 0.09 - rwz * 0.16, rwx, rwz, s.w + 0.32, s.h + 0.32, s.frame);
        const lit = w.rng.chance(s.lit);
        const col = lit ? PAL.windowLight : w.rng.chance(0.22) ? shade(s.glass, 1.3) : s.glass;
        (lit ? g : b).wallQuad(wx + nwx * 0.18, y, wz + nwz * 0.18, rwx, rwz, s.w, s.h, col);
      }
    }
  }
}

// ----------------------------------------------------------------------------- buildings
export interface MidOpts {
  wall: Col;
  trim?: Col;
  floors: number;
  rot?: number;
  shop?: Col | null;
  roof?: boolean;
  lit?: number;
  winW?: number;
  glass?: Col;
  solid?: boolean;
}

/** Brick / stone mid-rise with framed windows, cornice, optional shopfront and rooftop clutter. */
export function midrise(w: World, x: number, z: number, bw: number, bd: number, o: MidOpts): number {
  const rot = o.rot ?? 0;
  const b = w.geo.at('world', x, z);
  const fh = 3.5;
  const g0 = o.shop ? 4.4 : 0.8;
  const H = g0 + o.floors * fh + 0.9;
  const trim = o.trim ?? shade(o.wall, 1.18);
  b.box(x, SLAB_Y + H / 2, z, bw, H, bd, o.wall, rot, 8, shade(o.wall, 0.8));
  // cornice + base band
  b.box(x, SLAB_Y + H - 0.25, z, bw + 0.7, 0.55, bd + 0.7, trim, rot, 0);
  b.box(x, SLAB_Y + g0 - 0.15, z, bw + 0.35, 0.35, bd + 0.35, trim, rot, 0);
  // parapet recess (darker roof inside)
  b.box(x, SLAB_Y + H + 0.03, z, bw - 1, 0.06, bd - 1, 0x8e8a86, rot, 8);
  windows(w, x, z, bw, bd, rot, SLAB_Y + g0, o.floors, {
    floorH: fh, w: o.winW ?? 1.5, h: 2.0, gap: o.winW ? 1.2 : 1.6, sill: 0.9, glass: o.glass ?? PAL.window, frame: trim, lit: o.lit ?? 0.28, margin: 1.4,
  });
  if (o.shop) {
    // shopfronts with awnings on all sides
    windows(w, x, z, bw, bd, rot, SLAB_Y, 1, { floorH: 4, w: 3.6, h: 2.5, gap: 1.2, sill: 0.5, glass: PAL.glassDark, frame: PAL.dark, lit: 0.5, margin: 1.2 });
    const aw = 1.3;
    for (const [nx, nz, fw, dist] of [[0, 1, bw, bd / 2], [0, -1, bw, bd / 2], [1, 0, bd, bw / 2], [-1, 0, bd, bw / 2]]) {
      const [ax, az] = rotP(x, z, rot, nx * (dist + aw / 2), nz * (dist + aw / 2));
      const r = rot + (nx !== 0 ? Math.PI / 2 : 0);
      b.box(ax, SLAB_Y + 3.45, az, fw - 1.6, 0.18, aw, o.shop, r, 0, shade(o.shop, 1.15));
      b.box(ax, SLAB_Y + 3.2, az + 0, fw - 1.6, 0.34, 0.1, shade(o.shop, 0.8), r, 12);
    }
  }
  if (o.roof !== false) rooftop(w, b, x, z, bw, bd, SLAB_Y + H, rot);
  if (o.solid !== false) w.addBox(x, z, bw, bd, 0, SLAB_Y + H, rot);
  return SLAB_Y + H;
}

function rooftop(w: World, b: MeshBuilder, x: number, z: number, bw: number, bd: number, y: number, rot: number) {
  const r = w.rng;
  const n = r.int(1, 3);
  for (let i = 0; i < n; i++) {
    const [px, pz] = rotP(x, z, rot, r.range(-bw / 2 + 2, bw / 2 - 2), r.range(-bd / 2 + 2, bd / 2 - 2));
    const t = r.next();
    if (t < 0.4) b.box(px, y + 0.6, pz, 2, 1.2, 1.5, 0xb9bcc4, rot, 8); // AC unit
    else if (t < 0.65 && bw > 10) {
      // water tank on legs
      b.cyl(px, y + 1.6, pz, 1.3, 1.3, 2.2, 8, PAL.wood, true);
      b.cyl(px, y + 3.8, pz, 1.4, 0, 0.9, 8, PAL.woodDark);
      for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]]) b.box(px + dx, y + 0.8, pz + dz, 0.14, 1.6, 0.14, PAL.dark, 0, 12);
    } else b.box(px, y + 1.1, pz, 2.6, 2.2, 2.6, shade(0xcfc8b8, 0.95), rot, 8); // stair bulkhead
  }
}

/** Glass curtain wall shaft: spandrel bands, mullions and randomly lit panels. */
export function curtain(w: World, x: number, z: number, sw: number, sd: number, y0: number, y1: number, glass: Col, frame: Col, rot = 0, lit = 0.45, solid = true) {
  const b = w.geo.at('world', x, z), g = w.geo.at('glow', x, z);
  const sh = y1 - y0;
  b.box(x, y0 + sh / 2, z, sw, sh, sd, glass, rot, 8, 0x8e8a86);
  const cs = Math.cos(rot), sn = Math.sin(rot);
  for (const [nx, nz, fw, dist] of [[0, 1, sw, sd / 2], [0, -1, sw, sd / 2], [1, 0, sd, sw / 2], [-1, 0, sd, sw / 2]]) {
    const rxl = nz, rzl = -nx;
    const rwx = rxl * cs + rzl * sn, rwz = -rxl * sn + rzl * cs;
    const nwx = nx * cs + nz * sn, nwz = -nx * sn + nz * cs;
    const ox = x + nx * dist * cs + nz * dist * sn, oz = z - nx * dist * sn + nz * dist * cs;
    const fl = 3.6;
    const nf = Math.max(1, Math.floor(sh / fl));
    for (let f = 1; f <= nf; f++)
      b.wallQuad(ox + nwx * 0.12 - rwx * (fw / 2), y0 + f * fl - 0.5, oz + nwz * 0.12 - rwz * (fw / 2), rwx, rwz, fw, 0.5, f % 4 === 0 ? shade(frame, 0.8) : frame);
    const nb = Math.max(2, Math.round(fw / 3.4));
    for (let k = 0; k <= nb; k++) {
      const off = -fw / 2 + (fw * k) / nb - 0.1;
      b.wallQuad(ox + nwx * 0.18 + rwx * off, y0, oz + nwz * 0.18 + rwz * off, rwx, rwz, 0.2, sh, frame);
    }
    const cellW = fw / nb;
    const count = Math.round(nf * nb * 0.2);
    for (let c = 0; c < count; c++) {
      const f = w.rng.int(0, nf - 1), k = w.rng.int(0, nb - 1);
      const off = -fw / 2 + k * cellW + 0.15;
      const isLit = w.rng.chance(lit);
      (isLit ? g : b).wallQuad(ox + nwx * 0.07 + rwx * off, y0 + f * fl + 0.05, oz + nwz * 0.07 + rwz * off, rwx, rwz, cellW - 0.3, fl - 0.6,
        shade(glass, isLit ? 1.3 : w.rng.range(1.1, 1.28)));
    }
  }
  if (solid) w.addBox(x, z, sw, sd, y0 - 0.01, y1, rot);
}

export interface TowerOpts {
  glass: Col;
  frame?: Col;
  base?: Col;
  crown?: 'flat' | 'step' | 'spire' | 'slant';
  rot?: number;
  lit?: number;
  podium?: number;
}

/** Glass tower with podium and crown. Returns roof height. */
export function tower(w: World, x: number, z: number, bw: number, bd: number, h: number, o: TowerOpts): number {
  const rot = o.rot ?? 0;
  const b = w.geo.at('world', x, z);
  const frame = o.frame ?? shade(o.glass, 0.66);
  const base = o.base ?? PAL.stone;
  const pod = o.podium ?? 7;
  b.box(x, SLAB_Y + pod / 2, z, bw + 1.2, pod, bd + 1.2, base, rot, 8);
  windows(w, x, z, bw + 1.2, bd + 1.2, rot, SLAB_Y, 1, { floorH: pod, w: 3.2, h: pod - 2.6, gap: 1.4, sill: 0.6, glass: PAL.glassDark, frame: PAL.dark, lit: 0.6, margin: 1.5 });
  w.addBox(x, z, bw + 1.2, bd + 1.2, 0, SLAB_Y + pod, rot);
  const top = SLAB_Y + h;
  const crown = o.crown ?? 'flat';
  if (crown === 'step') {
    const h1 = SLAB_Y + pod + (h - pod) * 0.72;
    curtain(w, x, z, bw, bd, SLAB_Y + pod, h1, o.glass, frame, rot, o.lit);
    curtain(w, x, z, bw * 0.7, bd * 0.7, h1, top, o.glass, frame, rot, o.lit);
  } else {
    curtain(w, x, z, bw, bd, SLAB_Y + pod, top, o.glass, frame, rot, o.lit);
    if (crown === 'spire') {
      b.pyramid(x, top, z, bw * 0.55, bd * 0.55, h * 0.16, frame, rot);
      b.cyl(x, top + h * 0.14, z, 0.25, 0.08, h * 0.14, 4, PAL.dark);
    } else if (crown === 'slant') {
      b.gable(x, top, z, bw, bd, Math.min(bw, bd) * 0.35, frame, rot, o.glass);
    } else {
      b.box(x, top + 1.2, z, bw * 0.5, 2.4, bd * 0.5, shade(base, 0.9), rot, 8);
      b.cyl(x + bw * 0.15, top + 2.4, z, 0.12, 0.05, 6, 4, PAL.dark);
    }
  }
  return top;
}

/** Neoclassical stone block with a pilaster colonnade (banks, government offices). */
export function classical(w: World, x: number, z: number, bw: number, bd: number, floors: number, rot = 0, wall: Col = PAL.stone, front = 1): number {
  const b = w.geo.at('world', x, z);
  const H = floors * 4 + 2;
  const dark = shade(wall, 0.84);
  b.box(x, SLAB_Y + 0.6, z, bw + 1, 1.2, bd + 1, dark, rot, 8);
  b.box(x, SLAB_Y + 1.2 + H / 2, z, bw, H, bd, wall, rot, 8, 0x9a968c);
  b.box(x, SLAB_Y + 1.2 + H - 0.4, z, bw + 1, 0.8, bd + 1, shade(wall, 1.08), rot, 0);
  b.box(x, SLAB_Y + 1.2 + H + 0.5, z, bw - 0.6, 1, bd - 0.6, dark, rot, 8);
  windows(w, x, z, bw, bd, rot, SLAB_Y + 1.2, floors, { floorH: 4, w: 1.5, h: 2.5, gap: 2.1, sill: 0.9, glass: PAL.window, frame: dark, lit: 0.2, margin: 2.2 });
  // pilasters on the chosen faces
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const faces = [[0, 1, bw, bd / 2], [0, -1, bw, bd / 2], [1, 0, bd, bw / 2], [-1, 0, bd, bw / 2]];
  for (let i = 0; i < 4; i++) {
    if (!(front & (1 << i))) continue;
    const [nx, nz, fw, dist] = faces[i];
    const n = Math.max(2, Math.round(fw / 3.6));
    for (let k = 0; k <= n; k++) {
      const off = -fw / 2 + 0.9 + ((fw - 1.8) * k) / n;
      const lx = nx * (dist + 0.3) + nz * off, lz = nz * (dist + 0.3) - nx * off;
      b.box(x + lx * cs + lz * sn, SLAB_Y + 1.2 + (H - 1.2) / 2, z - lx * sn + lz * cs, 0.7, H - 1.2, 0.7, shade(wall, 1.1), rot, 12);
    }
  }
  w.addBox(x, z, bw + 1, bd + 1, 0, SLAB_Y + 1.2 + H + 1, rot);
  return SLAB_Y + 1.2 + H + 1;
}

export interface HouseOpts {
  wall: Col;
  roof: Col;
  garage?: boolean;
  porch?: boolean;
}

/** Two-storey American house. Front faces local +z. */
export function house(w: World, x: number, z: number, rot: number, o: HouseOpts) {
  const b = w.geo.at('world', x, z);
  const W = 9, D = 7.5, H = 5.8;
  const trim = PAL.white;
  b.box(x, SLAB_Y + H / 2, z, W, H, D, o.wall, rot, 8);
  b.gable(x, SLAB_Y + H, z, W + 1, D + 1.2, 2.6, o.roof, rot, o.wall);
  windows(w, x, z, W, D, rot, SLAB_Y, 2, { floorH: 2.9, w: 1.2, h: 1.4, gap: 1.6, sill: 1.0, glass: PAL.window, frame: trim, lit: 0.4, margin: 1.1 }, 14);
  // front face: door + windows
  const P = (lx: number, lz: number) => rotP(x, z, rot, lx, lz);
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const rwx = cs, rwz = -sn; // local +x in world
  const nwx = sn, nwz = cs; // local +z (front normal)
  const front = (lx: number, y: number, ww: number, hh: number, c: Col, off = 0.12) => {
    const [px, pz] = P(lx - ww / 2, D / 2 + off);
    b.wallQuad(px, y, pz, rwx, rwz, ww, hh, c);
  };
  const glow = w.geo.at('glow', x, z);
  const pane = (lx: number, y: number, ww: number, hh: number) => {
    front(lx, y - 0.15, ww + 0.3, hh + 0.3, trim, 0.09);
    const [px, pz] = P(lx - ww / 2, D / 2 + 0.18);
    const lit = w.rng.chance(0.4);
    (lit ? glow : b).wallQuad(px, y, pz, rwx, rwz, ww, hh, lit ? PAL.windowLight : PAL.window);
  };
  front(0, SLAB_Y + 0.2, 1.3, 2.3, trim, 0.09);
  front(0, SLAB_Y + 0.3, 1.0, 2.1, shade(o.roof, 0.9), 0.18);
  for (const lx of [-2.9, 2.9]) pane(lx, SLAB_Y + 1.0, 1.4, 1.4);
  for (const lx of [-2.9, 0, 2.9]) pane(lx, SLAB_Y + 3.7, 1.2, 1.4);
  if (o.porch !== false) {
    const [px, pz] = P(0, D / 2 + 1.2);
    b.box(px, SLAB_Y + 0.2, pz, 4.6, 0.4, 2.2, 0xcfc8b8, rot, 8);
    b.box(px, SLAB_Y + 2.9, pz, 5, 0.18, 2.6, o.roof, rot, 0);
    for (const lx of [-2.1, 2.1]) {
      const [cx2, cz2] = P(lx, D / 2 + 2.2);
      b.box(cx2, SLAB_Y + 1.55, cz2, 0.18, 2.7, 0.18, trim, rot, 12);
    }
    w.addBox(px, pz, 4.6, 2.2, 0, SLAB_Y + 0.4, rot, { cam: false });
  }
  // chimney
  const [chx, chz] = P(-W / 2 + 1.4, -1);
  b.box(chx, SLAB_Y + H + 2, chz, 0.9, 3, 0.9, PAL.brick, rot, 8);
  w.addBox(x, z, W, D, 0, SLAB_Y + H + 1.2, rot);
  if (o.garage !== false) {
    const [gx, gz] = P(W / 2 + 2.6, 0.6);
    b.box(gx, SLAB_Y + 1.6, gz, 5.2, 3.2, 6, o.wall, rot, 8);
    b.gable(gx, SLAB_Y + 3.2, gz, 5.8, 6.6, 1.3, o.roof, rot + Math.PI / 2, o.wall);
    const [dx, dz] = P(W / 2 + 2.6 - 1.9, 3.6 + 0.12);
    b.wallQuad(dx, SLAB_Y + 0.1, dz, rwx, rwz, 3.8, 2.5, trim);
    for (let i = 1; i < 4; i++) b.wallQuad(dx + nwx * 0.05, SLAB_Y + 0.1 + i * 0.62, dz + nwz * 0.05, rwx, rwz, 3.8, 0.06, 0xb9bcc4);
    w.addBox(gx, gz, 5.2, 6, 0, SLAB_Y + 3.6, rot);
  }
}

/** Simple one-storey commercial building with a sign band. */
export function shop(w: World, x: number, z: number, bw: number, bd: number, h: number, rot: number, wall: Col, awning: Col, sign?: string, signBg = '#f6ecd0', signFg = '#1d1a2e') {
  const b = w.geo.at('world', x, z);
  b.box(x, SLAB_Y + h / 2, z, bw, h, bd, wall, rot, 8, 0x9a968c);
  b.box(x, SLAB_Y + h + 0.25, z, bw + 0.4, 0.5, bd + 0.4, shade(wall, 0.85), rot, 0);
  windows(w, x, z, bw, bd, rot, SLAB_Y, 1, { floorH: h, w: 2.8, h: Math.min(2.4, h - 1.6), gap: 1.2, sill: 0.5, glass: PAL.glassDark, frame: PAL.dark, lit: 0.6, margin: 1 }, 1);
  const [ax, az] = rotP(x, z, rot, 0, bd / 2 + 0.7);
  b.box(ax, SLAB_Y + Math.min(3.3, h - 0.5), az, bw - 0.8, 0.16, 1.4, awning, rot, 0, shade(awning, 1.15));
  if (sign) {
    const [sx, sz] = rotP(x, z, rot, 0, bd / 2 + 0.25);
    const sw = Math.min(bw - 1, sign.length * 0.75 + 1.5);
    w.signs.text(sx, SLAB_Y + h + 1.1, sz, rot, sw, 1.5, sign, signBg, signFg);
    const [bx2, bz2] = rotP(x, z, rot, 0, bd / 2 + 0.08);
    b.box(bx2, SLAB_Y + h + 1.1, bz2, sw + 0.3, 1.8, 0.2, PAL.dark, rot, 0);
  }
  w.addBox(x, z, bw, bd, 0, SLAB_Y + h + 0.5, rot);
}
