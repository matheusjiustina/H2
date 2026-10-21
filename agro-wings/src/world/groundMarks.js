// Ground surface effects: subtle tyre marks on bare earth (strips, aprons,
// farm roads, fallow), left by the aircraft wheels and the service truck.
// One instanced draw for every mark: a fixed pool of thin quads reused as a
// ring buffer, each fading out over a few minutes (age in the shader, no
// per-frame buffer writes except for the marks just laid).
import * as THREE from 'three';

const POOL = 1400;
const LIFE = 240; // s until a mark has faded
const STEP = 0.7; // m of travel per segment

const VERT = /* glsl */ `
attribute float aBirth;
attribute float aAlpha;
uniform float uTime;
uniform vec3 uCam;
varying float vA;
varying vec2 vUv;
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  float age = (uTime - aBirth) / ${LIFE.toFixed(1)};
  float far = 1.0 - smoothstep(180.0, 320.0, distance(wp.xyz, uCam));
  vA = aAlpha * clamp(1.0 - age, 0.0, 1.0) * far;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vA;
varying vec2 vUv;
void main() {
  // Soft edges across the tread, a little breakup along it.
  float e = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
  float tread = 0.75 + 0.25 * step(0.5, fract(vUv.y * 3.0));
  float a = vA * e * tread;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
}`;

export class GroundMarks {
  constructor(scene, terrain) {
    this.terrain = terrain;
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
    this.birth = new Float32Array(POOL).fill(-1e6);
    this.alpha = new Float32Array(POOL);
    geo.setAttribute('aBirth', new THREE.InstancedBufferAttribute(this.birth, 1));
    geo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color(0.16, 0.08, 0.045) } },
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, POOL);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < POOL; i++) this.mesh.setMatrixAt(i, m);
    scene.add(this.mesh);
    this.head = 0;
    this.time = 0;
    this.wheels = new Map(); // id -> last point
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
    this._dirty = false;
  }

  // A wheel at (x, z) rolling (onGround) over surface s; width in m.
  wheel(id, x, z, onGround, s, width = 0.22, strength = 1) {
    const bare = s === 'dirt' || s === 'runway';
    const last = this.wheels.get(id);
    if (!onGround || !bare) { if (last) this.wheels.delete(id); return; }
    if (!last) { this.wheels.set(id, { x, z }); return; }
    const dx = x - last.x, dz = z - last.z, d = Math.hypot(dx, dz);
    if (d < STEP) return;
    if (d > 6) { last.x = x; last.z = z; return; } // teleported
    const i = this.head;
    this.head = (this.head + 1) % POOL;
    const T = this.terrain;
    const y = T.heightAt(last.x, last.z) + 0.03;
    const y2 = T.heightAt(x, z) + 0.03;
    this._q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this._p.set(dx, y2 - y, dz).normalize());
    this._m.compose(this._p.set(last.x, y, last.z), this._q, this._s.set(width, 1, d + 0.05));
    this.mesh.setMatrixAt(i, this._m);
    this.birth[i] = this.time;
    this.alpha[i] = (s === 'runway' ? 0.16 : 0.26) * strength;
    this._dirty = true;
    last.x = x; last.z = z;
  }

  update(dt, cam) {
    this.time += dt;
    this.mat.uniforms.uTime.value = this.time;
    this.mat.uniforms.uCam.value.copy(cam.position);
    if (this._dirty) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.geometry.attributes.aBirth.needsUpdate = true;
      this.mesh.geometry.attributes.aAlpha.needsUpdate = true;
      this._dirty = false;
    }
  }
}
