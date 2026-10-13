import { BufferAttribute, BufferGeometry, Color, Group, Mesh, ShaderMaterial, UniformsLib, UniformsUtils, Vector3 } from 'three';
import { gridDir, Heightfield } from '../world/terrain/Heightfield';
import { PLANET_RADIUS, SEA_LEVEL } from '../world/constants';
import { worldUniforms } from './materials';

const RES = 64;
const CH = 4; // chunks per face side

/**
 * Stylised animated water. Only the parts of the sea sphere above submerged terrain are built, in
 * chunks with bounding spheres for horizon culling. A per-vertex depth attribute drives colour,
 * transparency and shoreline foam.
 */
export class Water {
  readonly group = new Group();
  readonly material: ShaderMaterial;
  readonly uniforms = UniformsUtils.merge([
    UniformsLib.fog,
    {
      uTime: { value: 0 },
      uSunDir: { value: new Vector3(0, 1, 0) },
      uSunColor: { value: new Color('#fff3d6') },
      uShallow: { value: new Color('#79d3cc') },
      uDeep: { value: new Color('#2a76ad') },
      uFoam: { value: new Color('#f4fbff') },
      uNight: { value: 0 },
      uSkyColor: { value: new Color('#bcd9ff') },
    },
  ]);

  constructor(hf: Heightfield) {
    this.material = new ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      fog: true,
      vertexShader: /* glsl */ `
        attribute float aDepth;
        uniform float uTime;
        varying float vDepth;
        varying vec3 vWorld;
        #include <fog_pars_vertex>
        void main() {
          vDepth = aDepth;
          vec3 d = normalize(position);
          float w = sin(dot(position, vec3(0.7, 0.3, 0.5)) * 0.9 + uTime * 1.3) * 0.05
                  + sin(dot(position, vec3(-0.4, 0.8, 0.2)) * 1.7 + uTime * 1.9) * 0.025;
          vec3 p = position + d * w * smoothstep(0.0, 1.5, aDepth);
          vWorld = p;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uNight;
        uniform vec3 uSunDir, uSunColor, uShallow, uDeep, uFoam, uSkyColor;
        varying float vDepth;
        varying vec3 vWorld;
        #include <fog_pars_fragment>
        float hh(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float nn(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
          return mix(mix(mix(hh(i),hh(i+vec3(1,0,0)),f.x),mix(hh(i+vec3(0,1,0)),hh(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(hh(i+vec3(0,0,1)),hh(i+vec3(1,0,1)),f.x),mix(hh(i+vec3(0,1,1)),hh(i+vec3(1,1,1)),f.x),f.y),f.z); }
        void main() {
          vec3 up = normalize(vWorld);
          float depthT = smoothstep(0.0, 5.0, vDepth);
          vec3 col = mix(uShallow, uDeep, depthT);
          // Gentle caustic-like ripples.
          float n = nn(vWorld * 0.9 + vec3(uTime * 0.25, 0.0, uTime * 0.18));
          float n2 = nn(vWorld * 2.3 - vec3(uTime * 0.3, uTime * 0.1, 0.0));
          col *= 0.94 + 0.1 * n;
          // Fake normal for highlights.
          vec3 nrm = normalize(up + vec3(n - 0.5, n2 - 0.5, (n + n2) * 0.5 - 0.5) * 0.25);
          vec3 viewDir = normalize(cameraPosition - vWorld);
          vec3 h = normalize(uSunDir + viewDir);
          float spec = pow(max(dot(nrm, h), 0.0), 90.0);
          col += uSunColor * spec * 0.9;
          float fres = pow(1.0 - max(dot(up, viewDir), 0.0), 4.0);
          col = mix(col, uSkyColor, fres * 0.35);
          // Shoreline foam bands.
          float band = sin(vDepth * 9.0 - uTime * 1.6 + n * 4.0) * 0.5 + 0.5;
          float foam = smoothstep(0.55, 0.05, vDepth) * (0.6 + 0.4 * band);
          foam = max(foam, smoothstep(0.82, 0.95, n2) * smoothstep(1.4, 0.4, vDepth) * 0.6);
          col = mix(col, uFoam, clamp(foam, 0.0, 1.0));
          col *= mix(1.0, 0.45, uNight);
          float alpha = mix(0.62, 0.94, smoothstep(0.0, 2.5, vDepth));
          alpha = max(alpha, foam);
          gl_FragColor = vec4(col, alpha);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });

    const r = PLANET_RADIUS + SEA_LEVEL;
    const d = new Vector3();
    const C = RES / CH;
    const terrain = (dd: Vector3) => hf.heightAt(dd);
    for (let face = 0; face < 6; face++) {
      for (let cj = 0; cj < CH; cj++) {
        for (let ci = 0; ci < CH; ci++) {
          // Which quads are wet?
          const wet: boolean[] = [];
          let any = false;
          for (let j = 0; j < C; j++)
            for (let i = 0; i < C; i++) {
              let w = false;
              for (const [oi, oj] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5]]) {
                gridDir(face, ci * C + i + oi, cj * C + j + oj, RES, d);
                if (terrain(d) < SEA_LEVEL + 0.15) w = true;
              }
              wet.push(w);
              any = any || w;
            }
          if (!any) continue;
          const pos = new Float32Array((C + 1) * (C + 1) * 3);
          const dep = new Float32Array((C + 1) * (C + 1));
          for (let j = 0; j <= C; j++)
            for (let i = 0; i <= C; i++) {
              gridDir(face, ci * C + i, cj * C + j, RES, d);
              const k = i + j * (C + 1);
              pos[k * 3] = d.x * r;
              pos[k * 3 + 1] = d.y * r;
              pos[k * 3 + 2] = d.z * r;
              dep[k] = SEA_LEVEL - terrain(d);
            }
          const idx: number[] = [];
          for (let j = 0; j < C; j++)
            for (let i = 0; i < C; i++) {
              if (!wet[i + j * C]) continue;
              const a = i + j * (C + 1), b = a + 1, c = a + C + 2, e = a + C + 1;
              idx.push(a, b, c, a, c, e);
            }
          const geo = new BufferGeometry();
          geo.setAttribute('position', new BufferAttribute(pos, 3));
          geo.setAttribute('aDepth', new BufferAttribute(dep, 1));
          geo.setIndex(idx);
          geo.computeBoundingSphere();
          const mesh = new Mesh(geo, this.material);
          mesh.renderOrder = 2;
          mesh.matrixAutoUpdate = false;
          this.group.add(mesh);
        }
      }
    }
  }

  update(dt: number, sunDir: Vector3, sunColor: Color, night: number): void {
    this.uniforms.uTime.value += dt;
    this.uniforms.uSunDir.value.copy(sunDir);
    this.uniforms.uSunColor.value.copy(sunColor);
    this.uniforms.uNight.value = night;
    this.uniforms.uSkyColor.value.copy(worldUniforms.uSkyColor.value);
  }
}
