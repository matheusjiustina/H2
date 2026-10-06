import * as THREE from 'three';
import { SunLight } from 'three/addons/lights/SunLight.js';
import { U } from '../core/Shared.js';
import { clamp, lerp, smoothstep } from '../utils/MathUtils.js';

const _c = new THREE.Color();
const _g = new THREE.Color();
const _nightWhite = new THREE.Vector3(0.86, 0.95, 1.12);

/**
 * Combines time of day + weather into the global lighting state: sun/moon light with
 * cascaded shadows, sky/fog/cloud uniforms, image based lighting and colour grading.
 */
export class Atmosphere {
  constructor({ renderer, scene, sky, time, weather }) {
    this.renderer = renderer;
    this.scene = scene;
    this.sky = sky;
    this.time = time;
    this.weather = weather;

    this.sun = new SunLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 150;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 2.5;
    this.sun.layers.enableAll();
    scene.add(this.sun);

    // lightning fill light (flashes)
    this.flashLight = new THREE.DirectionalLight(0xc8d4ff, 0);
    this.flashLight.position.set(-0.3, 1, -0.2);
    this.flashLight.layers.enableAll();
    scene.add(this.flashLight);

    // image based lighting generated from the procedural sky
    this.pmrem = new THREE.PMREMGenerator(renderer.renderer);
    this.cubeRT = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType });
    this.cubeCam = new THREE.CubeCamera(0.1, 500, this.cubeRT);
    this.envRT = null;
    this._envTimer = 0;
    this._lastEnvKey = '';
    this.envInterval = 0.6;

    this.overcast = 0;
    this.dayLight = 1;
  }

  setShadowQuality(q) {
    const s = this.sun.shadow;
    const cfg = {
      off: null,
      low: { size: 1024, far: 70, radius: 1.5 },
      medium: { size: 1536, far: 110, radius: 2 },
      high: { size: 2048, far: 160, radius: 2.5 },
      ultra: { size: 4096, far: 200, radius: 3 },
    }[q];
    this.sun.castShadow = !!cfg;
    if (!cfg) return;
    s.mapSize.set(cfg.size, cfg.size);
    s.camera.far = cfg.far;
    s.radius = cfg.radius;
    if (s.map) { s.map.dispose(); s.map = null; }
  }

  update(dt, camera) {
    const t = this.time, w = this.weather.p;
    const o = w.overcast;
    this.overcast = o;
    const day = smoothstep(-0.08, 0.25, t.sunDir.y);
    this.dayLight = day;

    // --- sky palette with overcast blending
    const dayBright = 0.15 + 0.85 * day;
    const storm = clamp((w.rain - 0.5) * 2, 0, 1);
    const greyZ = _g.setRGB(0.30, 0.33, 0.37).multiplyScalar(dayBright * (1 - 0.45 * storm));
    U.uSkyZenith.value.copy(t.zenith).lerp(greyZ, o * 0.85);
    const greyH = _c.setRGB(0.46, 0.49, 0.53).multiplyScalar(dayBright * (1 - 0.5 * storm));
    U.uSkyHorizon.value.copy(t.horizon).lerp(greyH, o * 0.8);
    U.uSunGlow.value.copy(t.glow).multiplyScalar(lerp(1, 0.25, o));
    U.uSunsetColor.value.copy(t.sunset).multiplyScalar(lerp(1, 0.2, o));
    U.uSunDisk.value.copy(t.sunDir);
    U.uMoonDir.value.copy(t.moonDir);
    U.uNight.value = t.night;
    // ground bounce: sunlit sand and foliage reflect a lot of warm light back up
    const bounce = Math.max(t.sunDir.y, 0) * t.sunIntensity * w.sunDim * t.lightFade * 0.12;
    U.uSkyGround.value.setRGB(0.95 * bounce + 0.012, 0.85 * bounce + 0.014, 0.66 * bounce + 0.016)
      .add(_c.copy(U.uSkyHorizon.value).multiplyScalar(0.18));

    // fog / atmospheric perspective
    const fogColor = U.uFogColor.value.copy(U.uSkyHorizon.value).lerp(U.uSkyZenith.value, 0.12);
    fogColor.multiplyScalar(0.95);
    U.uFogSunColor.value.copy(fogColor).lerp(_c.copy(t.glow).multiplyScalar(1.1), 0.55 * (1 - o));
    U.uFogDensity.value = 0.00028 * t.fogMul * w.fog;
    U.uFogHeightFalloff.value = lerp(0.012, 0.006, o);

    // clouds
    U.uCloudCover.value = w.cloud;
    const sunI = t.sunIntensity * w.sunDim * t.lightFade;
    const lit = _c.copy(t.sunColor).multiplyScalar(t.lightIsSun ? 0.55 * t.sunIntensity * lerp(1, 0.35, o) : 0.08).add(_g.copy(U.uSkyHorizon.value).multiplyScalar(0.55));
    U.uCloudLit.value.copy(lit);
    U.uCloudDark.value.copy(U.uSkyHorizon.value).multiplyScalar(0.55 - 0.25 * storm).add(_g.copy(U.uSkyZenith.value).multiplyScalar(0.35));
    U.uCloudShadow.value = lerp(0.55, 0.25, o) * day;
    const windSpeed = 0.006 + w.wind * 0.02;
    const ang = this.weather.windAngle;
    U.uCloudOffset.value.x += Math.cos(ang) * windSpeed * dt;
    U.uCloudOffset.value.y += Math.sin(ang) * windSpeed * dt;

    // wind / rain
    U.uWind.value.set(Math.cos(ang), Math.sin(ang), w.wind, w.gust);
    U.uRain.value = this.weather.rain || 0;
    U.uWetness.value = this.weather.wetness;
    U.uLightning.value = this.weather.lightning;

    // --- direct light
    U.uSunDir.value.copy(t.lightDir);
    U.uSunColor.value.copy(t.sunColor).multiplyScalar(sunI);
    this.sun.position.copy(t.lightDir).multiplyScalar(100);
    this.sun.color.copy(t.sunColor);
    this.sun.intensity = sunI;
    this.flashLight.intensity = this.weather.lightning * 2.5;

    // ambient estimate for custom shaders
    U.uAmbient.value.copy(U.uSkyHorizon.value).lerp(U.uSkyZenith.value, 0.5).multiplyScalar(t.envIntensity * 1.1);

    // --- image based lighting
    this.scene.environmentIntensity = t.envIntensity * lerp(1, 0.85, o) * 0.85;
    this._envTimer -= dt;
    const key = `${t.hour.toFixed(2)}|${w.cloud.toFixed(2)}|${o.toFixed(2)}`;
    if (this._envTimer <= 0 && key !== this._lastEnvKey) {
      this._envTimer = this.envInterval;
      this._lastEnvKey = key;
      this.updateEnvironment();
    }

    // --- colour grading
    const g = this.renderer.grade;
    g.exposure = t.exposure * lerp(1, 1.3, o) * (U.uUnderwater.value > 0.5 ? 1.25 : 1);
    const night = t.night;
    const golden = clamp(t.sunset.r * 1.2, 0, 1) * (1 - o);
    g.white.set(1 + golden * 0.04, 1, 1 - golden * 0.06);
    if (night > 0) g.white.lerp(_nightWhite, night);
    g.shadowTint.set(-0.014, 0.004, 0.012).multiplyScalar(1 - o * 0.5);
    g.highlightTint.set(0.012 + golden * 0.01, 0.004, -0.012).multiplyScalar(1 - o * 0.6);
    g.saturation = lerp(1.14, 0.92, o) * lerp(1, 0.8, night);
    g.contrast = lerp(1.1, 1.02, o);
    g.flash = this.weather.lightning * 0.9;
  }

  updateEnvironment() {
    const r = this.renderer.renderer;
    const prevTarget = r.getRenderTarget();
    this.cubeCam.update(r, this.sky.envScene);
    this.envRT = this.pmrem.fromCubemap(this.cubeRT.texture, this.envRT);
    this.scene.environment = this.envRT.texture;
    r.setRenderTarget(prevTarget);
  }
}
