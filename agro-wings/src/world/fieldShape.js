// Field shapes (pure functions, no three.js). A field is its bounding
// rectangle (x0…x1, z0…z1) and, optionally, a finer shape inside it:
//   circle  — a centre-pivot disc { x, z, r } (Mato Grosso Operations);
//   outline — a closed polygon [[x, z], …] (an irregular talhão cut out of
//             the forest: curved edges where the trees were left, straight
//             ones where the machines opened it). Mato Grosso refinement 2.0.
// Fields with neither are their rectangle, exactly as before.
//
// Everything that needs to know "is this point crop?" (coverage, GPS passes,
// crop rows, ground colour, vegetation clearing, maps, contract area) asks
// here, so rectangles and pivot discs keep their old code paths.

// --- polygons ---------------------------------------------------------------
// Even-odd point in polygon.
export function pointInPoly(P, x, z) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, zi] = P[i], [xj, zj] = P[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
// Distance to the polygon's edge (unsigned).
export function polyEdgeDist(P, x, z) {
  let d2 = Infinity;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, az] = P[j], [bx, bz] = P[i];
    const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
    const dx = x - ax - ex * t, dz = z - az - ez * t, q = dx * dx + dz * dz;
    if (q < d2) d2 = q;
  }
  return Math.sqrt(d2);
}
// Nearest point on the polygon's edge.
export function polyClosest(P, x, z) {
  let d2 = Infinity, bx0 = x, bz0 = z;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, az] = P[j], [bx, bz] = P[i];
    const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
    const px = ax + ex * t, pz = az + ez * t, q = (x - px) ** 2 + (z - pz) ** 2;
    if (q < d2) { d2 = q; bx0 = px; bz0 = pz; }
  }
  return [bx0, bz0];
}
// Signed distance: negative inside.
export const polySd = (P, x, z) => (pointInPoly(P, x, z) ? -1 : 1) * polyEdgeDist(P, x, z);
// Area (shoelace), m².
export function polyArea(P) {
  let a = 0;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) a += (P[j][0] + P[i][0]) * (P[j][1] - P[i][1]);
  return Math.abs(a) / 2;
}
// Where the line {cross axis = c} crosses the polygon: sorted pairs of the
// along coordinate [[a0, a1], …] (alongX: rows run along x, c is a z).
export function polySpans(P, alongX, c) {
  const xs = [];
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, az] = P[j], [bx, bz] = P[i];
    const ca = alongX ? az : ax, cb = alongX ? bz : bx, la = alongX ? ax : az, lb = alongX ? bx : bz;
    if ((ca > c) !== (cb > c)) xs.push(la + ((c - ca) / (cb - ca)) * (lb - la));
  }
  xs.sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
  return out;
}

// Organic outline from a control polygon: Chaikin corner cutting (curves
// where the forest was left), except at control points marked sharp
// ([x, z, 1]: a corner the machines cut square), and a light wobble of the
// edge where it was not cut straight. Deterministic.
export function organicOutline(ctrl, { iter = 3, wobble = 0, seed = 1 } = {}) {
  let P = ctrl.map(([x, z, s]) => [x, z, s ? 1 : 0]);
  for (let k = 0; k < iter; k++) {
    const Q = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      if (a[2]) Q.push(a); else Q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1], 0]);
      if (!b[2]) Q.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1], 0]);
    }
    P = Q;
  }
  if (wobble > 0) {
    P = P.map(([x, z, s], i) => {
      if (s) return [x, z];
      const n = Math.sin(i * 1.7 + seed * 12.9898) * 43758.5453;
      const w = (n - Math.floor(n) - 0.5) * 2 * wobble;
      const a = P[(i + P.length - 1) % P.length], b = P[(i + 1) % P.length];
      const tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1;
      return [x - (tz / l) * w, z + (tx / l) * w]; // along the normal
    });
  } else P = P.map(([x, z]) => [x, z]);
  // Drop near-duplicate points (sharp corners next to cut ones).
  const out = [];
  for (const p of P) { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.5) out.push(p); }
  return out;
}

// --- fields -----------------------------------------------------------------
// Inside the field's crop (m: margin, outwards).
export function fieldInside(f, x, z, m = 0) {
  if (x < f.x0 - m || x > f.x1 + m || z < f.z0 - m || z > f.z1 + m) return false;
  if (f.circle) return Math.hypot(x - f.circle.x, z - f.circle.z) <= f.circle.r + m;
  if (f.outline) return m <= 0 ? pointInPoly(f.outline, x, z) && (m === 0 || polyEdgeDist(f.outline, x, z) >= -m) : polySd(f.outline, x, z) <= m;
  return true;
}
// Signed distance to the field's edge (negative inside).
export function fieldSd(f, x, z) {
  if (f.circle) return Math.hypot(x - f.circle.x, z - f.circle.z) - f.circle.r;
  if (f.outline) return polySd(f.outline, x, z);
  const dx = Math.max(f.x0 - x, x - f.x1), dz = Math.max(f.z0 - z, z - f.z1);
  return dx > 0 || dz > 0 ? Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) : Math.max(dx, dz);
}
// The crop along the row line at cross coordinate c (rows along x when
// alongX): [[a0, a1], …] within the field's rectangle.
export function fieldSpans(f, alongX, c) {
  const l0 = alongX ? f.x0 : f.z0, l1 = alongX ? f.x1 : f.z1;
  if (f.circle) {
    const C = f.circle, off = c - (alongX ? C.z : C.x), hh = C.r * C.r - off * off;
    if (hh <= 0) return [];
    const half = Math.sqrt(hh), mid = alongX ? C.x : C.z;
    return [[Math.max(l0, mid - half), Math.min(l1, mid + half)]];
  }
  if (f.outline) return polySpans(f.outline, alongX, c).map(([a, b]) => [Math.max(l0, a), Math.min(l1, b)]).filter(([a, b]) => b > a);
  const c0 = alongX ? f.z0 : f.x0, c1 = alongX ? f.z1 : f.x1;
  return c < c0 || c > c1 ? [] : [[l0, l1]];
}
// Crop area, m².
export function fieldArea(f) {
  if (f.circle) return Math.PI * f.circle.r ** 2;
  if (f.outline) return polyArea(f.outline);
  return (f.x1 - f.x0) * (f.z1 - f.z0);
}
// Its outline as points (a rectangle's four corners, a disc's rim).
export function fieldOutline(f, seg = 24) {
  if (f.outline) return f.outline;
  if (f.circle) {
    const C = f.circle, N = Math.max(24, Math.ceil((2 * Math.PI * C.r) / seg)), out = [];
    for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; out.push([C.x + Math.cos(a) * C.r, C.z + Math.sin(a) * C.r]); }
    return out;
  }
  return [[f.x0, f.z0], [f.x1, f.z0], [f.x1, f.z1], [f.x0, f.z1]];
}
// Canvas path of the field (pad: grown outwards, for fills; the caller fills
// or strokes). Rectangles and discs as before.
export function fieldPath(g, f, pad = 0) {
  g.beginPath();
  if (f.circle) { g.arc(f.circle.x, f.circle.z, f.circle.r + pad, 0, Math.PI * 2); return; }
  if (f.outline) {
    const P = f.outline;
    g.moveTo(P[0][0], P[0][1]);
    for (let i = 1; i < P.length; i++) g.lineTo(P[i][0], P[i][1]);
    g.closePath();
    return;
  }
  g.rect(f.x0 - pad, f.z0 - pad, f.x1 - f.x0 + 2 * pad, f.z1 - f.z0 + 2 * pad);
}
// Bounding rectangle of an outline.
export function outlineBox(P) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of P) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  return { x0, x1, z0, z1 };
}
