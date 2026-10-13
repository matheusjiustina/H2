import { defineKit, KitCtx } from '../content/Kit';
import { GeoBuilder } from '../kit/GeoBuilder';
import { P } from './palette';
import { SignSpec } from '../../render/Atlases';

export type RoofType = 'gable' | 'flat' | 'hip' | 'shed' | 'none' | 'dome' | 'mansard';
export type WindowStyle = 'square' | 'tall' | 'arch' | 'wide' | 'porthole' | 'none';

export interface BuildingParams {
  w: number;
  d: number;
  floors?: number;
  floorH?: number;
  wall?: string;
  trim?: string;
  base?: string;
  roof?: RoofType;
  roofColor?: string;
  roofAxis?: 'x' | 'z';
  roofH?: number;
  door?: false | { x?: number; color?: string; double?: boolean; canopy?: string };
  windows?: { style?: WindowStyle; per?: number; frame?: string; shutters?: string; lit?: number; sides?: boolean; back?: boolean };
  awning?: string;
  shopfront?: boolean | { color?: string; w?: number };
  sign?: Omit<SignSpec, 'width' | 'height'> & { w?: number; h?: number; y?: number };
  sideSign?: Omit<SignSpec, 'width' | 'height'> & { w?: number; h?: number; y?: number };
  chimney?: boolean;
  balcony?: boolean;
  flowerbox?: string;
  rooftop?: 'garden' | 'antenna' | 'solar' | 'tank' | 'ac' | 'dish' | 'none';
  cornice?: boolean;
  glass?: boolean;
  corners?: boolean;
  screen?: { kind: string; w: number; h: number; y: number; span?: number };
}

const SIDES = [
  { name: 'front', rot: 0 },
  { name: 'back', rot: Math.PI },
  { name: 'left', rot: Math.PI / 2 },
  { name: 'right', rot: -Math.PI / 2 },
] as const;

export function windowPiece(g: GeoBuilder, style: WindowStyle, x: number, y: number, frame: string, lit: number, shutters?: string, flowerbox?: string): void {
  const glass = P.glass;
  const e = lit;
  switch (style) {
    case 'none':
      return;
    case 'square':
      g.box(0.92, 0.92, 0.1, [x, y, 0.02], frame);
      g.box(0.74, 0.74, 0.06, [x, y, 0.045], glass, { emissive: e });
      g.box(0.06, 0.74, 0.07, [x, y, 0.06], frame);
      g.box(1.04, 0.08, 0.18, [x, y - 0.5, 0.06], frame);
      break;
    case 'tall':
    case 'arch':
      g.box(0.82, 1.42, 0.1, [x, y, 0.02], frame);
      g.box(0.64, 1.24, 0.06, [x, y, 0.045], glass, { emissive: e });
      g.box(0.64, 0.06, 0.07, [x, y + 0.15, 0.06], frame);
      g.box(0.94, 0.08, 0.18, [x, y - 0.75, 0.06], frame);
      if (style === 'arch') {
        g.cyl(0.41, 0.41, 0.1, [x, y + 0.71, 0.02], frame, { rot: [Math.PI / 2, 0, 0], seg: 14 });
        g.cyl(0.32, 0.32, 0.06, [x, y + 0.71, 0.045], glass, { rot: [Math.PI / 2, 0, 0], seg: 14, emissive: e });
      }
      break;
    case 'wide':
      g.box(1.7, 0.95, 0.1, [x, y, 0.02], frame);
      g.box(1.52, 0.77, 0.06, [x, y, 0.045], glass, { emissive: e });
      g.box(0.05, 0.77, 0.07, [x - 0.25, y, 0.06], frame);
      g.box(1.8, 0.08, 0.16, [x, y - 0.5, 0.06], frame);
      break;
    case 'porthole':
      g.cyl(0.42, 0.42, 0.1, [x, y, 0.02], frame, { rot: [Math.PI / 2, 0, 0], seg: 16 });
      g.cyl(0.32, 0.32, 0.06, [x, y, 0.045], glass, { rot: [Math.PI / 2, 0, 0], seg: 16, emissive: e });
      break;
  }
  if (shutters && style !== 'porthole') {
    const sh = style === 'square' ? 0.92 : 1.42;
    const off = style === 'wide' ? 0.95 : style === 'square' ? 0.62 : 0.57;
    for (const s of [-1, 1]) g.box(0.36, sh, 0.05, [x + s * off, y, 0.04], shutters);
  }
  if (flowerbox) {
    const fy = y - (style === 'square' ? 0.6 : 0.85);
    const fw = style === 'wide' ? 1.6 : 0.9;
    g.box(fw, 0.18, 0.22, [x, fy, 0.14], P.woodDark);
    for (let i = 0; i < 4; i++) g.sphere(0.09, [x - fw / 2 + 0.15 + (i * (fw - 0.3)) / 3, fy + 0.15, 0.15], i % 2 ? flowerbox : P.leaf, { ws: 5, hs: 3, wind: 0.2 });
  }
}

export function doorPiece(g: GeoBuilder, x: number, color: string, frame: string, double = false, canopy?: string): void {
  const w = double ? 1.7 : 1.05;
  g.box(w + 0.22, 2.25, 0.12, [x, 1.12, 0.02], frame);
  g.box(w, 2.05, 0.08, [x, 1.02, 0.06], color);
  if (double) g.box(0.04, 2.05, 0.09, [x, 1.02, 0.07], frame);
  g.box(0.32, 0.5, 0.04, [x, 1.55, 0.1], P.glass, { emissive: 0.7 });
  g.sphere(0.05, [x + w * 0.35, 1.0, 0.13], P.gold);
  g.box(w + 0.6, 0.15, 0.6, [x, 0.07, 0.32], P.stone);
  if (canopy) {
    g.box(w + 0.6, 0.08, 0.8, [x, 2.45, 0.35], canopy, { rot: [0.12, 0, 0] });
  }
  g.sphere(0.09, [x + w / 2 + 0.3, 2.1, 0.15], '#fff1c6', { emissive: 0.9 });
}

/** Striped shop awning across `w` at height y. */
export function awningPiece(g: GeoBuilder, x: number, y: number, w: number, color: string, depth = 1.1): void {
  const n = Math.max(3, Math.round(w / 0.45));
  for (let i = 0; i < n; i++) {
    g.box(w / n + 0.005, 0.06, depth, [x - w / 2 + (i + 0.5) * (w / n), y, depth / 2 - 0.05], i % 2 ? P.white : color, { rot: [0.32, 0, 0] });
    g.box(w / n + 0.005, 0.22, 0.03, [x - w / 2 + (i + 0.5) * (w / n), y - Math.sin(0.32) * depth - 0.1, Math.cos(0.32) * depth - 0.05], i % 2 ? P.white : color);
  }
}

export function roofPiece(g: GeoBuilder, type: RoofType, w: number, d: number, H: number, color: string, wall: string, trim: string, axis: 'x' | 'z', rh?: number): number {
  const oh = 0.35;
  switch (type) {
    case 'none':
      return 0;
    case 'flat': {
      g.box(w + 0.2, 0.25, d + 0.2, [0, H + 0.12, 0], trim);
      for (const s of [-1, 1]) {
        g.box(w + 0.2, 0.45, 0.18, [0, H + 0.45, s * (d / 2 + 0.01)], trim);
        g.box(0.18, 0.45, d + 0.2, [s * (w / 2 + 0.01), H + 0.45, 0], trim);
      }
      g.box(w - 0.2, 0.05, d - 0.2, [0, H + 0.26, 0], '#9a948a');
      return 0.6;
    }
    case 'gable': {
      const across = axis === 'z' ? w : d;
      const along = axis === 'z' ? d : w;
      const h = rh ?? Math.min(2.6, across * 0.42);
      g.pushT([0, H, 0], [0, axis === 'z' ? 0 : Math.PI / 2, 0]);
      g.gable(across, h, along, [0, 0, 0], wall);
      const ang = Math.atan2(h, across / 2);
      const L = Math.hypot(across / 2, h) + oh;
      for (const s of [-1, 1]) {
        g.box(L, 0.16, along + oh * 2, [s * (across / 4 + Math.cos(ang) * oh * 0.2), h / 2 + 0.1, 0], color, { rot: [0, 0, -s * ang] });
      }
      g.box(0.22, 0.2, along + oh * 2 + 0.05, [0, h + 0.08, 0], trim);
      g.pop();
      return h;
    }
    case 'hip': {
      const h = rh ?? Math.min(2.2, Math.min(w, d) * 0.4);
      g.box(w + 0.3, 0.15, d + 0.3, [0, H + 0.07, 0], trim);
      g.cone(1, h, [0, H + 0.12 + h / 2, 0], color, { seg: 4, rot: [0, Math.PI / 4, 0], scale: [(w + oh * 2) / Math.SQRT2, 1, (d + oh * 2) / Math.SQRT2], flat: true });
      return h;
    }
    case 'shed': {
      const h = rh ?? 1.0;
      const ang = Math.atan2(h, d);
      g.box(w + 0.5, 0.16, Math.hypot(d, h) + 0.6, [0, H + h / 2 + 0.1, 0], color, { rot: [ang, 0, 0] });
      g.prism([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]], 0.02, [0, H, 0], wall);
      return h;
    }
    case 'dome': {
      const r = Math.min(w, d) * 0.42;
      g.box(w + 0.2, 0.3, d + 0.2, [0, H + 0.15, 0], trim);
      g.cyl(r * 1.02, r * 1.05, 0.5, [0, H + 0.55, 0], wall, { seg: 20 });
      g.sphere(r, [0, H + 0.8, 0], color, { ws: 20, hs: 10, scale: [1, 0.85, 1] });
      g.sphere(0.18, [0, H + 0.8 + r * 0.85, 0], P.gold);
      return r + 0.8;
    }
    case 'mansard': {
      const h = rh ?? 1.6;
      g.box(w + 0.25, 0.2, d + 0.25, [0, H + 0.1, 0], trim);
      g.cone(1, h, [0, H + 0.2 + h / 2, 0], color, { seg: 4, rot: [0, Math.PI / 4, 0], scale: [(w + 0.3) / Math.SQRT2, 1, (d + 0.3) / Math.SQRT2], flat: true });
      return h;
    }
  }
}

/** The general-purpose building used across the planet. Every instance is individually specified. */
export function building(c: KitCtx, p: BuildingParams): { H: number; top: number } {
  const g = c.g;
  const w = p.w, d = p.d;
  const floors = p.floors ?? 2;
  const fh = p.floorH ?? 2.7;
  const H = floors * fh + 0.2;
  const wall = p.wall ?? P.cream;
  const trim = p.trim ?? P.white;
  const roofColor = p.roofColor ?? P.terracotta;
  const win = p.windows ?? {};
  const style: WindowStyle = win.style ?? 'square';
  const frame = win.frame ?? trim;
  const litP = win.lit ?? 0.6;
  const glassBuilding = !!p.glass;

  // Foundation plinth (also hides the small gap where the curved ground falls away).
  g.rbox(w + 0.3, 1.1, d + 0.3, 0.05, [0, -0.38, 0], p.base ?? P.stoneDark);
  // Walls.
  g.rbox(w, H, d, 0.08, [0, H / 2 + 0.1, 0], glassBuilding ? P.glassDark : wall);
  if (p.corners !== false && !glassBuilding) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(0.22, H, 0.22, [sx * (w / 2 - 0.02), H / 2 + 0.1, sz * (d / 2 - 0.02)], trim);
  }
  // Floor bands.
  for (let f = 1; f < floors; f++) g.box(w + 0.12, 0.14, d + 0.12, [0, f * fh + 0.1, 0], trim);
  if (p.cornice !== false) g.box(w + 0.26, 0.22, d + 0.26, [0, H, 0], trim);

  const doorX = p.door === false ? null : (p.door?.x ?? 0);
  const shop = p.shopfront ? (typeof p.shopfront === 'object' ? p.shopfront : {}) : null;
  const shopW = shop ? (shop.w ?? Math.min(w - 1.4, 4.2)) : 0;

  for (const side of SIDES) {
    const isFront = side.name === 'front';
    if (side.name === 'back' && win.back === false) continue;
    if ((side.name === 'left' || side.name === 'right') && win.sides === false) continue;
    const faceW = side.name === 'front' || side.name === 'back' ? w : d;
    const off = side.name === 'front' || side.name === 'back' ? d / 2 : w / 2;
    g.pushT([0, 0, 0], [0, side.rot, 0]);
    g.pushT([0, 0, off + 0.02]);
    if (glassBuilding) {
      // Curtain wall: mullions and floor slabs over the dark glass.
      const cols = Math.max(2, Math.round(faceW / 1.1));
      for (let i = 0; i <= cols; i++) g.box(0.08, H, 0.08, [-faceW / 2 + (i * faceW) / cols, H / 2 + 0.1, 0.03], trim);
      for (let f = 0; f < floors; f++) {
        for (let i = 0; i < cols; i++) {
          const lit = c.rng.chance(litP) ? 0.85 : 0;
          g.box(faceW / cols - 0.1, fh - 0.3, 0.03, [-faceW / 2 + ((i + 0.5) * faceW) / cols, f * fh + fh / 2 + 0.1, 0.01], P.glass, { emissive: lit });
        }
      }
    } else {
      const per = win.per ?? Math.max(1, Math.floor(faceW / 2.1));
      for (let f = 0; f < floors; f++) {
        const y = f * fh + fh * 0.55 + 0.1;
        for (let i = 0; i < per; i++) {
          const x = -faceW / 2 + ((i + 0.5) * faceW) / per;
          if (isFront && f === 0) {
            if (doorX !== null && Math.abs(x - doorX) < 1.0) continue;
            if (shop && Math.abs(x - (doorX !== null && Math.abs(doorX) > 0.5 ? 0 : 0)) < shopW / 2 + 0.5) continue;
          }
          windowPiece(g, style, x, y, frame, c.rng.chance(litP) ? c.rng.range(0.7, 1) : 0, win.shutters, f > 0 || !isFront ? p.flowerbox : undefined);
        }
      }
    }
    if (isFront) {
      if (shop) {
        const sx = doorX !== null && Math.abs(doorX) > 0.6 ? 0 : 0;
        g.box(shopW + 0.3, 2.0, 0.12, [sx, 1.25, 0.02], shop.color ?? P.ink);
        g.box(shopW, 1.7, 0.06, [sx, 1.3, 0.06], P.glass, { emissive: 0.95 });
        g.box(shopW + 0.3, 0.35, 0.18, [sx, 0.3, 0.06], shop.color ?? P.ink);
      }
      if (doorX !== null && p.door !== false) doorPiece(g, doorX, p.door?.color ?? P.teal, frame, p.door?.double, p.door?.canopy);
      if (p.awning) awningPiece(g, shop ? 0 : (doorX ?? 0), 2.65, shop ? shopW + 0.6 : 2.2, p.awning);
      if (p.balcony && floors > 1) {
        g.box(Math.min(3.2, w - 0.8), 0.15, 0.9, [0, fh + 0.15, 0.45], trim);
        for (let i = 0; i <= 8; i++) g.box(0.05, 0.8, 0.05, [-1.5 + (i * 3) / 8, fh + 0.6, 0.86], P.ink);
        g.box(3.1, 0.06, 0.06, [0, fh + 1.0, 0.86], P.ink);
      }
    }
    g.pop();
    g.pop();
  }

  // Roof.
  const rh = roofPiece(g, p.roof ?? 'gable', w, d, H + 0.1, roofColor, wall, trim, p.roofAxis ?? (w >= d ? 'x' : 'z'), p.roofH);
  if (p.chimney) {
    g.box(0.6, 1.6, 0.6, [w * 0.25, H + rh * 0.6, -d * 0.15], P.brick);
    g.box(0.75, 0.15, 0.75, [w * 0.25, H + rh * 0.6 + 0.85, -d * 0.15], P.stoneDark);
  }
  const top = H + 0.3;
  switch (p.rooftop) {
    case 'garden':
      for (let i = 0; i < 5; i++) g.sphere(0.4, [c.rng.range(-w / 3, w / 3), top + 0.3, c.rng.range(-d / 3, d / 3)], c.rng.pick([P.leaf, P.leafLight]), { detail: 1, wind: 0.3 });
      break;
    case 'antenna':
      g.cyl(0.05, 0.07, 3, [w * 0.2, top + 1.5, 0], P.metal, { seg: 6 });
      g.box(0.8, 0.05, 0.05, [w * 0.2, top + 2.4, 0], P.metal);
      g.sphere(0.08, [w * 0.2, top + 3.0, 0], P.red, { emissive: 1.8 });
      break;
    case 'solar':
      for (let i = 0; i < 3; i++) g.box(1.2, 0.06, 0.8, [-w / 3 + (i * w) / 3, top + 0.35, 0], '#2b4b7a', { rot: [-0.35, 0, 0] });
      break;
    case 'tank':
      g.cyl(0.8, 0.8, 1.4, [-w * 0.2, top + 1.3, d * 0.1], P.woodDark, { seg: 12 });
      g.cone(0.9, 0.5, [-w * 0.2, top + 2.25, d * 0.1], P.woodDark, { seg: 12 });
      for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) g.box(0.08, 0.7, 0.08, [-w * 0.2 + x, top + 0.35, d * 0.1 + z], P.ink);
      break;
    case 'ac':
      for (let i = 0; i < 2; i++) {
        g.rbox(1.0, 0.7, 0.8, 0.05, [-w / 4 + i * (w / 2), top + 0.35, -d / 5], P.metal);
        c.spin((sg) => sg.box(0.6, 0.04, 0.08, [0, 0, 0], P.metalDark).box(0.08, 0.04, 0.6, [0, 0, 0], P.metalDark), [-w / 4 + i * (w / 2), top + 0.72, -d / 5], [0, 1, 0], 6);
      }
      break;
    case 'dish':
      g.cyl(0.08, 0.1, 1.2, [w * 0.25, top + 0.6, d * 0.2], P.metal, { seg: 8 });
      g.sphere(0.7, [w * 0.25, top + 1.3, d * 0.2 + 0.1], P.paper, { scale: [1, 1, 0.3], rot: [0.5, 0, 0] });
      break;
  }

  if (p.sign) {
    const s = p.sign;
    const sw = s.w ?? Math.min(w * 0.8, 4.2);
    const sh = s.h ?? 0.7;
    const sy = s.y ?? (shop || p.awning ? 3.3 : 2.7);
    g.box(sw + 0.12, sh + 0.12, 0.08, [0, sy, d / 2 + 0.06], P.ink);
    c.sign(0, sy, d / 2 + 0.1, sw, sh, 0, s);
  }
  if (p.sideSign) {
    const s = p.sideSign;
    const sw = s.w ?? 0.9, sh = s.h ?? 1.6;
    const sy = s.y ?? fh + 0.6;
    g.box(0.9, 0.06, 0.06, [w / 2 + 0.45, sy + sh / 2 - 0.1, d / 2 - 0.4], P.ink);
    c.sign(w / 2 + 0.55, sy, d / 2 - 0.4, sw, sh, Math.PI / 2, s, { double: true, depth: 0.04 });
    g.box(0.06, sh, sw, [w / 2 + 0.55, sy, d / 2 - 0.4], P.ink);
  }
  if (p.screen) {
    const sc = p.screen;
    g.box(sc.w + 0.2, sc.h + 0.2, 0.15, [0, sc.y, d / 2 + 0.08], P.ink);
    c.screen(0, sc.y, d / 2 + 0.16, sc.w, sc.h, 0, sc.kind as any, c.id, sc.span ?? 1);
  }

  c.collider({ type: 'box', x: 0, z: 0, hx: w / 2 + 0.05, hz: d / 2 + 0.05, h: H + rh, camera: true });
  if (doorX !== null && p.door !== false) c.anchor('door', doorX, 0, d / 2 + 0.9, 0);
  return { H, top };
}

defineKit('building', (c) => {
  building(c, c.params as BuildingParams);
});

/** A narrow row house; colours chosen by params or randomly from the palette. */
defineKit('rowhouse', (c) => {
  const walls = [P.peach, P.mint, P.butter, P.rose, P.powder, P.lavender, P.cream];
  building(c, {
    w: c.params.w ?? 4.2,
    d: c.params.d ?? 5,
    floors: c.params.floors ?? c.rng.int(2, 3),
    wall: c.params.wall ?? c.rng.pick(walls),
    trim: P.white,
    roof: c.params.roof ?? 'gable',
    roofAxis: 'x',
    roofColor: c.params.roofColor ?? c.rng.pick([P.terracotta, P.brick, P.slate, P.deepTeal]),
    windows: { style: c.params.style ?? c.rng.pick(['square', 'tall', 'arch'] as WindowStyle[]), per: 2, shutters: c.rng.chance(0.4) ? c.rng.pick([P.teal, P.woodDark, P.navy]) : undefined, lit: 0.55 },
    door: { x: c.params.doorX ?? (c.rng.chance(0.5) ? -0.9 : 0.9), color: c.rng.pick([P.teal, P.red, P.navy, P.woodDark, P.violet]), canopy: c.rng.chance(0.4) ? P.ink : undefined },
    flowerbox: c.rng.chance(0.5) ? c.rng.pick(['#f29db0', '#f6d55c', '#e8644a']) : undefined,
    chimney: c.rng.chance(0.5),
    balcony: c.params.balcony,
    sign: c.params.sign,
  });
});
