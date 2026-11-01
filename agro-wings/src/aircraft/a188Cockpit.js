// Cessna A188B AgTruck cockpit, built inside the cabin of a188Model.js after
// the cabin photographs (an AgTruck's panel seen from the seat, the AG Husky
// with its door open) and the simulator cabins for the parts the photos
// hide; the layout and the textures are in a188Panel.js. One working fit:
//   - the doghouse: a black hood on top of the panel, under the windshield,
//     holding the six engine gauges in its tilted face;
//   - the black padded roll across the cabin under it, with its placards;
//   - the grey metal panel: rocker switches, knobs, the six flight and fuel
//     instruments (recessed cans: face, needles, glass, bezel, screws), the
//     breaker caps, lamps, master and magneto toggles, the starter button
//     and the red fuel valve knob;
//   - under it: the white tubular frame and its cross tube, the red spray
//     valve handle, the stick (white column, black grip with its red
//     button), tall pedals with the black-and-yellow chevron treads, the
//     dark firewall; the power quadrant on the left wall (throttle black,
//     propeller blue, mixture red) with the flap lever on the floor;
//   - the AGROWINGS NAV unit on a bracket under the right of the panel;
//   - the compass on its stand on the deck under the windshield;
//   - cream-painted inner walls and roof, the door with its triangular
//     vent window, padded black window posts, the seat with its harness;
//     the guidance lightbar on the cowl ahead of the windshield.
// Static parts are merged per material; the small hardware sits in a level
// of detail. Needles, the gyro card, the turn coordinator, lamps and toggles
// follow Aircraft.instruments() through the panel (panel.last), only while
// the camera is inside or close.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvas, canvasTexture } from '../core/textures.js';
import { clamp, lerp, rng } from '../core/math.js';
import { A188_PANEL, A188_ANG, A188_ATLAS, toGph, C2F } from './a188Panel.js';
import { NAV_PAGES } from './agroNav.js';

const P = A188_PANEL;
const TILT = (10 * Math.PI) / 180;
// Cockpit geometry (2026-11 reconstruction, on the corrected cabin): the
// whole panel stack stands 0.15 m higher and 0.075 m further aft than before,
// so that — as in the photographs — the grey panel's top is just under the
// windshield base (cowl top 0.6), the padded roll sits right below the
// glass and the doghouse rises above the line of the visible cowl from the
// pilot's eye, inside the windshield (not through it). A grey deck closes
// the gap between the windshield base and the roll.
const P0 = new THREE.Vector3(0, 0.17, -1.16); // the lower panel's bottom edge, centre
const PU = new THREE.Vector3(-1, 0, 0), PV = new THREE.Vector3(0, Math.cos(TILT), Math.sin(TILT));
const PW = new THREE.Vector3().crossVectors(PU, PV); // toward the pilot
const FLOOR = -0.6;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

function prep(g) {
  let n = g.index ? g.toNonIndexed() : g.clone();
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
  const arc = (cx, cy, a0) => { for (let i = 0; i <= 4; i++) { const a = a0 + (i / 4) * (Math.PI / 2); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  arc(x1 - r, y0 + r, -Math.PI / 2); arc(x1 - r, y1 - r, 0); arc(x0 + r, y1 - r, Math.PI / 2); arc(x0 + r, y0 + r, Math.PI);
  if (hole) pts.reverse();
  path.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) path.lineTo(x, y);
  path.closePath();
  return path;
}
function sleeve(u, v, w, h, r, depth) {
  const sh = rrect(new THREE.Shape(), u, v, w, h, r);
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 4 });
  const grp = g.groups.find((x) => x.materialIndex === 1);
  const out = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) {
    const a = g.attributes[k];
    out.setAttribute(k, new THREE.BufferAttribute(a.array.slice(grp.start * a.itemSize, (grp.start + grp.count) * a.itemSize), a.itemSize));
  }
  return out.translate(0, 0, -depth);
}
// Pedal tread: black pad, yellow chevrons (the photographs).
function chevronTex() {
  const c = canvas(128, 256), g = c.getContext('2d');
  g.fillStyle = '#121212'; g.fillRect(0, 0, 128, 256);
  g.strokeStyle = '#d9a91c'; g.lineWidth = 12;
  for (let k = 0; k < 4; k++) { const y = 60 + k * 50; g.beginPath(); g.moveTo(14, y + 36); g.lineTo(64, y); g.lineTo(114, y + 36); g.stroke(); }
  return canvasTexture(c);
}
// Worn cream paint of the inner skins.
function creamTex() {
  const c = canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#c9c1a8'; g.fillRect(0, 0, 256, 256);
  const r = rng(29);
  for (let i = 0; i < 2200; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,250' : '90,80,60'},${0.04 + r() * 0.06})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 3); }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(70,60,45,${0.03 + r() * 0.05})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 10 + r() * 50); }
  return canvasTexture(c, { repeat: true });
}

export function buildA188Cockpit(ctx) {
  const { panel, cab, envMap = null, harnessMat } = ctx;
  const { halfX, SILL, RAIL, ROOF, WS_Z, SG, BPOST, roofAt, wsBase, sillX, CABIN, aftRing, OFF, topY } = cab;
  const o3 = (x, y, z) => [x + OFF.x, y + OFF.y, z + OFF.z];
  const inset = 0.015;
  const skin = (fn, nu, nv, toward) => {
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
  };
  const cockpit = new THREE.Group();
  cockpit.name = 'a188-cockpit';

  // ---------------- materials ----------------
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, ...o });
  const cream = creamTex();
  const CM = {
    face: std(0xffffff, { map: panel.face, roughness: 0.62, metalness: 0.2, emissive: 0xffffff, emissiveMap: panel.face, emissiveIntensity: 0.06 }),
    edge: std(0x8e9394, { roughness: 0.55, metalness: 0.35 }),
    dogFace: std(0xffffff, { map: panel.dog, roughness: 0.7, metalness: 0.1 }),
    hood: std(0x1b1c1e, { roughness: 0.78, metalness: 0.05 }),
    roll: std(0xffffff, { map: panel.roll, roughness: 0.7, metalness: 0.02 }),
    bezel: std(0x141618, { roughness: 0.5, metalness: 0.3 }),
    can: std(0x0b0c0d, { roughness: 0.9, side: THREE.DoubleSide }),
    dial: std(0xffffff, { map: panel.dials, roughness: 0.45, metalness: 0.05, emissive: 0xffffff, emissiveMap: panel.dials, emissiveIntensity: 0.22 }),
    needle: std(0xf6f6f0, { roughness: 0.4, emissive: 0xf6f6f0, emissiveIntensity: 0.4 }),
    plane: std(0xf6f6f0, { roughness: 0.4, emissive: 0xf6f6f0, emissiveIntensity: 0.3 }),
    hub: std(0x0c0c0d, { roughness: 0.4, metalness: 0.4 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.09, clearcoat: 1, clearcoatRoughness: 0.05, envMap, envMapIntensity: 0.7, depthWrite: false }),
    chrome: std(0xd9dce0, { roughness: 0.18, metalness: 1, envMap, envMapIntensity: 0.9 }),
    black: std(0x1a1b1d, { roughness: 0.5, metalness: 0.15 }),
    rubber: std(0x111111, { roughness: 0.95 }),
    foam: std(0x0f0f10, { roughness: 1.0 }),
    screw: std(0x8a8f95, { roughness: 0.35, metalness: 0.85 }),
    screen: new THREE.MeshBasicMaterial({ map: panel.gps.tex, color: 0xe4e4e4 }),
    gpsBezel: std(0xffffff, { map: panel.bezel, roughness: 0.55, metalness: 0.15 }),
    gpsBody: std(0x1c1e21, { roughness: 0.55, metalness: 0.2 }),
    hobbs: new THREE.MeshBasicMaterial({ map: panel.hobbs.tex, color: 0xd0d0d0 }),
    red: std(0xd2261b, { roughness: 0.35, metalness: 0.05 }),
    orange: std(0xe0601b, { roughness: 0.4 }),
    blue: std(0x1e3f8a, { roughness: 0.4, metalness: 0.1 }),
    white: std(0xe9e9e6, { roughness: 0.42 }),
    tubes: std(0xe4e2dc, { roughness: 0.5, metalness: 0.15 }),
    cream: std(0xffffff, { map: cream, roughness: 0.85, metalness: 0.02 }),
    firewall: std(0x4a2a1e, { roughness: 0.8, metalness: 0.05 }),
    floor: std(0x3c3f42, { roughness: 0.8, metalness: 0.35 }),
    deck: std(0x5a5e5c, { roughness: 0.82, metalness: 0.12 }),
    tread: std(0xffffff, { map: chevronTex(), roughness: 0.8 }),
    pedal: std(0x2b2d30, { roughness: 0.45, metalness: 0.5 }),
    alu: std(0xb9bec3, { roughness: 0.35, metalness: 0.85 }),
    seat: std(0x1e1f21, { roughness: 0.85 }),
    harness: harnessMat ?? std(0x3a3f46, { roughness: 0.8 }),
    compass: std(0x111214, { roughness: 0.5 }),
    card: std(0xffffff, { map: panel.dials, roughness: 0.5, emissive: 0xffffff, emissiveMap: panel.dials, emissiveIntensity: 0.22 }),
  };

  const CP = {}, CB = {};
  const addP = (mat, g, fine = false) => { (CP[(fine ? 'f:' : '') + mat] ||= []).push(g); };
  const addB = (mat, g, fine = false) => { (CB[(fine ? 'f:' : '') + mat] ||= []).push(g); };
  const pan = new THREE.Group();
  pan.position.copy(P0);
  pan.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(PU, PV, PW));
  cockpit.add(pan);
  const panelZ = (v) => P0.z + v * Math.sin(TILT);
  const panelY = (v) => P0.y + v * Math.cos(TILT);
  const wallX = (z, y) => halfX(z, y) - inset;

  // ---------------- lower panel plate ----------------
  // A rectangle across the cabin with clipped top corners, inside the walls.
  {
    const hw = wallX(panelZ(0.12), panelY(0.12)) - 0.004; // wall to wall (the plate's texture edge is plain grey)
    const sh = new THREE.Shape([[-hw, 0], [hw, 0], [hw, P.h - 0.03], [hw - 0.03, P.h], [-hw + 0.03, P.h], [-hw, P.h - 0.03]].map(([u, v]) => new THREE.Vector2(u, v)));
    const circleHole = (u, v, r) => { const h = new THREE.Path(); h.absarc(u, v, r, 0, Math.PI * 2, true); sh.holes.push(h); };
    for (const d of Object.values(P.dials)) circleHole(d.u, d.v, d.f + 0.0025);
    for (const l of P.lamps) circleHole(l.u, l.v, l.r + 0.0012);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.003, bevelEnabled: false, curveSegments: 18 });
    g.translate(0, 0, -0.003);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + P.w / 2) / P.w, uv.getY(i) / P.h);
    const m = new THREE.Mesh(g, [CM.face, CM.edge]);
    m.receiveShadow = true;
    pan.add(m);
    // Return flange along the bottom edge, a dark box behind the plate.
    addP('edge', at(new THREE.BoxGeometry(2 * hw, 0.004, 0.035), 0, 0.002, -0.018));
    addP('black', at(new THREE.BoxGeometry(2 * hw - 0.02, P.h - 0.01, 0.004), 0, P.h / 2, -0.06));
  }

  // ---------------- instruments ----------------
  const cellUV = (g, cell) => {
    const uv = g.attributes.uv, cx = cell % A188_ATLAS.cols, cy = Math.floor(cell / A188_ATLAS.cols);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + uv.getX(i)) / A188_ATLAS.cols, 1 - (cy + 1 - uv.getY(i)) / A188_ATLAS.rows);
    return g;
  };
  const needles = {};
  const needleGeo = (len, w, tail = 0.22, tip = 'taper') => {
    const s = new THREE.Shape();
    s.moveTo(-w * 0.7, -len * tail);
    s.lineTo(w * 0.7, -len * tail);
    s.lineTo(w * 0.5, 0);
    if (tip === 'arrow') { s.lineTo(w * 0.45, len * 0.82); s.lineTo(w * 1.3, len * 0.82); s.lineTo(0, len); s.lineTo(-w * 1.3, len * 0.82); s.lineTo(-w * 0.45, len * 0.82); } else { s.lineTo(w * 0.22, len); s.lineTo(-w * 0.22, len); }
    s.lineTo(-w * 0.5, 0);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  };
  const glassParts = [], dogGlass = [];
  // One recessed instrument in a frame (the panel or the doghouse face).
  const instrument = (frame, id, d, put, glassList) => {
    put('dial', at(cellUV(new THREE.CircleGeometry(d.f, 56), d.cell), d.u, d.v, -0.009));
    put('can', at(new THREE.CylinderGeometry(d.f + 0.0025, d.f + 0.0025, 0.009, 40, 1, true), d.u, d.v, -0.0045, Math.PI / 2));
    const prof = [[d.r + 0.001, 0.0], [d.r, 0.0032], [d.r - 0.003, 0.0052], [d.f + 0.0018, 0.0046], [d.f + 0.0003, 0.0012], [d.f + 0.0003, -0.0015]];
    put('bezel', at(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 48), d.u, d.v, 0, Math.PI / 2));
    glassList.push(at(new THREE.CircleGeometry(d.f + 0.0008, 40), d.u, d.v, -0.0034));
    put('hub', at(new THREE.CircleGeometry(d.f * 0.09, 18), d.u, d.v, -0.0048));
    const mk = (len, w, layer = 0, tip) => { const m = new THREE.Mesh(needleGeo(len, w, 0.22, tip), CM.needle); m.position.set(d.u, d.v, -0.0066 + layer * 0.0006); frame.add(m); return m; };
    const f = d.f;
    if (id === 'alt') needles.alt = [mk(f * 0.62, f * 0.11, 0), mk(f * 0.88, f * 0.06, 1), mk(f * 0.92, f * 0.022, 2, 'arrow')];
    else if (id === 'tc') {
      // Little aeroplane (wings and fin) and the inclinometer ball.
      const pl = new THREE.Mesh(mergeAll([new THREE.BoxGeometry(f * 1.25, f * 0.07, 0.001), at(new THREE.BoxGeometry(f * 0.06, f * 0.18, 0.001), 0, f * 0.1, 0), at(new THREE.CircleGeometry(f * 0.09, 14), 0, 0, 0.0005)]), CM.plane);
      pl.position.set(d.u, d.v + f * 0.05, -0.0062);
      frame.add(pl);
      const ball = new THREE.Mesh(new THREE.CircleGeometry(f * 0.065, 16), CM.black);
      ball.position.set(d.u, d.v - f * 0.47, -0.0068);
      frame.add(ball);
      needles.tc = [pl, ball];
    } else if (id === 'dg') {
      // The card turns under a fixed lubber line and aeroplane.
      const card = new THREE.Mesh(cellUV(new THREE.CircleGeometry(f * 0.98, 56), d.cell), CM.card);
      card.position.set(d.u, d.v, -0.0085);
      frame.add(card);
      put('red', at(new THREE.BoxGeometry(f * 0.04, f * 0.2, 0.001), d.u, d.v + f * 0.86, -0.006));
      put('needle', at(mergeAll([new THREE.BoxGeometry(f * 0.5, f * 0.05, 0.001), at(new THREE.BoxGeometry(f * 0.05, f * 0.5, 0.001), 0, -0.05 * f, 0)]), d.u, d.v, -0.006));
      needles.dg = [card];
    } else needles[id] = [mk(f * 0.86, f * 0.075)];
  };
  for (const [id, d] of Object.entries(P.dials)) instrument(pan, id, d, addP, glassParts);

  // ---------------- doghouse, padded roll ----------------
  // The hood sits on the roll, its face tilted toward the pilot; the roll
  // runs across the cabin on top of the panel.
  const ROLL = { y: panelY(P.h) + 0.045, z: panelZ(P.h) - 0.03, r: 0.055 };
  {
    const len = 2 * (wallX(ROLL.z, ROLL.y) - 0.005);
    const g = new THREE.CylinderGeometry(ROLL.r, ROLL.r, len, 36, 1, false);
    // Texture: across the canvas along the roll (pilot's left to right),
    // up the canvas round its face, centred on the side the pilot sees
    // (θ ≈ 2.76 rad: toward the seat and a little up).
    const ruv = g.attributes.uv;
    for (let i = 0; i < ruv.count; i++) { const th = ruv.getX(i) * Math.PI * 2, along = ruv.getY(i); ruv.setXY(i, along, clamp(0.5 - (th - 2.76) / 2.4, 0, 1)); }
    g.rotateZ(Math.PI / 2);
    // u along the roll; the placards face the pilot (v round it).
    addB('roll', at(g, 0, ROLL.y, ROLL.z));
    for (const sx of [1, -1]) addB('hood', at(new THREE.CircleGeometry(ROLL.r, 20), sx * len / 2, ROLL.y, ROLL.z, 0, sx * Math.PI / 2, 0));
  }
  const D = P.dog;
  const dog = new THREE.Group();
  const DOG = { y: ROLL.y + ROLL.r * 0.6, z: ROLL.z - ROLL.r * 0.6, tilt: 0.22 };
  dog.position.set(0, DOG.y, DOG.z);
  dog.rotation.set(-DOG.tilt, Math.PI, 0, 'YXZ');
  cockpit.add(dog);
  const CD = {};
  const addD = (mat, g, fine = false) => { (CD[(fine ? 'f:' : '') + mat] ||= []).push(g); };
  {
    // Hood: a box rounded over the top, reaching forward under the
    // windshield (in the dog frame +z is toward the pilot).
    const depth = 0.13; // shallow enough to stay behind the windshield
    const hood = new RoundedBoxGeometry(D.w + 0.04, D.h + 0.03, depth, 3, 0.03);
    hood.translate(0, D.h / 2 + 0.006, -depth / 2 - 0.0125); // its front just behind the gauges' cans
    addD('hood', hood);
    // Face plate with a hole for every gauge (UVs over the face texture).
    const fs = new THREE.Shape([[-D.w / 2, 0], [D.w / 2, 0], [D.w / 2, D.h], [-D.w / 2, D.h]].map(([u, v]) => new THREE.Vector2(u, v)));
    for (const d of Object.values(D.dials)) { const h = new THREE.Path(); h.absarc(d.u, d.v, d.f + 0.0025, 0, Math.PI * 2, true); fs.holes.push(h); }
    const face = new THREE.ShapeGeometry(fs, 18);
    const fuv = face.attributes.uv, fp = face.attributes.position;
    for (let i = 0; i < fuv.count; i++) fuv.setXY(i, (fp.getX(i) + D.w / 2) / D.w, fp.getY(i) / D.h);
    face.translate(0, 0, 0.0005);
    addD('dogFace', face);
    for (const [id, d] of Object.entries(D.dials)) instrument(dog, id, d, addD, dogGlass);
    const r = D.dials.rpm;
    addD('hobbs', at(new THREE.PlaneGeometry(r.f * 0.6, r.f * 0.16), r.u, r.v - r.f * 0.35, -0.0085));
  }

  // ---------------- deck under the windshield ----------------
  // Grey painted shelf from the windshield's base (just under the glass)
  // back down to the top of the roll, wall to wall: it closes the cabin to
  // the hopper bay ahead (the cockpit used to look into the open fuselage
  // there) and carries the doghouse.
  {
    const yF = 0.592, zF = WS_Z - 0.03, yR = ROLL.y + ROLL.r * 0.75, zR = ROLL.z - 0.02;
    addB('deck', skin((u, v) => {
      const z = lerp(zF, zR, v), y = lerp(yF, yR, v);
      const xw = wallX(z, Math.min(y, 0.58)) - 0.002;
      return [lerp(-xw, xw, u), y, z];
    }, 12, 4, [0, 1.2, -1.6]));
    // The deck's front edge: a rubber strip against the glass.
    addB('rubber', rod([-(wallX(zF, 0.58) - 0.01), yF + 0.004, zF + 0.005], [wallX(zF, 0.58) - 0.01, yF + 0.004, zF + 0.005], 0.006, 6), true);
  }

  // ---------------- lamps, toggles, knobs, breakers ----------------
  const lamps = {};
  for (const l of P.lamps) {
    const mat = std(new THREE.Color(l.col).multiplyScalar(0.32), { roughness: 0.25, emissive: l.col, emissiveIntensity: 0 });
    const g = mergeAll([at(new THREE.CylinderGeometry(l.r, l.r, 0.005, 18), 0, 0, 0.0005, Math.PI / 2), at(new THREE.SphereGeometry(l.r, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0, 0.003, Math.PI / 2, 0, 0)]);
    const m = new THREE.Mesh(g, mat);
    m.position.set(l.u, l.v, 0);
    pan.add(m);
    lamps[l.id] = mat;
    addP('chrome', at(new THREE.TorusGeometry(l.r + 0.0012, 0.0011, 6, 22), l.u, l.v, 0.0012), true);
  }
  // Rocker switches (black), knobs (black, the cabin air one white).
  for (const u of P.rockers.us) {
    addP('black', at(new RoundedBoxGeometry(0.014, 0.026, 0.008, 2, 0.002), u, P.rockers.v, 0.004));
    addP('rubber', at(new THREE.BoxGeometry(0.01, 0.01, 0.003), u, P.rockers.v + 0.006, 0.0085));
  }
  for (const [i, k] of P.knobs.entries()) {
    addP('chrome', at(new THREE.CylinderGeometry(0.0025, 0.0025, 0.02, 10), k.u, k.v, 0.01, Math.PI / 2));
    addP(i === 1 ? 'white' : 'black', at(new THREE.CylinderGeometry(0.008, 0.009, 0.012, 16), k.u, k.v, 0.022, Math.PI / 2));
  }
  for (const v of P.breakers.vs) for (const u of P.breakers.us) addP('black', at(new THREE.CylinderGeometry(0.0045, 0.005, 0.009, 12), u, v, 0.004, Math.PI / 2), true);
  const toggles = [];
  for (const tg of P.toggles) {
    addP('chrome', at(new THREE.CylinderGeometry(0.0055, 0.0055, 0.004, 14), tg.u, tg.v, 0.002, Math.PI / 2));
    const grp = new THREE.Group();
    grp.position.set(tg.u, tg.v, 0.003);
    const lever = tg.red ? mergeAll([at(new RoundedBoxGeometry(0.012, 0.018, 0.012, 2, 0.003), 0, 0, 0.01)]) : mergeAll([at(new THREE.CylinderGeometry(0.0018, 0.0026, 0.016, 8), 0, 0, 0.008, Math.PI / 2)]);
    grp.add(new THREE.Mesh(lever, tg.red ? CM.red : CM.chrome));
    pan.add(grp);
    toggles.push([grp, tg.id === 'master' ? (d) => d.engine !== 'off' : (d) => d.engine !== 'off']);
  }
  addP('black', at(new THREE.CylinderGeometry(P.starter.r, P.starter.r * 1.1, 0.01, 18), P.starter.u, P.starter.v, 0.005, Math.PI / 2));
  addP('chrome', at(new THREE.TorusGeometry(P.starter.r * 1.15, 0.0013, 6, 20), P.starter.u, P.starter.v, 0.001));
  addP('red', at(new THREE.CylinderGeometry(P.fuelValve.r, P.fuelValve.r, 0.016, 20), P.fuelValve.u, P.fuelValve.v, 0.014, Math.PI / 2));
  addP('chrome', at(new THREE.CylinderGeometry(0.003, 0.003, 0.012, 8), P.fuelValve.u, P.fuelValve.v, 0.004, Math.PI / 2));

  // ---------------- GPS (AGROWINGS NAV) on its bracket ----------------
  const G = P.gps, pickables = [];
  {
    const front = 0.03; // stands proud of the panel plane, under it
    const body = new RoundedBoxGeometry(G.w, G.h, G.d - 0.006, 3, 0.006);
    body.translate(G.u, G.v, front - 0.006 - (G.d - 0.006) / 2);
    addP('gpsBody', body);
    addP('gpsBody', sleeve(G.u, G.v, G.w - 0.002, G.h - 0.002, 0.006, 0.0075).translate(0, 0, front + 0.0004));
    const S = G.screen;
    const fs = rrect(new THREE.Shape(), G.u, G.v, G.w - 0.004, G.h - 0.004, 0.006);
    fs.holes.push(rrect(new THREE.Path(), S.u, S.v, S.w + 0.004, S.h + 0.004, 0.002, true));
    const fp = new THREE.ShapeGeometry(fs, 6);
    const uv = fp.attributes.uv, pp = fp.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pp.getX(i) - (G.u - G.w / 2)) / G.w, (pp.getY(i) - (G.v - G.h / 2)) / G.h);
    fp.translate(0, 0, front + 0.0004);
    addP('gpsBezel', fp);
    addP('can', sleeve(S.u, S.v, S.w + 0.004, S.h + 0.004, 0.002, 0.0045).translate(0, 0, front + 0.0004));
    addP('screen', at(new THREE.PlaneGeometry(S.w, S.h), S.u, S.v, front - 0.004));
    glassParts.push(at(new THREE.PlaneGeometry(S.w, S.h), S.u, S.v, front - 0.0025));
    const keyGeo = new RoundedBoxGeometry(0.022, 0.0085, 0.005, 1, 0.0018);
    const keyMat = std(0x3a3e44, { roughness: 0.6, emissive: 0x52d8ff, emissiveIntensity: 0 });
    NAV_PAGES.forEach((pg, i) => {
      const k = new THREE.Mesh(keyGeo, keyMat.clone());
      k.position.set(G.keysU[i], G.keysV, front + 0.0022);
      k.userData.gpsPage = pg;
      pan.add(k);
      pickables.push(k);
    });
    for (const v of G.side.vs) addP('rubber', at(new THREE.CylinderGeometry(0.0042, 0.0042, 0.004, 14), G.side.u, v, front + 0.0018, Math.PI / 2));
    // Bracket: two arms back to the panel's underside.
    for (const su of [-1, 1]) addP('black', at(new THREE.BoxGeometry(0.012, 0.012, 0.05), G.u + su * 0.06, G.v + G.h / 2 + 0.006, front - 0.02));
  }

  // ---------------- under the panel ----------------
  // Dark firewall at the front of the footwell, the floor, the white tube
  // frame with its cross tube under the panel, the red spray valve handle.
  const FW = -0.86; // firewall (the hopper's rear wall) below the panel
  {
    const x1 = wallX(FW, -0.2);
    addB('firewall', at(new THREE.PlaneGeometry(2 * x1, P0.y - FLOOR + 0.02), 0, (P0.y + FLOOR) / 2, FW, 0, Math.PI, 0));
    // Closing plate from the firewall top to the panel's bottom edge.
    addB('firewall', skin((u, v) => [lerp(-x1, x1, u), lerp(P0.y, P0.y + 0.01, v), lerp(P0.z, FW, v)], 4, 1, [0, -0.3, -1.6]));
    const w = 2 * (wallX(-1.6, FLOOR + 0.02) - 0.01);
    addB('floor', at(new THREE.BoxGeometry(w, 0.008, 1.38), 0, FLOOR - 0.004, -1.55));
  }
  {
    const zt = P0.z + 0.02, yt = P0.y - 0.04;
    const xw = wallX(zt, yt) - 0.01;
    addB('tubes', rod([xw, yt, zt], [-xw, yt, zt], 0.016, 14)); // cross tube
    for (const sx of [1, -1]) {
      addB('tubes', rod([sx * xw, yt, zt], [sx * (wallX(-1.3, FLOOR + 0.05) - 0.01), FLOOR + 0.04, -1.3], 0.012, 10));
      addB('tubes', rod([sx * 0.16, yt, zt], [sx * 0.2, FLOOR + 0.02, FW + 0.05], 0.01, 10));
    }
  }
  // Spray valve handle: the red U under the panel centre (aircraft.js turns
  // it with the valve).
  const valve = new THREE.Group();
  valve.position.set(0, P0.y - 0.07, P0.z + 0.03);
  {
    const u = tubeG([[-0.05, 0, 0], [-0.05, -0.05, -0.06], [0, -0.07, -0.08], [0.05, -0.05, -0.06], [0.05, 0, 0]], 0.0075, 24, 8);
    valve.add(new THREE.Mesh(u, CM.red));
    valve.add(new THREE.Mesh(at(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 10), 0, 0, 0, 0, 0, Math.PI / 2), CM.alu));
  }
  cockpit.add(valve);

  // ---------------- stick, pedals, power quadrant ----------------
  // Stick: pivot on the floor tunnel (the shared pilot's hand is built for a
  // grip ≈ 0.64 m above it).
  const stick = new THREE.Group();
  stick.position.set(...o3(0, -0.16, -0.04));
  {
    const boot = new THREE.LatheGeometry([[0.06, 0], [0.055, 0.02], [0.04, 0.05], [0.025, 0.09], [0.017, 0.115]].map(([r, y]) => new THREE.Vector2(r, y)), 18);
    stick.add(new THREE.Mesh(boot, CM.rubber));
    stick.add(new THREE.Mesh(rod([0, 0.0, 0], [0, 0.57, 0.02], 0.0125, 14), CM.white));
    const gp = [[0.012, 0], [0.02, 0.012], [0.023, 0.04], [0.024, 0.075], [0.022, 0.1], [0.019, 0.115], [0.012, 0.128], [0, 0.132]];
    const grip = new THREE.LatheGeometry(gp.map(([r, y]) => new THREE.Vector2(r, y)), 22);
    grip.scale(1.0, 1, 1.2);
    grip.rotateX(0.16);
    grip.translate(0, 0.565, 0.02);
    stick.add(new THREE.Mesh(grip, CM.black));
    stick.add(new THREE.Mesh(at(new THREE.CylinderGeometry(0.0065, 0.0065, 0.008, 12), 0, 0.698, 0.03, -0.25), CM.red)); // spray button
    stick.add(new THREE.Mesh(at(new THREE.BoxGeometry(0.012, 0.022, 0.008), 0, 0.61, 0.048), CM.black)); // trigger
  }
  cockpit.add(stick);
  addB('black', at(new RoundedBoxGeometry(0.14, 0.1, 0.5, 2, 0.01), 0, FLOOR + 0.05, stick.position.z + 0.05));
  // Pedals: tall pads with the chevron treads (aircraft.js slides them).
  const pedals = [];
  for (const sx of [1, -1]) {
    const p = new THREE.Group();
    p.position.set(...o3(sx * 0.2, -0.12, 0.42));
    p.add(new THREE.Mesh(at(new RoundedBoxGeometry(0.09, 0.17, 0.014, 2, 0.004), 0, 0, 0, -0.38), CM.pedal));
    p.add(new THREE.Mesh(at(new THREE.PlaneGeometry(0.08, 0.15), 0, 0, -0.0085, -0.38 + Math.PI, 0, Math.PI), CM.tread));
    p.add(new THREE.Mesh(rod([0, -0.08, 0.03], [0, -0.2, 0.08], 0.011, 8), CM.pedal));
    cockpit.add(p);
    pedals.push(p);
  }
  // Power quadrant on the left wall: the box, throttle (black ball),
  // propeller (blue), mixture (red); the flap lever on the floor beside it.
  const QZ = OFF.z - 0.02;
  const xw = wallX(QZ, OFF.y + 0.42) - 0.01;
  const THR = [xw - 0.07 - OFF.x, 0.42, -0.02];
  const thrBody = o3(...THR);
  addB('black', at(new RoundedBoxGeometry(0.1, 0.08, 0.26, 2, 0.012), xw - 0.05, thrBody[1] - 0.045, QZ));
  addB('rubber', at(new THREE.BoxGeometry(0.075, 0.003, 0.2), xw - 0.05, thrBody[1] - 0.004, QZ));
  const throttle = new THREE.Group();
  throttle.position.set(...thrBody);
  throttle.add(new THREE.Mesh(rod([0, 0, 0], [0, 0.15, 0], 0.005, 8), CM.chrome));
  throttle.add(new THREE.Mesh(at(new THREE.SphereGeometry(0.021, 14, 10), 0, 0.165, 0), CM.black));
  cockpit.add(throttle);
  for (const [dx, mat, kind] of [[0.027, CM.blue, 'prop'], [0.052, CM.red, 'mix']]) {
    const lv = new THREE.Group();
    lv.position.set(thrBody[0] + dx, thrBody[1], thrBody[2]);
    lv.rotation.x = 0.35;
    lv.add(new THREE.Mesh(rod([0, 0, 0], [0, 0.13, 0], 0.004, 8), CM.chrome));
    lv.add(new THREE.Mesh(kind === 'prop' ? at(new THREE.CylinderGeometry(0.013, 0.013, 0.022, 14), 0, 0.14, 0, 0, 0, Math.PI / 2) : at(new THREE.SphereGeometry(0.016, 12, 9), 0, 0.14, 0), mat));
    cockpit.add(lv);
  }
  {
    // Flap lever (floor, left of the seat) with its black grip.
    const b = [xw - 0.13, FLOOR + 0.04, QZ - 0.25];
    addB('alu', rod(b, [b[0] + 0.01, b[1] + 0.3, b[2] + 0.08], 0.01, 8));
    addB('black', at(new THREE.CylinderGeometry(0.016, 0.016, 0.09, 12), b[0] + 0.01, b[1] + 0.33, b[2] + 0.09, 0.26));
  }

  // ---------------- seat and harness ----------------
  {
    const s = o3(0, 0.05, -0.55), bk = o3(0, 0.42, -0.73);
    addB('seat', at(new RoundedBoxGeometry(0.44, 0.09, 0.44, 3, 0.035), s[0], s[1], s[2]));
    addB('seat', at(new RoundedBoxGeometry(0.44, 0.66, 0.085, 3, 0.03), bk[0], bk[1], bk[2], -0.14));
    addB('seat', at(new RoundedBoxGeometry(0.3, 0.14, 0.1, 3, 0.04), bk[0], bk[1] + 0.27, bk[2] + 0.035, -0.2));
    for (const sx of [1, -1]) for (const dz of [-0.17, 0.17]) addB('tubes', rod([sx * 0.18, FLOOR, s[2] + dz], [sx * 0.18, s[1] - 0.05, s[2] + dz], 0.012, 8));
    const lean = -0.14;
    for (const sx of [1, -1]) {
      const top = [sx * 0.1, bk[1] + 0.3, bk[2] + 0.06 + 0.3 * Math.sin(-lean)], bot = [sx * 0.085, s[1] + 0.07, s[2] - 0.14];
      addB('harness', at(new THREE.BoxGeometry(0.045, Math.hypot(top[1] - bot[1], top[2] - bot[2]), 0.006), (top[0] + bot[0]) / 2, (top[1] + bot[1]) / 2, (top[2] + bot[2]) / 2 + 0.01, lean + 0.1));
      addB('harness', at(new THREE.BoxGeometry(0.045, 0.006, 0.2), sx * 0.15, s[1] + 0.052, s[2] + 0.05));
    }
    addB('alu', at(new THREE.CylinderGeometry(0.034, 0.034, 0.012, 20), 0, s[1] + 0.056, s[2] + 0.16));
  }

  // ---------------- cabin skins ----------------
  const inside = [0, 0.3, -1.6];
  const wall = (sx, z0, z1, y0, y1, mat, ins = inset) => addB(mat, skin((u, v) => { const z = lerp(z0, z1, u), y = lerp(y0, y1, v); return [sx * (halfX(z, y) - ins), y, z]; }, Math.max(2, Math.round((z0 - z1) * 8)), 6, inside));
  for (const sx of [1, -1]) {
    // Below the sill, from the firewall to the rear bulkhead; the A-post
    // panel above the sill ahead of the side glass.
    wall(sx, FW, ROOF.zR + 0.02, FLOOR, SILL.y, 'cream');
    wall(sx, FW, ROOF.zR + 0.02, FLOOR, FLOOR + 0.1, 'floor', inset + 0.004);
    {
      const c0 = wsBase(sx > 0 ? 0 : 1);
      const vE = (c0[1] - SILL.y) / (RAIL.y - SILL.y);
      const P00 = [WS_Z - 0.06, SILL.y], P10 = [SG.zB + 0.01, SILL.y], P01 = [c0[2] - 0.05, c0[1]], P11 = [lerp(SG.zB, SG.zT, vE) + 0.01, c0[1]];
      addB('cream', skin((u, v) => {
        const z = lerp(lerp(P00[0], P10[0], u), lerp(P01[0], P11[0], u), v), y = lerp(lerp(P00[1], P10[1], u), lerp(P01[1], P11[1], u), v);
        return [sx * (halfX(z, Math.min(y, 0.58)) - inset - 0.004), y, z];
      }, 4, 6, inside));
    }
    // Padded black posts: A-post, the side glass's front frame, B-post.
    const c0 = wsBase(sx > 0 ? 0 : 1), aTop = [sx * (RAIL.x - 0.02), RAIL.y - 0.015, ROOF.zF - 0.02];
    addB('foam', rod([c0[0] - sx * 0.02, c0[1], c0[2] - 0.03], aTop, 0.017, 10));
    addB('foam', rod([sx * (sillX(SG.zB) - 0.022), SILL.y, SG.zB - 0.01], [sx * (RAIL.x - 0.02), RAIL.y - 0.015, SG.zT - 0.01], 0.013, 10));
    addB('foam', rod([sx * (sillX(BPOST) - 0.022), SILL.y, BPOST], [sx * (RAIL.x - 0.02), RAIL.y - 0.015, BPOST], 0.015, 10));
    addB('rubber', rod([sx * (sillX(SG.zB) - 0.012), SILL.y + 0.004, SG.zB], [sx * (sillX(BPOST) - 0.012), SILL.y + 0.004, BPOST], 0.0045, 6), true);
  }
  // Door (left): handle, the "DO NOT OPEN DOORS IN FLIGHT" plate, the vent
  // window latch.
  {
    const x = halfX(-1.85, 0.3) - inset - 0.012;
    addB('chrome', rod([x, 0.3, -1.9], [x - 0.004, 0.3, -1.76], 0.007, 8));
    addB('black', at(new RoundedBoxGeometry(0.014, 0.05, 0.07, 2, 0.004), x + 0.006, 0.3, -1.93));
    addB('red', at(new THREE.BoxGeometry(0.006, 0.03, 0.012), halfX(-1.5, 0.5) - 0.03, 0.5, -1.5));
  }
  // Headliner under the roof, the rear bulkhead.
  addB('cream', skin((u, v) => { const [x, y, z] = lerp3(roofAt(u, false), roofAt(u, true), v); return [x, y - inset, z - (v === 0 ? 0.01 : 0)]; }, 14, 4, inside));
  {
    const ring = aftRing(CABIN).slice(0, -1).map(([x, y]) => new THREE.Vector2(x * 0.96, Math.max(FLOOR, y * 0.985)));
    addB('cream', new THREE.ShapeGeometry(new THREE.Shape(ring)).translate(0, 0, ROOF.zR + 0.035));
    addB('red', at(new THREE.CylinderGeometry(0.045, 0.045, 0.28, 16), -0.3, -0.25, ROOF.zR + 0.09)); // extinguisher
  }
  // Compass: on its thin stand rising from the deck just behind the glass,
  // left of centre (the AgTruck's installation; it used to hang from the
  // roof on a thick padded centre post that filled the middle of the view).
  {
    const cx = 0.13, base = [cx, 0.592, -1.0], top = [cx, 0.74, -1.2];
    addB('compass', rod(base, top, 0.005, 8));
    addB('compass', at(new THREE.CylinderGeometry(0.02, 0.024, 0.008, 14), base[0], base[1] + 0.004, base[2]));
    const cy = top[1] + 0.032, cz = top[2] - 0.02;
    addB('compass', at(new RoundedBoxGeometry(0.07, 0.055, 0.055, 2, 0.012), cx, cy, cz));
    addB('card', at(cellUV(new THREE.PlaneGeometry(0.038, 0.019), 3), cx, cy - 0.003, cz - 0.0285, 0, Math.PI, 0));
  }

  // ---------------- guidance lightbar (on the cowl) ----------------
  const leds = [];
  let lightbar = null;
  {
    const lb = (lightbar = new THREE.Group());
    lb.position.set(0, topY(-0.6) + 0.03, -0.62);
    lb.add(new THREE.Mesh(new RoundedBoxGeometry(0.27, 0.035, 0.05, 2, 0.007), CM.black));
    lb.add(new THREE.Mesh(at(new THREE.BoxGeometry(0.06, 0.02, 0.03), 0, -0.022, 0.0), CM.black));
    for (let i = -7; i <= 7; i++) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.016, 0.004), new THREE.MeshBasicMaterial({ color: 0x222222 }));
      led.position.set(-i * 0.0165, 0.001, -0.026);
      lb.add(led);
      leds.push(led);
    }
    cockpit.add(lb);
  }

  // ---------------- merge ----------------
  const glass = new THREE.Mesh(mergeAll(glassParts), CM.glass);
  glass.renderOrder = 8;
  pan.add(glass);
  const glass2 = new THREE.Mesh(mergeAll(dogGlass), CM.glass);
  glass2.renderOrder = 8;
  dog.add(glass2);
  const build = (acc, target, fineTarget) => {
    for (const [k, list] of Object.entries(acc)) {
      const isFine = k.startsWith('f:');
      const mat = CM[isFine ? k.slice(2) : k];
      const m = new THREE.Mesh(mergeAll(list), mat);
      m.receiveShadow = true;
      (isFine ? fineTarget : target).add(m);
    }
  };
  const finePan = new THREE.Group(), fine = new THREE.Group(), fineDog = new THREE.Group();
  build(CP, pan, finePan);
  build(CB, cockpit, fine);
  build(CD, dog, fineDog);
  dog.add(fineDog);
  const lod = new THREE.LOD();
  const lodPan = new THREE.Group();
  lodPan.add(finePan);
  lodPan.position.copy(pan.position); lodPan.quaternion.copy(pan.quaternion);
  lod.addLevel(new THREE.Group().add(fine, lodPan), 0);
  lod.addLevel(new THREE.Group(), 24);
  cockpit.add(lod);

  // ---------------- per frame ----------------
  const nd = { ias: 0, ft: 0, rpm: 0, mp: 29.9, ff: 0, cht: 86, oil: 86, oilP: 0, fuelP: 0, fl: 0, fr: 0, hdg: 0, turn: 0, slip: 0 };
  const setN = (m, a) => { m.rotation.z = -a; };
  let nearT = 0, shown = true;
  const update = (dt, fm, ac) => {
    const g = ac?.game;
    if (!g) return;
    const inCk = g.cameraMode === 'cockpit' && g.aircraft === ac;
    const dist = g.camera ? g.camera.position.distanceTo(ac.rPos) : 0;
    const near = !inCk && dist < 9;
    const show = inCk || dist < 30;
    if (show !== shown) { shown = show; for (const c of cockpit.children) if (c !== lightbar) c.visible = show; }
    if (near) {
      nearT -= dt;
      if (nearT <= 0) { nearT = 0.3; panel.draw(ac.instruments()); }
    }
    if (!inCk && !near) return;
    const d = panel.last;
    if (!d) return;
    const A = A188_ANG, k = 9;
    const run = d.engine === 'running';
    nd.ias = damp(nd.ias, d.ias, k, dt);
    nd.ft = damp(nd.ft, d.altFt, 6, dt);
    nd.rpm = damp(nd.rpm, d.rpm, k, dt);
    nd.mp = damp(nd.mp, d.mp ?? 29.9, k, dt);
    nd.ff = damp(nd.ff, toGph(d.fuelFlow ?? 0), 4, dt);
    nd.cht = damp(nd.cht, C2F(d.cht ?? 30), 2, dt);
    nd.oil = damp(nd.oil, C2F(d.oilT ?? 30), 2, dt);
    nd.oilP = damp(nd.oilP, d.oilP ?? 0, 4, dt);
    // Engine-driven fuel pump: pressure with the engine turning, the boost
    // pump's while cranking.
    nd.fuelP = damp(nd.fuelP, run ? 18 + 6 * clamp((d.rpm - 650) / 2200, 0, 1) : d.engine === 'cranking' ? 12 : 0, 4, dt);
    const gal = (d.fuel ?? 0) / 3.785 / 2;
    nd.fl = damp(nd.fl, d.engine === 'off' ? 0 : gal, 2, dt);
    nd.fr = nd.fl;
    nd.hdg += ((((d.hdg - nd.hdg) % 360) + 540) % 360 - 180) * (1 - Math.exp(-2.5 * dt));
    nd.turn = damp(nd.turn, ((d.yawRate ?? 0) * 180) / Math.PI, 5, dt);
    nd.slip = damp(nd.slip, clamp(-(d.slip ?? 0) * 4, -1, 1), 4, dt);
    setN(needles.asi[0], A.asi(nd.ias));
    setN(needles.alt[0], A.alt1000(nd.ft)); setN(needles.alt[1], A.alt100(nd.ft)); setN(needles.alt[2], A.alt10k(nd.ft));
    setN(needles.rpm[0], A.rpm(nd.rpm));
    setN(needles.mp[0], A.mp(nd.mp));
    setN(needles.cht[0], A.cht(nd.cht));
    setN(needles.oilT[0], A.oilT(nd.oil));
    setN(needles.oilP[0], A.oilP(nd.oilP));
    setN(needles.fuelP[0], A.fuelP(nd.fuelP));
    setN(needles.fuelL[0], A.fuel(nd.fl));
    setN(needles.fuelR[0], A.fuel(nd.fr));
    needles.tc[0].rotation.z = -A.turn(nd.turn);
    needles.tc[1].position.x = P.dials.tc.u + nd.slip * P.dials.tc.f * 0.4;
    needles.dg[0].rotation.z = (nd.hdg * Math.PI) / 180;
    void nd.ff;
    for (const [id, mat] of Object.entries(lamps)) mat.emissiveIntensity = panel.lit[id] ? 2.4 : 0;
    for (const [grp, fn] of toggles) grp.rotation.x = fn(d) ? -0.6 : 0.6;
    const master = d.engine !== 'off';
    for (const p of pickables) p.material.emissiveIntensity = master && p.userData.gpsPage === panel.page ? 0.7 : 0;
  };
  const pick = (raycaster) => {
    const h = raycaster.intersectObjects(pickables, false)[0];
    if (!h) return null;
    panel.setPage(h.object.userData.gpsPage);
    return h.object.userData.gpsPage;
  };
  // Eye: the pilot figure's eyes on this seat, leaning a little forward.
  const eye = new THREE.Vector3(...o3(0, 0.98, -0.52));
  return { cockpit, stick, pedals, throttle, valve, leds, panelMesh: pan, eye, THR, update, pick, pickables, floorY: FLOOR };
}
