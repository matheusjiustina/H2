import * as THREE from 'three';
import type { Settings } from '../core/save';
import { clamp, damp, lerp } from '../core/util';
import { RNG } from '../core/rng';
import { M } from './materials';
import type { QualityPreset } from './renderer';

interface Key {
  t: number;
  zen: number;
  hor: number;
  sun: number;
  sunI: number;
  hs: number;
  hg: number;
  hi: number;
  fog: number;
  cloud: number;
  night: number;
}

const NIGHT: Omit<Key, 't'> = { zen: 0x0d1230, hor: 0x252d5c, sun: 0x8ea2ff, sunI: 1.0, hs: 0x4450a0, hg: 0x1f2440, hi: 1.5, fog: 0x1c2250, cloud: 0x4a548e, night: 1 };
const DAY: Omit<Key, 't'> = { zen: 0x4fb9d6, hor: 0xa9e3e0, sun: 0xfff1d0, sunI: 2.7, hs: 0xbcc8ff, hg: 0xeadcb8, hi: 2.5, fog: 0xbfe6e2, cloud: 0xffffff, night: 0 };
const KEYS: Key[] = [
  { t: 0, ...NIGHT },
  { t: 5, ...NIGHT },
  { t: 6.4, zen: 0x5a6fae, hor: 0xffb48a, sun: 0xffa772, sunI: 2.0, hs: 0x9a94d0, hg: 0xd8a888, hi: 1.6, fog: 0xf0bfa0, cloud: 0xffd0b8, night: 0.3 },
  { t: 8.2, ...DAY },
  { t: 15.5, ...DAY },
  { t: 17.4, zen: 0x5fb1d2, hor: 0xf6dba8, sun: 0xffd08a, sunI: 2.7, hs: 0xb4b0f0, hg: 0xe8cfa0, hi: 2.3, fog: 0xead9b6, cloud: 0xfff0d8, night: 0 },
  { t: 19.2, zen: 0x47508f, hor: 0xff9860, sun: 0xff8a50, sunI: 2.1, hs: 0x8a80c4, hg: 0xd89870, hi: 1.55, fog: 0xe8a580, cloud: 0xffb492, night: 0.4 },
  { t: 20.6, ...NIGHT },
  { t: 24, ...NIGHT },
];

const FIXED: Record<string, number> = { day: 12, afternoon: 16.9, sunset: 19.0, night: 23 };

function cloudTexture(): THREE.CanvasTexture {
  const W = 2048, H = 512;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const rng = new RNG(1776);
  const tmp = document.createElement('canvas');
  tmp.width = 640;
  tmp.height = 260;
  const tg = tmp.getContext('2d')!;
  const paint = (cx: number, cy: number, scale: number) => {
    const n = rng.int(4, 8);
    const blobs: number[][] = [];
    let x = 120;
    for (let i = 0; i < n; i++) {
      const r = rng.range(22, 46) * (i === 0 || i === n - 1 ? 0.7 : 1);
      blobs.push([x, 150 - r * rng.range(0.2, 0.6), r]);
      x += r * rng.range(0.9, 1.4);
    }
    const width = x + 120;
    tg.clearRect(0, 0, 640, 260);
    tg.save();
    tg.scale(Math.min(1, 620 / width), 1);
    // lavender body, flat base
    tg.globalCompositeOperation = 'source-over';
    tg.fillStyle = '#bdb8e2';
    for (const b of blobs) {
      tg.beginPath();
      tg.ellipse(b[0], b[1], b[2], b[2] * 0.72, 0, 0, Math.PI * 2);
      tg.fill();
    }
    tg.fillRect(blobs[0][0], 138, blobs[n - 1][0] - blobs[0][0], 22);
    // cream highlight clipped inside the body
    tg.globalCompositeOperation = 'source-atop';
    tg.fillStyle = '#fdf6e3';
    for (const b of blobs) {
      tg.beginPath();
      tg.ellipse(b[0] - 3, b[1] - b[2] * 0.3, b[2] * 0.97, b[2] * 0.66, 0, 0, Math.PI * 2);
      tg.fill();
    }
    tg.restore();
    const w = 640 * scale, h = 260 * scale * 0.8;
    for (const ox of [-W, 0, W]) {
      // ink outline: stamp a darkened copy around, then the cloud itself
      g.globalAlpha = 0.85;
      g.filter = 'brightness(0.18)';
      for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) g.drawImage(tmp, cx + ox - w / 2 + dx, cy - h / 2 + dy, w, h);
      g.filter = 'none';
      g.globalAlpha = 1;
      g.drawImage(tmp, cx + ox - w / 2, cy - h / 2, w, h);
    }
  };
  // rows from high (top of texture) to near the horizon (bottom): smaller toward the horizon
  for (let i = 0; i < 34; i++) {
    const v = rng.range(0.08, 0.92);
    const y = H - v * H;
    paint(rng.range(0, W), y, lerp(0.32, 0.95, v) * rng.range(0.7, 1.2));
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
}
`;
const SKY_FS = /* glsl */ `
uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uCloudTint; uniform vec3 uSunCol;
uniform vec3 uSunDir; uniform sampler2D tCloud; uniform float uDrift; uniform float uNight; uniform float uCloudAmt;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHor, uZen, pow(h, 0.55));
  col = mix(col, uHor * 0.92, smoothstep(0.0, -0.25, d.y));
  // stars
  float st = step(0.9972, hash(floor(d * 150.0))) * uNight * smoothstep(0.02, 0.3, d.y);
  col += vec3(st);
  // sun / moon disc with ink ring
  float sd = dot(d, uSunDir);
  float disc = smoothstep(0.9982, 0.9987, sd);
  float ring = smoothstep(0.9975, 0.9979, sd) - disc;
  col = mix(col, vec3(0.11, 0.1, 0.18), ring * 0.6);
  col = mix(col, uSunCol, disc);
  // illustrated clouds (equirect band 0..60 degrees)
  float elev = asin(clamp(d.y, -1.0, 1.0));
  float v = elev / 1.0472;
  if (v > 0.0 && v < 1.0) {
    float u = atan(d.z, d.x) / 6.28318 + uDrift;
    vec4 c = texture2D(tCloud, vec2(u, v));
    col = mix(col, c.rgb * uCloudTint, c.a * uCloudAmt * smoothstep(0.0, 0.06, v));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

const RAIN_VS = /* glsl */ `
attribute float aTop;
uniform float uTime; uniform vec3 uCam;
void main() {
  vec3 p = position;
  p.y = mod(p.y - uTime * 26.0, 40.0);
  p.xz = mod(p.xz - uCam.xz, 60.0) - 30.0;
  p.y += aTop * 0.9 - 14.0;
  p.x += aTop * 0.12;
  p += vec3(uCam.x, uCam.y, uCam.z);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;
const RAIN_FS = /* glsl */ `
uniform float uAlpha;
void main() { gl_FragColor = vec4(0.82, 0.88, 1.0, uAlpha); }
`;

const cA = new THREE.Color();
const cB = new THREE.Color();
function mixHex(out: THREE.Color, a: number, b: number, t: number) {
  cA.setHex(a);
  cB.setHex(b);
  return out.copy(cA).lerp(cB, t);
}

export class Atmosphere {
  /** Hours 0..24. */
  time = 10;
  night = 0;
  wet = 0;
  raining = false;
  sun = new THREE.DirectionalLight(0xffffff, 3);
  hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1.8);
  fog = new THREE.Fog(0xbfe6e2, 200, 600);
  /** Mission overrides. */
  timeOverride: number | null = null;
  weatherOverride: 'clear' | 'rain' | null = null;
  sunDir = new THREE.Vector3(0.5, 0.8, 0.3);
  private dome: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private rain: THREE.LineSegments;
  private rainMat: THREE.ShaderMaterial;
  private drift = 0;
  private clock = 0;
  private weatherTimer = 90;
  private rng = new RNG(99);
  private shadowSize = -1;
  private roadTint = new THREE.Color(1, 1, 1);
  private glowColor = new THREE.Color();

  constructor(private scene: THREE.Scene) {
    scene.fog = this.fog;
    scene.add(this.hemi);
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.06;

    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VS,
      fragmentShader: SKY_FS,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZen: { value: new THREE.Color() },
        uHor: { value: new THREE.Color() },
        uCloudTint: { value: new THREE.Color() },
        uSunCol: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3() },
        tCloud: { value: cloudTexture() },
        uDrift: { value: 0 },
        uNight: { value: 0 },
        uCloudAmt: { value: 1 },
      },
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.skyMat);
    this.dome.scale.setScalar(1200);
    this.dome.renderOrder = -100;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // Rain streaks: GPU-wrapped box of line segments around the camera.
    const N = 1400;
    const pos = new Float32Array(N * 6);
    const top = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = this.rng.range(0, 60), y = this.rng.range(0, 40), z = this.rng.range(0, 60);
      pos.set([x, y, z, x, y, z], i * 6);
      top[i * 2] = 0;
      top[i * 2 + 1] = 1;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rg.setAttribute('aTop', new THREE.BufferAttribute(top, 1));
    this.rainMat = new THREE.ShaderMaterial({
      vertexShader: RAIN_VS,
      fragmentShader: RAIN_FS,
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uAlpha: { value: 0 } },
    });
    this.rain = new THREE.LineSegments(rg, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.rain.renderOrder = 50;
    scene.add(this.rain);
  }

  private sample(t: number): Key {
    let i = 0;
    while (i < KEYS.length - 2 && t >= KEYS[i + 1].t) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const k = clamp((t - a.t) / (b.t - a.t), 0, 1);
    const out = { ...a };
    out.sunI = lerp(a.sunI, b.sunI, k);
    out.hi = lerp(a.hi, b.hi, k);
    out.night = lerp(a.night, b.night, k);
    (out as unknown as { k: number; b: Key }).k = k;
    (out as unknown as { k: number; b: Key }).b = b;
    return out;
  }

  update(dt: number, camera: THREE.Camera, focus: THREE.Vector3, settings: Settings, preset: QualityPreset) {
    this.clock += dt;
    // --- time of day
    if (this.timeOverride !== null) this.time = this.timeOverride;
    else if (settings.time === 'cycle') this.time = (this.time + (dt * 24) / 900) % 24;
    else this.time = FIXED[settings.time] ?? 12;

    // --- weather
    let wantRain = false;
    if (this.weatherOverride) wantRain = this.weatherOverride === 'rain';
    else if (settings.weather === 'rain') wantRain = true;
    else if (settings.weather === 'auto') {
      this.weatherTimer -= dt;
      if (this.weatherTimer <= 0) {
        this.raining = !this.raining;
        this.weatherTimer = this.raining ? this.rng.range(50, 100) : this.rng.range(200, 420);
      }
      wantRain = this.raining;
    }
    this.wet = damp(this.wet, wantRain ? 1 : 0, 0.5, dt);
    const wet = this.wet;

    const key = this.sample(this.time);
    const kb = key as unknown as { k: number; b: Key };
    const k = kb.k, b = kb.b;
    this.night = key.night;

    const u = this.skyMat.uniforms;
    mixHex(u.uZen.value, key.zen, b.zen, k).lerp(cA.setHex(this.night > 0.5 ? 0x141a36 : 0x8792a8), wet * 0.75);
    mixHex(u.uHor.value, key.hor, b.hor, k).lerp(cA.setHex(this.night > 0.5 ? 0x232a4a : 0xb3bcc8), wet * 0.75);
    mixHex(u.uCloudTint.value, key.cloud, b.cloud, k).multiplyScalar(1 - wet * 0.35);
    mixHex(this.sun.color, key.sun, b.sun, k);
    u.uSunCol.value.copy(this.sun.color).lerp(cA.setHex(0xffffff), 0.5);
    mixHex(this.hemi.color, key.hs, b.hs, k);
    mixHex(this.hemi.groundColor, key.hg, b.hg, k);
    mixHex(this.fog.color, key.fog, b.fog, k).lerp(cA.setHex(this.night > 0.5 ? 0x1a2040 : 0x9aa5b8), wet * 0.7);
    this.sun.intensity = key.sunI * (1 - wet * 0.45);
    this.hemi.intensity = key.hi * (1 - wet * 0.12);

    // --- sun / moon direction
    const moon = this.night > 0.62;
    if (moon) this.sunDir.set(-0.45, 0.78, 0.42).normalize();
    else {
      const ph = clamp((this.time - 5.6) / 14.4, 0.02, 0.98);
      const elev = Math.max(0.2, Math.sin(Math.PI * ph)) * 1.08;
      const az = lerp(-0.6, Math.PI + 0.6, ph);
      this.sunDir.set(Math.cos(az) * Math.cos(elev), Math.sin(elev), -0.55 * Math.cos(elev) - 0.25).normalize();
    }
    u.uSunDir.value.copy(this.sunDir);
    u.uNight.value = this.night * (1 - wet);
    u.uCloudAmt.value = 1;
    this.drift += dt * 0.0012 * (1 + wet * 3);
    u.uDrift.value = this.drift;

    // --- shadow frustum follows the focus point, snapped to texels to avoid crawl
    const S = preset.shadow > 0 ? (preset.shadow >= 3000 ? 110 : 85) : 0;
    if (preset.shadow !== this.shadowSize) {
      this.shadowSize = preset.shadow;
      this.sun.castShadow = preset.shadow > 0;
      if (preset.shadow > 0) {
        this.sun.shadow.mapSize.set(preset.shadow, preset.shadow);
        this.sun.shadow.map?.dispose();
        (this.sun.shadow as unknown as { map: unknown }).map = null;
        const c = this.sun.shadow.camera;
        c.left = -S; c.right = S; c.top = S; c.bottom = -S; c.near = 10; c.far = 520;
        c.updateProjectionMatrix();
      }
    }
    const snap = S > 0 ? (2 * S) / preset.shadow * 8 : 1;
    const fx = Math.round(focus.x / snap) * snap;
    const fz = Math.round(focus.z / snap) * snap;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + this.sunDir.x * 260, this.sunDir.y * 260, fz + this.sunDir.z * 260);
    this.sun.target.updateMatrixWorld();

    // --- fog distance
    const far = preset.drawDist * (1 - wet * 0.4) * (1 - this.night * 0.12);
    this.fog.near = far * 0.3;
    this.fog.far = far;

    // --- wet roads, glowing windows
    this.roadTint.setRGB(1 - wet * 0.3, 1 - wet * 0.27, 1 - wet * 0.16);
    M.road.color.copy(this.roadTint);
    const glow = clamp((this.night - 0.25) * 1.6, 0, 1);
    this.glowColor.setRGB(1.0 * glow, 0.78 * glow, 0.36 * glow);
    M.glow.emissive.copy(this.glowColor);

    // --- rain
    this.rain.visible = wet > 0.03;
    this.rainMat.uniforms.uTime.value = this.clock;
    this.rainMat.uniforms.uAlpha.value = wet * 0.4;
    camera.getWorldPosition(this.rainMat.uniforms.uCam.value as THREE.Vector3);
    this.dome.position.copy(this.rainMat.uniforms.uCam.value as THREE.Vector3);
  }

  /** Average sun radiance factor used by the halftone shader. */
  sunK(): number {
    return (this.sun.intensity * (this.sun.color.r + this.sun.color.g + this.sun.color.b)) / 3 / Math.PI;
  }
}
