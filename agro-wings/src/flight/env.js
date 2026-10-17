// Environment adapter consumed by FlightModel.step(): terrain, surfaces, crops, wind.
import { Vector3 } from 'three';
import { fieldAt, cropHeight } from '../world/layout.js';
import { WIND } from '../config.js';

export function createFlightEnv(terrain) {
  const env = {
    wind: new Vector3(),
    ground: (x, z) => terrain.heightAt(x, z),
    normal: (x, z, out) => terrain.normalAt(x, z, out),
    surface: (x, z) => terrain.surfaceAt(x, z),
    cropHeight: (x, z) => cropHeight(fieldAt(x, z)),
    top: (x, z) => terrain.heightAt(x, z) + cropHeight(fieldAt(x, z)),
  };
  return env;
}

// Mean wind vector (the direction the air moves TO) + slow gusts and a little
// low-level turbulence. Smooth sums of sines: no random jerks.
export function windAt(out, t, pos, agl, scale = 1) {
  const toDir = WIND.dirFrom + Math.PI;
  const gust = (Math.sin(t * 0.21) * 0.6 + Math.sin(t * 0.53 + 1.3) * 0.3 + Math.sin(t * 1.37 + 0.4) * 0.1) * WIND.gust;
  // Wind gradient: weaker close to the ground.
  const grad = 0.55 + 0.45 * Math.min(1, Math.max(0, agl) / 40);
  const spd = (WIND.speed + gust) * grad * scale;
  const veer = Math.sin(t * 0.11) * 0.12;
  out.set(Math.sin(toDir + veer) * spd, 0, -Math.cos(toDir + veer) * spd);
  if (pos) {
    const k = WIND.turbulence * scale * (1 - Math.min(1, agl / 120));
    out.x += k * (Math.sin(t * 2.3 + pos.x * 0.011) + 0.5 * Math.sin(t * 5.1 + pos.z * 0.017));
    out.y += k * 0.6 * Math.sin(t * 1.9 + pos.z * 0.013 + pos.x * 0.007);
    out.z += k * (Math.sin(t * 2.9 + pos.z * 0.012) + 0.5 * Math.sin(t * 4.3 + pos.x * 0.019));
  }
  return out;
}

// Compass convention: heading 0 = north (-Z), 90 = east (+X).
export const compassFromYaw = (yaw) => {
  // yaw = atan2(fwd.x, fwd.z)  (0 = +Z = south)
  let d = 180 - (yaw * 180) / Math.PI;
  d = ((d % 360) + 360) % 360;
  return d;
};
export const yawFromCompass = (deg) => Math.PI - (deg * Math.PI) / 180;
