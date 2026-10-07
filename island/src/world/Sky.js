import * as THREE from 'three';
import { U, GLSL_UNIFORMS, GLSL_COMMON, LAYER } from '../core/Shared.js';

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vDir = normalize(wp.xyz - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w * 0.99999;
}`;

const SKY_FRAG = /* glsl */ `
${GLSL_UNIFORMS}
${GLSL_COMMON}
uniform float uEnvMode;
varying vec3 vDir;
varying vec3 vWorld;

float starField(vec3 d) {
  vec3 p = d * 220.0;
  vec3 i = floor(p);
  vec3 f = fract(p) - 0.5;
  float h = fract(sin(dot(i, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  float s = step(0.9965, h);
  float tw = 0.6 + 0.4 * sin(uTime * (2.0 + h * 9.0) + h * 40.0);
  float core = smoothstep(0.32, 0.0, length(f));
  return s * core * tw * (0.5 + 2.5 * fract(h * 91.7));
}

void main() {
  vec3 dir = normalize(vDir);
  vec3 origin = cameraPosition;
  vec3 col = skyRadiance(dir);

  // stars + milky way at night
  if (uNight > 0.01 && dir.y > -0.05) {
    float bd = dot(dir, normalize(vec3(0.4, 0.55, 0.73))) * 3.2;
    float band = exp(-bd * bd);
    float mw = texture2D(uNoiseTex, dir.xz * 1.7 + dir.y).g;
    vec3 stars = vec3(starField(dir)) * (1.0 - uEnvMode);
    col += (stars * 1.6 + vec3(0.16, 0.17, 0.24) * band * mw * 0.08) * uNight * smoothstep(-0.05, 0.25, dir.y) * (1.0 - uCloudCover * 0.9);
  }

  // moon
  float md = dot(dir, normalize(uMoonDir));
  if (uMoonDir.y > -0.1) {
    float disc = smoothstep(0.99985, 0.99992, md);
    float glow = pow(max(md, 0.0), 220.0) * 0.6 + pow(max(md, 0.0), 18.0) * 0.06;
    vec3 mc = vec3(0.85, 0.9, 1.0);
    col += mc * (disc * 1.6 * (1.0 - uEnvMode) + glow) * uNight;
  }

  // sun disc
  float sd = dot(dir, normalize(uSunDisk));
  float disc = smoothstep(0.99990, 0.99996, sd);
  vec3 sunCol = uSunGlow * 60.0 * (1.0 - uNight);

  // clouds
  float cloudAlpha = 0.0;
  if (dir.y > 0.008) {
    float t = (CLOUD_HEIGHT * 1000.0 - origin.y) / dir.y;
    vec2 p = (origin.xz + dir.xz * t) * 0.001;
    float d = cloudDensity(p);
    vec3 L = normalize(uSunDisk);
    float dl = cloudDensity(p + L.xz * 0.05);
    float dl2 = cloudDensity(p + L.xz * 0.12);
    float lit = clamp(0.62 + (d - dl) * 1.6 + (d - dl2) * 0.9, 0.0, 1.25);
    float core = smoothstep(0.45, 1.0, d) * smoothstep(0.2, -0.2, d - dl2);
    vec3 cc = mix(uCloudDark, uCloudLit, lit * (1.0 - core * 0.45));
    float mu = max(sd, 0.0);
    // silver lining towards the sun
    cc += uSunGlow * (pow(mu, 6.0) * 0.9 + pow(mu, 40.0) * 1.8) * (1.0 - smoothstep(0.2, 0.9, d)) * (1.0 - uNight);
    // cirrus streaks
    float ci = texture2D(uNoiseTex, vec2(p.x * 0.06, p.y * 0.25) + uCloudOffset * 0.3).b;
    float cirrus = smoothstep(0.55, 0.8, ci) * 0.35 * (1.0 - uCloudCover * 0.7);
    float fade = smoothstep(0.004, 0.07, dir.y);
    float horizonHaze = 1.0 - exp(-dir.y * 14.0);
    cloudAlpha = clamp(d + cirrus * (1.0 - d), 0.0, 1.0) * fade;
    vec3 cloud = mix(cc, mix(uCloudLit, cc, 0.5), cirrus * (1.0 - d));
    cloud = mix(uFogColor * 1.05, cloud, horizonHaze);
    col = mix(col, cloud, cloudAlpha);
    col += vec3(0.9, 0.92, 1.0) * uLightning * d * 2.5;
  }
  col += sunCol * disc * (1.0 - cloudAlpha * 0.97) * (1.0 - uEnvMode * 0.9);

  // below horizon (only visible from above in env capture / reflections at grazing angles)
  if (dir.y < 0.0) {
    vec3 ground = mix(uSkyGround, uFogColor, exp(dir.y * 30.0) * 0.7);
    col = mix(col, ground, smoothstep(0.0, -0.04, dir.y) * (uEnvMode > 0.5 ? 1.0 : 0.85));
  }
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

export class Sky {
  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: { ...U, uEnvMode: { value: 0 } },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(4200, 48, 24), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -100;
    this.mesh.layers.enable(LAYER.REFLECT_LITE);

    // Separate instance for environment capture.
    this.envMaterial = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: { ...U, uEnvMode: { value: 1 } },
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.envScene = new THREE.Scene();
    this.envMesh = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.envMaterial);
    this.envScene.add(this.envMesh);
  }

  update(camera) {
    this.mesh.position.copy(camera.position);
  }
}
