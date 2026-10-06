import * as THREE from 'three';
import { clamp, smoothstep, lerp } from '../utils/MathUtils.js';

// Colour keyframes over the day (linear RGB). Hours wrap around 24.
const KEYS = [
  { h: 0.0, name: 'night', zen: [0.0018, 0.0035, 0.011], hor: [0.008, 0.012, 0.026], sun: [0.55, 0.65, 0.95], sunI: 0.22, glow: [0.05, 0.06, 0.09], set: [0, 0, 0], env: 0.55, exp: 2.6, fogD: 1.0 },
  { h: 4.6, name: 'pre-dawn', zen: [0.004, 0.007, 0.02], hor: [0.03, 0.03, 0.055], sun: [0.55, 0.65, 0.95], sunI: 0.14, glow: [0.08, 0.07, 0.1], set: [0.02, 0.01, 0.02], env: 0.55, exp: 2.4, fogD: 1.5 },
  { h: 5.6, name: 'dawn', zen: [0.03, 0.05, 0.13], hor: [0.42, 0.25, 0.2], sun: [1.0, 0.5, 0.25], sunI: 0.35, glow: [1.0, 0.45, 0.2], set: [0.55, 0.2, 0.06], env: 0.65, exp: 1.7, fogD: 2.2 },
  { h: 6.5, name: 'early morning', zen: [0.09, 0.19, 0.45], hor: [0.75, 0.62, 0.55], sun: [1.0, 0.72, 0.48], sunI: 1.9, glow: [1.0, 0.7, 0.45], set: [0.3, 0.12, 0.04], env: 0.8, exp: 1.25, fogD: 1.7 },
  { h: 8.5, name: 'morning', zen: [0.085, 0.25, 0.66], hor: [0.58, 0.74, 0.92], sun: [1.0, 0.9, 0.78], sunI: 3.1, glow: [1.0, 0.88, 0.72], set: [0.02, 0.01, 0.0], env: 0.95, exp: 1.0, fogD: 1.1 },
  { h: 12.0, name: 'tropical noon', zen: [0.06, 0.24, 0.7], hor: [0.55, 0.76, 0.96], sun: [1.0, 0.97, 0.92], sunI: 3.7, glow: [1.0, 0.95, 0.85], set: [0, 0, 0], env: 1.0, exp: 0.92, fogD: 1.0 },
  { h: 15.5, name: 'afternoon', zen: [0.075, 0.25, 0.66], hor: [0.6, 0.74, 0.9], sun: [1.0, 0.93, 0.82], sunI: 3.3, glow: [1.0, 0.9, 0.75], set: [0.02, 0.01, 0.0], env: 0.97, exp: 0.97, fogD: 1.05 },
  { h: 17.3, name: 'golden hour', zen: [0.1, 0.2, 0.46], hor: [0.95, 0.72, 0.52], sun: [1.0, 0.7, 0.42], sunI: 2.5, glow: [1.0, 0.68, 0.4], set: [0.45, 0.2, 0.06], env: 0.85, exp: 1.1, fogD: 1.25 },
  { h: 18.2, name: 'sunset', zen: [0.07, 0.1, 0.26], hor: [1.0, 0.48, 0.22], sun: [1.0, 0.45, 0.18], sunI: 1.2, glow: [1.0, 0.42, 0.16], set: [0.95, 0.32, 0.08], env: 0.7, exp: 1.3, fogD: 1.4 },
  { h: 18.9, name: 'dusk', zen: [0.02, 0.03, 0.09], hor: [0.25, 0.13, 0.15], sun: [0.8, 0.4, 0.3], sunI: 0.12, glow: [0.6, 0.25, 0.15], set: [0.35, 0.1, 0.06], env: 0.6, exp: 1.9, fogD: 1.5 },
  { h: 20.0, name: 'night', zen: [0.0018, 0.0035, 0.011], hor: [0.008, 0.012, 0.026], sun: [0.55, 0.65, 0.95], sunI: 0.22, glow: [0.05, 0.06, 0.09], set: [0, 0, 0], env: 0.55, exp: 2.6, fogD: 1.0 },
  { h: 24.0, name: 'night', zen: [0.0018, 0.0035, 0.011], hor: [0.008, 0.012, 0.026], sun: [0.55, 0.65, 0.95], sunI: 0.22, glow: [0.05, 0.06, 0.09], set: [0, 0, 0], env: 0.55, exp: 2.6, fogD: 1.0 },
];

const lerp3 = (a, b, t, out) => out.setRGB(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));

export const STATE_HOURS = {
  'pre-dawn': 4.9, 'early morning': 6.6, morning: 8.6, noon: 12.0, afternoon: 15.2, 'golden hour': 17.2, sunset: 18.2, night: 22.0,
};

/**
 * Dynamic day/night cycle. Produces sun/moon directions and a palette that the
 * Atmosphere controller combines with weather.
 */
export class TimeOfDay {
  constructor(hour = 9.6) {
    this.hour = hour;
    this.speed = 1 / 75; // game hours per real second (1 hour = 75 s)
    this.paused = false;
    this.day = 1;
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3();
    this.zenith = new THREE.Color();
    this.horizon = new THREE.Color();
    this.sunColor = new THREE.Color();
    this.glow = new THREE.Color();
    this.sunset = new THREE.Color();
    this.sunIntensity = 1;
    this.envIntensity = 1;
    this.exposure = 1;
    this.fogMul = 1;
    this.night = 0;
    this.name = 'morning';
    this.update(0);
  }

  setHour(h) { this.hour = ((h % 24) + 24) % 24; this.update(0); }

  update(dt) {
    if (!this.paused) {
      this.hour += dt * this.speed;
      if (this.hour >= 24) { this.hour -= 24; this.day++; }
    }
    const h = this.hour;
    // Sun path: rises in the east (+X) at 6:00, culminates high towards +Z, sets in the west.
    const theta = ((h - 6) / 12) * Math.PI;
    const tilt = THREE.MathUtils.degToRad(24);
    this.sunDir.set(Math.cos(theta), Math.sin(theta) * Math.cos(tilt), Math.sin(theta) * Math.sin(tilt) + 0.08).normalize();
    const mt = theta + Math.PI * 1.04;
    this.moonDir.set(Math.cos(mt) * 0.9, Math.sin(mt) * Math.cos(tilt * 0.7), Math.sin(mt) * Math.sin(tilt * 0.7) - 0.25).normalize();

    // palette
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    let t = clamp((h - a.h) / (b.h - a.h), 0, 1);
    t = t * t * (3 - 2 * t);
    lerp3(a.zen, b.zen, t, this.zenith);
    lerp3(a.hor, b.hor, t, this.horizon);
    lerp3(a.sun, b.sun, t, this.sunColor);
    lerp3(a.glow, b.glow, t, this.glow);
    lerp3(a.set, b.set, t, this.sunset);
    this.sunIntensity = lerp(a.sunI, b.sunI, t);
    this.envIntensity = lerp(a.env, b.env, t);
    this.exposure = lerp(a.exp, b.exp, t);
    this.fogMul = lerp(a.fogD, b.fogD, t);
    this.name = t < 0.5 ? a.name : b.name;

    // Which body lights the world: sun when above the horizon, else the moon.
    const sunUp = smoothstep(-0.04, 0.06, this.sunDir.y);
    this.night = 1 - smoothstep(-0.12, 0.08, this.sunDir.y);
    if (this.sunDir.y > -0.02) {
      this.lightDir.copy(this.sunDir);
      if (this.lightDir.y < 0.035) this.lightDir.y = 0.035;
      this.lightDir.normalize();
      this.lightIsSun = true;
      this.lightFade = sunUp;
    } else {
      this.lightDir.copy(this.moonDir);
      if (this.lightDir.y < 0.1) this.lightDir.y = 0.1;
      this.lightDir.normalize();
      this.lightIsSun = false;
      this.lightFade = smoothstep(-0.02, -0.12, this.sunDir.y) * smoothstep(-0.05, 0.2, this.moonDir.y);
    }
  }

  get clock() {
    const hh = Math.floor(this.hour);
    const mm = Math.floor((this.hour - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
}
