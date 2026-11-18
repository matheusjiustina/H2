import * as THREE from 'three';
import { TAU } from '../core/util';
import { MeshBuilder } from '../render/geo';
import { canvasTexture, M } from '../render/materials';
import type { World } from './world';

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const v = new THREE.Vector3();
const s = new THREE.Vector3();
const c = new THREE.Color();

function flagTexture() {
  return canvasTexture(256, 160, (g, W, H) => {
    for (let i = 0; i < 13; i++) {
      g.fillStyle = i % 2 ? '#f7f4ea' : '#d2222d';
      g.fillRect(0, (i * H) / 13, W, H / 13 + 1);
    }
    g.fillStyle = '#243f8f';
    g.fillRect(0, 0, W * 0.42, (H * 7) / 13);
    g.fillStyle = '#f7f4ea';
    for (let r = 0; r < 5; r++) for (let k = 0; k < 6; k++) {
      g.beginPath();
      g.arc(10 + k * 16 + (r % 2) * 8, 10 + r * 16, 3, 0, TAU);
      g.fill();
    }
  });
}

/** Animated set dressing: flags, street-lamp glow, traffic signals, ferris wheel, windmills. */
export class Dynamic {
  private flagUniform = { value: 0 };
  private lampPoints: THREE.Points | null = null;
  private lampMat: THREE.PointsMaterial | null = null;
  private pools: THREE.InstancedMesh | null = null;
  private signal: THREE.InstancedMesh | null = null;
  private signalT = 0;
  private wheel: THREE.Group | null = null;
  private gondolas: THREE.Mesh[] = [];
  private mills: THREE.Mesh[] = [];
  group = new THREE.Group();

  constructor(private w: World) {
    this.buildFlags();
    this.buildLamps();
    this.buildSignals();
    this.buildFerris();
    this.buildMills();
  }

  private buildFlags() {
    const flags = this.w.flags;
    if (!flags.length) return;
    const geo = new THREE.PlaneGeometry(2.4, 1.5, 8, 1).translate(1.2, -0.75, 0);
    const mat = new THREE.MeshBasicMaterial({ map: flagTexture(), side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.flagUniform;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.z += sin(transformed.x * 2.6 - uTime * 5.0 + instanceMatrix[3].x * 0.7) * 0.14 * transformed.x;\ntransformed.y += sin(transformed.x * 1.7 - uTime * 3.0) * 0.04 * transformed.x;');
    };
    const im = new THREE.InstancedMesh(geo, mat, flags.length);
    flags.forEach((f, i) => {
      q.setFromAxisAngle(v.set(0, 1, 0), f.rot);
      m4.compose(v.set(f.x, f.y, f.z), q, s.setScalar(f.s));
      im.setMatrixAt(i, m4);
    });
    im.frustumCulled = false;
    this.group.add(im);
  }

  private buildLamps() {
    const L = this.w.lamps;
    if (!L.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(L, 3));
    const tex = canvasTexture(64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,240,200,1)');
      gr.addColorStop(0.3, 'rgba(255,214,140,0.55)');
      gr.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
    });
    this.lampMat = new THREE.PointsMaterial({ map: tex, size: 5, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false });
    this.lampPoints = new THREE.Points(geo, this.lampMat);
    this.lampPoints.frustumCulled = false;
    this.lampPoints.renderOrder = 20;
    this.group.add(this.lampPoints);
    // light pools on the ground
    const n = L.length / 3;
    const pg = new THREE.CircleGeometry(5.5, 14).rotateX(-Math.PI / 2);
    const pm = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -10 });
    this.pools = new THREE.InstancedMesh(pg, pm, n);
    for (let i = 0; i < n; i++) {
      const x = L[i * 3], y = L[i * 3 + 1], z = L[i * 3 + 2];
      m4.makeTranslation(x, this.w.groundAt(x, z, y) + 0.09, z);
      this.pools.setMatrixAt(i, m4);
    }
    this.pools.frustumCulled = false;
    this.pools.renderOrder = 4;
    this.group.add(this.pools);
  }

  private buildSignals() {
    const heads = this.w.roads.signalHeads;
    if (!heads.length) return;
    const geo = new THREE.BoxGeometry(0.24, 0.24, 0.1);
    this.signal = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), heads.length * 3);
    heads.forEach((h, i) => {
      for (let k = 0; k < 3; k++) {
        q.setFromAxisAngle(v.set(0, 1, 0), Math.atan2(h.nx, h.nz));
        m4.compose(v.set(h.x + h.nx * 0.2, h.y + 0.33 - k * 0.33, h.z + h.nz * 0.2), q, s.setScalar(1));
        this.signal!.setMatrixAt(i * 3 + k, m4);
        this.signal!.setColorAt(i * 3 + k, c.setHex(0x222222));
      }
    });
    this.signal.frustumCulled = false;
    this.group.add(this.signal);
  }

  private buildFerris() {
    const f = this.w.ferris;
    if (!f) return;
    const b = new MeshBuilder();
    const N = 12, R = f.r;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * TAU, a1 = ((i + 1) / N) * TAU;
      const x0 = Math.cos(a0) * R, y0 = Math.sin(a0) * R, x1 = Math.cos(a1) * R, y1 = Math.sin(a1) * R;
      for (const z of [-1.6, 1.6]) {
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        const len = Math.hypot(x1 - x0, y1 - y0);
        const ang = Math.atan2(y1 - y0, x1 - x0);
        // rim segment: thin box rotated in the wheel plane
        const cs = Math.cos(ang), sn = Math.sin(ang), h = 0.2;
        const P = (lx: number, ly: number, lz: number): [number, number, number] => [mx + lx * cs - ly * sn, my + lx * sn + ly * cs, z + lz];
        const A = P(-len / 2, -h, 0), B = P(len / 2, -h, 0), C2 = P(len / 2, h, 0), D = P(-len / 2, h, 0);
        b.quad(...A, ...B, ...C2, ...D, i % 2 ? 0xd43a34 : 0xf7f4ea);
        b.quad(...B, ...A, ...D, ...C2, i % 2 ? 0xd43a34 : 0xf7f4ea);
        // spoke
        const sa = Math.cos(a0), sb = Math.sin(a0);
        const S0: [number, number, number] = [-sb * 0.1, sa * 0.1, z], S1: [number, number, number] = [sb * 0.1, -sa * 0.1, z];
        const S2: [number, number, number] = [x0 + sb * 0.1, y0 - sa * 0.1, z], S3: [number, number, number] = [x0 - sb * 0.1, y0 + sa * 0.1, z];
        b.quad(...S0, ...S1, ...S2, ...S3, 0xf7f4ea);
        b.quad(...S1, ...S0, ...S3, ...S2, 0xf7f4ea);
      }
      b.box(Math.cos(a0) * R, Math.sin(a0) * R, 0, 0.16, 0.16, 3.2, 0x8b93a6, 0, 0);
    }
    const mesh = new THREE.Mesh(b.build(), M.actor);
    mesh.castShadow = true;
    this.wheel = new THREE.Group();
    this.wheel.add(mesh);
    this.wheel.position.set(f.x, f.y, f.z);
    this.group.add(this.wheel);
    const gb = new MeshBuilder();
    gb.box(0, -1.3, 0, 1.8, 1.4, 2, 0xf7f4ea, 0, 0);
    gb.box(0, -0.45, 0, 2.1, 0.2, 2.3, 0xd43a34, 0, 0);
    gb.box(0, -1.75, 0, 1.84, 0.5, 2.04, 0x2f5fa8, 0, 4 | 8);
    const gg = gb.build();
    for (let i = 0; i < N; i++) {
      const g = new THREE.Mesh(gg, M.actor);
      g.castShadow = true;
      this.gondolas.push(g);
      this.group.add(g);
    }
  }

  private buildMills() {
    if (!this.w.windmills.length) return;
    const b = new MeshBuilder();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU, a2 = a + 0.36;
      b.quad(Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0, Math.cos(a2) * 0.4, Math.sin(a2) * 0.4, 0, Math.cos(a2) * 2.3, Math.sin(a2) * 2.3, 0.2, Math.cos(a) * 2.3, Math.sin(a) * 2.3, 0, 0xcfd6dc);
      b.quad(Math.cos(a2) * 0.4, Math.sin(a2) * 0.4, 0, Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0, Math.cos(a) * 2.3, Math.sin(a) * 2.3, 0, Math.cos(a2) * 2.3, Math.sin(a2) * 2.3, 0.2, 0x9aa2b0);
    }
    b.box(0, 0, 0, 0.5, 0.5, 0.3, 0x8b93a6, 0, 0);
    const geo = b.build();
    for (const w of this.w.windmills) {
      const m = new THREE.Mesh(geo, M.actor);
      m.position.set(w.x, w.y, w.z);
      m.castShadow = true;
      this.mills.push(m);
      this.group.add(m);
      // tail vane
      const tv = new MeshBuilder();
      tv.box(0, 0, -2, 0.06, 1, 1.4, 0xd43a34, 0, 0);
      tv.box(0, 0, -1, 0.08, 0.08, 1.4, 0x8b93a6, 0, 0);
      const t = new THREE.Mesh(tv.build(), M.actor);
      t.position.set(w.x, w.y, w.z - 1);
      this.group.add(t);
    }
  }

  update(time: number, dt: number, night: number, effects: boolean) {
    this.flagUniform.value = time;
    if (this.lampMat) {
      const g = Math.max(0, Math.min(1, (night - 0.25) * 1.6));
      this.lampMat.opacity = g;
      this.lampPoints!.visible = g > 0.01;
      (this.pools!.material as THREE.MeshBasicMaterial).opacity = g * 0.2;
      this.pools!.visible = g > 0.01 && effects;
    }
    this.signalT -= dt;
    if (this.signal && this.signalT <= 0) {
      this.signalT = 0.25;
      const heads = this.w.roads.signalHeads;
      for (let i = 0; i < heads.length; i++) {
        const st = this.w.roads.signalFor(heads[i].node, heads[i].ns, time);
        this.signal.setColorAt(i * 3, c.setHex(st === 'red' ? 0xff3b30 : 0x3a1512));
        this.signal.setColorAt(i * 3 + 1, c.setHex(st === 'yellow' ? 0xffc430 : 0x3a2e10));
        this.signal.setColorAt(i * 3 + 2, c.setHex(st === 'green' ? 0x3fe070 : 0x103a1c));
      }
      this.signal.instanceColor!.needsUpdate = true;
    }
    const f = this.w.ferris;
    if (this.wheel && f) {
      const a = time * 0.12;
      this.wheel.rotation.z = a;
      for (let i = 0; i < this.gondolas.length; i++) {
        const ang = a + (i / this.gondolas.length) * TAU;
        this.gondolas[i].position.set(f.x + Math.cos(ang) * f.r, f.y + Math.sin(ang) * f.r, f.z);
      }
    }
    for (let i = 0; i < this.mills.length; i++) this.mills[i].rotation.z = time * (1.4 + (i % 3) * 0.3);
  }
}
