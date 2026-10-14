// Service hose: Verlet rope from a reel to a free end (hand or aircraft port)
// with gravity, ground contact and friction, keep-out boxes (wing, tail) so
// it never passes through the aircraft, and a tube mesh rebuilt per frame.
import * as THREE from 'three';

const N = 34;

export class Hose {
  constructor(scene, color, radius = 0.032) {
    this.p = [];
    this.o = [];
    for (let i = 0; i < N; i++) { this.p.push(new THREE.Vector3()); this.o.push(new THREE.Vector3()); }
    this.anchor = new THREE.Vector3();
    this.end = new THREE.Vector3();
    this.length = 1.2;
    this.radius = radius;
    this.mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.curve = new THREE.CatmullRomCurve3(this.p.map((v) => v.clone()));
    this.boxes = []; // world-space test fn list: (v) => pushes v out
    this.stowed = true;
    this.coil = null;
  }

  reset(anchor) {
    this.anchor.copy(anchor);
    for (let i = 0; i < N; i++) {
      this.p[i].copy(anchor).add(new THREE.Vector3(0, -i * 0.02, 0));
      this.o[i].copy(this.p[i]);
    }
    this.end.copy(anchor);
  }

  // ground(x,z) -> y ; keepOut(v) -> mutates v out of solids
  step(dt, ground, keepOut) {
    const seg = this.length / (N - 1);
    const g = -9.81 * dt * dt;
    for (let i = 1; i < N - 1; i++) {
      const p = this.p[i], o = this.o[i];
      const vx = (p.x - o.x) * 0.96, vy = (p.y - o.y) * 0.96, vz = (p.z - o.z) * 0.96;
      o.copy(p);
      p.x += vx; p.y += vy + g; p.z += vz;
    }
    this.p[0].copy(this.anchor);
    this.p[N - 1].copy(this.end);
    for (let it = 0; it < 14; it++) {
      for (let i = 0; i < N - 1; i++) {
        const a = this.p[i], b = this.p[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const diff = (d - seg) / d;
        const wa = i === 0 ? 0 : 0.5, wb = i + 1 === N - 1 ? 0 : 0.5;
        const s = wa + wb;
        if (s === 0) continue;
        a.x += dx * diff * (wa / s); a.y += dy * diff * (wa / s); a.z += dz * diff * (wa / s);
        b.x -= dx * diff * (wb / s); b.y -= dy * diff * (wb / s); b.z -= dz * diff * (wb / s);
      }
      for (let i = 1; i < N - 1; i++) {
        const p = this.p[i];
        const gy = ground(p.x, p.z) + this.radius;
        if (p.y < gy) {
          p.y = gy;
          // Ground friction
          const o = this.o[i];
          o.x = p.x + (o.x - p.x) * 0.4;
          o.z = p.z + (o.z - p.z) * 0.4;
        }
        if (keepOut) keepOut(p);
      }
    }
  }

  // Length needed to reach the end with a little slack.
  autoLength(slack = 1.15, min = 1.2) {
    const d = this.anchor.distanceTo(this.end);
    this.length = Math.max(min, d * slack + 0.8);
  }

  rebuild() {
    for (let i = 0; i < N; i++) this.curve.points[i].copy(this.p[i]);
    const geo = new THREE.TubeGeometry(this.curve, N * 2, this.radius, 6, false);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
  }
}
