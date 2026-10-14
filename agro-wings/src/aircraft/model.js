// Procedural agricultural monoplane inspired by Ipanema proportions (own
// livery and details). Body frame: +Z nose, +Y up, +X left wing; origin = CG.
// Dimensions: span 11.7 m, length ~7.6 m, low wing (6° dihedral), raised
// cabin, conventional gear, spray booms under the trailing edge.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvas, canvasTexture } from '../core/textures.js';
import { rng } from '../core/math.js';

const DIH = Math.tan((6 * Math.PI) / 180);
export const WING = { rootX: 0.55, tipX: 5.85, rootY: -0.55, le: 0.85, chord: 1.7 };
export const wingY = (x) => WING.rootY + Math.max(0, Math.abs(x) - WING.rootX) * DIH;

// --------------------------------------------------------------------------
// Textures
function paintWearTexture() {
  const S = 512;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  const r = rng(31);
  // Fine speckle, chips, streaks: multiplied over the paint colour.
  for (let i = 0; i < 2500; i++) {
    const v = 215 + Math.floor(r() * 40);
    g.fillStyle = `rgba(${v},${v - 4},${v - 12},0.45)`;
    g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2);
  }
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(110,100,85,${0.08 + r() * 0.12})`;
    g.fillRect(r() * S, r() * S, 1 + r() * 2, 20 + r() * 90);
  }
  for (let i = 0; i < 30; i++) {
    g.fillStyle = 'rgba(70,70,70,0.35)';
    g.beginPath(); g.arc(r() * S, r() * S, 1 + r() * 2.5, 0, Math.PI * 2); g.fill();
  }
  return canvasTexture(c, { repeat: true });
}

function registrationTexture(text) {
  const c = canvas(512, 128);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 128);
  g.fillStyle = '#16181a';
  g.font = 'bold 96px Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  return canvasTexture(c);
}

function propDiscTexture() {
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, S * 0.08, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(30,30,30,0.0)');
  grd.addColorStop(0.2, 'rgba(30,30,30,0.35)');
  grd.addColorStop(0.85, 'rgba(40,40,40,0.25)');
  grd.addColorStop(0.92, 'rgba(240,200,40,0.45)');
  grd.addColorStop(0.97, 'rgba(240,200,40,0.2)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  return canvasTexture(c, { srgb: true });
}

// --------------------------------------------------------------------------
// Geometry helpers
function superRing(hw, yb, yt, n, p) {
  const out = [];
  const mid = (yt + yb) / 2, hh = (yt - yb) / 2;
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    out.push([hw * Math.sign(c) * Math.abs(c) ** (2 / p), mid + hh * Math.sign(s) * Math.abs(s) ** (2 / p)]);
  }
  return out;
}

// Loft along Z through stations {z, hw, yb, yt, p}. Vertex colours carry a
// subtle grime gradient (darker belly, exhaust area).
function loftZ(stations, n = 24, grime = null) {
  const pos = [], uv = [], col = [], idx = [];
  const len = stations[0].z - stations[stations.length - 1].z;
  stations.forEach((s, si) => {
    const ring = superRing(s.hw, s.yb, s.yt, n, s.p ?? 4);
    ring.forEach(([x, y], k) => {
      pos.push(x, y, s.z);
      uv.push((k / n) * 3, ((stations[0].z - s.z) / len) * 6);
      const g = grime ? grime(x, y, s.z) : 1;
      col.push(g, g, g);
    });
  });
  const rl = n + 1;
  for (let si = 0; si < stations.length - 1; si++) {
    for (let k = 0; k < n; k++) {
      const a = si * rl + k, b = a + 1, c = a + rl, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// NACA-like cambered airfoil between chord fractions [c0, c1] (closed loop).
function airfoil(c0, c1, t = 0.15, m = 0.035, pp = 0.4, n = 10) {
  const yt = (x) => 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const yc = (x) => (x < pp ? (m / (pp * pp)) * (2 * pp * x - x * x) : (m / (1 - pp) ** 2) * (1 - 2 * pp + 2 * pp * x - x * x));
  const xs = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    xs.push(c0 + (c1 - c0) * (c0 === 0 ? (1 - Math.cos((u * Math.PI) / 2)) : u));
  }
  const up = xs.map((x) => [x, yc(x) + yt(x)]);
  const lo = xs.slice().reverse().map((x) => [x, yc(x) - yt(x)]);
  return up.concat(lo);
}

// Loft a wing panel along span between stations {x, y, le, chord}.
function wingPanel(stations, prof, side = 1, grime = 1) {
  const pos = [], uv = [], col = [], idx = [];
  const n = prof.length;
  stations.forEach((s) => {
    prof.forEach(([xc, yc]) => {
      pos.push(side * s.x, s.y + yc * s.chord, s.le - xc * s.chord);
      uv.push(s.x / 1.2, xc * 1.4);
      const g = (yc < 0 ? 0.88 : 1) * grime;
      col.push(g, g, g);
    });
  });
  for (let si = 0; si < stations.length - 1; si++) {
    for (let k = 0; k < n - 1; k++) {
      const a = si * n + k, b = a + 1, c = a + n, d = c + 1;
      if (side > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  }
  // End caps (fan).
  const cap = (si, flip) => {
    const base = si * n;
    for (let k = 1; k < n - 1; k++) {
      const tri = [base, base + k, base + k + 1];
      if ((side > 0) !== flip) idx.push(tri[0], tri[2], tri[1]); else idx.push(...tri);
    }
  };
  cap(0, false);
  cap(stations.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function tagged(g, r = 1) {
  if (!g.attributes.color) {
    const c = new Float32Array(g.attributes.position.count * 3).fill(r);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g.index ? g.toNonIndexed() : g;
}

function tx(g, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) {
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(s, s, s)));
  return g;
}

// Tube between two points.
function rod(a, b, r, seg = 6) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

// --------------------------------------------------------------------------
export function createAircraftModel(panelTexture) {
  const root = new THREE.Group();
  root.name = 'aircraft';
  const wear = paintWearTexture();
  wear.repeat.set(1, 1);
  const M = {
    paint: new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#ffa000'), map: wear, vertexColors: true, roughness: 0.4, metalness: 0.0, clearcoat: 0.3, clearcoatRoughness: 0.3 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.6, metalness: 0.1, vertexColors: true }),
    alu: new THREE.MeshStandardMaterial({ color: 0xb9bdc0, roughness: 0.32, metalness: 0.9 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x55595d, roughness: 0.45, metalness: 0.85 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92, metalness: 0 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x8fa6b2, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.22, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide }),
    interior: new THREE.MeshStandardMaterial({ color: 0x55606b, roughness: 0.75, metalness: 0.2 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x1f2c44, roughness: 0.9 }),
    red: new THREE.MeshStandardMaterial({ color: 0xc8261b, roughness: 0.45, emissive: 0x330000 }),
    green: new THREE.MeshStandardMaterial({ color: 0x1f9a3a, roughness: 0.45, emissive: 0x002200 }),
    white: new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4 }),
    pilot: new THREE.MeshStandardMaterial({ color: 0x3c4d63, roughness: 0.85 }),
    helmet: new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.35 }),
  };

  const paintParts = [], darkParts = [], aluParts = [], steelParts = [], rubberParts = [], interiorParts = [];

  // ---------------- fuselage ----------------
  const grime = (x, y, z) => {
    let g = 1 - Math.max(0, -y - 0.2) * 0.35; // dusty belly
    if (z > 1.2 && z < 2.6 && y < 0.1) g *= 0.82 + 0.18 * Math.min(1, (z - 1.2) / 1.4); // exhaust staining behind stacks
    return Math.max(0.55, g);
  };
  const fus = loftZ([
    { z: 3.12, hw: 0.40, yb: -0.36, yt: 0.44, p: 3 },
    { z: 2.9, hw: 0.47, yb: -0.48, yt: 0.52, p: 3.4 },
    { z: 2.1, hw: 0.53, yb: -0.58, yt: 0.58, p: 4 },
    { z: 1.2, hw: 0.56, yb: -0.66, yt: 0.62, p: 4.5 },
    { z: 0.45, hw: 0.57, yb: -0.69, yt: 0.64, p: 4.5 },
    { z: -0.75, hw: 0.56, yb: -0.62, yt: 0.66, p: 4.5 },
    { z: -1.35, hw: 0.49, yb: -0.48, yt: 0.78, p: 4 },
    { z: -2.4, hw: 0.33, yb: -0.22, yt: 0.62, p: 3.5 },
    { z: -3.5, hw: 0.17, yb: 0.02, yt: 0.46, p: 3 },
    { z: -4.15, hw: 0.07, yb: 0.12, yt: 0.36, p: 3 },
    { z: -4.32, hw: 0.01, yb: 0.2, yt: 0.3, p: 3 },
  ], 28, grime);
  paintParts.push(tagged(fus));
  // Anti-glare panel on top of the cowling + dark stripe along the side.
  const ag = new THREE.BoxGeometry(0.62, 0.02, 1.3);
  darkParts.push(tagged(tx(ag, 0, 0.6, 2.35, -0.05)));
  for (const sx of [1, -1]) {
    const st = new THREE.BoxGeometry(0.02, 0.08, 4.6);
    darkParts.push(tagged(tx(st, sx * 0.575, 0.05, -0.3, 0, 0, 0)));
    const st2 = new THREE.BoxGeometry(0.02, 0.05, 1.6);
    darkParts.push(tagged(tx(st2, sx * 0.4, 0.22, -2.6, 0, sx * -0.08, 0)));
  }
  // Hopper quick-fill coupler on the left side, aft of the wing root.
  for (const sx of [1, -1]) darkParts.push(tagged(tx(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 12), sx * 0.58, -0.35, -1.05, 0, 0, Math.PI / 2)));
  aluParts.push(tagged(rod([0.5, -0.35, -1.05], [0.45, -0.1, 0.9], 0.03, 8)));
  // Hopper lid on the forward fuselage top.
  const lid = new THREE.CylinderGeometry(0.28, 0.28, 0.06, 20);
  darkParts.push(tagged(tx(lid, 0, 0.64, 1.05)));
  // Exhaust stacks
  for (const sx of [1, -1]) {
    steelParts.push(tagged(rod([sx * 0.5, -0.35, 2.2], [sx * 0.62, -0.5, 1.75], 0.045, 8)));
  }
  // Cowling air inlets + spinner
  darkParts.push(tagged(tx(new THREE.BoxGeometry(0.5, 0.14, 0.05), 0, -0.22, 3.13)));
  const spinner = new THREE.ConeGeometry(0.21, 0.42, 20);
  const spinnerMesh = new THREE.Mesh(tx(spinner, 0, 0, 0.21, Math.PI / 2), M.paint);

  // ---------------- cabin ----------------
  const cabinFrame = [];
  const cz0 = -0.95, cz1 = 0.5, roof = 1.34;
  const glassG = [];
  // Windshield (sloped), side windows, roof glass panel, rear window.
  const ws = new THREE.BufferGeometry();
  {
    const p = [
      -0.5, 0.64, cz1, 0.5, 0.64, cz1, 0.44, roof - 0.04, 0.12, -0.44, roof - 0.04, 0.12,
    ];
    ws.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    ws.setIndex([0, 1, 2, 0, 2, 3]);
    ws.computeVertexNormals();
    glassG.push(ws);
  }
  for (const sx of [1, -1]) {
    const side = new THREE.BufferGeometry();
    const p = [
      sx * 0.5, 0.64, cz1, sx * 0.44, roof - 0.04, 0.12, sx * 0.44, roof - 0.04, cz0, sx * 0.53, 0.64, cz0,
    ];
    side.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    side.setIndex([0, 1, 2, 0, 2, 3]);
    side.computeVertexNormals();
    glassG.push(side);
  }
  const roofG = new THREE.BoxGeometry(0.9, 0.04, 1.15);
  glassG.push(tx(roofG, 0, roof, -0.42));
  const rearG = new THREE.BufferGeometry();
  {
    const p = [-0.53, 0.64, cz0, 0.53, 0.64, cz0, 0.44, roof - 0.04, cz0, -0.44, roof - 0.04, cz0];
    rearG.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    rearG.setIndex([0, 2, 1, 0, 3, 2]);
    rearG.computeVertexNormals();
    glassG.push(rearG);
  }
  const glassMesh = new THREE.Mesh(mergeGeometries(glassG.map((g) => tagged(g))), M.glass);
  glassMesh.renderOrder = 10;
  // Cabin frame bars (dark).
  const bars = [
    [[-0.5, 0.64, cz1], [-0.44, roof, 0.12]], [[0.5, 0.64, cz1], [0.44, roof, 0.12]],
    [[-0.44, roof, 0.12], [-0.44, roof, cz0]], [[0.44, roof, 0.12], [0.44, roof, cz0]],
    [[-0.44, roof, 0.12], [0.44, roof, 0.12]], [[-0.44, roof, cz0], [0.44, roof, cz0]],
    [[-0.53, 0.64, cz0], [-0.44, roof, cz0]], [[0.53, 0.64, cz0], [0.44, roof, cz0]],
    [[-0.52, 0.64, -0.25], [-0.44, roof, -0.25]], [[0.52, 0.64, -0.25], [0.44, roof, -0.25]],
    [[0, 0.64, cz1], [0, roof, 0.12]],
  ];
  for (const [a, b] of bars) cabinFrame.push(tagged(rod(a, b, 0.022, 6)));
  darkParts.push(...cabinFrame);
  // Turtle deck between cabin and fin + deflector cable fin->roof + wire cutter.
  paintParts.push(tagged(loftZ([
    { z: cz0 + 0.02, hw: 0.45, yb: 0.6, yt: roof - 0.02, p: 3 },
    { z: -1.8, hw: 0.36, yb: 0.6, yt: 0.95, p: 3 },
    { z: -2.6, hw: 0.22, yb: 0.55, yt: 0.66, p: 3 },
  ], 16, () => 0.97)));
  steelParts.push(tagged(rod([0, roof + 0.02, -0.1], [0, 1.78, -3.95], 0.008, 4)));
  steelParts.push(tagged(rod([0, 0.66, 0.6], [0, roof + 0.18, 0.18], 0.025, 5)));
  steelParts.push(tagged(tx(new THREE.BoxGeometry(0.03, 0.5, 0.06), 0, roof + 0.18, 0.15, 0.6)));

  // ---------------- wing ----------------
  const leY = (x) => wingY(x);
  const main = airfoil(0, 0.74), aft = airfoil(0.76, 1.0);
  const wingParts = [];
  const flaps = [], ailerons = [];
  const surfaceMesh = (geo, x0, x1, side) => {
    // Pivot on the hinge line (76% chord), X axis along the dihedral line;
    // the returned group's rotation.x deflects the surface.
    const hz = WING.le - 0.76 * WING.chord;
    const hx = (side * (x0 + x1)) / 2;
    const pivot = new THREE.Group();
    pivot.position.set(hx, leY(hx) + 0.02, hz);
    pivot.rotation.z = side * Math.atan(DIH);
    pivot.updateMatrix();
    geo.applyMatrix4(pivot.matrix.clone().invert());
    const deflect = new THREE.Group();
    const m = new THREE.Mesh(geo, M.paint);
    m.castShadow = true; m.receiveShadow = true;
    deflect.add(m);
    pivot.add(deflect);
    root.add(pivot);
    return deflect;
  };
  for (const side of [1, -1]) {
    const st = (x) => ({ x, y: leY(x), le: WING.le, chord: WING.chord });
    // Main (forward) wing box, full span.
    wingParts.push(wingPanel([st(0.2), st(WING.rootX), st(3.2), st(WING.tipX)], main, side));
    // Root trailing segment (fixed) under the fuselage side.
    wingParts.push(wingPanel([st(0.2), st(WING.rootX + 0.05)], aft, side));
    // Flap (0.6..3.2) and aileron (3.25..5.8).
    const fl = wingPanel([st(WING.rootX + 0.05), st(3.18)], aft, side);
    flaps.push(surfaceMesh(fl, WING.rootX + 0.05, 3.18, side));
    const al = wingPanel([st(3.24), st(WING.tipX)], aft, side);
    ailerons.push(surfaceMesh(al, 3.24, WING.tipX, side));
    // Upturned wingtip
    const tip = wingPanel([
      { x: WING.tipX, y: leY(WING.tipX), le: WING.le, chord: WING.chord },
      { x: WING.tipX + 0.16, y: leY(WING.tipX) + 0.34, le: WING.le - 0.2, chord: WING.chord * 0.78 },
    ], airfoil(0, 1, 0.1), side);
    wingParts.push(tip);
    // Nav light at tip (red = left/+X, green = right/-X).
    const nl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), side > 0 ? M.red : M.green);
    nl.position.set(side * (WING.tipX + 0.1), leY(WING.tipX) + 0.2, WING.le - 0.25);
    root.add(nl);
    // Wing walkway (dark non-slip) at the root, where the badeco steps.
    darkParts.push(tagged(tx(new THREE.BoxGeometry(0.5, 0.012, 1.0), side * 0.85, leY(0.85) + 0.13, 0.05, 0, 0, side * Math.atan(DIH))));
    // Fuel filler cap on top of the wing tank.
    darkParts.push(tagged(tx(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 14), side * 2.4, leY(2.4) + 0.125, -0.4)));
  }
  paintParts.push(...wingParts.map((g) => tagged(g)));

  // ---------------- tail ----------------
  const stabStations = (side) => [
    { x: 0.1, y: 0.34, le: -3.25, chord: 0.95 },
    { x: 1.85, y: 0.36, le: -3.405, chord: 0.7 },
  ];
  const elevParts = [];
  for (const side of [1, -1]) {
    paintParts.push(tagged(wingPanel(stabStations(side), airfoil(0, 0.6, 0.1, 0), side)));
    elevParts.push(wingPanel(stabStations(side), airfoil(0.62, 1, 0.1, 0), side));
    // Stabiliser strut to the fin.
    steelParts.push(tagged(rod([side * 1.0, 0.33, -3.6], [0, 1.1, -3.75], 0.018, 6)));
  }
  const elevGeo = mergeGeometries(elevParts.map((g) => tagged(g)));
  const elevHingeZ = -3.25 - 0.62 * 0.95;
  elevGeo.translate(0, -0.35, -elevHingeZ);
  const elevator = new THREE.Group();
  elevator.position.set(0, 0.35, elevHingeZ);
  const elevMesh = new THREE.Mesh(elevGeo, M.paint);
  elevMesh.castShadow = true;
  elevator.add(elevMesh);
  root.add(elevator);
  // Fin + rudder: vertical airfoils (profile rotated into the YZ plane).
  const finProf = airfoil(0, 0.62, 0.11, 0);
  const rudProf = airfoil(0.64, 1, 0.11, 0);
  const finSt = (h, le, c) => ({ x: h, y: 0, le, chord: c });
  const vfin = (prof) => {
    // Leading edge swept, hinge line (64% chord) vertical at z = -3.75.
    const g = wingPanel([finSt(0.35, -2.95, 1.25), finSt(1.05, -3.142, 0.95), finSt(1.78, -3.302, 0.7)], prof, 1);
    // Map span (x) -> height (y), thickness (y) -> lateral (x).
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      p.setXYZ(i, y, x, z);
    }
    g.computeVertexNormals();
    return g;
  };
  paintParts.push(tagged(vfin(finProf)));
  const rudGeo = tagged(vfin(rudProf));
  const rudHingeZ = -3.75;
  rudGeo.translate(0, 0, -rudHingeZ);
  const rudder = new THREE.Group();
  rudder.position.set(0, 0, rudHingeZ);
  const rudMesh = new THREE.Mesh(rudGeo, M.paint);
  rudMesh.castShadow = true;
  rudder.add(rudMesh);
  root.add(rudder);
  // Dark band on the rudder.
  darkParts.push(tagged(tx(new THREE.BoxGeometry(0.13, 0.12, 0.6), 0, 1.45, -3.95)));

  // ---------------- landing gear ----------------
  const gearGroups = {};
  const wheels = {};
  for (const [name, sx] of [['mainL', 1], ['mainR', -1]]) {
    const g = new THREE.Group();
    // Spring-steel leg from fuselage to axle.
    const leg = new THREE.Group();
    const legGeo = rod([sx * 0.42, -0.6, 0.78], [sx * 1.25, -0.93, 0.75], 0.045, 8);
    leg.add(new THREE.Mesh(legGeo, M.steel));
    g.add(leg);
    const wheel = new THREE.Group();
    wheel.position.set(sx * 1.35, -0.93, 0.75);
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.09, 12, 24), M.rubber);
    tire.rotation.y = Math.PI / 2;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.16, 16), M.alu);
    hub.rotation.z = Math.PI / 2;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 14), M.steel);
    disc.rotation.z = Math.PI / 2;
    disc.position.x = -sx * 0.09;
    const spinPart = new THREE.Group();
    spinPart.add(tire, hub);
    // Valve/marking so rotation is visible.
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.05, 0.05), M.white);
    mark.position.y = 0.1;
    spinPart.add(mark);
    wheel.add(spinPart, disc);
    g.add(wheel);
    root.add(g);
    gearGroups[name] = { group: g, wheel, spin: spinPart, leg, rest: wheel.position.clone(), sx };
  }
  {
    const g = new THREE.Group();
    const fork = new THREE.Group();
    fork.position.set(0, -0.05, -4.42);
    const spring = new THREE.Mesh(rod([0, 0.15, 0.25], [0, -0.05, -0.05], 0.025, 6), M.steel);
    fork.add(spring);
    const wheel = new THREE.Group();
    wheel.position.set(0, -0.12, -0.13);
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.045, 8, 16), M.rubber);
    tire.rotation.y = Math.PI / 2;
    const spinPart = new THREE.Group();
    spinPart.add(tire);
    wheel.add(spinPart);
    fork.add(wheel);
    g.add(fork);
    root.add(g);
    gearGroups.tail = { group: g, wheel, spin: spinPart, fork, rest: wheel.position.clone(), sx: 0 };
  }

  // ---------------- spray system ----------------
  const nozzles = [];
  const boomZ = WING.le - 0.86 * WING.chord, boomDrop = 0.13;
  for (const side of [1, -1]) {
    const x0 = 0.7, x1 = 5.0;
    const a = [side * x0, wingY(x0) - boomDrop, boomZ], b = [side * x1, wingY(x1) - boomDrop, boomZ];
    aluParts.push(tagged(rod(a, b, 0.022, 8)));
    // Hangers
    for (const hx of [1.2, 2.6, 4.0]) aluParts.push(tagged(rod([side * hx, wingY(hx) - 0.02, boomZ + 0.05], [side * hx, wingY(hx) - boomDrop, boomZ], 0.012, 4)));
    for (let k = 0; k <= 17; k++) {
      const x = x0 + ((x1 - x0) * k) / 17;
      const p = [side * x, wingY(x) - boomDrop - 0.04, boomZ - 0.02];
      steelParts.push(tagged(tx(new THREE.CylinderGeometry(0.012, 0.016, 0.07, 6), p[0], p[1], p[2], 0.5)));
      nozzles.push(new THREE.Vector3(p[0], p[1] - 0.04, p[2] - 0.03));
    }
  }
  // Feed pipe from belly to booms.
  aluParts.push(tagged(rod([0.7, wingY(0.7) - boomDrop, boomZ], [-0.7, wingY(0.7) - boomDrop, boomZ], 0.03, 8)));
  aluParts.push(tagged(rod([0, -0.66, 0.9], [0, wingY(0.7) - boomDrop, boomZ], 0.03, 8)));
  // Wind-driven pump under the belly.
  const pump = new THREE.Group();
  pump.position.set(0, -0.82, 0.95);
  pump.add(new THREE.Mesh(tx(new THREE.CylinderGeometry(0.09, 0.09, 0.32, 12), 0, 0, 0, Math.PI / 2), M.alu));
  const pumpFan = new THREE.Group();
  pumpFan.position.z = 0.2;
  for (let i = 0; i < 2; i++) {
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.01), M.dark);
    bl.rotation.z = (i * Math.PI) / 2;
    bl.rotation.x = 0.3;
    pumpFan.add(bl);
  }
  pump.add(pumpFan);
  root.add(pump);
  steelParts.push(tagged(rod([0, -0.66, 0.95], [0, -0.75, 0.95], 0.02, 6)));

  // ---------------- propeller ----------------
  const prop = new THREE.Group();
  prop.position.set(0, 0.03, 3.15);
  prop.add(spinnerMesh);
  const blades = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1a1b1c, roughness: 0.5, metalness: 0.3, transparent: true });
  const tipMat = new THREE.MeshStandardMaterial({ color: 0xf2c21b, roughness: 0.5, transparent: true });
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(0.06, -0.08);
    shape.quadraticCurveTo(0.6, -0.12, 1.08, -0.05);
    shape.lineTo(1.1, 0.04);
    shape.quadraticCurveTo(0.6, 0.11, 0.06, 0.07);
    const bg = new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: false });
    bg.translate(0, 0, -0.0125);
    // Twist along the blade.
    const p = bg.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      const tw = 0.55 - 0.4 * (x / 1.1);
      p.setXYZ(k, x, y * Math.cos(tw) - z * Math.sin(tw), y * Math.sin(tw) + z * Math.cos(tw));
    }
    bg.computeVertexNormals();
    const bm = new THREE.Mesh(bg, bladeMat);
    bm.castShadow = true;
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.03), tipMat);
    tip.position.x = 1.03;
    b.add(bm, tip);
    b.rotation.z = i * Math.PI;
    blades.add(b);
  }
  prop.add(blades);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.12, 40), new THREE.MeshBasicMaterial({ map: propDiscTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  disc.position.z = 0.02;
  disc.renderOrder = 11;
  prop.add(disc);
  root.add(prop);

  // ---------------- registration + pilot ----------------
  const reg = new THREE.MeshBasicMaterial({ map: registrationTexture('PR-AGW'), transparent: true, depthWrite: false });
  for (const sx of [1, -1]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.37), reg);
    pl.position.set(sx * 0.345, 0.33, -2.35);
    pl.rotation.y = sx * Math.PI / 2;
    pl.rotation.z = 0;
    // Follow the tapering tail cone.
    pl.rotation.y += sx * -0.13;
    root.add(pl);
  }
  const pilot = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.26), M.pilot);
  torso.position.set(0, 0.62, -0.42);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 10), M.helmet);
  helmet.position.set(0, 1.05, -0.38);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.05), M.dark);
  visor.position.set(0, 1.03, -0.26);
  pilot.add(torso, helmet, visor);
  root.add(pilot);

  // ---------------- cockpit interior ----------------
  const cockpit = new THREE.Group();
  const floor = tx(new THREE.BoxGeometry(0.95, 0.03, 1.5), 0, -0.25, -0.25);
  interiorParts.push(tagged(floor));
  for (const sx of [1, -1]) interiorParts.push(tagged(tx(new THREE.BoxGeometry(0.04, 0.85, 1.45), sx * 0.5, 0.2, -0.25)));
  // Side consoles
  for (const sx of [1, -1]) interiorParts.push(tagged(tx(new THREE.BoxGeometry(0.12, 0.08, 0.9), sx * 0.42, 0.42, -0.1)));
  // Tubular cage inside
  for (const [a, b] of [[[-0.48, 0.6, 0.35], [-0.42, 1.3, 0.1]], [[0.48, 0.6, 0.35], [0.42, 1.3, 0.1]], [[-0.48, 0.55, -0.9], [0.48, 0.55, -0.9]]]) interiorParts.push(tagged(rod(a, b, 0.02, 6)));
  // Seat
  const seat = new THREE.Group();
  seat.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.48), M.seat));
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.1), M.seat);
  back.position.set(0, 0.38, -0.25);
  back.rotation.x = -0.12;
  seat.add(back);
  for (const sx of [1, -1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.01), new THREE.MeshStandardMaterial({ color: 0x8a6a1a, roughness: 0.8 }));
    strap.position.set(sx * 0.12, 0.42, -0.19);
    strap.rotation.x = -0.12;
    seat.add(strap);
  }
  seat.position.set(0, 0.05, -0.55);
  cockpit.add(seat);
  // Instrument panel with live canvas texture + glareshield.
  const panelMat = new THREE.MeshStandardMaterial({ map: panelTexture, roughness: 0.6, emissive: 0xffffff, emissiveMap: panelTexture, emissiveIntensity: 0.18 });
  const panelMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.46), panelMat);
  panelMesh.position.set(0, 0.47, 0.36);
  panelMesh.rotation.y = Math.PI;
  panelMesh.rotation.x = 0.18;
  cockpit.add(panelMesh);
  interiorParts.push(tagged(tx(new THREE.BoxGeometry(0.96, 0.5, 0.06), 0, 0.47, 0.4, -0.18)));
  const glare = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.04, 0.22), M.dark);
  glare.position.set(0, 0.72, 0.36);
  cockpit.add(glare);
  // Lightbar (swath guidance LEDs) on the glareshield.
  const lightbar = new THREE.Group();
  lightbar.position.set(0, 0.76, 0.32);
  const leds = [];
  for (let i = -7; i <= 7; i++) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.018, 0.012), new THREE.MeshBasicMaterial({ color: 0x222222 }));
    led.position.x = -i * 0.026; // pilot faces +Z: +X is left
    lightbar.add(led);
    leds.push(led);
  }
  lightbar.add(new THREE.Mesh(tx(new THREE.BoxGeometry(0.42, 0.032, 0.03), 0, 0, 0.012), M.dark));
  cockpit.add(lightbar);
  // Stick (pivot at the floor).
  const stick = new THREE.Group();
  stick.position.set(0, -0.22, -0.12);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.62, 8), M.steel);
  shaft.position.y = 0.31;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.13, 10), M.rubber);
  grip.position.y = 0.66;
  const btn = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.02), M.red);
  btn.position.set(0, 0.73, 0.012);
  stick.add(shaft, grip, btn);
  cockpit.add(stick);
  // Rudder pedals
  const pedals = [];
  for (const sx of [1, -1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.03), M.steel);
    p.position.set(sx * 0.17, -0.12, 0.42);
    p.rotation.x = -0.6;
    cockpit.add(p);
    pedals.push(p);
  }
  // Throttle quadrant (left console) + spray valve handle (right console).
  const throttle = new THREE.Group();
  throttle.position.set(0.42, 0.46, 0.05);
  const tl = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 6), M.steel);
  tl.position.y = 0.09;
  const tk = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), M.dark);
  tk.position.y = 0.18;
  throttle.add(tl, tk);
  cockpit.add(throttle);
  const valve = new THREE.Group();
  valve.position.set(-0.42, 0.46, 0.0);
  const vl = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.16, 6), M.steel);
  vl.position.y = 0.08;
  const vk = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.03), M.red);
  vk.position.y = 0.16;
  valve.add(vl, vk);
  cockpit.add(valve);
  root.add(cockpit);

  // ---------------- merge static parts ----------------
  const addMerged = (parts, mat, shadow = true) => {
    if (!parts.length) return null;
    const g = mergeGeometries(parts);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = shadow; m.receiveShadow = true;
    root.add(m);
    return m;
  };
  addMerged(paintParts, M.paint);
  addMerged(darkParts, M.dark);
  addMerged(aluParts, M.alu);
  addMerged(steelParts, M.steel);
  addMerged(interiorParts, M.interior, false);
  root.add(glassMesh);

  root.traverse((o) => { if (o.isMesh && o.castShadow === undefined) o.castShadow = true; });

  return {
    root, M,
    prop, blades, bladeMats: [bladeMat, tipMat], disc,
    ailerons, flaps, elevator, rudder,
    gear: gearGroups,
    stick, pedals, throttle, valve, leds, panelMesh,
    pumpFan, nozzles, pilot, cockpit, glassMesh,
    eye: new THREE.Vector3(0, 0.98, -0.42),
    // Service points (body frame) used by the badeco.
    fuelFiller: new THREE.Vector3(2.4, wingY(2.4) + 0.14, -0.4),
    hopperPort: new THREE.Vector3(0.6, -0.35, -1.05),
  };
}
