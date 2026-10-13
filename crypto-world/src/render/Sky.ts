import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';

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
        uniform float uNight, uTime, uStarRot;
        varying vec3 vDir;
        float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
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
  }
}
