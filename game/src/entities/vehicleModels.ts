import * as THREE from 'three';
import { MeshBuilder, shade } from '../render/geo';
import { PAL } from '../render/materials';

export type VKind = 'muscle' | 'suv' | 'pickup' | 'limo' | 'police' | 'taxi' | 'van' | 'moto' | 'sports' | 'armored' | 'heli' | 'boat';

export interface VSpec {
  name: string;
  len: number;
  wid: number;
  hgt: number;
  maxSpeed: number;
  accel: number;
  turn: number;
  grip: number;
  hp: number;
  wheelR: number;
  wheelBase: number;
  colors: number[];
  /** Rider is visible (bike / boat). */
  open?: boolean;
  cls: 'car' | 'bike' | 'heli' | 'boat';
}

export const VSPECS: Record<VKind, VSpec> = {
  muscle: { name: 'Eagle V8 Muscle Car', len: 4.7, wid: 1.95, hgt: 1.32, maxSpeed: 47, accel: 14, turn: 0.56, grip: 6.5, hp: 110, wheelR: 0.38, wheelBase: 2.8, colors: [0xd43a34, 0x2b2e42, 0xe8b84a, 0x2f5fa8], cls: 'car' },
  suv: { name: 'Patriot SUV', len: 4.9, wid: 2.05, hgt: 1.75, maxSpeed: 39, accel: 10, turn: 0.5, grip: 8, hp: 140, wheelR: 0.42, wheelBase: 2.9, colors: [0x2b2e42, 0xf4f1e6, 0x8b93a6, 0x4c9a5a, 0x7a2a2a], cls: 'car' },
  pickup: { name: 'Homestead Pickup', len: 5.3, wid: 2.05, hgt: 1.75, maxSpeed: 37, accel: 9.5, turn: 0.5, grip: 7.5, hp: 150, wheelR: 0.44, wheelBase: 3.2, colors: [0xb8433a, 0x2f8f86, 0xf4f1e6, 0x6e4a32, 0x2f5fa8], cls: 'car' },
  limo: { name: 'Presidential Limousine', len: 7.0, wid: 1.98, hgt: 1.42, maxSpeed: 38, accel: 8.5, turn: 0.44, grip: 8, hp: 180, wheelR: 0.38, wheelBase: 4.6, colors: [0x16161f], cls: 'car' },
  police: { name: 'Police Cruiser', len: 4.8, wid: 1.95, hgt: 1.42, maxSpeed: 45, accel: 13, turn: 0.56, grip: 8, hp: 130, wheelR: 0.38, wheelBase: 2.85, colors: [0xf4f1e6], cls: 'car' },
  taxi: { name: 'Yellow Cab', len: 4.7, wid: 1.9, hgt: 1.46, maxSpeed: 37, accel: 9.5, turn: 0.56, grip: 8, hp: 110, wheelR: 0.37, wheelBase: 2.8, colors: [0xf2c230], cls: 'car' },
  van: { name: 'Delivery Van', len: 5.5, wid: 2.15, hgt: 2.35, maxSpeed: 31, accel: 7.5, turn: 0.48, grip: 8, hp: 160, wheelR: 0.42, wheelBase: 3.3, colors: [0xf4f1e6, 0xe8b84a, 0x8b93a6, 0x3fa7c4], cls: 'car' },
  moto: { name: 'Liberty Chopper', len: 2.3, wid: 0.8, hgt: 1.15, maxSpeed: 52, accel: 17, turn: 0.62, grip: 9, hp: 70, wheelR: 0.36, wheelBase: 1.6, colors: [0x2b2e42, 0xd43a34, 0x2f5fa8], open: true, cls: 'bike' },
  sports: { name: 'Bigly GT Sports Car', len: 4.5, wid: 1.98, hgt: 1.12, maxSpeed: 58, accel: 18, turn: 0.55, grip: 9, hp: 95, wheelR: 0.36, wheelBase: 2.7, colors: [0xf2c94c, 0xd43a34, 0xf4f1e6, 0x3fa7c4], cls: 'car' },
  armored: { name: 'The Beast (Armored)', len: 5.8, wid: 2.35, hgt: 2.25, maxSpeed: 35, accel: 9.5, turn: 0.46, grip: 9, hp: 480, wheelR: 0.52, wheelBase: 3.6, colors: [0x3a3d55], cls: 'car' },
  heli: { name: 'Golden Chopper', len: 9, wid: 2.4, hgt: 3, maxSpeed: 42, accel: 14, turn: 1.5, grip: 1, hp: 200, wheelR: 0, wheelBase: 0, colors: [0xe8b830, 0x2b2e42], cls: 'heli' },
  boat: { name: 'Speedboat', len: 6.2, wid: 2.3, hgt: 1.2, maxSpeed: 31, accel: 10, turn: 0.9, grip: 2.2, hp: 120, wheelR: 0, wheelBase: 3, colors: [0xf4f1e6, 0xd43a34, 0x2f5fa8], open: true, cls: 'boat' },
};

const geoCache = new Map<string, THREE.BufferGeometry>();
let wheelGeo: THREE.BufferGeometry | null = null;

export function wheelGeometry(): THREE.BufferGeometry {
  if (!wheelGeo) {
    const b = new MeshBuilder();
    // unit wheel: radius 1, width 1 along x
    const N = 10;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
      const y0 = Math.cos(a0), z0 = Math.sin(a0), y1 = Math.cos(a1), z1 = Math.sin(a1);
      b.quad(-0.5, y0, z0, 0.5, y0, z0, 0.5, y1, z1, -0.5, y1, z1, i % 2 ? 0x1d1a2e : 0x26283a);
      b.tri(0.5, 0, 0, 0.5, y1, z1, 0.5, y0, z0, 0x1d1a2e);
      b.tri(-0.5, 0, 0, -0.5, y0, z0, -0.5, y1, z1, 0x1d1a2e);
      b.tri(0.51, 0, 0, 0.51, y1 * 0.55, z1 * 0.55, 0.51, y0 * 0.55, z0 * 0.55, 0xcfd6dc);
      b.tri(-0.51, 0, 0, -0.51, y0 * 0.55, z0 * 0.55, -0.51, y1 * 0.55, z1 * 0.55, 0xcfd6dc);
    }
    wheelGeo = b.build();
  }
  return wheelGeo;
}

/** Vehicle body geometry: origin on the ground at the vehicle centre, nose toward +z. */
export function bodyGeometry(kind: VKind, color: number): THREE.BufferGeometry {
  const key = kind + color;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const s = VSPECS[kind];
  const b = new MeshBuilder();
  const W = s.wid, L = s.len, R = s.wheelR;
  const glass = 0x2f3b55, dark = 0x23253a, lamp = 0xfff2c0, tail = 0xc22a26;
  const c = color, c2 = shade(color, 0.82);
  const lights = (y: number, zf: number, zr: number, w = W) => {
    for (const sx of [-1, 1]) {
      b.box(sx * (w / 2 - 0.3), y, zf, 0.36, 0.16, 0.06, lamp, 0, 0);
      b.box(sx * (w / 2 - 0.3), y, zr, 0.4, 0.14, 0.06, tail, 0, 0);
    }
  };
  const car = (lowH: number, cabH: number, cabL: number, cabZ: number, cabW = W - 0.25) => {
    const y0 = R * 0.75;
    b.box(0, y0 + lowH / 2, 0, W, lowH, L, c, 0, 0);
    b.box(0, y0 + 0.12, 0, W + 0.06, 0.2, L + 0.1, dark, 0, 0); // sills + bumpers
    b.box(0, y0 + lowH + cabH / 2, cabZ, cabW, cabH, cabL, c2, 0, 8);
    b.box(0, y0 + lowH + cabH / 2 + 0.02, cabZ, cabW + 0.03, cabH - 0.16, cabL - 0.3, glass, 0, 4 | 8 | 16 | 32); // side glass
    b.box(0, y0 + lowH + cabH / 2 + 0.02, cabZ, cabW - 0.2, cabH - 0.16, cabL + 0.03, glass, 0, 4 | 8 | 1 | 2); // front/rear glass
    lights(y0 + lowH - 0.18, L / 2 + 0.03, -L / 2 - 0.03);
    b.box(0, y0 + 0.35, L / 2 + 0.03, W * 0.5, 0.2, 0.05, dark, 0, 0); // grille
    return y0 + lowH + cabH;
  };
  if (kind === 'muscle') {
    const top = car(0.55, 0.5, 1.9, -0.35);
    b.box(0, R * 0.75 + 0.6, 1.0, 0.7, 0.12, 0.9, dark, 0, 0); // hood scoop
    for (const sx of [-0.25, 0.25]) b.box(sx, R * 0.75 + 0.555, 0, 0.16, 0.012, L - 0.1, 0xf4f1e6, 0, 8);
    b.box(0, top - 0.42, -L / 2 + 0.2, W - 0.2, 0.06, 0.36, c, 0, 0);
  } else if (kind === 'sports') {
    car(0.42, 0.42, 1.7, -0.25, W - 0.4);
    b.box(0, R * 0.75 + 0.62, -L / 2 + 0.22, W - 0.1, 0.06, 0.4, dark, 0, 0);
    for (const sx of [-1, 1]) b.box(sx * (W / 2 - 0.25), R * 0.75 + 0.5, -L / 2 + 0.22, 0.08, 0.22, 0.1, dark, 0, 0);
  } else if (kind === 'suv') {
    car(0.75, 0.68, 3.0, -0.45);
    b.box(0, R * 0.75 + 1.46, -0.45, W - 0.5, 0.06, 2.4, dark, 0, 0);
  } else if (kind === 'pickup') {
    car(0.72, 0.7, 1.8, 0.45);
    // bed walls
    for (const sx of [-1, 1]) b.box(sx * (W / 2 - 0.06), R * 0.75 + 0.95, -1.55, 0.12, 0.46, 2.1, c, 0, 0);
    b.box(0, R * 0.75 + 0.95, -L / 2 + 0.06, W, 0.46, 0.12, c, 0, 0);
    b.box(0, R * 0.75 + 0.735, -1.55, W - 0.2, 0.03, 2.0, dark, 0, 8);
  } else if (kind === 'limo') {
    car(0.56, 0.5, 4.2, -0.5);
    for (const sx of [-1, 1]) {
      b.box(sx * (W / 2 - 0.2), R * 0.75 + 0.9, L / 2 - 0.5, 0.03, 0.5, 0.03, 0xcfd6dc, 0, 0);
      b.box(sx * (W / 2 - 0.2) + 0.13, R * 0.75 + 1.08, L / 2 - 0.5, 0.24, 0.15, 0.02, sx > 0 ? 0xd2222d : 0x2a56c8, 0, 0);
    }
    b.box(0, R * 0.75 + 0.3, 0, W + 0.08, 0.06, L - 0.4, 0xcfd6dc, 0, 0);
  } else if (kind === 'police') {
    const top = car(0.6, 0.55, 2.1, -0.25);
    b.box(0, R * 0.75 + 0.3, 0, W + 0.02, 0.36, 1.9, 0x1e2f5c, 0, 4 | 8 | 16 | 32);
    b.box(0, top + 0.05, -0.25, 1.2, 0.1, 0.3, dark, 0, 0);
    b.box(0, R * 0.75 + 0.45, L / 2 + 0.1, W * 0.8, 0.34, 0.12, dark, 0, 0); // push bar
  } else if (kind === 'taxi') {
    const top = car(0.62, 0.58, 2.2, -0.25);
    b.box(0, top + 0.12, -0.2, 0.6, 0.22, 0.26, 0xf7f4ea, 0, 0);
    for (let k = -4; k < 4; k++) b.box(0, R * 0.75 + 0.36, k * 0.5 + 0.25, W + 0.02, 0.1, 0.25, k % 2 ? dark : 0xf7f4ea, 0, 4 | 8 | 16 | 32);
  } else if (kind === 'van') {
    const y0 = R * 0.75;
    b.box(0, y0 + 1.0, -0.3, W, 2.0, L - 0.9, c, 0, 0);
    b.box(0, y0 + 0.62, L / 2 - 0.5, W, 1.24, 1.0, c, 0, 0);
    b.box(0, y0 + 1.45, L / 2 - 0.82, W - 0.2, 0.7, 0.5, glass, 0, 8);
    b.box(0, y0 + 0.12, 0, W + 0.06, 0.2, L + 0.1, dark, 0, 0);
    b.box(0, y0 + 1.1, -0.3, W + 0.02, 0.5, L - 1.6, c2, 0, 4 | 8 | 16 | 32);
    lights(y0 + 0.75, L / 2 + 0.03, -L / 2 - 0.03);
  } else if (kind === 'armored') {
    const y0 = R * 0.8;
    b.box(0, y0 + 0.6, 0, W, 1.2, L, c, 0, 0);
    b.box(0, y0 + 1.6, -0.5, W - 0.2, 0.85, L - 1.8, c2, 0, 8);
    b.box(0, y0 + 1.62, L / 2 - 1.45, W - 0.5, 0.4, 0.1, glass, 0, 0);
    for (const sx of [-1, 1]) b.box(sx * (W / 2 - 0.1), y0 + 1.65, -0.3, 0.06, 0.3, 1.4, glass, 0, 0);
    b.box(0, y0 + 0.5, L / 2 + 0.12, W + 0.1, 0.7, 0.2, dark, 0, 0);
    for (const sx of [-0.6, 0, 0.6]) b.box(sx, y0 + 0.5, L / 2 + 0.24, 0.1, 0.9, 0.06, 0x8b93a6, 0, 0);
    b.box(0, y0 + 2.08, -0.5, 1, 0.14, 1, PAL.gold, 0, 0);
    lights(y0 + 0.95, L / 2 + 0.03, -L / 2 - 0.03);
  } else if (kind === 'moto') {
    b.box(0, 0.55, 0, 0.24, 0.3, 1.5, dark, 0, 0);
    b.box(0, 0.82, 0.25, 0.36, 0.3, 0.6, c, 0, 0);
    b.box(0, 0.8, -0.35, 0.34, 0.12, 0.7, 0x4a3328, 0, 0);
    b.box(0, 0.85, 0.75, 0.1, 0.7, 0.1, 0xcfd6dc, -0.0, 0);
    b.box(0, 1.15, 0.72, 0.8, 0.06, 0.06, 0xcfd6dc, 0, 0);
    b.box(0, 0.95, 0.9, 0.2, 0.2, 0.08, lamp, 0, 0);
    b.box(0, 0.7, -0.95, 0.16, 0.1, 0.06, tail, 0, 0);
    for (const sx of [-1, 1]) b.box(sx * 0.2, 0.45, -0.6, 0.08, 0.1, 0.9, 0xcfd6dc, 0, 0);
  } else if (kind === 'heli') {
    b.blob(0, 1.7, 0.6, 1.25, 1.2, 2.3, c, 7, 0.05, c2);
    b.blob(0, 1.85, 1.6, 0.95, 0.8, 1.2, glass, 9, 0.04);
    b.box(0, 1.9, -3.2, 0.34, 0.4, 4.4, c, 0, 0);
    b.box(0, 2.5, -5.2, 0.1, 1.5, 0.8, c2, 0, 0);
    b.box(0, 1.9, -5.0, 1.6, 0.08, 0.5, c2, 0, 0);
    b.box(0, 2.95, 0.2, 0.24, 0.5, 0.24, dark, 0, 0);
    for (const sx of [-1, 1]) {
      b.box(sx * 1.05, 0.12, 0.4, 0.14, 0.14, 3.6, dark, 0, 0);
      b.box(sx * 0.85, 0.5, 1.3, 0.08, 0.8, 0.08, dark, 0, 0);
      b.box(sx * 0.85, 0.5, -0.5, 0.08, 0.8, 0.08, dark, 0, 0);
    }
    b.box(0.7, 1.75, 0.55, 0.02, 0.5, 0.9, PAL.gold, 0, 0);
  } else if (kind === 'boat') {
    const hw = W / 2;
    // hull with pointed bow
    b.box(0, 0.15, -0.6, W, 0.9, L - 1.8, c, 0, 0);
    b.quad(-hw, -0.3, L / 2 - 1.5, 0, -0.3, L / 2 + 0.2, 0, 0.75, L / 2 + 0.5, -hw, 0.6, L / 2 - 1.5, c);
    b.quad(0, -0.3, L / 2 + 0.2, hw, -0.3, L / 2 - 1.5, hw, 0.6, L / 2 - 1.5, 0, 0.75, L / 2 + 0.5, c);
    b.tri(-hw, 0.6, L / 2 - 1.5, 0, 0.75, L / 2 + 0.5, hw, 0.6, L / 2 - 1.5, 0xf4f1e6);
    b.box(0, 0.61, -0.6, W - 0.3, 0.02, L - 1.9, 0xcfa87a, 0, 8);
    b.box(0, 0.2, -0.6, W + 0.04, 0.16, L - 1.8, 0xd43a34, 0, 4 | 8);
    b.box(0, 1.0, 0.7, W - 0.5, 0.5, 0.08, glass, 0, 0);
    b.box(0, 0.75, 0.55, W - 0.4, 0.3, 0.5, 0xf4f1e6, 0, 0);
    b.box(-0.5, 0.82, -0.6, 0.6, 0.5, 0.6, 0xf4f1e6, 0, 0);
    b.box(0.5, 0.82, -0.6, 0.6, 0.5, 0.6, 0xf4f1e6, 0, 0);
    b.box(0, 0.75, -L / 2 + 0.3, 0.5, 0.9, 0.6, dark, 0, 0);
  }
  const g = b.build();
  geoCache.set(key, g);
  return g;
}

export function rotorGeometry(): THREE.BufferGeometry {
  const key = 'rotor';
  let g = geoCache.get(key);
  if (!g) {
    const b = new MeshBuilder();
    b.box(0, 0, 0, 9.4, 0.06, 0.32, 0x23253a, 0, 0);
    b.box(0, 0, 0, 0.32, 0.06, 9.4, 0x23253a, 0, 0);
    b.box(0, 0.05, 0, 0.5, 0.2, 0.5, 0x8b93a6, 0, 0);
    g = b.build();
    geoCache.set(key, g);
  }
  return g;
}
