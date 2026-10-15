// Procedural agricultural aircraft modelled on the Embraer EMB-202 Ipanema
// (own markings: PR-AGW, AGRO WINGS). VISUAL ONLY — the flight model, the gear
// contact points and the collision hard points live in src/config.js and are
// not read or changed here (except the gear points, to place the wheels).
// Body frame: +Z nose, +Y up, +X left wing; origin = CG.
//
// Construction: a single smooth fuselage lofted through spline-interpolated
// stations (cowling, open cabin, integrated turtle deck), airfoil wings with
// upturned tips and root fillets, a framed canopy with a curved windshield,
// lathe-profiled tyres and hubs, a twisted airfoil propeller, and a detailed
// cockpit. Paint, stripes, registration and the flag are a side-projected
// livery with a matching bump map (panel seams, rivets, doors, louvres).
// Ambient occlusion is baked into vertex colours; fine detail sits in a LOD.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvas, canvasTexture } from '../core/textures.js';
import { rng, clamp, smoothstep, lerp } from '../core/math.js';
import { FLIGHT } from '../config.js';

const DIH = Math.tan((6 * Math.PI) / 180);
export const WING = { rootX: 0.55, tipX: 5.85, rootY: -0.55, le: 0.85, chord: 1.7 };
export const wingY = (x) => WING.rootY + Math.max(0, Math.abs(x) - WING.rootX) * DIH;

export const PAINT = '#ff8700'; // Ipanema orange
const NAVY = '#16285e';
const DECK = '#2b2f35';
const WING_SPAN_UV = 6.2; // metres of half-span mapped to u = 0..1

// ==========================================================================
// Fuselage stations: z, half-width, shoulder height, bottom, top, upper and
// lower superellipse exponents. Spline-interpolated between keys.
const K = (z, hw, ys, yb, yt, pU, pL) => ({ z, hw, ys, yb, yt, pU, pL });
const FWD_KEYS = [
  K(3.13, 0.31, 0.03, -0.29, 0.35, 2.2, 2.2), K(3.07, 0.39, 0.02, -0.39, 0.43, 2.4, 2.5),
  K(2.92, 0.46, 0.01, -0.48, 0.5, 2.8, 3.0), K(2.6, 0.515, -0.01, -0.56, 0.55, 3.3, 3.5),
  K(2.1, 0.54, -0.03, -0.62, 0.585, 3.8, 4.0), K(1.4, 0.56, -0.04, -0.665, 0.615, 4.2, 4.3),
  K(0.8, 0.57, -0.05, -0.685, 0.635, 4.4, 4.5), K(0.45, 0.57, -0.05, -0.69, 0.645, 4.5, 4.5),
];
const CAB_KEYS = [K(0.45, 0.57, -0.05, -0.69, 0.645, 4.5, 4.5), K(-0.25, 0.565, -0.04, -0.66, 0.65, 4.5, 4.5), K(-0.95, 0.55, -0.03, -0.6, 0.66, 4.5, 4.5)];
const AFT_KEYS = [
  K(-0.95, 0.55, -0.03, -0.6, 1.36, 8, 4.5), K(-1.15, 0.53, 0.0, -0.55, 1.24, 4.5, 4.3),
  K(-1.5, 0.48, 0.04, -0.46, 1.05, 2.9, 4.0), K(-2.0, 0.4, 0.09, -0.33, 0.86, 2.4, 3.7),
  K(-2.6, 0.3, 0.14, -0.18, 0.68, 2.3, 3.3), K(-3.2, 0.2, 0.19, -0.03, 0.52, 2.3, 3.0),
  K(-3.75, 0.12, 0.23, 0.06, 0.42, 2.3, 2.8), K(-4.15, 0.06, 0.25, 0.13, 0.35, 2.4, 2.6),
  K(-4.33, 0.015, 0.26, 0.2, 0.31, 2.5, 2.5),
];
// Top line ahead of the windshield (for the dark hopper deck in the livery).
const deckTop = (z) => {
  const pts = FWD_KEYS.slice().reverse().map((k) => [k.z, k.yt]);
  if (z <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (z <= pts[i][0]) { const [z0, y0] = pts[i - 1], [z1, y1] = pts[i]; return y0 + ((z - z0) / (z1 - z0)) * (y1 - y0); }
  }
  return pts[pts.length - 1][1];
};

function sampleStations(keys, per) {
  const out = [];
  const P = ['z', 'hw', 'ys', 'yb', 'yt', 'pU', 'pL'];
  const cr = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)];
    const n = Math.max(2, Math.round(Math.abs(k1.z - k2.z) * per));
    for (let j = 0; j < n; j++) {
      const t = j / n, s = {};
      for (const p of P) s[p] = cr(k0[p], k1[p], k2[p], k3[p], t);
      s.hw = Math.max(0.005, s.hw); s.pU = Math.max(1.6, s.pU); s.pL = Math.max(1.6, s.pL);
      out.push(s);
    }
  }
  out.push({ ...keys[keys.length - 1] });
  return out;
}

function ring(st, n, arc) {
  const out = [];
  const a0 = arc ? arc[0] : 0, a1 = arc ? arc[1] : Math.PI * 2;
  for (let k = 0; k <= n; k++) {
    const a = a0 + (k / n) * (a1 - a0);
    const c = Math.cos(a), s = Math.sin(a);
    const up = s >= 0;
    const p = up ? st.pU : st.pL;
    const x = st.hw * Math.sign(c) * Math.abs(c) ** (2 / p);
    const y = up ? st.ys + (st.yt - st.ys) * Math.abs(s) ** (2 / p) : st.ys - (st.ys - st.yb) * Math.abs(s) ** (2 / p);
    out.push([x, y]);
  }
  return out;
}

// Loft through stations (nose -> tail). colorFn bakes AO into vertex colours.
// extendTo: for the open cabin, carry both rim ends straight up to this height.
function loft(stations, n, colorFn, arc = null, extendTo = null) {
  const pos = [], col = [], idx = [];
  let rl = 0;
  for (const st of stations) {
    let pts = ring(st, n, arc);
    if (extendTo !== null) pts = [[pts[0][0], extendTo], ...pts, [pts[pts.length - 1][0], extendTo]];
    rl = pts.length;
    for (const [x, y] of pts) {
      pos.push(x, y, st.z);
      const g = colorFn ? colorFn(x, y, st.z) : 1;
      col.push(g, g, g);
    }
  }
  for (let si = 0; si < stations.length - 1; si++) {
    for (let k = 0; k < rl - 1; k++) {
      const a = si * rl + k, b = a + 1, c = a + rl, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ==========================================================================
// Textures
function speckle(g, x, y, w, h, n, seed, alpha = 0.14) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const v = 205 + Math.floor(r() * 45);
    g.fillStyle = `rgba(${v},${v - 6},${v - 20},${alpha})`;
    g.fillRect(x + r() * w, y + r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}
function orangePeel(g, w, h, seed) {
  const r = rng(seed);
  for (let i = 0; i < (w * h) / 90; i++) {
    const v = r() < 0.5 ? 150 : 106;
    g.fillStyle = `rgba(${v},${v},${v},0.08)`;
    g.fillRect(r() * w, r() * h, 2, 2);
  }
}

// Livery: fuselage, fin and rudder use a side projection (z, y) of the body.
// Top half = left side (+X, nose to the left), bottom half = right side (-X,
// nose to the right) so lettering reads normally on both sides.
const LV = { Z0: -4.65, Z1: 3.5, Y0: -0.95, Y1: 1.95, W: 2048, H: 1024, M: 6 };
LV.kx = LV.W / (LV.Z1 - LV.Z0);
LV.ky = (LV.H / 2 - 2 * LV.M) / (LV.Y1 - LV.Y0);
const lvPix = (side, z, y) => [
  side > 0 ? (LV.Z1 - z) * LV.kx : (z - LV.Z0) * LV.kx,
  (side > 0 ? 0 : LV.H / 2) + LV.M + (LV.Y1 - y) * LV.ky,
];

function liveryTextures(reg) {
  const c = canvas(LV.W, LV.H), b = canvas(LV.W, LV.H);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  gb.fillStyle = '#808080';
  gb.fillRect(0, 0, LV.W, LV.H);
  orangePeel(gb, LV.W, LV.H, 41);
  for (const side of [1, -1]) {
    const P = (z, y) => lvPix(side, z, y);
    const oy = side > 0 ? 0 : LV.H / 2;
    const path = (ctx, pts) => {
      ctx.beginPath();
      pts.forEach(([z, y], i) => { const [px, py] = P(z, y); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
    };
    const poly = (pts, fill) => { path(g, pts); g.closePath(); g.fillStyle = fill; g.fill(); };
    const line = (ctx, pts, col, w) => { path(ctx, pts); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); };
    // Base paint + a light dusty gradient on the belly.
    g.fillStyle = PAINT;
    g.fillRect(0, oy, LV.W, LV.H / 2);
    const [, belly] = P(0, -0.35);
    const grd = g.createLinearGradient(0, belly, 0, oy + LV.H / 2);
    grd.addColorStop(0, 'rgba(90,60,30,0)');
    grd.addColorStop(1, 'rgba(90,60,30,0.2)');
    g.fillStyle = grd;
    g.fillRect(0, belly, LV.W, oy + LV.H / 2 - belly);
    // Dark deck over the hopper, from the windshield to the cowling.
    const deck = [];
    for (let z = 0.4; z <= 2.8; z += 0.1) deck.push([z, deckTop(z) - 0.085]);
    deck.push([2.8, 2], [0.4, 2]);
    poly(deck, DECK);
    // Stripes: navy band with the rising check at the wing root, gold
    // pinstripe and a thin navy line under it.
    const band = (cl, hh, off = 0) => cl.map(([z, y], i) => [z, y + off + hh[i]]).concat(cl.map(([z, y], i) => [z, y + off - hh[i]]).reverse());
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
      line(g, [[-2.86, 0.63], [-4.4, 0.63]], '#ffffff', 0.03 * LV.ky);
    }
    // Panel seams with rivet rows (colour + relief).
    const seams = [
      [[2.55, -0.45], [2.55, 0.5]], [[1.75, -0.6], [1.75, 0.6]], [[0.45, -0.7], [0.45, 0.64]],
      [[-1.35, -0.5], [-1.35, 1.2]], [[-2.75, -0.15], [-2.75, 0.66]], [[-3.6, 0.03], [-3.6, 0.45]],
      [[2.9, 0.05], [1.75, 0.05]], [[1.75, -0.52], [0.45, -0.52]], [[-0.95, -0.3], [-3.6, 0.1]],
    ];
    for (const s of seams) {
      line(g, s, 'rgba(70,35,0,0.3)', 2);
      line(gb, s, '#3c3c3c', 2.6);
      const [[za, ya], [zb, yb]] = s;
      const n = Math.max(2, Math.round(Math.hypot(za - zb, ya - yb) / 0.055));
      for (let k = 0; k <= n; k++) {
        const [px, py] = P(za + ((zb - za) * k) / n + 0.022, ya + ((yb - ya) * k) / n);
        g.fillStyle = 'rgba(80,40,0,0.25)'; g.fillRect(px - 1, py - 1, 2, 2);
        gb.fillStyle = '#5c5c5c'; gb.beginPath(); gb.arc(px, py, 1.4, 0, Math.PI * 2); gb.fill();
      }
    }
    // Access doors (rear fuselage, cowling, cabin door lower panel), louvres.
    const door = (z0, z1, y0, y1) => {
      const pts = [[z0, y0], [z1, y0], [z1, y1], [z0, y1], [z0, y0]];
      line(g, pts, 'rgba(70,35,0,0.36)', 2); line(gb, pts, '#383838', 2.8);
    };
    door(-1.65, -1.15, -0.32, -0.05);
    door(2.35, 1.95, 0.12, 0.36);
    door(0.4, -0.28, 0.12, 0.6);
    door(1.5, 0.75, -0.45, -0.2);
    for (let k = 0; k < 6; k++) {
      const pts = [[2.48 - k * 0.05, -0.3], [2.48 - k * 0.05, -0.12]];
      line(g, pts, 'rgba(20,15,10,0.6)', 3); line(gb, pts, '#202020', 4);
    }
    // Exhaust soot behind the stacks.
    {
      const [ax, ay] = P(1.72, -0.5), [bx] = P(0.25, -0.5);
      const sg = g.createLinearGradient(ax, 0, bx, 0);
      sg.addColorStop(0, 'rgba(35,25,15,0.42)');
      sg.addColorStop(1, 'rgba(35,25,15,0)');
      g.fillStyle = sg;
      g.beginPath(); g.ellipse((ax + bx) / 2, ay + 4, Math.abs(bx - ax) / 2, 0.08 * LV.ky, 0, 0, Math.PI * 2); g.fill();
    }
    // Lettering (always drawn upright).
    const text = (z, y, str, hM, col, font = 'bold') => {
      const [px, py] = P(z, y);
      g.save();
      g.font = `${font} ${Math.round(hM * LV.ky * 1.25)}px Arial`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = col;
      g.setTransform(1, 0, 0, 1, px, py);
      g.scale(LV.kx / LV.ky, 1);
      g.fillText(str, 0, 0);
      g.restore();
    };
    text(-2.3, 0.44, reg, 0.27, NAVY);
    text(1.15, 0.27, 'AGRO WINGS', 0.085, NAVY, 'italic bold');
    text(-0.95, 0.5, 'AVIAÇÃO AGRÍCOLA', 0.035, NAVY, 'bold');
    text(1.0, -0.4, 'NO STEP', 0.03, 'rgba(30,30,30,0.7)', 'bold');
    speckle(g, 0, oy, LV.W, LV.H / 2, 2600, side > 0 ? 7 : 8, 0.1);
  }
  return { map: canvasTexture(c, { aniso: 8 }), bump: canvasTexture(b, { srgb: false, aniso: 8 }) };
}

// Wing skin: u = span (0..WING_SPAN_UV m), v = chord fraction (0 = LE).
function wingTextures() {
  const W = 2048, H = 512;
  const c = canvas(W, H), b = canvas(W, H);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  g.fillStyle = PAINT; g.fillRect(0, 0, W, H);
  gb.fillStyle = '#808080'; gb.fillRect(0, 0, W, H);
  orangePeel(gb, W, H, 43);
  const X = (m) => (m / WING_SPAN_UV) * W, Y = (f) => f * H;
  const r = rng(17);
  // Faint chordwise residue streaks and leading-edge bug/dust specks.
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(120,100,70,${0.03 + r() * 0.05})`;
    g.fillRect(r() * W, Y(0.1 + r() * 0.8), 2 + r() * 3, 30 + r() * 120);
  }
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(60,45,30,${0.08 + r() * 0.15})`;
    g.fillRect(r() * W, Y(r() * 0.06), 1 + r() * 2, 1 + r() * 2);
  }
  const seam = (x0, y0, x1, y1, rivet = 0.05) => {
    g.strokeStyle = 'rgba(70,35,0,0.28)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    gb.strokeStyle = '#3e3e3e'; gb.lineWidth = 2.6;
    gb.beginPath(); gb.moveTo(x0, y0); gb.lineTo(x1, y1); gb.stroke();
    const len = Math.hypot(x1 - x0, (y1 - y0) * (1.7 / H) * (W / WING_SPAN_UV) / (W / WING_SPAN_UV)) ;
    const n = Math.max(2, Math.round(Math.hypot((x1 - x0) / (W / WING_SPAN_UV), ((y1 - y0) / H) * 1.7) / rivet));
    void len;
    gb.fillStyle = '#5c5c5c';
    for (let k = 0; k <= n; k++) { gb.beginPath(); gb.arc(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n + 5, 1.5, 0, Math.PI * 2); gb.fill(); }
  };
  // Spars (LE skin joint, main spar, rear spar) along the span.
  for (const f of [0.12, 0.3, 0.72]) seam(X(0.2), Y(f), X(6.1), Y(f));
  // Ribs across the chord.
  for (let x = 0.55; x < 6.0; x += 0.5) seam(X(x), Y(0.0), X(x), Y(0.74), 0.06);
  // Hinge gap shadow and the flap/aileron split.
  g.fillStyle = 'rgba(40,20,0,0.45)'; g.fillRect(0, Y(0.742), W, 5);
  gb.fillStyle = '#202020'; gb.fillRect(0, Y(0.742), W, 6);
  g.fillRect(X(3.21) - 2, Y(0.75), 4, H); gb.fillRect(X(3.21) - 3, Y(0.75), 6, H);
  // Fuel tank access panel and filler ring.
  {
    const x0 = X(1.9), x1 = X(2.9), y0 = Y(0.45), y1 = Y(0.68);
    g.strokeStyle = 'rgba(70,35,0,0.35)'; g.lineWidth = 2; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    gb.strokeStyle = '#383838'; gb.lineWidth = 2.6; gb.strokeRect(x0, y0, x1 - x0, y1 - y0);
  }
  speckle(g, 0, 0, W, H, 2400, 23, 0.08);
  return { map: canvasTexture(c, { aniso: 8 }), bump: canvasTexture(b, { srgb: false, aniso: 8 }) };
}

function treadTexture() {
  const c = canvas(64, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#909090'; g.fillRect(0, 0, 64, 256);
  g.fillStyle = '#202020';
  for (const v of [0.4, 0.5, 0.6]) g.fillRect(0, v * 256 - 3, 64, 6);
  // Shoulder sipes.
  for (let x = 0; x < 64; x += 16) { g.fillRect(x, 0.31 * 256, 4, 0.06 * 256); g.fillRect(x + 8, 0.63 * 256, 4, 0.06 * 256); }
  const t = canvasTexture(c, { srgb: false, repeat: true });
  t.repeat.set(18, 1);
  return t;
}

function propDiscTexture() {
  const S = 512;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const R = S / 2;
  // Blade blur: three soft lobes (stroboscopic look as the disc turns).
  if (g.createConicGradient) {
    const cg = g.createConicGradient(0, R, R);
    for (let i = 0; i < 3; i++) {
      const a = i / 3;
      cg.addColorStop(a, 'rgba(20,20,20,0.42)');
      cg.addColorStop(a + 0.07, 'rgba(20,20,20,0.12)');
      cg.addColorStop(a + 0.2, 'rgba(20,20,20,0.04)');
      cg.addColorStop(Math.min(1, a + 0.32), 'rgba(20,20,20,0.3)');
    }
    g.fillStyle = cg;
  } else g.fillStyle = 'rgba(20,20,20,0.25)';
  g.fillRect(0, 0, S, S);
  // Radial mask: hidden behind the spinner, fading tips, yellow tip ring.
  g.globalCompositeOperation = 'destination-in';
  const m = g.createRadialGradient(R, R, R * 0.16, R, R, R);
  m.addColorStop(0, 'rgba(0,0,0,0)');
  m.addColorStop(0.22, 'rgba(0,0,0,0.75)');
  m.addColorStop(0.8, 'rgba(0,0,0,0.55)');
  m.addColorStop(0.97, 'rgba(0,0,0,0.25)');
  m.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = m; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'source-over';
  const tip = g.createRadialGradient(R, R, R * 0.86, R, R, R);
  tip.addColorStop(0, 'rgba(242,194,27,0)');
  tip.addColorStop(0.55, 'rgba(242,194,27,0.32)');
  tip.addColorStop(0.85, 'rgba(242,194,27,0.18)');
  tip.addColorStop(1, 'rgba(242,194,27,0)');
  g.fillStyle = tip; g.fillRect(0, 0, S, S);
  return canvasTexture(c, { srgb: true });
}

function ribTexture(base, groove, n = 10, w = 128, h = 256) {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const y = ((i + 0.5) / n) * h;
    const gr = g.createLinearGradient(0, y - 8, 0, y + 8);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(0.5, groove);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, y - 8, w, 16);
  }
  speckle(g, 0, 0, w, h, 400, 5);
  return canvasTexture(c, { repeat: true });
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

// ==========================================================================
// Geometry helpers
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

// NACA-like cambered airfoil between chord fractions [c0, c1] (closed loop).
function airfoil(c0, c1, t = 0.15, m = 0.035, pp = 0.4, n = 16) {
  const yt = (x) => 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const yc = (x) => (m === 0 ? 0 : x < pp ? (m / (pp * pp)) * (2 * pp * x - x * x) : (m / (1 - pp) ** 2) * (1 - 2 * pp + 2 * pp * x - x * x));
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
// UV: u = span / WING_SPAN_UV, v = chord fraction. Colour: AO + darker underside.
function wingPanel(stations, prof, side = 1, ao = null) {
  const pos = [], uv = [], col = [], idx = [];
  const n = prof.length;
  stations.forEach((s) => {
    prof.forEach(([xc, yc], k) => {
      const lower = k >= n / 2;
      const X = side * s.x, Y = s.y + yc * s.chord, Z = s.le - xc * s.chord;
      pos.push(X, Y, Z);
      uv.push(s.x / WING_SPAN_UV, xc);
      const g = (lower ? 0.8 : 1) * (ao ? ao(s.x, xc, lower) : 1);
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
  if (!g.attributes.normal) g.computeVertexNormals();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  return g.index ? g.toNonIndexed() : g;
}

// Multiply vertex colours (AO) by fn(x, y, z).
function shade(g, fn) {
  const p = g.attributes.position, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const f = fn(p.getX(i), p.getY(i), p.getZ(i));
    c.setXYZ(i, c.getX(i) * f, c.getY(i) * f, c.getZ(i) * f);
  }
  return g;
}

function tx(g, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) {
  const sc = Array.isArray(s) ? new THREE.Vector3(...s) : new THREE.Vector3(s, s, s);
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), sc));
  return g;
}

// Tube between two points.
function rod(a, b, r, seg = 8, r2 = r) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(r2, r, len, seg);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}
// Smooth tube along points.
function tube(points, r, seg = 24, radial = 8) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), seg, r, radial, false);
}
// Flat bar (leaf spring) between two points.
function bar(a, b, w, t) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const g = new THREE.BoxGeometry(w, va.distanceTo(vb), t);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
const ball = (p, r, seg = 10) => tx(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)), ...p);
const rbox = (w, h, d, r, x, y, z, rx = 0, ry = 0, rz = 0) => tx(new RoundedBoxGeometry(w, h, d, 3, r), x, y, z, rx, ry, rz);
function lathe(pts, seg = 32) { return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg); }

// Curved quad patch (windshield / windows): bilinear between four corners,
// bulged along `nrm` by bulge·(1 - (2u-1)²).
function patch(p00, p10, p01, p11, nx, ny, bulge, nrm) {
  const pos = [], idx = [];
  const V = (a) => new THREE.Vector3(...a);
  const A = V(p00), B = V(p10), C = V(p01), D = V(p11), N = V(nrm).normalize();
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const u = i / nx, v = j / ny;
      const p = A.clone().multiplyScalar((1 - u) * (1 - v)).add(B.clone().multiplyScalar(u * (1 - v))).add(C.clone().multiplyScalar((1 - u) * v)).add(D.clone().multiplyScalar(u * v));
      p.addScaledVector(N, bulge * (1 - (2 * u - 1) ** 2));
      pos.push(p.x, p.y, p.z);
    }
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const patchEdge = (p00, p10, v, bulge, nrm, n = 12, p01, p11) => {
  const out = [];
  const N = new THREE.Vector3(...nrm).normalize();
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = new THREE.Vector3(...p00).lerp(new THREE.Vector3(...p10), u);
    const b = new THREE.Vector3(...p01).lerp(new THREE.Vector3(...p11), u);
    const p = a.lerp(b, v).addScaledVector(N, bulge * (1 - (2 * u - 1) ** 2));
    out.push([p.x, p.y, p.z]);
  }
  return out;
};

// ==========================================================================
export function createAircraftModel(panel, opts = {}) {
  const root = new THREE.Group();
  root.name = 'aircraft';
  const liv = liveryTextures('PR-AGW');
  const wtx = wingTextures();
  // Gloss aviation enamel. Base colours are scaled to a physically plausible
  // albedo (a real orange paint reflects ~60–70 % of red light, not 100 %),
  // so the same orange keeps its saturation under the tropical sun.
  // The paint gets its own reference to the scene environment so its sky
  // reflection can be set apart from the ambient light (three.js otherwise
  // applies scene.environmentIntensity to every material): full ambient,
  // restrained grazing-angle sheen, a thin clearcoat.
  const coat = { roughness: 0.5, metalness: 0.0, specularIntensity: 0.3, clearcoat: 0.12, clearcoatRoughness: 0.3, envMap: opts.envMap ?? null, envMapIntensity: 0.3 };
  const ALBEDO = 0.84;
  const M = {
    paint: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(PAINT).multiplyScalar(ALBEDO), vertexColors: true, ...coat }),
    livery: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(ALBEDO), map: liv.map, bumpMap: liv.bump, bumpScale: 1.4, vertexColors: true, ...coat }),
    wing: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(ALBEDO), map: wtx.map, bumpMap: wtx.bump, bumpScale: 1.4, vertexColors: true, ...coat }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.62, metalness: 0.1, vertexColors: true }),
    deck: new THREE.MeshStandardMaterial({ color: new THREE.Color('#1c1f24'), roughness: 0.93, metalness: 0.0, envMapIntensity: 0.35 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.28, metalness: 0.92, vertexColors: true }),
    steel: new THREE.MeshStandardMaterial({ color: 0x5c6166, roughness: 0.42, metalness: 0.85, vertexColors: true }),
    exhaust: new THREE.MeshStandardMaterial({ color: 0x6e5a46, roughness: 0.5, metalness: 0.8 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.94, metalness: 0, vertexColors: true }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.92, metalness: 0, bumpMap: treadTexture(), bumpScale: 2.5 }),
    gloss: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.28, metalness: 0.1, vertexColors: true }),
    hub: new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.32, metalness: 0.35 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb8913c, roughness: 0.35, metalness: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xa8bcc6, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.17, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.5, depthWrite: false, side: THREE.DoubleSide }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false }),
    interior: new THREE.MeshStandardMaterial({ color: 0xb4bbc2, roughness: 0.68, metalness: 0.12, vertexColors: true }),
    headliner: new THREE.MeshStandardMaterial({ color: 0xffffff, map: feltTexture(), roughness: 0.95, side: THREE.DoubleSide }),
    floor: new THREE.MeshStandardMaterial({ color: 0xffffff, map: ribTexture('#454b52', 'rgba(0,0,0,0.5)', 24, 64, 256), roughness: 0.8, metalness: 0.4, vertexColors: true }),
    seat: new THREE.MeshStandardMaterial({ color: 0xffffff, map: ribTexture('#b3602a', 'rgba(60,25,8,0.55)'), roughness: 0.85, vertexColors: true }),
    harness: new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.8 }),
    red: new THREE.MeshStandardMaterial({ color: 0xc8261b, roughness: 0.45, emissive: 0x330000 }),
    green: new THREE.MeshStandardMaterial({ color: 0x1f9a3a, roughness: 0.45, emissive: 0x002200 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xf2b400, roughness: 0.45 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35, emissive: 0x222222 }),
    suit: new THREE.MeshStandardMaterial({ color: 0x3a4a5e, roughness: 0.88 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x1e2023, roughness: 0.75 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xc28c6a, roughness: 0.7 }),
    helmet: new THREE.MeshPhysicalMaterial({ color: 0xeeeae2, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x15181c, roughness: 0.05, metalness: 0.3, clearcoat: 1 }),
  };

  // Part buckets merged per material at the end. `fine` buckets go into a LOD
  // level that is dropped beyond ~80 m.
  const B = {};
  const add = (mat, g, fine = false) => { const k = (fine ? 'fine:' : '') + mat; (B[k] ||= []).push(tagged(g)); };

  // ---------------- fuselage ----------------
  const fusAO = (x, y, z) => {
    let a = 1 - Math.max(0, -y - 0.3) * 0.32; // dusty, shaded belly
    const yb = Math.max(0, 1 - Math.abs(y + 0.47) / 0.24), zb = Math.max(0, 1 - Math.abs(z) / 0.98);
    a *= 1 - 0.34 * yb * Math.sqrt(zb); // wing-root shadow line
    const sb = Math.max(0, 1 - Math.abs(y - 0.36) / 0.14) * (z < -3.15 && z > -4.15 ? 1 : 0);
    a *= 1 - 0.22 * sb; // stabiliser root
    if (z < 0.45 && z > -0.95 && y > 0.52) a *= 0.9; // under the canopy rails
    if (z > 3.0) a *= 0.85 + 0.15 * clamp((3.13 - z) / 0.13, 0, 1); // cowl lip
    return clamp(a, 0.5, 1);
  };
  const fwdSt = sampleStations(FWD_KEYS, 22);
  const cabSt = sampleStations(CAB_KEYS, 8);
  const aftSt = sampleStations(AFT_KEYS, 16);
  add('livery', liveryUV(tagged(loft(fwdSt, 56, fusAO))));
  add('livery', liveryUV(tagged(loft(cabSt, 48, fusAO, [Math.PI * 0.75, Math.PI * 2.25], 0.645))));
  add('livery', liveryUV(tagged(loft(aftSt, 56, fusAO))));
  // Matte anti-glare panel over the hopper deck.
  {
    const st = fwdSt.filter((s) => s.z <= 2.78 && s.z >= 0.42).map((s) => ({ ...s, hw: s.hw + 0.005, yt: s.yt + 0.005 }));
    add('deck', loft(st, 24, null, [Math.PI * 0.32, Math.PI * 0.68]));
  }
  // Cabin rails (rounded) along the open top edge.
  for (const sx of [1, -1]) add('paint', tube([[sx * 0.505, 0.645, 0.46], [sx * 0.52, 0.645, -0.25], [sx * 0.535, 0.645, -0.96]], 0.024, 16, 8));
  // Hopper lid: rounded, bevelled black lid with hinges and handle.
  {
    const s = new THREE.Shape();
    const w = 0.23, d = 0.22, r = 0.05;
    s.moveTo(-w + r, -d); s.lineTo(w - r, -d); s.quadraticCurveTo(w, -d, w, -d + r); s.lineTo(w, d - r); s.quadraticCurveTo(w, d, w - r, d);
    s.lineTo(-w + r, d); s.quadraticCurveTo(-w, d, -w, d - r); s.lineTo(-w, -d + r); s.quadraticCurveTo(-w, -d, -w + r, -d);
    const lid = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2, curveSegments: 6 });
    lid.rotateX(-Math.PI / 2);
    add('dark', tx(lid, 0, 0.622, 1.4, -0.035));
    add('steel', rod([-0.12, 0.71, 1.52], [0.12, 0.71, 1.52], 0.012, 8));
    for (const sx of [-0.15, 0.15]) {
      add('steel', rod([sx, 0.69, 1.52], [sx, 0.71, 1.52], 0.008, 6));
      add('steel', tx(new THREE.CylinderGeometry(0.018, 0.018, 0.06, 10), sx, 0.64, 1.16, 0, 0, Math.PI / 2));
    }
    add('dark', tx(new THREE.CylinderGeometry(0.09, 0.095, 0.07, 20), 0, 0.6, 2.2));
    add('steel', tx(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 16), 0, 0.64, 2.2));
  }
  // Hopper quick-fill couplers either side, aft of the wing root, and the
  // transfer pipe.
  for (const sx of [1, -1]) {
    add('dark', tx(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 16), sx * 0.58, -0.35, -1.05, 0, 0, Math.PI / 2));
    add('brass', tx(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 16), sx * 0.64, -0.35, -1.05, 0, 0, Math.PI / 2));
  }
  add('alu', tube([[0.5, -0.35, -1.05], [0.47, -0.25, 0.0], [0.45, -0.12, 0.9]], 0.03, 16, 8));
  // Exhaust stacks: curved pipes out of the lower cowling with flared tips.
  for (const sx of [1, -1]) {
    add('exhaust', tube([[sx * 0.42, -0.36, 2.3], [sx * 0.53, -0.45, 2.1], [sx * 0.6, -0.55, 1.85], [sx * 0.62, -0.6, 1.68]], 0.045, 20, 10));
    add('exhaust', tx(new THREE.CylinderGeometry(0.06, 0.047, 0.08, 12, 1, true), sx * 0.625, -0.61, 1.64, Math.PI / 2 + 0.35, 0, 0));
  }
  // Cowl front: rounded lip, deep inlet ring round the spinner, cheek inlets,
  // oil-cooler scoop under the cowl.
  add('paint', tx(new THREE.TorusGeometry(0.3, 0.032, 12, 40), 0, 0.03, 3.115));
  add('dark', tx(new THREE.CylinderGeometry(0.29, 0.29, 0.12, 40, 1, true), 0, 0.03, 3.07, Math.PI / 2));
  add('dark', tx(new THREE.RingGeometry(0.2, 0.29, 40), 0, 0.03, 3.03));
  add('paint', rbox(0.3, 0.12, 0.42, 0.04, 0, -0.6, 2.45, -0.08));
  add('dark', tx(new THREE.PlaneGeometry(0.25, 0.07), 0, -0.6, 2.665, -0.08));
  // Ogive spinner with a backplate.
  const spinner = lathe([[0.0, 0.48], [0.04, 0.46], [0.1, 0.4], [0.155, 0.31], [0.195, 0.2], [0.212, 0.08], [0.215, 0]].reverse().map(([r, y]) => [r, y]), 40);
  spinner.rotateX(Math.PI / 2);
  const spinnerMesh = new THREE.Mesh(mergeGeometries([tagged(spinner), tagged(tx(new THREE.CylinderGeometry(0.222, 0.222, 0.02, 40), 0, 0, -0.005, Math.PI / 2))]), M.paint);
  spinnerMesh.castShadow = true;

  // ---------------- cabin ----------------
  const cz0 = -0.95, cz1 = 0.45, roof = 1.34, sill = 0.645;
  const WS = { bl: [0.5, sill, cz1], br: [-0.5, sill, cz1], tl: [0.44, roof - 0.02, 0.12], tr: [-0.44, roof - 0.02, 0.12], n: [0, 0.44, 0.9], bulge: 0.05 };
  const glassG = [];
  glassG.push(patch(WS.bl, WS.br, WS.tl, WS.tr, 12, 6, WS.bulge, WS.n));
  for (const sx of [1, -1]) {
    glassG.push(patch([sx * 0.5, sill, cz1], [sx * 0.535, sill, cz0], [sx * 0.44, roof - 0.02, 0.12], [sx * 0.44, roof - 0.02, cz0], 8, 4, 0.012, [sx, 0.12, 0]));
  }
  glassG.push(patch([0.535, sill, cz0], [-0.535, sill, cz0], [0.44, roof - 0.02, cz0], [-0.44, roof - 0.02, cz0], 6, 3, -0.01, [0, 0, 1]));
  const glassMesh = new THREE.Mesh(mergeGeometries(glassG.map((g) => tagged(g))), M.glass);
  glassMesh.renderOrder = 10;
  // Canopy frame: painted tubes outside, grey tubes inside, rounded joints.
  const cabC = new THREE.Vector3(0, 0.95, -0.3);
  const frame = (pts, r = 0.026) => {
    add('paint', tube(pts, r, Math.max(4, pts.length * 3), 10));
    const mid = new THREE.Vector3(...pts[Math.floor(pts.length / 2)]);
    const inw = cabC.clone().sub(mid).normalize().multiplyScalar(0.013);
    add('interior', tube(pts.map((p) => [p[0] + inw.x, p[1] + inw.y, p[2] + inw.z]), r * 0.85, Math.max(4, pts.length * 3), 8));
  };
  frame(patchEdge(WS.bl, WS.br, 0, WS.bulge, WS.n, 12, WS.tl, WS.tr), 0.03);
  frame(patchEdge(WS.bl, WS.br, 1, WS.bulge, WS.n, 12, WS.tl, WS.tr));
  for (const sx of [1, -1]) {
    frame([[sx * 0.5, sill, cz1], [sx * 0.47, (sill + roof) / 2, 0.285], [sx * 0.44, roof, 0.12]], 0.03);
    frame([[sx * 0.44, roof, 0.12], [sx * 0.44, roof, -0.4], [sx * 0.44, roof, cz0]]);
    frame([[sx * 0.535, sill, cz0], [sx * 0.49, (sill + roof) / 2, cz0], [sx * 0.44, roof, cz0]], 0.03);
    frame([[sx * 0.525, sill, -0.3], [sx * 0.483, (sill + roof) / 2, -0.3], [sx * 0.44, roof, -0.3]], 0.022);
    for (const p of [[sx * 0.5, sill, cz1], [sx * 0.44, roof, 0.12], [sx * 0.44, roof, cz0], [sx * 0.535, sill, cz0]]) add('paint', ball(p, 0.034));
    // Door handle and hinges on the door frame.
    add('steel', rod([sx * 0.54, 0.5, -0.24], [sx * 0.54, 0.5, -0.12], 0.009, 6));
    for (const hy of [0.85, 1.15]) add('steel', tx(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8), sx * 0.475, hy, 0.29));
  }
  frame([[0.44, roof, cz0], [0, roof + 0.03, cz0], [-0.44, roof, cz0]]);
  // Centre windshield post (wire-cutter strut).
  add('dark', rod([0, sill + 0.05, cz1 - 0.02], [0, roof, 0.12], 0.014, 8));
  // Curved roof: painted outside, felt headliner inside.
  let headliner;
  {
    const nx = 10, nz = 8, outer = [], inner = [], idx = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = -0.47 + (0.94 * i) / nx, z = 0.15 - (1.12 * j) / nz;
      const y = roof + 0.035 * (1 - (x / 0.47) ** 2) - 0.012 * ((z + 0.4) / 0.56) ** 2;
      outer.push(x, y + 0.012, z); inner.push(x * 0.97, y - 0.012, z);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const mk = (p, flip) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.setIndex(flip ? idx.slice().reverse() : idx);
      g.computeVertexNormals();
      return g;
    };
    add('livery', liveryUV(tagged(mk(outer, true))));
    headliner = tagged(mk(inner, false));
  }
  // Wire cutter ahead of the windshield, deflector cable roof -> fin top,
  // roof antennas (VHF whip, DGPS puck).
  add('steel', rod([0, 0.66, 0.62], [0, roof + 0.16, 0.2], 0.022, 8));
  add('steel', tx(new THREE.BoxGeometry(0.02, 0.45, 0.07), 0, roof + 0.14, 0.17, 0.6));
  add('steel', rod([0, roof + 0.03, -0.1], [0, 1.78, -3.6], 0.006, 5));
  add('dark', tx(new THREE.SphereGeometry(0.06, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, roof + 0.045, -0.62, 0, 0, 0, [1, 0.45, 1]), true);
  add('steel', rod([0.18, roof + 0.04, -0.55], [0.18, roof + 0.42, -0.85], 0.005, 5), true);

  // ---------------- wing ----------------
  const leY = (x) => wingY(x);
  const mainProf = airfoil(0, 0.74, 0.15, 0.035, 0.4, 18), aftProf = airfoil(0.76, 1.0, 0.15, 0.035, 0.4, 6);
  const flaps = [], ailerons = [];
  const wingAO = (x, xc, lower) => (lower ? 1 : 1 - 0.28 * Math.max(0, 1 - (x - 0.55) / 0.55));
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
    const m = new THREE.Mesh(tagged(geo), M.wing);
    m.castShadow = true; m.receiveShadow = true;
    deflect.add(m);
    pivot.add(deflect);
    root.add(pivot);
    return deflect;
  };
  const wingParts = [];
  for (const side of [1, -1]) {
    const st = (x) => ({ x, y: leY(x), le: WING.le, chord: WING.chord });
    wingParts.push(wingPanel([0.2, WING.rootX, 0.8, 1.1, 2.0, 3.2, 4.4, WING.tipX].map(st), mainProf, side, wingAO));
    wingParts.push(wingPanel([st(0.2), st(WING.rootX + 0.05)], aftProf, side, wingAO));
    flaps.push(surfaceMesh(wingPanel([WING.rootX + 0.06, 1.1, 2.2, 3.18].map(st), aftProf, side, wingAO), WING.rootX + 0.06, 3.18, side));
    ailerons.push(surfaceMesh(wingPanel([3.24, 4.5, WING.tipX - 0.02].map(st), aftProf, side), 3.24, WING.tipX - 0.02, side));
    // Upturned Hoerner-style tip: smooth curve up and back.
    const tipSt = [];
    for (let i = 0; i <= 7; i++) {
      const t = i / 7, e = t * t;
      tipSt.push({ x: WING.tipX + 0.26 * Math.sin((t * Math.PI) / 2), y: leY(WING.tipX) + 0.44 * e, le: WING.le - 0.26 * e, chord: WING.chord * (1 - 0.34 * e) });
    }
    wingParts.push(wingPanel(tipSt, airfoil(0, 1, 0.15, 0.035, 0.4, 16), side));
    // Root fillet: a fairing that blends the wing top into the fuselage side.
    const fil = mainProf.slice(0, 19).map(([xc, yc]) => [side * 0.565, WING.rootY + yc * WING.chord + 0.01, WING.le - xc * WING.chord]);
    wingParts.push(tube(fil, 0.055, 30, 10));
    // Nav light: coloured bulb under a clear lens at the tip leading edge.
    const tipLE = [side * (WING.tipX + 0.11), leY(WING.tipX) + 0.06, WING.le - 0.05];
    add(side > 0 ? 'red' : 'green', ball(tipLE, 0.03, 10));
    add('lens', tx(new THREE.SphereGeometry(0.06, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), ...tipLE, 0, 0, side * Math.PI / 2, [1, 1, 1.4]));
    // Black non-slip walkway at the root (where the badeco steps): a thin
    // sheet laid on the upper skin.
    {
      const up = mainProf.slice(0, 19).filter(([xc]) => xc > 0.1 && xc < 0.62);
      const sheet = up.map(([xc, yc]) => [xc, yc + 0.004]).concat(up.slice().reverse().map(([xc, yc]) => [xc, yc + 0.0005]));
      add('deck', wingPanel([0.62, 0.9, 1.16].map(st), sheet, side));
    }
    // Fuel filler cap on top of the wing tank.
    add('dark', tx(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 18), side * 2.4, leY(2.4) + 0.125, -0.4));
    add('steel', tx(new THREE.BoxGeometry(0.1, 0.012, 0.02), side * 2.4, leY(2.4) + 0.145, -0.4), true);
    // Hinge brackets under the flap/aileron line and tie-down rings.
    for (const hx of [0.9, 1.9, 2.9, 3.6, 4.6, 5.5]) {
      add('dark', tx(new THREE.BoxGeometry(0.03, 0.07, 0.12), side * hx, leY(hx) - 0.07, WING.le - 0.76 * WING.chord + 0.02, 0, 0, side * Math.atan(DIH)), true);
    }
    add('steel', tx(new THREE.TorusGeometry(0.025, 0.006, 6, 12), side * 4.0, leY(4.0) - 0.12, -0.1, 0, Math.PI / 2), true);
  }
  // Pitot tube under the left wing.
  add('steel', rod([3.6, leY(3.6) - 0.1, 0.55], [3.6, leY(3.6) - 0.1, 1.05], 0.009, 8), true);
  add('steel', rod([3.6, leY(3.6) - 0.02, 0.5], [3.6, leY(3.6) - 0.1, 0.62], 0.01, 6), true);
  for (const g of wingParts) add(g.attributes.uv && g.attributes.color ? 'wing' : 'paint', g);

  // ---------------- tail ----------------
  const stabStations = [
    { x: 0.1, y: 0.34, le: -3.25, chord: 0.95 }, { x: 1.2, y: 0.35, le: -3.35, chord: 0.8 },
    { x: 1.78, y: 0.36, le: -3.4, chord: 0.71 }, { x: 1.87, y: 0.362, le: -3.43, chord: 0.62 }, { x: 1.92, y: 0.363, le: -3.47, chord: 0.5 },
  ];
  const elevParts = [];
  for (const side of [1, -1]) {
    add('wing', wingPanel(stabStations, airfoil(0, 0.6, 0.1, 0, 0.4, 12), side));
    elevParts.push(tagged(wingPanel(stabStations.slice(0, 3), airfoil(0.62, 1, 0.1, 0, 0.4, 4), side)));
    // Stabiliser struts (to the fin and under to the tail cone) with end lugs.
    add('steel', rod([side * 1.0, 0.33, -3.6], [0, 1.1, -3.75], 0.017, 8));
    add('steel', rod([side * 0.9, 0.31, -3.55], [side * 0.08, 0.06, -3.4], 0.015, 8));
    for (const p of [[side * 1.0, 0.33, -3.6], [side * 0.9, 0.31, -3.55]]) add('steel', ball(p, 0.025, 8), true);
  }
  // Trim tab on the left elevator.
  elevParts.push(tagged(tx(new THREE.BoxGeometry(0.4, 0.012, 0.09), 0.55, 0.348, -3.25 - 0.95 * 0.98 - 0.04)));
  const elevGeo = mergeGeometries(elevParts);
  const elevHingeZ = -3.25 - 0.62 * 0.95;
  elevGeo.translate(0, -0.35, -elevHingeZ);
  const elevator = new THREE.Group();
  elevator.position.set(0, 0.35, elevHingeZ);
  const elevMesh = new THREE.Mesh(elevGeo, M.wing);
  elevMesh.castShadow = true; elevMesh.receiveShadow = true;
  elevator.add(elevMesh);
  root.add(elevator);
  // Fin + rudder: vertical airfoils (profile rotated into the YZ plane) with a
  // rounded cap.
  const finSt = [[0.35, -2.95, 1.25], [1.05, -3.142, 0.95], [1.78, -3.302, 0.7], [1.83, -3.33, 0.65], [1.86, -3.36, 0.58]];
  const vfin = (prof, sts) => {
    const g = wingPanel(sts.map(([h, le, c]) => ({ x: h, y: 0, le, chord: c })), prof, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      p.setXYZ(i, y, x, z);
    }
    g.computeVertexNormals();
    return g;
  };
  add('livery', liveryUV(tagged(vfin(airfoil(0, 0.62, 0.11, 0, 0.4, 12), finSt))));
  // Dorsal fillet from the turtle deck into the fin.
  add('livery', liveryUV(tagged(loft(sampleStations([
    K(-2.5, 0.04, 0.55, 0.5, 0.69, 2.2, 2.2), K(-2.8, 0.055, 0.58, 0.5, 0.74, 2.2, 2.2), K(-3.05, 0.04, 0.55, 0.47, 0.62, 2.2, 2.2),
  ], 20), 12, null))));
  const rudGeo = liveryUV(tagged(vfin(airfoil(0.64, 1, 0.11, 0, 0.4, 5), finSt.slice(0, 3))));
  const rudHingeZ = -3.75;
  const rudTab = tagged(tx(new THREE.BoxGeometry(0.012, 0.3, 0.08), 0, 0.6, -3.75 - 0.42));
  const rudder = new THREE.Group();
  rudder.position.set(0, 0, rudHingeZ);
  const rudMesh = new THREE.Mesh(rudGeo.translate(0, 0, -rudHingeZ), M.livery);
  rudMesh.castShadow = true;
  rudder.add(rudMesh);
  const rudTabMesh = new THREE.Mesh(rudTab.translate(0, 0, -rudHingeZ), M.paint);
  rudder.add(rudTabMesh);
  root.add(rudder);
  // Tail light and tie-down.
  add('white', ball([0, 0.26, -4.34], 0.03, 10));
  add('steel', tx(new THREE.TorusGeometry(0.03, 0.007, 6, 12), 0, 0.12, -4.0, 0, Math.PI / 2), true);

  // ---------------- landing gear ----------------
  // Wheel positions follow the physics contact points (src/config.js).
  const gearCfg = Object.fromEntries(FLIGHT.gear.map((g) => [g.name, g]));
  const gearGroups = {};
  const tyreProfile = (R, W, rim) => [
    [rim, -W * 0.42], [rim + 0.02, -W * 0.5], [R * 0.82, -W * 0.52], [R * 0.95, -W * 0.44], [R * 0.995, -W * 0.3],
    [R, -W * 0.12], [R, W * 0.12], [R * 0.995, W * 0.3], [R * 0.95, W * 0.44], [R * 0.82, W * 0.52], [rim + 0.02, W * 0.5], [rim, W * 0.42],
  ];
  const makeWheel = (R, W, rim, sx, big) => {
    const spin = new THREE.Group();
    const tyre = lathe(tyreProfile(R, W, rim), big ? 48 : 28);
    tyre.rotateZ(Math.PI / 2);
    const tm = new THREE.Mesh(tyre, M.tyre);
    tm.castShadow = true; tm.receiveShadow = true;
    const hubG = lathe([[0.0, -W * 0.3], [rim * 0.35, -W * 0.32], [rim * 0.55, -W * 0.18], [rim * 0.9, -W * 0.3], [rim + 0.008, -W * 0.44],
      [rim + 0.008, W * 0.44], [rim * 0.9, W * 0.3], [rim * 0.55, W * 0.18], [rim * 0.35, W * 0.32], [0.0, W * 0.3]], big ? 32 : 18);
    hubG.rotateZ(Math.PI / 2);
    const parts = [tagged(hubG)];
    if (big) {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        parts.push(tagged(tx(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 8), sx * W * 0.33, Math.cos(a) * rim * 0.55, Math.sin(a) * rim * 0.55, 0, 0, Math.PI / 2)));
      }
      parts.push(tagged(tx(new THREE.SphereGeometry(rim * 0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), sx * W * 0.31, 0, 0, 0, 0, -sx * Math.PI / 2)));
      // Valve stem (shows the wheel turning).
      parts.push(tagged(rod([sx * W * 0.38, rim * 0.92, 0], [sx * W * 0.45, rim * 0.98, 0], 0.006, 6)));
    }
    spin.add(tm, new THREE.Mesh(mergeGeometries(parts), M.hub));
    return spin;
  };
  for (const [name, sx] of [['mainL', 1], ['mainR', -1]]) {
    const cfg = gearCfg[name];
    const R = 0.325, W = 0.2;
    const ax = cfg.p[0], ay = cfg.p[1] + R, az = cfg.p[2];
    const g = new THREE.Group();
    // Tubular A-frame: fore and aft tubes from the lower longeron to the axle
    // fitting, inner shock strut, brake line. Scaled vertically with the
    // spring compression so it stays connected to the wheel.
    const attachY = -0.64;
    const leg = new THREE.Group();
    leg.position.y = attachY;
    const L = (p) => [p[0], p[1] - attachY, p[2]];
    const axIn = ax - sx * 0.12;
    const legParts = [
      rod(L([sx * 0.42, attachY, az + 0.42]), L([axIn, ay + 0.03, az + 0.03]), 0.036, 12, 0.04),
      rod(L([sx * 0.42, attachY, az - 0.42]), L([axIn, ay + 0.03, az - 0.03]), 0.036, 12, 0.04),
      rod(L([sx * 0.12, attachY - 0.05, az]), L([axIn - sx * 0.14, ay + 0.12, az]), 0.028, 10),
      tx(new RoundedBoxGeometry(0.1, 0.12, 0.16, 2, 0.025), ...L([axIn, ay + 0.03, az])),
      rod(L([axIn, ay, az]), L([ax - sx * 0.02, ay, az]), 0.032, 12),
    ];
    for (const p of [[sx * 0.42, attachY, az + 0.42], [sx * 0.42, attachY, az - 0.42], [sx * 0.12, attachY - 0.05, az]]) {
      legParts.push(tx(new THREE.CylinderGeometry(0.03, 0.03, 0.09, 12), ...L(p), 0, 0, Math.PI / 2));
    }
    const legMesh = new THREE.Mesh(mergeGeometries(legParts.map((p) => tagged(p))), M.paint);
    legMesh.castShadow = true; legMesh.receiveShadow = true;
    const brakeLine = new THREE.Mesh(tagged(tube([L([sx * 0.42, attachY, az - 0.38]), L([(sx * 0.42 + axIn) / 2, (attachY + ay) / 2, az - 0.2]), L([axIn - sx * 0.02, ay + 0.06, az - 0.06])], 0.007, 16, 6)), M.rubber);
    leg.add(legMesh, brakeLine);
    g.add(leg);
    const wheel = new THREE.Group();
    wheel.position.set(ax, ay, az);
    const spinPart = makeWheel(R, W, 0.155, sx, true);
    // Brake disc + caliper on the inboard side (do not spin).
    const brake = new THREE.Mesh(mergeGeometries([
      tagged(tx(new THREE.CylinderGeometry(0.12, 0.12, 0.012, 24), -sx * 0.085, 0, 0, 0, 0, Math.PI / 2)),
    ]), M.steel);
    const caliper = new THREE.Mesh(tagged(new RoundedBoxGeometry(0.05, 0.07, 0.08, 2, 0.012).translate(-sx * 0.085, 0.09, -0.04)), M.dark);
    wheel.add(spinPart, brake, caliper);
    g.add(wheel);
    root.add(g);
    gearGroups[name] = { group: g, wheel, spin: spinPart, leg, legH: attachY - ay, rest: wheel.position.clone(), sx };
  }
  {
    const cfg = gearCfg.tail;
    const g = new THREE.Group();
    const R = 0.135;
    const fz = cfg.p[2] + 0.1, fy = cfg.p[1] + R + 0.085;
    // Tapered leaf spring from the tail post to the steerable fork.
    add('dark', bar([0, 0.07, -4.02], [0, fy + 0.02, fz], 0.06, 0.016));
    add('dark', tx(new THREE.CylinderGeometry(0.03, 0.03, 0.07, 12), 0, fy + 0.03, fz));
    const fork = new THREE.Group();
    fork.position.set(0, fy, fz);
    const forkGeo = mergeGeometries([
      tagged(tx(new THREE.BoxGeometry(0.012, 0.14, 0.05), 0.045, -0.04, -0.06, 0.6)), tagged(tx(new THREE.BoxGeometry(0.012, 0.14, 0.05), -0.045, -0.04, -0.06, 0.6)),
      tagged(tx(new THREE.BoxGeometry(0.1, 0.02, 0.05), 0, 0.02, -0.01)),
      tagged(rod([-0.06, 0.03, 0.04], [0.06, 0.03, 0.04], 0.008, 6)),
    ]);
    fork.add(new THREE.Mesh(forkGeo, M.steel));
    const wheel = new THREE.Group();
    wheel.position.set(0, -0.085, -0.1);
    const spinPart = makeWheel(R, 0.075, 0.06, 1, false);
    wheel.add(spinPart);
    fork.add(wheel);
    g.add(fork);
    root.add(g);
    // Steering springs to the rudder horn.
    for (const sx of [1, -1]) add('steel', rod([sx * 0.06, fy + 0.03, fz + 0.04], [sx * 0.1, 0.22, -3.8], 0.005, 5), true);
    gearGroups.tail = { group: g, wheel, spin: spinPart, fork, rest: wheel.position.clone(), sx: 0 };
  }

  // ---------------- spray system ----------------
  const nozzles = [];
  const boomZ = WING.le - 0.86 * WING.chord, boomDrop = 0.15;
  for (const side of [1, -1]) {
    const x0 = 0.7, x1 = 5.0;
    const a = [side * x0, wingY(x0) - boomDrop, boomZ], b = [side * x1, wingY(x1) - boomDrop, boomZ];
    add('alu', rod(a, b, 0.024, 12));
    add('alu', ball(b, 0.03, 10));
    add('brass', tx(new THREE.CylinderGeometry(0.012, 0.012, 0.04, 8), b[0] + side * 0.03, b[1], b[2], 0, 0, Math.PI / 2), true);
    // Streamlined hangers from the wing to the boom.
    for (const hx of [1.1, 2.2, 3.3, 4.4]) {
      const top = [side * hx, wingY(hx) - 0.02, boomZ + 0.06], bot = [side * hx, wingY(hx) - boomDrop, boomZ];
      add('alu', tx(rod(top, bot, 0.016, 10), 0, 0, 0));
      add('dark', tx(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10), side * hx, wingY(hx) - boomDrop, boomZ, 0, 0, Math.PI / 2), true);
    }
    const N = 24;
    for (let k = 0; k <= N; k++) {
      const x = x0 + ((x1 - x0) * k) / N;
      const y = wingY(x) - boomDrop;
      // Drop tube + diaphragm check-valve body + brass nozzle tip.
      add('alu', rod([side * x, y, boomZ], [side * x, y - 0.06, boomZ - 0.02], 0.007, 6), true);
      add('dark', tx(new THREE.CylinderGeometry(0.017, 0.014, 0.045, 10), side * x, y - 0.085, boomZ - 0.03, 0.3), true);
      add('brass', tx(new THREE.ConeGeometry(0.01, 0.025, 8), side * x, y - 0.118, boomZ - 0.04, Math.PI + 0.3), true);
      nozzles.push(new THREE.Vector3(side * x, y - 0.12, boomZ - 0.04));
    }
  }
  // Feed pipe from the pump to the boom centre (T junction, elbows).
  add('alu', rod([0.7, wingY(0.7) - boomDrop, boomZ], [-0.7, wingY(0.7) - boomDrop, boomZ], 0.034, 12));
  add('alu', tube([[0, -0.66, 0.9], [0, -0.72, 0.5], [0, -0.72, 0.0], [0, wingY(0.7) - boomDrop, boomZ]], 0.034, 24, 10));
  add('alu', ball([0, wingY(0.7) - boomDrop, boomZ], 0.05, 12));
  // Wind-driven pump under the belly (body, nose, fan with hub).
  const pump = new THREE.Group();
  pump.position.set(0, -0.84, 0.95);
  const pumpBody = lathe([[0.0, -0.2], [0.07, -0.19], [0.095, -0.12], [0.1, 0.05], [0.085, 0.15], [0.05, 0.19], [0.0, 0.2]], 24);
  pumpBody.rotateX(Math.PI / 2);
  pump.add(new THREE.Mesh(tagged(pumpBody), M.red));
  pump.add(new THREE.Mesh(tagged(tx(new THREE.SphereGeometry(0.045, 14, 10), 0, 0, 0.21)), M.steel));
  const pumpFan = new THREE.Group();
  pumpFan.position.z = 0.22;
  for (let i = 0; i < 4; i++) {
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.05, 0.008), M.dark);
    bl.position.x = Math.cos((i * Math.PI) / 2) * 0.09;
    bl.position.y = Math.sin((i * Math.PI) / 2) * 0.09;
    bl.rotation.z = (i * Math.PI) / 2;
    bl.rotation.x = 0.35;
    pumpFan.add(bl);
  }
  pump.add(pumpFan);
  root.add(pump);
  add('steel', rod([0, -0.66, 0.95], [0, -0.76, 0.95], 0.024, 10));
  add('red', tx(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 12), 0.12, -0.72, 0.7, 0, 0, Math.PI / 2));

  // ---------------- propeller (3 blades, twisted airfoil sections) ----------------
  const prop = new THREE.Group();
  prop.position.set(0, 0.03, 3.15);
  prop.add(spinnerMesh);
  const blades = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x18191a, roughness: 0.55, metalness: 0.25, transparent: true });
  const tipMat = new THREE.MeshStandardMaterial({ color: 0xf2c21b, roughness: 0.5, transparent: true });
  const bladeLoft = (r0, r1, steps) => {
    const pos = [], idx = [];
    let n = 0;
    for (let i = 0; i <= steps; i++) {
      const r = r0 + ((r1 - r0) * i) / steps;
      const f = clamp((r - 0.12) / 0.95, 0, 1);
      let c = 0.075 + 0.1 * Math.sin(Math.PI * Math.min(1, f * 1.15)) ** 0.7;
      if (r > 0.97) c *= 1 - ((r - 0.97) / 0.1) ** 2 * 0.55;
      const t = lerp(0.22, 0.07, f);
      const beta = Math.atan(1.75 / (2 * Math.PI * Math.max(r, 0.15)));
      const prof = airfoil(0, 1, t, 0.03, 0.35, 8);
      n = prof.length;
      for (const [xc, yc] of prof) {
        const Y = (xc - 0.35) * c, Z = yc * c;
        pos.push(r, Y * Math.cos(beta) - Z * Math.sin(beta), Y * Math.sin(beta) + Z * Math.cos(beta));
      }
    }
    for (let i = 0; i < steps; i++) for (let k = 0; k < n - 1; k++) {
      const a = i * n + k, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const base = steps * n;
    for (let k = 1; k < n - 1; k++) idx.push(base, base + k, base + k + 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const bodyGeo = bladeLoft(0.12, 0.96, 14), tipGeo = bladeLoft(0.96, 1.07, 4);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Group();
    const bm = new THREE.Mesh(bodyGeo, bladeMat);
    const tm = new THREE.Mesh(tipGeo, tipMat);
    bm.castShadow = true;
    b.add(bm, tm);
    b.rotation.z = (i * Math.PI * 2) / 3;
    blades.add(b);
  }
  prop.add(blades);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.08, 48), new THREE.MeshBasicMaterial({ map: propDiscTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  disc.position.z = 0.02;
  disc.renderOrder = 11;
  prop.add(disc);
  root.add(prop);

  // ---------------- cockpit interior ----------------
  const cockpit = new THREE.Group();
  const ci = {};
  const addC = (mat, g) => { (ci[mat] ||= []).push(tagged(g)); };
  const cabAO = (x, y, z) => 0.55 + 0.45 * smoothstep(-0.3, 0.85, y) * (z < -0.85 ? 0.85 : 1);
  addC('floor', tx(new THREE.BoxGeometry(0.95, 0.03, 1.5), 0, -0.25, -0.25));
  for (const sx of [1, -1]) {
    addC('interior', tx(new THREE.BoxGeometry(0.03, 0.88, 1.45), sx * 0.51, 0.2, -0.25));
    addC('interior', rbox(0.13, 0.09, 0.95, 0.02, sx * 0.43, 0.42, -0.12)); // side consoles
  }
  // Tubular cage visible inside (light grey tubes, rounded joints).
  for (const [a, b] of [
    [[0.49, -0.1, 0.42], [0.49, 0.6, -0.4]], [[-0.49, -0.1, 0.42], [-0.49, 0.6, -0.4]],
    [[0.49, 0.6, 0.42], [0.49, -0.1, -0.85]], [[-0.49, 0.6, 0.42], [-0.49, -0.1, -0.85]],
    [[-0.48, 0.55, -0.9], [0.48, 0.55, -0.9]], [[0.49, 0.25, 0.42], [0.49, 0.25, -0.9]], [[-0.49, 0.25, 0.42], [-0.49, 0.25, -0.9]],
  ]) { addC('interior', rod(a, b, 0.018, 8)); addC('interior', ball(a, 0.024, 8)); }
  // Seat: ribbed cushions on a tube frame, harness with buckle.
  addC('seat', rbox(0.5, 0.11, 0.48, 0.04, 0, 0.05, -0.55));
  addC('seat', rbox(0.5, 0.78, 0.11, 0.045, 0, 0.44, -0.8, -0.12));
  addC('seat', rbox(0.42, 0.2, 0.08, 0.035, 0, 0.95, -0.86, -0.12));
  for (const sx of [1, -1]) {
    addC('steel', rod([sx * 0.22, -0.24, -0.4], [sx * 0.22, 0.0, -0.55], 0.015, 8));
    addC('steel', rod([sx * 0.24, 0.0, -0.32], [sx * 0.24, 0.0, -0.78], 0.014, 8));
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.62, 0.01), M.harness);
    strap.position.set(sx * 0.12, 0.48, -0.74);
    strap.rotation.x = -0.12;
    cockpit.add(strap);
  }
  addC('steel', rbox(0.07, 0.05, 0.012, 0.01, 0, 0.2, -0.69, -0.12));
  // Instrument panel (live canvas) with real depth: backing, bezels, lamp
  // housings, compass and GPS frames, toggle nuts.
  const panelMat = new THREE.MeshStandardMaterial({ map: panel.texture, roughness: 0.55, emissive: 0xffffff, emissiveMap: panel.texture, emissiveIntensity: 0.12 });
  const panelMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.48), panelMat);
  panelMesh.position.set(0, 0.44, 0.335);
  panelMesh.rotation.y = Math.PI;
  cockpit.add(panelMesh);
  addC('interior', tx(new THREE.BoxGeometry(0.98, 0.5, 0.05), 0, 0.44, 0.365));
  {
    const PX = (px) => 0.48 - (px / 1024) * 0.96, PY = (py) => 0.68 - (py / 512) * 0.48, s = 0.96 / 1024, zf = 0.333;
    for (const [px, py, r] of [[95, 178, 54], [255, 178, 82], [445, 178, 82], [95, 348, 54], [255, 348, 82], [445, 348, 82], [598, 212, 48]]) {
      const R = (r + 7) * s;
      addC('gloss', tx(new THREE.TorusGeometry(R, 0.005, 8, 32), PX(px), PY(py), zf - 0.004));
      addC('gloss', tx(new THREE.CylinderGeometry(R, R, 0.014, 32, 1, true), PX(px), PY(py), zf, Math.PI / 2));
    }
    for (let i = 0; i < 5; i++) addC('gloss', tx(new THREE.CylinderGeometry(15 * s, 15 * s, 0.012, 16, 1, true), PX(210 + i * 44), PY(52), zf, Math.PI / 2));
    const frameBox = (x0, y0, x1, y1, d, t) => {
      const cx = (PX(x0) + PX(x1)) / 2, cy = (PY(y0) + PY(y1)) / 2, w = Math.abs(PX(x1) - PX(x0)), h = Math.abs(PY(y1) - PY(y0));
      addC('gloss', tx(new THREE.BoxGeometry(w + t * 2, t, d), cx, cy + h / 2 + t / 2, zf - d / 2 + 0.004));
      addC('gloss', tx(new THREE.BoxGeometry(w + t * 2, t, d), cx, cy - h / 2 - t / 2, zf - d / 2 + 0.004));
      addC('gloss', tx(new THREE.BoxGeometry(t, h, d), cx + w / 2 + t / 2, cy, zf - d / 2 + 0.004));
      addC('gloss', tx(new THREE.BoxGeometry(t, h, d), cx - w / 2 - t / 2, cy, zf - d / 2 + 0.004));
    };
    frameBox(672, 22, 1002, 322, 0.03, 0.008); // GPS bezel
    frameBox(546, 56, 650, 128, 0.02, 0.005); // compass housing
    frameBox(684, 338, 990, 482, 0.016, 0.005); // flow monitor
    for (let i = 0; i < 10; i++) addC('steel', tx(new THREE.CylinderGeometry(0.006, 0.007, 0.008, 10), PX(62 + i * 59), PY(478), zf - 0.004, Math.PI / 2));
    // Panel rim (sub-frame) around the canvas.
    addC('interior', tx(new THREE.BoxGeometry(0.99, 0.012, 0.03), 0, 0.2, 0.335));
    for (const sx of [1, -1]) addC('interior', tx(new THREE.BoxGeometry(0.012, 0.5, 0.03), sx * 0.49, 0.44, 0.335));
  }
  // Hopper sight window under the panel (live level).
  const sightMat = new THREE.MeshStandardMaterial({ map: panel.sightTexture, roughness: 0.4, emissive: 0xffffff, emissiveMap: panel.sightTexture, emissiveIntensity: 0.08 });
  const sight = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.3), sightMat);
  sight.position.set(-0.17, 0.0, 0.42);
  sight.rotation.y = Math.PI;
  cockpit.add(sight);
  addC('gloss', rbox(0.2, 0.33, 0.012, 0.006, -0.17, 0.0, 0.428));
  // Firewall under the panel and rear bulkhead behind the seat.
  addC('interior', tx(new THREE.BoxGeometry(1.0, 0.92, 0.03), 0, -0.22, 0.445));
  addC('interior', tx(new THREE.BoxGeometry(1.08, 1.2, 0.03), 0, 0.0, -0.94));
  add('deck', tx(new THREE.BoxGeometry(0.98, 0.025, 0.12), 0, 0.685, 0.41));
  // Padded glareshield roll.
  const glareCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.48, 0.655, 0.325), new THREE.Vector3(0.26, 0.695, 0.322), new THREE.Vector3(0, 0.71, 0.32),
    new THREE.Vector3(-0.26, 0.695, 0.322), new THREE.Vector3(-0.48, 0.655, 0.325),
  ]);
  addC('gloss', new THREE.TubeGeometry(glareCurve, 32, 0.032, 12, false));
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
  lightbar.add(new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.032, 0.03, 2, 0.006), M.dark));
  cockpit.add(lightbar);
  // Stick: rubber boot, shaft, ergonomic black grip with hat switch and trigger.
  const stick = new THREE.Group();
  stick.position.set(0, -0.22, -0.12);
  const boot = new THREE.Mesh(lathe([[0.075, 0], [0.07, 0.02], [0.05, 0.06], [0.03, 0.1], [0.018, 0.14]], 16), M.rubber);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.56, 10), M.steel);
  shaft.position.y = 0.3;
  const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.027, 0.11, 6, 14), M.gloss);
  grip.position.set(0, 0.63, 0.012);
  grip.rotation.x = 0.22;
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.015, 10), M.red);
  hat.position.set(0, 0.71, 0.035);
  const trig = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.035, 0.012), M.dark);
  trig.position.set(0, 0.62, 0.042);
  stick.add(boot, shaft, grip, hat, trig);
  cockpit.add(stick);
  // Rudder pedals (plate + arm).
  const pedals = [];
  for (const sx of [1, -1]) {
    const p = new THREE.Group();
    p.position.set(sx * 0.17, -0.12, 0.42);
    p.rotation.x = -0.6;
    p.add(new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.16, 0.025, 2, 0.008), M.steel));
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 8), M.steel);
    arm.position.set(0, -0.12, 0.03);
    p.add(arm);
    cockpit.add(p);
    pedals.push(p);
  }
  // Throttle quadrant on the left console: throttle (yellow knob) + prop lever.
  addC('dark', rbox(0.1, 0.05, 0.32, 0.015, 0.43, 0.485, 0.05));
  const throttle = new THREE.Group();
  throttle.position.set(0.415, 0.5, 0.05);
  const tl = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.17, 8), M.steel);
  tl.position.y = 0.085;
  const tk = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.03, 0.035, 2, 0.01), M.yellow);
  tk.position.y = 0.17;
  throttle.add(tl, tk);
  cockpit.add(throttle);
  const propLever = new THREE.Group();
  propLever.position.set(0.45, 0.5, 0.0);
  propLever.rotation.x = 0.35;
  const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.15, 8), M.steel);
  pl.position.y = 0.075;
  const pk = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 10), M.gloss);
  pk.position.y = 0.15;
  propLever.add(pl, pk);
  cockpit.add(propLever);
  // Spray valve handle on the right console.
  const valve = new THREE.Group();
  valve.position.set(-0.43, 0.47, 0.0);
  const vl = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.16, 8), M.steel);
  vl.position.y = 0.08;
  const vk = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.03, 0.03, 2, 0.008), M.red);
  vk.position.y = 0.16;
  valve.add(vl, vk);
  cockpit.add(valve);
  // Red canopy release handle and a fire extinguisher.
  const er = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 8, 16, Math.PI), M.red);
  er.position.set(-0.47, 0.5, 0.2);
  er.rotation.y = Math.PI / 2;
  cockpit.add(er);
  const ext = new THREE.Mesh(mergeGeometries([tagged(lathe([[0, -0.14], [0.035, -0.14], [0.036, 0.1], [0.025, 0.14], [0.01, 0.16], [0, 0.16]], 16))]), M.red);
  ext.position.set(0.38, 0.05, -0.75);
  cockpit.add(ext);
  for (const [mat, parts] of Object.entries(ci)) {
    const g = mergeGeometries(parts);
    if (g.attributes.color) shade(g, cabAO);
    const m = new THREE.Mesh(g, M[mat]);
    m.receiveShadow = true;
    cockpit.add(m);
  }
  const hl = new THREE.Mesh(headliner, M.headliner);
  cockpit.add(hl);
  root.add(cockpit);

  // ---------------- pilot (seen from outside) ----------------
  const pilot = new THREE.Group();
  const capsule = (a, b, r, mat, parent = pilot) => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const len = Math.max(0.01, va.distanceTo(vb));
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 12), mat);
    m.position.copy(va).add(vb).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.sub(va).normalize());
    parent.add(m);
    return m;
  };
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.3, 6, 16), M.suit);
  torso.scale.set(1.18, 1, 0.78);
  torso.position.set(0, 0.55, -0.66);
  torso.rotation.x = -0.12;
  pilot.add(torso);
  pilot.add(at(new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.16, 0.3, 3, 0.06), M.suit), 0, 0.2, -0.6));
  capsule([0, 0.76, -0.68], [0, 0.86, -0.67], 0.045, M.skin);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.095, 20, 14), M.skin);
  head.position.set(0, 0.95, -0.64);
  pilot.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.128, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), M.helmet);
  helmet.scale.set(1, 1.04, 1.12);
  helmet.position.set(0, 0.97, -0.66);
  pilot.add(helmet);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.133, 20, 10, -Math.PI * 0.32, Math.PI * 0.64, Math.PI * 0.32, Math.PI * 0.2), M.visor);
  visor.scale.set(1, 1.04, 1.12);
  visor.position.set(0, 0.97, -0.66);
  pilot.add(visor);
  for (const sx of [1, -1]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.035, 16), M.gloss);
    cup.position.set(sx * 0.125, 0.95, -0.66);
    cup.rotation.z = Math.PI / 2;
    pilot.add(cup);
  }
  capsule([0.13, 0.93, -0.62], [0.06, 0.9, -0.54], 0.006, M.gloss);
  // Upper arms (static); forearms + gloves ride on the stick and the throttle.
  capsule([-0.21, 0.72, -0.66], [-0.2, 0.52, -0.45], 0.045, M.suit);
  capsule([0.21, 0.72, -0.66], [0.32, 0.56, -0.4], 0.045, M.suit);
  const S0 = new THREE.Vector3(0, -0.22, -0.12), T0 = new THREE.Vector3(0.415, 0.5, 0.05);
  const rel = (p, o) => [p[0] - o.x, p[1] - o.y, p[2] - o.z];
  const handR = new THREE.Group(), handL = new THREE.Group();
  capsule(rel([-0.2, 0.52, -0.45], S0), rel([-0.02, 0.42, -0.14], S0), 0.04, M.suit, handR);
  const gR = new THREE.Mesh(new THREE.SphereGeometry(0.042, 14, 10), M.glove);
  gR.position.set(...rel([-0.01, 0.42, -0.11], S0));
  gR.scale.set(1, 1.2, 0.9);
  handR.add(gR);
  stick.add(handR);
  capsule(rel([0.32, 0.56, -0.4], T0), rel([0.41, 0.64, 0.0], T0), 0.04, M.suit, handL);
  const gL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 14, 10), M.glove);
  gL.position.set(...rel([0.415, 0.67, 0.04], T0));
  handL.add(gL);
  throttle.add(handL);
  // Legs to the pedals, boots.
  for (const sx of [1, -1]) {
    capsule([sx * 0.1, 0.18, -0.55], [sx * 0.13, 0.3, -0.13], 0.06, M.suit);
    capsule([sx * 0.13, 0.3, -0.13], [sx * 0.17, -0.06, 0.33], 0.05, M.suit);
    pilot.add(at(new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.08, 0.2, 2, 0.03), M.glove), sx * 0.17, -0.1, 0.38));
  }
  pilot.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.add(pilot);
  // The camera rig hides the pilot in the cockpit view; the hands ride on the
  // controls, so they follow the pilot's visibility.
  {
    let vis = true;
    Object.defineProperty(pilot, 'visible', { get: () => vis, set: (v) => { vis = v; handR.visible = v; handL.visible = v; } });
  }

  // ---------------- merge static parts ----------------
  const fine = new THREE.Group();
  for (const [k, parts] of Object.entries(B)) {
    const isFine = k.startsWith('fine:');
    const mat = M[isFine ? k.slice(5) : k];
    const m = new THREE.Mesh(mergeGeometries(parts), mat);
    // Fine parts are smaller than a shadow texel: skip them in the shadow pass.
    m.castShadow = !isFine && mat !== M.glass && mat !== M.lens;
    m.receiveShadow = true;
    if (mat === M.lens) m.renderOrder = 9;
    (isFine ? fine : root).add(m);
  }
  const lod = new THREE.LOD();
  lod.addLevel(fine, 0);
  lod.addLevel(new THREE.Group(), 80);
  root.add(lod);
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

// Soft contact shadow (ambient occlusion on the ground under the aircraft):
// a blurred planform decal laid on the terrain, fading with height. Visual only.
export function createContactShadow() {
  const S = 256, W = 13, L = 9;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const px = (x) => ((x + W / 2) / W) * S, pz = (z) => ((z + L / 2) / L) * S;
  g.filter = 'blur(9px)';
  g.fillStyle = 'rgba(0,0,0,0.9)';
  g.fillRect(px(-5.9), pz(-0.85), px(5.9) - px(-5.9), pz(0.85) - pz(-0.85)); // wing
  g.beginPath(); g.ellipse(px(0), pz(-0.55), (0.62 / W) * S, (3.8 / L) * S, 0, 0, Math.PI * 2); g.fill(); // fuselage
  g.fillRect(px(-1.9), pz(-4.15), px(1.9) - px(-1.9), pz(-3.3) - pz(-4.15)); // tailplane
  g.filter = 'blur(22px)';
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.beginPath(); g.ellipse(px(0), pz(0), (4.2 / W) * S, (2.6 / L) * S, 0, 0, Math.PI * 2); g.fill();
  const geo = new THREE.PlaneGeometry(W, L).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: canvasTexture(c), transparent: true, opacity: 0, depthWrite: false, color: 0xffffff });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 2;
  m.frustumCulled = false;
  return m;
}

