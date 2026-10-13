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
      uShallow: { value: new Color('#6fd6c8') },
      uDeep: { value: new Color('#2b6fa8') },
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
          // Drawn water: flat colour bands by depth with thin contour lines between them, white
          // ripple strokes, crisp sun glints and a scalloped foam line along the shore.
          vec3 up = normalize(vWorld);
          vec3 viewDir = normalize(cameraPosition - vWorld);
          float camD = distance(cameraPosition, vWorld);
          float near = 1.0 - smoothstep(25.0, 70.0, camD);
          float wob = nn(vWorld * 0.7 + vec3(uTime * 0.12, 0.0, uTime * 0.09)) - 0.5;
          float dz = vDepth + wob * 0.35;
          float b1 = smoothstep(0.85, 0.9, dz);
          float b2 = smoothstep(2.6, 2.7, dz);
          vec3 col = mix(uShallow, mix(uShallow, uDeep, 0.5), b1);
          col = mix(col, uDeep, b2);
          // Contour lines on the band edges.
          float cw = fwidth(dz) * 1.2 + 0.01;
          float contour = (1.0 - smoothstep(0.0, cw, abs(dz - 0.875))) + (1.0 - smoothstep(0.0, cw, abs(dz - 2.65))) * 0.7;
          col = mix(col, col * 1.18 + vec3(0.04), contour * 0.6);
          // Ripple strokes: short, wavy, drifting with the current.
          vec3 q = vWorld * vec3(1.1, 1.1, 1.1) + vec3(uTime * 0.35, uTime * 0.12, -uTime * 0.2);
          float r = nn(q);
          float rw = fwidth(r) * 1.1 + 0.004;
          float ripple = (1.0 - smoothstep(0.0, rw, abs(r - 0.5))) * smoothstep(0.62, 0.72, nn(vWorld * 0.35 - vec3(uTime * 0.05)));
          col = mix(col, uFoam, ripple * 0.75 * near);
          // Crisp glints instead of a soft highlight.
          float n = nn(vWorld * 0.9 + vec3(uTime * 0.25, 0.0, uTime * 0.18));
          float n2 = nn(vWorld * 2.3 - vec3(uTime * 0.3, uTime * 0.1, 0.0));
          vec3 nrm = normalize(up + vec3(n - 0.5, n2 - 0.5, (n + n2) * 0.5 - 0.5) * 0.3);
          vec3 h = normalize(uSunDir + viewDir);
          float spec = pow(max(dot(nrm, h), 0.0), 120.0);
          col = mix(col, uSunColor * 1.1 + vec3(0.1), step(0.45, spec) * (1.0 - uNight));
          // Sky reflection as one flat band at grazing angles.
          float fres = pow(1.0 - max(dot(up, viewDir), 0.0), 4.0);
          col = mix(col, mix(col, uSkyColor, 0.45), step(0.35, fres));
          // Shore: a solid foam band with a scalloped edge and a second, broken wave line offshore.
          float scallop = sin(dot(vWorld, vec3(2.1, 1.7, 2.4)) + uTime * 1.4) * 0.06;
          float fw = fwidth(vDepth) * 1.2 + 0.01;
          float foam = 1.0 - smoothstep(0.2 + scallop - fw, 0.2 + scallop + fw, vDepth);
          float wave = 0.5 + 0.5 * sin(uTime * 0.9);
          float waveLine = (1.0 - smoothstep(0.0, fw * 1.5, abs(vDepth - (0.35 + 0.25 * wave) + wob * 0.2)));
          waveLine *= step(0.4, nn(vWorld * 1.3 + uTime * 0.2)) * (1.0 - wave * 0.6);
          foam = max(foam, waveLine * 0.9);
          col = mix(col, uFoam, clamp(foam, 0.0, 1.0));
          col *= mix(1.0, 0.45, uNight);
          float alpha = mix(0.7, 0.95, smoothstep(0.0, 2.0, vDepth));
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
