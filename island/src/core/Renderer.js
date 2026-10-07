import * as THREE from 'three';
import { LAYER, U } from './Shared.js';
import {
  FullscreenPass, CopyRefractionFrag, SSAOFrag, BlurAOFrag, ApplyAOFrag, BloomDownFrag, BloomUpFrag,
  CompositeFrag, FXAAFrag,
} from '../effects/PostProcessing.js';

const BLOOM_LEVELS = 6;

/**
 * Owns the WebGLRenderer and the frame graph:
 * opaque HDR scene -> SSAO -> refraction copy -> planar reflection -> water + FX
 * -> bloom -> filmic composite -> FXAA/sharpen -> canvas.
 */
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    const r = this.renderer;
    r.toneMapping = THREE.NoToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.shadowMap.autoUpdate = false;
    r.info.autoReset = false;
    r.autoClear = false;
    r.setClearColor(0x000000, 1);

    this.settings = {
      renderScale: 1,
      ssao: true,
      bloom: true,
      reflections: 'full', // 'full' | 'lite' | 'off'
      reflectionScale: 0.5,
      msaa: 0,
      fxaa: true,
      sharpen: 0.18,
      shadowEveryFrame: true,
    };

    this.grade = {
      exposure: 1,
      contrast: 1.06,
      saturation: 1.08,
      white: new THREE.Vector3(1, 1, 1),
      shadowTint: new THREE.Vector3(-0.012, 0.004, 0.012),
      highlightTint: new THREE.Vector3(0.012, 0.004, -0.012),
      vignette: 0.32,
      bloom: 0.05,
      grain: 0.012,
      flash: 0,
    };

    this.size = new THREE.Vector2();
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    r.setPixelRatio(this.pixelRatio);

    this._createTargets();
    this._createPasses();

    this.reflectionCamera = new THREE.PerspectiveCamera();
    this.reflectionMatrix = new THREE.Matrix4();
    this.underwater = 0;
    this.hasViewModel = true;
    this.waterY = 0;
    this.frame = 0;
    this._v = new THREE.Vector3();
    this._nearCorners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  }

  _createTargets() {
    const opts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.sceneRT = new THREE.WebGLRenderTarget(4, 4, {
      ...opts,
      depthBuffer: true,
      samples: this.settings.msaa,
      depthTexture: new THREE.DepthTexture(4, 4, THREE.FloatType),
    });
    this.refrRT = new THREE.WebGLRenderTarget(4, 4, opts);
    this.reflRT = new THREE.WebGLRenderTarget(4, 4, { ...opts, depthBuffer: true });
    this.aoRT = new THREE.WebGLRenderTarget(4, 4, { ...opts, type: THREE.UnsignedByteType });
    this.aoBlurRT = new THREE.WebGLRenderTarget(4, 4, { ...opts, type: THREE.UnsignedByteType });
    this.ldrRT = new THREE.WebGLRenderTarget(4, 4, { ...opts, type: THREE.UnsignedByteType });
    this.bloomRTs = [];
    for (let i = 0; i < BLOOM_LEVELS; i++) this.bloomRTs.push(new THREE.WebGLRenderTarget(4, 4, opts));
  }

  _createPasses() {
    const depthU = () => ({ uNear: { value: 0.1 }, uFar: { value: 5000 } });
    this.copyRefr = new FullscreenPass(CopyRefractionFrag, { tColor: { value: null }, tDepth: { value: null }, ...depthU() });
    this.ssaoPass = new FullscreenPass(SSAOFrag, {
      tDepth: { value: null }, uTexel: { value: new THREE.Vector2() }, uProj: { value: new THREE.Vector2() },
      uRadius: { value: 0.9 }, uIntensity: { value: 0.9 }, uAspect: { value: 1 }, ...depthU(),
    });
    this.blurAO = new FullscreenPass(BlurAOFrag, { tAO: { value: null }, tDepth: { value: null }, uDir: { value: new THREE.Vector2() }, ...depthU() });
    this.applyAO = new FullscreenPass(ApplyAOFrag, { tAO: { value: null }, uStrength: { value: 0.75 } }, {
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.ZeroFactor,
      blendDst: THREE.SrcColorFactor,
      transparent: true,
    });
    this.bloomDown = new FullscreenPass(BloomDownFrag, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.6 }, uFirst: { value: 0 } });
    this.bloomUp = new FullscreenPass(BloomUpFrag, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1.0 } }, {
      blending: THREE.AdditiveBlending, transparent: true,
    });
    this.composite = new FullscreenPass(CompositeFrag, {
      tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 0.05 }, uExposure: { value: 1 },
      uContrast: { value: 1 }, uSaturation: { value: 1 }, uWhite: { value: new THREE.Vector3(1, 1, 1) },
      uShadowTint: { value: new THREE.Vector3() }, uHighlightTint: { value: new THREE.Vector3() },
      uVignette: { value: 0.3 }, uTime: { value: 0 }, uUnderwater: { value: 0 }, uNearY: { value: new THREE.Vector4() },
      uWaterY: { value: 0 }, uFlash: { value: 0 }, uTexel: { value: new THREE.Vector2() }, uGrain: { value: 0.01 },
    });
    this.fxaa = new FullscreenPass(FXAAFrag, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uSharpen: { value: 0.2 }, uEnabled: { value: 1 } });
  }

  applySettings(s) {
    Object.assign(this.settings, s);
    this.shadowWarm = 2;
    if (this.sceneRT.samples !== this.settings.msaa) {
      this.sceneRT.dispose();
      this.sceneRT = new THREE.WebGLRenderTarget(4, 4, {
        type: THREE.HalfFloatType, format: THREE.RGBAFormat, generateMipmaps: false, depthBuffer: true,
        samples: this.settings.msaa, depthTexture: new THREE.DepthTexture(4, 4, THREE.FloatType),
      });
    }
    this.resize(true);
  }

  resize(force = false) {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    if (!force && w === this.size.x && h === this.size.y) return false;
    this.size.set(w, h);
    this.renderer.setSize(w, h, false);
    const pw = Math.floor(w * this.pixelRatio), ph = Math.floor(h * this.pixelRatio);
    const sw = Math.max(2, Math.floor(pw * this.settings.renderScale)), sh = Math.max(2, Math.floor(ph * this.settings.renderScale));
    this.internal = new THREE.Vector2(sw, sh);
    this.sceneRT.setSize(sw, sh);
    this.refrRT.setSize(Math.max(2, sw >> 1), Math.max(2, sh >> 1));
    const rs = this.settings.reflectionScale;
    this.reflRT.setSize(Math.max(2, Math.floor(sw * rs)), Math.max(2, Math.floor(sh * rs)));
    this.aoRT.setSize(Math.max(2, sw >> 1), Math.max(2, sh >> 1));
    this.aoBlurRT.setSize(Math.max(2, sw >> 1), Math.max(2, sh >> 1));
    this.ldrRT.setSize(pw, ph);
    let bw = sw >> 1, bh = sh >> 1;
    for (const rt of this.bloomRTs) {
      rt.setSize(Math.max(2, bw), Math.max(2, bh));
      bw >>= 1; bh >>= 1;
    }
    this.output = new THREE.Vector2(pw, ph);
    return true;
  }

  _setDepthUniforms(pass, camera) {
    pass.uniforms.uNear.value = camera.near;
    pass.uniforms.uFar.value = camera.far;
  }

  _updateReflectionCamera(camera, level) {
    const rc = this.reflectionCamera;
    camera.updateMatrixWorld();
    const camPos = this._v.setFromMatrixPosition(camera.matrixWorld);
    rc.position.set(camPos.x, 2 * level - camPos.y, camPos.z);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const target = camPos.clone().add(dir);
    target.y = 2 * level - target.y;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    up.y = -up.y;
    rc.up.copy(up);
    rc.lookAt(target);
    rc.near = camera.near;
    rc.far = camera.far;
    rc.fov = camera.fov;
    rc.aspect = camera.aspect;
    rc.updateMatrixWorld();
    rc.projectionMatrix.copy(camera.projectionMatrix);
    rc.projectionMatrixInverse.copy(camera.projectionMatrixInverse);

    // texture matrix for projective lookup
    this.reflectionMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.reflectionMatrix.multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);

    // oblique near plane clipping at the water plane
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -level + 0.05);
    plane.applyMatrix4(rc.matrixWorldInverse);
    const clip = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = rc.projectionMatrix.elements;
    const q = new THREE.Vector4(
      (Math.sign(clip.x) + pm[8]) / pm[0],
      (Math.sign(clip.y) + pm[9]) / pm[5],
      -1.0,
      (1.0 + pm[10]) / pm[14],
    );
    clip.multiplyScalar(2.0 / clip.dot(q));
    pm[2] = clip.x;
    pm[6] = clip.y;
    pm[10] = clip.z + 1.0;
    pm[14] = clip.w;
    rc.projectionMatrixInverse.copy(rc.projectionMatrix).invert();
  }

  _computeNearPlane(camera) {
    // world y of the four near plane corners (for the per-pixel waterline)
    const ys = [];
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (let i = 0; i < 4; i++) {
      const v = this._nearCorners[i].set(corners[i][0], corners[i][1], -1).unproject(camera);
      ys.push(v.y);
    }
    return ys;
  }

  /**
   * Render one frame.
   * world: { scene, camera, water (Ocean), waterHeightAtCamera, time }
   */
  render({ scene, camera, water, waterYAtCamera = 0, time = 0 }) {
    const r = this.renderer;
    const s = this.settings;
    this.frame++;
    r.info.reset();

    // ---------------------------------------------------------------- opaque
    // a settings change can drop the shadow maps; rebuild them before any frame samples them
    r.shadowMap.needsUpdate = s.shadowEveryFrame || (this.frame % 2 === 0) || this.shadowWarm > 0;
    if (this.shadowWarm > 0) this.shadowWarm--;
    camera.layers.disableAll();
    camera.layers.enable(LAYER.WORLD);
    camera.layers.enable(LAYER.DETAIL);
    r.setRenderTarget(this.sceneRT);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, false);
    r.render(scene, camera);
    const st = this.passStats || (this.passStats = {});
    st.opaque = r.info.render.calls;

    // ---------------------------------------------------------------- SSAO
    if (s.ssao) {
      const p = this.ssaoPass;
      p.uniforms.tDepth.value = this.sceneRT.depthTexture;
      p.uniforms.uTexel.value.set(1 / this.aoRT.width, 1 / this.aoRT.height);
      p.uniforms.uProj.value.set(camera.projectionMatrix.elements[0], camera.projectionMatrix.elements[5]);
      p.uniforms.uAspect.value = camera.aspect;
      this._setDepthUniforms(p, camera);
      p.render(r, this.aoRT);
      const b = this.blurAO;
      this._setDepthUniforms(b, camera);
      b.uniforms.tDepth.value = this.sceneRT.depthTexture;
      b.uniforms.tAO.value = this.aoRT.texture;
      b.uniforms.uDir.value.set(1 / this.aoRT.width, 0);
      b.render(r, this.aoBlurRT);
      b.uniforms.tAO.value = this.aoBlurRT.texture;
      b.uniforms.uDir.value.set(0, 1 / this.aoRT.height);
      b.render(r, this.aoRT);
      this.applyAO.uniforms.tAO.value = this.aoRT.texture;
      this.applyAO.render(r, this.sceneRT, false);
    }

    // ---------------------------------------------------------------- refraction source
    this.copyRefr.uniforms.tColor.value = this.sceneRT.texture;
    this.copyRefr.uniforms.tDepth.value = this.sceneRT.depthTexture;
    this._setDepthUniforms(this.copyRefr, camera);
    this.copyRefr.render(r, this.refrRT);

    // ---------------------------------------------------------------- planar reflection
    const uw = U.uUnderwater.value > 0.5;
    let hasReflection = false;
    if (s.reflections !== 'off' && !uw && water) {
      this._updateReflectionCamera(camera, U.uWaterLevel.value);
      const rc = this.reflectionCamera;
      rc.layers.disableAll();
      rc.layers.enable(s.reflections === 'full' ? LAYER.WORLD : LAYER.REFLECT_LITE);
      r.setRenderTarget(this.reflRT);
      r.clear(true, true, false);
      r.render(scene, rc);
      hasReflection = true;
    }
    st.reflection = r.info.render.calls - st.opaque;

    // ---------------------------------------------------------------- water + transparent fx
    if (water) {
      water.setPassInputs({
        refraction: this.refrRT.texture,
        reflection: hasReflection ? this.reflRT.texture : null,
        reflectionMatrix: this.reflectionMatrix,
        resolution: this.internal,
        near: camera.near,
        far: camera.far,
      });
    }
    camera.layers.disableAll();
    camera.layers.enable(LAYER.WATER);
    camera.layers.enable(LAYER.FX);
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);

    st.water = r.info.render.calls;
    // ---------------------------------------------------------------- first person view model
    if (this.hasViewModel) {
      camera.layers.set(LAYER.VIEWMODEL);
      r.clearDepth();
      r.render(scene, camera);
    }
    camera.layers.enable(LAYER.WORLD);
    camera.layers.enable(LAYER.DETAIL);

    st.total = r.info.render.calls;
    // ---------------------------------------------------------------- bloom
    let bloomTex = this.bloomRTs[0].texture;
    if (s.bloom) {
      let src = this.sceneRT.texture;
      let sw = this.sceneRT.width, sh = this.sceneRT.height;
      for (let i = 0; i < BLOOM_LEVELS; i++) {
        const d = this.bloomDown;
        d.uniforms.tSrc.value = src;
        d.uniforms.uTexel.value.set(1 / sw, 1 / sh);
        d.uniforms.uFirst.value = i === 0 ? 1 : 0;
        d.render(r, this.bloomRTs[i]);
        src = this.bloomRTs[i].texture;
        sw = this.bloomRTs[i].width; sh = this.bloomRTs[i].height;
      }
      for (let i = BLOOM_LEVELS - 1; i > 0; i--) {
        const u = this.bloomUp;
        u.uniforms.tSrc.value = this.bloomRTs[i].texture;
        u.uniforms.uTexel.value.set(1 / this.bloomRTs[i].width, 1 / this.bloomRTs[i].height);
        u.render(r, this.bloomRTs[i - 1], false);
      }
      bloomTex = this.bloomRTs[0].texture;
    }

    // ---------------------------------------------------------------- composite
    const c = this.composite.uniforms;
    const g = this.grade;
    c.tScene.value = this.sceneRT.texture;
    c.tBloom.value = bloomTex;
    c.uBloom.value = s.bloom ? g.bloom : 0;
    c.uExposure.value = g.exposure;
    c.uContrast.value = g.contrast;
    c.uSaturation.value = g.saturation;
    c.uWhite.value.copy(g.white);
    c.uShadowTint.value.copy(g.shadowTint);
    c.uHighlightTint.value.copy(g.highlightTint);
    c.uVignette.value = g.vignette;
    c.uTime.value = time;
    c.uUnderwater.value = U.uUnderwater.value;
    const ny = this._computeNearPlane(camera);
    c.uNearY.value.set(ny[0], ny[1], ny[2], ny[3]);
    c.uWaterY.value = waterYAtCamera;
    c.uFlash.value = g.flash;
    c.uGrain.value = g.grain;
    this.composite.render(r, s.fxaa || s.sharpen > 0 ? this.ldrRT : null);

    if (s.fxaa || s.sharpen > 0) {
      const f = this.fxaa.uniforms;
      f.tSrc.value = this.ldrRT.texture;
      f.uTexel.value.set(1 / this.ldrRT.width, 1 / this.ldrRT.height);
      f.uSharpen.value = s.sharpen;
      f.uEnabled.value = s.fxaa ? 1 : 0;
      this.fxaa.render(r, null);
    }
  }

  /** Grab the current canvas as a small data URL (photo camera). */
  snapshot(maxWidth = 480) {
    const src = this.canvas;
    const c = document.createElement('canvas');
    const scale = maxWidth / src.width;
    c.width = Math.round(src.width * scale);
    c.height = Math.round(src.height * scale);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  }
}
