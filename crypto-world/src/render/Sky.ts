import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import { PLANET_RADIUS } from '../world/constants';

/**
 * Gradient sky dome that follows the camera. The gradient is computed against the camera's local
 * up (the planet normal under the player), so the horizon always sits where the planet curves away.
 * Includes a soft sun disc, a moon, and stars that fade in at night.
 */
export class Sky {
  readonly mesh: Mesh;
  readonly uniforms = {
    uUp: { value: new Vector3(0, 1, 0) },
    uSunDir: { value: new Vector3(0, 1, 0) },
    uMoonDir: { value: new Vector3(0, -1, 0) },
    uZenith: { value: new Color('#5aa7e8') },
    uHorizon: { value: new Color('#cfe8f7') },
    uBelow: { value: new Color('#9cc5d9') },
    uSunColor: { value: new Color('#fff2cf') },
    uSunGlow: { value: new Color('#ffd79a') },
    uNight: { value: 0 },
    uTime: { value: 0 },
    uStarRot: { value: 0 },
    /** Elevation (dot with local up) of the planet's visible limb; negative on a small planet. */
    uLimb: { value: -0.3 },
  };

  constructor() {
    const mat = new ShaderMaterial({
      uniforms: this.uniforms,
      side: BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * p;
          gl_Position.z = gl_Position.w; // at far plane
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uUp, uSunDir, uMoonDir, uZenith, uHorizon, uBelow, uSunColor, uSunGlow;
        uniform float uNight, uTime, uStarRot, uLimb;
        varying vec3 vDir;
        float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
        float h3(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float vn(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
          return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
        float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int k = 0; k < 4; k++) { s += a * vn(p); p = p * 2.07 + 3.1; a *= 0.5; } return s; }
        void main() {
          vec3 d = normalize(vDir);
          float e = dot(d, uUp);
          vec3 col;
          if (e >= 0.0) {
            float t = pow(e, 0.55);
            col = mix(uHorizon, uZenith, t);
          } else {
            col = mix(uHorizon, uBelow, smoothstep(0.0, 0.35, -e));
          }
          // Sun glow and disc.
          float sd = max(dot(d, uSunDir), 0.0);
          col += uSunGlow * pow(sd, 6.0) * 0.35 * (1.0 - uNight);
          col += uSunGlow * pow(sd, 48.0) * 0.5 * (1.0 - uNight);
          col = mix(col, uSunColor * 1.6, smoothstep(0.9993, 0.9996, sd) * (1.0 - uNight * 0.9));
          // Horizon haze band warms near the sun.
          float band = exp(-abs(e) * 9.0);
          col += uSunGlow * band * pow(sd, 2.0) * 0.25;
          // Painted cloud banks: flat shapes with crisp edges, a sunlit top tone and a cool underside,
          // drifting slowly. Thin near the zenith so the sky keeps a clear centre.
          // Elevation measured from the visible limb: the planet's horizon sits well below eye level.
          float el = (e - uLimb) / (1.0 - uLimb);
          if (el > -0.02) {
            vec3 cp = d * 2.6 + vec3(uTime * 0.006, 0.0, uTime * 0.0035);
            float n = fbm(cp);
            float nUp = fbm(cp + uUp * 0.09);
            float density = smoothstep(0.0, 0.06, el) * (1.0 - smoothstep(0.55, 0.92, el) * 0.7);
            float t = 0.655 - 0.12 * density;
            float aw = fwidth(n) + 0.003;
            float mask = smoothstep(t - aw, t + aw, n) * smoothstep(0.0, 0.05, el);
            float top = smoothstep(-0.004, 0.012, n - nUp);
            float core = smoothstep(t + 0.09 - aw, t + 0.09 + aw, n);
            vec3 lit = mix(vec3(1.0, 0.99, 0.96), uSunGlow, 0.15);
            vec3 under = mix(uZenith * 0.95, vec3(0.93, 0.95, 1.0), 0.32);
            vec3 cloud = mix(under, lit, max(top, core * 0.6));
            cloud = mix(cloud, col * 0.65 + vec3(0.06, 0.07, 0.12), uNight * 0.85);
            col = mix(col, cloud, mask * 0.95);
          }
          // Moon.
          float md = dot(d, uMoonDir);
          col = mix(col, vec3(0.93, 0.95, 1.0), smoothstep(0.9990, 0.9993, md) * uNight);
          col += vec3(0.55, 0.65, 0.9) * pow(max(md, 0.0), 40.0) * 0.18 * uNight;
          // Stars: rotate slowly with time of day.
          if (uNight > 0.01 && e > -0.05) {
            float c = cos(uStarRot), s = sin(uStarRot);
            vec3 sdir = vec3(c*d.x - s*d.z, d.y, s*d.x + c*d.z);
            vec2 uv = vec2(atan(sdir.z, sdir.x), asin(clamp(sdir.y, -1.0, 1.0))) * 60.0;
            vec2 cell = floor(uv);
            float r = h21(cell);
            vec2 f = fract(uv) - 0.5;
            float star = step(0.985, r) * smoothstep(0.12, 0.0, length(f)) * (0.6 + 0.4 * sin(uTime * 2.0 + r * 50.0));
            col += vec3(star) * uNight * smoothstep(-0.05, 0.2, e);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new Mesh(new SphereGeometry(500, 32, 20), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.name = 'sky';
  }

  update(cameraPos: Vector3): void {
    this.mesh.position.copy(cameraPos);
    const k = Math.min(1, PLANET_RADIUS / Math.max(PLANET_RADIUS, cameraPos.length()));
    this.uniforms.uLimb.value = -Math.sqrt(Math.max(0, 1 - k * k));
  }
}
