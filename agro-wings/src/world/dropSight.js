// Drop sight (Fire Boss): where water released NOW would reach the ground —
// a thin ring the size of the footprint it would wet, ahead of the aircraft
// (the water keeps the aircraft's forward speed while it falls). Same
// falling-water physics as the fire field (fallStep). Shown only with water
// on board, in the air, near a burning spot; green when the footprint is on
// it. One unlit ring, one draw call while shown, predicted ten times a
// second (Settings → Spray assistance → Drop sight).
import * as THREE from 'three';
import { fallStep, FOOT0, FOOTK, inSpotPatch } from './fires.js';

const _v = new THREE.Vector3();

export class DropSight {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
    this.mesh = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 56).rotateX(-Math.PI / 2), this.mat);
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
    this.mesh.visible = true;
    this.mesh.position.set(hit.x, hit.y + 0.6, hit.z);
    this.mesh.scale.setScalar(hit.r);
    const onFire = fires.fires.some((f) => f.state === 'burning' && inSpotPatch(f, hit.x, hit.z));
    this.mat.color.setHex(onFire ? 0x5cff8a : 0xffffff);
  }

  _fireNear(ac, fires) {
    const p = ac.fm.pos;
    return fires.fires.some((f) => f.state === 'burning' && Math.hypot(f.x - p.x, f.z - p.z) < 900 + (f.br ?? f.r));
  }
}
