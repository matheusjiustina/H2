// Sky dome (Preetham), sun + shadows that follow the action, image-based
// lighting from the sky, distance haze, and cumulus clouds built from many
// soft billboards so they have depth when flown around.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { makeCloudTexture } from '../core/textures.js';
import { rng } from '../core/math.js';

// Morning sun: ~27° high, from east-northeast.
export const SUN = { elevation: 27, azimuth: 74 };

export function sunDirection() {
  const el = THREE.MathUtils.degToRad(SUN.elevation);
  const az = THREE.MathUtils.degToRad(SUN.azimuth);
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

export function createSky(renderer, scene, quality) {
  const sky = new Sky();
  sky.scale.setScalar(20000);
  const u = sky.material.uniforms;
  u.turbidity.value = 3.2;
  u.rayleigh.value = 1.35;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.82;
  const sunDir = sunDirection();
  u.sunPosition.value.copy(sunDir);
  sky.material.depthTest = false;
  sky.material.depthWrite = false;
  sky.frustumCulled = false;
  // Rendered in its own pass before the world (see Game.render).
  const skyScene = new THREE.Scene();
  skyScene.add(sky);

  // Image-based light from the sky (no sun disc to avoid hot spots). Re-baked
  // by the atmosphere when the time of day or the weather settles.
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(1000);
  Object.assign(envSky.material.uniforms.turbidity, { value: 3.2 });
  envSky.material.uniforms.rayleigh.value = 1.35;
  envSky.material.uniforms.mieCoefficient.value = 0.004;
  envSky.material.uniforms.sunPosition.value.copy(sunDir);
  if (envSky.material.uniforms.showSunDisc) envSky.material.uniforms.showSunDisc.value = false;
  envScene.add(envSky);
  // A ground hemisphere so reflections pick up green/brown below the horizon.
  const groundCol = new THREE.Mesh(
    new THREE.SphereGeometry(500, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.09, 0.11, 0.04), side: THREE.BackSide }),
  );
  envScene.add(groundCol);
  let envRT = null;
  const bakeEnv = () => {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromScene(envScene, 0.02);
    pmrem.dispose();
    const old = envRT?.texture ?? null;
    envRT?.dispose();
    envRT = rt;
    scene.environment = rt.texture;
    // Materials that captured the previous map explicitly (aircraft paint).
    if (old) scene.traverse((o) => {
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) if (m.envMap === old) { m.envMap = rt.texture; m.needsUpdate = true; }
    });
  };
  bakeEnv();
  scene.environmentIntensity = 0.36;

  const hazeColor = new THREE.Color().setRGB(0.55, 0.66, 0.80);
  scene.fog = new THREE.FogExp2(hazeColor, 0.000105);
  scene.background = null;

  const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.95, 0.86), 3.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadow, quality.shadow);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  const cam = sun.shadow.camera;
  cam.near = 1; cam.far = 1200;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(new THREE.Color(0.62, 0.74, 0.95), new THREE.Color(0.20, 0.17, 0.09), 0.3);
  scene.add(hemi);

  const clouds = createClouds(quality.clouds, sunDir);
  scene.add(clouds.mesh);

  const state = { range: quality.shadowRange };
  const texel = new THREE.Vector3();
  return {
    sky, skyScene, sun, hemi, clouds, sunDir, envScene, envSky, bakeEnv,
    // Sun direction for the sky, the env sky, the shadow light and the clouds.
    setSun(dir) {
      sunDir.copy(dir);
      u.sunPosition.value.copy(dir);
      envSky.material.uniforms.sunPosition.value.copy(dir);
      groundCol.material.color.setRGB(0.09, 0.11, 0.04).multiplyScalar(0.45 + 0.55 * Math.min(1, Math.max(0, dir.y * 2.4)));
    },
    setQuality(q) {
      state.range = q.shadowRange;
      if (sun.shadow.mapSize.x !== q.shadow) {
        sun.shadow.mapSize.set(q.shadow, q.shadow);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
    },
    update(camera, focus, dt, time) {
      sky.position.copy(camera.position);
      // Shadow frustum centred on the focus point, snapped to texels to avoid shimmer.
      const r = state.range;
      cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
      cam.updateProjectionMatrix();
      const unit = (2 * r) / sun.shadow.mapSize.x;
      // Normal offset of ~2 shadow texels: enough against acne on the terrain,
      // small enough to keep the aircraft's own fine self-shadowing.
      sun.shadow.normalBias = Math.max(0.15, unit * 1.9);
      texel.copy(focus);
      texel.x = Math.round(texel.x / unit) * unit;
      texel.z = Math.round(texel.z / unit) * unit;
      sun.target.position.copy(texel);
      sun.position.copy(texel).addScaledVector(sunDir, 600);
      sun.target.updateMatrixWorld();
      clouds.update(camera, time);
    },
  };
}

function createClouds(count, sunDir) {
  const r = rng(909);
  const puffs = [];
  const firstPuff = [];
  for (let c = 0; c < count; c++) {
    firstPuff.push(puffs.length);
    // Keep a clear area right over the farm core; clouds sit 800–1500 m up.
    let cx, cz;
    do {
      cx = (r() - 0.5) * 26000;
      cz = (r() - 0.5) * 26000;
    } while (Math.hypot(cx - 600, cz) < 1600);
    const base = 850 + r() * 450;
    const size = 260 + r() * 520;
    const n = 9 + Math.floor(r() * 14);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.pow(r(), 0.6) * size;
      const y = base + Math.pow(r(), 1.5) * size * 0.75;
      puffs.push({
        x: cx + Math.cos(a) * d, y, z: cz + Math.sin(a) * d * 0.7,
        s: (0.45 + r() * 0.55) * size * (1.1 - (y - base) / (size * 1.6)),
        h: (y - base) / (size * 0.75), rot: r() * 6.28, rank: (c + 0.5) / count,
      });
    }
  }
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  geo.setAttribute('uv', quad.getAttribute('uv'));
  const off = new Float32Array(puffs.length * 4);
  const ext = new Float32Array(puffs.length * 3);
  puffs.forEach((p, i) => {
    off.set([p.x, p.y, p.z, p.s], i * 4);
    ext.set([p.h, p.rot, p.rank], i * 3);
  });
  firstPuff.push(puffs.length);
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
  geo.setAttribute('aExt', new THREE.InstancedBufferAttribute(ext, 3));
  geo.instanceCount = puffs.length;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: makeCloudTexture() },
      uSun: { value: sunDir },
      uFogColor: { value: new THREE.Color(0.55, 0.66, 0.8) },
      uCover: { value: 1 },
      uTop: { value: new THREE.Color(1.0, 0.98, 0.95) },
      uBase: { value: new THREE.Color(0.5, 0.55, 0.64) },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aOff; attribute vec3 aExt;
      varying vec2 vUv; varying float vH; varying float vDist; varying float vSunSide; varying float vCover;
      uniform vec3 uSun; uniform float uCover;
      void main() {
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float c = cos(aExt.y), s = sin(aExt.y);
        vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * aOff.w;
        vec3 wp = aOff.xyz + right * p.x + up * p.y;
        vUv = uv; vH = aExt.x;
        // Whole clouds fade in/out with the weather's cover (rank per cloud).
        vCover = smoothstep(aExt.z, aExt.z + 0.08, uCover);
        vec3 toCam = normalize(cameraPosition - aOff.xyz);
        vSunSide = dot(-toCam, uSun);
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex; uniform vec3 uFogColor; uniform vec3 uTop; uniform vec3 uBase;
      varying vec2 vUv; varying float vH; varying float vDist; varying float vSunSide; varying float vCover;
      void main() {
        float a = texture2D(uTex, vUv).a * vCover;
        // Lit tops, grey-blue bases, a little forward scattering toward the sun.
        float shade = clamp(0.55 + 0.6 * vH + (vUv.y - 0.5) * 0.35, 0.45, 1.15);
        vec3 col = mix(uBase, uTop, shade);
        col += vec3(0.25, 0.22, 0.18) * pow(max(vSunSide, 0.0), 6.0);
        float fog = 1.0 - exp(-vDist * 0.00006);
        col = mix(col, uFogColor, fog * 0.75);
        a *= 1.0 - smoothstep(14000.0, 19000.0, vDist);
        a *= smoothstep(30.0, 160.0, vDist);
        gl_FragColor = vec4(col, a * 0.92);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.name = 'clouds';
  const U = mat.uniforms;
  return {
    mesh,
    update() {},
    // Weather look: fraction of clouds shown, top/base colours, haze colour.
    setLook(cover, top, base, fog) {
      U.uCover.value = cover;
      U.uTop.value.setRGB(...top);
      U.uBase.value.setRGB(...base);
      U.uFogColor.value.setRGB(...fog);
      const nc = Math.min(count, Math.ceil((cover + 0.08) * count));
      geo.instanceCount = firstPuff[nc];
      mesh.visible = nc > 0;
    },
  };
}
