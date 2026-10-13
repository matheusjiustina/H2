import { Color, DirectionalLight, Fog, Quaternion, Scene, Vector3 } from 'three';
import { Sky } from './Sky';
import { worldUniforms } from './materials';
import { tangentFrame } from '../core/math/sphere';

interface Key {
  t: number;
  zenith: string;
  horizon: string;
  below: string;
  sun: string;
  sunI: number;
  glow: string;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  fog: string;
  night: number;
  rim: string;
}

/** Hand-tuned palette across the day. Night stays readable: cool, bright ambient and moonlight. */
const KEYS: Key[] = [
  { t: 0.0, zenith: '#16213f', horizon: '#3a4d7a', below: '#2a3a60', sun: '#9fb4ff', sunI: 0.75, glow: '#6c7fc0', hemiSky: '#5a72b0', hemiGround: '#2f3550', hemiI: 0.95, fog: '#33456f', night: 1, rim: '#9fb4ff' },
  { t: 0.2, zenith: '#22305a', horizon: '#6a6c96', below: '#3c4670', sun: '#a9b8ff', sunI: 0.45, glow: '#e59a7a', hemiSky: '#6577b0', hemiGround: '#3b3b55', hemiI: 0.9, fog: '#5d6290', night: 0.8, rim: '#c3b3ff' },
  { t: 0.255, zenith: '#5f86c8', horizon: '#f2b38a', below: '#c99d8a', sun: '#ffc48a', sunI: 0.9, glow: '#ffae6b', hemiSky: '#a4b9e0', hemiGround: '#7a6650', hemiI: 0.85, fog: '#e3b49a', night: 0.3, rim: '#ffd2a8' },
  { t: 0.32, zenith: '#5ea5ea', horizon: '#cfe7f5', below: '#a9cde0', sun: '#fff0d2', sunI: 2.2, glow: '#ffdca8', hemiSky: '#bcd9ff', hemiGround: '#8f7d60', hemiI: 0.85, fog: '#c9e2f3', night: 0, rim: '#fff1d6' },
  { t: 0.5, zenith: '#4c9be6', horizon: '#c9e6f8', below: '#a3cde4', sun: '#fff7e6', sunI: 2.5, glow: '#fff0c8', hemiSky: '#c4dfff', hemiGround: '#9a8565', hemiI: 0.9, fog: '#c3e1f5', night: 0, rim: '#fff6e0' },
  { t: 0.68, zenith: '#5a9de0', horizon: '#e0e6e8', below: '#b6cfdc', sun: '#ffe7bf', sunI: 2.2, glow: '#ffd59a', hemiSky: '#c0d6f2', hemiGround: '#9a805d', hemiI: 0.85, fog: '#d6e2ec', night: 0, rim: '#ffe9c4' },
  { t: 0.745, zenith: '#5872b8', horizon: '#ff9e6e', below: '#c98478', sun: '#ff9a5c', sunI: 1.3, glow: '#ff8a50', hemiSky: '#b3a8d6', hemiGround: '#7b5a4a', hemiI: 0.85, fog: '#e7a183', night: 0.2, rim: '#ffb184' },
  { t: 0.8, zenith: '#2b3466', horizon: '#9a6f96', below: '#4f4870', sun: '#a9b8ff', sunI: 0.5, glow: '#c27894', hemiSky: '#6c78b4', hemiGround: '#41394f', hemiI: 0.9, fog: '#6a6188', night: 0.75, rim: '#c6a8ff' },
  { t: 1.0, zenith: '#16213f', horizon: '#3a4d7a', below: '#2a3a60', sun: '#9fb4ff', sunI: 0.75, glow: '#6c7fc0', hemiSky: '#5a72b0', hemiGround: '#2f3550', hemiI: 0.95, fog: '#33456f', night: 1, rim: '#9fb4ff' },
];

const parsed = KEYS.map((k) => ({
  ...k,
  c: {
    zenith: new Color(k.zenith),
    horizon: new Color(k.horizon),
    below: new Color(k.below),
    sun: new Color(k.sun),
    glow: new Color(k.glow),
    hemiSky: new Color(k.hemiSky),
    hemiGround: new Color(k.hemiGround),
    fog: new Color(k.fog),
    rim: new Color(k.rim),
  },
}));

export type DayPhase = 'night' | 'dawn' | 'morning' | 'afternoon' | 'sunset' | 'dusk';

/**
 * Time of day: drives the sun/moon light, sky gradient, fog and the shared world uniforms.
 * The sun's path is defined in a sky frame that is parallel-transported with the player, so
 * lighting is consistent everywhere on the planet (no permanent night side) and never jumps.
 */
export class Lighting {
  time = 0.34; // 0..1, 0 = midnight
  dayLength = 16 * 60; // seconds per full cycle
  paused = false;
  readonly sun: DirectionalLight;
  readonly sky = new Sky();
  readonly skyEast = new Vector3(1, 0, 0);
  readonly skyNorth = new Vector3(0, 1, 0);
  readonly sunDir = new Vector3();
  readonly moonDir = new Vector3();
  night = 0;
  private fog: Fog;
  private tmpC = new Color();

  constructor(scene: Scene, shadowSize: number) {
    this.sun = new DirectionalLight('#fff4dc', 2.2);
    this.setShadows(shadowSize);
    scene.add(this.sun, this.sun.target);
    scene.add(this.sky.mesh);
    this.fog = new Fog('#c3e1f5', 50, 165);
    scene.fog = this.fog;
  }

  setShadows(size: number): void {
    const s = this.sun;
    s.castShadow = size > 0;
    if (size > 0) {
      s.shadow.mapSize.set(size, size);
      s.shadow.map?.dispose();
      s.shadow.map = null as any;
      const sc = s.shadow.camera;
      sc.left = -28; sc.right = 28; sc.top = 28; sc.bottom = -28; sc.near = 1; sc.far = 140;
      sc.updateProjectionMatrix();
      s.shadow.bias = -0.0009;
      s.shadow.normalBias = 0.07;
    }
  }

  /** Initialise the transported sky frame at a location. */
  resetFrame(up: Vector3): void {
    tangentFrame(up, this.skyEast, this.skyNorth);
  }

  get phase(): DayPhase {
    const t = this.time;
    if (t < 0.21 || t >= 0.82) return 'night';
    if (t < 0.29) return 'dawn';
    if (t < 0.5) return 'morning';
    if (t < 0.71) return 'afternoon';
    if (t < 0.77) return 'sunset';
    return 'dusk';
  }

  /** Hours:minutes string for UI. */
  get clock(): string {
    const mins = Math.floor(this.time * 24 * 60);
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }

  update(dt: number, up: Vector3, frameQuat: Quaternion, focus: Vector3, cameraPos: Vector3): void {
    if (!this.paused) this.time = (this.time + dt / this.dayLength) % 1;
    // Transport the sky frame with the player.
    this.skyEast.applyQuaternion(frameQuat).addScaledVector(up, -this.skyEast.dot(up)).normalize();
    this.skyNorth.crossVectors(up, this.skyEast).normalize();

    // Interpolate palette.
    let i = 0;
    while (i < parsed.length - 2 && parsed[i + 1].t <= this.time) i++;
    const a = parsed[i], b = parsed[i + 1];
    const f = (this.time - a.t) / (b.t - a.t);
    const lerpC = (k: keyof (typeof a)['c'], out: Color) => out.copy(a.c[k]).lerp(b.c[k], f);
    const lerpN = (x: number, y: number) => x + (y - x) * f;

    const su = this.sky.uniforms;
    lerpC('zenith', su.uZenith.value);
    lerpC('horizon', su.uHorizon.value);
    lerpC('below', su.uBelow.value);
    lerpC('sun', su.uSunColor.value);
    lerpC('glow', su.uSunGlow.value);
    lerpC('hemiSky', worldUniforms.uSkyColor.value);
    lerpC('hemiGround', worldUniforms.uGroundColor.value);
    lerpC('rim', worldUniforms.uRimColor.value);
    worldUniforms.uHemiIntensity.value = lerpN(a.hemiI, b.hemiI);
    this.night = lerpN(a.night, b.night);
    worldUniforms.uNight.value = this.night;
    su.uNight.value = this.night;
    lerpC('fog', this.fog.color);

    // Sun path: rises in the east, arcs high toward the south, sets in the west.
    const theta = (this.time - 0.25) * Math.PI * 2;
    const tilt = 0.55;
    const arcUp = new Vector3().copy(up).multiplyScalar(Math.cos(tilt)).addScaledVector(this.skyNorth, -Math.sin(tilt));
    this.sunDir.copy(this.skyEast).multiplyScalar(Math.cos(theta)).addScaledVector(arcUp, Math.sin(theta)).normalize();
    this.moonDir.copy(this.sunDir).negate().addScaledVector(this.skyNorth, 0.25).normalize();
    su.uSunDir.value.copy(this.sunDir);
    su.uMoonDir.value.copy(this.moonDir);
    su.uUp.value.copy(up);
    su.uStarRot.value = this.time * Math.PI * 2;
    su.uTime.value += dt;

    // The directional light is the sun by day and the moon by night; it fades to zero at the swap.
    const sunElev = this.sunDir.dot(up);
    const useSun = sunElev > -0.02;
    const lightDir = useSun ? this.sunDir : this.moonDir;
    const elev = lightDir.dot(up);
    const fade = Math.min(1, Math.max(0, (elev - 0.02) / 0.12));
    const intensity = lerpN(a.sunI, b.sunI) * fade;
    lerpC('sun', this.tmpC);
    this.sun.color.copy(this.tmpC);
    this.sun.intensity = intensity;
    // Keep the light above the horizon a little so shadows never stretch to infinity.
    const ld = new Vector3().copy(lightDir);
    if (ld.dot(up) < 0.28) ld.addScaledVector(up, 0.28 - ld.dot(up)).normalize();
    this.sun.position.copy(focus).addScaledVector(ld, 70);
    this.sun.target.position.copy(focus);
    this.sun.shadow.camera.up.copy(this.skyNorth);
    this.sun.target.updateMatrixWorld();

    this.sky.update(cameraPos);
    worldUniforms.uGlowColor.value.set(this.night > 0.5 ? '#ffd27f' : '#ffc870');
  }
}
