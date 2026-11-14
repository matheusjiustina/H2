// Drop sight (Fire Boss): where the water on board would land if the door
// opened NOW — an outline of the whole pattern on the ground, ahead of the
// aircraft (the water keeps the aircraft's forward speed while it falls):
// it starts where the first litres land and runs along the track for as
// long as the load takes to go (litres / door rate × ground speed), as wide
// as the footprint. Same falling-water physics as the fire field
// (fallStep). Shown only with water on board, in the air, near a burning
// spot; green when the pattern covers a burning spot's centre. One unlit
// outline, one draw call while shown, predicted ten times a second
// (Settings → Spray assistance → Drop sight).
import * as THREE from 'three';
import { fallStep, FOOT0, FOOTK } from './fires.js';

const _v = new THREE.Vector3();
const SEG = 48, W = 0.8;

export class DropSight {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
    // A flat outline (ellipse ribbon, 0.8 m wide), rewritten when shown.
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array((SEG + 1) * 2 * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const idx = [];
    for (let i = 0; i < SEG; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.visible = false;
    this.mesh.renderOrder = 18;
    this.mesh.frustumCulled = false;
    game.scene.add(this.mesh);
    this.p = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0 };
    this.hit = null;
  }

  // Predicted impact for water released now (null if none).
  predict(ac, wind) {
    const fm = ac.fm, T = this.game.world.terrain, p = this.p;
    const dp = ac.model.dropPoint;
    if (!dp) return null;
    _v.copy(dp).applyQuaternion(fm.quat).add(fm.pos);
    Object.assign(p, { x: _v.x, y: _v.y, z: _v.z, vx: fm.vel.x, vy: fm.vel.y, vz: fm.vel.z, age: 0 });
    for (let i = 0; i < 400; i++) {
      fallStep(p, wind, 0.03);
      const gy = T.heightAt(p.x, p.z);
      if (p.y <= gy + 0.5) return { x: p.x, z: p.z, y: gy, r: FOOT0 + p.age * FOOTK };
    }
    return null;
  }

  update(dt) {
    const g = this.game, ac = g.aircraft, fires = g.fires;
    const on = g.settings.dropSight !== false && g.playing && ac.water && ac.state === 'ok' && fires?.active
      && ac.fm.hopper > 50 && !ac.fm.out.onGround && ac.fm.out.agl < 200 && this._fireNear(ac, fires);
    if (!on) { this.mesh.visible = false; return; }
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.1;
    const hit = this.predict(ac, ac.windVec);
    if (!hit) { this.mesh.visible = false; return; }
    this.hit = hit;
    // The pattern: from the first impact along the ground track, the load's
    // length at this ground speed.
    const fm = ac.fm, gs = Math.hypot(fm.vel.x, fm.vel.z) || 1, ux = fm.vel.x / gs, uz = fm.vel.z / gs;
    const len = Math.min(400, gs * fm.hopper / ac.A.firefight.dropRate);
    const half = len / 2, cx = hit.x + ux * half, cz = hit.z + uz * half;
    this.mesh.visible = true;
    this.mesh.position.set(cx, this.game.world.terrain.heightAt(cx, cz) + 0.6, cz);
    this.mesh.rotation.y = Math.atan2(ux, uz);
    this._outline(hit.r, half + hit.r);
    // Green when a burning spot's centre lies in the middle of the pattern
    // (open the door now and the load straddles it).
    const onFire = fires.fires.some((f) => {
      if (f.state !== 'burning') return false;
      const dx = f.x - cx, dz = f.z - cz, a = dx * ux + dz * uz, l = -dx * uz + dz * ux;
      return Math.abs(a) < Math.max(hit.r * 0.6, half * 0.45) && Math.abs(l) < hit.r * 0.7; // (the middle of the pattern)
    });
    this.mat.color.setHex(onFire ? 0x5cff8a : 0xffffff);
  }

  // Ellipse ribbon, semi-axes b (across) and a (along, local +z).
  _outline(b, a) {
    const P = this.pos;
    for (let i = 0; i <= SEG; i++) {
      const t = (i / SEG) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
      P.set([b * c, 0, a * s, (b - W) * c, 0, (a - W) * s], i * 6);
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }

  _fireNear(ac, fires) {
    const p = ac.fm.pos;
    return fires.fires.some((f) => f.state === 'burning' && Math.hypot(f.x - p.x, f.z - p.z) < 900 + (f.br ?? f.r));
  }
}
