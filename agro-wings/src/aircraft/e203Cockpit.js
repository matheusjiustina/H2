// EMB-203 Ipanema cockpit, built inside the corrected cabin (e203Model.js)
// after the cabin of an EMB-203 in service (PS-SBF) and the pilot's-eye
// views of Ipanemas at work; the layout and the textures are in
// e203Panel.js. One coherent fit:
//   - a black padded glareshield: a leather bullnose following the
//     windshield base across the cabin, thinning into trim strips down the
//     side walls;
//   - the light-grey panel under it, tilted back 8°, a 3 mm plate cut out
//     for every instrument, window and unit, on the cabin walls;
//   - round instruments recessed in their cans: dial face, needles, hub,
//     glass, bezel ring and the four flange screws;
//   - the two windows into the hopper with their sleeves, the yellow
//     fibreglass wall behind them and the hopper's lower part between the
//     pilot's legs, both with the litre scale and the live product level;
//   - the AGROWINGS NAV unit (agroNav.js, the game's own GPS) set into the
//     panel's right side: housing, recessed screen, the four page keys;
//   - the panel-mounted wet compass, the magneto key, lamps, toggle
//     switches, breakers, the trim indicator, the chronometer and the fuel
//     totalizer;
//   - below: the stick on its torque-tube box (white column, black grip
//     with the trim hat), floor pedals with toe brakes, the power quadrant
//     on the left wall (throttle, propeller, mixture), the spray valve and
//     the fuel shut-off on the right; tread-plate floor;
//   - the high-backed leather seat with its four-point harness; the inner
//     skins of the walls, door, rear bulkhead and roof; covered A- and
//     B-posts with their rubber seals; the yellow grab handles; the
//     guidance lightbar on the cowl ahead of the windshield.
// Static parts are merged per material (panel frame and body frame); the
// small hardware sits in a level of detail. Needles, lamps, switches, the
// key, the compass card and the GPS keys follow Aircraft.instruments()
// through the panel (panel.last), only while the camera is inside or close.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvas, canvasTexture } from '../core/textures.js';
import { clamp, lerp, rng } from '../core/math.js';
import { E203_PANEL, E203_ANG, HOPPER_WALL, HOPPER_SLOT, KEY_POS, toGph, C2F } from './e203Panel.js';
import { NAV_PAGES } from './agroNav.js';

const P = E203_PANEL;
const TILT = (8 * Math.PI) / 180;
const P0 = new THREE.Vector3(0, 0.22, -0.79); // panel's bottom edge, centre
const PU = new THREE.Vector3(-1, 0, 0), PV = new THREE.Vector3(0, Math.cos(TILT), Math.sin(TILT));
const PW = new THREE.Vector3().crossVectors(PU, PV); // toward the pilot
const panelV = (y) => (y - P0.y) / Math.cos(TILT);
const panelZ = (v) => P0.z + v * Math.sin(TILT);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const FLOOR = -0.48;

// Geometry helpers: everything merged must carry position, normal and uv.
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
// Rounded rectangle path (centre u, v; size w, h; corner r).
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
// Open sleeve (the side walls of an extruded rounded rectangle).
function sleeve(u, v, w, h, r, depth) {
  const sh = rrect(new THREE.Shape(), u, v, w, h, r);
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 4 });
  // Keep the walls only (group 1; the geometry is not indexed).
  const grp = g.groups.find((x) => x.materialIndex === 1);
  const out = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) {
    const a = g.attributes[k];
    out.setAttribute(k, new THREE.BufferAttribute(a.array.slice(grp.start * a.itemSize, (grp.start + grp.count) * a.itemSize), a.itemSize));
  }
  return out.translate(0, 0, -depth);
}
// Diamond tread plate (bump) for the floor.
function treadBump() {
  const c = canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, 256, 256);
  const r = rng(9);
  for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.05})`; g.fillRect(r() * 256, r() * 256, 2, 2); }
  g.fillStyle = '#d6d6d6';
  for (let y = 0; y < 256; y += 32) for (let x = 0; x < 256; x += 32) {
    const o = (y / 32) % 2 ? 16 : 0;
    g.save(); g.translate(x + o + 8, y + 8); g.rotate(((y / 32) % 2 ? 1 : -1) * 0.7);
    g.fillRect(-9, -2, 18, 4); g.restore();
  }
  return canvasTexture(c, { srgb: false, repeat: true, aniso: 4 });
}

export function buildE203Cockpit(ctx) {
  const { panel, cab, envMap = null, harnessMat } = ctx;
  const { halfX, SILL, RAIL, ROOF, WS_ZS, BPOST, roofAt, sideAt, wsZ, deckPt, RIM_A, sillX, CABIN, aftRing, DW, OFF } = cab;
  const o3 = (x, y, z) => [x + OFF.x, y + OFF.y, z + OFF.z];
  const inset = 0.014; // cabin skins inside the hull
  // Grid surface fn(u, v) facing the given point (the cabin's inside).
  const skin = (fn, nu, nv, toward) => {
    const pos = [], idx = [], uv = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { pos.push(...fn(i / nu, j / nv)); uv.push(i / nu, j / nv); }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // Face the given point (the cabin's inside).
    const n = g.attributes.normal, m = Math.floor(n.count / 2), pp = g.attributes.position;
    const dx = toward[0] - pp.getX(m), dy = toward[1] - pp.getY(m), dz = toward[2] - pp.getZ(m);
    if (n.getX(m) * dx + n.getY(m) * dy + n.getZ(m) * dz < 0) { const ia = g.index.array; for (let i = 0; i < ia.length; i += 3) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; } g.computeVertexNormals(); }
    return g;
  };
  const cockpit = new THREE.Group();
  cockpit.name = 'e203-cockpit';

  // ---------------- materials ----------------
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, ...o });
  const CM = {
    face: std(0xffffff, { map: panel.face, roughness: 0.6, metalness: 0.22, emissive: 0xffffff, emissiveMap: panel.face, emissiveIntensity: 0.07 }),
    edge: std(0xa3a8ac, { roughness: 0.55, metalness: 0.35 }),
    leather: std(0x161618, { roughness: 0.82, metalness: 0.02, bumpMap: panel.leather, bumpScale: 0.7 }),
    bezel: std(0x141618, { roughness: 0.5, metalness: 0.3 }),
    can: std(0x0b0c0d, { roughness: 0.9, side: THREE.DoubleSide }),
    dial: std(0xffffff, { map: panel.dials, roughness: 0.45, metalness: 0.05, emissive: 0xffffff, emissiveMap: panel.dials, emissiveIntensity: 0.22 }),
    needle: std(0xf6f6f0, { roughness: 0.4, emissive: 0xf6f6f0, emissiveIntensity: 0.4 }),
    needleOr: std(0xffb24a, { roughness: 0.4, emissive: 0xffb24a, emissiveIntensity: 0.35 }),
    hub: std(0x0c0c0d, { roughness: 0.4, metalness: 0.4 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.09, clearcoat: 1, clearcoatRoughness: 0.05, envMap, envMapIntensity: 0.7, depthWrite: false }),
    chrome: std(0xd9dce0, { roughness: 0.18, metalness: 1, envMap, envMapIntensity: 0.9 }),
    black: std(0x1a1b1d, { roughness: 0.5, metalness: 0.15 }),
    rubber: std(0x111111, { roughness: 0.95 }),
    screw: std(0x8a8f95, { roughness: 0.35, metalness: 0.85 }),
    screen: new THREE.MeshBasicMaterial({ map: panel.gps.tex, color: 0xe4e4e4 }),
    gpsBezel: std(0xffffff, { map: panel.bezel, roughness: 0.55, metalness: 0.15 }),
    gpsBody: std(0x1c1e21, { roughness: 0.55, metalness: 0.2 }),
    lcdChrono: new THREE.MeshBasicMaterial({ map: panel.chrono.tex, color: 0xdedede }),
    lcdFuel: new THREE.MeshBasicMaterial({ map: panel.fuel.tex }),
    hobbs: new THREE.MeshBasicMaterial({ map: panel.hobbs.tex, color: 0xd0d0d0 }),
    trim: std(0xffffff, { map: panel.trim, roughness: 0.5, emissive: 0xffffff, emissiveMap: panel.trim, emissiveIntensity: 0.15 }),
    card: std(0xffffff, { map: panel.card, roughness: 0.5, emissive: 0xffffff, emissiveMap: panel.card, emissiveIntensity: 0.25, side: THREE.DoubleSide }),
    red: std(0xd2261b, { roughness: 0.35, metalness: 0.05 }),
    blue: std(0x1e3f8a, { roughness: 0.4, metalness: 0.1 }),
    yellow: std(0xf0c020, { roughness: 0.5 }),
    hopper: std(0xffffff, { map: panel.hopper.tex, roughness: 0.7, emissive: 0xffffff, emissiveMap: panel.hopper.tex, emissiveIntensity: 0.38 }),
    fg: std(0xe9b922, { roughness: 0.7, emissive: 0x4a3606, emissiveIntensity: 0.5 }),
    trimGrey: std(0x737980, { roughness: 0.85, metalness: 0.05 }),
    door: std(0x676d74, { roughness: 0.82, metalness: 0.05 }),
    post: std(0x34383c, { roughness: 0.75, metalness: 0.1 }),
    kick: std(0x2c2f33, { roughness: 0.9 }),
    headliner: std(0x989da2, { roughness: 0.95 }),
    pedal: std(0x2b2d30, { roughness: 0.45, metalness: 0.5 }),
    floor: std(0x858a90, { roughness: 0.5, metalness: 0.6, bumpMap: treadBump(), bumpScale: 1.2 }),
    alu: std(0xb9bec3, { roughness: 0.35, metalness: 0.85 }),
    white: std(0xe9e9e6, { roughness: 0.42 }),
    seat: new THREE.MeshPhysicalMaterial({ color: 0x5b3a22, roughness: 0.58, clearcoat: 0.18, clearcoatRoughness: 0.5, bumpMap: panel.leather, bumpScale: 0.35 }),
    seatDark: std(0x2b211a, { roughness: 0.7 }),
    harness: harnessMat ?? std(0x2d3a52, { roughness: 0.8 }),
    invisible: new THREE.MeshBasicMaterial({ visible: false }),
  };
  for (const m of [CM.leather, CM.seat]) { m.bumpMap = panel.leather; }

  // Accumulators: panel frame (CP) and body frame (CB); 'f:' = fine LOD.
  const CP = {}, CB = {};
  const addP = (mat, g, fine = false) => { (CP[(fine ? 'f:' : '') + mat] ||= []).push(g); };
  const addB = (mat, g, fine = false) => { (CB[(fine ? 'f:' : '') + mat] ||= []).push(g); };
  const pan = new THREE.Group();
  pan.position.copy(P0);
  pan.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(PU, PV, PW));
  cockpit.add(pan);
  const fine = new THREE.Group(), finePan = new THREE.Group();
  pan.add(finePan);

  // ---------------- glareshield ----------------
  // Path: the windshield base (deck section) from one side wall over the top
  // to the other; profile across it: from under the windshield aft along the
  // top to the bullnose and back under to the panel's top edge. Thickness
  // (inward from the skin) fades at the side walls into a narrow trim strip.
  const aEnd = RIM_A - (12 * Math.PI) / 180;
  const NA = 56;
  const thick = (a) => { const s = Math.min(a, Math.PI - a); return 0.014 + 0.046 * clamp((s - aEnd) / (RIM_A + 0.32 - aEnd), 0, 1) ** 0.8; };
  const archPt = (a) => { const [x, y] = deckPt(a); const e = 1e-3; const [x1, y1] = deckPt(a - e), [x2, y2] = deckPt(a + e); let nx = -(y2 - y1), ny = x2 - x1; const l = Math.hypot(nx, ny); nx /= l; ny /= l; if (nx * x + ny * (y - 0.25) > 0) { nx = -nx; ny = -ny; } return { x, y, nx, ny }; };
  const lipOf = (a) => { const p = archPt(a), h = thick(a); return { x: p.x + p.nx * h, y: p.y + p.ny * h }; };
  {
    const rows = [], uvs = [];
    let L = 0, prev = null;
    for (let i = 0; i <= NA; i++) {
      const a = aEnd + (i / NA) * (Math.PI - 2 * aEnd);
      const p = archPt(a), h = thick(a), rb = (h - 0.004) / 2, hc = 0.004 + rb;
      const zws = wsZ(Math.max(p.y, SILL.y));
      const lip = lipOf(a), zp = panelZ(panelV(lip.y));
      const zl = zp - 0.012 - 0.6 * rb;
      const prof = [[-0.002, zws + 0.012], [0.002, zws - 0.012]];
      for (let t = 1; t <= 3; t++) prof.push([0.004, lerp(zws - 0.012, zl + rb, t / 3)]);
      for (let k = 1; k <= 8; k++) { const ph = (k / 8) * Math.PI; prof.push([hc - rb * Math.cos(ph), zl + rb - rb * Math.sin(ph)]); }
      prof.push([hc + rb, zp + 0.003], [hc + rb - 0.004, zp + 0.012]);
      const pts = prof.map(([hh, z]) => [p.x + p.nx * hh, p.y + p.ny * hh, z]);
      if (prev) L += Math.hypot(p.x - prev.x, p.y - prev.y);
      prev = p;
      rows.push(pts);
      uvs.push(L / 0.3);
    }
    const n = rows[0].length, pos = [], uv = [], idx = [];
    rows.forEach((r, i) => r.forEach((pp, k) => { pos.push(...pp); uv.push(uvs[i], k / (n - 1)); }));
    for (let i = 0; i < rows.length - 1; i++) for (let k = 0; k < n - 1; k++) {
      const a = i * n + k, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    // End caps.
    for (const [ri, flip] of [[0, false], [rows.length - 1, true]]) {
      const base = pos.length / 3, r = rows[ri];
      const cx = r.reduce((s, p) => s + p[0], 0) / n, cy = r.reduce((s, p) => s + p[1], 0) / n, cz = r.reduce((s, p) => s + p[2], 0) / n;
      pos.push(cx, cy, cz); uv.push(0, 0);
      for (let k = 0; k < n - 1; k++) idx.push(...(flip ? [base, ri * n + k + 1, ri * n + k] : [base, ri * n + k, ri * n + k + 1]));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    addB('leather', g);
  }

  // ---------------- panel plate ----------------
  // Outline (u, v): the cabin wall from the bottom edge up, then the
  // glareshield's underside across, down the other wall.
  const outline = [];
  {
    const zp = P0.z;
    const wallU = (y) => halfX(zp, y) - 0.012;
    const lipA = (a) => { const l = lipOf(a); return [-l.x, panelV(l.y)]; };
    const lipStart = lipOf(aEnd);
    for (let i = 0; i <= 6; i++) { const y = lerp(P0.y, lipStart.y, i / 6); outline.push([-wallU(y), panelV(y)]); }
    for (let i = 1; i < NA; i++) outline.push(lipA(aEnd + (i / NA) * (Math.PI - 2 * aEnd)));
    for (let i = 6; i >= 0; i--) { const y = lerp(P0.y, lipStart.y, i / 6); outline.push([wallU(y), panelV(y)]); }
  }
  const shape = new THREE.Shape(outline.map(([u, v]) => new THREE.Vector2(u, v)));
  const circleHole = (u, v, r) => { const h = new THREE.Path(); h.absarc(u, v, r, 0, Math.PI * 2, true); shape.holes.push(h); };
  for (const d of Object.values(P.dials)) circleHole(d.u, d.v, d.f + 0.0025);
  for (const l of P.lamps) circleHole(l.u, l.v, l.r + 0.0012);
  circleHole(P.key.u, P.key.v, P.key.r);
  for (const [u, v, r] of P.blanks) circleHole(u, v, r - 0.002);
  for (const [u, v, r] of P.vents) circleHole(u, v, r - 0.002);
  const hRect = (o, pad = 0) => shape.holes.push(rrect(new THREE.Path(), o.u, o.v, o.w - pad, o.h - pad, Math.min(o.r ?? 0.003, (o.h - pad) / 2.2), true));
  hRect(P.hopperWin); hRect(P.hopperLow);
  hRect({ ...P.gps, r: 0.006 }, 0.012);
  hRect({ ...P.compass, r: 0.005 }, 0.008);
  hRect({ ...P.totalizer, r: 0.003 }, 0.006);
  hRect({ ...P.trim, r: 0.002 }, 0.004);
  {
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.003, bevelEnabled: false, curveSegments: 20 });
    g.translate(0, 0, -0.003);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + P.w / 2) / P.w, uv.getY(i) / P.h);
    const m = new THREE.Mesh(g, [CM.face, CM.edge]);
    m.receiveShadow = true;
    pan.add(m);
  }
  // Return flange along the bottom edge and a dark backing far behind the
  // plate (closes the view between the units).
  // Return flange along the bottom edge. (Every cut-out is filled by its
  // unit, so nothing behind the plate shows.)
  addP('edge', at(new THREE.BoxGeometry(2 * (halfX(P0.z, P0.y) - 0.012), 0.004, 0.03), 0, 0.002, -0.015));

  // ---------------- instruments ----------------
  const cellUV = (g, cell) => {
    const uv = g.attributes.uv, cx = cell % 4, cy = Math.floor(cell / 4);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + uv.getX(i)) / 4, 1 - (cy + 1 - uv.getY(i)) / 2);
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
  const mkNeedle = (d, len, w, mat = CM.needle, layer = 0, tip) => {
    const m = new THREE.Mesh(needleGeo(len, w, 0.22, tip), mat);
    m.position.set(d.u, d.v, -0.0066 + layer * 0.0006);
    pan.add(m);
    return m;
  };
  const glassParts = [];
  for (const [id, d] of Object.entries(P.dials)) {
    addP('dial', at(cellUV(new THREE.CircleGeometry(d.f, 64), d.cell), d.u, d.v, -0.009));
    addP('can', at(new THREE.CylinderGeometry(d.f + 0.0025, d.f + 0.0025, 0.009, 48, 1, true), d.u, d.v, -0.0045, Math.PI / 2));
    const prof = [[d.r + 0.001, 0.0], [d.r, 0.0032], [d.r - 0.003, 0.0052], [d.f + 0.0018, 0.0046], [d.f + 0.0003, 0.0012], [d.f + 0.0003, -0.0015]];
    addP('bezel', at(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 56), d.u, d.v, 0, Math.PI / 2));
    glassParts.push(at(new THREE.CircleGeometry(d.f + 0.0008, 48), d.u, d.v, -0.0034));
    addP('hub', at(new THREE.CircleGeometry(d.f * 0.09, 20), d.u, d.v, -0.0048));
    const k = d.r * 0.98;
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) addP('screw', at(new THREE.SphereGeometry(d.r > 0.035 ? 0.0028 : 0.0022, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), d.u + sx * k, d.v + sy * k, 0, Math.PI / 2), true);
    const f = d.f;
    if (id === 'alt') needles.alt = [mkNeedle(d, f * 0.62, f * 0.11, CM.needle, 0), mkNeedle(d, f * 0.88, f * 0.06, CM.needle, 1), mkNeedle(d, f * 0.92, f * 0.022, CM.needle, 2, 'arrow')];
    else if (id === 'mpff') needles.mpff = [mkNeedle(d, f * 0.84, f * 0.07), mkNeedle(d, f * 0.84, f * 0.07, CM.needle, 1)];
    else if (id === 'cht') needles.cht = [mkNeedle(d, f * 0.84, f * 0.07), mkNeedle(d, f * 0.84, f * 0.07, CM.needle, 1)];
    else if (id === 'accel') needles.accel = [mkNeedle(d, f * 0.82, f * 0.05, CM.needleOr, 0), mkNeedle(d, f * 0.82, f * 0.05, CM.needleOr, 1), mkNeedle(d, f * 0.86, f * 0.08, CM.needle, 2)];
    else if (id !== 'chrono') needles[id] = [mkNeedle(d, f * 0.86, f * 0.075)];
  }
  // Chronometer LCD over its face; hour meter in the tachometer.
  {
    const d = P.dials.chrono;
    addP('lcdChrono', at(new THREE.PlaneGeometry(d.f * 1.18, d.f * 0.48), d.u, d.v + d.f * 0.04, -0.0085));
    for (const sx of [-1, 1]) addP('black', at(new THREE.CylinderGeometry(0.0028, 0.003, 0.004, 12), d.u + sx * d.f * 0.5, d.v - d.r * 0.82, 0.002, Math.PI / 2), true);
    const r = P.dials.rpm;
    addP('hobbs', at(new THREE.PlaneGeometry(r.f * 0.6, r.f * 0.16), r.u, r.v - r.f * 0.35, -0.0085));
  }

  // ---------------- lamps, key, switches, breakers ----------------
  const lamps = {};
  for (const l of P.lamps) {
    const mat = std(new THREE.Color(l.col).multiplyScalar(0.32), { roughness: 0.25, emissive: l.col, emissiveIntensity: 0 });
    const g = mergeAll([at(new THREE.CylinderGeometry(l.r, l.r, 0.005, 20), 0, 0, 0.0005, Math.PI / 2), at(new THREE.SphereGeometry(l.r, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0, 0.003, Math.PI / 2, 0, 0)]);
    g.scale(1, 1, 1);
    const m = new THREE.Mesh(g, mat);
    m.position.set(l.u, l.v, 0);
    pan.add(m);
    lamps[l.id] = mat;
    addP('chrome', at(new THREE.TorusGeometry(l.r + 0.0012, 0.0011, 6, 24), l.u, l.v, 0.0012), true);
  }
  // Magneto key: housing, ring, the key itself (turns with the engine).
  addP('black', at(new THREE.CylinderGeometry(P.key.r, P.key.r, 0.005, 28), P.key.u, P.key.v, 0.0005, Math.PI / 2));
  addP('chrome', at(new THREE.TorusGeometry(P.key.r * 0.62, 0.0012, 6, 24), P.key.u, P.key.v, 0.0034), true);
  const key = new THREE.Group();
  key.position.set(P.key.u, P.key.v, 0.004);
  key.add(new THREE.Mesh(mergeAll([new THREE.BoxGeometry(0.0045, 0.016, 0.0016), at(new THREE.CylinderGeometry(0.006, 0.006, 0.0022, 18), 0, 0.011, 0, Math.PI / 2)]), CM.chrome));
  pan.add(key);
  // Toggle switches: nut and bat handle; the live ones turn with the state.
  const toggles = [];
  const toggle = (u, v, live) => {
    addP('chrome', at(new THREE.CylinderGeometry(0.0045, 0.0045, 0.0035, 6), u, v, 0.0018, Math.PI / 2), true);
    const g = new THREE.Group();
    g.position.set(u, v, 0.0035);
    const lev = new THREE.Mesh(new THREE.CylinderGeometry(0.0021, 0.0012, 0.013, 8).translate(0, 0.0065, 0).rotateX(Math.PI / 2), CM.chrome);
    g.add(lev);
    g.rotation.x = 0.6; // handle down (off); -0.6 up (on)
    finePan.add(g);
    if (live) toggles.push([g, live]);
  };
  const ST = { master: (d) => d.engine !== 'off', run: (d) => d.engine === 'running', pump: (d) => d.engine === 'cranking' || (d.engine === 'running' && d.onGround) };
  P.block.us.forEach((u, i) => { toggle(u, P.block.vSw, [ST.master, ST.run, ST.pump, null][i]); addP('black', at(new THREE.CylinderGeometry(0.0072, 0.0072, 0.005, 18), u, P.block.vCap, 0.0025, Math.PI / 2), true); });
  P.row.us.forEach((u, i) => toggle(u, P.row.v, [ST.master, ST.master, ST.master, null, null, null][i]));
  toggle(P.testSw.u, P.testSw.v, null);
  for (const u of P.breakers.us) {
    addP('black', at(new THREE.CylinderGeometry(0.0042, 0.0042, 0.006, 14), u, P.breakers.v, 0.003, Math.PI / 2), true);
    addP('white', at(new THREE.TorusGeometry(0.0046, 0.0006, 4, 16), u, P.breakers.v, 0.0012), true);
  }
  for (const [u, v] of P.pushes) addP('black', at(new THREE.CylinderGeometry(0.0068, 0.0072, 0.005, 18), u, v, 0.0025, Math.PI / 2), true);
  for (const [u, v, r] of P.blanks) {
    addP('edge', at(new THREE.CircleGeometry(r, 28), u, v, 0.0006));
    for (const sx of [-1, 1]) addP('screw', at(new THREE.SphereGeometry(0.0018, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), u + sx * r * 0.72, v, 0.0006, Math.PI / 2), true);
  }
  // Eyeball vents.
  for (const [u, v, r] of P.vents) {
    addP('black', at(new THREE.TorusGeometry(r - 0.002, 0.0028, 8, 28), u, v, 0.002));
    const ball = at(new THREE.SphereGeometry(r - 0.004, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), u, v, -0.004, Math.PI / 2 - 0.25, 0, 0);
    addP('black', ball);
    for (let k = -2; k <= 2; k++) addP('rubber', at(new THREE.BoxGeometry((r - 0.006) * 1.6, 0.0012, 0.004), u, v + k * 0.0042, 0.003, -0.25), true);
  }

  // ---------------- compass, trim, totalizer ----------------
  const C = P.compass;
  const cardDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 48, 1, true), CM.card);
  {
    // Housing: walls and back, the front plate with the window, the card
    // drum inside behind the window, the lubber line.
    const front = 0.034;
    addP('black', sleeve(C.u, C.v, C.w, C.h, 0.006, front + 0.01).translate(0, 0, front));
    addP('black', at(new THREE.PlaneGeometry(C.w, C.h), C.u, C.v, -0.0098));
    const fs = rrect(new THREE.Shape(), C.u, C.v, C.w, C.h, 0.006);
    fs.holes.push(rrect(new THREE.Path(), C.u, C.v + 0.007, C.win[0], C.win[1], 0.004, true));
    addP('black', new THREE.ShapeGeometry(fs, 6).translate(0, 0, front + 0.0002));
    addP('black', at(new THREE.BoxGeometry(0.03, 0.012, 0.01), C.u, C.v - C.h / 2 - 0.004, 0.004));
    cardDrum.position.set(C.u, C.v + 0.007, front - 0.0175);
    pan.add(cardDrum);
    addP('red', at(new THREE.BoxGeometry(0.0011, 0.015, 0.0008), C.u, C.v + 0.007, front - 0.0012));
    glassParts.push(at(new THREE.PlaneGeometry(C.win[0], C.win[1]), C.u, C.v + 0.007, front - 0.0008));
  }
  const T = P.trim;
  addP('black', at(new RoundedBoxGeometry(T.w, T.h, 0.012, 2, 0.003), T.u, T.v, 0.0));
  addP('trim', at(new THREE.PlaneGeometry(T.w * 0.92, T.h * 0.8), T.u, T.v, 0.0062));
  const trimPtr = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0.0045), new THREE.Vector2(-0.0028, -0.004), new THREE.Vector2(0.0028, -0.004)])), CM.red);
  trimPtr.position.set(T.u, T.v - 0.002, 0.0066);
  pan.add(trimPtr);
  const F = P.totalizer;
  addP('black', at(new RoundedBoxGeometry(F.w, F.h, 0.03, 2, 0.004), F.u, F.v, -0.004));
  addP('lcdFuel', at(new THREE.PlaneGeometry(F.w * 0.62, F.h * 0.62), F.u + F.w * 0.12, F.v, 0.0112));
  for (const k of [0, 1]) addP('rubber', at(new THREE.CylinderGeometry(0.003, 0.003, 0.004, 12), F.u - F.w * 0.34, F.v + (k ? 0.006 : -0.006), 0.012, Math.PI / 2), true);

  // ---------------- hopper windows and wall ----------------
  const HZ = -0.7; // wall plane (body z)
  for (const Wn of [P.hopperWin, P.hopperLow]) {
    const depth = (HZ - panelZ(Wn.v)) / Math.cos(TILT) + 0.01;
    addP('can', sleeve(Wn.u, Wn.v, Wn.w, Wn.h, Wn.r, Math.max(0.02, depth)));
    addP('edge', at(new THREE.ShapeGeometry(Object.assign(rrect(new THREE.Shape(), Wn.u, Wn.v, Wn.w + 0.008, Wn.h + 0.008, Wn.r + 0.003), { holes: [rrect(new THREE.Path(), Wn.u, Wn.v, Wn.w, Wn.h, Wn.r, true)] }), 6), 0, 0, 0.0008));
    glassParts.push(at(new THREE.PlaneGeometry(Wn.w, Wn.h), Wn.u, Wn.v, -0.001));
  }
  {
    const HW = HOPPER_WALL, X0 = 0.32;
    const cu = (x) => (X0 - x) / (2 * X0), rowV = (row) => 1 - row / HW.H;
    const plane = (x0, x1, y0, y1, z, r0, r1) => {
      const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0);
      g.rotateY(Math.PI);
      g.translate((x0 + x1) / 2, (y0 + y1) / 2, z);
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); uv.setXY(i, cu(p.getX(i)), lerp(rowV(r1), rowV(r0), (y - y0) / (y1 - y0))); }
      return g;
    };
    addB('hopper', plane(-0.2, 0.2, HW.top[0], 0.585, HZ, 0, HW.split));
    // Lower part between the legs: its aft face with the low scale, sides.
    addB('hopper', plane(-0.15, 0.15, FLOOR, 0.2, -0.84, HW.split + (1 - (0.2 - HW.low[0]) / (HW.low[1] - HW.low[0])) * (HW.H - HW.split), HW.H));
    for (const sx of [1, -1]) addB('fg', at(new THREE.PlaneGeometry(0.24, 0.68), sx * 0.15, (FLOOR + 0.2) / 2, -0.72, 0, sx * Math.PI / 2, 0));
    // The sight slot's aluminium frame, standing proud of the lower face.
    const SL = HOPPER_SLOT, hw = (SL.w / 2 + 5) / 800, rr = hw, pts = [];
    for (let i = 0; i <= 12; i++) { const a = Math.PI + (i / 12) * Math.PI; pts.push([Math.cos(a) * rr, SL.y0 + rr + Math.sin(a) * rr]); }
    for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI; pts.push([Math.cos(a) * rr, SL.y1 - rr + Math.sin(a) * rr]); }
    const path = new THREE.CurvePath();
    for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; path.add(new THREE.LineCurve3(new THREE.Vector3(x0, y0, -0.8435), new THREE.Vector3(x1, y1, -0.8435))); }
    addB('alu', new THREE.TubeGeometry(path, 52, 0.0035, 6, true));
  }

  // ---------------- GPS (AGROWINGS NAV) ----------------
  const G = P.gps, pickables = [];
  {
    const front = 0.012;
    // Body behind the screen; a short wall round the front frame.
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
    for (const v of G.side.vs) addP('rubber', at(new THREE.CylinderGeometry(0.0042, 0.0042, 0.004, 16), G.side.u, v, front + 0.0018, Math.PI / 2));
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) addP('screw', at(new THREE.SphereGeometry(0.0022, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), G.u + sx * (G.w / 2 - 0.007), G.v + sy * (G.h / 2 - 0.007), front + 0.0004, Math.PI / 2), true);
  }

  // ---------------- under the panel ----------------
  // Footwell closures either side of the hopper's lower part, the floor.
  for (const sx of [1, -1]) {
    const x0 = 0.15, x1 = halfX(-0.5, 0) - 0.014;
    addB('trimGrey', at(new THREE.PlaneGeometry(x1 - x0, P0.y - FLOOR), sx * (x0 + x1) / 2, (P0.y + FLOOR) / 2, -0.5, 0, Math.PI, 0));
  }
  {
    const w = 2 * (halfX(-1.2, FLOOR + 0.02) - 0.016);
    const fl = new THREE.BoxGeometry(w, 0.008, 1.26);
    const uv = fl.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 4);
    addB('floor', at(fl, 0, FLOOR - 0.004, -1.13));
  }
  // Floor-side consoles over the wing's centre section (its upper skin
  // reaches y ≈ -0.26 beside the floor, outboard of x = 0.34).
  {
    const CX = 0.325, CY = -0.24, z0 = -0.5, z1 = -1.31;
    for (const sx of [1, -1]) {
      addB('kick', skin((u, v) => [sx * CX, lerp(FLOOR, CY, v), lerp(z0, z1, u)], 4, 2, [0, -0.3, -0.9]));
      addB('door', skin((u, v) => { const z = lerp(z0, z1, u); return [sx * lerp(CX, halfX(z, CY) - inset, v), CY, z]; }, 8, 2, [0, 0.5, -0.9]));
      addB('kick', skin((u, v) => { const y = lerp(FLOOR, CY, v); return [sx * lerp(CX, halfX(z1, y) - inset, u), y, z1]; }, 2, 3, [0, -0.3, -1.6]));
      addB('rubber', rod([sx * CX, CY + 0.002, z0], [sx * CX, CY + 0.002, z1], 0.004, 6), true);
    }
  }
  // Torque-tube box on the floor, the stick's boot on it.
  addB('alu', at(new RoundedBoxGeometry(0.12, 0.12, 0.4, 2, 0.01), 0, FLOOR + 0.06, -1.04));

  // Stick: pivot at the box top (the hand of the pilot figure is built for a
  // grip ≈ 0.64 m above it).
  const stick = new THREE.Group();
  stick.position.set(0, -0.36, -0.99);
  {
    const boot = new THREE.LatheGeometry([[0.055, 0], [0.05, 0.018], [0.038, 0.045], [0.024, 0.085], [0.016, 0.11]].map(([r, y]) => new THREE.Vector2(r, y)), 18);
    stick.add(new THREE.Mesh(boot, CM.rubber));
    stick.add(new THREE.Mesh(rod([0, 0.0, 0], [0, 0.57, 0.02], 0.0125, 14), CM.white));
    const gp = [[0.012, 0], [0.019, 0.012], [0.022, 0.04], [0.0235, 0.075], [0.022, 0.1], [0.019, 0.115], [0.012, 0.125], [0, 0.128]];
    const grip = new THREE.LatheGeometry(gp.map(([r, y]) => new THREE.Vector2(r, y)), 22);
    grip.scale(1.0, 1, 1.18);
    grip.rotateX(0.16);
    grip.translate(0, 0.565, 0.02);
    stick.add(new THREE.Mesh(grip, CM.black));
    for (let k = 0; k < 3; k++) stick.add(new THREE.Mesh(at(new THREE.TorusGeometry(0.0205, 0.0028, 6, 18, Math.PI), 0, 0.59 + k * 0.022, 0.034 - k * 0.003, 0, Math.PI / 2, 0), CM.black));
    stick.add(new THREE.Mesh(at(new THREE.BoxGeometry(0.012, 0.022, 0.008), 0, 0.61, 0.047), CM.black)); // trigger
    stick.add(new THREE.Mesh(at(new THREE.CylinderGeometry(0.0055, 0.0055, 0.008, 12), 0.006, 0.697, 0.028, -0.2), CM.chrome)); // trim hat
    stick.add(new THREE.Mesh(at(new THREE.BoxGeometry(0.012, 0.002, 0.003), 0.006, 0.702, 0.028), CM.chrome));
    stick.add(new THREE.Mesh(at(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 14), -0.009, 0.695, 0.034, 0.3), CM.red)); // spray button
  }
  cockpit.add(stick);
  // Pedals (floor-mounted, toe brakes); aircraft.js slides them with the rudder.
  const pedals = [];
  for (const sx of [1, -1]) {
    const p = new THREE.Group();
    p.position.set(sx * 0.21, -0.32, -0.53);
    p.add(new THREE.Mesh(at(new RoundedBoxGeometry(0.085, 0.15, 0.012, 2, 0.004), 0, 0, 0, -0.42), CM.pedal));
    for (let k = -2; k <= 2; k++) p.add(new THREE.Mesh(at(new THREE.BoxGeometry(0.075, 0.006, 0.004), 0, k * 0.025, -0.008, -0.42), CM.rubber));
    p.add(new THREE.Mesh(at(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 12), 0, 0.075, 0.03, 0, 0, Math.PI / 2), CM.black)); // toe brake
    p.add(new THREE.Mesh(rod([0, -0.07, 0.03], [0, -0.16, 0.07], 0.01, 8), CM.pedal));
    cockpit.add(p);
    pedals.push(p);
  }
  // Power quadrant against the left wall, from the panel's lower corner
  // aft: throttle (black, inboard), propeller (blue), mixture (red); the
  // throttle group is the one aircraft.js moves.
  const QZ = -0.935, QL = 0.27;
  const xw = Math.min(halfX(QZ - QL / 2, 0.16), halfX(QZ, 0.25)) - inset; // the wall's inner face
  const THR = [xw - 0.078 - OFF.x, 0.45, 0.0];
  const thrBody = o3(...THR);
  addB('black', at(new RoundedBoxGeometry(0.1, 0.085, QL, 2, 0.012), xw - 0.05, thrBody[1] - 0.045, QZ));
  addB('rubber', at(new THREE.BoxGeometry(0.075, 0.003, QL - 0.06), xw - 0.05, thrBody[1] - 0.002, QZ));
  const throttle = new THREE.Group();
  throttle.position.set(...thrBody);
  throttle.add(new THREE.Mesh(rod([0, 0, 0], [0, 0.15, 0], 0.005, 8), CM.chrome));
  throttle.add(new THREE.Mesh(at(new THREE.SphereGeometry(0.021, 16, 12), 0, 0.165, 0, 0, 0, 0), CM.black));
  cockpit.add(throttle);
  for (const [dx, mat, rot, kind] of [[0.027, CM.blue, 0.35, 'prop'], [0.052, CM.red, 0.35, 'mix']]) {
    const lv = new THREE.Group();
    lv.position.set(thrBody[0] + dx, thrBody[1], thrBody[2]);
    lv.rotation.x = rot;
    lv.add(new THREE.Mesh(rod([0, 0, 0], [0, 0.13, 0], 0.004, 8), CM.chrome));
    lv.add(new THREE.Mesh(kind === 'prop' ? at(new THREE.CylinderGeometry(0.013, 0.013, 0.022, 14), 0, 0.14, 0, 0, 0, Math.PI / 2) : at(new THREE.SphereGeometry(0.016, 14, 10), 0, 0.14, 0), mat));
    cockpit.add(lv);
  }
  addB('chrome', at(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 12), xw - 0.104, thrBody[1] - 0.035, thrBody[2] + 0.07, 0, 0, Math.PI / 2), true); // friction lock
  // Right console: the spray valve lever (aircraft.js), fuel shut-off.
  addB('black', at(new RoundedBoxGeometry(0.1, 0.085, QL, 2, 0.012), -(xw - 0.05), thrBody[1] - 0.045, QZ));
  const valve = new THREE.Group();
  valve.position.set(-(xw - 0.045), thrBody[1], thrBody[2]);
  valve.add(new THREE.Mesh(rod([0, 0, 0], [0, 0.17, 0], 0.0065, 8), CM.chrome));
  valve.add(new THREE.Mesh(at(new THREE.CylinderGeometry(0.009, 0.009, 0.06, 12), 0, 0.18, 0, 0, 0, Math.PI / 2), CM.red));
  cockpit.add(valve);
  addB('red', at(new THREE.BoxGeometry(0.05, 0.012, 0.012), -(xw - 0.05), thrBody[1] - 0.05, QZ - QL / 2 - 0.024)); // fuel shut-off T-handle
  addB('red', at(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 10), -(xw - 0.05), thrBody[1] - 0.05, QZ - QL / 2 - 0.008, Math.PI / 2));

  // ---------------- seat and harness ----------------
  {
    const s = o3(0, 0.05, -0.55), b = o3(0, 0.42, -0.73);
    addB('seat', at(new RoundedBoxGeometry(0.44, 0.09, 0.44, 3, 0.035), s[0], s[1], s[2]));
    for (const sx of [1, -1]) addB('seat', at(new RoundedBoxGeometry(0.06, 0.12, 0.4, 3, 0.025), sx * 0.21, s[1] + 0.03, s[2], 0, 0, sx * 0.12));
    addB('seat', at(new RoundedBoxGeometry(0.44, 0.66, 0.085, 3, 0.03), b[0], b[1], b[2], -0.14));
    for (const sx of [1, -1]) addB('seat', at(new RoundedBoxGeometry(0.06, 0.6, 0.11, 3, 0.025), sx * 0.205, b[1] - 0.02, b[2] + 0.02, -0.14, 0, sx * -0.1));
    addB('seat', at(new RoundedBoxGeometry(0.3, 0.14, 0.1, 3, 0.04), b[0], b[1] + 0.27, b[2] + 0.035, -0.2)); // head pad
    addB('seatDark', at(new THREE.BoxGeometry(0.4, 0.03, 0.4), s[0], s[1] - 0.06, s[2]));
    // Frame: legs and rails to the floor.
    for (const sx of [1, -1]) for (const dz of [-0.17, 0.17]) addB('alu', rod([sx * 0.18, FLOOR, s[2] + dz], [sx * 0.18, s[1] - 0.07, s[2] + dz], 0.012, 8));
    for (const sx of [1, -1]) addB('alu', rod([sx * 0.18, FLOOR + 0.01, s[2] - 0.3], [sx * 0.18, FLOOR + 0.01, s[2] + 0.3], 0.01, 8));
    // Harness lying on the seat: shoulder straps down the back, lap belts on
    // the cushion's sides, the rotary buckle.
    const lean = -0.14;
    for (const sx of [1, -1]) {
      const top = [sx * 0.1, b[1] + 0.3, b[2] + 0.06 + 0.3 * Math.sin(-lean)], bot = [sx * 0.085, s[1] + 0.07, s[2] - 0.14];
      addB('harness', rod(top, bot, 0.003, 4).scale(1, 1, 1));
      addB('harness', at(new THREE.BoxGeometry(0.045, Math.hypot(top[1] - bot[1], top[2] - bot[2]), 0.006), (top[0] + bot[0]) / 2, (top[1] + bot[1]) / 2, (top[2] + bot[2]) / 2 + 0.01, lean + 0.1));
      addB('harness', at(new THREE.BoxGeometry(0.045, 0.006, 0.2), sx * 0.15, s[1] + 0.052, s[2] + 0.05));
    }
    addB('alu', at(new THREE.CylinderGeometry(0.034, 0.034, 0.012, 20), 0, s[1] + 0.056, s[2] + 0.16));
  }

  // ---------------- cabin skins ----------------
  const inside = [0, 0.3, -1.2];
  const wall = (sx, z0, z1, y0, y1, mat, ins = inset) => addB(mat, skin((u, v) => { const z = lerp(z0, z1, u), y = lerp(y0, y1, v); return [sx * (halfX(z, y) - ins), y, z]; }, Math.max(2, Math.round((z0 - z1) * 8)), 6, inside));
  for (const sx of [1, -1]) {
    // Below the sill, from under the panel to the rear bulkhead; the left
    // side is the door with its lower window cut out.
    if (sx > 0) {
      wall(sx, -0.5, -0.64, FLOOR, SILL.y, 'trimGrey');
      wall(sx, -0.64, DW.z0, FLOOR, SILL.y, 'door');
      wall(sx, DW.z0, DW.z1, FLOOR, DW.y0, 'door');
      wall(sx, DW.z0, DW.z1, DW.y1, SILL.y, 'door');
      wall(sx, DW.z1, BPOST + 0.02, FLOOR, SILL.y, 'door');
      wall(sx, BPOST + 0.02, ROOF.zR + 0.02, FLOOR, SILL.y, 'trimGrey');
    } else wall(sx, -0.5, ROOF.zR + 0.02, FLOOR, SILL.y, 'trimGrey');
    // Scuffed kick strip along the floor.
    wall(sx, -0.5, ROOF.zR + 0.02, FLOOR, FLOOR + 0.11, 'kick', inset + 0.004);
    // Panels behind the B-posts, leaning with the cabin sides.
    addB('trimGrey', skin((u, v) => { const [x, y, z] = sideAt(sx, u, v, BPOST - 0.02, ROOF.zR + 0.02); return [x - sx * inset, y, z]; }, 3, 5, inside));
    // A- and B-post covers with their rubber seals.
    const aBot = [sx * (sillX(WS_ZS) - 0.02), SILL.y, WS_ZS - 0.01], aTop = [sx * (RAIL.x - 0.016), RAIL.y - 0.012, ROOF.zF - 0.02];
    addB('post', rod(aBot, aTop, 0.021, 10));
    const bBot = [sx * (sillX(BPOST) - 0.02), SILL.y, BPOST], bTop = [sx * (RAIL.x - 0.016), RAIL.y - 0.012, BPOST];
    addB('post', rod(bBot, bTop, 0.019, 10));
    for (const [p0, p1] of [[aBot, aTop], [bBot, bTop]]) addB('rubber', rod(p0.map((c, i) => c + [sx * 0.004, 0, i === 2 ? -0.02 : 0][i]), p1.map((c, i) => c + [sx * 0.004, 0, i === 2 ? -0.02 : 0][i]), 0.0045, 6), true);
    addB('rubber', rod([sx * (sillX(WS_ZS) - 0.012), SILL.y + 0.004, WS_ZS], [sx * (sillX(BPOST) - 0.012), SILL.y + 0.004, BPOST], 0.0045, 6), true); // sill seal
    addB('rubber', rod([sx * (RAIL.x - 0.01), RAIL.y - 0.006, ROOF.zF], [sx * (RAIL.x - 0.01), RAIL.y - 0.006, BPOST], 0.0045, 6), true); // rail seal
    // Yellow grab handle high on the A-post.
    const g0 = lerp3(aBot, aTop, 0.62), g1 = lerp3(aBot, aTop, 0.86);
    addB('yellow', tubeG([g0, [g0[0] * 0.86, g0[1] + 0.02, g0[2] - 0.01], [g1[0] * 0.86, g1[1] - 0.02, g1[2] + 0.01], g1], 0.0085, 16, 8));
  }
  // Door: inner handle and latch (left), window latch with its red tab (right).
  {
    const x = halfX(-1.45, 0.3) - inset - 0.012;
    addB('chrome', rod([x, 0.3, -1.5], [x - 0.005, 0.3, -1.38], 0.007, 8));
    addB('black', at(new RoundedBoxGeometry(0.014, 0.05, 0.08, 2, 0.004), x + 0.006, 0.3, -1.52));
    addB('red', at(new THREE.BoxGeometry(0.008, 0.05, 0.012), -(halfX(-0.72, 0.55) - 0.03), 0.56, -0.74));
  }
  // Headliner under the roof, the rear bulkhead.
  addB('headliner', skin((u, v) => { const [x, y, z] = lerp3(roofAt(u, false), roofAt(u, true), v); return [x, y - inset, z - (v === 0 ? 0.01 : 0)]; }, 16, 4, inside));
  addB('rubber', tubeG(Array.from({ length: 13 }, (_, i) => { const [x, y, z] = roofAt(i / 12, false); return [x, y - 0.012, z - 0.012]; }), 0.0045, 24, 6), true); // windshield head seal
  {
    const ring = aftRing(CABIN).slice(0, -1).map(([x, y]) => new THREE.Vector2(x * 0.965, Math.max(FLOOR, y * 0.985)));
    addB('trimGrey', new THREE.ShapeGeometry(new THREE.Shape(ring)).translate(0, 0, ROOF.zR + 0.035));
  }

  // Rear bulkhead fittings: the harness anchor bar and the fire
  // extinguisher in its bracket on the pilot's left.
  {
    const zb = ROOF.zR + 0.035;
    addB('alu', rod([-0.24, 0.6, zb + 0.03], [0.24, 0.6, zb + 0.03], 0.012, 10));
    for (const sx of [1, -1]) addB('alu', at(new THREE.BoxGeometry(0.03, 0.05, 0.03), sx * 0.25, 0.6, zb + 0.015));
    const ex = [0.33, 0.12, zb + 0.045];
    addB('red', at(new THREE.CylinderGeometry(0.034, 0.034, 0.25, 18), ex[0], ex[1], ex[2]));
    addB('red', at(new THREE.SphereGeometry(0.034, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), ex[0], ex[1] + 0.125, ex[2]));
    addB('black', at(new THREE.CylinderGeometry(0.012, 0.014, 0.05, 10), ex[0], ex[1] + 0.17, ex[2]));
    addB('black', at(new THREE.BoxGeometry(0.06, 0.008, 0.016), ex[0] + 0.015, ex[1] + 0.2, ex[2]));
    for (const dy of [-0.07, 0.07]) addB('black', at(new THREE.TorusGeometry(0.036, 0.004, 4, 20), ex[0], ex[1] + dy, ex[2], Math.PI / 2));
    addB('black', at(new THREE.BoxGeometry(0.02, 0.2, 0.012), ex[0], ex[1], zb + 0.006));
  }

  // ---------------- guidance lightbar (on the cowl, facing the pilot) ----
  const leds = [];
  let lightbar = null;
  {
    const lb = (lightbar = new THREE.Group());
    lb.position.set(0, ctx.cowlTopY(0.1) + 0.03, 0.1);
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
  const build = (acc, target, fineTarget) => {
    for (const [k, list] of Object.entries(acc)) {
      const isFine = k.startsWith('f:');
      const mat = CM[isFine ? k.slice(2) : k];
      const m = new THREE.Mesh(mergeAll(list), mat);
      m.receiveShadow = true;
      (isFine ? fineTarget : target).add(m);
    }
  };
  build(CP, pan, finePan);
  build(CB, cockpit, fine);
  cockpit.add(fine);
  // Small hardware only near the camera.
  const lod = new THREE.LOD();
  const lodPan = new THREE.Group();
  pan.remove(finePan); lodPan.add(finePan);
  lod.addLevel(new THREE.Group().add(fine, lodPan), 0);
  lod.addLevel(new THREE.Group(), 24);
  cockpit.remove(fine);
  lodPan.position.copy(pan.position); lodPan.quaternion.copy(pan.quaternion);
  cockpit.add(lod);

  // ---------------- per frame ----------------
  const nd = { ias: 0, ft: 0, rpm: 0, mp: 29.9, ff: 0, cht: 86, oil: 86, g: 1, gmax: 1, gmin: 1, amp: 0, hdg: 0, trim: 0 };
  const setN = (m, a) => { m.rotation.z = -a; };
  let nearT = 0;
  let shown = true;
  const update = (dt, fm, ac) => {
    const g = ac?.game;
    if (!g) return;
    const inCk = g.cameraMode === 'cockpit' && g.aircraft === ac;
    const dist = g.camera ? g.camera.position.distanceTo(ac.rPos) : 0;
    const near = !inCk && dist < 9;
    // Beyond 30 m the interior is a few pixels behind the glass: not drawn
    // (the lightbar on the cowl stays).
    const show = inCk || dist < 30;
    if (show !== shown) { shown = show; for (const c of cockpit.children) if (c !== lightbar) c.visible = show; }
    if (near) {
      nearT -= dt;
      if (nearT <= 0) { nearT = 0.3; panel.draw(ac.instruments()); }
    }
    if (!inCk && !near) return;
    const d = panel.last;
    if (!d) return;
    const A = E203_ANG, k = 9;
    nd.ias = damp(nd.ias, d.ias, k, dt);
    nd.ft = damp(nd.ft, d.altFt, 6, dt);
    nd.rpm = damp(nd.rpm, d.rpm, k, dt);
    nd.mp = damp(nd.mp, d.mp ?? 29.9, k, dt);
    nd.ff = damp(nd.ff, toGph(d.fuelFlow ?? 0), 4, dt);
    nd.cht = damp(nd.cht, C2F(d.cht ?? 30), 2, dt);
    nd.oil = damp(nd.oil, C2F(d.oilT ?? 30), 2, dt);
    nd.g = damp(nd.g, panel.gload.now, 14, dt);
    nd.gmax = panel.gload.max; nd.gmin = panel.gload.min;
    nd.amp = damp(nd.amp, panel.amps, 5, dt);
    nd.hdg += ((((d.hdg - nd.hdg) % 360) + 540) % 360 - 180) * (1 - Math.exp(-2.5 * dt));
    nd.trim = damp(nd.trim, fm.trim, 8, dt);
    setN(needles.asi[0], A.asi(nd.ias));
    setN(needles.alt[0], A.alt1000(nd.ft)); setN(needles.alt[1], A.alt100(nd.ft)); setN(needles.alt[2], A.alt10k(nd.ft));
    setN(needles.rpm[0], A.rpm(nd.rpm));
    setN(needles.mpff[0], A.mp(nd.mp)); setN(needles.mpff[1], A.ff(nd.ff));
    setN(needles.cht[0], A.cht(nd.cht)); setN(needles.cht[1], A.oilT(nd.oil));
    setN(needles.accel[0], A.accel(nd.gmax)); setN(needles.accel[1], A.accel(nd.gmin)); setN(needles.accel[2], A.accel(nd.g));
    setN(needles.amp[0], A.amp(nd.amp));
    cardDrum.rotation.y = (nd.hdg * Math.PI) / 180;
    trimPtr.position.x = P.trim.u + clamp(nd.trim, -1, 1) * P.trim.w * 0.38;
    for (const [id, mat] of Object.entries(lamps)) mat.emissiveIntensity = panel.lit[id] ? 2.4 : 0;
    for (const [grp, fn] of toggles) grp.rotation.x = fn(d) ? -0.6 : 0.6;
    key.rotation.z = -(d.engine === 'cranking' ? KEY_POS.start : d.engine === 'running' ? KEY_POS.both : KEY_POS.off);
    const master = d.engine !== 'off';
    for (const p of pickables) p.material.emissiveIntensity = master && p.userData.gpsPage === panel.page ? 0.7 : 0;
  };
  const pick = (raycaster) => {
    const h = raycaster.intersectObjects(pickables, false)[0];
    if (!h) return null;
    panel.setPage(h.object.userData.gpsPage);
    return h.object.userData.gpsPage;
  };
  // Eye: the pilot figure's eyes on this seat (OFF + its head), leaning a
  // little forward as when flying.
  const eye = new THREE.Vector3(...o3(0, 0.98, -0.52));
  return { cockpit, stick, pedals, throttle, valve, leds, panelMesh: pan, eye, THR, update, pick, pickables };
}
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
