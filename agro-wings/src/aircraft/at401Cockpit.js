// Air Tractor AT-401B — the cockpit, built inside the exterior's cabin
// (at401Model.js: CAB, shellP, boxX, crestY) in the same body frame, after
// the photographs of real AT-401B cabins (black panel arched to the
// windshield's base with the raised housing of three dials on top and the
// magnetic compass on it; yellow cabin walls and floor over the welded tube
// frame; red mesh seat; the flap lever on the floor at the left; the
// throttle quadrant on the left wall; black stick grip with the red button).
// Nothing is taken from the reference package's virtual cockpit (its MDL is
// not decoded) or from another aircraft's cockpit: only the shared
// machinery (the dial-atlas technique, the game's GPS, the pilot figure).
//
// Parts: the panel — its top edge is the cabin's own section (inset), so
// the face follows the windshield's arch, with the hump on top; the face
// plate with the instrument holes, the body behind it, the coaming from
// the panel's top to the windshield's base; the instruments (AT401_PANEL)
// with bezels, cans, faces, glass and 3D needles; the turn coordinator's
// airplane and ball; the magnetic compass; the annunciator push-buttons;
// the hour meter; the GPS housing with its page keys; the magneto key,
// warning lamps, the guarded boost-pump switch; the switch and breaker
// panels along the bottom; placards. The cabin: the forward bulkhead
// (hopper's rear wall) under the panel, the floor, the yellow walls with
// the tube frame, the left quadrant (throttle, propeller, mixture), the
// right console with the spray valve lever, the flap lever, the stick, the
// pedals on their hinge tube, the red seat on its frame.
// Needles, the compass card, the key, the lamps, the flap lever and the GPS
// keys follow Aircraft.instruments() (panel.last) — only while the camera
// is in the cockpit or close to it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvas, canvasTexture } from '../core/textures.js';
import { clamp, rng, lerp } from '../core/math.js';
import { AT401_PANEL, AT401_ANG, AT401_ATLAS, AT401_PLACARDS, AT401_ANNUN } from './at401Panel.js';
import { NAV_PAGES } from './agroNav.js';

const P = AT401_PANEL;
const D2R = Math.PI / 180;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

// ---------------------------------------------------------------- anchors
// Body frame (+Z nose, +Y up, +X left).
export const AT401_CK = {
  panel: { c: [0, 0.86, -0.8], tilt: 0, archZ: -0.66, archInset: 0.035 },
  bulkhead: -0.585,
  floor: 0.0,
  stick: [0, 0.02, -1.16],
  pedals: [0.17, 0.14, -0.7],
  throttle: [0.42, 0.75, -1.02],
  valve: [-0.4, 0.66, -1.04],
  flap: [0.36, 0.06, -1.3],
  seat: { c: [0, 0.45, -1.62], back: -1.86 },
  rearWall: -2.02,
};
const K = AT401_CK;

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
// Yellow-painted cabin skins: worn paint, rivet rows; the floor with the
// row of black rubber-capped lightening holes of the photographs.
function yellowTex(seed, holes) {
  const c = canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#d8ae1e'; g.fillRect(0, 0, 256, 256);
  const r = rng(seed);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,245,200' : '70,50,10'},${0.03 + r() * 0.06})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2); }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(90,70,30,${0.05 + r() * 0.1})`; g.beginPath(); g.ellipse(r() * 256, r() * 256, 4 + r() * 18, 2 + r() * 8, r() * 3, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = 'rgba(60,45,10,0.45)';
  for (let x = 6; x < 256; x += 16) { g.beginPath(); g.arc(x, 6, 1.6, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(x, 250, 1.6, 0, Math.PI * 2); g.fill(); }
  if (holes) for (const [x, y, rr] of [[128, 128, 11]]) {
    g.fillStyle = '#16161a'; g.beginPath(); g.ellipse(x, y, rr, rr * 1.35, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,240,190,0.35)'; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y, rr + 3, rr * 1.35 + 3, 0, 0, Math.PI * 2); g.stroke();
  }
  return canvasTexture(c, { repeat: true });
}
// Red mesh seat fabric.
function meshTex() {
  const c = canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#a3302c'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(60,8,8,0.55)'; g.lineWidth = 1.4;
  for (let i = -256; i < 512; i += 7) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 256, 256); g.stroke(); g.beginPath(); g.moveTo(i, 256); g.lineTo(i + 256, 0); g.stroke(); }
  const r = rng(61);
  for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,200,190' : '40,5,5'},${0.04 + r() * 0.06})`; g.fillRect(r() * 256, r() * 256, 2, 2); }
  return canvasTexture(c, { repeat: true });
}

export function buildAT401Cockpit(ctx) {
  const { panel, envMap = null, M, C, CAB, shellP, boxX } = ctx;
  const cockpit = new THREE.Group();
  cockpit.name = 'at401-cockpit';

  // ---------------- materials ----------------
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, ...o });
  const CM = {
    panel: std(0xffffff, { map: plateTex(43, '#18191b', 1400), roughness: 0.78, metalness: 0.12 }), // black crackle face
    back: std(0x141517, { roughness: 0.85, metalness: 0.15, side: THREE.DoubleSide }),
    deck: std(0x111214, { roughness: 0.95, metalness: 0.02, side: THREE.DoubleSide }),
    bezel: std(0x16181a, { roughness: 0.45, metalness: 0.35 }),
    can: std(0x0b0c0d, { roughness: 0.9, side: THREE.DoubleSide }),
    dial: std(0xffffff, { map: panel.dials, roughness: 0.45, metalness: 0.05, emissive: 0xffffff, emissiveMap: panel.dials, emissiveIntensity: 0.22 }),
    needle: std(0xf6f6f0, { roughness: 0.4, emissive: 0xf6f6f0, emissiveIntensity: 0.4 }),
    needleD: std(0x111111, { roughness: 0.5 }),
    orange: std(0xf07a1c, { roughness: 0.45, emissive: 0x3a1500 }),
    hub: std(0x0c0c0d, { roughness: 0.4, metalness: 0.4 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, envMap, envMapIntensity: 0.6, depthWrite: false }),
    hobbs: new THREE.MeshBasicMaterial({ map: panel.hobbs.tex, color: 0xd8d8d8 }),
    screen: new THREE.MeshBasicMaterial({ map: panel.gps.tex, color: 0xe4e4e4 }),
    gpsBezel: std(0xffffff, { map: panel.bezel, roughness: 0.55, metalness: 0.15 }),
    gpsBody: std(0x1c1e21, { roughness: 0.55, metalness: 0.2 }),
    placard: std(0xffffff, { map: panel.placards, roughness: 0.6 }),
    compass: std(0xffffff, { map: panel.compass, roughness: 0.5, emissive: 0xffffff, emissiveMap: panel.compass, emissiveIntensity: 0.15 }),
    sub: std(0x232528, { roughness: 0.7, metalness: 0.2 }), // switch sub-panels
    wall: std(0xffffff, { map: yellowTex(11, false), roughness: 0.7, metalness: 0.08, side: THREE.DoubleSide }),
    floor: std(0xffffff, { map: yellowTex(12, true), roughness: 0.78, metalness: 0.05, side: THREE.DoubleSide }),
    tube: std(0xd9b021, { roughness: 0.55, metalness: 0.15 }), // the yellow tube frame
    black: std(0x18191b, { roughness: 0.5, metalness: 0.15 }),
    rubber: std(0x111111, { roughness: 0.95 }),
    grip: std(0x141415, { roughness: 0.85 }),
    chrome: std(0xd9dce0, { roughness: 0.2, metalness: 1, envMap, envMapIntensity: 0.9 }),
    steel: std(0x9a9fa3, { roughness: 0.4, metalness: 0.8 }),
    screw: std(0x8a8f95, { roughness: 0.35, metalness: 0.85 }),
    red: std(0xc8241b, { roughness: 0.38, metalness: 0.05 }),
    blue: std(0x2b5fb0, { roughness: 0.4, metalness: 0.1 }),
    yellowK: std(0xf2c21b, { roughness: 0.4 }),
    white: std(0xe9e9e4, { roughness: 0.42 }),
    seat: std(0xffffff, { map: meshTex(), roughness: 0.85, metalness: 0.02 }),
    frameAlu: std(0xb6babd, { roughness: 0.35, metalness: 0.8 }),
  };
  const annunTex = panel.annun;
  const lampFuel = std(0xd8d8d0, { roughness: 0.25, emissive: 0xffa21a, emissiveIntensity: 0 });
  const lampOil = std(0xd8d8d0, { roughness: 0.25, emissive: 0xff3a22, emissiveIntensity: 0 });
  const CB = {}, CF = {};
  const addB = (mat, g, fine = false) => { ((fine ? CF : CB)[mat] ||= []).push(g); };
  const needles = {};
  const placardUV = (g, row) => {
    const uv = g.attributes.uv, n = AT401_PLACARDS.rows.length;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (row + 1 - uv.getY(i)) / n);
    return g;
  };
  const cellUV = (g, cell) => {
    const uv = g.attributes.uv, cx = cell % AT401_ATLAS.cols, cy = Math.floor(cell / AT401_ATLAS.cols);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + uv.getX(i)) / AT401_ATLAS.cols, 1 - (cy + 1 - uv.getY(i)) / AT401_ATLAS.rows);
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
  const T = K.panel.tilt, cosT = Math.cos(T), sinT = Math.sin(T);
  const [cx, cy, cz] = K.panel.c;
  // The arch: the cabin's section at archZ (shell over the longerons),
  // inset, as v(u) on the face.
  const sec = [];
  for (let i = 0; i <= 40; i++) { const p = shellP(K.panel.archZ, (i / 40) * 0.5); sec.push([p[0], p[1]]); } // x from the side to 0
  const shellYat = (x) => {
    const ax = Math.abs(x);
    for (let i = 0; i < sec.length - 1; i++) {
      const [x0, y0] = sec[i], [x1, y1] = sec[i + 1];
      if (ax <= x0 && ax >= x1) return lerp(y0, y1, (x0 - ax) / Math.max(1e-6, x0 - x1));
    }
    return ax > sec[0][0] ? sec[0][1] : sec[sec.length - 1][1];
  };
  const vTop = (u) => (shellYat(u) - K.panel.archInset - cy) / cosT;
  const H = P.hump;
  const outline = () => {
    const pts = [[-P.halfW, P.bottom], [P.halfW, P.bottom]];
    const N = 14;
    for (let i = 0; i <= N; i++) { const u = lerp(P.halfW, H.half, i / N); pts.push([u, vTop(u)]); }
    // The hump: straight sides, rounded top corners.
    const corner = (cu, cv, a0) => { for (let i = 0; i <= 5; i++) { const a = a0 + (i / 5) * (Math.PI / 2); pts.push([cu + Math.cos(a) * H.r, cv + Math.sin(a) * H.r]); } };
    corner(H.half - H.r, H.top - H.r, 0);
    corner(-H.half + H.r, H.top - H.r, Math.PI / 2);
    for (let i = 0; i <= N; i++) { const u = lerp(-H.half, -P.halfW, i / N); pts.push([u, vTop(u)]); }
    return pts;
  };
  const OUT = outline();
  const pf = panelFrame(K.panel.c, T);
  cockpit.add(pf);
  const put = frameBuild(pf);
  {
    const out = OUT.map(([u, v]) => new THREE.Vector2(u, v));
    const fs = new THREE.Shape(out);
    for (const d of Object.values(P.dials)) { const h = new THREE.Path(); h.absarc(d.u, d.v, d.f + 0.0025, 0, Math.PI * 2, true); fs.holes.push(h); }
    fs.holes.push(rrect(new THREE.Path(), P.hobbs.u, P.hobbs.v, P.hobbs.w + 0.006, P.hobbs.h + 0.006, 0.003, true));
    const face = new THREE.ExtrudeGeometry(fs, { depth: 0.004, bevelEnabled: false, curveSegments: 18 }).translate(0, 0, -0.004);
    { const uv = face.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 3); }
    put('panel', face);
    // Body behind the face (to the coaming), and its rolled top edge.
    put('back', new THREE.ExtrudeGeometry(new THREE.Shape(out), { depth: P.depth, bevelEnabled: false }).translate(0, 0, -0.013 - P.depth));
    const edge = OUT.slice(2).map(([u, v]) => new THREE.Vector3(u, v - 0.004, 0.0));
    put('black', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), 80, 0.006, 6, false));
    for (const [u, v] of [[-0.485, -0.285], [0.485, -0.285], [-0.485, 0.1], [0.485, 0.1], [-0.13, 0.43], [0.13, 0.43], [-0.3, 0.27], [0.3, 0.27], [0, -0.285]]) put('screw', at(new THREE.CylinderGeometry(0.0032, 0.0032, 0.0018, 8), u, v, 0.0009, Math.PI / 2), true);
  }
  // Face point → body frame (for the coaming and the clearance checks).
  const faceToBody = (u, v, w = 0) => [-u, cy + v * cosT + w * sinT, cz + v * sinT - w * cosT];
  // Coaming: from the body's top front edge to the windshield's base.
  {
    const zW = CAB.wsB - 0.012;
    const N = 36;
    addB('deck', skin((s, t) => {
      // s across (left wall → right wall), t from the panel to the windshield.
      const p = shellP(zW, s);
      const u = clamp(-p[0] * (P.halfW / 0.53), -P.halfW, P.halfW);
      const v = vTop(u);
      const a = faceToBody(u, v, -P.depth - 0.013);
      const b = [p[0] * 0.985, p[1] - 0.012, zW];
      return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    }, N, 3));
    // Side fillers between the panel's ends and the walls, under the arch.
    for (const s of [1, -1]) {
      const u = -s * P.halfW;
      addB('back', skin((a, b) => {
        const v = lerp(P.bottom, Math.min(vTop(u), (CAB.sill - 0.004 - cy) / cosT), b);
        const y = cy + v * cosT, z0 = cz + v * sinT;
        const x = s * lerp(P.halfW, boxX(z0, y) - 0.008, a);
        return [x, y, z0 + 0.01];
      }, 1, 4));
    }
  }
  // Instruments: dial face, can, bezel, glass, hub and the needles.
  const instrument = (frame, putF, id, d) => {
    const r = d.f + 0.007;
    putF('dial', at(cellUV(new THREE.CircleGeometry(d.f, 48), d.cell), d.u, d.v, -0.009));
    putF('can', at(new THREE.CylinderGeometry(d.f + 0.0025, d.f + 0.0025, 0.009, 36, 1, true), d.u, d.v, -0.0045, Math.PI / 2));
    const prof = [[r + 0.001, 0.0], [r, 0.0034], [r - 0.003, 0.0055], [d.f + 0.0018, 0.0048], [d.f + 0.0003, 0.0012], [d.f + 0.0003, -0.0015]];
    putF('bezel', at(new THREE.LatheGeometry(prof.map(([rr, y]) => new THREE.Vector2(rr, y)), 40), d.u, d.v, 0, Math.PI / 2));
    putF('hub', at(new THREE.CircleGeometry(d.f * 0.09, 16), d.u, d.v, -0.0048));
    glassBy.push([frame, at(new THREE.CircleGeometry(d.f + 0.0008, 36), d.u, d.v, -0.0034)]);
    const mk = (len, w, layer = 0, mat = CM.needle) => { const m = new THREE.Mesh(needleGeo(len, w), mat); m.position.set(d.u, d.v, -0.0066 + layer * 0.0006); frame.add(m); return m; };
    const f = d.f;
    if (id === 'alt') needles.alt = [mk(f * 0.55, f * 0.11, 0), mk(f * 0.86, f * 0.07, 1)];
    else if (id === 'oil') needles.oil = [mk(f * 0.82, f * 0.08, 0), mk(f * 0.82, f * 0.08, 1)];
    else if (id === 'spray') needles.spray = [mk(f * 0.86, f * 0.07, 0, CM.needleD)];
    else if (id === 'turn') {
      // The little airplane (wings, nose dot, fin) and the ball.
      const s = new THREE.Shape();
      s.moveTo(-f * 0.72, -0.0016); s.lineTo(f * 0.72, -0.0016); s.lineTo(f * 0.72, 0.0016); s.lineTo(-f * 0.72, 0.0016); s.closePath();
      const plane = new THREE.Group();
      plane.add(new THREE.Mesh(mergeAll([new THREE.ShapeGeometry(s), new THREE.CircleGeometry(f * 0.09, 14), new THREE.PlaneGeometry(0.003, f * 0.22).translate(0, f * 0.15, 0)]), CM.needle));
      plane.position.set(d.u, d.v, -0.0062);
      frame.add(plane);
      const bl = new THREE.Mesh(new THREE.SphereGeometry(f * 0.075, 10, 8), CM.needleD);
      bl.userData.c = [d.u, d.v + 0.75 * f, 1.25 * f];
      bl.position.set(d.u, d.v - 0.5 * f, -0.0075);
      frame.add(bl);
      needles.turn = [plane, bl];
    } else needles[id] = [mk(f * 0.86, f * 0.075)];
  };
  for (const [id, d] of Object.entries(P.dials)) instrument(pf, put, id, d);
  // Hour meter (yellow LCD).
  {
    const Hb = P.hobbs;
    put('black', new RoundedBoxGeometry(Hb.w + 0.006, Hb.h + 0.006, 0.016, 1, 0.003).translate(Hb.u, Hb.v, -0.006));
    pf.add(new THREE.Mesh(new THREE.PlaneGeometry(Hb.w, Hb.h).translate(Hb.u, Hb.v, 0.0025), CM.hobbs));
  }
  // Magneto key with its placard; warning lamps; guarded boost-pump switch.
  const magKey = new THREE.Group();
  {
    const Kp = P.key;
    put('chrome', at(new THREE.CylinderGeometry(0.014, 0.016, 0.006, 20), Kp.u, Kp.v, 0.003, Math.PI / 2));
    magKey.position.set(Kp.u, Kp.v, 0.006);
    magKey.add(new THREE.Mesh(new RoundedBoxGeometry(0.012, 0.03, 0.004, 1, 0.0015).translate(0, 0.008, 0.002), CM.white));
    pf.add(magKey);
    put('placard', placardUV(at(new THREE.PlaneGeometry(0.075, 0.011), Kp.u, Kp.v - 0.027, 0.0006), 7));
    for (const L of P.lamps) {
      put('chrome', at(new THREE.TorusGeometry(0.0125, 0.003, 6, 20), L.u, L.v, 0.002));
      pf.add(new THREE.Mesh(new THREE.SphereGeometry(0.011, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).translate(L.u, L.v, 0.0015), L.id === 'fuel' ? lampFuel : lampOil));
    }
    const G = P.guard;
    put('red', new RoundedBoxGeometry(0.022, 0.034, 0.016, 1, 0.003).translate(G.u, G.v, 0.009));
    put('chrome', at(new THREE.CylinderGeometry(0.0055, 0.0055, 0.004, 12), G.u, G.v - 0.008, 0.019, Math.PI / 2), true);
    put('placard', placardUV(at(new THREE.PlaneGeometry(0.17, 0.011), -0.33, 0.0, 0.0006), 1));
  }
  // Annunciator push-buttons under the turn coordinator.
  const annun = [];
  const annunG = new THREE.Group();
  annunG.name = 'at401-annunciators';
  pf.add(annunG);
  {
    const A = P.annun;
    put('black', new RoundedBoxGeometry(A.du * A.n + 0.008, 0.026, 0.008, 1, 0.002).translate(A.u0 + (A.du * (A.n - 1)) / 2, A.v, 0.002));
    AT401_ANNUN.forEach((a, i) => {
      const g = new RoundedBoxGeometry(0.021, 0.019, 0.008, 1, 0.002);
      const uv = g.attributes.uv, pz = g.attributes.position;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, (i + (pz.getX(k) + 0.0105) / 0.021) / AT401_ANNUN.length, (pz.getY(k) + 0.0095) / 0.019);
      const m = new THREE.Mesh(g.translate(A.u0 + i * A.du, A.v, 0.008), std(0xffffff, { map: annunTex, roughness: 0.3, emissive: a.col, emissiveMap: annunTex, emissiveIntensity: 0 }));
      m.userData.id = a.id;
      annunG.add(m);
      annun.push(m);
    });
    put('placard', placardUV(at(new THREE.PlaneGeometry(0.13, 0.011), 0.195, 0.07, 0.0006), 8));
  }
  // Switch and breaker panels along the bottom (raised sub-plates).
  {
    for (const pl of P.plates) put('sub', new RoundedBoxGeometry(pl.w, pl.h, 0.01, 1, 0.003).translate(pl.u, pl.v, 0.003));
    for (const [S, Bk, row] of [[P.switchesL, P.breakersL, 0], [P.switchesR, P.breakersR, 9]]) {
      put('placard', placardUV(at(new THREE.PlaneGeometry(S.u1 - S.u0 + 0.02, 0.011), (S.u0 + S.u1) / 2, S.v + 0.022, 0.0085), row));
      for (let i = 0; i < S.n; i++) {
        const u = lerp(S.u0, S.u1, i / (S.n - 1));
        put('chrome', at(new THREE.CylinderGeometry(0.0062, 0.0062, 0.004, 12), u, S.v, 0.01, Math.PI / 2), true);
        put('chrome', rod([u, S.v, 0.01], [u, S.v + 0.011, 0.024], 0.0022, 6), true);
        put('chrome', ball([u, S.v + 0.0115, 0.0245], 0.003, 6), true);
      }
      for (let i = 0; i < Bk.n; i++) {
        const u = lerp(Bk.u0, Bk.u1, i / (Bk.n - 1));
        put('black', at(new THREE.CylinderGeometry(0.0055, 0.0055, 0.008, 10), u, Bk.v, 0.012, Math.PI / 2), true);
        put('white', at(new THREE.CylinderGeometry(0.0042, 0.0042, 0.0012, 10), u, Bk.v, 0.0165, Math.PI / 2), true);
      }
    }
  }
  // GPS housing (the game's AGROWINGS NAV) low in the centre, where the
  // photographs' ag guidance screen sits; its page keys under the screen.
  const G = P.gps, pickables = [];
  const gpsG = new THREE.Group();
  {
    gpsG.position.set(G.u, G.v, 0);
    pf.add(gpsG);
    const CG = {};
    const addG = (mat, g) => (CG[mat] ||= []).push(g);
    addG('gpsBody', new RoundedBoxGeometry(G.w, G.h, 0.034, 2, 0.006).translate(0, 0, 0.017 - 0.006));
    const S = G.screen;
    const fsh = rrect(new THREE.Shape(), 0, 0, G.w - 0.006, G.h - 0.006, 0.006);
    fsh.holes.push(rrect(new THREE.Path(), 0, 0.016, S.w + 0.004, S.h + 0.004, 0.002, true));
    const fp = new THREE.ShapeGeometry(fsh, 6);
    const uv = fp.attributes.uv, pp = fp.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pp.getX(i) + G.w / 2) / G.w, (pp.getY(i) + G.h / 2) / G.h);
    addG('gpsBezel', fp.translate(0, 0, 0.0285));
    addG('screen', new THREE.PlaneGeometry(S.w, S.h).translate(0, 0.016, 0.0282));
    const keyGeo = new RoundedBoxGeometry(0.026, 0.011, 0.006, 1, 0.002);
    const keyCols = [0x2b5fb0, 0x27a043, 0xe0a41c, 0xc8261b];
    NAV_PAGES.forEach((pg, i) => {
      const k = new THREE.Mesh(keyGeo, std(keyCols[i % keyCols.length], { roughness: 0.5, emissive: 0x52d8ff, emissiveIntensity: 0 }));
      k.position.set(G.keysU[i], G.keysV, 0.031);
      k.userData.gpsPage = pg;
      gpsG.add(k);
      pickables.push(k);
    });
    for (const [mat, list] of Object.entries(CG)) gpsG.add(new THREE.Mesh(mergeAll(list), CM[mat]));
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.h).translate(0, 0.016, 0.0292), CM.glass);
    gl.renderOrder = 8; gpsG.add(gl);
    for (const [u, v] of [[-G.w / 2 + 0.008, G.h / 2 - 0.008], [G.w / 2 - 0.008, G.h / 2 - 0.008], [-G.w / 2 + 0.008, -G.h / 2 + 0.008], [G.w / 2 - 0.008, -G.h / 2 + 0.008]]) put('screw', at(new THREE.CylinderGeometry(0.003, 0.003, 0.002, 8), G.u + u, G.v + v, 0.0295, Math.PI / 2), true);
  }
  // Magnetic compass on the hump (the card turns with the heading).
  const card = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.015, 32, 1, true), CM.compass);
  {
    const top = H.top;
    // Housing open toward the pilot (the window), on a short pedestal.
    put('black', new RoundedBoxGeometry(0.07, 0.05, 0.022, 2, 0.006).translate(0, top + 0.022, 0.001));
    put('black', new RoundedBoxGeometry(0.07, 0.008, 0.05, 1, 0.003).translate(0, top + 0.043, 0.025));
    put('black', new RoundedBoxGeometry(0.07, 0.008, 0.05, 1, 0.003).translate(0, top + 0.001, 0.025));
    for (const s of [-1, 1]) put('black', new RoundedBoxGeometry(0.008, 0.05, 0.05, 1, 0.003).translate(s * 0.031, top + 0.022, 0.025));
    put('white', new THREE.PlaneGeometry(0.0015, 0.02).translate(0, top + 0.022, 0.046)); // lubber line
    glassBy.push([pf, at(new THREE.PlaneGeometry(0.054, 0.034), 0, top + 0.022, 0.049)]);
    // The card: a cylinder about the vertical (body frame) inside.
    const cw = new THREE.Group();
    cw.position.copy(new THREE.Vector3(0, top + 0.022, 0.022).applyQuaternion(pf.quaternion).add(pf.position));
    cw.add(card);
    cockpit.add(cw);
    card.rotation.order = 'YXZ';
  }

  // ======================================================== 2 cabin
  const zB = K.bulkhead, zR = K.rearWall, fl = K.floor;
  {
    // Forward bulkhead (the hopper's rear wall) from the floor to the sill.
    addB('wall', skin((u, v) => { const y = lerp(fl, CAB.sill, v), x = boxX(zB, y) - 0.01; return [lerp(x, -x, u), y, zB]; }, 6, 6));
    // Floor.
    const fg = skin((u, v) => { const z = lerp(zB, zR, v), x = boxX(z, fl + 0.01) - 0.012; return [lerp(x, -x, u), fl, z]; }, 2, 12);
    { const uv = fg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1, uv.getY(i) * (zB - zR) / 0.5); }
    addB('floor', fg);
    // Side walls to the sill, the tube frame on them.
    for (const sx of [1, -1]) {
      const wg = skin((u, v) => { const z = lerp(zB, zR, u), y = lerp(fl, CAB.sill - 0.01, v); return [sx * (boxX(z, y) - 0.012), y, z]; }, 14, 6);
      const wuv = wg.attributes.uv; for (let i = 0; i < wuv.count; i++) wuv.setX(i, wuv.getX(i) * (zB - zR) / 0.5);
      addB('wall', wg);
      const X = (z, y) => sx * (boxX(z, y) - 0.03);
      const T2 = (a, b, r = 0.013) => addB('tube', rod(a, b, r, 8));
      const yU = CAB.sill - 0.03, yL = fl + 0.07;
      T2([X(zB, yU), yU, zB], [X(zR, yU), yU, zR], 0.016);
      T2([X(zB, yL), yL, zB], [X(zR, yL), yL, zR], 0.016);
      const st = [zB - 0.02, -1.2, CAB.bPost, zR + 0.02];
      for (const z of st) T2([X(z, yL), yL, z], [X(z, yU), yU, z]);
      for (let i = 0; i < st.length - 1; i++) T2([X(st[i], yL), yL, st[i]], [X(st[i + 1], yU), yU, st[i + 1]]);
    }
    // Cross tube under the panel (the pedal mount) and the rear frame.
    addB('tube', rod([boxX(-0.62, 0.3) - 0.03, 0.3, -0.62], [-(boxX(-0.62, 0.3) - 0.03), 0.3, -0.62], 0.014, 8));
  }

  // ======================================================== 3 stick
  const stick = new THREE.Group();
  stick.position.set(...K.stick);
  {
    const parts = [rod([0, 0, 0], [0, 0.42, 0.02], 0.014, 10), rod([0, 0.42, 0.02], [0, 0.56, 0.07], 0.014, 10), ball([0, 0.42, 0.02], 0.014, 10)];
    stick.add(new THREE.Mesh(mergeAll(parts), CM.steel));
    stick.add(new THREE.Mesh(mergeAll([at(new THREE.CylinderGeometry(0.021, 0.024, 0.13, 12), 0, 0.62, 0.09, 0.35), ball([0, 0.69, 0.115], 0.022, 10)]), CM.grip));
    stick.add(new THREE.Mesh(mergeAll([at(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 10), 0, 0.708, 0.12, 0.35), at(new THREE.BoxGeometry(0.01, 0.018, 0.012), 0, 0.66, 0.13, 0.35)]), CM.red));
    stick.add(new THREE.Mesh(mergeAll([at(new THREE.CylinderGeometry(0.035, 0.065, 0.07, 12, 1, true), 0, 0.03, 0)]), CM.rubber));
  }
  cockpit.add(stick);
  addB('black', at(new THREE.BoxGeometry(0.14, 0.03, 0.14), K.stick[0], K.stick[1] - 0.012, K.stick[2]));

  // ======================================================== 4 pedals
  const pedals = [];
  for (const sx of [1, -1]) {
    const p = new THREE.Group();
    p.position.set(sx * K.pedals[0], K.pedals[1], K.pedals[2]);
    p.add(new THREE.Mesh(mergeAll([new RoundedBoxGeometry(0.09, 0.15, 0.016, 1, 0.004).rotateX(-0.4), rod([0, -0.07, 0.025], [0, -0.12, 0.07], 0.008, 6)]), CM.frameAlu));
    p.add(new THREE.Mesh(mergeAll([at(new THREE.BoxGeometry(0.075, 0.008, 0.07), 0, 0.03, -0.014, -0.4 - Math.PI / 2)]), CM.black));
    cockpit.add(p);
    pedals.push(p);
  }
  addB('steel', rod([0.34, K.pedals[1] - 0.12, K.pedals[2] + 0.07], [-0.34, K.pedals[1] - 0.12, K.pedals[2] + 0.07], 0.013, 8));

  // ======================================================== 5 left quadrant, right console
  const THR = K.throttle;
  const throttle = new THREE.Group();
  throttle.position.set(...THR);
  throttle.add(new THREE.Mesh(mergeAll([rod([0, 0, 0], [0, 0.11, 0.02], 0.006, 6)]), CM.steel));
  throttle.add(new THREE.Mesh(mergeAll([at(new THREE.CylinderGeometry(0.016, 0.016, 0.05, 12), 0, 0.12, 0.022, 0, 0, Math.PI / 2)]), CM.grip));
  cockpit.add(throttle);
  {
    const x = boxX(THR[2], 0.7) - 0.03;
    addB('black', at(new RoundedBoxGeometry(0.1, 0.06, 0.32, 1, 0.008), x - 0.04, THR[1] - 0.02, THR[2] + 0.02));
    for (const [dz, mat] of [[0.075, 'blue'], [0.13, 'red']]) {
      addB('steel', rod([THR[0] + 0.02, THR[1], THR[2] + dz], [THR[0] + 0.02, THR[1] + 0.095, THR[2] + dz + 0.01], 0.005, 6));
      addB(mat, at(new THREE.CylinderGeometry(0.013, 0.013, 0.03, 12), THR[0] + 0.02, THR[1] + 0.1, THR[2] + dz + 0.012, 0, 0, Math.PI / 2));
    }
    addB('placard', placardUV(at(new THREE.PlaneGeometry(0.16, 0.016), x - 0.091, THR[1] + 0.012, THR[2] + 0.03, -Math.PI / 2, 0, -Math.PI / 2), 4));
    // Right console: breaker box and the spray valve lever.
    const xr = -(boxX(K.valve[2], 0.7) - 0.03);
    addB('black', at(new RoundedBoxGeometry(0.1, 0.07, 0.34, 1, 0.008), xr + 0.04, K.valve[1] - 0.04, K.valve[2] + 0.04));
    for (let i = 0; i < 6; i++) addB('white', at(new THREE.CylinderGeometry(0.004, 0.004, 0.006, 8), xr + 0.04, K.valve[1] - 0.003, K.valve[2] + 0.17 - i * 0.025), true);
    addB('placard', placardUV(at(new THREE.PlaneGeometry(0.1, 0.015), xr + 0.065, K.valve[1] - 0.0045, K.valve[2] - 0.07, -Math.PI / 2, 0, Math.PI / 2), 6));
  }
  const valve = new THREE.Group();
  valve.position.set(...K.valve);
  valve.add(new THREE.Mesh(mergeAll([rod([0, 0, 0], [0, 0.13, 0.0], 0.007, 6)]), CM.steel));
  valve.add(new THREE.Mesh(mergeAll([at(new RoundedBoxGeometry(0.026, 0.05, 0.026, 1, 0.008), 0, 0.15, 0)]), CM.yellowK));
  cockpit.add(valve);

  // ======================================================== 6 flap lever
  // Floor lever left of the seat: down = flaps up; pulled up through the
  // notches for 10° / 20° / 30°.
  const flap = new THREE.Group();
  flap.name = 'at401-flap-lever';
  flap.position.set(...K.flap);
  flap.add(new THREE.Mesh(mergeAll([rod([0, 0, 0], [0, 0.0, 0.42], 0.011, 8)]), CM.yellowK));
  flap.add(new THREE.Mesh(mergeAll([at(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 12), 0, 0, 0.47, Math.PI / 2), ball([0, 0, 0.535], 0.018, 10)]), CM.grip));
  cockpit.add(flap);
  addB('black', at(new RoundedBoxGeometry(0.05, 0.08, 0.16, 1, 0.006), K.flap[0], K.flap[1] - 0.02, K.flap[2] + 0.03));
  addB('placard', placardUV(at(new THREE.PlaneGeometry(0.15, 0.016), K.flap[0], K.flap[1] + 0.023, K.flap[2] + 0.04, -Math.PI / 2, 0, Math.PI / 2), 5));

  // ======================================================== 7 seat
  {
    const S = K.seat;
    addB('seat', new RoundedBoxGeometry(0.46, 0.08, 0.44, 3, 0.035).translate(S.c[0], S.c[1], S.c[2]));
    addB('seat', at(new RoundedBoxGeometry(0.46, 0.66, 0.08, 3, 0.035), S.c[0], S.c[1] + 0.36, S.back, -0.16));
    for (const sx of [1, -1]) {
      addB('frameAlu', rod([sx * 0.24, S.c[1] - 0.02, S.c[2] + 0.2], [sx * 0.24, S.c[1] + 0.02, S.back + 0.02], 0.012, 6));
      addB('frameAlu', rod([sx * 0.24, S.c[1] + 0.02, S.back + 0.02], [sx * 0.24, S.c[1] + 0.68, S.back - 0.08], 0.012, 6));
      addB('frameAlu', rod([sx * 0.2, fl, S.c[2] + 0.15], [sx * 0.2, S.c[1] - 0.04, S.c[2] + 0.15], 0.012, 6));
      addB('frameAlu', rod([sx * 0.2, fl, S.c[2] - 0.18], [sx * 0.2, S.c[1] - 0.04, S.c[2] - 0.18], 0.012, 6));
    }
    // Harness lying on the seat (shoulder straps over the back, lap belt).
    for (const sx of [1, -1]) {
      addB('black', rod([sx * 0.09, S.c[1] + 0.69, S.back - 0.02], [sx * 0.1, S.c[1] + 0.22, S.back + 0.11], 0.012, 4));
      addB('black', rod([sx * 0.2, S.c[1] + 0.05, S.c[2] - 0.12], [sx * 0.07, S.c[1] + 0.05, S.c[2] + 0.1], 0.012, 4));
    }
    addB('chrome', at(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 16), 0, S.c[1] + 0.055, S.c[2] + 0.1));
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
  const nd = { ias: 0, alt: 0, vs: 0, turn: 0, ball: 0, rpm: 0, mp: 29.6, ff: 0, oilP: 0, oilT: 20, cht: 30, fuel: 0, hopper: 0, spray: 0, hdg: 0, key: -0.9, flap: 0 };
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
    // Flap lever (visible from outside too, while shown).
    nd.flap = damp(nd.flap, fm.flaps ?? 0, 6, dt);
    flap.rotation.x = -0.12 - nd.flap * 0.75;
    if (near) { nearT -= dt; if (nearT <= 0) { nearT = 0.3; panel.draw(ac.instruments()); } }
    if (!inCk && !near) return;
    const d = panel.last;
    if (!d) return;
    const A = AT401_ANG, k = 9;
    const master = d.engine !== 'off';
    nd.ias = damp(nd.ias, d.ias, k, dt);
    nd.alt = damp(nd.alt, d.altFt, k, dt);
    nd.vs = damp(nd.vs, d.vsFpm ?? 0, 3, dt);
    nd.turn = damp(nd.turn, master ? d.yawRate ?? 0 : 0, 4, dt);
    nd.ball = damp(nd.ball, d.slip ?? 0, 5, dt);
    nd.rpm = damp(nd.rpm, d.rpm, k, dt);
    nd.mp = damp(nd.mp, d.mp ?? 29.6, k, dt);
    nd.ff = damp(nd.ff, d.fuelFlow ?? 0, 4, dt); // L/h
    nd.oilP = damp(nd.oilP, d.oilP ?? 0, 4, dt);
    nd.oilT = damp(nd.oilT, d.oilT ?? 20, 2, dt);
    nd.cht = damp(nd.cht, d.cht ?? 30, 2, dt);
    nd.fuel = damp(nd.fuel, master ? (d.fuel ?? 0) : 0, 2, dt);
    nd.hopper = damp(nd.hopper, master ? (d.hopper ?? 0) : 0, 2, dt);
    nd.spray = damp(nd.spray, (d.flow ?? 0) * 60, 5, dt);
    setN(needles.asi[0], A.asi(nd.ias));
    setN(needles.alt[0], A.alt1000(nd.alt)); setN(needles.alt[1], A.alt100(nd.alt));
    setN(needles.vsi[0], A.vsi(nd.vs));
    needles.turn[0].rotation.z = -A.turn(nd.turn);
    {
      const b = needles.turn[1], [bu, bv, br] = b.userData.c, a = A.ball(nd.ball);
      b.position.x = bu + Math.sin(a) * br; b.position.y = bv - Math.cos(a) * br;
    }
    setN(needles.rpm[0], A.rpm(nd.rpm));
    setN(needles.mp[0], A.mp(nd.mp));
    setN(needles.ff[0], A.ff(nd.ff));
    setN(needles.oil[0], A.oilP(nd.oilP)); setN(needles.oil[1], A.oilT(nd.oilT));
    setN(needles.cht[0], A.cht(nd.cht));
    setN(needles.fuel[0], A.fuel(nd.fuel));
    setN(needles.hopper[0], A.hopper(nd.hopper));
    setN(needles.spray[0], A.spray(nd.spray));
    // Compass card: the heading under the lubber line (wrapped damping).
    const dh = ((((d.hdg ?? 0) - nd.hdg) % 360) + 540) % 360 - 180;
    nd.hdg = (nd.hdg + dh * (1 - Math.exp(-3 * dt)) + 360) % 360;
    card.rotation.y = nd.hdg * D2R + Math.PI / 2;
    // Magneto key: OFF with the engine stopped, BOTH running, START cranking.
    nd.key = damp(nd.key, d.engine === 'cranking' ? 1.4 : master ? 0.7 : -0.9, 10, dt);
    magKey.rotation.z = -nd.key;
    const lit = panel.lit;
    lampFuel.emissiveIntensity = lit.fuel ? 2.2 : 0;
    lampOil.emissiveIntensity = lit.oil ? 2.2 : 0;
    for (const m of annun) m.material.emissiveIntensity = lit[m.userData.id] ? 1.6 : 0;
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
  return { cockpit, stick, pedals, throttle, valve, flap, leds: [], THR, panelMesh: pf, update, pick, pickables, gps: gpsG, needles, compass: card, annun, refs: { panel: panelRef }, outline: OUT, faceToBody };
}
