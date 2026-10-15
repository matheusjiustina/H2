// Procedural agricultural monoplane modelled on the Embraer EMB-202 Ipanema
// (own registration and markings). Body frame: +Z nose, +Y up, +X left wing;
// origin = CG. Span 11.7 m, length ~7.6 m, low wing (6° dihedral), raised
// cabin behind the hopper, tall tubular main gear, spray booms under the
// trailing edge, wind-driven pump under the belly.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvas, canvasTexture } from '../core/textures.js';
import { rng } from '../core/math.js';
import { FLIGHT } from '../config.js';

const DIH = Math.tan((6 * Math.PI) / 180);
export const WING = { rootX: 0.55, tipX: 5.85, rootY: -0.55, le: 0.85, chord: 1.7 };
export const wingY = (x) => WING.rootY + Math.max(0, Math.abs(x) - WING.rootX) * DIH;

export const PAINT = '#ff8700'; // Ipanema orange
const NAVY = '#16285e';
const DECK = '#2b2f35';

// --------------------------------------------------------------------------
// Textures
function speckle(g, x, y, w, h, n, seed) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const v = 200 + Math.floor(r() * 50);
    g.fillStyle = `rgba(${v},${v - 6},${v - 20},0.18)`;
    g.fillRect(x + r() * w, y + r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

function paintWearTexture() {
  const S = 512;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  const r = rng(31);
  for (let i = 0; i < 1800; i++) {
    const v = 222 + Math.floor(r() * 33);
    g.fillStyle = `rgba(${v},${v - 4},${v - 12},0.4)`;
    g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2);
  }
  // Chordwise streaks (spray residue) and a few chips.
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(110,100,85,${0.05 + r() * 0.1})`;
    g.fillRect(r() * S, r() * S, 1 + r() * 2, 20 + r() * 90);
  }
  for (let i = 0; i < 24; i++) {
    g.fillStyle = 'rgba(70,70,70,0.3)';
    g.beginPath(); g.arc(r() * S, r() * S, 1 + r() * 2.2, 0, Math.PI * 2); g.fill();
  }
  return canvasTexture(c, { repeat: true });
}

// Livery: fuselage, fin and rudder use a side projection (z, y) of the body.
// Top half of the canvas = left side (+X, nose to the left), bottom half =
// right side (-X, nose to the right) so lettering reads normally on both.
const LV = { Z0: -4.65, Z1: 3.5, Y0: -0.95, Y1: 1.95, W: 2048, H: 1024, M: 6 };
LV.kx = LV.W / (LV.Z1 - LV.Z0);
LV.ky = (LV.H / 2 - 2 * LV.M) / (LV.Y1 - LV.Y0);
const lvPix = (side, z, y) => [
  side > 0 ? (LV.Z1 - z) * LV.kx : (z - LV.Z0) * LV.kx,
  (side > 0 ? 0 : LV.H / 2) + LV.M + (LV.Y1 - y) * LV.ky,
];

// Fuselage top line (for the dark deck ahead of the windshield).
const deckTop = (z) => {
  const pts = [[0.45, 0.64], [1.2, 0.62], [2.1, 0.58], [2.9, 0.52], [3.12, 0.44]];
  if (z <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (z <= pts[i][0]) { const [z0, y0] = pts[i - 1], [z1, y1] = pts[i]; return y0 + ((z - z0) / (z1 - z0)) * (y1 - y0); }
  }
  return pts[pts.length - 1][1];
};

function liveryTexture(reg) {
  const c = canvas(LV.W, LV.H);
  const g = c.getContext('2d');
  for (const side of [1, -1]) {
    const P = (z, y) => lvPix(side, z, y);
    const oy = side > 0 ? 0 : LV.H / 2;
    const poly = (pts, fill) => {
      g.beginPath();
      pts.forEach(([z, y], i) => { const [px, py] = P(z, y); if (i) g.lineTo(px, py); else g.moveTo(px, py); });
      g.closePath();
      g.fillStyle = fill; g.fill();
    };
    const line = (pts, col, w) => {
      g.beginPath();
      pts.forEach(([z, y], i) => { const [px, py] = P(z, y); if (i) g.lineTo(px, py); else g.moveTo(px, py); });
      g.strokeStyle = col; g.lineWidth = w; g.stroke();
    };
    // Base paint + light belly grime.
    g.fillStyle = PAINT;
    g.fillRect(0, oy, LV.W, LV.H / 2);
    const [, belly] = P(0, -0.35);
    const grd = g.createLinearGradient(0, belly, 0, oy + LV.H / 2);
    grd.addColorStop(0, 'rgba(90,60,30,0)');
    grd.addColorStop(1, 'rgba(90,60,30,0.22)');
    g.fillStyle = grd;
    g.fillRect(0, belly, LV.W, oy + LV.H / 2 - belly);
    // Dark deck over the hopper, from the windshield to the cowling.
    const deck = [];
    for (let z = 0.4; z <= 2.8; z += 0.1) deck.push([z, deckTop(z) - 0.085]);
    deck.push([2.8, 2], [0.4, 2]);
    poly(deck, DECK);
    // Stripes: navy band with the rising check at the wing root, a gold
    // pinstripe and a thin navy line under it.
    const band = (cl, hh, off = 0) => {
      const up = cl.map(([z, y], i) => [z, y + off + hh[i]]);
      const lo = cl.map(([z, y], i) => [z, y + off - hh[i]]).reverse();
      return up.concat(lo);
    };
    const cl = [[3.0, -0.26], [1.15, -0.26], [0.25, 0.07], [-1.0, 0.16], [-2.5, 0.23], [-3.95, 0.29]];
    poly(band(cl, [0.075, 0.075, 0.062, 0.05, 0.036, 0.018]), NAVY);
    const cl2 = cl.slice(0, 5);
    poly(band(cl2, [0.013, 0.013, 0.012, 0.011, 0.009], -0.115), '#ffd23c');
    poly(band(cl2.slice(0, 4), [0.022, 0.022, 0.02, 0.016], -0.165), NAVY);
    // Brazilian flag across fin and rudder (above the tail cone).
    {
      g.save();
      const [x0, y0] = P(-2.86, 1.92), [x1, y1] = P(-4.35, 0.6);
      g.beginPath(); g.rect(Math.min(x0, x1), y0, Math.abs(x1 - x0), y1 - y0); g.clip();
      g.fillStyle = '#ffffff';
      g.fillRect(Math.min(x0, x1), y0, Math.abs(x1 - x0), y1 - y0);
      poly([[-2.86, 1.95], [-4.4, 1.95], [-4.4, 0.66], [-2.86, 0.66]], '#079a3d');
      const zc = -3.62, yc = 1.27;
      poly([[zc + 0.62, yc], [zc, yc + 0.5], [zc - 0.62, yc], [zc, yc - 0.5]], '#fedf00');
      const [cx, cy] = P(zc, yc);
      g.fillStyle = '#002776';
      g.beginPath(); g.ellipse(cx, cy, 0.27 * LV.kx, 0.27 * LV.ky, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ffffff'; g.lineWidth = 0.045 * LV.ky;
      g.beginPath(); g.ellipse(cx + (side > 0 ? 0.25 : -0.25) * LV.kx, cy + 0.42 * LV.ky, 0.6 * LV.kx, 0.5 * LV.ky, 0, Math.PI * 1.22, Math.PI * 1.62); g.stroke();
      g.restore();
      line([[-2.86, 0.63], [-4.4, 0.63]], '#ffffff', 0.03 * LV.ky);
    }
    // Panel seams and rivet rows.
    const seams = [
      [[2.55, -0.45], [2.55, 0.5]], [[1.75, -0.6], [1.75, 0.6]], [[0.45, -0.7], [0.45, 0.64]],
      [[-1.35, -0.5], [-1.35, 0.78]], [[-2.75, -0.15], [-2.75, 0.6]], [[-3.6, 0.03], [-3.6, 0.45]],
      [[2.9, 0.05], [1.75, 0.05]],
    ];
    for (const s of seams) {
      line(s, 'rgba(70,35,0,0.38)', 2);
      const [[za, ya], [zb, yb]] = s;
      const n = Math.max(2, Math.round(Math.hypot(za - zb, ya - yb) / 0.06));
      g.fillStyle = 'rgba(80,40,0,0.35)';
      for (let k = 0; k <= n; k++) {
        const [px, py] = P(za + ((zb - za) * k) / n + 0.025, ya + ((yb - ya) * k) / n);
        g.fillRect(px - 1, py - 1, 2, 2);
      }
    }
    // Access doors (rear fuselage, cowling), cooling louvres.
    const door = (z0, z1, y0, y1) => line([[z0, y0], [z1, y0], [z1, y1], [z0, y1], [z0, y0]], 'rgba(70,35,0,0.42)', 2);
    door(-1.65, -1.15, -0.32, -0.05);
    door(2.35, 1.95, 0.12, 0.36);
    for (let k = 0; k < 5; k++) line([[2.45 - k * 0.05, -0.28], [2.45 - k * 0.05, -0.12]], 'rgba(20,15,10,0.6)', 3);
    // Exhaust soot behind the stacks.
    {
      const [ax, ay] = P(1.75, -0.48), [bx] = P(0.2, -0.48);
      const sg = g.createLinearGradient(ax, 0, bx, 0);
      sg.addColorStop(0, 'rgba(35,25,15,0.5)');
      sg.addColorStop(1, 'rgba(35,25,15,0)');
      g.fillStyle = sg;
      g.beginPath(); g.ellipse((ax + bx) / 2, ay + 4, Math.abs(bx - ax) / 2, 0.09 * LV.ky, 0, 0, Math.PI * 2); g.fill();
    }
    // Lettering (always drawn upright).
    const text = (z, y, str, hM, col, font = 'bold', align = 'center') => {
      const [px, py] = P(z, y);
      g.save();
      g.font = `${font} ${Math.round(hM * LV.ky * 1.25)}px Arial`;
      g.textAlign = align; g.textBaseline = 'middle';
      g.fillStyle = col;
      g.setTransform(1, 0, 0, 1, px, py);
      g.scale(LV.kx / LV.ky, 1);
      g.fillText(str, 0, 0);
      g.restore();
    };
    text(-2.3, 0.44, reg, 0.27, NAVY);
    text(1.15, 0.27, 'AGRO WINGS', 0.085, NAVY, 'italic bold');
    text(-0.95, 0.47, 'AVIAÇÃO AGRÍCOLA', 0.035, NAVY, 'bold');
    speckle(g, 0, oy, LV.W, LV.H / 2, 3500, side > 0 ? 7 : 8);
  }
  return canvasTexture(c, { aniso: 8 });
}

// Assign livery UVs to a non-indexed geometry (per triangle side choice).
function liveryUV(geo) {
  const p = geo.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let t = 0; t < p.count; t += 3) {
    const cx = p.getX(t) + p.getX(t + 1) + p.getX(t + 2);
    const side = cx >= 0 ? 1 : -1;
    for (let k = t; k < t + 3; k++) {
      const [px, py] = lvPix(side, p.getZ(k), p.getY(k));
      uv[k * 2] = px / LV.W;
      uv[k * 2 + 1] = 1 - py / LV.H;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

function propDiscTexture() {
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, S * 0.08, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(30,30,30,0.0)');
  grd.addColorStop(0.2, 'rgba(30,30,30,0.32)');
  grd.addColorStop(0.85, 'rgba(40,40,40,0.24)');
  grd.addColorStop(0.92, 'rgba(240,200,40,0.45)');
  grd.addColorStop(0.97, 'rgba(240,200,40,0.2)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  return canvasTexture(c, { srgb: true });
}

function ribTexture(base, groove, n = 10) {
  const c = canvas(128, 256);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < n; i++) {
    const y = ((i + 0.5) / n) * 256;
    const gr = g.createLinearGradient(0, y - 8, 0, y + 8);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(0.5, groove);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, y - 8, 128, 16);
  }
  speckle(g, 0, 0, 128, 256, 400, 5);
  return canvasTexture(c);
}

function feltTexture() {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#c2c8ce';
  g.fillRect(0, 0, 256, 256);
  const r = rng(11);
  for (let i = 0; i < 5000; i++) {
    const v = 150 + Math.floor(r() * 80);
    g.fillStyle = `rgba(${v},${v + 4},${v + 10},0.35)`;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 2.5, 1 + r() * 2.5);
  }
  return canvasTexture(c, { repeat: true });
}

// --------------------------------------------------------------------------
// Geometry helpers
function superRing(hw, yb, yt, n, p, arc = null) {
  const out = [];
  const mid = (yt + yb) / 2, hh = (yt - yb) / 2;
  const a0 = arc ? arc[0] : 0, a1 = arc ? arc[1] : Math.PI * 2;
  for (let k = 0; k <= n; k++) {
    const a = a0 + (k / n) * (a1 - a0);
    const c = Math.cos(a), s = Math.sin(a);
    out.push([hw * Math.sign(c) * Math.abs(c) ** (2 / p), mid + hh * Math.sign(s) * Math.abs(s) ** (2 / p)]);
  }
  return out;
}

// Loft along Z through stations {z, hw, yb, yt, p}. Vertex colours carry a
// subtle grime gradient (darker belly).
function loftZ(stations, n = 24, grime = null, arc = null) {
  const pos = [], uv = [], col = [], idx = [];
  const len = stations[0].z - stations[stations.length - 1].z;
  stations.forEach((s) => {
    const ring = superRing(s.hw, s.yb, s.yt, n, s.p ?? 4, arc);
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
      const g = (yc < 0 ? 0.78 : 1) * grime;
      col.push(g, g, g);
    });
  });
  for (let si = 0; si < stations.length - 1; si++) {
    for (let k = 0; k < n - 1; k++) {
      const a = si * n + k, b = a + 1, c = a + n, d = c + 1;
      if (side > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  }
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
  if (g.attributes.uv1) g.deleteAttribute('uv1');
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
export function createAircraftModel(panel) {
  const root = new THREE.Group();
  root.name = 'aircraft';
  const wear = paintWearTexture();
  const M = {
    paint: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(PAINT), map: wear, vertexColors: true, roughness: 0.38, metalness: 0.0, clearcoat: 0.32, clearcoatRoughness: 0.28, envMapIntensity: 0.85 }),
    livery: new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: liveryTexture('PR-AGW'), vertexColors: true, roughness: 0.38, metalness: 0.0, clearcoat: 0.32, clearcoatRoughness: 0.28, envMapIntensity: 0.85 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.6, metalness: 0.1, vertexColors: true }),
    deck: new THREE.MeshStandardMaterial({ color: new THREE.Color('#1c1f24'), roughness: 0.93, metalness: 0.0, envMapIntensity: 0.35 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xc4c8cb, roughness: 0.3, metalness: 0.9 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x55595d, roughness: 0.45, metalness: 0.85 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92, metalness: 0 }),
    gloss: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.25, metalness: 0.1 }),
    hub: new THREE.MeshStandardMaterial({ color: 0xe9e9e6, roughness: 0.35, metalness: 0.3 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x9fb4c0, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.2, envMapIntensity: 1.8, depthWrite: false, side: THREE.DoubleSide }),
    interior: new THREE.MeshStandardMaterial({ color: 0xaeb6be, roughness: 0.7, metalness: 0.1 }),
    headliner: new THREE.MeshStandardMaterial({ color: 0xffffff, map: feltTexture(), roughness: 0.95 }),
    floor: new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.85, metalness: 0.2 }),
    seat: new THREE.MeshStandardMaterial({ color: 0xffffff, map: ribTexture('#b3602a', 'rgba(60,25,8,0.55)'), roughness: 0.85 }),
    harness: new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.8 }),
    red: new THREE.MeshStandardMaterial({ color: 0xc8261b, roughness: 0.45, emissive: 0x330000 }),
    green: new THREE.MeshStandardMaterial({ color: 0x1f9a3a, roughness: 0.45, emissive: 0x002200 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xf2b400, roughness: 0.45 }),
    white: new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4 }),
    pilot: new THREE.MeshStandardMaterial({ color: 0x3c4d63, roughness: 0.85 }),
    helmet: new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.35 }),
  };

  const paintParts = [], liveryParts = [], darkParts = [], deckParts = [], aluParts = [], steelParts = [], rubberParts = [], interiorParts = [], glossParts = [];

  // ---------------- fuselage ----------------
  const grime = (x, y) => Math.max(0.6, 1 - Math.max(0, -y - 0.25) * 0.3);
  // Three lofts: cowling + hopper (closed), cabin (open on top so the pilot
  // sees the panel; the glass sits on the U-shaped sides), tail cone.
  const S = (z, hw, yb, yt, p) => ({ z, hw, yb, yt, p });
  const fwd = loftZ([
    S(3.13, 0.36, -0.33, 0.4, 2.6), S(3.02, 0.44, -0.44, 0.48, 3), S(2.75, 0.5, -0.53, 0.54, 3.5),
    S(2.1, 0.54, -0.6, 0.58, 4), S(1.2, 0.56, -0.67, 0.62, 4.5), S(0.45, 0.57, -0.69, 0.64, 4.5),
  ], 32, grime);
  const cabinArc = [Math.PI * 0.75, Math.PI * 2.25];
  const cab = loftZ([S(0.45, 0.57, -0.69, 0.64, 4.5), S(-0.2, 0.565, -0.66, 0.65, 4.5), S(-0.95, 0.55, -0.6, 0.67, 4.5)], 28, grime, cabinArc);
  const aftCone = loftZ([
    S(-0.95, 0.55, -0.6, 0.67, 4.5), S(-1.35, 0.49, -0.48, 0.78, 4), S(-2.4, 0.33, -0.22, 0.62, 3.5),
    S(-3.5, 0.17, 0.02, 0.46, 3), S(-4.15, 0.07, 0.12, 0.36, 3), S(-4.32, 0.01, 0.2, 0.3, 3),
  ], 32, grime);
  for (const g of [fwd, cab, aftCone]) liveryParts.push(liveryUV(tagged(g)));
  // Cabin side sills along the open top edge.
  for (const sx of [1, -1]) liveryParts.push(liveryUV(tagged(tx(new THREE.BoxGeometry(0.05, 0.06, 1.42), sx * 0.5, 0.62, -0.25))));
  // Hopper lid (black box with hinge) and loading coupler on the deck.
  darkParts.push(tagged(tx(new THREE.BoxGeometry(0.46, 0.12, 0.44), 0, 0.66, 1.4, -0.03)));
  darkParts.push(tagged(tx(new THREE.BoxGeometry(0.5, 0.03, 0.06), 0, 0.64, 1.15)));
  darkParts.push(tagged(tx(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 16), 0, 0.64, 2.2)));
  // Hopper quick-fill couplers either side, aft of the wing root.
  for (const sx of [1, -1]) darkParts.push(tagged(tx(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 12), sx * 0.58, -0.35, -1.05, 0, 0, Math.PI / 2)));
  aluParts.push(tagged(rod([0.5, -0.35, -1.05], [0.45, -0.1, 0.9], 0.03, 8)));
  // Exhaust stacks under the cowling.
  for (const sx of [1, -1]) steelParts.push(tagged(rod([sx * 0.48, -0.42, 2.25], [sx * 0.6, -0.56, 1.72], 0.05, 10)));
  // Cowl front: dark inlet ring round the spinner + two cheek inlets.
  darkParts.push(tagged(tx(new THREE.RingGeometry(0.2, 0.33, 28), 0, 0.03, 3.135)));
  for (const sx of [1, -1]) darkParts.push(tagged(tx(new THREE.CircleGeometry(0.07, 14), sx * 0.22, -0.22, 3.1, -0.15)));
  // Ogive spinner.
  const spinPts = [[0.215, 0], [0.212, 0.08], [0.195, 0.2], [0.155, 0.31], [0.1, 0.4], [0.04, 0.46], [0.0, 0.48]].map(([r, z]) => new THREE.Vector2(r, z));
  const spinner = new THREE.LatheGeometry(spinPts, 24);
  spinner.rotateX(Math.PI / 2);
  const spinnerMesh = new THREE.Mesh(tagged(spinner), M.paint);
  // Matte anti-glare panel over the hopper deck (no clearcoat sky glare seen
  // from the cockpit).
  {
    const st = [[0.42, 0.57, 0.645], [1.2, 0.565, 0.625], [2.1, 0.545, 0.585], [2.75, 0.505, 0.545]];
    deckParts.push(tagged(loftZ(st.map(([z, hw, yt]) => ({ z, hw: hw + 0.006, yb: -0.69 + 0.0, yt: yt + 0.005, p: 4.5 })).reverse(), 24, null, [Math.PI * 0.3, Math.PI * 0.7])));
  }

  // ---------------- cabin ----------------
  const cz0 = -0.95, cz1 = 0.45, roof = 1.34;
  const glassG = [];
  const quad = (p, order = [0, 1, 2, 0, 2, 3]) => {
    const q = new THREE.BufferGeometry();
    q.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    q.setIndex(order);
    q.computeVertexNormals();
    return q;
  };
  glassG.push(quad([-0.5, 0.64, cz1, 0.5, 0.64, cz1, 0.44, roof - 0.02, 0.12, -0.44, roof - 0.02, 0.12]));
  for (const sx of [1, -1]) glassG.push(quad([sx * 0.5, 0.64, cz1, sx * 0.44, roof - 0.02, 0.12, sx * 0.44, roof - 0.02, cz0, sx * 0.53, 0.64, cz0]));
  glassG.push(quad([-0.53, 0.64, cz0, 0.53, 0.64, cz0, 0.44, roof - 0.02, cz0, -0.44, roof - 0.02, cz0], [0, 2, 1, 0, 3, 2]));
  const glassMesh = new THREE.Mesh(mergeGeometries(glassG.map((g) => tagged(g))), M.glass);
  glassMesh.renderOrder = 10;
  // Canopy frame: painted outside, interior grey inside (two concentric tubes).
  const bars = [
    [[-0.5, 0.64, cz1], [-0.44, roof, 0.12]], [[0.5, 0.64, cz1], [0.44, roof, 0.12]],
    [[-0.44, roof, 0.12], [-0.44, roof, cz0]], [[0.44, roof, 0.12], [0.44, roof, cz0]],
    [[-0.44, roof, 0.12], [0.44, roof, 0.12]], [[-0.44, roof, cz0], [0.44, roof, cz0]],
    [[-0.53, 0.64, cz0], [-0.44, roof, cz0]], [[0.53, 0.64, cz0], [0.44, roof, cz0]],
    [[-0.52, 0.64, -0.3], [-0.44, roof, -0.3]], [[0.52, 0.64, -0.3], [0.44, roof, -0.3]],
    [[-0.5, 0.64, cz1], [0.5, 0.64, cz1]],
  ];
  const cabC = new THREE.Vector3(0, 0.95, -0.3);
  for (const [a, b] of bars) {
    const mid = new THREE.Vector3(...a).add(new THREE.Vector3(...b)).multiplyScalar(0.5);
    const inw = cabC.clone().sub(mid).normalize().multiplyScalar(0.012);
    paintParts.push(tagged(rod(a, b, 0.026, 6)));
    interiorParts.push(tagged(rod([a[0] + inw.x, a[1] + inw.y, a[2] + inw.z], [b[0] + inw.x, b[1] + inw.y, b[2] + inw.z], 0.022, 6)));
  }
  // Centre windshield post (wire-cutter strut).
  darkParts.push(tagged(rod([0, 0.69, cz1 - 0.02], [0, roof, 0.12], 0.014, 6)));
  // Opaque roof: paint outside, felt headliner inside.
  liveryParts.push(liveryUV(tagged(tx(new THREE.BoxGeometry(0.94, 0.04, 1.12), 0, roof + 0.012, -0.415))));
  // Turtle deck between cabin and fin.
  liveryParts.push(liveryUV(tagged(loftZ([
    { z: cz0 + 0.02, hw: 0.45, yb: 0.6, yt: roof - 0.02, p: 3 },
    { z: -1.8, hw: 0.36, yb: 0.6, yt: 0.95, p: 3 },
    { z: -2.6, hw: 0.22, yb: 0.55, yt: 0.66, p: 3 },
  ], 16, () => 0.97))));
  // Deflector cable roof -> fin top, and the wire cutter ahead of the windshield.
  steelParts.push(tagged(rod([0, roof + 0.03, -0.1], [0, 1.78, -3.6], 0.007, 4)));
  steelParts.push(tagged(rod([0, 0.66, 0.62], [0, roof + 0.16, 0.2], 0.022, 5)));
  steelParts.push(tagged(tx(new THREE.BoxGeometry(0.02, 0.45, 0.07), 0, roof + 0.14, 0.17, 0.6)));

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
    wingParts.push(wingPanel([st(0.2), st(WING.rootX), st(3.2), st(WING.tipX)], main, side));
    wingParts.push(wingPanel([st(0.2), st(WING.rootX + 0.05)], aft, side));
    const fl = wingPanel([st(WING.rootX + 0.05), st(3.18)], aft, side);
    flaps.push(surfaceMesh(fl, WING.rootX + 0.05, 3.18, side));
    const al = wingPanel([st(3.24), st(WING.tipX)], aft, side);
    ailerons.push(surfaceMesh(al, 3.24, WING.tipX, side));
    // Upturned (Hoerner-style) wingtip.
    wingParts.push(wingPanel([
      { x: WING.tipX, y: leY(WING.tipX), le: WING.le, chord: WING.chord },
      { x: WING.tipX + 0.12, y: leY(WING.tipX) + 0.16, le: WING.le - 0.08, chord: WING.chord * 0.9 },
      { x: WING.tipX + 0.2, y: leY(WING.tipX) + 0.36, le: WING.le - 0.24, chord: WING.chord * 0.72 },
    ], airfoil(0, 1, 0.1), side));
    // Nav light in a clear fairing at the tip leading edge (red left, green right).
    const nl = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), side > 0 ? M.red : M.green);
    nl.position.set(side * (WING.tipX + 0.06), leY(WING.tipX) + 0.08, WING.le - 0.08);
    root.add(nl);
    // Black non-slip walkway at the root (where the badeco steps).
    deckParts.push(tagged(tx(new THREE.BoxGeometry(0.55, 0.012, 1.2), side * 0.88, leY(0.88) + 0.135, 0.0, 0, 0, side * Math.atan(DIH))));
    // Fuel filler cap on top of the wing tank.
    darkParts.push(tagged(tx(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 14), side * 2.4, leY(2.4) + 0.125, -0.4)));
  }
  paintParts.push(...wingParts.map((g) => tagged(g)));

  // ---------------- tail ----------------
  const stabStations = () => [
    { x: 0.1, y: 0.34, le: -3.25, chord: 0.95 },
    { x: 1.85, y: 0.36, le: -3.405, chord: 0.7 },
  ];
  const elevParts = [];
  for (const side of [1, -1]) {
    paintParts.push(tagged(wingPanel(stabStations(), airfoil(0, 0.6, 0.1, 0), side)));
    elevParts.push(wingPanel(stabStations(), airfoil(0.62, 1, 0.1, 0), side));
    // Stabiliser struts (to the fin and under to the tail cone).
    steelParts.push(tagged(rod([side * 1.0, 0.33, -3.6], [0, 1.1, -3.75], 0.018, 6)));
    steelParts.push(tagged(rod([side * 0.9, 0.31, -3.55], [side * 0.08, 0.06, -3.4], 0.016, 6)));
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
    const g = wingPanel([finSt(0.35, -2.95, 1.25), finSt(1.05, -3.142, 0.95), finSt(1.78, -3.302, 0.7)], prof, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      p.setXYZ(i, y, x, z);
    }
    g.computeVertexNormals();
    return g;
  };
  liveryParts.push(liveryUV(tagged(vfin(finProf))));
  // Dorsal fillet from the turtle deck into the fin.
  liveryParts.push(liveryUV(tagged(loftZ([
    { z: -2.55, hw: 0.05, yb: 0.5, yt: 0.67, p: 2.5 },
    { z: -2.95, hw: 0.06, yb: 0.48, yt: 0.72, p: 2.5 },
    { z: -3.05, hw: 0.04, yb: 0.47, yt: 0.6, p: 2.5 },
  ], 10))));
  const rudGeo = liveryUV(tagged(vfin(rudProf)));
  const rudHingeZ = -3.75;
  rudGeo.translate(0, 0, -rudHingeZ);
  const rudder = new THREE.Group();
  rudder.position.set(0, 0, rudHingeZ);
  const rudMesh = new THREE.Mesh(rudGeo, M.livery);
  rudMesh.castShadow = true;
  rudder.add(rudMesh);
  root.add(rudder);
  // Tail strobe.
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), M.white);
  strobe.position.set(0, 0.26, -4.33);
  root.add(strobe);

  // ---------------- landing gear ----------------
  // Wheel positions follow the physics contact points (src/config.js).
  const gearCfg = Object.fromEntries(FLIGHT.gear.map((g) => [g.name, g]));
  const gearGroups = {};
  const TIRE_R = 0.235, TIRE_T = 0.09; // outer radius 0.325
  for (const [name, sx] of [['mainL', 1], ['mainR', -1]]) {
    const cfg = gearCfg[name];
    const ax = cfg.p[0], ay = cfg.p[1] + TIRE_R + TIRE_T, az = cfg.p[2];
    const g = new THREE.Group();
    // Tubular A-frame: fore and aft tubes from the lower longeron to the axle,
    // plus an inner strut. Scaled vertically with the spring compression.
    const attachY = -0.64;
    const leg = new THREE.Group();
    leg.position.y = attachY;
    const L = (a, b, r) => rod([a[0], a[1] - attachY, a[2]], [b[0], b[1] - attachY, b[2]], r, 8);
    const axIn = ax - sx * 0.1;
    const legGeo = mergeGeometries([
      tagged(L([sx * 0.42, attachY, az + 0.42], [axIn, ay, az + 0.03], 0.038)),
      tagged(L([sx * 0.42, attachY, az - 0.42], [axIn, ay, az - 0.03], 0.038)),
      tagged(L([sx * 0.12, attachY - 0.05, az], [axIn - sx * 0.12, ay + 0.1, az], 0.03)),
      tagged(L([axIn, ay, az], [ax - sx * 0.02, ay, az], 0.04)),
    ]);
    const legMesh = new THREE.Mesh(legGeo, M.paint);
    legMesh.castShadow = true;
    leg.add(legMesh);
    g.add(leg);
    const wheel = new THREE.Group();
    wheel.position.set(ax, ay, az);
    const tire = new THREE.Mesh(new THREE.TorusGeometry(TIRE_R, TIRE_T, 14, 28), M.rubber);
    tire.rotation.y = Math.PI / 2;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.17, 18), M.hub);
    hub.rotation.z = Math.PI / 2;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.04, 12), M.alu);
    cap.rotation.z = Math.PI / 2;
    cap.position.x = sx * 0.1;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 16), M.steel);
    disc.rotation.z = Math.PI / 2;
    disc.position.x = -sx * 0.1;
    const spinPart = new THREE.Group();
    spinPart.add(tire, hub, cap);
    for (let k = 0; k < 5; k++) {
      const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.025, 0.025), M.steel);
      const a = (k / 5) * Math.PI * 2;
      bolt.position.set(sx * 0.09, Math.cos(a) * 0.1, Math.sin(a) * 0.1);
      spinPart.add(bolt);
    }
    wheel.add(spinPart, disc);
    g.add(wheel);
    root.add(g);
    gearGroups[name] = { group: g, wheel, spin: spinPart, leg, legH: attachY - ay, rest: wheel.position.clone(), sx };
  }
  {
    const cfg = gearCfg.tail;
    const g = new THREE.Group();
    // Leaf spring from the tail post down/aft to the steerable fork.
    const fz = cfg.p[2] + 0.1, fy = cfg.p[1] + 0.135 + 0.085;
    darkParts.push(tagged(rod([0, 0.07, -4.02], [0, fy + 0.02, fz], 0.03, 6)));
    const fork = new THREE.Group();
    fork.position.set(0, fy, fz);
    const forkGeo = mergeGeometries([
      tagged(rod([0, 0.02, 0], [0.05, -0.08, -0.1], 0.012, 5)), tagged(rod([0, 0.02, 0], [-0.05, -0.08, -0.1], 0.012, 5)),
    ]);
    fork.add(new THREE.Mesh(forkGeo, M.steel));
    const wheel = new THREE.Group();
    wheel.position.set(0, -0.085, -0.1);
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.045, 8, 18), M.rubber);
    tire.rotation.y = Math.PI / 2;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.07, 12), M.hub);
    hub.rotation.z = Math.PI / 2;
    const spinPart = new THREE.Group();
    spinPart.add(tire, hub);
    wheel.add(spinPart);
    fork.add(wheel);
    g.add(fork);
    root.add(g);
    gearGroups.tail = { group: g, wheel, spin: spinPart, fork, rest: wheel.position.clone(), sx: 0 };
  }

  // ---------------- spray system ----------------
  const nozzles = [];
  const boomZ = WING.le - 0.86 * WING.chord, boomDrop = 0.14;
  for (const side of [1, -1]) {
    const x0 = 0.7, x1 = 5.0;
    const a = [side * x0, wingY(x0) - boomDrop, boomZ], b = [side * x1, wingY(x1) - boomDrop, boomZ];
    aluParts.push(tagged(rod(a, b, 0.024, 8)));
    // End cap + hangers (streamlined brackets).
    aluParts.push(tagged(tx(new THREE.SphereGeometry(0.03, 8, 6), b[0], b[1], b[2])));
    for (const hx of [1.1, 2.2, 3.3, 4.4]) aluParts.push(tagged(rod([side * hx, wingY(hx) - 0.02, boomZ + 0.06], [side * hx, wingY(hx) - boomDrop, boomZ], 0.012, 4)));
    const N = 22;
    for (let k = 0; k <= N; k++) {
      const x = x0 + ((x1 - x0) * k) / N;
      const y = wingY(x) - boomDrop;
      // Drop tube + nozzle body + diaphragm check valve.
      aluParts.push(tagged(rod([side * x, y, boomZ], [side * x, y - 0.07, boomZ - 0.02], 0.007, 4)));
      darkParts.push(tagged(tx(new THREE.CylinderGeometry(0.014, 0.011, 0.05, 6), side * x, y - 0.09, boomZ - 0.03, 0.3)));
      nozzles.push(new THREE.Vector3(side * x, y - 0.12, boomZ - 0.04));
    }
  }
  aluParts.push(tagged(rod([0.7, wingY(0.7) - boomDrop, boomZ], [-0.7, wingY(0.7) - boomDrop, boomZ], 0.032, 8)));
  aluParts.push(tagged(rod([0, -0.66, 0.9], [0, wingY(0.7) - boomDrop, boomZ], 0.032, 8)));
  // Wind-driven pump under the belly (fan + body + valve).
  const pump = new THREE.Group();
  pump.position.set(0, -0.84, 0.95);
  pump.add(new THREE.Mesh(tx(new THREE.CylinderGeometry(0.095, 0.08, 0.34, 14), 0, 0, 0, Math.PI / 2), M.red));
  pump.add(new THREE.Mesh(tx(new THREE.SphereGeometry(0.05, 10, 8), 0, 0, 0.19), M.steel));
  const pumpFan = new THREE.Group();
  pumpFan.position.z = 0.21;
  for (let i = 0; i < 4; i++) {
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.045, 0.008), M.dark);
    bl.position.x = Math.cos((i * Math.PI) / 2) * 0.09;
    bl.position.y = Math.sin((i * Math.PI) / 2) * 0.09;
    bl.rotation.z = (i * Math.PI) / 2;
    bl.rotation.x = 0.35;
    pumpFan.add(bl);
  }
  pump.add(pumpFan);
  root.add(pump);
  steelParts.push(tagged(rod([0, -0.66, 0.95], [0, -0.76, 0.95], 0.022, 6)));

  // ---------------- propeller (3 blades) ----------------
  const prop = new THREE.Group();
  prop.position.set(0, 0.03, 3.15);
  prop.add(spinnerMesh);
  const blades = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1a1b1c, roughness: 0.5, metalness: 0.3, transparent: true });
  const tipMat = new THREE.MeshStandardMaterial({ color: 0xf2c21b, roughness: 0.5, transparent: true });
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(0.12, -0.075);
    shape.quadraticCurveTo(0.55, -0.11, 1.02, -0.05);
    shape.quadraticCurveTo(1.07, 0.0, 1.03, 0.04);
    shape.quadraticCurveTo(0.55, 0.1, 0.12, 0.065);
    const bg = new THREE.ExtrudeGeometry(shape, { depth: 0.024, bevelEnabled: false, curveSegments: 6 });
    bg.translate(0, 0, -0.012);
    const p = bg.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      const tw = 0.6 - 0.42 * (x / 1.07);
      p.setXYZ(k, x, y * Math.cos(tw) - z * Math.sin(tw), y * Math.sin(tw) + z * Math.cos(tw));
    }
    bg.computeVertexNormals();
    const bm = new THREE.Mesh(bg, bladeMat);
    bm.castShadow = true;
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.028), tipMat);
    tip.position.x = 0.99;
    tip.rotation.x = 0.18;
    b.add(bm, tip);
    b.rotation.z = (i * Math.PI * 2) / 3;
    blades.add(b);
  }
  prop.add(blades);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.08, 40), new THREE.MeshBasicMaterial({ map: propDiscTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  disc.position.z = 0.02;
  disc.renderOrder = 11;
  prop.add(disc);
  root.add(prop);

  // ---------------- pilot ----------------
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
  const floorParts = [], headParts = [], seatParts = [];
  floorParts.push(tagged(tx(new THREE.BoxGeometry(0.95, 0.03, 1.5), 0, -0.25, -0.25)));
  for (const sx of [1, -1]) interiorParts.push(tagged(tx(new THREE.BoxGeometry(0.03, 0.88, 1.45), sx * 0.51, 0.2, -0.25)));
  headParts.push(tagged(tx(new THREE.BoxGeometry(0.86, 0.012, 1.04), 0, roof - 0.02, -0.415)));
  // Side consoles.
  for (const sx of [1, -1]) interiorParts.push(tagged(tx(new THREE.BoxGeometry(0.13, 0.09, 0.95), sx * 0.43, 0.42, -0.12)));
  // Tubular cage visible inside (light grey tubes).
  for (const [a, b] of [
    [[0.49, -0.1, 0.42], [0.49, 0.6, -0.4]], [[-0.49, -0.1, 0.42], [-0.49, 0.6, -0.4]],
    [[0.49, 0.6, 0.42], [0.49, -0.1, -0.85]], [[-0.49, 0.6, 0.42], [-0.49, -0.1, -0.85]],
    [[-0.48, 0.55, -0.9], [0.48, 0.55, -0.9]], [[0.49, 0.25, 0.42], [0.49, 0.25, -0.9]], [[-0.49, 0.25, 0.42], [-0.49, 0.25, -0.9]],
  ]) interiorParts.push(tagged(rod(a, b, 0.018, 6)));
  // Seat: ribbed cushion + back, harness.
  seatParts.push(tagged(tx(new THREE.BoxGeometry(0.5, 0.1, 0.48), 0, 0.05, -0.55)));
  seatParts.push(tagged(tx(new THREE.BoxGeometry(0.5, 0.78, 0.1), 0, 0.44, -0.8, -0.12)));
  seatParts.push(tagged(tx(new THREE.BoxGeometry(0.42, 0.2, 0.06), 0, 0.95, -0.86, -0.12)));
  for (const sx of [1, -1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.62, 0.01), M.harness);
    strap.position.set(sx * 0.12, 0.48, -0.74);
    strap.rotation.x = -0.12;
    cockpit.add(strap);
  }
  steelParts.push(tagged(rod([0.22, -0.24, -0.4], [0.22, 0.0, -0.55], 0.015, 5)), tagged(rod([-0.22, -0.24, -0.4], [-0.22, 0.0, -0.55], 0.015, 5)));
  // Instrument panel (live canvas), backing, coaming, padded glareshield.
  const panelMat = new THREE.MeshStandardMaterial({ map: panel.texture, roughness: 0.55, emissive: 0xffffff, emissiveMap: panel.texture, emissiveIntensity: 0.12 });
  const panelMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.48), panelMat);
  panelMesh.position.set(0, 0.44, 0.335);
  panelMesh.rotation.y = Math.PI;
  cockpit.add(panelMesh);
  interiorParts.push(tagged(tx(new THREE.BoxGeometry(0.98, 0.5, 0.05), 0, 0.44, 0.365)));
  // Hopper sight window under the panel (live level).
  const sightMat = new THREE.MeshStandardMaterial({ map: panel.sightTexture, roughness: 0.4, emissive: 0xffffff, emissiveMap: panel.sightTexture, emissiveIntensity: 0.08 });
  const sight = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.3), sightMat);
  sight.position.set(-0.17, 0.0, 0.42);
  sight.rotation.y = Math.PI;
  cockpit.add(sight);
  darkParts.push(tagged(tx(new THREE.BoxGeometry(0.2, 0.33, 0.012), -0.17, 0.0, 0.428)));
  // Firewall under the panel and rear bulkhead behind the seat.
  interiorParts.push(tagged(tx(new THREE.BoxGeometry(1.0, 0.92, 0.03), 0, -0.22, 0.445)));
  interiorParts.push(tagged(tx(new THREE.BoxGeometry(1.08, 1.2, 0.03), 0, 0.0, -0.94)));
  deckParts.push(tagged(tx(new THREE.BoxGeometry(0.98, 0.025, 0.12), 0, 0.685, 0.41)));
  const glareCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.48, 0.655, 0.325), new THREE.Vector3(0.26, 0.695, 0.322), new THREE.Vector3(0, 0.71, 0.32),
    new THREE.Vector3(-0.26, 0.695, 0.322), new THREE.Vector3(-0.48, 0.655, 0.325),
  ]);
  glossParts.push(tagged(new THREE.TubeGeometry(glareCurve, 24, 0.032, 8, false)));
  // Lightbar (swath guidance LEDs) at the base of the centre post.
  const lightbar = new THREE.Group();
  lightbar.position.set(0, 0.735, 0.395);
  const leds = [];
  for (let i = -7; i <= 7; i++) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.014, 0.008), new THREE.MeshBasicMaterial({ color: 0x222222 }));
    led.position.set(-i * 0.0155, 0, -0.016); // pilot faces +Z: +X is left
    lightbar.add(led);
    leds.push(led);
  }
  lightbar.add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.028), M.dark));
  cockpit.add(lightbar);
  // Stick: rubber boot, shaft, ergonomic black grip with trigger and buttons.
  const stick = new THREE.Group();
  stick.position.set(0, -0.22, -0.12);
  const boot = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 12), M.rubber);
  boot.position.y = 0.05;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.56, 8), M.steel);
  shaft.position.y = 0.3;
  const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.027, 0.11, 4, 10), M.gloss);
  grip.position.set(0, 0.63, 0.012);
  grip.rotation.x = 0.22;
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.015, 8), M.red);
  hat.position.set(0, 0.71, 0.035);
  const trig = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.035, 0.012), M.dark);
  trig.position.set(0, 0.62, 0.042);
  stick.add(boot, shaft, grip, hat, trig);
  cockpit.add(stick);
  // Rudder pedals.
  const pedals = [];
  for (const sx of [1, -1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.03), M.steel);
    p.position.set(sx * 0.17, -0.12, 0.42);
    p.rotation.x = -0.6;
    cockpit.add(p);
    pedals.push(p);
  }
  // Throttle quadrant on the left console: throttle (yellow knob) + prop lever.
  darkParts.push(tagged(tx(new THREE.BoxGeometry(0.1, 0.05, 0.32), 0.43, 0.485, 0.05)));
  const throttle = new THREE.Group();
  throttle.position.set(0.415, 0.5, 0.05);
  const tl = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.17, 6), M.steel);
  tl.position.y = 0.085;
  const tk = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.035), M.yellow);
  tk.position.y = 0.17;
  throttle.add(tl, tk);
  cockpit.add(throttle);
  const propLever = new THREE.Group();
  propLever.position.set(0.45, 0.5, 0.0);
  propLever.rotation.x = 0.35;
  const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.15, 6), M.steel);
  pl.position.y = 0.075;
  const pk = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), M.gloss);
  pk.position.y = 0.15;
  propLever.add(pl, pk);
  cockpit.add(propLever);
  // Spray valve handle on the right console.
  const valve = new THREE.Group();
  valve.position.set(-0.43, 0.47, 0.0);
  const vl = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.16, 6), M.steel);
  vl.position.y = 0.08;
  const vk = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.03), M.red);
  vk.position.y = 0.16;
  valve.add(vl, vk);
  cockpit.add(valve);
  // Red emergency/canopy release handle and a fire extinguisher.
  const er = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 12, Math.PI), M.red);
  er.position.set(-0.47, 0.5, 0.2);
  er.rotation.y = Math.PI / 2;
  cockpit.add(er);
  const ext = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.28, 10), M.red);
  ext.position.set(0.38, 0.05, -0.75);
  cockpit.add(ext);
  root.add(cockpit);

  // ---------------- merge static parts ----------------
  const addMerged = (parts, mat, shadow = true, parent = root) => {
    if (!parts.length) return null;
    const g = mergeGeometries(parts);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = shadow; m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  addMerged(paintParts, M.paint);
  addMerged(liveryParts, M.livery);
  addMerged(darkParts, M.dark);
  addMerged(deckParts, M.deck);
  addMerged(glossParts, M.gloss);
  addMerged(aluParts, M.alu);
  addMerged(steelParts, M.steel);
  addMerged(rubberParts, M.rubber);
  addMerged(interiorParts, M.interior, false);
  addMerged(floorParts, M.floor, false, cockpit);
  addMerged(headParts, M.headliner, false, cockpit);
  addMerged(seatParts, M.seat, false, cockpit);
  root.add(glassMesh);

  root.traverse((o) => { if (o.isMesh && o.castShadow === undefined) o.castShadow = true; });

  return {
    root, M,
    prop, blades, bladeMats: [bladeMat, tipMat], disc,
    ailerons, flaps, elevator, rudder,
    gear: gearGroups,
    stick, pedals, throttle, valve, leds, panelMesh,
    pumpFan, nozzles, pilot, cockpit, glassMesh,
    eye: new THREE.Vector3(0, 1.0, -0.5),
    // Service points (body frame) used by the badeco.
    fuelFiller: new THREE.Vector3(2.4, wingY(2.4) + 0.14, -0.4),
    hopperPort: new THREE.Vector3(0.6, -0.35, -1.05),
  };
}
