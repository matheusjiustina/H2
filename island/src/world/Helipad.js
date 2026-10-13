import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../core/MaterialPatch.js';
import { LAYER, U } from '../core/Shared.js';
import { HELIPAD } from './Archipelago.js';
import { clamp, damp, lerp, smoothstep } from '../utils/MathUtils.js';
import { buildSign } from '../environment/PropFactory.js';
import { C, WHITE, ORANGE, part, box, cyl, makeCanvas, canvasTexture, normalImage, imageTexture } from '../vehicles/SeaplaneModel.js';

// The home island's helipad: a weathered concrete slab with a painted H, touchdown
// circle and perimeter line, flush perimeter lights that come up at dusk, a windsock
// that follows the wind (and the rotor wash), a small maintenance corner and the fuel
// store. The ground under it is levelled by the PADS entry, the jungle kept clear by
// the EXCLUSIONS entry (Archipelago.js).

const HALF = HELIPAD.half; // slab half size, m
const THICK = 0.3;
const RAISE = 0.14; // slab top above the levelled ground

function rand(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

/** Concrete, joints, cracks, stains and worn paint markings, with a height field for the normal map. */
function slabTextures() {
  const S = 1024, m2p = S / (HALF * 2);
  const r = rand(4242);
  const cv = makeCanvas(S, S), g = cv.getContext('2d', { willReadFrequently: true });
  // base concrete with large soft blotches and fine speckle
  g.fillStyle = '#a19d94'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) {
    const x = r() * S, y = r() * S, rad = 20 + r() * 120;
    const dark = r() < 0.55;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, dark ? `rgba(70,66,58,${0.05 + r() * 0.07})` : `rgba(200,196,186,${0.04 + r() * 0.06})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 26000; i++) { const v = 90 + r() * 110; g.fillStyle = `rgba(${v},${v},${v * 0.96},${0.15 + r() * 0.25})`; g.fillRect(r() * S, r() * S, 1 + (r() < 0.2), 1 + (r() < 0.2)); }
  // sand blown onto the edges, darker weathered rim
  for (let i = 0; i < 90; i++) {
    const side = Math.floor(r() * 4), t = r() * S, d = r() * 60;
    const x = side === 0 ? d : side === 1 ? S - d : t, y = side === 2 ? d : side === 3 ? S - d : t;
    const rad = 15 + r() * 50;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, `rgba(196,176,138,${0.12 + r() * 0.15})`); grd.addColorStop(1, 'rgba(196,176,138,0)');
    g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.strokeStyle = 'rgba(60,56,50,0.25)'; g.lineWidth = 18; g.strokeRect(0, 0, S, S);
  // oil and fuel stains around the skid positions, rubber scuffs from skid shoes
  for (let i = 0; i < 14; i++) {
    const x = S / 2 + (r() - 0.5) * 3.2 * m2p, y = S / 2 + (r() - 0.5) * 4.5 * m2p, rad = 10 + r() * 34;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, `rgba(36,32,28,${0.25 + r() * 0.25})`); grd.addColorStop(0.7, 'rgba(36,32,28,0.08)'); grd.addColorStop(1, 'rgba(36,32,28,0)');
    g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (const sx of [-1.05, 1.05]) {
    for (let k = 0; k < 7; k++) {
      const x = S / 2 + (sx + (r() - 0.5) * 0.25) * m2p, y = S / 2 + (r() - 0.5) * 3 * m2p;
      g.strokeStyle = `rgba(28,26,24,${0.08 + r() * 0.12})`; g.lineWidth = 3 + r() * 4;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 12, y + (r() - 0.5) * 2.4 * m2p); g.stroke();
    }
  }
  const base = g.getImageData(0, 0, S, S);

  // paint layer: white TLOF line, yellow touchdown circle, the H and the mass marking
  const pc = makeCanvas(S, S), p = pc.getContext('2d', { willReadFrequently: true });
  const M = (v) => S / 2 + v * m2p;
  p.strokeStyle = '#f1efe8'; p.lineWidth = 0.3 * m2p;
  p.strokeRect(M(-HALF + 0.45), M(-HALF + 0.45), (HALF * 2 - 0.9) * m2p, (HALF * 2 - 0.9) * m2p);
  p.strokeStyle = '#e8c234'; p.lineWidth = 0.5 * m2p;
  p.beginPath(); p.arc(S / 2, S / 2, 3.3 * m2p, 0, Math.PI * 2); p.stroke();
  p.fillStyle = '#f1efe8';
  const hw = 0.9, hh = 1.5, bar = 0.4;
  p.fillRect(M(-hw), M(-hh), bar * m2p, hh * 2 * m2p);
  p.fillRect(M(hw - bar), M(-hh), bar * m2p, hh * 2 * m2p);
  p.fillRect(M(-hw), M(-bar / 2), hw * 2 * m2p, bar * m2p);
  // mass marking (2.5 t), read on approach from the lagoon side (-z)
  p.save();
  p.translate(M(0), M(-HALF + 1.6));
  p.rotate(Math.PI);
  p.scale(-1, 1);
  p.font = `bold ${0.9 * m2p}px Arial`; p.textAlign = 'center'; p.textBaseline = 'middle';
  p.fillText('2.5t', 0, 0);
  p.restore();
  // wear: chip the paint
  p.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 2600; i++) { p.fillStyle = `rgba(0,0,0,${0.3 + r() * 0.7})`; const s2 = 1 + r() * 5; p.fillRect(r() * S, r() * S, s2, s2 * (0.4 + r())); }
  for (let i = 0; i < 40; i++) { const x = S / 2 + (r() - 0.5) * 3 * m2p, y = S / 2 + (r() - 0.5) * 4 * m2p; p.fillStyle = 'rgba(0,0,0,0.5)'; p.beginPath(); p.arc(x, y, 6 + r() * 16, 0, 7); p.fill(); }
  p.globalCompositeOperation = 'source-over';
  const paint = p.getImageData(0, 0, S, S);

  // joints (3 x 3 panels), cracks, tie-down rings: height field
  const hc = makeCanvas(S, S), h = hc.getContext('2d', { willReadFrequently: true });
  h.fillStyle = '#808080'; h.fillRect(0, 0, S, S);
  h.strokeStyle = '#3a3a3a'; h.lineWidth = 4;
  for (const t of [-HALF / 3, HALF / 3]) {
    h.beginPath(); h.moveTo(M(t), 0); h.lineTo(M(t), S); h.stroke();
    h.beginPath(); h.moveTo(0, M(t)); h.lineTo(S, M(t)); h.stroke();
  }
  h.strokeStyle = '#5a5a5a'; h.lineWidth = 1.6;
  for (let c = 0; c < 18; c++) {
    let x = r() * S, y = r() * S, a = r() * 6.28;
    h.beginPath(); h.moveTo(x, y);
    const n = 6 + Math.floor(r() * 14);
    for (let k = 0; k < n; k++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * 9; y += Math.sin(a) * 9; h.lineTo(x, y); }
    h.stroke();
  }
  for (const [x, z] of [[-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2]]) {
    h.strokeStyle = '#4a4a4a'; h.lineWidth = 3; h.beginPath(); h.arc(M(x), M(z), 0.09 * m2p, 0, 7); h.stroke();
  }
  const relief = h.getImageData(0, 0, S, S);

  const out = new ImageData(S, S), hgt = new Float32Array(S * S);
  const bd = base.data, pd = paint.data, rd = relief.data, od = out.data;
  for (let i = 0; i < S * S; i++) {
    const o = i * 4;
    const a = pd[o + 3] / 255;
    const rel = rd[o] / 255;
    let rr = lerp(bd[o], pd[o] * 0.93, a), gg = lerp(bd[o + 1], pd[o + 1] * 0.93, a), bb = lerp(bd[o + 2], pd[o + 2] * 0.93, a);
    const shade = 0.75 + 0.25 * clamp(rel / 0.5, 0, 1.2);
    od[o] = rr * shade; od[o + 1] = gg * shade; od[o + 2] = bb * shade; od[o + 3] = 255;
    hgt[i] = rel * 0.8 + (bd[o] / 255) * 0.12 + a * 0.06;
  }
  return { color: imageTexture(out, true, 8), normal: imageTexture(normalImage(hgt, S, S, 2.4), false, 8) };
}

/** Soft gravel apron that fades into the sand around the slab. */
function apronTexture() {
  const S = 512;
  const r = rand(77);
  const cv = makeCanvas(S, S), g = cv.getContext('2d');
  g.fillStyle = 'rgb(128,120,104)'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 16000; i++) { const v = 70 + r() * 120; g.fillStyle = `rgba(${v},${v * 0.95},${v * 0.86},0.8)`; const s = 1 + r() * 2.5; g.fillRect(r() * S, r() * S, s, s); }
  // alpha: opaque ring around the slab, fading out at the rim
  const img = g.getImageData(0, 0, S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = Math.abs(x / S - 0.5) * 2, v = Math.abs(y / S - 0.5) * 2;
    const e = Math.max(u, v);
    const n = Math.sin(x * 0.11) * Math.sin(y * 0.13) * 0.03;
    d[(y * S + x) * 4 + 3] = 255 * (1 - smoothstep(0.82, 0.99, e + n));
  }
  g.putImageData(img, 0, 0);
  return canvasTexture(cv, true, 4);
}

export class Helipad {
  constructor({ scene, terrainData, materials, collision }) {
    this.group = new THREE.Group();
    this.group.name = 'helipad';
    const level = terrainData.heightAt(HELIPAD.x, HELIPAD.z);
    this.level = level;
    this.top = level + RAISE;
    this.group.position.set(HELIPAD.x, level, HELIPAD.z);
    scene.add(this.group);
    const mk = (geo, mat, cast = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = cast; m.receiveShadow = true;
      m.layers.set(LAYER.WORLD);
      this.group.add(m);
      return m;
    };

    // ---------------------------------------------------------------- slab and apron
    const tex = slabTextures();
    const top = new THREE.MeshStandardMaterial({ map: tex.color, normalMap: tex.normal, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.88, metalness: 0 });
    patchMaterial(top, { wet: 0.7, key: 'helipadTop' });
    const side = new THREE.MeshStandardMaterial({ color: 0x8a867d, roughness: 0.92 });
    patchMaterial(side, { wet: 0.7, key: 'helipadSide' });
    const slab = new THREE.BoxGeometry(HALF * 2, THICK, HALF * 2);
    slab.translate(0, RAISE - THICK / 2, 0);
    mk(slab, [side, side, top, side, side, side], false);
    const apronMat = new THREE.MeshStandardMaterial({ map: apronTexture(), transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    patchMaterial(apronMat, { wet: 0.8, key: 'helipadApron' });
    // a frame of gravel around the slab (not under it, so it can never show through)
    const AO = HALF + 2.25;
    const outer = new THREE.Shape([new THREE.Vector2(-AO, -AO), new THREE.Vector2(AO, -AO), new THREE.Vector2(AO, AO), new THREE.Vector2(-AO, AO)]);
    outer.holes.push(new THREE.Path([new THREE.Vector2(-HALF + 0.05, -HALF + 0.05), new THREE.Vector2(-HALF + 0.05, HALF - 0.05), new THREE.Vector2(HALF - 0.05, HALF - 0.05), new THREE.Vector2(HALF - 0.05, -HALF + 0.05)]));
    const apron = new THREE.ShapeGeometry(outer, 1);
    apron.rotateX(-Math.PI / 2);
    {
      const P = apron.attributes.position, uv = apron.attributes.uv;
      for (let i = 0; i < P.count; i++) uv.setXY(i, P.getX(i) / (AO * 2) + 0.5, P.getZ(i) / (AO * 2) + 0.5);
    }
    apron.computeVertexNormals();
    apron.translate(0, 0.03, 0);
    const ap = mk(apron, apronMat, false);
    ap.renderOrder = -1;
    collision.addBox({ x: HELIPAD.x, y: this.top - THICK / 2, z: HELIPAD.z, hx: HALF, hy: THICK / 2, hz: HALF, walkable: true, surface: 'rock' });

    // ---------------------------------------------------------------- perimeter lights (green, flush)
    const lightGeos = [], lightPts = [];
    for (let k = 0; k < 16; k++) {
      const s = Math.floor(k / 4);
      const along = lerp(-HALF + 0.18, HALF - 0.18, (k % 4) / 4 + 0.125);
      const [x, z] = s === 0 ? [along, -HALF + 0.18] : s === 1 ? [HALF - 0.18, along] : s === 2 ? [-along, HALF - 0.18] : [-HALF + 0.18, -along];
      const lg = new THREE.CylinderGeometry(0.075, 0.085, 0.06, 12);
      lg.translate(x, RAISE + 0.01, z);
      lightGeos.push(part(lg, C(0x9cffb0)));
      lightPts.push(x, RAISE + 0.12, z);
    }
    this.lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.2, emissive: 0x2bff5c, emissiveIntensity: 0.2 });
    mk(mergeGeometries(lightGeos), this.lampMat, false);
    const glowCv = makeCanvas(64, 64), gg = glowCv.getContext('2d');
    const grd = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    gg.fillStyle = grd; gg.fillRect(0, 0, 64, 64);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(lightPts, 3));
    this.glowMat = new THREE.PointsMaterial({ map: new THREE.CanvasTexture(glowCv), color: 0x4dff7a, size: 0.55, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.glow = new THREE.Points(pg, this.glowMat);
    this.glow.layers.set(LAYER.WORLD);
    this.glow.visible = false;
    this.group.add(this.glow);

    // ---------------------------------------------------------------- fuel store, maintenance corner, floodlight
    const M = materials;
    const props = [], metal = [];
    const fz = HALF + 2.6; // behind the slab, towards the treeline
    // pallet with drums of jet fuel, a lying spare and a hand pump
    props.push(box(2.3, 0.14, 1.25, 4.3, 0.07, fz, C(0x8a6a48)));
    for (const [x, z] of [[3.6, fz - 0.3], [4.25, fz - 0.3], [4.9, fz - 0.3], [3.6, fz + 0.32], [4.25, fz + 0.32]]) {
      metal.push(cyl([x, 0.14, z], [x, 1.02, z], 0.29, C(0x2f5a4a), 18));
      metal.push(cyl([x, 1.02, z], [x, 1.03, z], 0.27, C(0x26302c), 18));
      for (const y of [0.42, 0.73]) metal.push(cyl([x, y - 0.012, z], [x, y + 0.012, z], 0.296, C(0x24453a), 18));
    }
    metal.push(cyl([4.9, 1.03, fz + 0.32 - 0.62], [4.9, 1.5, fz + 0.32 - 0.62], 0.03, C(0x8a1e16), 8));
    metal.push(box(0.16, 0.1, 0.12, 4.9, 1.5, fz - 0.3, C(0x8a1e16)));
    metal.push(cyl([5.1, 1.45, fz - 0.3], [5.6, 1.1, fz - 0.3], 0.012, C(0x151515), 6));
    metal.push(cyl([6.2, 0.3, fz + 0.2], [6.2, 0.3, fz - 0.7], 0.3, C(0x2f5a4a), 18));
    // fuel tank on a skid frame with a hose reel
    metal.push(cyl([1.0, 0.75, fz + 0.15], [2.6, 0.75, fz + 0.15], 0.5, C(0xd8d6cf), 22));
    for (const x of [1.0, 2.6]) metal.push(cyl([x, 0.75, fz + 0.15], [x + (x < 2 ? -0.03 : 0.03), 0.75, fz + 0.15], 0.47, C(0xc8c5bd), 22));
    metal.push(box(1.9, 0.08, 0.12, 1.8, 0.2, fz - 0.2, C(0x3a3d3f)));
    metal.push(box(1.9, 0.08, 0.12, 1.8, 0.2, fz + 0.5, C(0x3a3d3f)));
    for (const x of [1.2, 2.4]) metal.push(box(0.08, 0.36, 0.7, x, 0.38, fz + 0.15, C(0x3a3d3f)));
    metal.push(cyl([1.8, 0.75, fz + 0.15 - 0.505], [1.8, 0.75, fz + 0.15 - 0.51], 0.18, ORANGE, 16));
    metal.push(cyl([2.85, 0.75, fz - 0.15], [2.85, 0.75, fz + 0.45], 0.25, C(0x9a2a1e), 18));
    metal.push(cyl([2.85, 0.75, fz - 0.17], [2.85, 0.75, fz + 0.47], 0.12, C(0x1a1a1a), 12));
    // maintenance corner: workbench, red tool cart, ground power unit, cones, extinguisher
    props.push(box(1.6, 0.06, 0.7, -3.8, 0.9, fz, C(0x7c5f42)));
    for (const [x, z] of [[-4.5, fz - 0.28], [-3.1, fz - 0.28], [-4.5, fz + 0.28], [-3.1, fz + 0.28]]) metal.push(box(0.05, 0.88, 0.05, x, 0.44, z, C(0x3c3f41)));
    props.push(box(1.5, 0.04, 0.6, -3.8, 0.3, fz, C(0x6c5038)));
    metal.push(box(0.5, 0.22, 0.24, -4.2, 1.04, fz - 0.05, C(0xa3271d), { round: 0.02 }));
    metal.push(box(0.3, 0.12, 0.2, -3.4, 0.99, fz + 0.1, C(0x2b5a8c), { round: 0.01 }));
    metal.push(box(0.62, 0.78, 0.42, -1.6, 0.47, fz - 0.4, C(0xa3271d), { round: 0.03 }));
    for (const y of [0.3, 0.52, 0.72]) metal.push(box(0.6, 0.012, 0.01, -1.6, y, fz - 0.62, C(0xc8c8c8)));
    for (const [x, z] of [[-1.85, fz - 0.55], [-1.35, fz - 0.55], [-1.85, fz - 0.25], [-1.35, fz - 0.25]]) metal.push(cyl([x, 0.05, z - 0.03], [x, 0.05, z + 0.03], 0.05, C(0x151515), 10));
    metal.push(box(1.1, 0.7, 0.75, -6.1, 0.55, fz - 0.1, C(0xd8b52a), { round: 0.04 }));
    metal.push(box(0.9, 0.22, 0.012, -6.1, 0.62, fz - 0.48, C(0x2a2a2a)));
    for (const [x, z] of [[-6.5, fz - 0.4], [-5.7, fz - 0.4], [-6.5, fz + 0.2], [-5.7, fz + 0.2]]) metal.push(cyl([x - 0.04, 0.12, z], [x + 0.04, 0.12, z], 0.12, C(0x151515), 12));
    metal.push(cyl([-6.65, 0.62, fz - 0.47], [-7.4, 0.05, -HALF + 7.0], 0.018, C(0x111111), 6));
    for (const [x, z] of [[-HALF - 0.9, -HALF - 0.9], [HALF + 0.9, -HALF - 0.9], [-HALF - 0.9, HALF + 0.9]]) {
      metal.push(box(0.36, 0.03, 0.36, x, 0.015, z, C(0xd8541e)));
      metal.push(cyl([x, 0.03, z], [x, 0.5, z], 0.13, ORANGE, 12, 0.025));
      metal.push(cyl([x, 0.22, z], [x, 0.3, z], 0.095, WHITE, 12, 0.08));
    }
    metal.push(box(0.4, 0.06, 0.28, HALF + 1.3, 0.75, HALF + 1.3, C(0x3c3f41)));
    metal.push(cyl([HALF + 1.3, 0, HALF + 1.3], [HALF + 1.3, 0.75, HALF + 1.3], 0.025, C(0x3c3f41), 6));
    metal.push(cyl([HALF + 1.3, 0.8, HALF + 1.3], [HALF + 1.3, 1.25, HALF + 1.3], 0.085, C(0xb4231c), 14));
    metal.push(cyl([HALF + 1.3, 1.25, HALF + 1.3], [HALF + 1.3, 1.33, HALF + 1.3], 0.03, C(0x151515), 8));
    // floodlight on a pole at the maintenance corner, aimed at the pad
    const fl = [-HALF - 1.4, HALF + 1.6];
    metal.push(cyl([fl[0], 0, fl[1]], [fl[0], 5.2, fl[1]], 0.07, C(0x6f7375), 10, 0.05));
    metal.push(box(0.5, 0.32, 0.22, fl[0] + 0.12, 5.25, fl[1] - 0.12, C(0x2a2c2e), { ry: Math.PI / 4, rx: 0.5, round: 0.03 }));
    mk(mergeGeometries(props), M.wood);
    mk(mergeGeometries(metal), new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55, metalness: 0.25 }));
    this.floodLens = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.24), new THREE.MeshBasicMaterial({ color: 0x222222 }));
    this.floodLens.position.set(fl[0] + 0.22, 5.18, fl[1] - 0.22);
    this.floodLens.rotation.set(-0.5, Math.PI * 0.75, 0, 'YXZ');
    this.floodLens.layers.set(LAYER.WORLD);
    this.group.add(this.floodLens);
    // keep the props solid
    collision.addBox({ x: HELIPAD.x + 4.3, y: this.level + 0.55, z: HELIPAD.z + fz, hx: 1.25, hy: 0.55, hz: 0.7 });
    collision.addBox({ x: HELIPAD.x + 1.8, y: this.level + 0.62, z: HELIPAD.z + fz + 0.15, hx: 1.3, hy: 0.62, hz: 0.6 });
    collision.addBox({ x: HELIPAD.x - 3.8, y: this.level + 0.47, z: HELIPAD.z + fz, hx: 0.85, hy: 0.47, hz: 0.4 });
    collision.addBox({ x: HELIPAD.x - 1.6, y: this.level + 0.45, z: HELIPAD.z + fz - 0.4, hx: 0.33, hy: 0.45, hz: 0.24 });
    collision.addBox({ x: HELIPAD.x - 6.1, y: this.level + 0.5, z: HELIPAD.z + fz - 0.1, hx: 0.6, hy: 0.5, hz: 0.42 });
    collision.addCylinder({ x: HELIPAD.x + fl[0], z: HELIPAD.z + fl[1], r: 0.12, y0: this.level - 1, y1: this.level + 5.4, surface: 'metal' });

    // a sign by the track from the camp
    const sign = buildSign(M, 'HELIPAD\nROTOR DANGER', 33);
    sign.position.set(HALF + 1.6, 0, -1.5);
    sign.rotation.y = Math.PI / 2;
    sign.traverse((o) => o.layers && o.layers.set(LAYER.WORLD));
    this.group.add(sign);
    collision.addCylinder({ x: HELIPAD.x + HALF + 1.6, z: HELIPAD.z - 1.5, r: 0.08, y0: this.level - 1, y1: this.level + 1.5, surface: 'wood' });

    // ---------------------------------------------------------------- windsock
    const ws = [-HALF - 1.2, -HALF - 1.2];
    this.sockBase = new THREE.Vector3(HELIPAD.x + ws[0], this.level + 4.6, HELIPAD.z + ws[1]);
    const pole = [cyl([ws[0], 0, ws[1]], [ws[0], 4.65, ws[1]], 0.05, C(0xe8e6e0), 10, 0.04)];
    for (const y of [0.6, 1.8, 3.0, 4.2]) pole.push(cyl([ws[0], y, ws[1]], [ws[0], y + 0.45, ws[1]], 0.052, C(0xc4301c), 10, 0.052));
    mk(mergeGeometries(pole), new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.5 }));
    collision.addCylinder({ x: HELIPAD.x + ws[0], z: HELIPAD.z + ws[1], r: 0.08, y0: this.level - 1, y1: this.level + 4.7, surface: 'metal' });
    this.sock = new THREE.Group();
    this.sock.position.set(ws[0], 4.6, ws[1]);
    this.sock.rotation.order = 'YXZ';
    const sg = [];
    const L = 1.7;
    for (let k = 0; k < 5; k++) {
      const z0 = (k / 5) * L, z1 = ((k + 1) / 5) * L;
      const c = new THREE.CylinderGeometry(lerp(0.24, 0.11, z1 / L), lerp(0.24, 0.11, z0 / L), z1 - z0, 16, 1, true);
      c.rotateX(Math.PI / 2);
      c.translate(0, 0, (z0 + z1) / 2);
      sg.push(part(c, k % 2 ? WHITE : C(0xe2561c)));
    }
    sg.push(part(new THREE.TorusGeometry(0.24, 0.012, 6, 20), C(0x9a9a9a)));
    const sockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    patchMaterial(sockMat, { wet: 0.8, key: 'windsock' });
    const sockMesh = new THREE.Mesh(mergeGeometries(sg), sockMat);
    sockMesh.castShadow = true;
    sockMesh.layers.set(LAYER.WORLD);
    this.sock.add(sockMesh);
    this.group.add(this.sock);
    this.sockYaw = 0; this.sockDroop = 1.1;
    this._wind = new THREE.Vector3();
  }

  update(dt, game) {
    if (dt <= 0) return;
    // dusk and night: perimeter lights and the floodlight come on
    const night = U.uNight.value;
    const on = smoothstep(0.08, 0.4, night);
    this.lampMat.emissiveIntensity = 0.15 + on * 1.6;
    this.glow.visible = on > 0.01;
    this.glowMat.opacity = on * 0.55;
    this.floodLens.material.color.setScalar(0.13 + on * 2.2);
    // windsock: the breeze plus the rotor wash of a helicopter close by
    const w = U.uWind.value;
    const gust = 0.8 + 0.25 * Math.sin(game.time * 1.3) + 0.12 * Math.sin(game.time * 3.7);
    const v = this._wind.set(w.x, 0, w.y).multiplyScalar(w.z * 9 * gust);
    const h = game.heli;
    if (h && h.downwash > 0.02) {
      const dx = this.sockBase.x - h.washPoint.x, dz = this.sockBase.z - h.washPoint.z;
      const d = Math.hypot(dx, dz);
      const k = h.downwash * 14 * (1 - smoothstep(5, 26, d)) / Math.max(d, 1);
      v.x += dx * k; v.z += dz * k;
    }
    const speed = Math.hypot(v.x, v.z);
    const yaw = Math.atan2(v.x, v.z);
    let dy = yaw - this.sockYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.sockYaw += dy * Math.min(1, dt * (0.8 + speed * 0.25));
    const droop = lerp(1.35, 0.06, smoothstep(0.5, 7.5, speed));
    this.sockDroop = damp(this.sockDroop, droop, 2, dt);
    const flutter = Math.sin(game.time * (6 + speed)) * 0.03 * clamp(speed / 4, 0, 1);
    this.sock.rotation.set(this.sockDroop + flutter, this.sockYaw + flutter * 0.6, 0);
  }
}
