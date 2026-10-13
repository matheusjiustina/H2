import * as THREE from 'three';

// Periodic (tileable) noise library for GPU texture baking.
export const BAKE_LIB = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;
#define PI 3.14159265359
float hash1(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 hash2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec3 hash3(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
vec2 grad(vec2 i, vec2 per) { vec2 h = hash2(mod(i, per)) * 6.2831853; return vec2(cos(h.x), sin(h.x)); }
// periodic gradient noise, returns -1..1 (approx)
float pnoise(vec2 p, vec2 per) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(grad(i, per), f);
  float b = dot(grad(i + vec2(1, 0), per), f - vec2(1, 0));
  float c = dot(grad(i + vec2(0, 1), per), f - vec2(0, 1));
  float d = dot(grad(i + vec2(1, 1), per), f - vec2(1, 1));
  return 1.42 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float pfbm(vec2 uv, float base, int oct, float gain) {
  float s = 0.0, a = 0.5, n = 0.0;
  float f = base;
  for (int i = 0; i < 10; i++) {
    if (i >= oct) break;
    s += a * pnoise(uv * f, vec2(f));
    n += a; a *= gain; f *= 2.0;
  }
  return s / n;
}
float pridge(vec2 uv, float base, int oct) {
  float s = 0.0, a = 0.5, n = 0.0, f = base, prev = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    float r = 1.0 - abs(pnoise(uv * f, vec2(f)));
    r *= r;
    s += a * r * prev; prev = r; n += a; a *= 0.5; f *= 2.0;
  }
  return s / n;
}
// periodic voronoi: x = F1, y = F2, zw = cell id hash
vec4 pvoronoi(vec2 uv, float cells, float jitter) {
  vec2 p = uv * cells;
  vec2 i = floor(p), f = fract(p);
  float f1 = 8.0, f2 = 8.0; vec2 id = vec2(0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = hash2(mod(i + g, vec2(cells))) * jitter + 0.5 * (1.0 - jitter);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; id = mod(i + g, vec2(cells)); } else if (d < f2) { f2 = d; }
  }
  return vec4(sqrt(f1), sqrt(f2), hash2(id));
}
vec3 srgb(vec3 c) { return pow(c, vec3(1.0 / 2.2)); }
`;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export class TextureBaker {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    this.targets = [];
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();
  }

  _render(fragment, rt, uniforms = {}) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: `${BAKE_LIB}\n${fragment}`,
      uniforms: { uRes: { value: new THREE.Vector2(rt.width, rt.height) }, ...uniforms },
      depthTest: false,
      depthWrite: false,
    });
    this.mesh.material = mat;
    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(rt);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(prev);
    mat.dispose();
  }

  /** Bake a 2D texture. fragment must define void main() writing gl_FragColor. */
  bake(fragment, { width = 512, height = width, uniforms = {}, mipmaps = true, wrap = THREE.RepeatWrapping, type = THREE.UnsignedByteType, aniso = true, srgb = false } = {}) {
    if (srgb) {
      // sRGB colour data: read back and upload as an SRGB8_ALPHA8 texture so the
      // hardware decodes to linear with full 8-bit precision in the darks.
      const data = this.bakePixels(fragment, { width, height, uniforms });
      const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = wrap;
      tex.generateMipmaps = mipmaps;
      tex.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = aniso ? Math.min(8, this.maxAniso) : 1;
      tex.needsUpdate = true;
      return tex;
    }
    const rt = new THREE.WebGLRenderTarget(width, height, {
      type,
      format: THREE.RGBAFormat,
      generateMipmaps: mipmaps,
      minFilter: mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: wrap,
      wrapT: wrap,
      depthBuffer: false,
    });
    if (srgb) rt.texture.colorSpace = THREE.SRGBColorSpace;
    this._render(fragment, rt, uniforms);
    rt.texture.anisotropy = aniso ? Math.min(8, this.maxAniso) : 1;
    this.targets.push(rt);
    return rt.texture;
  }

  /** Bake into CPU memory (Uint8 RGBA). */
  bakePixels(fragment, { width = 512, height = width, uniforms = {} } = {}) {
    const rt = new THREE.WebGLRenderTarget(width, height, { type: THREE.UnsignedByteType, depthBuffer: false });
    this._render(fragment, rt, uniforms);
    const out = new Uint8Array(width * height * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, width, height, out);
    rt.dispose();
    return out;
  }

  /** Bake several fragments as the layers of a mip-mapped DataArrayTexture. */
  bakeArray(fragments, { size = 512, uniforms = {}, srgb = false } = {}) {
    const layer = size * size * 4;
    const data = new Uint8Array(layer * fragments.length);
    fragments.forEach((f, i) => data.set(this.bakePixels(f, { width: size, height: size, uniforms }), i * layer));
    const tex = new THREE.DataArrayTexture(data, size, size, fragments.length);
    tex.format = THREE.RGBAFormat;
    tex.type = THREE.UnsignedByteType;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = Math.min(8, this.maxAniso);
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  dispose() {
    this.mesh.geometry.dispose();
  }
}
