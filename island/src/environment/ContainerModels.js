import * as THREE from 'three';
import { buildCrate, place, merge } from './PropFactory.js';
import { wornPaint } from './PropMaterials.js';
import { patchMaterial } from '../core/MaterialPatch.js';

// Treasure container models, one per tier. Each returns { group, pivot, size, led? }:
// the lid hangs on `pivot` (rotate .x negative to open) and `size` is the footprint.

let MATS = null;
function mats(M) {
  if (MATS) return MATS;
  const caseMat = new THREE.MeshStandardMaterial({ color: 0x1d2021, roughness: 0.62, metalness: 0.05 });
  patchMaterial(caseMat, { wet: 0.6, key: 'case' });
  MATS = {
    case: caseMat,
    steel: wornPaint(0x5c6463, { bare: 0x8a8a86, wear: 0.18, rust: 0.35, scale: 5, bareMetal: 0.9, roughness: 0.42, metalness: 0.75 }),
    vault: wornPaint(0x2a2d2c, { bare: 0x6a5a48, wear: 0.25, rust: 0.6, scale: 3, bareMetal: 0.6, roughness: 0.5, metalness: 0.6 }),
    brass: M.brass,
    black: M.metalBlack,
    mark: (() => {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 128;
      const g = c.getContext('2d');
      g.clearRect(0, 0, 128, 128);
      g.strokeStyle = 'rgba(200,196,182,0.75)';
      g.lineWidth = 6;
      g.beginPath();
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; g.lineTo(64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44); }
      g.closePath(); g.stroke();
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(64, 28); g.lineTo(64, 100); g.moveTo(34, 46); g.lineTo(94, 82); g.moveTo(94, 46); g.lineTo(34, 82); g.stroke();
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    })(),
  };
  return MATS;
}

const B = (w, h, d, x, y, z) => place(new THREE.BoxGeometry(w, h, d), x, y, z);
const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; return o; };

/** Rugged black polymer case with latches and a faint hexagon mark. */
function cryptoCase(M) {
  const X = mats(M);
  const W = 0.72, H = 0.3, D = 0.48;
  const g = new THREE.Group();
  g.add(mesh(merge([B(W, H * 0.6, D, 0, H * 0.3, 0), B(W + 0.02, 0.025, D + 0.02, 0, H * 0.58, 0), B(0.12, 0.05, 0.05, -0.22, H * 0.5, D / 2 + 0.02), B(0.12, 0.05, 0.05, 0.22, H * 0.5, D / 2 + 0.02)]), X.case));
  const pivot = new THREE.Group();
  pivot.position.set(0, H * 0.6, -D / 2);
  const lid = mesh(merge([B(W, H * 0.4, D, 0, H * 0.2, D / 2), B(0.3, 0.035, 0.06, 0, H * 0.42, D / 2)]), X.case);
  pivot.add(lid);
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18), X.mark);
  mark.rotation.x = -Math.PI / 2;
  mark.position.set(0.18, H * 0.4 + 0.002, D / 2);
  pivot.add(mark);
  g.add(pivot);
  return { group: g, pivot, size: [W, H, D] };
}

/** Steel case with a keypad; the LED turns green when unlocked. */
function encryptedCase(M) {
  const X = mats(M);
  const W = 0.62, H = 0.36, D = 0.44;
  const g = new THREE.Group();
  g.add(mesh(merge([B(W, H * 0.62, D, 0, H * 0.31, 0), B(W + 0.03, 0.03, 0.04, 0, H * 0.12, D / 2), B(W + 0.03, 0.03, 0.04, 0, H * 0.5, D / 2)]), X.steel));
  const pad = mesh(B(0.14, 0.1, 0.02, 0.16, H * 0.33, D / 2 + 0.012), X.black);
  g.add(pad);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 0.2, 0.1) }));
  led.position.set(0.23, H * 0.36, D / 2 + 0.02);
  g.add(led);
  const pivot = new THREE.Group();
  pivot.position.set(0, H * 0.62, -D / 2);
  pivot.add(mesh(B(W, H * 0.38, D, 0, H * 0.19, D / 2), X.steel));
  g.add(pivot);
  return { group: g, pivot, size: [W, H, D], led };
}

/** Heavy dark strongbox with brass corners. */
function vaultBox(M) {
  const X = mats(M);
  const W = 0.86, H = 0.52, D = 0.6;
  const g = new THREE.Group();
  const corners = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) corners.push(B(0.06, H * 0.64, 0.06, sx * (W / 2 - 0.02), H * 0.32, sz * (D / 2 - 0.02)));
  g.add(mesh(B(W, H * 0.64, D, 0, H * 0.32, 0), X.vault));
  g.add(mesh(merge(corners), X.brass));
  const pivot = new THREE.Group();
  pivot.position.set(0, H * 0.64, -D / 2);
  pivot.add(mesh(B(W + 0.02, H * 0.36, D + 0.02, 0, H * 0.18, D / 2), X.vault));
  pivot.add(mesh(B(0.18, 0.1, 0.03, 0, H * 0.1, D + 0.01), X.brass));
  g.add(pivot);
  return { group: g, pivot, size: [W, H, D] };
}

export function buildContainerModel(tier, M) {
  if (tier === 'crypto') return cryptoCase(M);
  if (tier === 'encrypted') return encryptedCase(M);
  if (tier === 'vault') return vaultBox(M);
  const c = buildCrate(M, 0.9, 0.56, 0.56, 13);
  return { group: c.group, pivot: c.pivot, size: [0.9, 0.56, 0.56] };
}

/** Cargo crate for deliveries (boxy, stencilled, strapped). */
export function buildCargoCase(M, kind = 'case') {
  const X = mats(M);
  const g = new THREE.Group();
  if (kind === 'med') {
    g.add(mesh(B(0.6, 0.4, 0.42, 0, 0.2, 0), new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.6 })));
    g.add(mesh(merge([B(0.2, 0.06, 0.012, 0, 0.24, 0.215), B(0.06, 0.2, 0.012, 0, 0.24, 0.215)]), new THREE.MeshStandardMaterial({ color: 0xa8261c, roughness: 0.6 })));
  } else if (kind === 'equipment') {
    g.add(mesh(B(0.95, 0.5, 0.55, 0, 0.25, 0), X.steel));
    g.add(mesh(merge([B(0.98, 0.04, 0.05, 0, 0.3, 0.27), B(0.98, 0.04, 0.05, 0, 0.3, -0.27)]), X.black));
  } else {
    g.add(mesh(B(0.8, 0.46, 0.5, 0, 0.23, 0), X.case));
    g.add(mesh(merge([B(0.05, 0.47, 0.52, -0.25, 0.235, 0), B(0.05, 0.47, 0.52, 0.25, 0.235, 0)]), new THREE.MeshStandardMaterial({ color: 0x8a6a2a, roughness: 0.8 })));
  }
  return g;
}
