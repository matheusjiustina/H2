// Grumman G-164A Super Ag-Cat (radial) cockpit — Prompt 02. Built inside the
// cabin of agcatModel.js, in the same body frame (+X left, +Y up, +Z nose;
// nothing scaled to fit), on its anchors (AGCAT_CABIN). The arrangement
// follows the FSX reference, checked against the photographs of real
// G-164A cockpits (the Satloc cockpit, the in-flight views, the AgAir
// panel):
//   1  the raised black POD under the windshield — thick rounded rim, the
//      recessed face, airspeed, compass window, altimeter, FUEL WARNING lamp
//      and the red boost-pump switch; the white boom-pressure gauge on its
//      own bracket beside it; the guidance light bar on its top;
//   2  the angular LOWER PANEL: two boards turned 25° toward the pilot (oil
//      and tachometer on the left; manifold pressure, fuel and cylinder-head
//      temperature on the right) on either side of the centre frame (top
//      band, two straps, the perforated plate);
//   3  the hopper's sloped rear wall seen below the pod (GROUND / FLIGHT
//      gallon scale, the product behind the fibreglass) down to the footwell;
//   4  the welded tube frame: longerons, posts and wall diagonals, the cross
//      tube at the floor and the one in front of the stick, the V from the
//      floor to the panel's corners;
//   5  the centre stick (floor pivot, rubber boot, shaft, black grip with
//      the spray trigger); the aluminium pedals on their hinge tubes;
//   6  the left side: the throttle quadrant on the wall (throttle black,
//      propeller blue, mixture red), the magneto switch, the red hopper dump
//      handle with its linkage across the cockpit; the right wall: the
//      electrical panel (switches, breakers);
//   7  floor plates, painted walls, the seat with its harness;
//   8  the game's AGROWINGS NAV in a compact housing on a bracket at the
//      pod's right (its keys clickable / touchable).
// Static parts are merged per material; small hardware sits in a level of
// detail. Needles, the compass card, the magneto key, the lamp and the GPS
// keys follow Aircraft.instruments() (panel.last) — only while the camera
// is in the cockpit or close to it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvas, canvasTexture } from '../core/textures.js';
import { clamp, rng } from '../core/math.js';
import { AGCAT_PANEL, AGCAT_ANG, AGCAT_ATLAS, AGCAT_PLACARDS, BOOM_PSI } from './agcatPanel.js';
import { NAV_PAGES } from './agroNav.js';

const P = AGCAT_PANEL;
const D2R = Math.PI / 180;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

// ---------------------------------------------------------------- layout
export const AGCAT_CK = {
  pod: { c: [0, 0.515, -0.48], tilt: 14 * D2R },
  boom: { c: [0.258, 0.522, -0.472], tilt: 14 * D2R },
  // Lower panel: the centre frame's face plane, the boards' inner edges at
  // ±inner, turned `yaw` toward the pilot.
  lower: { y: 0.33, z: -0.41, inner: 0.17, tilt: 8 * D2R, yaw: 25 * D2R, top: 0.455, bottom: 0.215 },
  // Hopper rear wall: top (under the coaming) to the footwell.
  wall: { top: [0.47, -0.36], bottom: [-0.06, -0.04], half: 0.46 },
  floor: -0.38, wallX: 0.49,
  stick: [0, -0.3, -0.58], stickLen: 0.45,
  pedals: [0.17, -0.21, -0.06],
  throttle: [0.43, 0.04, -0.64],
  gps: [-0.272, 0.533, -0.476],
};
const K = AGCAT_CK;

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
  const arc = (cx, cy, a0) => { for (let i = 0; i <= 5; i++) { const a = a0 + (i / 5) * (Math.PI / 2); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  arc(x1 - r, y0 + r, -Math.PI / 2); arc(x1 - r, y1 - r, 0); arc(x0 + r, y1 - r, Math.PI / 2); arc(x0 + r, y0 + r, Math.PI);
  if (hole) pts.reverse();
  path.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) path.lineTo(x, y);
  path.closePath();
  return path;
}
// Rounded-rectangle ring (outer w×h, inner wi×hi), extruded toward +z.
function ringG(w, h, r, wi, hi, ri, depth) {
  const s = rrect(new THREE.Shape(), 0, 0, w, h, r);
  s.holes.push(rrect(new THREE.Path(), 0, 0, wi, hi, ri, true));
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 6 });
}
// A panel frame: local x → pilot's right, y → up the tilted face, z →
// toward the pilot; `yaw` turns the face about the vertical.
function panelFrame(origin, tilt, yaw = 0) {
  const PU = new THREE.Vector3(-1, 0, 0), PV = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt));
  const PW = new THREE.Vector3().crossVectors(PU, PV);
  const grp = new THREE.Group();
  grp.position.set(...origin);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(PU, PV, PW));
  grp.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(q));
  return grp;
}

// ---------------------------------------------------------------- textures
function plateTex(seed, base, n = 1800) {
  const c = canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  const r = rng(seed);
  for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,250' : '20,18,14'},${0.025 + r() * 0.05})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2); }
  return canvasTexture(c, { repeat: true });
}
function perfTex() {
  const c = canvas(128, 256), g = c.getContext('2d');
  g.fillStyle = '#b7bbbf'; g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#2b2219';
  for (let y = 16; y < 256; y += 30) for (let x = 20 + ((y / 30) % 2) * 22; x < 120; x += 44) { g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2); g.fill(); }
  return canvasTexture(c);
}
function treadTex() {
  const c = canvas(128, 160), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 128, 160);
  gr.addColorStop(0, '#c4c8cb'); gr.addColorStop(1, '#868b8f');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 160);
  g.fillStyle = 'rgba(30,32,34,0.45)';
  for (let y = 10; y < 150; y += 10) for (let x = 6 + ((y / 10) % 2) * 5; x < 124; x += 10) { g.beginPath(); g.moveTo(x, y - 3); g.lineTo(x + 3, y); g.lineTo(x, y + 3); g.lineTo(x - 3, y); g.closePath(); g.fill(); }
  return canvasTexture(c);
}

export function buildAgCatCockpit(ctx) {
  const { panel, envMap = null, harnessMat, C, CAB } = ctx;
  const cockpit = new THREE.Group();
  cockpit.name = 'agcat-cockpit';
  const eye = new THREE.Vector3(...C.eye);

  // ---------------- materials ----------------
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, ...o });
  const CM = {
    hood: std(0x151617, { roughness: 0.8, metalness: 0.08 }),
    face: std(0x1b1c1e, { roughness: 0.7, metalness: 0.15 }),
    board: std(0x1d1e20, { map: plateTex(11, '#2a2b2d', 2400), roughness: 0.65, metalness: 0.2 }),
    bezel: std(0x101113, { roughness: 0.45, metalness: 0.35 }),
    can: std(0x0b0c0d, { roughness: 0.9, side: THREE.DoubleSide }),
    dial: std(0xffffff, { map: panel.dials, roughness: 0.45, metalness: 0.05, emissive: 0xffffff, emissiveMap: panel.dials, emissiveIntensity: 0.24 }),
    needle: std(0xf6f6f0, { roughness: 0.4, emissive: 0xf6f6f0, emissiveIntensity: 0.4 }),
    needleK: std(0x111111, { roughness: 0.4 }),
    needleR: std(0xd8371c, { roughness: 0.4, emissive: 0xd8371c, emissiveIntensity: 0.3 }),
    hub: std(0x0c0c0d, { roughness: 0.4, metalness: 0.4 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, envMap, envMapIntensity: 0.6, depthWrite: false }),
    hobbs: new THREE.MeshBasicMaterial({ map: panel.hobbs.tex, color: 0xcfcfcf }),
    card: std(0xffffff, { map: panel.card, roughness: 0.5, emissive: 0xffffff, emissiveMap: panel.card, emissiveIntensity: 0.25 }),
    screen: new THREE.MeshBasicMaterial({ map: panel.gps.tex, color: 0xe4e4e4 }),
    gpsBezel: std(0xffffff, { map: panel.bezel, roughness: 0.55, metalness: 0.15 }),
    gpsBody: std(0x1c1e21, { roughness: 0.55, metalness: 0.2 }),
    placard: std(0xffffff, { map: panel.placards, roughness: 0.6 }),
    hopper: std(0xffffff, { map: panel.hopper, roughness: 0.75, metalness: 0.02 }),
    perf: std(0xffffff, { map: perfTex(), roughness: 0.5, metalness: 0.55 }),
    tube: std(0x7d848b, { roughness: 0.5, metalness: 0.55 }),
    wall: std(0xc7a73a, { map: plateTex(5, '#d4b44a'), roughness: 0.62, metalness: 0.05, side: THREE.DoubleSide }), // painted yellow skin
    floor: std(0x4a4e52, { map: plateTex(8, '#54585c', 3200), roughness: 0.82, metalness: 0.4 }),
    black: std(0x18191b, { roughness: 0.5, metalness: 0.15 }),
    rubber: std(0x111111, { roughness: 0.95 }),
    grip: std(0x151516, { roughness: 0.85 }),
    chrome: std(0xd9dce0, { roughness: 0.2, metalness: 1, envMap, envMapIntensity: 0.9 }),
    steel: std(0x8d9296, { roughness: 0.42, metalness: 0.8 }),
    screw: std(0x8a8f95, { roughness: 0.35, metalness: 0.85 }),
    red: std(0xc8241b, { roughness: 0.38, metalness: 0.05 }),
    blue: std(0x2b6fc7, { roughness: 0.4, metalness: 0.1 }),
    white: std(0xe9e9e4, { roughness: 0.42 }),
    tread: std(0xffffff, { map: treadTex(), roughness: 0.45, metalness: 0.6 }),
    seat: std(0x5a3b26, { roughness: 0.82 }),
    harness: harnessMat ?? std(0x3a3f46, { roughness: 0.8 }),
  };
  const CB = {}, CF = {};
  const addB = (mat, g, fine = false) => { ((fine ? CF : CB)[mat] ||= []).push(g); };
  const needles = {};
  const placardUV = (g, row) => {
    const uv = g.attributes.uv, n = AGCAT_PLACARDS.rows.length;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (row + 1 - uv.getY(i)) / n);
    return g;
  };
  const cellUV = (g, cell) => {
    const uv = g.attributes.uv, cx = cell % AGCAT_ATLAS.cols, cy = Math.floor(cell / AGCAT_ATLAS.cols);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + uv.getX(i)) / AGCAT_ATLAS.cols, 1 - (cy + 1 - uv.getY(i)) / AGCAT_ATLAS.rows);
    return g;
  };
  const needleGeo = (len, w, tail = 0.22) => {
    const s = new THREE.Shape();
    s.moveTo(-w * 0.7, -len * tail); s.lineTo(w * 0.7, -len * tail); s.lineTo(w * 0.5, 0); s.lineTo(w * 0.2, len); s.lineTo(-w * 0.2, len); s.lineTo(-w * 0.5, 0); s.closePath();
    return new THREE.ShapeGeometry(s);
  };
  // A recessed instrument in a frame: dial face, can, bezel, glass, hub and
  // its needles (3D, turned per frame).
  const glassBy = new Map();
  const instrument = (frame, put, id, d, white = false) => {
    put('dial', at(cellUV(new THREE.CircleGeometry(d.f, 48), d.cell), d.u, d.v, -0.009));
    put('can', at(new THREE.CylinderGeometry(d.f + 0.0025, d.f + 0.0025, 0.009, 36, 1, true), d.u, d.v, -0.0045, Math.PI / 2));
    const prof = [[d.r + 0.001, 0.0], [d.r, 0.0034], [d.r - 0.003, 0.0055], [d.f + 0.0018, 0.0048], [d.f + 0.0003, 0.0012], [d.f + 0.0003, -0.0015]];
    put('bezel', at(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 40), d.u, d.v, 0, Math.PI / 2));
    put('hub', at(new THREE.CircleGeometry(d.f * 0.09, 16), d.u, d.v, -0.0048));
    (glassBy.get(frame) ?? glassBy.set(frame, []).get(frame)).push(at(new THREE.CircleGeometry(d.f + 0.0008, 36), d.u, d.v, -0.0034));
    const mk = (len, w, layer = 0, mat = white ? CM.needleK : CM.needle) => { const m = new THREE.Mesh(needleGeo(len, w), mat); m.position.set(d.u, d.v, -0.0066 + layer * 0.0006); frame.add(m); return m; };
    const f = d.f;
    if (id === 'alt') needles.alt = [mk(f * 0.55, f * 0.11, 0), mk(f * 0.86, f * 0.07, 1)];
    else if (id === 'oil') needles.oil = [mk(f * 0.82, f * 0.08, 0), mk(f * 0.82, f * 0.08, 1)];
    else needles[id] = [mk(f * 0.86, f * 0.075)];
  };
  const frames = [];
  const frameBuild = (frame) => { const acc = {}, fine = {}; frames.push([frame, acc, fine]); return (mat, g, f = false) => ((f ? fine : acc)[mat] ||= []).push(g); };

  // ======================================================== 1 the pod
  const PD = P.pod, O = PD.out, F = PD.face;
  const pod = panelFrame(K.pod.c, K.pod.tilt);
  cockpit.add(pod);
  const putP = frameBuild(pod);
  {
    // Hood: the box behind the face reaching forward under the windshield;
    // the thick rim round the recessed face; the face plate with its holes.
    // (Its front stands back from the face plate: the compass card scrolls
    // in the gap behind the window.)
    const hd = O.d - 0.03;
    putP('hood', new RoundedBoxGeometry(O.w, O.h, hd, 3, O.r * 0.5).translate(0, 0, -0.03 - hd / 2));
    putP('hood', ringG(O.w, O.h, O.r, F.w, F.h, 0.01, F.recess).translate(0, 0, -F.recess));
    const fs = new THREE.Shape([[-F.w / 2, -F.h / 2], [F.w / 2, -F.h / 2], [F.w / 2, F.h / 2], [-F.w / 2, F.h / 2]].map(([u, v]) => new THREE.Vector2(u, v)));
    for (const d of Object.values(PD.dials)) { const h = new THREE.Path(); h.absarc(d.u, d.v, d.f + 0.0025, 0, Math.PI * 2, true); fs.holes.push(h); }
    const cw = PD.compass;
    fs.holes.push(rrect(new THREE.Path(), cw.u, cw.v, cw.w, cw.h, 0.004, true));
    putP('face', new THREE.ShapeGeometry(fs, 16).translate(0, 0, -F.recess + 0.0004));
    for (const [id, d] of Object.entries(PD.dials)) instrument(pod, putP, id, { ...d, v: d.v }, false);
    // Screws round the rim.
    for (let u = -0.17; u <= 0.171; u += 0.085) for (const v of [O.h / 2 - 0.012, -O.h / 2 + 0.012]) putP('screw', at(new THREE.CylinderGeometry(0.0028, 0.0028, 0.0016, 8), u, v, 0.0008, Math.PI / 2), true);
    // Placard over the lamp.
    putP('placard', placardUV(at(new THREE.PlaneGeometry(0.05, 0.016), PD.lamp.u, PD.lamp.v + 0.019, -F.recess + 0.001), 0));
  }
  // Compass: the card behind the window (a strip of the heading band,
  // scrolled with the heading), the lubber line.
  const SPAN = 1 / 6; // 60° of the card in the window
  CM.card.map.repeat.set(SPAN, 1);
  const card = new THREE.Mesh(new THREE.PlaneGeometry(PD.compass.w * 0.94, PD.compass.h * 0.9), CM.card);
  {
    const cw = PD.compass;
    card.position.set(cw.u, cw.v, -0.022);
    pod.add(card);
    for (const sgn of [1, -1]) {
      putP('can', at(new THREE.PlaneGeometry(0.008, cw.h), cw.u + sgn * cw.w / 2, cw.v, -0.019, 0, Math.PI / 2, 0));
      putP('can', at(new THREE.PlaneGeometry(cw.w, 0.008), cw.u, cw.v + sgn * cw.h / 2, -0.019, Math.PI / 2, 0, 0));
    }
    putP('needleR', at(new THREE.BoxGeometry(0.0016, cw.h * 0.8, 0.001), cw.u, cw.v, -F.recess - 0.003));
  }
  // FUEL WARNING lamp (push to test) and the red boost-pump switch.
  const lampMat = std(0x5a0c08, { roughness: 0.25, emissive: 0xff2210, emissiveIntensity: 0 });
  {
    const L = PD.lamp;
    const g = mergeAll([at(new THREE.CylinderGeometry(L.r, L.r, 0.005, 16), 0, 0, 0.0005, Math.PI / 2), at(new THREE.SphereGeometry(L.r, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0, 0.003, Math.PI / 2)]);
    const m = new THREE.Mesh(g, lampMat); m.position.set(L.u, L.v, -F.recess); pod.add(m);
    putP('chrome', at(new THREE.TorusGeometry(L.r + 0.0014, 0.0013, 6, 20), L.u, L.v, -F.recess + 0.0012));
    const S = PD.pump;
    putP('black', at(new RoundedBoxGeometry(S.w + 0.006, S.h + 0.006, 0.004, 1, 0.002), S.u, S.v, -F.recess + 0.002));
    putP('red', at(new RoundedBoxGeometry(S.w, S.h, 0.012, 1, 0.003), S.u, S.v, -F.recess + 0.008, 0.18));
  }
  // Boom-pressure gauge on its own bracket at the pod's left.
  const boomF = panelFrame(K.boom.c, K.boom.tilt);
  cockpit.add(boomF);
  const putBo = frameBuild(boomF);
  {
    const B = P.boom;
    // Open housing (its face is the gauge's bezel), closed at the back.
    putBo('black', at(new THREE.CylinderGeometry(B.r + 0.002, B.r + 0.002, 0.05, 28, 1, true), 0, 0, -0.026, Math.PI / 2));
    putBo('black', at(new THREE.CircleGeometry(B.r + 0.002, 28), 0, 0, -0.051, 0, Math.PI, 0));
    instrument(boomF, putBo, 'boom', { u: 0, v: 0, r: B.r, f: B.f, cell: B.cell }, true);
    putBo('black', at(new THREE.BoxGeometry(0.012, 0.06, 0.012), 0, -0.05, -0.03));
  }

  // ======================================================== 2 lower panel
  const LW = K.lower;
  const boardFrame = (side) => {
    const yaw = side * LW.yaw, half = P.left.w / 2;
    const c = [side * (LW.inner + half * Math.cos(LW.yaw)), LW.y, LW.z - half * Math.sin(LW.yaw)];
    return panelFrame(c, LW.tilt, yaw);
  };
  const lowGlass = [];
  for (const side of [1, -1]) {
    const B = side > 0 ? P.left : P.right;
    const fr = boardFrame(side);
    cockpit.add(fr);
    const put = frameBuild(fr);
    // Angular outline: the outer bottom corner cut away.
    const w = B.w, h = B.h, o = -side; // outer edge on local u = o·w/2
    const cut = 0.07;
    const outline = o > 0
      ? [[-w / 2, -h / 2], [w / 2 - cut, -h / 2], [w / 2, -h / 2 + cut], [w / 2, h / 2], [-w / 2, h / 2]]
      : [[-w / 2 + cut, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2], [-w / 2, -h / 2 + cut]];
    const shape = new THREE.Shape(outline.map(([u, v]) => new THREE.Vector2(u, v)));
    for (const d of Object.values(B.dials)) { const hh = new THREE.Path(); hh.absarc(d.u, d.v, d.f + 0.0025, 0, Math.PI * 2, true); shape.holes.push(hh); }
    put('board', new THREE.ExtrudeGeometry(shape, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1, curveSegments: 16 }).translate(0, 0, -0.008));
    // Back plate (closes the board behind the instruments' cans).
    put('hood', new THREE.ShapeGeometry(new THREE.Shape(outline.map(([u, v]) => new THREE.Vector2(u, v)))).translate(0, 0, -0.03));
    for (const [id, d] of Object.entries(B.dials)) instrument(fr, put, id, d, id === 'fuel');
    // Screws in the corners.
    for (const [u, v] of [[-w / 2 + 0.012, h / 2 - 0.012], [w / 2 - 0.012, h / 2 - 0.012], [-o * (w / 2 - 0.012), -h / 2 + 0.012]]) put('screw', at(new THREE.CylinderGeometry(0.003, 0.003, 0.002, 8), u, v, 0.002, Math.PI / 2), true);
    if (side > 0) {
      const r = B.dials.rpm;
      put('hobbs', at(new THREE.PlaneGeometry(r.f * 0.62, r.f * 0.15), r.u, r.v - r.f * 0.285, -0.0085));
      put('placard', placardUV(at(new THREE.PlaneGeometry(0.075, 0.02), -0.06, -0.075, 0.0025), 7));
    } else {
      put('placard', placardUV(at(new THREE.PlaneGeometry(0.07, 0.02), -0.06, -0.08, 0.0025), 6));
    }
    lowGlass.push(fr);
  }
  // Centre frame: top band under the pod, the two straps, the perforated
  // plate between them.
  {
    const cy = LW.y, cz = LW.z, tz = Math.sin(LW.tilt);
    const pz = (y) => cz + (y - cy) * tz; // face plane
    const bandY = (LW.top + 0.42) / 2;
    addB('board', at(new THREE.BoxGeometry(2 * LW.inner + 0.01, LW.top - 0.42, 0.02), 0, bandY, pz(bandY) - 0.01, -LW.tilt));
    for (const sx of [1, -1]) addB('board', at(new THREE.BoxGeometry(0.045, 0.42 - LW.bottom, 0.012), sx * 0.075, (0.42 + LW.bottom) / 2, pz((0.42 + LW.bottom) / 2) - 0.006, -LW.tilt));
    addB('perf', at(new THREE.PlaneGeometry(0.105, 0.17), 0, 0.31, pz(0.31) - 0.012, -LW.tilt));
    addB('board', at(new THREE.BoxGeometry(2 * LW.inner + 0.01, 0.018, 0.024), 0, LW.bottom, pz(LW.bottom) - 0.012, -LW.tilt));
    addB('placard', placardUV(at(new THREE.PlaneGeometry(0.07, 0.018), 0.11, bandY, pz(bandY) + 0.0005, -LW.tilt), 5));
  }

  // ======================================================== 3 hopper wall
  {
    const W = K.wall, half = W.half;
    const [y0, z0] = W.top, [y1, z1] = W.bottom;
    const g = new THREE.PlaneGeometry(2 * half, Math.hypot(y0 - y1, z0 - z1), 6, 6);
    const ang = Math.atan2(z1 - z0, y0 - y1); // forward lean
    g.rotateX(ang); // plane faces +z; lean the top back
    g.rotateY(Math.PI); // face the pilot (−z)
    g.translate(0, (y0 + y1) / 2, (z0 + z1) / 2);
    // UV: the scale centred, the fibreglass plain to the sides.
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, clamp((p.getX(i) + 0.17) / 0.34, 0, 1), (p.getY(i) - y1) / (y0 - y1));
    addB('hopper', g);
    // Below it the footwell's front (vertical) and the floor.
    addB('hopper', at(new THREE.PlaneGeometry(2 * half, y1 - K.floor), 0, (y1 + K.floor) / 2, z1, 0, Math.PI, 0));
    addB('floor', at(new THREE.PlaneGeometry(2 * K.wallX - 0.02, z1 - CAB.rF - 0.04), 0, K.floor, (z1 + CAB.rF + 0.04) / 2, -Math.PI / 2));
    // Coaming between the windshield's foot and the pod (the cabin's top
    // frame under the glass), seen from the seat.
    addB('black', at(new THREE.BoxGeometry(2 * (CAB.hwS - 0.02), 0.015, 0.11), 0, CAB.sill - 0.008, CAB.wsF - 0.035));
  }

  // ======================================================== 4 tube frame
  {
    const X = K.wallX - 0.02, yL = -0.3, yU = CAB.sill - 0.035;
    const zs = [-0.4, -1.1, -1.72];
    for (const sx of [1, -1]) {
      const x = sx * X;
      addB('tube', rod([x, yU, -0.36], [x, yU, -1.76], 0.016));
      addB('tube', rod([x, yL, -0.36], [x, yL, -1.76], 0.016));
      for (const z of zs) addB('tube', rod([x, yL, z], [x, yU, z], 0.014));
      addB('tube', rod([x, yL, zs[0]], [x, yU, zs[1]], 0.013));
      addB('tube', rod([x, yL, zs[1]], [x, yU, zs[2]], 0.013));
      // V from the floor's cross tube to the lower panel's corners.
      addB('tube', rod([0, yL + 0.01, -0.4], [sx * LW.inner, LW.bottom, LW.z + 0.005], 0.013));
      // Weld clusters.
      for (const z of zs) for (const y of [yL, yU]) addB('tube', ball([x, y, z], 0.022), true);
    }
    addB('tube', rod([X, yL, -0.4], [-X, yL, -0.4], 0.016));
    addB('tube', rod([X, 0.0, -0.44], [-X, 0.0, -0.44], 0.015)); // in front of the stick, under the shins
    addB('tube', rod([X, yL, -1.72], [-X, yL, -1.72], 0.016));
    addB('tube', rod([X, yU, -1.72], [-X, yU, -1.72], 0.016));
    // Painted skins between the tubes (inner walls), the rear bulkhead.
    for (const sx of [1, -1]) addB('wall', at(new THREE.PlaneGeometry(1.42, CAB.sill - K.floor), sx * K.wallX, (CAB.sill + K.floor) / 2, -1.07, 0, -sx * Math.PI / 2, 0));
    addB('wall', at(new THREE.PlaneGeometry(2 * K.wallX, CAB.sill - K.floor), 0, (CAB.sill + K.floor) / 2, CAB.rF + 0.04));
  }

  // ======================================================== 5 stick, pedals
  const stick = new THREE.Group();
  stick.position.set(...K.stick);
  {
    const L = K.stickLen;
    stick.add(new THREE.Mesh(mergeAll([
      at(new THREE.CylinderGeometry(0.035, 0.06, 0.09, 12, 1, true), 0, 0.03, 0), // boot
    ]), CM.rubber));
    stick.add(new THREE.Mesh(mergeAll([at(new THREE.CylinderGeometry(0.012, 0.014, L - 0.12, 10), 0, (L - 0.12) / 2 + 0.06, 0.012, 0.05)]), CM.chrome));
    const gripG = [];
    for (let i = 0; i < 6; i++) gripG.push(at(new THREE.TorusGeometry(0.021, 0.003, 4, 14), 0, L - 0.04 + i * 0.016, 0.022, Math.PI / 2));
    gripG.push(at(new THREE.CylinderGeometry(0.02, 0.023, 0.12, 12), 0, L, 0.022));
    stick.add(new THREE.Mesh(mergeAll(gripG), CM.grip));
    stick.add(new THREE.Mesh(mergeAll([at(new THREE.BoxGeometry(0.01, 0.022, 0.012), 0, L + 0.01, 0.046), ball([0, L + 0.066, 0.03], 0.008)]), CM.red));
  }
  cockpit.add(stick);
  addB('black', at(new THREE.BoxGeometry(0.12, 0.08, 0.16), K.stick[0], K.floor + 0.04, K.stick[2])); // torque-tube housing
  const pedals = [];
  for (const sx of [1, -1]) {
    const p = new THREE.Group();
    p.position.set(sx * K.pedals[0], K.pedals[1], K.pedals[2]);
    const tread = at(new THREE.PlaneGeometry(0.09, 0.13), 0, 0.02, 0.0, -0.35);
    tread.rotateY(Math.PI);
    p.add(new THREE.Mesh(tread, CM.tread));
    p.add(new THREE.Mesh(mergeAll([at(new THREE.BoxGeometry(0.095, 0.135, 0.008), 0, 0.02, 0.004, -0.35), rod([0, -0.04, 0.02], [0, -0.15, 0.06], 0.01)]), CM.steel));
    cockpit.add(p);
    pedals.push(p);
    addB('black', rod([sx * K.pedals[0], K.floor + 0.05, K.pedals[2] + 0.07], [sx * K.pedals[0], K.pedals[1] - 0.06, K.pedals[2] + 0.06], 0.014)); // brake cylinder
  }
  addB('tube', rod([0.3, K.floor + 0.06, K.pedals[2] + 0.07], [-0.3, K.floor + 0.06, K.pedals[2] + 0.07], 0.016)); // pedal hinge tube

  // ======================================================== 6 left / right
  // Throttle quadrant on the left wall: slotted plate, three levers.
  const T = K.throttle;
  const throttle = new THREE.Group();
  throttle.position.set(...T);
  {
    throttle.add(new THREE.Mesh(rod([0, 0, 0], [0, 0.17, 0.02], 0.006), CM.steel));
    throttle.add(new THREE.Mesh(ball([0, 0.175, 0.02], 0.022, 12), CM.black));
  }
  cockpit.add(throttle);
  addB('black', at(new THREE.BoxGeometry(0.1, 0.012, 0.32), T[0] - 0.005, T[1] + 0.1, T[2] + 0.02));
  addB('placard', placardUV(at(new THREE.PlaneGeometry(0.075, 0.02), T[0] - 0.005, T[1] + 0.107, T[2] - 0.12, -Math.PI / 2, 0, Math.PI / 2), 7));
  for (const [dx, mat] of [[-0.028, 'blue'], [0.028, 'red']]) {
    addB('steel', rod([T[0] + dx, T[1], T[2]], [T[0] + dx, T[1] + 0.16, T[2] + 0.08], 0.006));
    addB(mat, ball([T[0] + dx, T[1] + 0.165, T[2] + 0.083], 0.018, 10));
  }
  // Magneto switch (black box, rotary key) low on the left.
  const magKey = new THREE.Group();
  {
    const m = [0.3, 0.16, -0.5];
    const box = panelFrame(m, 20 * D2R, 18 * D2R);
    cockpit.add(box);
    const put = frameBuild(box);
    put('black', new THREE.BoxGeometry(0.1, 0.1, 0.05).translate(0, 0, -0.025));
    put('steel', at(new THREE.CylinderGeometry(0.03, 0.03, 0.004, 24), 0, -0.005, 0.001, Math.PI / 2));
    put('placard', placardUV(new THREE.PlaneGeometry(0.07, 0.018).translate(0, 0.036, 0.001), 1));
    magKey.add(new THREE.Mesh(mergeAll([new THREE.BoxGeometry(0.008, 0.04, 0.012).translate(0, 0.008, 0.008)]), CM.white));
    magKey.position.set(0, -0.005, 0.002);
    box.add(magKey);
  }
  // Hopper dump: the red handle on the left (the game's spray valve), its
  // red linkage across the cockpit in a V under the panel.
  const valve = new THREE.Group();
  valve.position.set(0.36, 0.2, -0.53);
  valve.add(new THREE.Mesh(mergeAll([rod([0, 0, 0], [0, 0.12, 0.02], 0.009), at(new THREE.TorusGeometry(0.03, 0.008, 6, 14), 0, 0.15, 0.025)]), CM.red));
  cockpit.add(valve);
  addB('red', rod([0.36, 0.2, -0.53], [0, 0.02, -0.46], 0.009));
  addB('red', rod([0, 0.02, -0.46], [-0.4, 0.2, -0.5], 0.009));
  addB('red', at(new THREE.BoxGeometry(0.03, 0.03, 0.02), 0, 0.02, -0.46));
  addB('placard', placardUV(at(new THREE.PlaneGeometry(0.06, 0.02), 0.36, 0.17, -0.52, 0, Math.PI, 0), 3));
  // Electrical panel on the right wall: switches, breakers, placard.
  const lit = [];
  {
    const ep = new THREE.Group();
    ep.position.set(-(K.wallX - 0.03), 0.13, -0.66);
    ep.rotation.y = Math.PI / 2; // faces the cockpit (+X)
    cockpit.add(ep);
    const put = frameBuild(ep);
    put('black', new THREE.BoxGeometry(0.24, 0.2, 0.02).translate(0, 0, -0.01));
    for (let i = 0; i < 4; i++) {
      put('steel', at(new THREE.CylinderGeometry(0.004, 0.003, 0.025, 6), -0.075 + i * 0.05, 0.04, 0.012, Math.PI / 2 - 0.4));
      put('chrome', at(new THREE.CylinderGeometry(0.008, 0.008, 0.004, 12), -0.075 + i * 0.05, 0.04, 0.002, Math.PI / 2), true);
    }
    for (let i = 0; i < 6; i++) put('white', at(new THREE.CylinderGeometry(0.006, 0.006, 0.01, 10), -0.09 + i * 0.036, -0.045, 0.005, Math.PI / 2));
    put('placard', placardUV(new THREE.PlaneGeometry(0.2, 0.022).translate(0, 0.075, 0.001), 4));
  }

  // ======================================================== 7 seat
  {
    const s = C.seat;
    addB('steel', at(new THREE.BoxGeometry(0.44, 0.02, 0.42), s[0], s[1] - 0.05, s[2] + 0.05));
    addB('seat', at(new RoundedBoxGeometry(0.42, 0.07, 0.4, 2, 0.025), s[0], s[1], s[2] + 0.05));
    addB('seat', at(new RoundedBoxGeometry(0.42, 0.6, 0.07, 2, 0.025), s[0], s[1] + 0.33, s[2] - 0.2, -0.12));
    addB('steel', at(new THREE.BoxGeometry(0.46, 0.66, 0.02), s[0], s[1] + 0.32, s[2] - 0.245, -0.12));
    for (const sx of [1, -1]) addB('tube', rod([sx * 0.2, s[1] - 0.06, s[2] + 0.2], [sx * 0.2, K.floor, s[2] + 0.2], 0.014));
    for (const sx of [1, -1]) {
      addB('harness', at(new THREE.BoxGeometry(0.045, 0.6, 0.006), sx * 0.1, s[1] + 0.32, s[2] - 0.16, -0.12));
      addB('harness', at(new THREE.BoxGeometry(0.045, 0.006, 0.22), sx * 0.15, s[1] + 0.04, s[2] + 0.14));
    }
    addB('chrome', at(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 16), 0, s[1] + 0.05, s[2] + 0.26));
  }

  // ======================================================== 8 GPS
  const G = P.gps, pickables = [];
  const gpsG = new THREE.Group();
  {
    gpsG.position.set(...K.gps);
    gpsG.lookAt(eye);
    cockpit.add(gpsG);
    const CG = {};
    const addG = (mat, g) => (CG[mat] ||= []).push(g);
    addG('gpsBody', new RoundedBoxGeometry(G.w, G.h, G.d - 0.007, 2, 0.006).translate(0, 0, -0.007 - (G.d - 0.007) / 2));
    const S = G.screen;
    const fs = rrect(new THREE.Shape(), 0, 0, G.w - 0.004, G.h - 0.004, 0.006);
    fs.holes.push(rrect(new THREE.Path(), 0, 0.009, S.w + 0.004, S.h + 0.004, 0.002, true));
    const fp = new THREE.ShapeGeometry(fs, 6);
    const uv = fp.attributes.uv, pp = fp.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pp.getX(i) + G.w / 2) / G.w, (pp.getY(i) + G.h / 2) / G.h);
    addG('gpsBezel', fp.translate(0, 0, 0.0004));
    addG('screen', new THREE.PlaneGeometry(S.w, S.h).translate(0, 0.009, -0.0036));
    const keyGeo = new RoundedBoxGeometry(0.02, 0.008, 0.005, 1, 0.0018);
    const keyMat = std(0x3a3e44, { roughness: 0.6, emissive: 0x52d8ff, emissiveIntensity: 0 });
    NAV_PAGES.forEach((pg, i) => {
      const k = new THREE.Mesh(keyGeo, keyMat.clone());
      k.position.set(G.keysU[i], G.keysV, 0.002);
      k.userData.gpsPage = pg;
      gpsG.add(k);
      pickables.push(k);
    });
    addG('black', new THREE.BoxGeometry(0.03, 0.012, 0.03).translate(0, -G.h / 2 - 0.004, -G.d / 2));
    addG('black', new THREE.BoxGeometry(0.012, 0.05, 0.012).translate(0, -G.h / 2 - 0.03, -G.d / 2 - 0.004));
    for (const [mat, list] of Object.entries(CG)) gpsG.add(new THREE.Mesh(mergeAll(list), CM[mat]));
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.h).translate(0, 0.009, -0.002), CM.glass);
    gl.renderOrder = 8; gpsG.add(gl);
  }
  // Guidance light bar on the pod's top.
  const leds = [];
  {
    const lb = new THREE.Group();
    lb.position.set(0, K.pod.c[1] + O.h / 2 * Math.cos(K.pod.tilt) + 0.012, K.pod.c[2] + 0.03);
    lb.add(new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.022, 0.035, 1, 0.006), CM.black));
    for (let i = -7; i <= 7; i++) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.011, 0.003), new THREE.MeshBasicMaterial({ color: 0x222222 }));
      led.position.set(-i * 0.012, 0.001, -0.018);
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
  for (const [frame, list] of glassBy) { const g = new THREE.Mesh(mergeAll(list), CM.glass); g.renderOrder = 8; frame.add(g); }
  void lowGlass; void lit;

  // ---------------- per frame ----------------
  const nd = { ias: 0, alt: 0, rpm: 0, mp: 29.6, oilP: 0, oilT: 20, cht: 30, fuel: 0, boom: 0, hdg: 0, key: -2.2 };
  const setN = (m, a) => { m.rotation.z = -a; };
  let nearT = 0, shown = true;
  const update = (dt, fm, ac) => {
    const g = ac?.game;
    if (!g) return;
    const inCk = g.cameraMode === 'cockpit' && g.aircraft === ac;
    const dist = g.camera ? g.camera.position.distanceTo(ac.rPos) : 0;
    const near = !inCk && dist < 9;
    const show = inCk || dist < 30;
    if (show !== shown) { shown = show; for (const c of cockpit.children) if (c !== leds[0].parent) c.visible = show; }
    if (near) { nearT -= dt; if (nearT <= 0) { nearT = 0.3; panel.draw(ac.instruments()); } }
    if (!inCk && !near) return;
    const d = panel.last;
    if (!d) return;
    const A = AGCAT_ANG, k = 9;
    const master = d.engine !== 'off';
    nd.ias = damp(nd.ias, d.ias, k, dt);
    nd.alt = damp(nd.alt, d.altFt, k, dt);
    nd.rpm = damp(nd.rpm, d.rpm, k, dt);
    nd.mp = damp(nd.mp, d.mp ?? 29.6, k, dt);
    nd.oilP = damp(nd.oilP, d.oilP ?? 0, 4, dt);
    nd.oilT = damp(nd.oilT, d.oilT ?? 20, 2, dt);
    nd.cht = damp(nd.cht, d.cht ?? 30, 2, dt);
    nd.fuel = damp(nd.fuel, master ? (d.fuel ?? 0) / 3.785 : 0, 2, dt);
    // Boom pressure: the sprayer's metered flow as a fraction of its full
    // flow, on the gauge's working pressure (no pressure model in the game).
    const full = ac.type.spray?.flow || 1;
    nd.boom = damp(nd.boom, d.spray ? BOOM_PSI * clamp((d.flow ?? 0) / full, 0, 1.2) : 0, 3, dt);
    nd.hdg += ((((d.hdg - nd.hdg) % 360) + 540) % 360 - 180) * (1 - Math.exp(-1.6 * dt));
    setN(needles.asi[0], A.asi(nd.ias));
    setN(needles.alt[0], A.alt1000(nd.alt)); setN(needles.alt[1], A.alt100(nd.alt));
    setN(needles.rpm[0], A.rpm(nd.rpm));
    setN(needles.mp[0], A.mp(nd.mp));
    setN(needles.oil[0], A.oilP(nd.oilP)); setN(needles.oil[1], A.oilT(nd.oilT));
    setN(needles.cht[0], A.cht(nd.cht));
    setN(needles.fuel[0], A.fuel(nd.fuel));
    setN(needles.boom[0], A.boom(nd.boom));
    CM.card.map.offset.x = (((1 - nd.hdg / 360 - SPAN / 2) % 1) + 1) % 1;
    // Magneto key: OFF with the engine stopped, BOTH running, START cranking.
    nd.key = damp(nd.key, d.engine === 'cranking' ? 1.4 : master ? 0.7 : -0.9, 10, dt);
    magKey.rotation.z = -nd.key;
    lampMat.emissiveIntensity = panel.lit.fuel ? 2.2 : 0;
    for (const p of pickables) p.material.emissiveIntensity = master && p.userData.gpsPage === panel.page ? 0.7 : 0;
  };
  const pick = (raycaster) => {
    const h = raycaster.intersectObjects(pickables, false)[0];
    if (!h) return null;
    panel.setPage(h.object.userData.gpsPage);
    return h.object.userData.gpsPage;
  };
  return { cockpit, stick, pedals, throttle, valve, leds, panelMesh: pod, update, pick, pickables, gps: gpsG, needles, card };
}
