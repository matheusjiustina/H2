// Small math helpers shared by simulation and rendering. The first five mirror
// the helpers the Tidemark flight code was written against (clamp/lerp/smoothstep/damp).

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (e0, e1, x) => {
  const t = sat((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
// Frame-rate independent exponential approach.
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
// Move toward a target by at most rate*dt.
export const approach = (v, target, rate, dt) =>
  v < target ? Math.min(target, v + rate * dt) : Math.max(target, v - rate * dt);
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

// Deterministic PRNG (mulberry32).
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash-based value noise, smooth enough for terrain and texture work.
function hash2(ix, iz) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function valueNoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz) * 2 - 1;
}
export function fbm(x, z, oct = 4, lac = 2.03, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += valueNoise(x, z) * amp;
    norm += amp;
    amp *= gain;
    x = x * lac + 17.3;
    z = z * lac - 9.1;
  }
  return sum / norm;
}

// Distance from point to segment (2D, xz).
export function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? sat(((px - ax) * dx + (pz - az) * dz) / l2) : 0;
  const qx = ax + dx * t - px, qz = az + dz * t - pz;
  return Math.sqrt(qx * qx + qz * qz);
}

export const KT = 1.943844; // m/s -> knots
export const FT = 3.28084; // m -> ft
