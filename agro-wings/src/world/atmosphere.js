// Atmosphere: time of day, weather presets, height mist, rain, wet ground and
// the shared *visual* wind used by grass, trees, crops and audio.
//
// Visual/audio only. The flight model's wind (flight/env.js windAt) stays the
// single source of the wind direction and strength; this module mirrors its
// mean value for vegetation and never feeds anything back into the physics.
//
// Cost: no extra programs for the world materials (the stock fog chunks are
// extended once, before any shader is compiled), one sky-dome draw for the
// cloud deck / horizon haze, one instanced draw for rain (only while raining),
// and a PMREM re-bake of the sky lighting only when a transition settles.
import * as THREE from 'three';
import { damp, lerp, clamp } from '../core/math.js';

// ---------------------------------------------------------------- shared state
// Uniform objects are shared by reference: materials plug them in from their
// onBeforeCompile, so one write per frame reaches every shader.
export const ATMO_U = {
  time: { value: 0 },
  // x, y: unit direction the air moves TO (world x, z); z: speed m/s; w: gustiness.
  wind: { value: new THREE.Vector4(0, 1, 3, 0.5) },
  wet: { value: 0 },
};
// Height mist [density 1/m at the base, scale height m, base y m, unused].
// A Float32Array is passed by reference by UniformsUtils.cloneUniforms, so
// every fogged material shares this one array.
const MIST = new Float32Array([0, 20, 0, 0]);

(function patchFog() {
  const C = THREE.ShaderChunk;
  if (C.fog_vertex.includes('vFogWorldY')) return;
  C.fog_pars_vertex = C.fog_pars_vertex.replace('varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying float vFogWorldY;');
  // World height of the vertex from the view-space position (rigid view matrix).
  C.fog_vertex = C.fog_vertex.replace('vFogDepth = - mvPosition.z;',
    'vFogDepth = - mvPosition.z;\n\tvFogWorldY = dot( viewMatrix[ 1 ].xyz, mvPosition.xyz - viewMatrix[ 3 ].xyz );');
  C.fog_pars_fragment = C.fog_pars_fragment.replace('varying float vFogDepth;',
    'varying float vFogDepth;\n\tvarying float vFogWorldY;\n\tuniform vec4 fogMist;');
  // Exponential height mist integrated along the view ray, added on top of the
  // distance haze: thick in the low ground, thin from above.
  C.fog_fragment = C.fog_fragment.replace('gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );', `
	if ( fogMist.x > 0.0 ) {
		float mh0 = max( cameraPosition.y - fogMist.z, 0.0 ) / fogMist.y;
		float mh1 = max( vFogWorldY - fogMist.z, 0.0 ) / fogMist.y;
		float mdh = mh1 - mh0;
		float mavg = abs( mdh ) > 1e-3 ? ( exp( - mh0 ) - exp( - mh1 ) ) / mdh : exp( - mh0 );
		fogFactor = 1.0 - ( 1.0 - fogFactor ) * exp( - fogMist.x * vFogDepth * mavg );
	}
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );`);
  if (!C.fog_fragment.includes('fogMist')) console.warn('atmosphere: fog chunk patch failed (three.js changed?)');
  THREE.UniformsLib.fog.fogMist = { value: MIST };
  for (const k of Object.keys(THREE.ShaderLib)) {
    const u = THREE.ShaderLib[k].uniforms;
    if (u && u.fogColor && !u.fogMist) u.fogMist = { value: MIST };
  }
})();

// ---------------------------------------------------------------- presets
const c3 = (r, g, b) => [r, g, b];

// Base light per time of day. 'morning' reproduces the original look exactly.
export const TIMES = {
  dawn: {
    label: 'Dawn', el: 6, az: 78, sun: c3(1.0, 0.64, 0.4), sunI: 1.6, shadow: 0.8,
    hemiSky: c3(0.5, 0.56, 0.78), hemiGnd: c3(0.14, 0.12, 0.08), hemiI: 0.38,
    fog: c3(0.62, 0.6, 0.66), fogD: 0.00013, expo: 1.12, env: 0.42,
    turb: 4.0, ray: 1.9, mie: 0.006, mieG: 0.85, light: 0.7,
    cTop: c3(1.0, 0.8, 0.68), cBase: c3(0.42, 0.42, 0.52),
  },
  morning: {
    label: 'Morning', el: 27, az: 74, sun: c3(1.0, 0.95, 0.86), sunI: 3.3,
    hemiSky: c3(0.62, 0.74, 0.95), hemiGnd: c3(0.2, 0.17, 0.09), hemiI: 0.3,
    fog: c3(0.55, 0.66, 0.8), fogD: 0.000105, expo: 0.95, env: 0.36,
    turb: 3.2, ray: 1.35, mie: 0.004, mieG: 0.82, light: 1,
    cTop: c3(1.0, 0.98, 0.95), cBase: c3(0.5, 0.55, 0.64),
  },
  noon: {
    label: 'Midday', el: 66, az: 12, sun: c3(1.0, 0.98, 0.94), sunI: 3.5,
    hemiSky: c3(0.62, 0.74, 0.95), hemiGnd: c3(0.22, 0.19, 0.1), hemiI: 0.32,
    fog: c3(0.58, 0.68, 0.82), fogD: 0.00011, expo: 0.9, env: 0.36,
    turb: 2.8, ray: 1.2, mie: 0.0035, mieG: 0.8, light: 1.05,
    cTop: c3(1.0, 1.0, 0.98), cBase: c3(0.52, 0.57, 0.66),
  },
  golden: {
    label: 'Golden hour', el: 9, az: 286, sun: c3(1.0, 0.7, 0.44), sunI: 2.4, shadow: 0.9,
    hemiSky: c3(0.56, 0.6, 0.78), hemiGnd: c3(0.2, 0.15, 0.08), hemiI: 0.32,
    fog: c3(0.72, 0.67, 0.64), fogD: 0.00012, expo: 1.02, env: 0.4,
    turb: 4.6, ray: 1.6, mie: 0.006, mieG: 0.86, light: 0.85,
    cTop: c3(1.0, 0.82, 0.62), cBase: c3(0.5, 0.48, 0.56),
  },
  dusk: {
    label: 'Dusk', el: 2.5, az: 290, sun: c3(1.0, 0.46, 0.25), sunI: 0.5, shadow: 0.55,
    hemiSky: c3(0.34, 0.38, 0.6), hemiGnd: c3(0.08, 0.065, 0.05), hemiI: 0.42,
    fog: c3(0.34, 0.34, 0.43), fogD: 0.00014, expo: 1.05, env: 0.44,
    turb: 5.0, ray: 2.2, mie: 0.008, mieG: 0.88, light: 0.45,
    cTop: c3(0.95, 0.58, 0.45), cBase: c3(0.3, 0.3, 0.4),
  },
};

// Weather modifies the time-of-day base. 'partly' is the original look.
export const WEATHER = {
  clear: {
    label: 'Clear', cloud: 0.22, deck: 0, haze: 0, fogMul: 0.8, grey: 0, greyCol: c3(0.6, 0.66, 0.74),
    sunMul: 1.05, hemiMul: 0.95, shadow: 1, envMul: 1, expo: 0, mist: 0, rain: 0, wet: 0, gust: 0.7, birds: 1, insects: 1,
  },
  partly: {
    label: 'Partly cloudy', cloud: 1, deck: 0, haze: 0, fogMul: 1, grey: 0, greyCol: c3(0.6, 0.66, 0.74),
    sunMul: 1, hemiMul: 1, shadow: 1, envMul: 1, expo: 0, mist: 0, rain: 0, wet: 0, gust: 1, birds: 1, insects: 1,
  },
  overcast: {
    label: 'Overcast', cloud: 0.3, deck: 0.96, haze: 0.35, fogMul: 2.4, grey: 0.8, greyCol: c3(0.62, 0.64, 0.67),
    sunMul: 0.2, hemiMul: 2.7, shadow: 0.2, envMul: 0.95, expo: 0.14, mist: 0, rain: 0, wet: 0, gust: 1.35, birds: 0.45, insects: 0.5,
  },
  rain: {
    label: 'Light rain', cloud: 0.25, deck: 1, haze: 0.62, fogMul: 4.4, grey: 0.9, greyCol: c3(0.5, 0.53, 0.56),
    sunMul: 0.11, hemiMul: 2.4, shadow: 0.08, envMul: 0.85, expo: 0.2, mist: 0.25, rain: 1, wet: 1, gust: 1.7, birds: 0.06, insects: 0.12,
  },
  mist: {
    label: 'Morning mist', cloud: 0.35, deck: 0.32, haze: 0.5, fogMul: 1.7, grey: 0.55, greyCol: c3(0.8, 0.81, 0.82),
    sunMul: 0.72, hemiMul: 1.45, shadow: 0.55, envMul: 1, expo: 0.05, mist: 1, rain: 0, wet: 0.4, gust: 0.25, birds: 1.2, insects: 0.7,
  },
};
export const TIME_ORDER = ['dawn', 'morning', 'noon', 'golden', 'dusk'];
export const WEATHER_ORDER = ['clear', 'partly', 'overcast', 'rain', 'mist'];

const MIST_DENSITY = 0.0032; // 1/m at the base of a full morning mist
const MIST_HEIGHT = 22; // m scale height

const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

// Flat parameter set (numbers and colour triples) the renderer state is built from.
function combine(T, W) {
  const L = T.light;
  const grey = scl(W.greyCol, 0.55 + 0.45 * L);
  const fog = mixc(T.fog, scl(grey, Math.max(0.6, lum(T.fog) / Math.max(0.2, lum(W.greyCol)))), W.grey);
  return {
    el: T.el, az: T.az,
    sun: T.sun, sunI: T.sunI * W.sunMul,
    hemiSky: mixc(T.hemiSky, grey, W.grey * 0.6), hemiGnd: T.hemiGnd, hemiI: T.hemiI * W.hemiMul,
    fog, fogD: T.fogD * W.fogMul,
    expo: T.expo + W.expo, env: T.env * W.envMul,
    turb: T.turb + W.grey * 3, ray: T.ray, mie: T.mie, mieG: T.mieG,
    cloud: W.cloud,
    cTop: mixc(T.cTop, scl(grey, 1.1), W.grey * 0.9), cBase: mixc(T.cBase, scl(grey, 0.55), W.grey * 0.95),
    deck: W.deck, deckCol: mixc(scl(W.greyCol, L * 1.05), scl(T.sun, L * 0.9), 0.12), deckDark: scl(W.greyCol, L * 0.62),
    haze: W.haze, shadow: W.shadow * (T.shadow ?? 1),
    mist: W.mist * MIST_DENSITY, rain: W.rain, wet: W.wet, gust: W.gust,
    birds: W.birds * (T.el > 4 ? 1 : 0.4), insects: W.insects * (T.light < 0.6 ? 1.3 : 1),
    light: T.light * (1 - 0.35 * W.grey), // overall daylight (lamps, headlights)
  };
}

function lerpParams(cur, tgt, k) {
  let diff = 0;
  for (const key of Object.keys(tgt)) {
    const t = tgt[key];
    if (Array.isArray(t)) {
      for (let i = 0; i < 3; i++) { const d = t[i] - cur[key][i]; cur[key][i] += d * k; diff = Math.max(diff, Math.abs(d)); }
    } else {
      // Azimuth wraps the short way round.
      let d = t - cur[key];
      if (key === 'az') d = ((d + 540) % 360) - 180;
      cur[key] += d * k;
      diff = Math.max(diff, Math.abs(d) / (key === 'el' || key === 'az' ? 30 : key === 'fogD' || key === 'mist' ? Math.max(1e-6, Math.abs(t)) : 1));
    }
  }
  return diff;
}
const cloneParams = (p) => JSON.parse(JSON.stringify(p));

// ---------------------------------------------------------------- cloud deck
// Overcast layer + horizon haze, drawn over the Preetham sky in the sky pass.
function createDeck() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uDeck: { value: 0 }, uHaze: { value: 0 }, uTime: ATMO_U.time,
      uDeckCol: { value: new THREE.Color() }, uDeckDark: { value: new THREE.Color() },
      uHazeCol: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uDeck, uHaze, uTime;
      uniform vec3 uDeckCol, uDeckDark, uHazeCol, uSunDir, uSunCol;
      varying vec3 vDir;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
      }
      void main() {
        vec3 d = normalize(vDir);
        float e = d.y;
        vec3 col = vec3(0.0);
        float a = 0.0;
        if (uDeck > 0.0) {
          // Cloud base as a plane ~1.6 km up: coordinates in km on that plane.
          vec2 p = d.xz / max(e, 0.035) * 1.6 + vec2(uTime * 0.0035, uTime * 0.0012);
          float n = vn(p * 0.45) * 0.4 + vn(p * 1.3) * 0.3 + vn(p * 3.1) * 0.2 + vn(p * 7.3) * 0.1;
          // Distant deck averages out (no streaks at the horizon).
          n = mix(0.5, n, smoothstep(0.02, 0.2, e));
          float th = clamp(uDeck * (0.62 + 0.75 * n), 0.0, 1.0);
          a = th * smoothstep(-0.03, 0.1, e);
          col = mix(uDeckCol, uDeckDark, clamp((n - 0.35) * 1.3 + (uDeck - 0.6) * 0.5, 0.0, 1.0));
          // Brighter toward the zenith and where the sun shines through thin parts.
          col *= 0.9 + 0.18 * smoothstep(0.0, 0.8, e);
          float sd = max(dot(d, uSunDir), 0.0);
          col += uSunCol * (pow(sd, 10.0) * 0.9 + pow(sd, 3.0) * 0.12) * (1.0 - th * 0.85);
        }
        float h = uHaze * (1.0 - smoothstep(-0.02, 0.24, e));
        col = mix(col, uHazeCol, h / max(1.0 - (1.0 - a) * (1.0 - h), 1e-3));
        a = 1.0 - (1.0 - a) * (1.0 - h);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthTest: false, depthWrite: false, side: THREE.BackSide,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
  mesh.scale.setScalar(15000);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.name = 'cloudDeck';
  mesh.visible = false;
  return mesh;
}

// ---------------------------------------------------------------- rain
// GPU rain: thin streak quads in a box that wraps around the camera. Drop
// positions come from a per-instance seed and the time, so nothing is
// simulated on the CPU. Fades out close to the eye (no drops inside the cabin).
function createRain(max) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const seed = new Float32Array(max * 4);
  let s = 12345;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < max * 4; i++) seed[i] = rnd();
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: ATMO_U.time, uWind: ATMO_U.wind, uBox: { value: 46 }, uNear: { value: 2.5 }, uCamVel: { value: new THREE.Vector3() },
      uCol: { value: new THREE.Color(0.7, 0.72, 0.75) }, uAlpha: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime, uBox, uNear;
      uniform vec4 uWind;
      uniform vec3 uCamVel;
      varying float vA; varying float vV;
      void main() {
        vec3 vel = vec3(uWind.x * uWind.z * 0.8, -7.5 - aSeed.w * 1.5, uWind.y * uWind.z * 0.8);
        vec3 base = aSeed.xyz * uBox + vel * uTime;
        vec3 rel = mod(base - cameraPosition, uBox) - 0.5 * uBox;
        vec3 wp = cameraPosition + rel;
        // Streak along the drop's motion relative to the eye (a fast aircraft
        // sees the rain come at it almost horizontally), length ~ exposure blur.
        vec3 rv = vel - uCamVel;
        float rs = length(rv);
        vec3 dir = rv / max(rs, 1e-3);
        vec3 toCam = normalize(cameraPosition - wp);
        vec3 side = normalize(cross(dir, toCam) + vec3(1e-4, 0.0, 1e-4));
        float dist = length(rel);
        float len = 0.3 + rs * 0.02 + aSeed.w * 0.2;
        float wdt = max(0.012, dist * 0.0026);
        wp += side * position.x * wdt - dir * position.y * len;
        vA = smoothstep(uNear, uNear + 2.0, dist) * (1.0 - smoothstep(uBox * 0.3, uBox * 0.5, dist));
        vV = position.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCol; uniform float uAlpha;
      varying float vA; varying float vV;
      void main() {
        float a = vA * uAlpha * sin(vV * 3.14159);
        if (a < 0.004) discard;
        gl_FragColor = vec4(uCol, a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 23;
  mesh.name = 'rain';
  mesh.visible = false;
  return { mesh, max, mat, geo };
}

// ---------------------------------------------------------------- controller
export class Atmosphere {
  constructor({ renderer, scene, sky, terrain, quality }) {
    this.renderer = renderer;
    this.scene = scene;
    this.sky = sky;
    this.terrain = terrain;
    this.timeId = 'morning';
    this.weatherId = 'partly';
    this.target = combine(TIMES.morning, WEATHER.partly);
    this.cur = cloneParams(this.target);
    this.wet = 0;
    this.mistBase = 0;
    this.deck = createDeck();
    sky.skyScene.add(this.deck);
    this.envDeck = new THREE.Mesh(this.deck.geometry, this.deck.material);
    this.envDeck.scale.setScalar(900);
    this.envDeck.frustumCulled = false;
    sky.envScene.add(this.envDeck);
    this.rain = createRain(4000);
    scene.add(this.rain.mesh);
    this.rainDensity = quality.rainDrops ?? 2500;
    this.bakePending = false;
    this.settleT = 0;
    this.cameraInside = false;
    this._sunDir = new THREE.Vector3();
    this._lastCam = null;
    this.apply();
  }

  setQuality(q) { this.rainDensity = q.rainDrops ?? 2500; }

  set(timeId, weatherId, instant = false) {
    if (TIMES[timeId]) this.timeId = timeId;
    if (WEATHER[weatherId]) this.weatherId = weatherId;
    this.target = combine(TIMES[this.timeId], WEATHER[this.weatherId]);
    if (instant) {
      this.cur = cloneParams(this.target);
      this.wet = this.target.wet;
      this.apply();
      this.sky.bakeEnv();
      this.bakePending = false;
    } else {
      this.bakePending = true;
      this.settleT = 0;
    }
  }

  // Levels for the ambience mix (0..1).
  audioLevels() {
    const c = this.cur;
    return { rain: c.rain, birds: clamp(c.birds, 0, 1.3), insects: clamp(c.insects, 0, 1.3), gust: c.gust };
  }

  update(dt, camera, windVec, time) {
    ATMO_U.time.value = time;
    // Gradual transitions (~5 s time constant); wet ground dries/soaks slowly.
    const diff = lerpParams(this.cur, this.target, 1 - Math.exp(-dt / 5));
    const wetRate = this.target.wet > this.wet ? 1 / 40 : 1 / 120;
    this.wet = damp(this.wet, this.target.wet, wetRate * 3, dt);
    if (this.bakePending && diff < 0.02) {
      this.settleT += dt;
      if (this.settleT > 0.3) { this.sky.bakeEnv(); this.bakePending = false; }
    }
    // Visual wind = the aircraft's mean wind (same function, same scale), with
    // the weather's gustiness for vegetation sway.
    const w = ATMO_U.wind.value;
    const spd = Math.hypot(windVec.x, windVec.z);
    const tx = spd > 0.05 ? windVec.x / spd : w.x, tz = spd > 0.05 ? windVec.z / spd : w.y;
    w.x = damp(w.x, tx, 2, dt); w.y = damp(w.y, tz, 2, dt);
    const n = Math.hypot(w.x, w.y) || 1; w.x /= n; w.y /= n;
    w.z = damp(w.z, spd * (0.6 + 0.4 * this.cur.gust), 1.5, dt);
    w.w = this.cur.gust;
    // Mist sits on the local low ground: its base follows the terrain under
    // the camera, slowly, so valleys hold it and rises poke out.
    const gh = this.terrain.heightAt(camera.position.x, camera.position.z);
    this.mistBase = damp(this.mistBase, gh - 2, 0.2, dt);
    // Eye velocity for the rain streaks (ignore camera cuts).
    const cv = this.rain.mat.uniforms.uCamVel.value;
    if (this._lastCam && dt > 0) {
      const vx = (camera.position.x - this._lastCam.x) / dt, vy = (camera.position.y - this._lastCam.y) / dt, vz = (camera.position.z - this._lastCam.z) / dt;
      if (vx * vx + vy * vy + vz * vz < 120 * 120) { cv.x = damp(cv.x, vx, 8, dt); cv.y = damp(cv.y, vy, 8, dt); cv.z = damp(cv.z, vz, 8, dt); }
    } else this._lastCam = new THREE.Vector3();
    this._lastCam.copy(camera.position);
    this.apply(camera);
  }

  apply(camera) {
    const c = this.cur, sky = this.sky, scene = this.scene;
    const el = THREE.MathUtils.degToRad(c.el), az = THREE.MathUtils.degToRad(c.az);
    this._sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    sky.setSun(this._sunDir);
    for (const u of [sky.sky.material.uniforms, sky.envSky.material.uniforms]) {
      u.turbidity.value = c.turb; u.rayleigh.value = c.ray; u.mieCoefficient.value = c.mie; u.mieDirectionalG.value = c.mieG;
    }
    sky.sun.color.setRGB(...c.sun);
    sky.sun.intensity = c.sunI;
    sky.sun.shadow.intensity = c.shadow;
    sky.hemi.color.setRGB(...c.hemiSky);
    sky.hemi.groundColor.setRGB(...c.hemiGnd);
    sky.hemi.intensity = c.hemiI;
    scene.fog.color.setRGB(...c.fog);
    scene.fog.density = c.fogD;
    scene.environmentIntensity = c.env;
    this.renderer.toneMappingExposure = c.expo;
    sky.clouds.setLook(c.cloud, c.cTop, c.cBase, c.fog);
    const du = this.deck.material.uniforms;
    du.uDeck.value = c.deck; du.uHaze.value = c.haze;
    du.uDeckCol.value.setRGB(...c.deckCol); du.uDeckDark.value.setRGB(...c.deckDark);
    du.uHazeCol.value.setRGB(...c.fog); du.uSunDir.value.copy(this._sunDir); du.uSunCol.value.setRGB(...scl(c.sun, 0.6 * Math.min(1, c.sunI / 3)));
    this.deck.visible = c.deck > 0.003 || c.haze > 0.003;
    this.envDeck.visible = this.deck.visible;
    if (camera) this.deck.position.copy(camera.position);
    MIST[0] = c.mist; MIST[1] = MIST_HEIGHT; MIST[2] = this.mistBase;
    ATMO_U.wet.value = this.wet;
    // Rain: drop count follows intensity and quality; colour follows the light.
    const r = this.rain;
    const n = Math.round(this.rainDensity * c.rain);
    r.geo.instanceCount = Math.min(r.max, n);
    r.mesh.visible = n > 20;
    r.mat.uniforms.uAlpha.value = 0.4 * Math.min(1, c.rain * 1.5);
    r.mat.uniforms.uCol.value.setRGB(...mixc(scl(c.fog, 1.2), [0.85, 0.87, 0.9], 0.3));
    r.mat.uniforms.uNear.value = this.cameraInside ? 3.2 : 1.5;
  }
}
