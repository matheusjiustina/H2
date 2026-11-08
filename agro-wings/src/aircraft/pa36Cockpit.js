// Piper PA-36-300 Pawnee Brave cockpit (Prompt 02), built inside the cabin of
// pa36Model.js — the same reference frame as the fuselage (the aircraft on
// its three wheels; nothing is scaled to fit) — after the cockpit reference
// sent with the brief. Its regions, in the reference's order:
//   1–2  the raised black instrument pod on the padded band, its thick rim,
//        the recessed face with the five instruments, the low-pressure lamp
//        and the red emergency fuel pump switch (layout: pa36Panel.js); the
//        compass in its own case on the pod's right;
//   3    the black padded band across the cabin under the pod, with the
//        placards, from the windshield's base down to the lower panel;
//   4    the wide lower panel, wall to wall, stepped toward the pilot with
//        its top lip: magneto and master rockers, the clock; the engine
//        gauge, breakers, rockers, PUSH START, ammeter; the COM radio under it;
//   5    the hopper sight window in the middle: a grey frame and a tunnel to
//        the hopper's rear wall, the product level behind its glass;
//   6    the long stick: rubber boot, metal shaft, ribbed black grip;
//   7    the PIPER pedals on their hinge tubes with the brake cylinders;
//   8–10 cabin walls (light skins over the dark fuselage tubes, wiring), the
//        door on the right with its window frame, red handle and placard;
//        the floor plates; the left console with the power quadrant
//        (throttle, the blue propeller lever) and the white-knobbed lever on
//        the right wall; the seat;
//   11   padded window posts inside the windshield's frame; the headliner.
// Plus the AGROWINGS NAV unit (the game's GPS) on a bracket beside the pod's
// left, and the guidance light bar on the cowl.
// Static parts are merged per material; small hardware sits in a level of
// detail. Needles, the compass card, the hour meter, lamps, rockers, the
// start button and the sight-gauge level follow Aircraft.instruments()
// (panel.last) — only while the camera is in the cockpit or close to it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvas, canvasTexture } from '../core/textures.js';
import { clamp, lerp, rng } from '../core/math.js';
import { PA36_PANEL, PA36_ANG, PA36_ATLAS, C2F, toGph } from './pa36Panel.js';
import { text } from './r44Panel.js';
import { NAV_PAGES } from './agroNav.js';

const P = PA36_PANEL;
const D2R = Math.PI / 180;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

// ---------------------------------------------------------------- layout
// (Reference frame of the model: +x the left wing, +z forward, +y up.)
export const PA36_CK = {
  // Pod: the recessed face's centre, its tilt (top away from the pilot).
  pod: { c: [-0.012, 0.4825, -1.082], tilt: 12 * D2R },
  // Band: bottom edge (the lower panel's top), the band hangs from the
  // windshield's base.
  band: { y0: 0.31, z0: -1.103 },
  // Lower panel: bottom edge centre and tilt (top away from the pilot).
  lower: { c: [0, 0.19, -1.118], tilt: 7 * D2R },
  // Hopper's rear wall (firewall) behind the panel, the footwell under the
  // hopper and the floor.
  wall: -0.975, footZ: -0.62, footY: 0.02, floor: -0.42,
  seat: [0, -0.27, -1.75],
  stick: [0, -0.48, -1.3], stickLen: 0.63,
  pedals: [0.19, -0.36, -0.8],
  throttle: [0.395, -0.06, -1.36],
};
const K = PA36_CK;

// ---------------------------------------------------------------- helpers
function prep(g) {
  const n = g.index ? g.toNonIndexed() : g.clone();
  if (!n.attributes.normal) n.computeVertexNormals();
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  n.clearGroups();
  return n;
}
const mergeAll = (list) => mergeGeometries(list.map(prep));
const at = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz))); g.translate(x, y, z); return g; };
const rod = (a, b, r, seg = 10, r2 = r) => {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const g = new THREE.CylinderGeometry(r2, r, A.distanceTo(B), seg);
  g.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()), new THREE.Vector3(1, 1, 1)));
  return g;
};
const tubeG = (pts, r, seg = 24, rad = 8) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), seg, r, rad, false);
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function rrect(path, u, v, w, h, r, hole = false) {
  const x0 = u - w / 2, x1 = u + w / 2, y0 = v - h / 2, y1 = v + h / 2;
  const pts = [];
  const arc = (cx, cy, a0) => { for (let i = 0; i <= 5; i++) { const a = a0 + (i / 5) * (Math.PI / 2); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  arc(x1 - r, y0 + r, -Math.PI / 2); arc(x1 - r, y1 - r, 0); arc(x0 + r, y1 - r, Math.PI / 2); arc(x0 + r, y0 + r, Math.PI);
  if (hole) pts.reverse();
  path.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) path.lineTo(x, y);
  path.closePath();
  return path;
}
// Rounded-rectangle ring (outer w×h, inner wi×hi), extruded toward +z.
function ring(w, h, r, wi, hi, ri, depth, bevel = 0.003) {
  const s = rrect(new THREE.Shape(), 0, 0, w - 2 * bevel, h - 2 * bevel, Math.max(0.002, r - bevel));
  s.holes.push(rrect(new THREE.Path(), 0, 0, wi + 2 * bevel, hi + 2 * bevel, ri + bevel, true));
  return new THREE.ExtrudeGeometry(s, { depth: depth - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 }).translate(0, 0, bevel);
}
// Open-ended rectangular sleeve (four walls) from z = 0 back to −depth.
function sleeve(w, h, r, depth) {
  const sh = rrect(new THREE.Shape(), 0, 0, w, h, r);
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 4 });
  const grp = g.groups.find((x) => x.materialIndex === 1);
  const out = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) {
    const a = g.attributes[k];
    out.setAttribute(k, new THREE.BufferAttribute(a.array.slice(grp.start * a.itemSize, (grp.start + grp.count) * a.itemSize), a.itemSize));
  }
  return out.translate(0, 0, -depth);
}
// A skin through fn(u, v) (wound to face `toward`).
function skin(fn, nu, nv, toward) {
  const pos = [], idx = [], uv = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { pos.push(...fn(i / nu, j / nv)); uv.push(i / nu, j / nv); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const n = g.attributes.normal, m = Math.floor(n.count / 2), pp = g.attributes.position;
  const dx = toward[0] - pp.getX(m), dy = toward[1] - pp.getY(m), dz = toward[2] - pp.getZ(m);
  if (n.getX(m) * dx + n.getY(m) * dy + n.getZ(m) * dz < 0) { const ia = g.index.array; for (let i = 0; i < ia.length; i += 3) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; } g.computeVertexNormals(); }
  return g;
}
// A panel frame: local x → pilot's right (−X), y → up the tilted panel,
// z → toward the pilot.
function panelFrame(origin, tilt) {
  const PU = new THREE.Vector3(-1, 0, 0), PV = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt));
  const PW = new THREE.Vector3().crossVectors(PU, PV);
  const grp = new THREE.Group();
  grp.position.set(...origin);
  grp.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(PU, PV, PW));
  return grp;
}

// ---------------------------------------------------------------- textures
function wallTex() {
  const c = canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#b9b4a3'; g.fillRect(0, 0, 256, 256);
  const r = rng(36);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,250' : '80,72,58'},${0.03 + r() * 0.06})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 3); }
  for (let i = 0; i < 50; i++) { g.fillStyle = `rgba(70,62,48,${0.03 + r() * 0.05})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 12 + r() * 60); }
  return canvasTexture(c, { repeat: true });
}
function floorTex() {
  const c = canvas(512, 512), g = c.getContext('2d');
  g.fillStyle = '#8b8a84'; g.fillRect(0, 0, 512, 512);
  const r = rng(77);
  for (let i = 0; i < 7000; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '230,228,220' : '30,28,24'},${0.03 + r() * 0.07})`; g.fillRect(r() * 512, r() * 512, 1 + r() * 2, 1 + r() * 2); }
  // Scratches and scuffs.
  g.lineWidth = 1;
  for (let i = 0; i < 260; i++) {
    const x = r() * 512, y = r() * 512, a = r() * Math.PI, L = 8 + r() * 40;
    g.strokeStyle = `rgba(220,218,210,${0.08 + r() * 0.12})`;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
  }
  return canvasTexture(c, { repeat: true });
}
// Pedal tread: brushed plate with a diamond pattern and the raised PIPER.
function treadTex() {
  const c = canvas(160, 200), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 160, 200);
  gr.addColorStop(0, '#9fa3a6'); gr.addColorStop(1, '#5d6164');
  g.fillStyle = gr; g.fillRect(0, 0, 160, 200);
  g.fillStyle = 'rgba(30,32,34,0.55)';
  for (let y = 10; y < 130; y += 11) for (let x = 8 + ((y / 11) % 2) * 5.5; x < 154; x += 11) { g.beginPath(); g.moveTo(x, y - 3.5); g.lineTo(x + 3.5, y); g.lineTo(x, y + 3.5); g.lineTo(x - 3.5, y); g.closePath(); g.fill(); }
  g.fillStyle = '#2b2d30'; g.beginPath(); g.moveTo(80, 18); g.lineTo(96, 62); g.lineTo(64, 62); g.closePath(); g.fill();
  text(g, 'PIPER', 81, 157, 34, '#2a2c2e', true); text(g, 'PIPER', 80, 155, 34, '#c4c7c9', true);
  return canvasTexture(c);
}
function placardTex(lines, w = 256, h = 128, inv = false) {
  const c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = inv ? '#e4e2da' : '#101112'; g.fillRect(0, 0, w, h);
  g.strokeStyle = inv ? '#1a1a1a' : '#d8d8d0'; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8);
  lines.forEach((t, i) => text(g, t, w / 2, 20 + i * ((h - 34) / Math.max(1, lines.length - 1)), i === 0 ? 20 : 15, inv ? '#121212' : '#e8e8e0', i === 0));
  return canvasTexture(c);
}

export function buildPA36Cockpit(ctx) {
  const { panel, envMap = null, cab, harnessMat } = ctx;
  const { halfX, SILL_Y, RAIL_Y, ROOF, WS, BPOST, wsBase, roofEdge, roofRear, railX, sillX, rearRing, topY } = cab;
  const inset = 0.015;
  const wallX = (z, y) => halfX(z, y) - inset;
  const cockpit = new THREE.Group();
  cockpit.name = 'pa36-cockpit';
  const inside = [0, 0.3, -1.5];

  // ---------------- materials ----------------
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, ...o });
  const wt = wallTex(), ft = floorTex();
  const CM = {
    podFace: std(0xffffff, { map: panel.pod, roughness: 0.85, metalness: 0.05 }),
    hood: std(0x18191b, { roughness: 0.82, metalness: 0.05 }),
    band: std(0xffffff, { map: panel.band, roughness: 0.78, metalness: 0.02 }),
    lowFace: std(0xffffff, { map: panel.lower, roughness: 0.8, metalness: 0.08, emissive: 0xffffff, emissiveMap: panel.lower, emissiveIntensity: 0.04 }),
    lip: std(0x111213, { roughness: 0.6, metalness: 0.2 }),
    bezel: std(0x121315, { roughness: 0.5, metalness: 0.3 }),
    can: std(0x0b0c0d, { roughness: 0.9, side: THREE.DoubleSide }),
    dial: std(0xffffff, { map: panel.dials, roughness: 0.45, metalness: 0.05, emissive: 0xffffff, emissiveMap: panel.dials, emissiveIntensity: 0.24 }),
    needle: std(0xf6f6f0, { roughness: 0.4, emissive: 0xf6f6f0, emissiveIntensity: 0.4 }),
    needleR: std(0xd8371c, { roughness: 0.4, emissive: 0xd8371c, emissiveIntensity: 0.3 }),
    hub: std(0x0c0c0d, { roughness: 0.4, metalness: 0.4 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, envMap, envMapIntensity: 0.6, depthWrite: false }),
    hobbs: new THREE.MeshBasicMaterial({ map: panel.hobbs.tex, color: 0xcfcfcf }),
    radioLcd: new THREE.MeshBasicMaterial({ map: panel.radio.tex, color: 0xd8d8d8 }),
    screen: new THREE.MeshBasicMaterial({ map: panel.gps.tex, color: 0xe4e4e4 }),
    gpsBezel: std(0xffffff, { map: panel.bezel, roughness: 0.55, metalness: 0.15 }),
    gpsBody: std(0x1c1e21, { roughness: 0.55, metalness: 0.2 }),
    card: std(0xffffff, { map: panel.card, roughness: 0.5, emissive: 0xffffff, emissiveMap: panel.card, emissiveIntensity: 0.25 }),
    black: std(0x1a1b1d, { roughness: 0.5, metalness: 0.15 }),
    rubber: std(0x101010, { roughness: 0.95 }),
    grip: std(0x161718, { roughness: 0.88 }),
    chrome: std(0xd9dce0, { roughness: 0.2, metalness: 1, envMap, envMapIntensity: 0.9 }),
    steel: std(0x8d9296, { roughness: 0.42, metalness: 0.8 }),
    shaft: std(0x7d8186, { roughness: 0.45, metalness: 0.75 }),
    screw: std(0x8a8f95, { roughness: 0.35, metalness: 0.85 }),
    white: std(0xe9e9e4, { roughness: 0.42 }),
    breaker: std(0xd6d6cf, { roughness: 0.4 }),
    red: std(0xc8241b, { roughness: 0.38, metalness: 0.05 }),
    blue: std(0x2b8fc7, { roughness: 0.4, metalness: 0.1 }),
    frameGrey: std(0xa9adaa, { roughness: 0.5, metalness: 0.3 }),
    tunnel: std(0x8f8d80, { roughness: 0.7, metalness: 0.2, side: THREE.DoubleSide }),
    post: std(0x8e9291, { roughness: 0.55, metalness: 0.35 }),
    tubes: std(0x2b2e31, { roughness: 0.55, metalness: 0.45 }),
    wire: std(0x0d0d0e, { roughness: 0.7 }),
    wall: std(0xffffff, { map: wt, roughness: 0.88, metalness: 0.02 }),
    door: std(0xd8d2bd, { map: wt, roughness: 0.85 }),
    console: std(0xbcbcb4, { map: wt, roughness: 0.8, metalness: 0.05 }),
    hopper: std(0x9c875c, { roughness: 0.85, metalness: 0.05 }),
    hopperWin: std(0xffffff, { map: panel.hopperWall, roughness: 0.6 }),
    liquid: std(0xd8b532, { roughness: 0.3, metalness: 0, emissive: 0x3a2c06, emissiveIntensity: 0.4 }),
    floor: std(0xffffff, { map: ft, roughness: 0.85, metalness: 0.25 }),
    plate: std(0xc9c8c0, { map: ft, roughness: 0.7, metalness: 0.35 }),
    tread: std(0xd8d6d0, { map: treadTex(), roughness: 0.55, metalness: 0.15, envMapIntensity: 0.2 }),
    pedal: std(0x8f9396, { roughness: 0.4, metalness: 0.7 }),
    cylinder: std(0x161718, { roughness: 0.45, metalness: 0.4 }),
    seat: std(0x1d2a2c, { roughness: 0.85 }),
    harness: harnessMat ?? std(0x3a3f46, { roughness: 0.8 }),
    headliner: std(0xc9c4b2, { map: wt, roughness: 0.9 }),
    placard: std(0xffffff, { map: placardTex(['EMERGENCY EXIT', 'PULL HANDLE', 'PUSH DOOR OUT'], 256, 96), roughness: 0.6 }),
    dataPlate: std(0xffffff, { map: placardTex(['FUEL / WEIGHT', 'GAL  LBS   GAL  LBS', '10   60    50  300', '20  120    60  360', '30  180    70  420', '40  240    86  516'], 256, 192, true), roughness: 0.55, metalness: 0.3 }),
    quadScale: std(0xffffff, { map: placardTex(['T  H  R', '|', '|', '|', 'O P E N'], 64, 256), roughness: 0.5 }),
  };
  const CB = {}, CF = {};
  const addB = (mat, g, fine = false) => { ((fine ? CF : CB)[mat] ||= []).push(g); };

  // ======================================================== 1–2 the pod
  const PD = P.pod, O = PD.out, F = PD.face;
  const pod = panelFrame(K.pod.c, K.pod.tilt);
  cockpit.add(pod);
  const CP = {}, CPF = {};
  const addP = (mat, g, fine = false) => { ((fine ? CPF : CP)[mat] ||= []).push(g); };
  const needles = {};
  const glassParts = [];
  const cellUV = (g, cell) => {
    const uv = g.attributes.uv, cx = cell % PA36_ATLAS.cols, cy = Math.floor(cell / PA36_ATLAS.cols);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + uv.getX(i)) / PA36_ATLAS.cols, 1 - (cy + 1 - uv.getY(i)) / PA36_ATLAS.rows);
    return g;
  };
  const needleGeo = (len, w, tail = 0.22) => {
    const s = new THREE.Shape();
    s.moveTo(-w * 0.7, -len * tail); s.lineTo(w * 0.7, -len * tail); s.lineTo(w * 0.5, 0); s.lineTo(w * 0.2, len); s.lineTo(-w * 0.2, len); s.lineTo(-w * 0.5, 0); s.closePath();
    return new THREE.ShapeGeometry(s);
  };
  // A recessed instrument: face, can, bezel, glass, hub; its needles (3D).
  const instrument = (frame, id, d, put, list) => {
    put('dial', at(cellUV(new THREE.CircleGeometry(d.f, 56), d.cell), d.u, d.v, -0.009));
    put('can', at(new THREE.CylinderGeometry(d.f + 0.0025, d.f + 0.0025, 0.009, 40, 1, true), d.u, d.v, -0.0045, Math.PI / 2));
    const prof = [[d.r + 0.001, 0.0], [d.r, 0.0032], [d.r - 0.003, 0.0052], [d.f + 0.0018, 0.0046], [d.f + 0.0003, 0.0012], [d.f + 0.0003, -0.0015]];
    put('bezel', at(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 48), d.u, d.v, 0, Math.PI / 2));
    list.push(at(new THREE.CircleGeometry(d.f + 0.0008, 40), d.u, d.v, -0.0034));
    put('hub', at(new THREE.CircleGeometry(d.f * 0.09, 18), d.u, d.v, -0.0048));
    const mk = (len, w, layer = 0, mat = CM.needle) => { const m = new THREE.Mesh(needleGeo(len, w), mat); m.position.set(d.u, d.v, -0.0066 + layer * 0.0006); frame.add(m); return m; };
    const f = d.f;
    if (id === 'mp') needles.mp = [mk(f * 0.86, f * 0.075, 0), mk(f * 0.8, f * 0.07, 1)];
    else if (id === 'eng') needles.eng = [mk(f * 0.82, f * 0.075, 0), mk(f * 0.82, f * 0.075, 1)];
    else if (id === 'clock') needles.clock = [mk(f * 0.55, f * 0.1, 0), mk(f * 0.82, f * 0.07, 1), mk(f * 0.88, f * 0.025, 2, CM.needleR)];
    else needles[id] = [mk(f * 0.86, f * 0.075)];
  };
  {
    // Hood: the box behind the face, rounded, reaching forward under the
    // windshield (its top-front edge clears the glass).
    // (Its front stays behind the instruments' cans, which sit in the face.)
    const hd = O.d - F.recess - 0.014;
    const hood = new RoundedBoxGeometry(O.w, O.h, hd, 4, O.r);
    hood.translate(0, 0, -0.014 - hd / 2);
    addP('hood', hood);
    // The thick rim round the recessed face (its inner walls are the
    // recess's sides), reaching back to the hood.
    addP('hood', ring(O.w, O.h, O.r, F.w, F.h, 0.008, F.recess + 0.016).translate(0, 0, -0.016));
    // Face plate with a hole per instrument.
    const fs = new THREE.Shape([[-F.w / 2, -F.h / 2], [F.w / 2, -F.h / 2], [F.w / 2, F.h / 2], [-F.w / 2, F.h / 2]].map(([u, v]) => new THREE.Vector2(u, v)));
    for (const d of Object.values(PD.dials)) { const h = new THREE.Path(); h.absarc(d.u, d.v, d.f + 0.0025, 0, Math.PI * 2, true); fs.holes.push(h); }
    const face = new THREE.ShapeGeometry(fs, 20);
    const fuv = face.attributes.uv, fp = face.attributes.position;
    for (let i = 0; i < fuv.count; i++) fuv.setXY(i, (fp.getX(i) + F.w / 2) / F.w, (fp.getY(i) + F.h / 2) / F.h);
    face.translate(0, 0, 0.0004);
    addP('podFace', face);
    for (const [id, d] of Object.entries(PD.dials)) instrument(pod, id, d, addP, glassParts);
    const r = PD.dials.rpm;
    addP('hobbs', at(new THREE.PlaneGeometry(r.f * 0.62, r.f * 0.15), r.u, r.v - r.f * 0.285, -0.0085));
    // Face screws round the rim.
    for (let u = -0.27; u <= 0.271; u += 0.09) for (const v of [O.h / 2 - 0.011, -O.h / 2 + 0.011]) addP('screw', at(new THREE.CylinderGeometry(0.0028, 0.0028, 0.0016, 10), u, v, F.recess + 0.0008, Math.PI / 2), true);
  }
  // Low-pressure lamp (red dome) and the emergency fuel pump switch (big
  // red rocker).
  const lampMat = std(0x5a0c08, { roughness: 0.25, emissive: 0xff2210, emissiveIntensity: 0 });
  {
    const L = PD.lamp;
    const g = mergeAll([at(new THREE.CylinderGeometry(L.r, L.r, 0.005, 18), 0, 0, 0.0005, Math.PI / 2), at(new THREE.SphereGeometry(L.r, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0, 0.003, Math.PI / 2, 0, 0)]);
    const m = new THREE.Mesh(g, lampMat); m.position.set(L.u, L.v, 0); pod.add(m);
    addP('chrome', at(new THREE.TorusGeometry(L.r + 0.0014, 0.0013, 6, 22), L.u, L.v, 0.0012));
    const S = PD.pump;
    addP('black', at(new RoundedBoxGeometry(S.w + 0.006, S.h + 0.006, 0.004, 2, 0.002), S.u, S.v, 0.002));
    addP('red', at(new RoundedBoxGeometry(S.w, S.h, 0.012, 2, 0.003), S.u, S.v, 0.008, 0.18));
  }
  // The compass in its own case on the pod's right: a black barrel along the
  // line of sight, the card behind a window, the lubber line, its bracket.
  const card = new THREE.Group();
  {
    const C = P.compass;
    const cx = K.pod.c[0] - C.u, cy = K.pod.c[1] + 0.003, cz = K.pod.c[2] + 0.03;
    const cg = new THREE.Group();
    cg.position.set(cx, cy, cz);
    cockpit.add(cg);
    const barrel = new THREE.LatheGeometry([[0, -C.len / 2], [C.r * 0.92, -C.len / 2], [C.r, -C.len / 2 + 0.01], [C.r, C.len / 2 - 0.012], [C.r * 0.94, C.len / 2]].map(([r, y]) => new THREE.Vector2(r, y)), 32);
    barrel.rotateX(-Math.PI / 2); // axis along z, its open face toward the pilot
    cg.add(new THREE.Mesh(barrel, CM.hood));
    // Front bezel with the rounded window.
    const fs = new THREE.Shape(); fs.absarc(0, 0, C.r * 0.94, 0, Math.PI * 2, false);
    fs.holes.push(rrect(new THREE.Path(), 0, -0.002, C.r * 1.25, C.r * 0.62, 0.006, true));
    const front = new THREE.ShapeGeometry(fs, 24); front.rotateY(Math.PI); front.translate(0, 0, -C.len / 2 - 0.0005);
    cg.add(new THREE.Mesh(front, CM.black));
    // Card: a band round a vertical axis, turned by the heading.
    const cardG = new THREE.CylinderGeometry(C.r * 0.62, C.r * 0.62, C.r * 0.5, 64, 1, true);
    card.add(new THREE.Mesh(cardG, CM.card));
    card.position.set(0, -0.003, 0);
    cg.add(card);
    cg.add(new THREE.Mesh(at(new THREE.BoxGeometry(0.0016, C.r * 0.62, 0.001), 0, -0.002, -C.len / 2 + 0.006), CM.needleR));
    const glass = new THREE.Mesh(at(new THREE.PlaneGeometry(C.r * 1.25, C.r * 0.62), 0, -0.002, -C.len / 2 + 0.003, 0, Math.PI, 0), CM.glass);
    glass.renderOrder = 8; cg.add(glass);
    // Bracket to the pod's side and the correction card.
    addB('black', at(new THREE.BoxGeometry(0.02, 0.05, 0.05), cx + C.r + 0.004, cy - 0.01, cz + 0.005));
    addB('black', at(new THREE.BoxGeometry(0.06, 0.008, 0.04), cx, cy - C.r - 0.003, cz));
  }

  // ======================================================== 3 the band
  // From the windshield's base (just under the glass, all across) down to
  // the lower panel's top; padded (a slight bulge toward the pilot).
  const bandTop = (s) => { const p = wsBase(s); return [p[0] * 0.998, p[1] - 0.003, p[2] - 0.006]; }; // on the glass's base
  const bandBot = (s) => { const x = wallX(K.band.z0, K.band.y0) - 0.004; return [lerp(x, -x, s), K.band.y0, K.band.z0]; };
  const bandAt = (s, t) => {
    const a = bandBot(s), b = bandTop(s);
    const p = lerp3(a, b, t), bulge = 0.012 * Math.sin(Math.PI * t);
    return [p[0], p[1] - bulge * 0.35, p[2] - bulge];
  };
  {
    const g = skin(bandAt, 40, 10, [0, 0.4, -1.7]);
    // Texture: across the band by x, up by the slant height.
    const pp = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i);
      uv.setXY(i, 0.5 - x / P.band.w, Math.hypot(y - K.band.y0, z - K.band.z0) / P.band.h);
    }
    addB('band', g);
    // Its foot: a rounded black roll along the lower panel's top.
    const x = wallX(K.band.z0, K.band.y0) - 0.006;
    addB('lip', rod([x, K.band.y0 + 0.004, K.band.z0 - 0.006], [-x, K.band.y0 + 0.004, K.band.z0 - 0.006], 0.011, 14));
    // Rubber strip along the windshield's base.
    addB('rubber', tubeG(Array.from({ length: 21 }, (_, i) => { const p = bandTop(i / 20); return [p[0], p[1] + 0.008, p[2] + 0.01]; }), 0.006, 40, 6), true);
  }

  // ======================================================== 4 lower panel
  const LP = P.lower;
  const low = panelFrame(K.lower.c, K.lower.tilt);
  cockpit.add(low);
  const CL = {}, CLF = {};
  const addL = (mat, g, fine = false) => { ((fine ? CLF : CL)[mat] ||= []).push(g); };
  const lowGlass = [];
  {
    const hw = wallX(K.lower.c[2], K.lower.c[1] + 0.06) - 0.003;
    // Two plates either side of the sight window, holes for the dials.
    for (const [u0, u1] of [[-hw, LP.gap[0]], [LP.gap[1], hw]]) {
      const sh = new THREE.Shape([[u0, 0], [u1, 0], [u1, LP.h], [u0, LP.h]].map(([u, v]) => new THREE.Vector2(u, v)));
      for (const d of Object.values(LP.dials)) if (d.u > u0 && d.u < u1) { const h = new THREE.Path(); h.absarc(d.u, d.v, d.f + 0.0025, 0, Math.PI * 2, true); sh.holes.push(h); }
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.003, bevelEnabled: false, curveSegments: 20 });
      g.translate(0, 0, -0.003);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + LP.w / 2) / LP.w, uv.getY(i) / LP.h);
      addL('lowFace', g);
    }
    // Top lip right across (the black frame of the reference), the panel's
    // back box, the bottom flange.
    addL('lip', at(new RoundedBoxGeometry(2 * hw, 0.014, 0.034, 2, 0.005), 0, LP.h - 0.006, 0.012));
    addL('lip', at(new THREE.BoxGeometry(2 * hw, 0.006, 0.03), 0, 0.002, -0.012));
    // The panel's back, either side of the sight window's tunnel.
    for (const [u0, u1] of [[-hw + 0.01, LP.gap[0]], [LP.gap[1], hw - 0.01]]) addL('black', at(new THREE.BoxGeometry(u1 - u0, LP.h - 0.01, 0.004), (u0 + u1) / 2, LP.h / 2, -0.07));
    for (const d of Object.values(LP.dials)) instrument(low, Object.keys(LP.dials).find((k) => LP.dials[k] === d), d, addL, lowGlass);
    // Magneto rockers (white), the split master (red).
    for (const u of LP.mags.us) {
      addL('black', at(new RoundedBoxGeometry(0.022, 0.032, 0.004, 2, 0.002), u, LP.mags.v, 0.002));
      addL('white', at(new RoundedBoxGeometry(0.018, 0.027, 0.01, 2, 0.003), u, LP.mags.v, 0.007, -0.16));
    }
    for (const u of LP.master.us) {
      addL('black', at(new RoundedBoxGeometry(0.022, 0.032, 0.004, 2, 0.002), u, LP.master.v, 0.002));
      addL('red', at(new RoundedBoxGeometry(0.018, 0.027, 0.01, 2, 0.003), u, LP.master.v, 0.007, -0.16));
    }
    // Breakers (white caps on black collars), the one beside the rockers.
    for (const u of LP.breakers.us) {
      addL('black', at(new THREE.CylinderGeometry(0.0068, 0.0068, 0.004, 14), u, LP.breakers.v, 0.002, Math.PI / 2), true);
      addL('breaker', at(new THREE.CylinderGeometry(0.0052, 0.0056, 0.008, 14), u, LP.breakers.v, 0.007, Math.PI / 2), true);
    }
    addL('breaker', at(new THREE.CylinderGeometry(0.0052, 0.0056, 0.008, 14), LP.breaker30.u, LP.breaker30.v, 0.006, Math.PI / 2), true);
    addL('chrome', at(new THREE.CylinderGeometry(0.0018, 0.0026, 0.016, 8), LP.toggle.u, LP.toggle.v, 0.009, Math.PI / 2 - 0.5), true);
    addL('chrome', at(new THREE.CylinderGeometry(0.0052, 0.0052, 0.004, 14), LP.toggle.u, LP.toggle.v, 0.002, Math.PI / 2), true);
    // White electrical rockers.
    for (const u of LP.rockers.us) {
      addL('black', at(new RoundedBoxGeometry(0.02, 0.03, 0.004, 2, 0.002), u, LP.rockers.v, 0.002));
      addL('white', at(new RoundedBoxGeometry(0.016, 0.025, 0.009, 2, 0.003), u, LP.rockers.v, 0.006, 0.16));
    }
    addL('chrome', at(new THREE.TorusGeometry(LP.start.r * 1.25, 0.0014, 6, 20), LP.start.u, LP.start.v, 0.001));
  }
  // PUSH START (moves in while the starter turns), the rockers that follow
  // the engine (magnetos and master: on whenever the engine is not off).
  const startBtn = new THREE.Mesh(at(new THREE.CylinderGeometry(LP.start.r, LP.start.r * 1.08, 0.012, 18), 0, 0, 0, Math.PI / 2), std(0xc2201a, { roughness: 0.3, emissive: 0x400000, emissiveIntensity: 0.2 }));
  startBtn.position.set(LP.start.u, LP.start.v, 0.008);
  low.add(startBtn);
  // COM radio under the right plate.
  {
    const R = LP.radio, v = -R.h / 2 - 0.004;
    addL('black', at(new RoundedBoxGeometry(R.w, R.h, R.d, 2, 0.004), R.u, v, -R.d / 2 + 0.012));
    addL('gpsBody', at(new THREE.BoxGeometry(R.w - 0.008, R.h - 0.008, 0.002), R.u, v, 0.0125));
    addL('radioLcd', at(new THREE.PlaneGeometry(R.w * 0.52, R.h * 0.45), R.u - 0.012, v + 0.002, 0.0137));
    for (const du of [0.062, -0.066]) addL('black', at(new THREE.CylinderGeometry(0.008, 0.009, 0.012, 16), R.u + du, v, 0.019, Math.PI / 2));
    addL('black', at(new THREE.BoxGeometry(0.02, 0.006, 0.06), R.u - 0.05, R.h * 0 + 0.002, -0.02));
    addL('black', at(new THREE.BoxGeometry(0.02, 0.006, 0.06), R.u + 0.05, 0.002, -0.02));
  }

  // ======================================================== 5 sight window
  // Grey frame in the panel's centre opening, its tunnel to the hopper's
  // rear wall, the window there with the product level behind its glass;
  // the red bracket under it.
  const SW = P.sight;
  const level = new THREE.Group();
  {
    const top = LP.h - 0.016, h = SW.h, vC = top - h / 2, deep = 0.12;
    addL('frameGrey', at(ring(SW.w, h, 0.006, SW.win.w, SW.win.h, 0.004, 0.014), SW.u, vC, -0.004));
    addL('tunnel', at(sleeve(SW.win.w, SW.win.h, 0.004, deep), SW.u, vC, 0.0));
    addL('hopperWin', at(new THREE.PlaneGeometry(SW.win.w, SW.win.h), SW.u, vC, -deep + 0.001));
    addL('red', at(new RoundedBoxGeometry(SW.w + 0.004, 0.014, 0.03, 2, 0.003), SW.u, vC - h / 2 - 0.004, 0.0));
    // Product: a sheet behind the window raised to the hopper's level.
    const liq = new THREE.Mesh(new THREE.PlaneGeometry(SW.win.w * 0.98, 1), CM.liquid);
    liq.position.set(0, 0.5, 0);
    level.add(liq);
    level.position.set(SW.u, vC - SW.win.h / 2, -deep + 0.003);
    level.userData.h = SW.win.h;
    // (A unit sheet: scaled from the start — empty until the first update —
    // so it never stands a metre tall through the roof.)
    level.scale.y = 0.0001;
    low.add(level);
    lowGlass.push(at(new THREE.PlaneGeometry(SW.win.w, SW.win.h), SW.u, vC, -deep + 0.006));
  }

  // ---------------- behind and under the panel ----------------
  // The hopper's rear wall (tan) under the panel, the footwell under the
  // hopper reaching forward to the pedals, the floor.
  {
    const zw = K.wall, yb = K.lower.c[1];
    const xw = (y) => wallX(zw, y) - 0.004;
    addB('hopper', skin((u, v) => { const y = lerp(K.footY, yb + 0.012, v); return [lerp(xw(y), -xw(y), u), y, zw]; }, 6, 4, [0, 0, -1.5]));
    // Closing strip from the panel's bottom to the hopper wall.
    addB('black', skin((u, v) => { const x = wallX(K.lower.c[2], yb) - 0.006; return [lerp(x, -x, u), yb + 0.004, lerp(K.lower.c[2] + 0.004, zw, v)]; }, 4, 1, [0, -0.3, -1.5]));
    // Footwell roof (the hopper's bottom) and its front wall.
    addB('hopper', skin((u, v) => { const z = lerp(zw, K.footZ, v), y = lerp(K.footY, K.footY - 0.06, v), x = wallX(z, y) - 0.006; return [lerp(x, -x, u), y, z]; }, 6, 4, [0, -0.6, -1.0]));
    addB('hopper', skin((u, v) => { const y = lerp(K.floor, K.footY - 0.06, v), x = wallX(K.footZ, y) - 0.006; return [lerp(x, -x, u), y, K.footZ]; }, 6, 3, [0, -0.3, -1.2]));
    // Floor: the base, the two lighter plates under the pedals, the centre.
    const zf0 = K.footZ, zf1 = -1.93;
    addB('floor', skin((u, v) => { const z = lerp(zf0, zf1, v), x = wallX(z, K.floor + 0.02) - 0.002; return [lerp(x, -x, u), K.floor, z]; }, 4, 8, [0, 0.5, -1.4]));
    const fuv = CB.floor[CB.floor.length - 1].attributes.uv;
    for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * 1.8, fuv.getY(i) * 2.6);
    for (const sx of [1, -1]) addB('plate', at(new THREE.BoxGeometry(0.17, 0.004, 0.86), sx * 0.2, K.floor + 0.002, -1.12));
    addB('plate', at(new THREE.BoxGeometry(0.1, 0.004, 0.5), 0, K.floor + 0.002, -1.6));
    // Wiring hanging under the left of the panel down to the left wall.
    for (const [x0, dy, x1, z1] of [[0.25, -0.04, 0.4, -1.05], [0.18, -0.07, 0.38, -1.02], [0.1, -0.03, 0.36, -0.99], [-0.15, -0.05, -0.38, -1.02], [-0.22, -0.03, -0.4, -1.05]]) {
      addB('wire', tubeG([[x0, K.lower.c[1] - 0.005, K.lower.c[2] + 0.04], [x0 * 1.2, K.lower.c[1] + dy - 0.06, -1.05], [x1 * 0.95, K.lower.c[1] - 0.18, z1 + 0.02], [x1, -0.2, z1]], 0.0045, 20, 5), true);
    }
  }

  // ======================================================== 6 the stick
  // Pivot under the floor (rubber boot on the floor), metal shaft, the long
  // ribbed black grip and its cap (aircraft.js tilts it with the controls).
  const stick = new THREE.Group();
  stick.position.set(...K.stick);
  {
    const L = K.stickLen, fl = K.floor - K.stick[1];
    const boot = new THREE.LatheGeometry([[0.055, 0], [0.05, 0.015], [0.036, 0.04], [0.022, 0.075], [0.014, 0.1]].map(([r, y]) => new THREE.Vector2(r, y)), 20);
    stick.add(new THREE.Mesh(boot.translate(0, fl, 0), CM.rubber));
    const lean = 0.05; // the top leans forward
    const P0 = [0, fl - 0.02, 0], P1 = [0, (L - 0.24) + 0.02, lean * 0.62];
    stick.add(new THREE.Mesh(rod(P0, P1, 0.0115, 14), CM.shaft));
    // Grip: ribbed lower half, smooth upper half, the cap.
    const gp = [[0.012, 0]];
    for (let i = 0; i <= 16; i++) gp.push([0.0215 + (i % 2 ? 0.002 : 0), 0.008 + i * 0.0075]);
    gp.push([0.0225, 0.14], [0.0235, 0.18], [0.022, 0.215], [0.018, 0.232], [0.01, 0.24], [0, 0.242]);
    const grip = new THREE.LatheGeometry(gp.map(([r, y]) => new THREE.Vector2(r, y)), 22);
    const tilt = Math.atan2(lean, L);
    grip.rotateX(tilt);
    grip.translate(0, L - 0.24, lean * 0.6);
    stick.add(new THREE.Mesh(grip, CM.grip));
    const topP = [0, L - 0.24 + 0.24 * Math.cos(tilt), lean * 0.6 + 0.24 * Math.sin(tilt)];
    stick.add(new THREE.Mesh(at(new THREE.CylinderGeometry(0.0135, 0.0135, 0.008, 16), topP[0], topP[1] - 0.004, topP[2], tilt), CM.chrome));
    stick.add(new THREE.Mesh(at(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 12), topP[0], topP[1] + 0.001, topP[2] + 0.004, tilt - 0.3), CM.red));
  }
  cockpit.add(stick);

  // ======================================================== 7 pedals
  // PIPER treads on L arms from the hinge tube, the brake cylinder outboard
  // (aircraft.js slides them with the rudder).
  const pedals = [];
  for (const sx of [1, -1]) {
    const p = new THREE.Group();
    p.position.set(sx * K.pedals[0], K.pedals[1], K.pedals[2]);
    const lean = 0.62; // the tread's top forward: its face turned up to the pilot
    const n = [0, Math.sin(lean), -Math.cos(lean)]; // the face's normal
    p.add(new THREE.Mesh(at(new RoundedBoxGeometry(0.125, 0.165, 0.012, 2, 0.006), 0, 0.035, 0, lean), CM.pedal));
    p.add(new THREE.Mesh(at(new THREE.PlaneGeometry(0.117, 0.157), n[0] * 0.0066, 0.035 + n[1] * 0.0066, n[2] * 0.0066, lean, Math.PI, 0), CM.tread));
    // Hinge tube under the tread, the arms to it.
    p.add(new THREE.Mesh(at(new THREE.CylinderGeometry(0.022, 0.022, 0.13, 16), 0, -0.045, 0.03, 0, 0, Math.PI / 2), CM.pedal));
    for (const dx of [-0.035, 0.035]) p.add(new THREE.Mesh(rod([dx, -0.04, 0.03], [dx, 0.0, 0.01], 0.006, 8), CM.pedal));
    // Brake cylinder outboard, its label band, the line.
    const bx = sx * 0.075;
    p.add(new THREE.Mesh(rod([bx, -0.03, 0.05], [bx, 0.1, 0.12], 0.014, 12), CM.cylinder));
    p.add(new THREE.Mesh(rod([bx, 0.02, 0.0765], [bx, 0.05, 0.093], 0.0145, 12), CM.red));
    p.add(new THREE.Mesh(tubeG([[bx, 0.1, 0.12], [bx * 1.15, 0.11, 0.16], [bx * 1.3, 0.1, 0.18]], 0.003, 12, 5), CM.wire));
    cockpit.add(p);
    pedals.push(p);
    // Static: the pedal pivot posts on the floor, the support tube up to the
    // panel structure.
    addB('tubes', rod([sx * K.pedals[0], K.floor, K.pedals[2] + 0.06], [sx * K.pedals[0], K.pedals[1] - 0.05, K.pedals[2] + 0.04], 0.012, 8));
  }

  // ======================================================== 8–10 cabin
  // Walls: light skins from the hopper wall to the rear bulkhead, the dark
  // fuselage tubes over them, the door (right) with its trim panel, red
  // handle and the EMERGENCY placard.
  const zA = K.wall, zR = ROOF.zR + 0.02;
  const wall = (sx, z0, z1, y0, y1, mat, ins = inset) => addB(mat, skin((u, v) => { const z = lerp(z0, z1, u), y = lerp(y0, y1, v); return [sx * (halfX(z, y) - ins), y, z]; }, Math.max(2, Math.round((z0 - z1) * 8)), 6, inside));
  const DOOR = { z0: -1.0, z1: BPOST, y0: -0.22 };
  // Left wall (whole), right wall around the door, the door's trim panel.
  wall(1, zA, zR, K.floor, SILL_Y - 0.004, 'wall');
  wall(-1, zA, DOOR.z0, K.floor, SILL_Y - 0.004, 'wall');
  wall(-1, DOOR.z1, zR, K.floor, SILL_Y - 0.004, 'wall');
  wall(-1, DOOR.z0, DOOR.z1, K.floor, DOOR.y0, 'wall');
  wall(-1, DOOR.z0 - 0.005, DOOR.z1 + 0.005, DOOR.y0, SILL_Y - 0.004, 'door', inset + 0.003);
  // Sill caps: from the walls' top edge out to the skin under the glass;
  // the footwell's sides (under the hopper, forward to its front wall).
  for (const sx of [1, -1]) {
    addB('post', skin((u, v) => { const z = lerp(zA, zR, u), y = SILL_Y - 0.004 + 0.006 * v; return [sx * (halfX(z, SILL_Y) - lerp(inset + 0.004, 0.0, v)), y, z]; }, 12, 1, [0, 0.9, -1.5]));
    wall(sx, K.footZ, zA + 0.002, K.floor, K.footY + 0.004, 'wall');
  }
  // A-post panels above the sill ahead of the side glass (both sides).
  for (const sx of [1, -1]) {
    const c0 = wsBase(sx > 0 ? 0 : 1);
    addB('wall', skin((u, v) => { const z = lerp(c0[2] - 0.035, c0[2] - 0.075, u), y = lerp(SILL_Y - 0.01, c0[1] + 0.01, v); return [sx * (halfX(z, Math.min(y, 0.46)) - inset - 0.002), y, z]; }, 2, 2, inside));
  }
  // Fuselage tubes: upper and lower longerons and the diagonals, both sides.
  for (const sx of [1, -1]) {
    // (Each tube follows the wall's curve, just inside the skin.)
    const X = (z, y) => sx * (halfX(z, y) - inset - 0.009);
    const L = (z, y) => [X(z, y), y, z];
    const along = (a, b, r) => addB('tubes', tubeG(Array.from({ length: 9 }, (_, i) => L(lerp(a[0], b[0], i / 8), lerp(a[1], b[1], i / 8))), r, 24, 8));
    along([zA, SILL_Y - 0.03], [zR, SILL_Y - 0.03], 0.013);
    along([zA, K.floor + 0.05], [zR, K.floor + 0.05], 0.013);
    const nodes = sx > 0 ? [[zA + 0.0, SILL_Y - 0.03], [-1.32, K.floor + 0.05], [-1.6, SILL_Y - 0.03], [-1.92, K.floor + 0.05]] : [[DOOR.z0 + 0.01, SILL_Y - 0.03], [DOOR.z0 + 0.01, K.floor + 0.05], [DOOR.z1 - 0.01, K.floor + 0.05], [DOOR.z1 - 0.01, SILL_Y - 0.03]];
    for (let i = 0; i < nodes.length - 1; i++) along(nodes[i], nodes[i + 1], 0.011);
  }
  // Door frame inside (front and rear posts, the sill), the red handle,
  // the placard; the window frame above the sill is the exterior frame.
  {
    const x = (z, y) => -(halfX(z, y) - inset - 0.014);
    addB('frameGrey', rod([x(DOOR.z0, 0), DOOR.y0, DOOR.z0], [x(DOOR.z0, 0.4), SILL_Y, DOOR.z0], 0.012, 8));
    addB('frameGrey', rod([x(DOOR.z1, 0), DOOR.y0, DOOR.z1], [x(DOOR.z1, 0.4), SILL_Y, DOOR.z1], 0.012, 8));
    addB('frameGrey', rod([x(DOOR.z0, DOOR.y0), DOOR.y0, DOOR.z0], [x(DOOR.z1, DOOR.y0), DOOR.y0, DOOR.z1], 0.01, 8));
    // Red handle: a loop lever lying along the door on its round boss.
    const hx = x(-1.45, 0.16) + 0.006;
    addB('black', at(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 20), hx, 0.2, -1.38, 0, 0, Math.PI / 2));
    addB('red', tubeG([[hx + 0.006, 0.2, -1.38], [hx + 0.026, 0.205, -1.41], [hx + 0.03, 0.17, -1.5], [hx + 0.024, 0.12, -1.56], [hx + 0.01, 0.105, -1.555]], 0.0075, 24, 8));
    const ph = x(-1.12, 0.3) + 0.004;
    addB('placard', at(new THREE.PlaneGeometry(0.1, 0.038), ph, 0.3, -1.12, 0, Math.PI / 2, 0));
  }
  // Padded window posts inside the windshield's frame (A-posts) and the
  // B-posts; the sill pads.
  for (const sx of [1, -1]) {
    const c0 = wsBase(sx > 0 ? 0 : 1), c1 = roofEdge(sx > 0 ? 0 : 1);
    // (Over the windshield's frame tube, a little inboard and aft of it, so
    // the pilot sees the padded post, not the painted tube.)
    const pa = [c0[0] - sx * 0.012, c0[1] + 0.012, c0[2] - 0.022], pb = [c1[0] - sx * 0.012, c1[1] - 0.016, c1[2] - 0.02];
    addB('post', rod(pa, pb, 0.026, 14));
    addB('post', at(new THREE.SphereGeometry(0.026, 14, 10), ...pb));
    addB('post', rod([sx * (sillX(BPOST) - 0.022), SILL_Y, BPOST], [sx * (railX - 0.022), RAIL_Y - 0.015, BPOST], 0.014, 10));
    addB('post', rod([sx * (sillX(-1.02) - 0.02), SILL_Y + 0.006, -1.02], [sx * (sillX(-1.9) - 0.02), SILL_Y + 0.006, -1.9], 0.011, 10));
  }
  // Headliner under the roof (round the tinted panel) and the rear
  // bulkhead behind the seat.
  {
    // (Under the roof's crown, as the skin bulges, so no sliver of sky shows
    // between the lining and the roof; the bands overlap the tinted panel's
    // edge.)
    const R = (u, v) => { const p = lerp3(roofEdge(u), roofRear(u), v); const crown = 0.03 * Math.sin(Math.PI * v) * Math.max(0, 1 - (p[0] / railX) ** 2); return [p[0] * 0.998, p[1] + crown - 0.004, p[2]]; };
    const band = (u0, u1, v0, v1, nu = 6, nv = 2) => addB('headliner', skin((u, v) => R(lerp(u0, u1, u), lerp(v0, v1, v)), nu, nv, [0, 0.4, -1.6]));
    band(0, 1, 0, 0.12, 16, 2); band(0, 1, 0.5, 1, 16, 4); band(0, 0.26, 0.12, 0.5, 3, 4); band(0.74, 1, 0.12, 0.5, 3, 4);
    const rg = rearRing.slice(0, -1).filter(([, y]) => y > K.floor - 0.02).map(([x, y]) => new THREE.Vector2(x * 0.965, Math.max(y, K.floor) * 0.99));
    addB('headliner', new THREE.ShapeGeometry(new THREE.Shape(rg)).translate(0, 0, ROOF.zR + 0.035));
  }
  // Left console with the power quadrant: the box along the wall, the data
  // plate on it, the slot plate with its scale; throttle (black knob,
  // aircraft.js moves it) and the blue propeller lever (static: the
  // constant-speed prop is governed by the flight model).
  const T = K.throttle;
  {
    const zc = -1.42, len = 0.44, xi = 0.29;
    const xo = wallX(zc, -0.2) - 0.004;
    addB('console', at(new RoundedBoxGeometry(xo - xi, 0.36, len, 2, 0.012), (xo + xi) / 2, K.floor + 0.18, zc));
    addB('dataPlate', at(new THREE.PlaneGeometry(0.1, 0.075), (xo + xi) / 2 + 0.005, K.floor + 0.362, zc - 0.12, -Math.PI / 2, 0, Math.PI / 2));
    addB('frameGrey', at(new RoundedBoxGeometry(0.05, 0.026, 0.24, 2, 0.006), T[0], K.floor + 0.37, T[2] + 0.01));
    addB('black', at(new THREE.BoxGeometry(0.012, 0.004, 0.2), T[0], K.floor + 0.384, T[2] + 0.01));
    addB('quadScale', at(new THREE.PlaneGeometry(0.014, 0.19), T[0] - 0.019, K.floor + 0.3836, T[2] + 0.01, -Math.PI / 2, 0, Math.PI / 2));
  }
  const throttle = new THREE.Group();
  throttle.position.set(...T);
  throttle.add(new THREE.Mesh(rod([0, 0, 0], [0, 0.13, 0], 0.005, 8), CM.chrome));
  throttle.add(new THREE.Mesh(at(new THREE.SphereGeometry(0.02, 14, 10), 0, 0.145, 0), CM.black));
  cockpit.add(throttle);
  {
    const pr = new THREE.Group();
    pr.position.set(T[0] - 0.024, T[1], T[2] + 0.03);
    pr.rotation.x = 0.35;
    pr.add(new THREE.Mesh(rod([0, 0, 0], [0, 0.11, 0], 0.004, 8), CM.chrome));
    pr.add(new THREE.Mesh(at(new RoundedBoxGeometry(0.03, 0.022, 0.012, 2, 0.004), 0, 0.12, 0), CM.blue));
    cockpit.add(pr);
  }
  // The white-knobbed lever on the right wall (its function is not legible
  // on the reference: it stays where it is).
  {
    const b = [-(wallX(-1.22, 0.02) - 0.004), 0.02, -1.22], e = [b[0] + 0.085, 0.085, -1.25];
    addB('black', at(new THREE.BoxGeometry(0.012, 0.05, 0.05), b[0] + 0.006, b[1], b[2]));
    addB('steel', rod(b, e, 0.006, 8));
    addB('white', at(new THREE.SphereGeometry(0.016, 14, 10), ...e));
  }
  // Spray valve: no handle is identified on the reference (a placeholder
  // group keeps aircraft.js's valve animation harmless).
  const valve = new THREE.Group();
  // Seat and harness.
  {
    const s = K.seat;
    addB('seat', at(new RoundedBoxGeometry(0.46, 0.09, 0.44, 3, 0.035), s[0], s[1] - 0.03, s[2] + 0.12));
    addB('seat', at(new RoundedBoxGeometry(0.46, 0.66, 0.085, 3, 0.03), s[0], s[1] + 0.32, s[2] - 0.13, -0.12));
    for (const sx of [1, -1]) for (const dz of [-0.06, 0.3]) addB('tubes', rod([sx * 0.19, K.floor, s[2] + dz], [sx * 0.19, s[1] - 0.07, s[2] + dz], 0.012, 8));
    for (const sx of [1, -1]) {
      const top = [sx * 0.1, s[1] + 0.62, s[2] - 0.08], bot = [sx * 0.085, s[1] + 0.03, s[2] + 0.02];
      addB('harness', at(new THREE.BoxGeometry(0.045, Math.hypot(top[1] - bot[1], top[2] - bot[2]), 0.006), (top[0] + bot[0]) / 2, (top[1] + bot[1]) / 2, (top[2] + bot[2]) / 2 + 0.02, -0.02));
      addB('harness', at(new THREE.BoxGeometry(0.045, 0.006, 0.22), sx * 0.15, s[1] + 0.022, s[2] + 0.14));
    }
    addB('chrome', at(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 20), 0, s[1] + 0.03, s[2] + 0.26));
  }

  // ======================================================== GPS
  // The AGROWINGS NAV unit on a bracket beside the pod's left, on the band,
  // its face turned to the pilot's eye.
  const G = P.gps, pickables = [];
  const gpsG = new THREE.Group();
  {
    const cx = K.pod.c[0] + O.w / 2 + 0.008 + G.w / 2, cy = 0.452, cz = -1.055;
    gpsG.position.set(cx, cy, cz);
    const eye = new THREE.Vector3(0, 0.645, -1.72);
    gpsG.lookAt(eye);
    gpsG.rotateY(0); // (+z toward the eye)
    cockpit.add(gpsG);
    const CG = {};
    const addG = (mat, g) => (CG[mat] ||= []).push(g);
    addG('gpsBody', at(new RoundedBoxGeometry(G.w, G.h, G.d - 0.007, 3, 0.006), 0, 0, -0.007 - (G.d - 0.007) / 2));
    const S = G.screen;
    const fs = rrect(new THREE.Shape(), 0, 0, G.w - 0.004, G.h - 0.004, 0.006);
    fs.holes.push(rrect(new THREE.Path(), 0, 0.009, S.w + 0.004, S.h + 0.004, 0.002, true));
    const fp = new THREE.ShapeGeometry(fs, 6);
    const uv = fp.attributes.uv, pp = fp.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pp.getX(i) + G.w / 2) / G.w, (pp.getY(i) + G.h / 2) / G.h);
    addG('gpsBezel', fp.translate(0, 0, 0.0004));
    addG('can', sleeve(S.w + 0.004, S.h + 0.004, 0.002, 0.004).translate(0, 0.009, 0.0004));
    addG('screen', at(new THREE.PlaneGeometry(S.w, S.h), 0, 0.009, -0.0036));
    const gl = new THREE.Mesh(at(new THREE.PlaneGeometry(S.w, S.h), 0, 0.009, -0.002), CM.glass);
    gl.renderOrder = 8; gpsG.add(gl);
    const keyGeo = new RoundedBoxGeometry(0.02, 0.008, 0.005, 1, 0.0018);
    const keyMat = std(0x3a3e44, { roughness: 0.6, emissive: 0x52d8ff, emissiveIntensity: 0 });
    NAV_PAGES.forEach((pg, i) => {
      const k = new THREE.Mesh(keyGeo, keyMat.clone());
      k.position.set(G.keysU[i], G.keysV, 0.002);
      k.userData.gpsPage = pg;
      gpsG.add(k);
      pickables.push(k);
    });
    // Bracket: a foot on the band, the arm up to the housing's back.
    addG('black', at(new THREE.BoxGeometry(0.03, 0.012, 0.03), 0, -G.h / 2 - 0.004, -G.d / 2));
    addG('black', at(new THREE.BoxGeometry(0.014, 0.05, 0.014), 0, -G.h / 2 - 0.03, -G.d / 2 - 0.004));
    for (const [mat, list] of Object.entries(CG)) gpsG.add(new THREE.Mesh(mergeAll(list), CM[mat]));
  }

  // ======================================================== light bar
  // The guidance light bar on the cowl ahead of the windshield (the game's
  // own guidance; seen above the pod).
  const leds = [];
  {
    const lb = new THREE.Group();
    lb.position.set(0, topY(-0.62) + 0.026, -0.62);
    lb.add(new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.032, 0.045, 2, 0.007), CM.black));
    lb.add(new THREE.Mesh(at(new THREE.BoxGeometry(0.06, 0.02, 0.03), 0, -0.02, 0.0), CM.black));
    for (let i = -7; i <= 7; i++) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.015, 0.004), new THREE.MeshBasicMaterial({ color: 0x222222 }));
      led.position.set(-i * 0.016, 0.001, -0.0235);
      lb.add(led);
      leds.push(led);
    }
    cockpit.add(lb);
  }

  // ---------------- merge ----------------
  const build = (acc, target) => {
    for (const [k, list] of Object.entries(acc)) {
      const m = new THREE.Mesh(mergeAll(list), CM[k]);
      m.receiveShadow = true;
      target.add(m);
    }
  };
  build(CP, pod); build(CL, low); build(CB, cockpit);
  const fine = new THREE.Group(), finePod = new THREE.Group(), fineLow = new THREE.Group();
  build(CF, fine); build(CPF, finePod); build(CLF, fineLow);
  finePod.position.copy(pod.position); finePod.quaternion.copy(pod.quaternion);
  fineLow.position.copy(low.position); fineLow.quaternion.copy(low.quaternion);
  const lod = new THREE.LOD();
  lod.addLevel(new THREE.Group().add(fine, finePod, fineLow), 0);
  lod.addLevel(new THREE.Group(), 18);
  cockpit.add(lod);
  const g1 = new THREE.Mesh(mergeAll(glassParts), CM.glass); g1.renderOrder = 8; pod.add(g1);
  const g2 = new THREE.Mesh(mergeAll(lowGlass), CM.glass); g2.renderOrder = 8; low.add(g2);

  // ---------------- per frame ----------------
  const nd = { ias: 0, rpm: 0, mp: 29.9, ff: 0, oilT: 20, oilP: 0, cht: 86, fuel: 0, amp: 0, hdg: 0, lvl: 0 };
  const setN = (m, a) => { m.rotation.z = -a; };
  const HOURS = { dawn: [5.75, 7.5], morning: [8, 11], midday: [11.5, 14.5], golden: [16.5, 18], dusk: [18.2, 19.5] };
  let nearT = 0, shown = true;
  const update = (dt, fm, ac) => {
    const g = ac?.game;
    if (!g) return;
    const inCk = g.cameraMode === 'cockpit' && g.aircraft === ac;
    const dist = g.camera ? g.camera.position.distanceTo(ac.rPos) : 0;
    const near = !inCk && dist < 9;
    const show = inCk || dist < 30;
    if (show !== shown) { shown = show; for (const c of cockpit.children) if (c !== leds[0].parent) c.visible = show; }
    if (near) {
      nearT -= dt;
      if (nearT <= 0) { nearT = 0.3; panel.draw(ac.instruments()); }
    }
    if (!inCk && !near) return;
    const d = panel.last;
    if (!d) return;
    const A = PA36_ANG, k = 9;
    const run = d.engine === 'running', master = d.engine !== 'off';
    nd.ias = damp(nd.ias, d.ias, k, dt);
    nd.rpm = damp(nd.rpm, d.rpm, k, dt);
    nd.mp = damp(nd.mp, d.mp ?? 29.9, k, dt);
    nd.ff = damp(nd.ff, toGph(d.fuelFlow ?? 0), 4, dt);
    nd.oilT = damp(nd.oilT, d.oilT ?? 20, 2, dt);
    nd.oilP = damp(nd.oilP, d.oilP ?? 0, 4, dt);
    nd.cht = damp(nd.cht, C2F(d.cht ?? 30), 2, dt);
    nd.fuel = damp(nd.fuel, master ? (d.fuel ?? 0) / 3.785 : 0, 2, dt);
    // Ammeter: charging with the engine running, the battery's drain with
    // the master on and the engine stopped (the electrics are not
    // simulated beyond this).
    nd.amp = damp(nd.amp, run ? 6 : master ? -8 : 0, 3, dt);
    nd.hdg += ((((d.hdg - nd.hdg) % 360) + 540) % 360 - 180) * (1 - Math.exp(-1.6 * dt));
    nd.lvl = damp(nd.lvl, clamp((d.hopper ?? 0) / (d.hopperCap || 1), 0, 1), 3, dt);
    setN(needles.oilT[0], A.oilT(nd.oilT));
    setN(needles.asi[0], A.asi(nd.ias));
    setN(needles.rpm[0], A.rpm(nd.rpm));
    setN(needles.mp[0], A.mp(nd.mp)); setN(needles.mp[1], A.ff(nd.ff));
    setN(needles.fuel[0], A.fuel(nd.fuel));
    setN(needles.eng[0], A.oilP(nd.oilP)); setN(needles.eng[1], A.cht(nd.cht));
    setN(needles.amp[0], A.amp(nd.amp));
    // Clock: the game's time of day (its stage, and how far through it).
    const wc = g.weatherCycle;
    const span = HOURS[wc?.time] ?? HOURS.morning;
    const f = wc?.flow ? clamp(1 - (wc.stage ?? 0) / 360, 0, 1) : 0.35;
    const hr = lerp(span[0], span[1], f) + (wc?.flow ? 0 : (g.time ?? 0) / 3600);
    setN(needles.clock[0], A.hour(hr)); setN(needles.clock[1], A.min(hr * 60)); setN(needles.clock[2], A.min((g.time ?? 0) % 60));
    // (The card's figures run right to left, as on a wet compass.)
    card.rotation.y = ((nd.hdg - 180) * Math.PI) / 180;
    level.scale.y = Math.max(0.0001, nd.lvl * level.userData.h);
    lampMat.emissiveIntensity = panel.lit.press ? 2.2 : 0;
    startBtn.position.z = panel.lit.start ? 0.004 : 0.008;
    for (const p of pickables) p.material.emissiveIntensity = master && p.userData.gpsPage === panel.page ? 0.7 : 0;
  };
  const pick = (raycaster) => {
    const h = raycaster.intersectObjects(pickables, false)[0];
    if (!h) return null;
    panel.setPage(h.object.userData.gpsPage);
    return h.object.userData.gpsPage;
  };
  return { cockpit, stick, pedals, throttle, valve, leds, panelMesh: pod, update, pick, pickables, gps: gpsG, needles, card, level };
}
