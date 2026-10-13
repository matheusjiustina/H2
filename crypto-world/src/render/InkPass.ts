import {
  BufferGeometry,
  Color,
  DepthTexture,
  Float32BufferAttribute,
  HalfFloatType,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  UnsignedIntType,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';

/**
 * Illustration pass: the scene is rendered off-screen, then composited with hand-inked contours.
 *
 * Lines come from the depth buffer only (no extra geometry pass):
 *  - silhouettes, where a pixel is clearly nearer than a neighbour (the line sits on the near object);
 *  - creases, where the depth surface folds (second difference of the depth buffer, which is affine in
 *    1/z and therefore flat on planes).
 * Ink colour is derived from the paint underneath (a deep, saturated version of it) so contours read
 * like a brush pen rather than a black stroke, and lines thin out with distance like an illustrator's
 * atmospheric perspective. A light paper grain and gentle grade finish the frame.
 */
export class InkPass {
  readonly target: WebGLRenderTarget;
  private quad: Mesh;
  private scene = new Scene();
  private cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly material: ShaderMaterial;
  enabled = true;

  constructor(private renderer: WebGLRenderer) {
    const size = renderer.getDrawingBufferSize(new Vector2());
    const depth = new DepthTexture(size.x, size.y, UnsignedIntType);
    this.target = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, depthTexture: depth, samples: 0 });
    this.material = new ShaderMaterial({
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: depth },
        uTexel: { value: new Vector2(1 / size.x, 1 / size.y) },
        uWidth: { value: 1 },
        uNear: { value: 0.1 },
        uFar: { value: 900 },
        uInk: { value: new Color('#1f2340') },
        uStrength: { value: 1 },
        uNight: { value: 0 },
        uGrain: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = position.xy * 0.5 + 0.5;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tColor;
        uniform sampler2D tDepth;
        uniform vec2 uTexel;
        uniform float uWidth, uNear, uFar, uStrength, uNight, uGrain;
        uniform vec3 uInk;
        varying vec2 vUv;

        float rawDepth(vec2 uv) { return texture2D(tDepth, uv).x; }
        float viewZ(float d) {
          // Perspective depth [0,1] → positive view distance.
          float ndc = d * 2.0 - 1.0;
          return (2.0 * uNear * uFar) / (uFar + uNear - ndc * (uFar - uNear));
        }
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

        void main() {
          vec4 paint = texture2D(tColor, vUv);
          vec3 col = paint.rgb;
          vec2 o = uTexel * uWidth;

          float dc = rawDepth(vUv);
          float zc = viewZ(dc);
          float dl = rawDepth(vUv - vec2(o.x, 0.0));
          float dr = rawDepth(vUv + vec2(o.x, 0.0));
          float dd = rawDepth(vUv - vec2(0.0, o.y));
          float du = rawDepth(vUv + vec2(0.0, o.y));
          float zl = viewZ(dl), zr = viewZ(dr), zd = viewZ(dd), zu = viewZ(du);

          // Silhouette: a neighbour is markedly farther than this pixel.
          float farthest = max(max(zl, zr), max(zd, zu));
          float sil = smoothstep(0.035, 0.09, (farthest - zc) / zc);

          // Crease: the depth surface bends (planes have zero second difference in 1/z).
          float ic = 1.0 / zc;
          float lapX = abs(1.0 / zl + 1.0 / zr - 2.0 * ic);
          float lapY = abs(1.0 / zd + 1.0 / zu - 2.0 * ic);
          float crease = smoothstep(0.004, 0.012, max(lapX, lapY) / ic);

          float sky = step(0.99999, dc);
          float edge = max(sil, crease * 0.75) * (1.0 - sky);

          // Lines fade with distance (atmospheric perspective) but never vanish on the horizon.
          float far = smoothstep(18.0, 95.0, zc);
          edge *= mix(1.0, 0.38, far) * uStrength;

          // Brush-pen ink: a deep, saturated version of the paint, leaning to night blue.
          vec3 inkBase = mix(col * vec3(0.32, 0.30, 0.38), uInk, 0.55);
          inkBase = mix(inkBase, uInk * 0.6, uNight * 0.4);
          col = mix(col, inkBase, clamp(edge, 0.0, 1.0));

          // Paper grain and a soft vignette.
          float g = hash(gl_FragCoord.xy) - 0.5;
          col += g * 0.012 * uGrain;
          vec2 q = vUv - 0.5;
          col *= 1.0 - dot(q, q) * 0.22;

          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new Mesh(geo, this.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  /** Call after the renderer's size or pixel ratio changed. */
  resize(): void {
    const size = this.renderer.getDrawingBufferSize(new Vector2());
    this.target.setSize(size.x, size.y);
    this.material.uniforms.uTexel.value.set(1 / size.x, 1 / size.y);
    // Keep contours about 1.5 CSS pixels wide whatever the device pixel ratio.
    this.material.uniforms.uWidth.value = Math.max(1.2, this.renderer.getPixelRatio() * 1.5);
  }

  render(scene: Scene, camera: PerspectiveCamera, night: number): void {
    if (!this.enabled) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
      return;
    }
    const u = this.material.uniforms;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uNight.value = night;
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.cam);
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
  }
}
