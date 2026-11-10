import * as THREE from 'three';
import { el } from '../core/util';

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number; size: number; grav: number; grow: number;
  r: number; g: number; b: number;
}

interface Floater {
  x: number; y: number; z: number; life: number; el: HTMLElement;
}

const CAP = 420;
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const v3 = new THREE.Vector3();
const s3 = new THREE.Vector3();
const col = new THREE.Color();

/** Pooled particles (one instanced mesh) plus comic "POW!" floating text. */
export class Fx {
  private mesh: THREE.InstancedMesh;
  private parts: Particle[] = [];
  private floaters: Floater[] = [];
  private layer: HTMLElement;
  density = 1;

  constructor(scene: THREE.Scene, ui: HTMLElement) {
    const geo = new THREE.OctahedronGeometry(0.5, 0);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), CAP);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.layer = el('div', 'floaters', '', ui);
  }

  emit(x: number, y: number, z: number, color: number, n: number, speed: number, size: number, life = 0.6, grav = 9, grow = -1, up = 0.5) {
    n = Math.max(1, Math.round(n * this.density));
    col.setHex(color);
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= CAP) this.parts.shift();
      const a = Math.random() * Math.PI * 2, e = Math.random() * 2 - 1 + up;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.parts.push({
        x, y, z, vx: Math.cos(a) * s, vy: e * s, vz: Math.sin(a) * s,
        life: life * (0.6 + Math.random() * 0.4), max: life, size: size * (0.6 + Math.random() * 0.6), grav, grow,
        r: col.r, g: col.g, b: col.b,
      });
    }
  }
  puff(x: number, y: number, z: number, color = 0xf6ecd0, n = 8) {
    this.emit(x, y, z, color, n, 2.2, 0.5, 0.7, -0.6, 1.2, 0.6);
  }
  stars(x: number, y: number, z: number) {
    this.emit(x, y, z, 0xf2c94c, 7, 4, 0.28, 0.7, 6, -1, 1);
  }
  splat(x: number, y: number, z: number, color: number) {
    this.emit(x, y, z, color, 9, 4.5, 0.26, 0.5, 14, -1, 0.3);
  }
  smoke(x: number, y: number, z: number, dark = false) {
    this.emit(x, y, z, dark ? 0x3a3d55 : 0xb9bcc4, 1, 0.8, 0.7, 1.1, -1.6, 1.4, 1);
  }
  boom(x: number, y: number, z: number) {
    this.emit(x, y, z, 0xf2c94c, 14, 9, 0.7, 0.5, 4, -1, 0.4);
    this.emit(x, y, z, 0xee8a3a, 12, 6, 0.9, 0.7, 2, 0.5, 0.6);
    this.emit(x, y + 0.5, z, 0x3a3d55, 10, 3, 1.2, 1.4, -1.2, 1.2, 1);
  }
  confetti(x: number, y: number, z: number) {
    for (const c of [0xd43a34, 0xf7f4ea, 0x2f5fa8, 0xf2c94c]) this.emit(x, y, z, c, 10, 7, 0.22, 1.6, 5, 0, 1.2);
  }

  /** Comic text that floats up from a world position. */
  text(x: number, y: number, z: number, str: string, cls = '') {
    if (this.floaters.length > 14) {
      const f = this.floaters.shift()!;
      f.el.remove();
    }
    const e = el('div', 'floater ' + cls, str, this.layer);
    this.floaters.push({ x, y, z, life: 1.3, el: e });
  }

  update(dt: number, camera: THREE.Camera, w: number, h: number) {
    let n = 0;
    q.copy(camera.quaternion);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts[i] = this.parts[this.parts.length - 1];
        this.parts.pop();
        continue;
      }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.size = Math.max(0.02, p.size + p.grow * p.size * dt);
    }
    for (const p of this.parts) {
      const k = Math.min(1, p.life / (p.max * 0.4));
      s3.setScalar(p.size * k);
      v3.set(p.x, p.y, p.z);
      m4.compose(v3, q, s3);
      this.mesh.setMatrixAt(n, m4);
      this.mesh.setColorAt(n, col.setRGB(p.r, p.g, p.b));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.y += dt * 1.2;
      if (f.life <= 0) {
        f.el.remove();
        this.floaters.splice(i, 1);
        continue;
      }
      v3.set(f.x, f.y, f.z).project(camera);
      if (v3.z > 1) {
        f.el.style.display = 'none';
        continue;
      }
      f.el.style.display = '';
      f.el.style.transform = `translate(${((v3.x + 1) / 2) * w}px, ${((1 - v3.y) / 2) * h}px) translate(-50%, -50%) scale(${0.8 + (1.3 - f.life) * 0.35})`;
      f.el.style.opacity = String(Math.min(1, f.life * 2.5));
    }
  }

  clear() {
    this.parts.length = 0;
    for (const f of this.floaters) f.el.remove();
    this.floaters.length = 0;
  }
}
