export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number): number => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential smoothing factor. */
export const damp = (lambda: number, dt: number): number => 1 - Math.exp(-lambda * dt);
export const dampTo = (cur: number, target: number, lambda: number, dt: number): number =>
  cur + (target - cur) * damp(lambda, dt);
export const wrapAngle = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
export const dampAngle = (cur: number, target: number, lambda: number, dt: number): number =>
  cur + wrapAngle(target - cur) * damp(lambda, dt);
export const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);
export const round = (v: number, decimals: number): number => {
  const m = Math.pow(10, decimals);
  return Math.round(v * m) / m;
};
