/**
 * Time of day model — one continuous parameter `t`:
 *   0 = DIA, 1 = ENTARDECER, 2 = NOITE
 * Every light, the sky, the environment map, exposure and the emissive
 * architectural lighting are derived from `t`, so transitions are smooth.
 */
import * as THREE from 'three'
import { SUN } from '../data/houseSpec'

export const lightState = {
  t: 0,
  /** 0..1 weights */
  day: 1,
  sunset: 0,
  night: 0,
  /** artificial lights on (0.14 by day → 1 at night) */
  lights: 0.14,
}

export function updateFactors(t: number) {
  lightState.t = t
  lightState.day = THREE.MathUtils.clamp(1 - t, 0, 1)
  lightState.sunset = THREE.MathUtils.clamp(1 - Math.abs(t - 1), 0, 1)
  lightState.night = THREE.MathUtils.clamp(t - 1, 0, 1)
  lightState.lights = t < 1 ? 0.14 + 0.48 * t : 0.62 + 0.38 * (t - 1)
}

/** Golden-hour sun: low from the west-north-west, lighting the pool façade. */
const SUNSET = { azimuthDeg: -74, elevationDeg: 7 } // = 286°, reached through north

const _v = new THREE.Vector3()
export function sunDirection(t: number, out = _v) {
  const k = THREE.MathUtils.smoothstep(Math.min(t, 1), 0, 1)
  const az = THREE.MathUtils.lerp(SUN.azimuthDeg, SUNSET.azimuthDeg, k) * THREE.MathUtils.DEG2RAD
  const el = THREE.MathUtils.lerp(SUN.elevationDeg, SUNSET.elevationDeg, k) * THREE.MathUtils.DEG2RAD
  // azimuth measured from north (−Z) clockwise towards east (+X)
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize()
}

/** Shared GLSL used by the visible sky and by the IBL environment dome. */
export const SKY_GLSL = /* glsl */ `
uniform float uDay;
uniform float uSunset;
uniform float uNight;
uniform vec3 uSunDir;
float hash13(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
vec3 skyColor(vec3 d, float sunBoost){
  float h = d.y;
  float hp = max(h, 0.0);
  float toward = max(dot(normalize(vec3(d.x,0.0,d.z)), normalize(vec3(uSunDir.x,0.0,uSunDir.z))), 0.0);
  // day
  vec3 dayC = mix(vec3(0.60,0.72,0.86), vec3(0.17,0.37,0.72), pow(hp, 0.7));
  // golden hour
  vec3 horSun = mix(vec3(0.62,0.56,0.62), vec3(1.0,0.58,0.32), pow(toward, 3.0));
  vec3 setC = mix(horSun, vec3(0.20,0.27,0.50), pow(hp, 0.45));
  // night
  vec3 nightC = mix(vec3(0.05,0.065,0.10), vec3(0.010,0.016,0.038), pow(hp, 0.5));
  vec3 c = dayC * uDay + setC * uSunset + nightC * uNight;
  // ground below the horizon
  vec3 ground = vec3(0.30,0.28,0.24) * uDay + vec3(0.16,0.12,0.10) * uSunset + vec3(0.012) * uNight;
  c = h < 0.0 ? mix(c * 0.85, ground, clamp(-h * 5.0, 0.0, 1.0)) : c;
  // sun disc + glow (not at night)
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  vec3 sunCol = mix(vec3(1.0,0.94,0.84), vec3(1.0,0.62,0.30), uSunset);
  c += sunCol * (pow(sd, 900.0) * sunBoost + pow(sd, 10.0) * (0.10 + 0.35 * uSunset)) * (1.0 - uNight);
  return c;
}
`

export function skyUniforms() {
  return {
    uDay: { value: 1 },
    uSunset: { value: 0 },
    uNight: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  }
}

export function syncSkyUniforms(u: ReturnType<typeof skyUniforms>) {
  u.uDay.value = lightState.day
  u.uSunset.value = lightState.sunset
  u.uNight.value = lightState.night
  sunDirection(lightState.t, u.uSunDir.value)
}
