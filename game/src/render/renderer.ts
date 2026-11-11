import * as THREE from 'three';
import type { Quality } from '../core/save';
import { PAL, shared } from './materials';

export interface QualityPreset {
  pixelRatio: number;
  shadow: number;
  drawDist: number;
  taps: number;
  halftone: number;
  npc: number;
  traffic: number;
  particles: number;
}

export function presetFor(q: Quality): QualityPreset {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  switch (q) {
    case 'low':
      return { pixelRatio: Math.min(dpr, 1) * 0.72, shadow: 0, drawDist: 360, taps: 4, halftone: 0, npc: 0.45, traffic: 0.5, particles: 0.4 };
    case 'high':
      return { pixelRatio: dpr, shadow: 3072, drawDist: 950, taps: 8, halftone: 1, npc: 1, traffic: 1, particles: 1 };
    default:
      return { pixelRatio: Math.min(dpr, 1.25), shadow: 2048, drawDist: 620, taps: 4, halftone: 1, npc: 0.75, traffic: 0.8, particles: 0.8 };
  }
}

const POST_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/**
 * Ink pass. The raw depth buffer is affine in screen space on any plane, so its
 * Laplacian is zero on flat faces and spikes at creases and silhouettes – one
 * scene render gives comic outlines on every edge without a normals pass.
 */
const POST_FS = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uNear;
uniform float uFar;
uniform float uThick;
uniform float uStrength;
uniform float uFade;
uniform vec3 uInk;
uniform float uVignette;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uDesat;
varying vec2 vUv;

float W(vec2 uv) {
  float ndc = texture2D(tDepth, uv).x * 2.0 - 1.0;
  return ((uFar + uNear) - ndc * (uFar - uNear)) / (2.0 * uFar * uNear);
}

void main() {
  vec3 col = texture2D(tColor, vUv).rgb;
  vec2 o = uTexel * uThick;
  float w = W(vUv);
  float wl = W(vUv - vec2(o.x, 0.0));
  float wr = W(vUv + vec2(o.x, 0.0));
  float wu = W(vUv + vec2(0.0, o.y));
  float wd = W(vUv - vec2(0.0, o.y));
  float lap = abs(wl + wr - 2.0 * w) + abs(wu + wd - 2.0 * w);
#ifdef TAPS8
  float w1 = W(vUv + o);
  float w2 = W(vUv - o);
  float w3 = W(vUv + vec2(o.x, -o.y));
  float w4 = W(vUv + vec2(-o.x, o.y));
  lap = max(lap, abs(w1 + w2 - 2.0 * w) + abs(w3 + w4 - 2.0 * w));
#endif
  float wmax = max(w, max(max(wl, wr), max(wu, wd)));
  float z = 1.0 / wmax;
  float e = lap / wmax;
  float thr = 0.0011 * (1.0 + z * 0.012);
  float edge = smoothstep(thr, thr * 2.2, e);
  edge *= 1.0 - smoothstep(uFade * 0.45, uFade, z);
  col = mix(col, uInk, edge * uStrength);

  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(l) * vec3(0.92, 0.97, 1.08), uDesat);
  vec2 q = vUv - 0.5;
  col *= 1.0 - uVignette * dot(q, q) * 1.5;
  col = mix(col, uFlashColor, uFlash);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export class Renderer {
  three: THREE.WebGLRenderer;
  preset: QualityPreset;
  quality: Quality = 'medium';
  private rt: THREE.WebGLRenderTarget;
  private postScene = new THREE.Scene();
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private post: THREE.ShaderMaterial;
  /** Dynamic resolution multiplier (adaptive quality). */
  dynScale = 1;
  private fpsAcc = 0;
  private fpsFrames = 0;
  fps = 60;
  private lowTime = 0;
  private highTime = 0;
  width = 1;
  height = 1;
  /** Screen flash (damage / transitions), 0..1. */
  flash = 0;
  flashColor = new THREE.Color(0xffffff);
  desat = 0;
  calls = 0;
  tris = 0;

  constructor(public canvas: HTMLCanvasElement) {
    this.three = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.three.outputColorSpace = THREE.SRGBColorSpace;
    this.three.shadowMap.type = THREE.PCFShadowMap;
    this.three.info.autoReset = true;
    this.preset = presetFor('medium');
    const gl = this.three.getContext() as WebGL2RenderingContext;
    const float = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      type: float ? THREE.HalfFloatType : THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });
    const depth = new THREE.DepthTexture(4, 4);
    depth.type = THREE.FloatType;
    depth.minFilter = depth.magFilter = THREE.NearestFilter;
    this.rt.depthTexture = depth;
    this.post = new THREE.ShaderMaterial({
      vertexShader: POST_VS,
      fragmentShader: POST_FS,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tColor: { value: this.rt.texture },
        tDepth: { value: depth },
        uTexel: { value: new THREE.Vector2() },
        uNear: { value: 0.4 },
        uFar: { value: 2500 },
        uThick: { value: 1 },
        uStrength: { value: 0.85 },
        uFade: { value: 500 },
        uInk: { value: new THREE.Color(PAL.ink) },
        uVignette: { value: 0.35 },
        uFlash: { value: 0 },
        uFlashColor: { value: this.flashColor },
        uDesat: { value: 0 },
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post);
    quad.frustumCulled = false;
    this.postScene.add(quad);
    window.addEventListener('resize', () => this.resize());
    this.setQuality('medium');
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.preset = presetFor(q);
    this.dynScale = 1;
    this.three.shadowMap.enabled = this.preset.shadow > 0;
    this.three.shadowMap.needsUpdate = true;
    shared.halftone.value = this.preset.halftone * 0.16;
    this.post.defines = this.preset.taps > 4 ? { TAPS8: 1 } : {};
    this.post.needsUpdate = true;
    this.resize();
  }

  resize() {
    const w = Math.max(320, window.innerWidth);
    const h = Math.max(200, window.innerHeight);
    this.width = w;
    this.height = h;
    this.three.setPixelRatio(1);
    this.three.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    const s = this.preset.pixelRatio * this.dynScale;
    const rw = Math.max(64, Math.floor(w * s));
    const rh = Math.max(64, Math.floor(h * s));
    this.rt.setSize(rw, rh);
    // Output canvas at up to native density; the ink pass upsamples the scene.
    const outScale = Math.min(window.devicePixelRatio || 1, Math.max(1, this.preset.pixelRatio));
    this.three.setSize(Math.floor(w * outScale), Math.floor(h * outScale), false);
    (this.post.uniforms.uTexel.value as THREE.Vector2).set(1 / rw, 1 / rh);
    this.post.uniforms.uThick.value = Math.max(1, Math.min(2.2, rh / 900));
    shared.dotScale.value = 1 / Math.max(3.5, (4.5 * rh) / 900);
  }

  /** Adaptive resolution: trade pixels for frame rate when the GPU struggles. */
  private adapt(dt: number) {
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc < 0.5) return;
    this.fps = this.fpsFrames / this.fpsAcc;
    this.fpsAcc = 0;
    this.fpsFrames = 0;
    if (this.fps < 34) {
      this.lowTime += 0.5;
      this.highTime = 0;
    } else if (this.fps > 56) {
      this.highTime += 0.5;
      this.lowTime = 0;
    } else {
      this.lowTime = this.highTime = 0;
    }
    if (this.lowTime >= 2.5 && this.dynScale > 0.55) {
      this.dynScale = Math.max(0.55, this.dynScale - 0.12);
      this.lowTime = 0;
      this.resize();
    } else if (this.highTime >= 6 && this.dynScale < 1) {
      this.dynScale = Math.min(1, this.dynScale + 0.08);
      this.highTime = 0;
      this.resize();
    }
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, dt: number) {
    this.adapt(dt);
    const u = this.post.uniforms;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uFade.value = this.preset.drawDist * 0.9;
    u.uFlash.value = this.flash;
    u.uDesat.value = this.desat;
    this.three.setRenderTarget(this.rt);
    this.three.render(scene, camera);
    this.calls = this.three.info.render.calls;
    this.tris = this.three.info.render.triangles;
    this.three.setRenderTarget(null);
    this.three.render(this.postScene, this.postCam);
  }
}
