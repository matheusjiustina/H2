// Thrush 510G airframe geometry shared by the exterior model
// (thrushModel.js) and the cockpit (thrushCockpit.js): fuselage
// cross-sections, the glasshouse and windshield surfaces, the wing and the
// cabin reference points. Body frame: +Z nose, +Y up, +X left wing; origin =
// CG (≈ 28 % MAC); thrust line at y 0.3.
//
// Fitted to side photographs of 510Gs (a parked three-point view and a
// spray pass): a slim GE H80 cowling whose top line falls steadily to the
// spinner; a deep hopper section with its lid rising to the windshield
// base; a tall glasshouse (windshield base 1.2 m above the CG, roof 1.86 m)
// with a three-piece windshield; behind it a short, steep cabin fairing and
// a long upswept tail cone; the belly runs on the wing and rises behind it.
// Overall length (spinner tip to rudder trailing edge) 9.85 m.
import { clamp, lerp } from '../core/math.js';

export const S = (z, yb, ys, yw, yt, hw, ww, tL, pL, pU, lean) => ({ z, yb, ys, yw, yt, hw, ww, tL, pL, pU, lean });
export const SILL = 1.2;
// Glasshouse: sides lean in by CAN.lean per metre above the sill and turn
// over a rounded roof (exponent CAN.pU) at CAN.yt; glass up to CAN.glassTop;
// the cabin fairing starts from the glasshouse section at CAN.zR.
export const CAN = { ww: 0.51, lean: 0.12, pU: 3.4, yt: 1.86, zR: -0.95, glassTop: 1.77 };
export const PROP_Z = 3.86, THRUST_Y = 0.3;

// Cowling and hopper section (spinner to windshield base). Station fields
// as in atModel.js: S(z, yb, ys, yw, yt, hw, ww, tL, pL, pU, lean).
export const FWD_KEYS = [
  S(3.8, 0.05, 0.3, 0.38, 0.55, 0.27, 0.25, 0.82, 2.2, 2.3, 0.08),
  S(3.7, -0.02, 0.28, 0.42, 0.6, 0.32, 0.29, 0.8, 2.5, 2.5, 0.14),
  S(3.4, -0.12, 0.26, 0.48, 0.67, 0.37, 0.33, 0.78, 2.8, 2.7, 0.24),
  S(2.9, -0.22, 0.24, 0.56, 0.77, 0.42, 0.37, 0.76, 3.2, 2.8, 0.3),
  S(2.3, -0.32, 0.2, 0.66, 0.9, 0.48, 0.42, 0.76, 3.6, 2.9, 0.36),
  S(1.85, -0.39, 0.16, 0.76, 1.02, 0.54, 0.47, 0.76, 4.0, 3.0, 0.4),
  S(1.3, -0.45, 0.12, 0.86, 1.1, 0.58, 0.5, 0.76, 4.4, 3.2, 0.38),
  S(0.85, -0.48, 0.1, 0.95, 1.16, 0.6, 0.51, 0.76, 4.5, 3.6, 0.3),
  S(0.62, -0.49, 0.1, 1.06, 1.19, 0.6, 0.51, 0.76, 4.5, 4.5, 0.22),
  S(0.48, -0.49, 0.1, 1.15, 1.2, 0.6, 0.51, 0.76, 4.5, 6, 0.18),
];
// Cabin: the lower fuselage only, cut along the sill.
export const CAB_KEYS = [[0.48, -0.49], [-0.3, -0.47], [CAN.zR, -0.42]].map(([z, yb]) => S(z, yb, 0.1, SILL, SILL, 0.6, CAN.ww, 0.76, 4.5, 2, 0));
// Cabin fairing and tail cone: the roof rolls off into a steep fairing
// that reaches the deck ~0.8 m behind the cabin; the deck then falls gently
// to the fin while the belly rises steeply — the 510's upswept tail cone,
// whose end sits above the thrust line.
export const AFT_KEYS = [
  S(CAN.zR, -0.42, 0.1, SILL, CAN.yt, 0.6, CAN.ww, 0.76, 4.5, CAN.pU, CAN.lean),
  S(-1.18, -0.4, 0.11, 1.17, 1.79, 0.59, 0.5, 0.76, 4.4, 3.3, 0.14),
  S(-1.48, -0.36, 0.12, 1.08, 1.52, 0.565, 0.48, 0.76, 4.1, 3.0, 0.17),
  S(-1.8, -0.31, 0.14, 0.98, 1.22, 0.53, 0.45, 0.755, 3.8, 2.9, 0.2),
  S(-2.2, -0.24, 0.17, 0.9, 1.08, 0.48, 0.4, 0.75, 3.5, 2.8, 0.22),
  S(-2.8, -0.12, 0.22, 0.82, 0.98, 0.4, 0.33, 0.74, 3.1, 2.7, 0.24),
  S(-3.4, 0.0, 0.28, 0.76, 0.9, 0.31, 0.26, 0.73, 2.8, 2.6, 0.24),
  S(-4.0, 0.14, 0.36, 0.72, 0.84, 0.22, 0.18, 0.72, 2.6, 2.5, 0.22),
  S(-4.6, 0.27, 0.43, 0.7, 0.8, 0.14, 0.11, 0.7, 2.5, 2.4, 0.18),
  S(-5.05, 0.37, 0.49, 0.68, 0.76, 0.07, 0.055, 0.7, 2.4, 2.4, 0.1),
  S(-5.3, 0.42, 0.53, 0.67, 0.74, 0.02, 0.018, 0.7, 2.4, 2.4, 0.02),
];

// Stations along the fuselage: every field Catmull-Rom interpolated, `per`
// stations per metre.
export function sampleSt(keys, per) {
  const out = [];
  const P = Object.keys(keys[0]);
  const cr = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)];
    const n = Math.max(2, Math.round(Math.abs(k1.z - k2.z) * per));
    for (let j = 0; j < n; j++) {
      const t = j / n, st = {};
      for (const k of P) st[k] = cr(k0[k], k1[k], k2[k], k3[k], t);
      st.hw = Math.max(0.005, st.hw); st.ww = Math.max(0.004, Math.min(st.ww, st.hw));
      st.pL = Math.max(1.6, st.pL); st.pU = Math.max(1.6, st.pU);
      out.push(st);
    }
  }
  out.push({ ...keys[keys.length - 1] });
  return out;
}
export const N_KEEL = 12, N_WALL = 4, N_TOP = 14;
// Left half of a section, bottom centre upward ([x, y] pairs); without the
// top part when `top` is false (it then ends on the wall's top).
export function halfSection(st, top = true) {
  const out = [];
  for (let i = 0; i <= N_KEEL; i++) {
    const a = (Math.PI / 2) * (1 - i / N_KEEL), f = Math.sin(a) ** (2 / st.pL);
    out.push([st.hw * Math.max(0, Math.cos(a)) ** (2 / st.pL) * lerp(1, st.tL, f), st.ys - (st.ys - st.yb) * f]);
  }
  for (let i = 1; i <= N_WALL; i++) out.push([lerp(st.hw, st.ww, i / N_WALL), lerp(st.ys, st.yw, i / N_WALL)]);
  if (top) {
    for (let i = 1; i <= N_TOP; i++) {
      const a = (Math.PI / 2) * (i / N_TOP), u = Math.sin(a) ** (2 / st.pU), y = st.yw + (st.yt - st.yw) * u;
      out.push([Math.max(0, st.ww - st.lean * (y - st.yw)) * Math.max(0, Math.cos(a)) ** (2 / st.pU), y]);
    }
  }
  return out;
}
// Closed section (counter-clockwise seen from the nose, starting and ending
// at the bottom centre), or the open cabin section from sill to sill.
export function sectionRing(st, open = false) {
  const h = halfSection(st, !open);
  const m = h.map(([x, y]) => [-x, y]);
  return open ? m.reverse().concat(h.slice(1)) : h.concat(m.reverse().slice(1));
}
export const FWD_ST = sampleSt(FWD_KEYS, 20);
export const CAB_ST = sampleSt(CAB_KEYS, 8);
export const AFT_ST = sampleSt(AFT_KEYS, 14);
const ALL_ST = [...FWD_ST, ...AFT_ST].sort((a, b) => b.z - a.z);
// Half-width of the fuselage skin at (z, y).
export function fusX(z, y) {
  const xAt = (st) => {
    const h = halfSection(st);
    if (y <= h[0][1]) return 0;
    for (let i = 1; i < h.length; i++) {
      if (y <= h[i][1]) { const [x0, y0] = h[i - 1], [x1, y1] = h[i]; return x0 + ((y - y0) / Math.max(1e-6, y1 - y0)) * (x1 - x0); }
    }
    return 0;
  };
  const i = ALL_ST.findIndex((st) => st.z <= z);
  if (i <= 0) return xAt(ALL_ST[Math.max(0, i)]);
  const a = ALL_ST[i - 1], b = ALL_ST[i], t = (a.z - z) / Math.max(1e-6, a.z - b.z);
  return lerp(xAt(a), xAt(b), t);
}
// Crown height of the fuselage at z (cowling, hopper lid, deck).
export function crownY(z) {
  const st = ALL_ST.reduce((a, b) => (Math.abs(b.z - z) < Math.abs(a.z - z) ? b : a));
  return st.yt;
}

// Glasshouse half-width at height y.
export const canW = (y) => {
  const u = clamp((y - SILL) / (CAN.yt - SILL), 0, 1);
  return Math.max(0, CAN.ww - CAN.lean * (y - SILL)) * Math.max(0, 1 - u ** CAN.pU) ** (1 / CAN.pU);
};
// Windshield: a wide flat centre pane (half-width wsC) raked back from the
// hopper lid (canF: z of the pane at height y), two flat side panes angled
// back to the A-posts.
export const canF = (y) => 0.48 - 0.56 * Math.pow(clamp((y - SILL) / (CAN.yt - SILL), 0, 1), 1.25);
export const wsC = (y) => lerp(0.3, 0.24, clamp((y - SILL) / (CAN.glassTop - SILL), 0, 1.2));
export const WS_K = 0.95; // side pane: metres aft per metre outboard
// Door post (between the door window and the rear quarter window).
export const DOOR_Z = -0.62;

// Wing: constant 2.37 m chord, 3.5° dihedral from the root; 14.48 m span
// with the tip caps.
const DIH = Math.tan((3.5 * Math.PI) / 180);
export const TH_WING = { rootX: 0.6, tipX: 7.08, rootY: -0.47, le: 0.75, chord: 2.37, dih: DIH };
export const thWingY = (x) => TH_WING.rootY + Math.max(0, Math.abs(x) - TH_WING.rootX) * DIH;

// Pilot reference: the PR-AGW seat/stick/pedal layout (what the shared
// pilot figure is built around) moved by this offset; the eye point is the
// cockpit camera's position.
export const COCKPIT_OFF = [0, 0.57, 0.06];
export const EYE = [0, 1.0 + COCKPIT_OFF[1], -0.5 + COCKPIT_OFF[2]];
