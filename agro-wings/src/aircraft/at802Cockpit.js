// Air Tractor AT-802A / Fire Boss cockpit, after the five cockpit
// photographs (the main reference: the panel with the engine monitor left,
// the guidance screen in the centre and the round instruments right).
// What the photographs share, and what is built here:
//   - a wide matte-black panel in three facets: a centre facet carrying the
//     guidance unit under a hood, and two wings turned 35° toward the pilot
//     whose tops fall away outboard to rounded corners (the outline that
//     makes the type recognisable), real sheet thickness, cut-outs;
//   - the glareshield deck closing the panel's top to the windshield base;
//   - a lower console the width of the cabin under the panel, with two
//     labelled switch strips each side (LANDING/WORKING LIGHTS, DISPERSAL /
//     FIRE BOSS, FLIGHT LIGHTS/GYROS/FLAPS, ENGINE OPERATION);
//   - the black stick column with its grip, Air Tractor pedals, the yellow
//     hopper wall in the footwell with the hopper sight and its scale;
//   - the PT6 power quadrant on the left wall, the seat and harness, dark
//     side walls with the tube frame, the floor.
// What depends on the equipment fitted (and so on the configuration):
//   AT-802A — the dispersal switch strip, the flow monitor, the LED shows
//     the spray flow; Fire Boss — the water-system strip with the gear
//     handle and its position lamps, probe and door switches (clickable:
//     they work the water systems), the water mission display, the LED
//     shows the water on board, the hopper sight reads litres of water.
// Frames: each facet has a local (u, v, w) frame — u to the pilot's right,
// v up the facet, w toward the pilot — built from the body frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { clamp, lerp } from '../core/math.js';
import { AT802_ANG, AT802_SCREENS, CONSOLE_KEYS } from './at802Panel.js';
import { NAV_PAGES } from './agroNav.js';
import { sightLiquid } from './hopperLiquid.js';

const D2R = Math.PI / 180;
const TILT = 12 * D2R; // facets lean back
const WING = 47 * D2R; // panel wings turned toward the pilot (they fit the cabin walls)
// Real proportions (photographs from the seat): the panel fills the cabin
// from wall to wall, its hood and wing tops reaching the windshield base,
// ≈ 0.7 m from the eye. Everything laid out in facet coordinates (outlines,
// instruments, screens, keys, screws) is drawn 1.15× through the facet
// frames (PS); the layout numbers stay in their units. The wings' outer
// edges are cut to the cabin walls (wingEdge): the walls lean in toward the
// sill, and a panel corner must never run into them.
const PS = 1.15;
const Y0 = 0.70; // panel bottom (top of the lower console)
const ZC = -1.12; // centre facet bottom
const HC = 0.4; // centre facet height (facet units: 0.48 m)
const XW = 0.19; // half-width of the centre facet (facet units)
const WW = 0.32; // wing width (facet units)
const TOP_IN = 0.37, TOP_OUT = 0.3, CORNER = 0.035;

// A facet frame: origin + u/v axes (w = u × v toward the pilot), scaled PS.
function frame(o, U, V) {
  const W = new THREE.Vector3().crossVectors(U, V);
  const Us = U.clone().multiplyScalar(PS), Vs = V.clone().multiplyScalar(PS), Ws = W.clone().multiplyScalar(PS);
  const m = new THREE.Matrix4().makeBasis(Us, Vs, Ws).setPosition(o);
  return { o, U, V, W, m, at: (u, v, w = 0) => o.clone().addScaledVector(Us, u).addScaledVector(Vs, v).addScaledVector(Ws, w) };
}
const ct = Math.cos(TILT), st = Math.sin(TILT), ca = Math.cos(WING), sa = Math.sin(WING);
const F_C = frame(new THREE.Vector3(0, Y0, ZC), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, ct, st));
const F_L = frame(new THREE.Vector3(XW * PS, Y0, ZC), new THREE.Vector3(-ca, 0, sa), new THREE.Vector3(st * sa, ct, st * ca));
const F_R = frame(new THREE.Vector3(-XW * PS, Y0, ZC), new THREE.Vector3(-ca, 0, -sa), new THREE.Vector3(-st * sa, ct, st * ca));

// Panel layout in facet coordinates (metres).
export const AT802_LAYOUT = {
  gps: { u: 0, v: 0.232, w: 0.29, h: 0.232, screen: { w: 0.24, h: 0.165, v: 0.244 }, keysV: 0.142 },
  ems: { u: -0.125, v: 0.2, sw: 0.168, sh: 0.118, bw: 0.198, bh: 0.178, keysV: 0.128 },
  placard: { u0: -0.292, u1: -0.212, v0: 0.025, v1: 0.19 },
  lampsL: { u: -0.022, vs: [0.275, 0.245] },
  boost: { u: -0.255, v: 0.235 },
  adi: { u: 0.074, v: 0.27, s: 0.086 },
  asi: { u: 0.205, v: 0.252, r: 0.048 },
  led: { u: 0.074, v: 0.18, w: 0.086, h: 0.024 },
  aux: { u: 0.085, v: 0.088, w: 0.104, h: 0.065 },
  alt: { u: 0.222, v: 0.135, r: 0.048 },
  vent: { u: 0.262, v: 0.045 },
};
const L = AT802_LAYOUT;

// Outer edge of a panel wing, in facet units: the largest u (≤ WW) at height
// v whose point, sheet thickness included, stays WALL_CLR inside the cabin
// wall (the cockpit walls stand 0.022 m inside the skin). Both wings mirror.
const WALL_CLR = 0.034;
const topV = (u) => lerp(TOP_IN, TOP_OUT, u / WW);
export function at802WingEdge(fusX) {
  const inside = (u, v) => { const p = F_R.at(u, v); return Math.abs(p.x) <= fusX(p.z, p.y) - WALL_CLR; };
  const edge = (v) => {
    if (inside(WW, v)) return WW;
    let a = 0, b = WW;
    for (let i = 0; i < 20; i++) { const m = (a + b) / 2; if (inside(m, v)) a = m; else b = m; }
    return a;
  };
  // Where the edge meets the sloping top: the corner of the outline.
  let uC = WW;
  for (let v = 0; v <= TOP_IN; v += 0.005) { const u = edge(v); if (v >= topV(u) - CORNER) { uC = u; break; } }
  return { edge, uC, at: (sgn, u, v) => (sgn < 0 ? F_L : F_R).at(sgn * u, v), inside };
}

export function buildAT802Cockpit({ variant, panel, M, cab, game = null }) {
  const FB = variant === 'fireboss';
  const { SILL, CAN, canW, fusX, OFF } = cab;
  const o3 = (x, y, z) => [x + OFF.x, y + OFF.y, z + OFF.z];
  const cockpit = new THREE.Group();
  cockpit.name = 'at802-cockpit';
  const detail = new THREE.Group(); // small parts, dropped beyond 25 m
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, ...o });
  const C = {
    panel: std(0x17181b, { roughness: 0.82, metalness: 0.18, bumpMap: panel.stipple, bumpScale: 0.35 }),
    bezel: std(0x0b0c0d, { roughness: 0.42, metalness: 0.25 }),
    hood: std(0x121315, { roughness: 0.9 }),
    can: std(0x050505, { roughness: 0.9, side: THREE.BackSide }),
    chrome: std(0xc9cdd1, { roughness: 0.22, metalness: 0.95 }),
    screw: std(0x8a8f95, { roughness: 0.35, metalness: 0.9 }),
    dial: new THREE.MeshStandardMaterial({ map: panel.dials, roughness: 0.55, metalness: 0, emissive: 0xffffff, emissiveMap: panel.dials, emissiveIntensity: 0.06 }),
    placard: new THREE.MeshStandardMaterial({ map: panel.placards, roughness: 0.7, emissive: 0xffffff, emissiveMap: panel.placards, emissiveIntensity: 0.05 }),
    labels: new THREE.MeshStandardMaterial({ map: panel.labels, roughness: 0.7, emissive: 0xffffff, emissiveMap: panel.labels, emissiveIntensity: 0.05 }),
    needle: std(0xf4f4f0, { roughness: 0.4, emissive: 0x222222 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, transparent: true, opacity: 0.1, clearcoat: 1, depthWrite: false }),
    console: std(0x141518, { roughness: 0.75, metalness: 0.2, bumpMap: panel.stipple, bumpScale: 0.3 }),
    toggle: std(0xd2d5d8, { roughness: 0.25, metalness: 0.95 }),
    knob: std(0x1a1a1a, { roughness: 0.5 }),
    wall: std(0x34373c, { roughness: 0.85, metalness: 0.15, side: THREE.DoubleSide }),
    tube: std(0xb9bec4, { roughness: 0.55, metalness: 0.4 }),
    floor: M.floor, // (the floor geometry carries its vertex colours)
    hopper: std(0xd9b414, { roughness: 0.65, metalness: 0.05 }),
    pedal: new THREE.MeshStandardMaterial({ map: panel.pedal, roughness: 0.45, metalness: 0.7 }),
    rubber: std(0x151515, { roughness: 0.95 }),
    stick: std(0x101112, { roughness: 0.35, metalness: 0.3 }),
    red: std(0xc62118, { roughness: 0.45 }),
    scale: new THREE.MeshStandardMaterial({ map: panel.hopperScale, roughness: 0.6 }),
    liquid: new THREE.MeshStandardMaterial({ color: FB ? 0x2a7fd0 : 0x6fae3a, roughness: 0.15, transparent: true, opacity: 0.78 }),
    seat: (() => { const m = M.seat.clone(); m.vertexColors = false; return m; })(),
  };
  const screenMat = (tex, k = 0.9) => new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(k, k, k) });
  const lampMat = (col) => new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3, emissive: col, emissiveIntensity: 0 });
  const parts = {};
  const add = (key, g, fine = false) => { (parts[(fine ? 'fine:' : '') + key] ||= []).push(g); };
  const WE = at802WingEdge(fusX);
  const atF = (F, g, u, v, w = 0) => g.applyMatrix4(new THREE.Matrix4().makeTranslation(u, v, w)).applyMatrix4(F.m);

  // ---------------- panel facets ----------------
  const rrPath = (P, cx, cy, w, h, r, cw = false) => {
    const x0 = cx - w / 2, y0 = cy - h / 2;
    P.moveTo(x0 + r, y0);
    if (!cw) {
      P.lineTo(x0 + w - r, y0); P.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r); P.lineTo(x0 + w, y0 + h - r); P.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
      P.lineTo(x0 + r, y0 + h); P.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r); P.lineTo(x0, y0 + r); P.quadraticCurveTo(x0, y0, x0 + r, y0);
    } else {
      P.quadraticCurveTo(x0, y0, x0, y0 + r); P.lineTo(x0, y0 + h - r); P.quadraticCurveTo(x0, y0 + h, x0 + r, y0 + h); P.lineTo(x0 + w - r, y0 + h);
      P.quadraticCurveTo(x0 + w, y0 + h, x0 + w, y0 + h - r); P.lineTo(x0 + w, y0 + r); P.quadraticCurveTo(x0 + w, y0, x0 + w - r, y0); P.lineTo(x0 + r, y0);
    }
    return P;
  };
  const circle = (u, v, r) => { const p = new THREE.Path(); p.absarc(u, v, r, 0, Math.PI * 2, true); return p; };
  const rectHole = (u, v, w, h, r = 0.004) => rrPath(new THREE.Path(), u, v, w, h, r, true);
  const sheet = (F, shape, depth = 0.012) => {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1, curveSegments: 18 });
    g.translate(0, 0, -depth - 0.002);
    return g.applyMatrix4(F.m);
  };
  // Wing outline (sgn = -1 left wing: u from 0 to -WW; +1 right wing).
  // The outer edge follows the cabin wall (WE.edge) up to the sloping top.
  const wingShape = (sgn) => {
    const s = new THREE.Shape();
    const U = (u) => sgn * u;
    s.moveTo(U(0), 0);
    let vLast = 0;
    for (let v = 0; v <= TOP_IN; v += 0.02) {
      const u = WE.edge(v);
      if (v > topV(u) - CORNER) break;
      s.lineTo(U(u), v); vLast = v;
    }
    const uc = WE.uC, vc = topV(uc);
    s.lineTo(U(uc), Math.max(vLast, vc - CORNER));
    s.quadraticCurveTo(U(uc), vc, U(uc - CORNER * 1.4), topV(uc - CORNER * 1.4) + 0.002);
    s.lineTo(U(0.02), TOP_IN - 0.002); s.quadraticCurveTo(U(0), TOP_IN, U(0), TOP_IN - 0.01);
    s.lineTo(U(0), 0);
    return s;
  };
  // Centre: GPS opening under the hood.
  {
    const s = new THREE.Shape();
    s.moveTo(-XW, 0); s.lineTo(XW, 0); s.lineTo(XW, HC); s.lineTo(-XW, HC); s.lineTo(-XW, 0);
    s.holes.push(rectHole(L.gps.u, L.gps.v, L.gps.w - 0.012, L.gps.h - 0.012, 0.01));
    add('panel', sheet(F_C, s));
  }
  // Left wing: engine monitor, placards, lamps, boost pump.
  {
    const s = wingShape(-1);
    s.holes.push(rectHole(L.ems.u, L.ems.v, L.ems.bw - 0.01, L.ems.bh - 0.01, 0.008));
    for (const v of L.lampsL.vs) s.holes.push(circle(L.lampsL.u, v, 0.0075));
    add('panel', sheet(F_L, s));
  }
  // Right wing: attitude, airspeed, LED, auxiliary display, altimeter, vent.
  {
    const s = wingShape(1);
    s.holes.push(rectHole(L.adi.u, L.adi.v, L.adi.s + 0.008, L.adi.s + 0.008, 0.006));
    s.holes.push(circle(L.asi.u, L.asi.v, L.asi.r + 0.004));
    s.holes.push(rectHole(L.led.u, L.led.v, L.led.w + 0.006, L.led.h + 0.006, 0.003));
    s.holes.push(rectHole(L.aux.u, L.aux.v, L.aux.w + 0.008, L.aux.h + 0.008, 0.004));
    s.holes.push(circle(L.alt.u, L.alt.v, L.alt.r + 0.004));
    s.holes.push(circle(L.vent.u, L.vent.v, 0.022));
    add('panel', sheet(F_R, s));
  }
  // Seams where the wings meet the centre (bolted angle strips).
  for (const F of [F_L, F_R]) add('bezel', atF(F, new THREE.BoxGeometry(0.014, TOP_IN - 0.01, 0.01), 0, (TOP_IN - 0.01) / 2, -0.004));
  // Screws round the facet edges (instanced, small → detail).
  const screwPts = [];
  for (const [F, sgn] of [[F_L, -1], [F_R, 1]]) {
    for (let i = 0; i <= 6; i++) screwPts.push([F, sgn * lerp(0.02, WE.edge(0) - 0.02, i / 6), 0.012]);
    for (let i = 1; i < 6; i++) { const u = lerp(0.03, WE.uC - 0.05, i / 6); screwPts.push([F, sgn * u, topV(u) - 0.014]); }
    for (const v of [0.08, 0.16, 0.24]) if (v < topV(WE.edge(v)) - CORNER) screwPts.push([F, sgn * (WE.edge(v) - 0.011), v]);
  }
  for (const u of [-0.17, -0.09, 0, 0.09, 0.17]) screwPts.push([F_C, u, 0.012]);
  for (const v of [0.06, 0.14, 0.3]) { screwPts.push([F_C, 0.177, v]); screwPts.push([F_C, -0.177, v]); }
  {
    const g = new THREE.CylinderGeometry(0.0035, 0.0035, 0.003, 8).rotateX(Math.PI / 2);
    const im = new THREE.InstancedMesh(g, C.screw, screwPts.length);
    const m4 = new THREE.Matrix4();
    screwPts.forEach(([F, u, v], i) => { m4.makeTranslation(u, v, 0.0012).premultiply(F.m); im.setMatrixAt(i, m4); });
    detail.add(im);
  }

  // ---------------- glareshield deck and hood ----------------
  // From the facets' top edges forward to the windshield base (the deck
  // closes the space between the panel and the hopper, matte black).
  {
    const N = 36;
    const top = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N; // 0 = left outer … 1 = right outer
      if (t < 0.4) { const u = -WE.uC * (1 - t / 0.4); top.push(F_L.at(u, topV(-u) + 0.002, -0.006)); }
      else if (t <= 0.6) { const u = lerp(XW, -XW, (t - 0.4) / 0.2); top.push(F_C.at(u, HC + 0.002, -0.006)); }
      else { const u = WE.uC * ((t - 0.6) / 0.4); top.push(F_R.at(u, topV(u) + 0.002, -0.006)); }
    }
    const zWS = (x) => -0.92 - Math.max(0, Math.abs(x) - 0.22) * 1.0;
    const pos = [], idx = [];
    for (const p of top) {
      const ax = clamp(p.x, -canW(SILL) + 0.012, canW(SILL) - 0.012);
      // (Up to just over the windshield's base frame: from the seat the deck
      // meets the glass, no painted frame showing between them.)
      const front = new THREE.Vector3(ax, SILL + 0.055, zWS(ax) - 0.038);
      for (let k = 0; k <= 4; k++) { const t = k / 4; pos.push(lerp(p.x, front.x, t), lerp(p.y, front.y, t) + 0.012 * Math.sin(Math.PI * t), lerp(p.z, front.z, t)); }
    }
    for (let i = 0; i < N; i++) for (let k = 0; k < 4; k++) { const a = i * 5 + k, b = a + 1, c = a + 5, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, C.hood);
    m.material.side = THREE.DoubleSide;
    cockpit.add(m);
  }
  // Back plate behind the panel, wall to wall, from the lower console to
  // the glareshield: no daylight between the facets or past the wings'
  // edges (the panel is a closed box in the aircraft, not cut-outs).
  {
    const zB = -0.975, yB0 = 0.5, yB1 = SILL + 0.045, N = 10, pos = [], idx = [];
    for (let j = 0; j <= N; j++) {
      const y = lerp(yB0, yB1, j / N), hw = Math.min(fusX(zB, y), canW(SILL) + 0.1) - 0.02;
      pos.push(hw, y, zB, -hw, y, zB);
    }
    for (let j = 0; j < N; j++) { const a = j * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, C.hood);
    cockpit.add(m);
  }
  // Hood over the guidance unit: a visor box proud of the centre facet.
  {
    const hw = L.gps.w / 2 + 0.012;
    const s = new THREE.Shape();
    s.moveTo(-hw, 0); s.lineTo(hw, 0); s.lineTo(hw, 0.012); s.lineTo(-hw, 0.012); s.lineTo(-hw, 0);
    const top = new THREE.ExtrudeGeometry(s, { depth: 0.085, bevelEnabled: false });
    top.translate(0, HC - 0.004, -0.02);
    add('hood', top.applyMatrix4(F_C.m));
    for (const sx of [-1, 1]) add('hood', atF(F_C, new THREE.BoxGeometry(0.01, 0.07, 0.085), sx * (hw - 0.005), HC - 0.035, 0.0225));
    // "GPS not for navigation"-style strip on the hood lip.
    add('bezel', atF(F_C, new THREE.BoxGeometry(hw * 2, 0.014, 0.004), 0, HC + 0.0, 0.066));
  }

  // ---------------- instruments ----------------
  const needles = { asi: [], alt: [] };
  const dialAt = (F, key, cell, u, v, r) => {
    const can = new THREE.CylinderGeometry(r + 0.002, r + 0.002, 0.04, 36, 1, true).rotateX(Math.PI / 2);
    add('can', atF(F, can, u, v, -0.022));
    const face = new THREE.CircleGeometry(r, 48);
    const uv = face.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, cell * 0.5 + uv.getX(i) * 0.5, uv.getY(i));
    add('dial', atF(F, face, u, v, -0.03));
    add('bezel', atF(F, new THREE.TorusGeometry(r + 0.004, 0.0042, 8, 40), u, v, 0.001));
    add('glass', atF(F, new THREE.CircleGeometry(r, 36), u, v, -0.005));
    // Needle: a mount oriented to the facet, the needle pivot inside it
    // (rotation.z: clockwise as the pilot sees it, from 12 o'clock).
    const mkNeedle = (len, wid) => {
      const mount = new THREE.Group();
      mount.position.copy(F.at(u, v, -0.026));
      mount.quaternion.setFromRotationMatrix(new THREE.Matrix4().extractRotation(F.m));
      const pivot = new THREE.Group();
      pivot.add(new THREE.Mesh(new THREE.BoxGeometry(wid, len, 0.0015).translate(0, len * 0.42, 0), C.needle));
      pivot.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.003, 12).rotateX(Math.PI / 2), C.bezel));
      mount.add(pivot);
      cockpit.add(mount);
      return pivot;
    };
    if (key === 'asi') needles.asi.push(mkNeedle(r * 0.88, 0.0035));
    else { needles.alt.push(mkNeedle(r * 0.88, 0.003)); needles.alt.push(mkNeedle(r * 0.6, 0.0055)); }
  };
  dialAt(F_R, 'asi', 0, L.asi.u, L.asi.v, L.asi.r);
  dialAt(F_R, 'alt', 1, L.alt.u, L.alt.v, L.alt.r);
  // Screens in recessed housings: [frame, texture, centre, size, depth].
  const screen = (F, tex, u, v, w, h, k = 0.9, depth = 0.016, w0 = 0) => {
    // Recess walls.
    const walls = [
      [new THREE.PlaneGeometry(w, depth), 0, h / 2, -Math.PI / 2], [new THREE.PlaneGeometry(w, depth), 0, -h / 2, Math.PI / 2],
    ];
    for (const [g, du, dv, rx] of walls) add('can', atF(F, g.rotateX(rx), u + du, v + dv, w0 - depth / 2));
    for (const sx of [-1, 1]) add('can', atF(F, new THREE.PlaneGeometry(depth, h).rotateY(-sx * Math.PI / 2), u + (sx * w) / 2, v, w0 - depth / 2));
    const m = new THREE.Mesh(atF(F, new THREE.PlaneGeometry(w, h), u, v, w0 - depth), screenMat(tex, k));
    cockpit.add(m);
    add('glass', atF(F, new THREE.PlaneGeometry(w, h), u, v, w0 - 0.003));
    return m;
  };
  // Engine monitor: bezel (proud frame with soft keys and a knob), screen.
  {
    const E = L.ems;
    const s = rrPath(new THREE.Shape(), E.u, E.v, E.bw, E.bh, 0.01);
    s.holes.push(rectHole(E.u, E.v + 0.02, E.sw + 0.004, E.sh + 0.004, 0.003));
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 8 });
    add('bezel', g.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, -0.004)).applyMatrix4(F_L.m));
    screen(F_L, panel.screens.ems.tex, E.u, E.v + 0.02, E.sw, E.sh, 0.92, 0.012);
    for (let i = 0; i < 5; i++) add('knob', atF(F_L, new RoundedBoxGeometry(0.018, 0.009, 0.006, 1, 0.002), E.u - 0.07 + i * 0.03, E.v - E.bh / 2 + 0.017, 0.01), true);
    add('knob', atF(F_L, new THREE.CylinderGeometry(0.008, 0.009, 0.012, 16).rotateX(Math.PI / 2), E.u + 0.083, E.v - E.bh / 2 + 0.018, 0.012), true);
  }
  // Placards (outer left), master warn / caution lamps, boost pump switch.
  {
    const P = L.placard, w = P.u1 - P.u0, h = P.v1 - P.v0;
    add('placard', atF(F_L, new THREE.PlaneGeometry(w, h), (P.u0 + P.u1) / 2, (P.v0 + P.v1) / 2, 0.0012));
  }
  const lamps = {};
  for (const [i, [id, col]] of [['warn', 0xff2a1a], ['caution', 0xffb000]].entries()) {
    lamps[id] = lampMat(col);
    const m = new THREE.Mesh(atF(F_L, new THREE.CylinderGeometry(0.0072, 0.0072, 0.008, 16).rotateX(Math.PI / 2), L.lampsL.u, L.lampsL.vs[i], 0.002), lamps[id]);
    cockpit.add(m);
    add('bezel', atF(F_L, new THREE.TorusGeometry(0.0085, 0.0018, 6, 16), L.lampsL.u, L.lampsL.vs[i], 0.003));
  }
  const toggle = (F, u, v, out = 0.002) => {
    // Bushing, nut and lever (the lever is a pivoting group).
    add('chrome', atF(F, new THREE.CylinderGeometry(0.0052, 0.0058, 0.006, 12).rotateX(Math.PI / 2), u, v, out + 0.003), true);
    const g = new THREE.Group();
    g.position.copy(F.at(u, v, out + 0.006));
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().extractRotation(F.m));
    const lever = new THREE.Group();
    lever.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0024, 0.02, 8).rotateX(Math.PI / 2).translate(0, 0, 0.01), C.toggle));
    g.add(lever);
    detail.add(g);
    return lever;
  };
  const boost = toggle(F_L, L.boost.u, L.boost.v);
  // Right wing: attitude display, LED, auxiliary display, vent, USB port.
  screen(F_R, panel.screens.adi.tex, L.adi.u, L.adi.v, L.adi.s, L.adi.s, 0.88);
  {
    const s2 = rrPath(new THREE.Shape(), L.adi.u, L.adi.v - 0.002, L.adi.s + 0.02, L.adi.s + 0.024, 0.006);
    s2.holes.push(rectHole(L.adi.u, L.adi.v, L.adi.s + 0.001, L.adi.s + 0.001, 0.003));
    add('bezel', new THREE.ExtrudeGeometry(s2, { depth: 0.007, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -0.004).applyMatrix4(F_R.m));
  }
  screen(F_R, panel.screens.led.tex, L.led.u, L.led.v, L.led.w, L.led.h, 1.0, 0.006);
  screen(F_R, panel.screens.aux.tex, L.aux.u, L.aux.v, L.aux.w, L.aux.h, 0.85, 0.008);
  add('knob', atF(F_R, new THREE.SphereGeometry(0.02, 18, 12), L.vent.u, L.vent.v, -0.006));
  add('chrome', atF(F_R, new THREE.TorusGeometry(0.022, 0.0035, 8, 24), L.vent.u, L.vent.v, 0.001));
  if (!FB) add('knob', atF(F_R, new THREE.CylinderGeometry(0.009, 0.009, 0.008, 16).rotateX(Math.PI / 2), 0.15, 0.195, 0.002), true);
  // Fire Boss: gear position block in the pilot's view (green down, blue
  // up / water, the amber transit lamp between), next to the water LED.
  if (FB) {
    add('bezel', atF(F_R, new RoundedBoxGeometry(0.042, 0.05, 0.006, 1, 0.004), 0.15, 0.185, 0.001));
    for (const [id, col, du, dv] of [['gearDn', 0x26ff4a, -0.01, 0.2], ['gearDn', 0x26ff4a, 0.01, 0.2], ['gearUp', 0x3aa2ff, -0.01, 0.17], ['gearUp', 0x3aa2ff, 0.01, 0.17], ['transit', 0xffb000, 0, 0.185]]) {
      lamps[id] ||= lampMat(col);
      cockpit.add(new THREE.Mesh(atF(F_R, new THREE.CylinderGeometry(0.0055, 0.0055, 0.006, 12).rotateX(Math.PI / 2), 0.15 + du, dv, 0.005), lamps[id]));
    }
  }

  // ---------------- GPS (the game's AGROWINGS NAV) in its housing ----------------
  const pickables = [];
  {
    const G = L.gps, S = G.screen;
    const front = 0.028;
    // Housing: a deep frame round the screen opening (front at `front`),
    // its sides running back through the facet.
    const hs = rrPath(new THREE.Shape(), G.u, G.v, G.w, G.h, 0.012);
    hs.holes.push(rectHole(G.u, S.v, S.w + 0.004, S.h + 0.004, 0.004));
    add('bezel', new THREE.ExtrudeGeometry(hs, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 8 }).translate(0, 0, front - 0.012).applyMatrix4(F_C.m));
    for (const sx of [-1, 1]) add('bezel', atF(F_C, new THREE.BoxGeometry(0.008, G.h, 0.05), G.u + sx * (G.w / 2 - 0.004), G.v, front - 0.035));
    for (const sy of [-1, 1]) add('bezel', atF(F_C, new THREE.BoxGeometry(G.w, 0.008, 0.05), G.u, G.v + sy * (G.h / 2 - 0.004), front - 0.035));
    screen(F_C, panel.gps.tex, G.u, S.v, S.w, S.h, 0.86, 0.008, front + 0.0005);
    const keyGeo = new RoundedBoxGeometry(0.03, 0.011, 0.006, 1, 0.002);
    NAV_PAGES.forEach((pg, i) => {
      const k = new THREE.Mesh(keyGeo, new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.6, emissive: 0x52d8ff, emissiveIntensity: 0 }));
      k.position.copy(F_C.at(G.u - 0.075 + i * 0.05, G.keysV, front + 0.002));
      k.quaternion.setFromRotationMatrix(new THREE.Matrix4().extractRotation(F_C.m));
      k.userData.gpsPage = pg;
      cockpit.add(k);
      pickables.push(k);
    });
    // Compass under the GPS.
    add('bezel', atF(F_C, new RoundedBoxGeometry(0.06, 0.05, 0.05, 2, 0.008), 0, 0.055, 0.02));
    add('glass', atF(F_C, new THREE.CircleGeometry(0.018, 24), 0, 0.058, 0.046));
  }

  // ---------------- lower console ----------------
  // Top shelf from the panel foot to the switch face; the face (13° back)
  // carries the legends; a back-plate closes it to the hopper wall.
  const CON = { x: 0.5, top: Y0, bot: 0.5, zFace: -1.34, slope: 13 * D2R };
  const faceAt = (x, y) => new THREE.Vector3(x, y, CON.zFace - (CON.top - y) * Math.tan(CON.slope));
  {
    const zBack = (x) => (Math.abs(x) <= XW * PS ? ZC : ZC - (Math.abs(x) - XW * PS) * Math.tan(WING));
    const pos = [], idx = [];
    const N = 24;
    for (let i = 0; i <= N; i++) {
      const x = lerp(CON.x, -CON.x, i / N);
      pos.push(x, CON.top, Math.max(zBack(x), CON.zFace + 0.01), x, CON.top, CON.zFace);
    }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, C.console);
    m.material.side = THREE.DoubleSide;
    cockpit.add(m);
    // Switch face with the legends texture.
    const f0 = faceAt(CON.x, CON.top), f1 = faceAt(-CON.x, CON.bot);
    const face = new THREE.PlaneGeometry(CON.x * 2, (CON.top - CON.bot) / Math.cos(CON.slope));
    face.rotateY(Math.PI).rotateX(CON.slope);
    face.translate(0, (CON.top + CON.bot) / 2, (f0.z + f1.z) / 2);
    const fm = new THREE.Mesh(face, C.labels);
    cockpit.add(fm);
    // Ends, bottom and the edge trim.
    for (const sx of [-1, 1]) add('console', new THREE.BoxGeometry(0.012, CON.top - CON.bot, 0.2).translate(sx * (CON.x + 0.006), (CON.top + CON.bot) / 2, CON.zFace + 0.09));
    add('console', new THREE.BoxGeometry(CON.x * 2 + 0.024, 0.012, 0.2).translate(0, CON.bot, CON.zFace + 0.09));
    add('chrome', new THREE.BoxGeometry(CON.x * 2 + 0.02, 0.006, 0.008).translate(0, CON.top + 0.002, CON.zFace - 0.002));
  }
  // Toggles on the strips: the texture's two rows (each strip ≈ 0.47 of the
  // width, 7 switches); the ones the simulation drives are their own meshes.
  const consoleToggles = [];
  {
    const rowV = [0.36, 0.86]; // switch rows (fraction from the face's top)
    const halfStrip = (side) => side < 0 ? [CON.x, 0.03] : [-0.03, -CON.x];
    const staticT = [];
    for (let row = 0; row < 2; row++) {
      for (const side of [-1, 1]) {
        const [xa, xb] = halfStrip(side);
        for (let i = 0; i < 7; i++) {
          const x = lerp(xa, xb, (i + 0.5) / 7 * 0.92 + 0.04);
          const y = lerp(CON.top, CON.bot, rowV[row] - 0.14);
          const p = faceAt(x, y);
          const strip = row === 1 && side < 0 ? 'mission' : row === 1 ? 'engine' : side < 0 ? 'lights' : 'flight';
          const key = strip === 'mission' ? (FB ? CONSOLE_KEYS.fireboss[i] : ['valve', null, null, null, null, null, null][i]) : strip === 'engine' ? ['batt', 'gen', 'start', 'ign', 'boost', null, null][i] : strip === 'flight' ? [null, null, null, null, 'flap', null, 'avionics'][i] : [null, null, null, null, 'nav', 'strobe', 'beacon'][i];
          if (key) consoleToggles.push({ key, p });
          else staticT.push(p);
        }
      }
    }
    // Static toggles: one instanced mesh (lever + bushing merged).
    const tg = mergeGeometries([
      new THREE.CylinderGeometry(0.0055, 0.006, 0.006, 10).rotateX(Math.PI / 2).translate(0, 0, 0.003),
      new THREE.CylinderGeometry(0.0016, 0.0024, 0.02, 8).rotateX(Math.PI / 2 + 0.55).translate(0, 0.005, 0.013),
    ]);
    const im = new THREE.InstancedMesh(tg, C.toggle, staticT.length);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(CON.slope, Math.PI, 0));
    staticT.forEach((p, i) => im.setMatrixAt(i, new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1))));
    detail.add(im);
  }
  const live = {};
  for (const { key, p } of consoleToggles) {
    const g = new THREE.Group();
    g.position.copy(p);
    g.rotation.set(CON.slope, Math.PI, 0);
    add('chrome', new THREE.CylinderGeometry(0.0055, 0.006, 0.006, 10).rotateX(Math.PI / 2).translate(0, 0, 0.003).applyMatrix4(new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(g.rotation), new THREE.Vector3(1, 1, 1))), true);
    const lever = new THREE.Group();
    lever.position.z = 0.006;
    if (key === 'gear') {
      // The gear handle: a wheel-shaped knob on a longer lever.
      lever.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.03, 8).rotateX(Math.PI / 2).translate(0, 0, 0.015), C.toggle));
      lever.add(new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.006, 16).translate(0, 0, 0.03), C.knob));
    } else lever.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0024, 0.02, 8).rotateX(Math.PI / 2).translate(0, 0, 0.01), key === 'door' ? C.red : C.toggle));
    g.add(lever);
    cockpit.add(g);
    live[key] = lever;
    // Clickable: the switches whose systems exist.
    const act = FB ? { gear: 'gear', probes: 'probes', door: 'door' }[key] : { valve: 'spray' }[key];
    if (act) {
      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.03, 0.03), new THREE.MeshBasicMaterial({ visible: false }));
      hit.userData.action = act;
      g.add(hit);
      pickables.push(hit);
    }
  }
  // Lamps above the mission strip: Fire Boss gear (2 green down, 2 blue up,
  // amber transit), probes, scoop, door, water contact; AT-802A spray.
  const lampDefs = FB
    ? [['gearDn', 0x26ff4a], ['gearDn', 0x26ff4a], ['gearUp', 0x3aa2ff], ['gearUp', 0x3aa2ff], ['transit', 0xffb000], ['probes', 0xffd23a], ['scoop', 0x26ff4a], ['door', 0xff3a2a], ['onWater', 0x3aa2ff]]
    : [['spray', 0x26ff4a]];
  lampDefs.forEach(([id, col], i) => {
    lamps[id] ||= lampMat(col);
    const x = FB ? lerp(0.4, 0.06, i / (lampDefs.length - 1)) : 0.4;
    const p = faceAt(x, lerp(CON.top, CON.bot, 0.5));
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.0048, 0.0048, 0.005, 12).rotateX(Math.PI / 2), lamps[id]);
    m.position.copy(p); m.rotation.set(CON.slope, Math.PI, 0);
    cockpit.add(m);
  });
  // Hobbs-style round meter on the left strip end and the red firewall
  // shut-off T-handle at the right end (as in the photographs).
  {
    const p = faceAt(0.395, lerp(CON.top, CON.bot, 0.8));
    add('chrome', new THREE.TorusGeometry(0.016, 0.003, 6, 20).applyMatrix4(new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(CON.slope, Math.PI, 0)), new THREE.Vector3(1, 1, 1))));
    add('glass', new THREE.CircleGeometry(0.015, 20).applyMatrix4(new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(CON.slope, Math.PI, 0)), new THREE.Vector3(1, 1, 1))));
    const r = faceAt(-0.405, lerp(CON.top, CON.bot, 0.55));
    add('red', new THREE.CylinderGeometry(0.004, 0.004, 0.035, 8).rotateX(Math.PI / 2).translate(r.x, r.y, r.z - 0.017));
    add('red', new THREE.BoxGeometry(0.008, 0.032, 0.012).translate(r.x, r.y, r.z - 0.036));
  }

  // ---------------- footwell: hopper wall, sight, floor, pedals ----------------
  const YF = 0.32, ZH = -0.95;
  {
    const hw = fusX(ZH, 0.45) - 0.03;
    add('hopper', new THREE.PlaneGeometry(hw * 2, CON.bot - YF + 0.02).rotateY(Math.PI).translate(0, (CON.bot + YF) / 2, ZH));
    // Hopper sight: a framed window with its scale and the liquid level.
    const sight = { w: 0.07, h: 0.17, y: YF + 0.02 + 0.085 };
    add('scale', new THREE.PlaneGeometry(sight.w, sight.h).rotateY(Math.PI).translate(0, sight.y, ZH - 0.002));
    add('chrome', new THREE.BoxGeometry(sight.w + 0.012, 0.006, 0.01).translate(0, sight.y + sight.h / 2, ZH - 0.004));
    add('chrome', new THREE.BoxGeometry(sight.w + 0.012, 0.006, 0.01).translate(0, sight.y - sight.h / 2, ZH - 0.004));
    for (const sx of [-1, 1]) add('chrome', new THREE.BoxGeometry(0.006, sight.h, 0.01).translate(sx * (sight.w / 2 + 0.003), sight.y, ZH - 0.004));
    // The liquid column: full height; its surface is cut live by the
    // material (hopperLiquid.js) — level, slosh and ripples.
    var sightH = sight.h - 0.024;
    var liquid = new THREE.Mesh(new THREE.PlaneGeometry(0.022, sightH).translate(0, sightH / 2, 0).rotateY(Math.PI), C.liquid);
    liquid.position.set(0.012, sight.y - sight.h / 2 + 0.01, ZH - 0.003);
    cockpit.add(liquid);
    var hopperLiquid = [sightLiquid(C.liquid, { sheet: true, size: [22, sightH * 1000], windows: [{ box: [0, 22, 0, sightH * 1000], rows: [[sightH * 1000, 0], [0, 1]], men: [255, 255, 255, 0.45], menPx: 1.5 }] })];
  }
  // Floor (ribbed sheet) and the floor tunnel under the stick.
  {
    const hw = (z) => fusX(z, YF + 0.05) - 0.03;
    const pos = [], idx = [], uv = [];
    const zs = [ZH, -1.3, -1.7, -2.1, CAN.zR + 0.05];
    zs.forEach((z, i) => { for (const sx of [1, -1]) { pos.push(sx * hw(z), YF, z); uv.push(sx > 0 ? 0 : 1, i / (zs.length - 1) * 3); } });
    for (let i = 0; i < zs.length - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0.75), 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    cockpit.add(new THREE.Mesh(g, C.floor));
    add('console', new RoundedBoxGeometry(0.16, 0.08, 0.5, 2, 0.02).translate(0, YF + 0.04, -1.45));
  }
  // Pedals (Air Tractor plates on arms, pivot bar under the console).
  const pedals = [];
  for (const sx of [1, -1]) {
    const p = new THREE.Group();
    p.position.set(...o3(sx * 0.18, -0.12, 0.42));
    p.rotation.x = -0.62;
    p.add(new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.16, 0.016, 2, 0.006), C.pedal));
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.24, 8), C.tube);
    arm.position.set(0, -0.14, 0.03);
    p.add(arm);
    p.add(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.012, 0.03).translate(0, -0.08, 0.008), C.rubber));
    cockpit.add(p);
    pedals.push(p);
  }
  add('tube', new THREE.CylinderGeometry(0.014, 0.014, 0.5, 10).rotateZ(Math.PI / 2).translate(0, YF + 0.04, -1.0));
  for (const sx of [1, -1]) add('red', new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(sx * 0.18, YF + 0.05, -1.0), new THREE.Vector3(sx * 0.24, YF + 0.03, -1.4), new THREE.Vector3(sx * 0.3, YF + 0.03, -2.2)]), 12, 0.004, 5));

  // ---------------- stick ----------------
  // Black column from a boot on the floor tunnel, leaning slightly aft, the
  // Air Tractor grip on top (red top button, trim hat, trigger, side
  // buttons). The pivot is at the floor: the elevator and aileron move it.
  const stick = new THREE.Group();
  stick.position.set(...o3(0, -0.22, -0.12));
  {
    const boot = new THREE.Mesh(new THREE.LatheGeometry([[0.07, 0], [0.066, 0.02], [0.05, 0.05], [0.032, 0.09], [0.02, 0.13]].map(([r, y]) => new THREE.Vector2(r, y)), 18), C.rubber);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.0175, 0.5, 14).translate(0, 0.27, 0).rotateX(-0.06), C.stick);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.025, 14).translate(0, 0.5, -0.015), C.chrome);
    const grip = new THREE.Group();
    grip.position.set(0, 0.52, -0.03);
    grip.rotation.x = 0.12;
    const body = new THREE.Mesh(new THREE.LatheGeometry([[0.018, 0], [0.022, 0.03], [0.024, 0.07], [0.023, 0.1], [0.026, 0.125], [0.02, 0.14], [0.0, 0.145]].map(([r, y]) => new THREE.Vector2(r, y)), 16), C.stick);
    body.scale.set(1, 1, 1.25);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1.35), C.stick);
    head.position.y = 0.14;
    const red = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.01, 14), C.red);
    red.position.set(0, 0.16, 0.012);
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.012, 8), C.chrome);
    hat.position.set(0.014, 0.153, -0.01);
    const trig = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.012), C.knob);
    trig.position.set(0, 0.1, 0.03);
    const side = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.008, 8).rotateZ(Math.PI / 2), C.chrome);
    side.position.set(0.026, 0.115, 0);
    grip.add(body, head, red, hat, trig, side);
    stick.add(boot, col, collar, grip);
  }
  cockpit.add(stick);

  // ---------------- PT6 power quadrant (left wall) and spray / drop handle ----------------
  // (Aft and low on the left console, clear of the panel's left wing as in
  // the photographs: the knobs stand below the sill beside the seat.)
  const QY = -0.05, QZ = -0.16;
  const q3 = (x, y, z) => o3(x, y + QY, z + QZ);
  const THR = [0.33, 0.47 + QY, 0.08 + QZ];
  add('console', new RoundedBoxGeometry(0.11, 0.05, 0.4, 2, 0.015).translate(...q3(0.37, 0.43, -0.02)));
  add('console', new RoundedBoxGeometry(0.09, 0.18, 0.44, 2, 0.015).translate(...q3(0.41, 0.33, -0.04)));
  for (const lx of [0.33, 0.37, 0.405]) add('bezel', new THREE.BoxGeometry(0.008, 0.004, 0.25).translate(...q3(lx, 0.457, -0.01)));
  const throttle = new THREE.Group();
  throttle.position.set(...o3(...THR));
  {
    const tl = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.17, 8), C.chrome);
    tl.position.y = 0.085;
    const tk = new THREE.Mesh(new RoundedBoxGeometry(0.085, 0.034, 0.038, 2, 0.01), C.stick);
    tk.position.y = 0.17;
    throttle.add(tl, tk);
  }
  cockpit.add(throttle);
  for (const [lx, col, rot] of [[0.37, std(0x2a5fbf), 0.38], [0.405, C.red, 0.42]]) {
    const lv = new THREE.Group();
    lv.position.set(...q3(lx, 0.45, 0.02));
    lv.rotation.x = rot;
    const s2 = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.15, 8), C.chrome);
    s2.position.y = 0.075;
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), col);
    k.position.y = 0.15;
    lv.add(s2, k);
    cockpit.add(lv);
  }
  // Right-hand console: the spray valve handle (AT-802A) / the drop handle
  // (Fire Boss), red.
  add('console', new RoundedBoxGeometry(0.11, 0.06, 0.42, 2, 0.015).translate(...o3(-0.37, 0.4, -0.2)));
  const valve = new THREE.Group();
  valve.position.set(...o3(-0.35, 0.44, -0.1));
  {
    const vl = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.18, 8), C.chrome);
    vl.position.y = 0.09;
    const vk = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.034, 0.034, 2, 0.008), C.red);
    vk.position.y = 0.18;
    valve.add(vl, vk);
  }
  cockpit.add(valve);

  // ---------------- cabin interior ----------------
  // Side walls under the sill (dark grey), the tube frame (light grey), the
  // rear bulkhead, the seat with its harness.
  {
    const Z0 = ZH, Z1 = CAN.zR + 0.03;
    const wallX = (z, y) => fusX(z, y) - 0.022;
    for (const sx of [1, -1]) {
      const nu = 16, nv = 8, pos = [], idx = [];
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
        const z = lerp(Z0, Z1, i / nu), y = lerp(YF, SILL - 0.008, j / nv);
        pos.push(sx * wallX(z, y), y, z);
      }
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
        if (sx > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      cockpit.add(new THREE.Mesh(g, C.wall));
      const Wp = (z, y) => new THREE.Vector3(sx * (wallX(z, y) - 0.018), y, z);
      // (The tube frame starts aft of the panel wings, which reach the wall.)
      for (const [a, b] of [[[-1.42, 0.88], [-2.3, 0.88]], [[-1.42, 0.45], [-1.75, 1.1]], [[-1.75, 0.45], [-1.75, 1.1]], [[-1.75, 0.45], [-2.15, 1.1]], [[-2.15, 0.45], [-2.15, 1.1]]]) {
        const pts = Array.from({ length: 6 }, (_, i) => Wp(lerp(a[0], b[0], i / 5), lerp(a[1], b[1], i / 5)));
        add('tube', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.016, 8));
      }
      // Door handle and latch on the left (door) side.
      if (sx > 0) { add('chrome', new THREE.BoxGeometry(0.02, 0.025, 0.14).translate(wallX(-1.5, 1.0) - 0.03, 1.0, -1.5)); add('red', new THREE.BoxGeometry(0.018, 0.04, 0.03).translate(wallX(-1.75, 1.05) - 0.025, 1.05, -1.75)); }
    }
    // Window sill trim along each side (dark, over the painted sill rail the
    // pilot otherwise sees as a yellow strip under the side windows).
    for (const sx of [1, -1]) {
      const pos = [], idx = [], N = 12;
      // (From the A-post's foot aft: forward of it the windshield's corner
      // pane sweeps back, and a trim from further forward stuck out through
      // the glass over the nose.)
      const zPost = -0.92 - (canW(SILL) - 0.22) - 0.03;
      for (let i = 0; i <= N; i++) {
        const z = lerp(zPost, Z1, i / N);
        pos.push(sx * (wallX(z, SILL - 0.01) - 0.005), SILL - 0.012, z, sx * (canW(SILL) - 0.035), SILL + 0.036, z);
      }
      for (let i = 0; i < N; i++) { const a = i * 2; if (sx > 0) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      add('wall', g);
    }
    // Rear bulkhead to the headliner.
    const r = new THREE.Shape();
    const xr = (y) => (y <= SILL ? wallX(Z1, y) : canW(y) - 0.02);
    r.moveTo(-xr(YF), YF);
    for (let i = 0; i <= 14; i++) { const y = YF + ((SILL + 0.32 - YF) * i) / 14; r.lineTo(xr(y), y); }
    for (let i = 14; i >= 0; i--) { const y = YF + ((SILL + 0.32 - YF) * i) / 14; r.lineTo(-xr(y), y); }
    add('wall', new THREE.ShapeGeometry(r, 2).translate(0, 0, Z1));
  }
  add('seat', new RoundedBoxGeometry(0.5, 0.12, 0.5, 2, 0.045).translate(...o3(0, 0.05, -0.55)));
  add('seat', new RoundedBoxGeometry(0.5, 0.82, 0.12, 2, 0.05).rotateX(-0.12).translate(...o3(0, 0.45, -0.8)));
  add('seat', new RoundedBoxGeometry(0.42, 0.22, 0.09, 2, 0.04).rotateX(-0.12).translate(...o3(0, 0.98, -0.87)));
  add('bezel', new THREE.BoxGeometry(0.54, 0.05, 0.52).translate(...o3(0, -0.04, -0.55)));
  for (const sx of [1, -1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.64, 0.01), M.harness);
    strap.position.set(...o3(sx * 0.12, 0.48, -0.74));
    strap.rotation.x = -0.12;
    cockpit.add(strap);
  }
  // Fire extinguisher by the seat.
  add('red', new THREE.CylinderGeometry(0.035, 0.035, 0.26, 14).translate(...o3(0.36, 0.05, -0.75)));

  // Guidance lightbar on the hood (the game's guidance LEDs).
  const lightbar = new THREE.Group();
  lightbar.position.copy(F_C.at(0, HC + 0.03, 0.03));
  lightbar.rotation.x = -0.25;
  const leds = [];
  for (let i = -7; i <= 7; i++) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.008), new THREE.MeshBasicMaterial({ color: 0x222222 }));
    led.position.set(-i * 0.0155, 0, -0.016);
    lightbar.add(led);
    leds.push(led);
  }
  lightbar.add(new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.03, 0.03, 2, 0.006), C.bezel));
  cockpit.add(lightbar);

  // ---------------- merge ----------------
  for (const [k, list] of Object.entries(parts)) {
    const fine = k.startsWith('fine:');
    const key = fine ? k.slice(5) : k;
    const mat = C[key];
    const geos = list.map((g) => { const n = g.index ? g.toNonIndexed() : g; for (const a of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(a)) n.deleteAttribute(a); if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2)); if (!n.attributes.normal) n.computeVertexNormals(); return n; });
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    if (mat === C.glass) m.renderOrder = 12;
    m.receiveShadow = true;
    (fine ? detail : cockpit).add(m);
  }
  const lod = new THREE.LOD();
  lod.addLevel(detail, 0);
  lod.addLevel(new THREE.Group(), 25);
  cockpit.add(lod);

  // ---------------- per-frame ----------------
  let ac = null;
  const setN = (n, a) => { n.rotation.z = -a; };
  const update = (dt, fm, aircraft) => {
    ac = aircraft ?? ac;
    const d = panel.last;
    if (!d) return;
    const ias = d.ias ?? 0;
    setN(needles.asi[0], AT802_ANG.asi(ias));
    setN(needles.alt[0], AT802_ANG.alt100(Math.max(0, d.altFt)));
    setN(needles.alt[1], AT802_ANG.alt1000(Math.max(0, d.altFt)));
    for (const [id, mat] of Object.entries(lamps)) mat.emissiveIntensity = panel.lit[id] ? 2.4 : 0;
    const on = d.engine !== 'off';
    const state = {
      batt: on, gen: d.engine === 'running', start: d.engine === 'cranking', ign: d.engine === 'cranking', boost: on,
      nav: on, strobe: on, beacon: on, avionics: on, flap: (d.flaps ?? 0) > 0.05,
      valve: !!d.spray, gear: (fm.gearCmd ?? true), probes: !!d.water?.probesCmd, door: !!d.water?.dropping,
    };
    for (const [k, lever] of Object.entries(live)) lever.rotation.x = state[k] ? -0.55 : 0.55;
    boost.rotation.x = on ? -0.55 : 0.55;
    // Hopper sight level: the product (AT-802A, US gal scale) or the water
    // (Fire Boss, litres scale) the simulation carries.
    const max = FB ? 3000 : 800 * 3.785;
    const master = on;
    for (const p of pickables) if (p.userData.gpsPage) p.material.emissiveIntensity = master && p.userData.gpsPage === panel.page ? 0.7 : 0;
  };
  // Clicks: the GPS soft keys; on the Fire Boss the gear handle, probe and
  // door switches (the water systems); on the AT-802A the spray valve.
  const pick = (raycaster) => {
    const h = raycaster.intersectObjects(pickables, false)[0];
    if (!h) return null;
    const o = h.object;
    if (o.userData.gpsPage) { panel.setPage(o.userData.gpsPage); return o.userData.gpsPage; }
    const a = o.userData.action, ws = ac?.water;
    if (a === 'gear' && ws) ws.toggleGear();
    else if (a === 'probes' && ws) ws.toggleProbes();
    else if (a === 'door' && ws) ws.toggleDrop();
    else if (a === 'spray' && (game ?? ac?.game)?.sprayer) (game ?? ac.game).sprayer.toggle();
    return a ?? null;
  };
  return { cockpit, stick, pedals, throttle, valve, leds, update, pick, pickables, frames: { F_C, F_L, F_R }, THR, hopperLiquid };
}
