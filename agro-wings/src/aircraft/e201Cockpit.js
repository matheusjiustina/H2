// Embraer EMB-201A Ipanema — the cockpit (Prompt 02), built inside the
// exterior's cabin (e201Model.js: CAB, shellP, boxX) in the same body frame,
// after the photograph of a yellow EMB-201 cabin; the EMB-202 video only
// for the pilot's perspective (panel / windshield / horizon proportions).
// Nothing is taken from the 202 / 203 cockpits: only the shared machinery
// (the dial-atlas technique, the game's GPS, the pilot figure).
//
// Parts: the grey instrument panel (its own outline: square on the left,
// the lower edge stepping down on the right; face plate with recessed
// instruments, the body behind it) under a dark matte padded lip curved in
// plan; the instruments (E201_PANEL) with bezels, cans, faces, glass and 3D
// needles; the digital hour meter; the GPS housing left of the centre with
// its page keys; the magneto key; the row of toggles and the breakers along
// the bottom; the dimmer; the control box at the bottom right; the low-fuel
// lamp; placards; the hopper's front wall under the panel with the round
// sight window and the product level; the cream lower walls and the metal
// floor; the stick (floor pivot, bent tube, black grip); the pedals on their
// hinge tube; the throttle quadrant on the left wall (throttle, propeller,
// mixture); the red hopper-dump handle on the floor; the brown seat; the
// grab handle on the right sill.
// Needles, the key, the lamps and the GPS keys follow Aircraft.instruments()
// (panel.last) — only while the camera is in the cockpit or close to it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvas, canvasTexture } from '../core/textures.js';
import { clamp, rng, lerp } from '../core/math.js';
import { E201_PANEL, E201_ANG, E201_ATLAS, E201_PLACARDS } from './e201Panel.js';
import { NAV_PAGES } from './agroNav.js';

const P = E201_PANEL;
const D2R = Math.PI / 180;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

// ---------------------------------------------------------------- anchors
// Body frame (+Z nose, +Y up, +X left).
export const E201_CK = {
  panel: { c: [0, 0.43, -0.66], tilt: 14 * D2R },
  glare: { y: 0.586, front: -0.5, back: -0.655, backSide: -0.625, half: 0.445, t: 0.03 },
  hopperWall: { z: -0.585, top: 0.25 },
  floor: -0.4,
  stick: [0, -0.37, -1.0],
  pedals: [0.15, -0.3, -0.7],
  throttle: [0.41, 0.17, -0.96],
  dump: [0.24, -0.4, -0.9],
  seat: { c: [0, -0.1, -1.47], back: -1.74 },
};
const K = E201_CK;

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
const rod = (a, b, r, seg = 8) => {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const g = new THREE.CylinderGeometry(r, r, A.distanceTo(B), seg, 1, true);
  g.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()), new THREE.Vector3(1, 1, 1)));
  return g;
};
const ball = (p, r, seg = 8) => new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2)).translate(...p);
function rrect(path, u, v, w, h, r, hole = false) {
  const x0 = u - w / 2, x1 = u + w / 2, y0 = v - h / 2, y1 = v + h / 2;
  const pts = [];
  const arcP = (cx, cy, a0) => { for (let i = 0; i <= 5; i++) { const a = a0 + (i / 5) * (Math.PI / 2); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  arcP(x1 - r, y0 + r, -Math.PI / 2); arcP(x1 - r, y1 - r, 0); arcP(x0 + r, y1 - r, Math.PI / 2); arcP(x0 + r, y0 + r, Math.PI);
  if (hole) pts.reverse();
  path.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) path.lineTo(x, y);
  path.closePath();
  return path;
}
// A panel frame: local x → pilot's right, y → up the tilted face, z →
// toward the pilot.
function panelFrame(origin, tilt) {
  const PU = new THREE.Vector3(-1, 0, 0), PV = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt));
  const PW = new THREE.Vector3().crossVectors(PU, PV);
  const grp = new THREE.Group();
  grp.position.set(...origin);
  grp.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(PU, PV, PW));
  return grp;
}
// Grid surface fn(u, v) (two-sided material expected).
function skin(fn, nu, nv) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { pos.push(...fn(i / nu, j / nv)); uv.push(i / nu, j / nv); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- textures
function plateTex(seed, base, n = 1800, specks = ['255,255,250', '20,18,14']) {
  const c = canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  const r = rng(seed);
  for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${r() < 0.5 ? specks[0] : specks[1]},${0.025 + r() * 0.05})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2); }
  return canvasTexture(c, { repeat: true });
}
// Lower wall skin: light-grey painted aluminium, a frame rib every tile
// (u along the fuselage), rivet rows, darker toward the floor.
function wallTex() {
  const c = canvas(256, 256), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#7f8381'); gr.addColorStop(1, '#4c504f'); // painted grey aluminium, darker low
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const r = rng(7);
  for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,250' : '20,18,14'},${0.025 + r() * 0.05})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2); }
  g.fillStyle = 'rgba(40,42,44,0.55)'; g.fillRect(0, 0, 10, 256); // frame rib
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(10, 0, 2, 256);
  g.fillStyle = 'rgba(30,30,30,0.35)';
  for (let y = 12; y < 256; y += 18) { g.beginPath(); g.arc(18, y, 1.6, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = 'rgba(30,30,30,0.3)'; g.fillRect(0, 128, 256, 2); // stringer
  return canvasTexture(c, { repeat: true });
}
// Leather with stitched pleats (seat).
function leatherTex() {
  const c = canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#6a4a31'; g.fillRect(0, 0, 256, 256);
  const r = rng(23);
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,220,180' : '30,15,5'},${0.03 + r() * 0.06})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2); }
  for (const x of [64, 128, 192]) {
    const gr = g.createLinearGradient(x - 10, 0, x + 10, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(25,12,4,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - 10, 0, 20, 256);
    g.strokeStyle = 'rgba(210,180,140,0.5)'; g.setLineDash([4, 4]); g.lineWidth = 1.5;
    for (const dx of [-6, 6]) { g.beginPath(); g.moveTo(x + dx, 0); g.lineTo(x + dx, 256); g.stroke(); }
  }
  return canvasTexture(c);
}

export function buildE201Cockpit(ctx) {
  const { panel, envMap = null, M, C, CAB, boxX, shellP, TW } = ctx;
  const cockpit = new THREE.Group();
  cockpit.name = 'e201-cockpit';
  const eye = new THREE.Vector3(...C.eye);

  // ---------------- materials ----------------
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, ...o });
  const CM = {
    panel: std(0xffffff, { map: plateTex(41, '#aeb2b0', 1600), roughness: 0.62, metalness: 0.18 }), // light-grey painted face
    back: std(0x55595c, { roughness: 0.8, metalness: 0.2 }),
    glare: std(0x161718, { roughness: 0.92, metalness: 0.02 }), // matte padded lip
    bezel: std(0x16181a, { roughness: 0.45, metalness: 0.35 }),
    can: std(0x0b0c0d, { roughness: 0.9, side: THREE.DoubleSide }),
    dial: std(0xffffff, { map: panel.dials, roughness: 0.45, metalness: 0.05, emissive: 0xffffff, emissiveMap: panel.dials, emissiveIntensity: 0.22 }),
    needle: std(0xf6f6f0, { roughness: 0.4, emissive: 0xf6f6f0, emissiveIntensity: 0.4 }),
    hub: std(0x0c0c0d, { roughness: 0.4, metalness: 0.4 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, envMap, envMapIntensity: 0.6, depthWrite: false }),
    hobbs: new THREE.MeshBasicMaterial({ map: panel.hobbs.tex, color: 0xd8d8d8 }),
    screen: new THREE.MeshBasicMaterial({ map: panel.gps.tex, color: 0xe4e4e4 }),
    gpsBezel: std(0xffffff, { map: panel.bezel, roughness: 0.55, metalness: 0.15 }),
    gpsBody: std(0x1c1e21, { roughness: 0.55, metalness: 0.2 }),
    placard: std(0xffffff, { map: panel.placards, roughness: 0.6 }),
    hopper: std(0xffffff, { map: panel.hopper, roughness: 0.7, metalness: 0.02, side: THREE.DoubleSide }),
    wall: std(0xffffff, { map: wallTex(), roughness: 0.72, metalness: 0.05, side: THREE.DoubleSide }), // light lower walls, frame ribs
    floor: std(0xffffff, { map: plateTex(8, '#77797a', 3200), roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide }),
    black: std(0x18191b, { roughness: 0.5, metalness: 0.15 }),
    rubber: std(0x111111, { roughness: 0.95 }),
    grip: std(0x141415, { roughness: 0.85 }),
    chrome: std(0xd9dce0, { roughness: 0.2, metalness: 1, envMap, envMapIntensity: 0.9 }),
    steel: std(0x9a9fa3, { roughness: 0.4, metalness: 0.8 }),
    tube: std(0xc9ccce, { roughness: 0.38, metalness: 0.6 }), // the stick's tube
    screw: std(0x8a8f95, { roughness: 0.35, metalness: 0.85 }),
    red: std(0xc8241b, { roughness: 0.38, metalness: 0.05 }),
    orange: std(0xe0661c, { roughness: 0.45 }),
    blue: std(0x2b5fb0, { roughness: 0.4, metalness: 0.1 }),
    white: std(0xe9e9e4, { roughness: 0.42 }),
    seat: std(0xffffff, { map: leatherTex(), roughness: 0.68, metalness: 0.02 }),
    liner: std(0x4b4f52, { roughness: 0.9, metalness: 0.05, side: THREE.DoubleSide }), // headliner under the roof
    hose: std(0x7a5a3a, { roughness: 0.85 }), // the brown scat ducts
    seal: std(0x101112, { roughness: 0.95 }), // window rubber
  };
  const lampMat = std(0x3a2a08, { roughness: 0.3, emissive: 0xffa21a, emissiveIntensity: 0 });
  const sprayLamp = std(0x0f2a14, { roughness: 0.3, emissive: 0x39ff5a, emissiveIntensity: 0 });
  const CB = {}, CF = {};
  const addB = (mat, g, fine = false) => { ((fine ? CF : CB)[mat] ||= []).push(g); };
  const needles = {};
  const placardUV = (g, row) => {
    const uv = g.attributes.uv, n = E201_PLACARDS.rows.length;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (row + 1 - uv.getY(i)) / n);
    return g;
  };
  const cellUV = (g, cell) => {
    const uv = g.attributes.uv, cx = cell % E201_ATLAS.cols, cy = Math.floor(cell / E201_ATLAS.cols);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + uv.getX(i)) / E201_ATLAS.cols, 1 - (cy + 1 - uv.getY(i)) / E201_ATLAS.rows);
    return g;
  };
  const needleGeo = (len, w, tail = 0.22) => {
    const s = new THREE.Shape();
    s.moveTo(-w * 0.7, -len * tail); s.lineTo(w * 0.7, -len * tail); s.lineTo(w * 0.5, 0); s.lineTo(w * 0.2, len); s.lineTo(-w * 0.2, len); s.lineTo(-w * 0.5, 0); s.closePath();
    return new THREE.ShapeGeometry(s);
  };
  const glassBy = [];
  const frames = [];
  const frameBuild = (frame) => { const acc = {}, fine = {}; frames.push([frame, acc, fine]); return (mat, g, f = false) => ((f ? fine : acc)[mat] ||= []).push(g); };

  // ======================================================== 1 the panel
  const pf = panelFrame(K.panel.c, K.panel.tilt);
  cockpit.add(pf);
  const put = frameBuild(pf);
  const outline = () => {
    // The top edge rises toward the centre (the lip above follows it).
    const pts = [];
    const [tl, ...rest] = P.outline;
    pts.push(tl);
    for (const p of rest) pts.push(p);
    const top = [];
    for (let i = 0; i <= 16; i++) { const u = lerp(0.44, -0.44, i / 16); top.push([u, 0.16 + P.topArc * (1 - (u / 0.44) ** 2)]); }
    return pts.slice(0, -1).concat(top);
  };
  {
    const out = outline().map(([u, v]) => new THREE.Vector2(u, v));
    // Face plate with the holes: instruments, the hour meter, the GPS.
    const fs = new THREE.Shape(out);
    for (const d of Object.values(P.dials)) { const h = new THREE.Path(); h.absarc(d.u, d.v, d.f + 0.0025, 0, Math.PI * 2, true); fs.holes.push(h); }
    fs.holes.push(rrect(new THREE.Path(), P.hobbs.u, P.hobbs.v, P.hobbs.w + 0.006, P.hobbs.h + 0.006, 0.003, true));
    put('panel', new THREE.ExtrudeGeometry(fs, { depth: 0.004, bevelEnabled: false, curveSegments: 18 }).translate(0, 0, -0.004));
    // Body behind the face (reaching forward under the lip to the hopper).
    put('back', new THREE.ExtrudeGeometry(new THREE.Shape(out), { depth: P.depth, bevelEnabled: false }).translate(0, 0, -0.013 - P.depth));
    // Screws round the edge.
    for (const [u, v] of [[-0.425, 0.145], [-0.425, -0.185], [0.425, 0.145], [0.425, -0.225], [0.06, -0.185], [-0.2, 0.168], [0.2, 0.168], [-0.2, -0.188], [0.32, -0.225]]) put('screw', at(new THREE.CylinderGeometry(0.0032, 0.0032, 0.0018, 8), u, v, 0.0009, Math.PI / 2), true);
  }
  // Instruments: dial face, can, bezel, glass, hub and the needles.
  const instrument = (frame, putF, id, d) => {
    putF('dial', at(cellUV(new THREE.CircleGeometry(d.f, 48), d.cell), d.u, d.v, -0.009));
    putF('can', at(new THREE.CylinderGeometry(d.f + 0.0025, d.f + 0.0025, 0.009, 36, 1, true), d.u, d.v, -0.0045, Math.PI / 2));
    const prof = [[d.r + 0.001, 0.0], [d.r, 0.0034], [d.r - 0.003, 0.0055], [d.f + 0.0018, 0.0048], [d.f + 0.0003, 0.0012], [d.f + 0.0003, -0.0015]];
    putF('bezel', at(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 40), d.u, d.v, 0, Math.PI / 2));
    putF('hub', at(new THREE.CircleGeometry(d.f * 0.09, 16), d.u, d.v, -0.0048));
    glassBy.push([frame, at(new THREE.CircleGeometry(d.f + 0.0008, 36), d.u, d.v, -0.0034)]);
    const mk = (len, w, layer = 0) => { const m = new THREE.Mesh(needleGeo(len, w), CM.needle); m.position.set(d.u, d.v, -0.0066 + layer * 0.0006); frame.add(m); return m; };
    const f = d.f;
    if (id === 'alt') needles.alt = [mk(f * 0.55, f * 0.11, 0), mk(f * 0.86, f * 0.07, 1)];
    else if (id === 'oil') needles.oil = [mk(f * 0.82, f * 0.08, 0), mk(f * 0.82, f * 0.08, 1)];
    else needles[id] = [mk(f * 0.86, f * 0.075)];
  };
  for (const [id, d] of Object.entries(P.dials)) instrument(pf, put, id, d);
  // Digital hour meter (blue unit).
  {
    const H = P.hobbs;
    put('black', new RoundedBoxGeometry(H.w + 0.006, H.h + 0.006, 0.02, 1, 0.003).translate(H.u, H.v, -0.008));
    pf.add(new THREE.Mesh(new THREE.PlaneGeometry(H.w, H.h).translate(H.u, H.v, 0.0025), CM.hobbs));
  }
  // Magneto key with its placard.
  const magKey = new THREE.Group();
  {
    const Kp = P.key;
    put('chrome', at(new THREE.CylinderGeometry(0.014, 0.016, 0.006, 20), Kp.u, Kp.v, 0.003, Math.PI / 2));
    magKey.position.set(Kp.u, Kp.v, 0.006);
    magKey.add(new THREE.Mesh(new RoundedBoxGeometry(0.012, 0.03, 0.004, 1, 0.0015).translate(0, 0.008, 0.002), CM.white));
    pf.add(magKey);
    put('placard', placardUV(at(new THREE.PlaneGeometry(0.05, 0.012), Kp.u, Kp.v - 0.026, 0.0006), 6));
  }
  // Black placard right of the altimeter (operating limitations), AVGAS
  // plate beside the fuel gauge, the limits plate under the tachometer.
  put('placard', placardUV(at(new THREE.PlaneGeometry(P.label.w, P.label.h), P.label.u, P.label.v, 0.0006), 2));
  put('placard', placardUV(at(new THREE.PlaneGeometry(0.06, 0.012), 0.025, 0.09, 0.0006), 1));
  put('placard', placardUV(at(new THREE.PlaneGeometry(0.11, 0.013), 0.2, -0.118, 0.0006), 7));
  // Eyeball air vents (right end of the panel): chrome ring, dark ball
  // with its nozzle.
  for (const [u, v] of P.vents) {
    put('chrome', at(new THREE.TorusGeometry(0.019, 0.0035, 6, 20), u, v, 0.002));
    put('black', ball([u, v, 0.004], 0.016, 14));
    put('black', at(new THREE.CylinderGeometry(0.006, 0.007, 0.012, 10), u + 0.002, v + 0.001, 0.018, Math.PI / 2 - 0.25, 0.2));
  }
  // Low-fuel lamp (amber) with its bezel.
  put('chrome', at(new THREE.TorusGeometry(0.0085, 0.0022, 6, 18), P.lamp.u, P.lamp.v, 0.002));
  pf.add(new THREE.Mesh(new THREE.SphereGeometry(0.0075, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).translate(P.lamp.u, P.lamp.v, 0.0015), lampMat));
  // Switch row: toggles with their nuts, the label strip above; breakers
  // under it; the dimmer with its orange ring.
  {
    const S = P.switches;
    put('placard', placardUV(at(new THREE.PlaneGeometry(S.u1 - S.u0 + 0.03, 0.012), (S.u0 + S.u1) / 2, S.v + 0.02, 0.0006), 0));
    for (let i = 0; i < S.n; i++) {
      const u = lerp(S.u0, S.u1, i / (S.n - 1));
      put('chrome', at(new THREE.CylinderGeometry(0.0065, 0.0065, 0.004, 12), u, S.v, 0.002, Math.PI / 2), true);
      put('chrome', rod([u, S.v, 0.002], [u, S.v + 0.011, 0.016], 0.0022, 6), true);
      put('chrome', ball([u, S.v + 0.0115, 0.0165], 0.003, 6), true);
    }
    const Bk = P.breakers;
    for (let i = 0; i < Bk.n; i++) {
      const u = lerp(Bk.u0, Bk.u1, i / (Bk.n - 1));
      put('black', at(new THREE.CylinderGeometry(0.0055, 0.0055, 0.008, 10), u, Bk.v, 0.004, Math.PI / 2), true);
      put('white', at(new THREE.CylinderGeometry(0.0042, 0.0042, 0.0012, 10), u, Bk.v, 0.0085, Math.PI / 2), true);
    }
    const Dm = P.dimmer;
    put('orange', at(new THREE.TorusGeometry(0.016, 0.003, 6, 20), Dm.u, Dm.v, 0.002));
    put('black', at(new THREE.CylinderGeometry(0.011, 0.012, 0.014, 16), Dm.u, Dm.v, 0.008, Math.PI / 2));
  }
  // Control box at the bottom right (three toggles, the spray lamp).
  {
    const Bx = P.box;
    put('black', new RoundedBoxGeometry(Bx.w, Bx.h, 0.03, 2, 0.004).translate(Bx.u, Bx.v, 0.012));
    put('placard', placardUV(at(new THREE.PlaneGeometry(Bx.w * 0.9, 0.011), Bx.u, Bx.v + Bx.h * 0.3, 0.0275), 5));
    for (let i = 0; i < 3; i++) {
      const u = Bx.u - 0.035 + i * 0.035;
      put('chrome', at(new THREE.CylinderGeometry(0.0055, 0.0055, 0.004, 12), u, Bx.v - 0.008, 0.029, Math.PI / 2), true);
      put('chrome', rod([u, Bx.v - 0.008, 0.029], [u, Bx.v + 0.002, 0.04], 0.002, 6), true);
    }
    pf.add(new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 6).translate(Bx.u + 0.058, Bx.v - 0.008, 0.028), sprayLamp));
  }
  // GPS housing (the game's AGROWINGS NAV) bolted on the face, left of
  // the centre where the photograph's moving map sits; its page keys in
  // the coloured row under the screen.
  const G = P.gps, pickables = [];
  const gpsG = new THREE.Group();
  {
    gpsG.position.set(G.u, G.v, 0);
    pf.add(gpsG);
    const CG = {};
    const addG = (mat, g) => (CG[mat] ||= []).push(g);
    const GD = 0.05; // the box stands proud of the face
    addG('gpsBody', new RoundedBoxGeometry(G.w, G.h, GD, 2, 0.006).translate(0, 0, GD / 2 - 0.006));
    const S = G.screen;
    const fs = rrect(new THREE.Shape(), 0, 0, G.w - 0.006, G.h - 0.006, 0.006);
    fs.holes.push(rrect(new THREE.Path(), 0, 0.016, S.w + 0.004, S.h + 0.004, 0.002, true));
    const fp = new THREE.ShapeGeometry(fs, 6);
    const uv = fp.attributes.uv, pp = fp.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pp.getX(i) + G.w / 2) / G.w, (pp.getY(i) + G.h / 2) / G.h);
    addG('gpsBezel', fp.translate(0, 0, GD + 0.0015));
    addG('screen', new THREE.PlaneGeometry(S.w, S.h).translate(0, 0.016, GD - 0.005)); // in front of the box's face (GD - 0.006)
    const keyGeo = new RoundedBoxGeometry(0.026, 0.011, 0.006, 1, 0.002);
    const keyCols = [0xc8261b, 0xe0a41c, 0xe0a41c, 0x27a043];
    NAV_PAGES.forEach((pg, i) => {
      const k = new THREE.Mesh(keyGeo, std(keyCols[i % keyCols.length], { roughness: 0.5, emissive: 0x52d8ff, emissiveIntensity: 0 }));
      k.position.set(G.keysU[i], G.keysV, GD + 0.003);
      k.userData.gpsPage = pg;
      gpsG.add(k);
      pickables.push(k);
    });
    for (const [mat, list] of Object.entries(CG)) gpsG.add(new THREE.Mesh(mergeAll(list), CM[mat]));
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.h).translate(0, 0.016, GD - 0.003), CM.glass);
    gl.renderOrder = 8; gpsG.add(gl);
    for (const [u, v] of [[-G.w / 2 + 0.008, G.h / 2 - 0.008], [G.w / 2 - 0.008, G.h / 2 - 0.008], [-G.w / 2 + 0.008, -G.h / 2 + 0.008], [G.w / 2 - 0.008, -G.h / 2 + 0.008]]) put('screw', at(new THREE.CylinderGeometry(0.003, 0.003, 0.002, 8), G.u + u, G.v + v, GD + 0.0025, Math.PI / 2), true);
  }

  // ======================================================== 2 the lip
  // Dark matte padded lip over the panel, curved in plan (deepest at the
  // centre), its front against the windshield's base.
  {
    const Gl = K.glare;
    const pts = [];
    const N = 24;
    for (let i = 0; i <= N; i++) { const x = lerp(Gl.half, -Gl.half, i / N); pts.push(new THREE.Vector2(x, -Gl.front)); }
    for (let i = 0; i <= N; i++) { const x = lerp(-Gl.half, Gl.half, i / N); const zb = lerp(Gl.backSide, Gl.back, 1 - (x / Gl.half) ** 2); pts.push(new THREE.Vector2(x, -zb)); }
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: Gl.t - 0.016, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3, curveSegments: 4 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, Gl.y + 0.008, 0);
    addB('glare', g);
    // Its stitched lower edge strip along the back.
    const edge = []; for (let i = 0; i <= N; i++) { const x = lerp(-Gl.half + 0.02, Gl.half - 0.02, i / N); edge.push(new THREE.Vector3(x, Gl.y + 0.002, lerp(Gl.backSide, Gl.back, 1 - (x / Gl.half) ** 2) + 0.004)); }
    addB('black', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), 24, 0.004, 5, false));
    // Side fillers between the panel's ends and the walls.
    for (const sx of [1, -1]) {
      const x0 = sx * 0.44, x1 = sx * (boxX(-0.62, 0.3) - 0.012);
      addB('back', skin((u, v) => [lerp(x0, x1, u), lerp(0.22, Gl.y, v), -0.64 + 0.06 * v], 2, 2));
    }
  }

  // ======================================================== 3 hopper wall, floor, walls
  {
    const Hw = K.hopperWall;
    // Hopper front wall: from the floor to under the panel, the sight
    // window on the pilot's right of the centre (texture).
    const w = boxX(Hw.z, -0.1) - 0.015;
    addB('hopper', at(new THREE.PlaneGeometry(2 * w, Hw.top - K.floor), 0, (Hw.top + K.floor) / 2, Hw.z, 0, Math.PI, 0));
    // Floor plates.
    const z0 = Hw.z - 0.01, z1 = CAB.win - 0.06;
    addB('floor', skin((u, v) => { const z = lerp(z0, z1, v), x = boxX(z, K.floor + 0.01) - 0.016; return [lerp(x, -x, u), K.floor, z]; }, 2, 10));
    for (const z of [-0.95, -1.4]) addB('screw', at(new THREE.BoxGeometry(0.8, 0.004, 0.012), 0, K.floor + 0.002, z), true);
    // Lower walls (cream), following the fuselage's sides inside.
    for (const sx of [1, -1]) {
      const wg = skin((u, v) => { const z = lerp(Hw.z, z1, u), y = lerp(K.floor + 0.02, CAB.sill - 0.012, v); return [sx * (boxX(z, y) - 0.014), y, z]; }, 12, 5);
      const wuv = wg.attributes.uv; for (let i = 0; i < wuv.count; i++) wuv.setX(i, wuv.getX(i) * (Hw.z - z1) / 0.32);
      addB('wall', wg);
      // Sill trim strip.
      addB('black', rod([sx * (boxX(-0.6, 0.58) - 0.02), CAB.sill - 0.01, -0.6], [sx * (boxX(-1.9, 0.58) - 0.02), CAB.sill - 0.01, -1.9], 0.008, 6));
    }
    // Grab handle on the right sill (a bent tube in the cabin's colour).
    const xr = -(boxX(-1.0, 0.55) - 0.035);
    const gh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[xr - 0.005, CAB.sill - 0.025, -0.82], [xr + 0.012, CAB.sill + 0.035, -0.86], [xr + 0.012, CAB.sill + 0.035, -1.02], [xr - 0.005, CAB.sill - 0.025, -1.06]].map((p) => new THREE.Vector3(...p))), 16, 0.008, 6, false), M.frame);
    cockpit.add(gh);
  }

  // ======================================================== 3b roof, window hardware, ducts
  {
    // Headliner: the roof's underside a dark grey lining set just inside the
    // shell (the outside paint is not seen from the seat), a padded bow
    // along the windshield's top edge, the frame rails' rubber seals.
    const inset = (p, k = 0.014) => [p[0] * (1 - k / 0.46), p[1] - k, p[2]];
    addB('liner', skin((u, v) => inset(shellP(lerp(CAB.roofF - 0.02, CAB.roofR + 0.02, v), lerp(TW - 0.01, 1 - TW + 0.01, u))), 14, 8));
    const bow = []; for (let i = 0; i <= 16; i++) bow.push(new THREE.Vector3(...inset(shellP(CAB.roofF - 0.03, lerp(TW - 0.005, 1 - TW + 0.005, i / 16)), 0.03)));
    addB('black', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bow), 24, 0.022, 8, false));
    for (const t of [TW, 1 - TW]) {
      const rail = []; for (let i = 0; i <= 10; i++) rail.push(new THREE.Vector3(...inset(shellP(lerp(CAB.roofF - 0.03, CAB.roofR, i / 10), t), 0.026)));
      addB('seal', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), 12, 0.009, 6, false));
    }
    // Magnetic compass on the bow, at the centre of the windshield's top.
    const cp = inset(shellP(CAB.roofF - 0.03, 0.5), 0.07);
    addB('black', at(new RoundedBoxGeometry(0.07, 0.05, 0.06, 2, 0.01), cp[0], cp[1], cp[2] + 0.01));
    addB('black', rod([0, cp[1] + 0.02, cp[2]], [0, cp[1] + 0.065, cp[2] - 0.01], 0.008, 6));
    addB('white', at(new THREE.CircleGeometry(0.019, 16), 0, cp[1], cp[2] - 0.0205, 0, Math.PI, 0));
    // Side windows: hinge blocks on the A-post, a latch lever at the B-post
    // (the window opens out from the rear edge).
    for (const sx of [1, -1]) {
      for (const z of [-0.9, -1.15]) {
        const h = inset(shellP(z, sx > 0 ? TW - 0.02 : 1 - TW + 0.02), 0.02);
        addB('black', at(new THREE.BoxGeometry(0.012, 0.02, 0.035), h[0], h[1], h[2]), true);
      }
      const l = inset(shellP(CAB.bPost + 0.03, sx > 0 ? 0.12 : 0.88), 0.03);
      addB('black', at(new THREE.BoxGeometry(0.014, 0.035, 0.022), l[0], l[1], l[2]));
      addB('orange', rod([l[0], l[1] + 0.02, l[2] + 0.012], [l[0] - sx * 0.02, l[1] + 0.085, l[2] + 0.03], 0.0065, 6));
    }
    // Ventilation: brown ribbed scat ducts from behind the panel's ends down
    // the walls to the floor vents (as on the photograph).
    for (const sx of [1, -1]) {
      const pts = [[sx * 0.39, 0.24, -0.6], [sx * 0.41, 0.1, -0.66], [sx * 0.405, -0.12, -0.7], [sx * 0.37, -0.33, -0.76]].map((p) => new THREE.Vector3(...p));
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 36, 0.035, 10, false);
      // Ribs: the radius breathing along the tube.
      const pp = g.attributes.position, c = new THREE.CatmullRomCurve3(pts), q = new THREE.Vector3();
      for (let i = 0; i < pp.count; i++) {
        const seg = Math.floor(i / 11), u = seg / 36;
        c.getPoint(u, q);
        const k = 1 + 0.12 * Math.cos(seg * Math.PI);
        pp.setXYZ(i, q.x + (pp.getX(i) - q.x) * k, q.y + (pp.getY(i) - q.y) * k, q.z + (pp.getZ(i) - q.z) * k);
      }
      g.computeVertexNormals();
      addB('hose', g);
    }
  }

  // ======================================================== 4 stick
  const stick = new THREE.Group();
  stick.position.set(...K.stick);
  {
    const parts = [rod([0, 0, 0], [0, 0.33, 0.02], 0.014, 10), rod([0, 0.33, 0.02], [0, 0.46, 0.09], 0.014, 10), ball([0, 0.33, 0.02], 0.014, 10)];
    stick.add(new THREE.Mesh(mergeAll(parts), CM.tube));
    stick.add(new THREE.Mesh(mergeAll([at(new THREE.CylinderGeometry(0.02, 0.023, 0.12, 12), 0, 0.51, 0.115, 0.5)]), CM.grip));
    stick.add(new THREE.Mesh(mergeAll([at(new THREE.BoxGeometry(0.012, 0.016, 0.012), 0, 0.565, 0.16, 0.5)]), CM.red));
    stick.add(new THREE.Mesh(mergeAll([at(new THREE.CylinderGeometry(0.035, 0.06, 0.06, 12, 1, true), 0, 0.02, 0)]), CM.rubber));
  }
  cockpit.add(stick);
  addB('steel', at(new THREE.BoxGeometry(0.12, 0.03, 0.12), K.stick[0], K.stick[1] - 0.015, K.stick[2]));

  // ======================================================== 5 pedals
  const pedals = [];
  for (const sx of [1, -1]) {
    const p = new THREE.Group();
    p.position.set(sx * K.pedals[0], K.pedals[1], K.pedals[2]);
    p.add(new THREE.Mesh(mergeAll([new RoundedBoxGeometry(0.085, 0.13, 0.016, 1, 0.004).rotateX(-0.35), rod([0, -0.06, 0.02], [0, -0.1, 0.06], 0.008, 6)]), CM.steel));
    p.add(new THREE.Mesh(mergeAll([at(new THREE.BoxGeometry(0.07, 0.008, 0.06), 0, 0.03, -0.012, -0.35 - Math.PI / 2)]), CM.black));
    cockpit.add(p);
    pedals.push(p);
  }
  addB('steel', rod([0.3, K.pedals[1] - 0.1, K.pedals[2] + 0.07], [-0.3, K.pedals[1] - 0.1, K.pedals[2] + 0.07], 0.012, 8));

  // ======================================================== 6 left quadrant, dump handle
  const THR = K.throttle;
  const throttle = new THREE.Group();
  throttle.position.set(...THR);
  throttle.add(new THREE.Mesh(mergeAll([rod([0, 0, 0], [0, 0.11, 0.02], 0.006, 6)]), CM.steel));
  throttle.add(new THREE.Mesh(mergeAll([ball([0, 0.12, 0.022], 0.018, 12)]), CM.grip));
  cockpit.add(throttle);
  {
    // Quadrant plate on the left wall, the propeller and mixture levers.
    const x = boxX(THR[2], 0.2) - 0.03;
    addB('wall', at(new RoundedBoxGeometry(0.02, 0.12, 0.28, 1, 0.005), x, THR[1] + 0.02, THR[2] + 0.02));
    for (const [dz, mat, r] of [[0.07, 'blue', 0.013], [0.13, 'red', 0.012]]) {
      addB('steel', rod([THR[0] + 0.0, THR[1], THR[2] + dz], [THR[0], THR[1] + 0.1, THR[2] + dz + 0.01], 0.005, 6));
      addB(mat, ball([THR[0], THR[1] + 0.105, THR[2] + dz + 0.012], r, 10));
    }
    addB('placard', placardUV(at(new THREE.PlaneGeometry(0.15, 0.016), x - 0.0115, THR[1] + 0.075, THR[2] + 0.04, 0, Math.PI / 2 * -1 + Math.PI, 0), 3));
  }
  const valve = new THREE.Group();
  valve.position.set(...K.dump);
  valve.add(new THREE.Mesh(mergeAll([rod([0, 0, 0], [0, 0.16, 0.03], 0.008, 6)]), CM.steel));
  valve.add(new THREE.Mesh(mergeAll([at(new RoundedBoxGeometry(0.03, 0.1, 0.022, 1, 0.006), 0, 0.2, 0.04, -0.3)]), CM.red));
  cockpit.add(valve);
  addB('placard', placardUV(at(new THREE.PlaneGeometry(0.06, 0.02), K.dump[0] + 0.04, K.floor + 0.003, K.dump[2] - 0.05, -Math.PI / 2, 0, Math.PI), 4));

  // ======================================================== 7 seat
  {
    const S = K.seat;
    addB('seat', new RoundedBoxGeometry(0.46, 0.1, 0.44, 3, 0.04).translate(S.c[0], S.c[1], S.c[2]));
    addB('seat', at(new RoundedBoxGeometry(0.46, 0.64, 0.1, 3, 0.04), S.c[0], S.c[1] + 0.34, S.back, -0.2));
    for (const sx of [1, -1]) {
      addB('steel', rod([sx * 0.2, K.floor, S.c[2] + 0.15], [sx * 0.2, S.c[1] - 0.05, S.c[2] + 0.15], 0.012, 6));
      addB('steel', rod([sx * 0.2, K.floor, S.c[2] - 0.18], [sx * 0.2, S.c[1] - 0.05, S.c[2] - 0.18], 0.012, 6));
    }
  }

  // ---------------- merge ----------------
  const build = (acc, target) => {
    for (const [k, list] of Object.entries(acc)) {
      const m = new THREE.Mesh(mergeAll(list), CM[k]);
      m.receiveShadow = true;
      target.add(m);
    }
  };
  build(CB, cockpit);
  const fineAll = new THREE.Group();
  const fine = new THREE.Group(); build(CF, fine); fineAll.add(fine);
  for (const [frame, acc, fineAcc] of frames) {
    build(acc, frame);
    const ff = new THREE.Group(); build(fineAcc, ff);
    ff.position.copy(frame.position); ff.quaternion.copy(frame.quaternion);
    fineAll.add(ff);
  }
  const lod = new THREE.LOD();
  lod.addLevel(fineAll, 0);
  lod.addLevel(new THREE.Group(), 18);
  cockpit.add(lod);
  { const g = new THREE.Mesh(mergeAll(glassBy.map(([, gg]) => gg)), CM.glass); g.renderOrder = 8; pf.add(g); }

  // ---------------- per frame ----------------
  const nd = { ias: 0, alt: 0, rpm: 0, mp: 29.6, oilP: 0, oilT: 20, cht: 30, fuel: 0, key: -0.9 };
  const setN = (m, a) => { m.rotation.z = -a; };
  let nearT = 0, shown = true;
  const update = (dt, fm, ac) => {
    const g = ac?.game;
    if (!g) return;
    const inCk = g.cameraMode === 'cockpit' && g.aircraft === ac;
    const dist = g.camera ? g.camera.position.distanceTo(ac.rPos) : 0;
    const near = !inCk && dist < 9;
    const show = inCk || dist < 30;
    if (show !== shown) { shown = show; for (const c of cockpit.children) c.visible = show; }
    if (near) { nearT -= dt; if (nearT <= 0) { nearT = 0.3; panel.draw(ac.instruments()); } }
    if (!inCk && !near) return;
    const d = panel.last;
    if (!d) return;
    const A = E201_ANG, k = 9;
    const master = d.engine !== 'off';
    nd.ias = damp(nd.ias, d.ias, k, dt);
    nd.alt = damp(nd.alt, d.altFt, k, dt);
    nd.rpm = damp(nd.rpm, d.rpm, k, dt);
    nd.mp = damp(nd.mp, d.mp ?? 29.6, k, dt);
    nd.oilP = damp(nd.oilP, d.oilP ?? 0, 4, dt);
    nd.oilT = damp(nd.oilT, d.oilT ?? 20, 2, dt);
    nd.cht = damp(nd.cht, d.cht ?? 30, 2, dt);
    nd.fuel = damp(nd.fuel, master ? (d.fuel ?? 0) : 0, 2, dt);
    setN(needles.asi[0], A.asi(nd.ias));
    setN(needles.alt[0], A.alt1000(nd.alt)); setN(needles.alt[1], A.alt100(nd.alt));
    setN(needles.rpm[0], A.rpm(nd.rpm));
    setN(needles.mp[0], A.mp(nd.mp));
    setN(needles.oil[0], A.oilP(nd.oilP)); setN(needles.oil[1], A.oilT(nd.oilT));
    setN(needles.cht[0], A.cht(nd.cht));
    setN(needles.fuel[0], A.fuel(nd.fuel));
    // Magneto key: OFF with the engine stopped, BOTH running, START cranking.
    nd.key = damp(nd.key, d.engine === 'cranking' ? 1.4 : master ? 0.7 : -0.9, 10, dt);
    magKey.rotation.z = -nd.key;
    lampMat.emissiveIntensity = panel.lit.fuel ? 2.2 : 0;
    sprayLamp.emissiveIntensity = panel.lit.spray ? 1.8 : 0;
    for (const p of pickables) p.material.emissiveIntensity = master && p.userData.gpsPage === panel.page ? 0.6 : 0;
  };
  const pick = (raycaster) => {
    const h = raycaster.intersectObjects(pickables, false)[0];
    if (!h) return null;
    panel.setPage(h.object.userData.gpsPage);
    return h.object.userData.gpsPage;
  };
  pf.updateMatrix();
  const panelRef = new THREE.Vector3(0, 0, 0).applyMatrix4(pf.matrix);
  return { cockpit, stick, pedals, throttle, valve, leds: [], THR, panelMesh: pf, update, pick, pickables, gps: gpsG, needles, refs: { panel: panelRef } };
}
