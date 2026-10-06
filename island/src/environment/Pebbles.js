import * as THREE from 'three';
import { LAYER } from '../core/Shared.js';
import { rng } from '../utils/MathUtils.js';
import { ObjectPool } from '../utils/ObjectPool.js';

const G = 9.81;

/**
 * Throwable pebbles: projectile physics with terrain bounces, stone skipping on
 * water, splash particles + ripple displacement + sound, sinking to the seabed,
 * and pebble piles on the beach to pick from.
 */
export class Pebbles {
  constructor({ scene, materials, terrainData, ocean, collision, particles, ripples, interaction, audio }) {
    this.scene = scene;
    this.td = terrainData;
    this.ocean = ocean;
    this.collision = collision;
    this.particles = particles;
    this.ripples = ripples;
    this.interaction = interaction;
    this.audio = audio;
    this.geo = new THREE.SphereGeometry(0.03, 10, 7);
    this.geo.scale(1.25, 0.55, 1);
    this.mat = materials.pebble;
    this.active = [];
    this.resting = [];
    this.pool = new ObjectPool(() => {
      const m = new THREE.Mesh(this.geo, this.mat);
      m.castShadow = true;
      m.receiveShadow = true;
      m.layers.set(LAYER.DETAIL);
      return m;
    }, 16);
    this._buildPiles(materials);
    this.acc = 0;
  }

  _buildPiles(M) {
    // a few hand-placed pebble piles along the beach in front of the camp + driftwood point
    const piles = [[-2.2, -14.5], [12.5, -16.5], [-24, -17], [-288, -40], [-170, -22]];
    const r = rng(81);
    this.piles = [];
    const geo = this.geo;
    for (const [x, z] of piles) {
      const g = new THREE.Group();
      const y = this.td.heightAt(x, z);
      g.position.set(x, y, z);
      const n = 9 + Math.floor(r() * 6);
      const inst = new THREE.InstancedMesh(geo, M.pebble, n);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.32;
        const s = 0.7 + r() * 0.8;
        m4.compose(new THREE.Vector3(Math.cos(a) * d, 0.006 + (1 - d / 0.32) * 0.02, Math.sin(a) * d), new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.4, r() * 6, (r() - 0.5) * 0.4)), new THREE.Vector3(s, s, s));
        inst.setMatrixAt(i, m4);
        inst.setColorAt(i, new THREE.Color().setHSL(0.08 + r() * 0.05, 0.08 + r() * 0.1, 0.45 + r() * 0.3));
      }
      inst.castShadow = true;
      inst.receiveShadow = true;
      inst.layers.set(LAYER.DETAIL);
      g.add(inst);
      this.scene.add(g);
      this.piles.push(g);
      this.interaction.add({
        object: g, name: 'pebbles', interactionLabel: 'Pick up pebble', interactionDistance: 3.0, boxPadding: 0.15,
        onInteract: (game) => {
          if (game.inventory.count('pebble') >= 8) { game.toast('Pockets are full of pebbles.'); return; }
          game.rig.play('grab', { target: g.position.clone(), duration: 0.6, onPeak: () => { game.inventory.add('pebble', 1); game.audio?.play('pebble'); } });
        },
      });
    }
  }

  throw(origin, vel) {
    const m = this.pool.acquire();
    m.position.copy(origin);
    m.rotation.set(Math.random(), Math.random(), Math.random());
    this.scene.add(m);
    this.active.push({ mesh: m, vel: vel.clone(), spin: new THREE.Vector3(Math.random() * 20, Math.random() * 30, Math.random() * 20), skips: 0, inWater: false, life: 0, settled: 0 });
  }

  update(dt, game) {
    this.acc = Math.min(this.acc + dt, 0.1);
    const step = 1 / 120;
    while (this.acc >= step) {
      this.acc -= step;
      this._step(step, game);
    }
    for (const p of this.active) {
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.rotation.z += p.spin.z * dt;
    }
  }

  _step(dt, game) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      const pos = p.mesh.position;
      p.life += dt;
      if (!p.inWater) {
        p.vel.y -= G * dt;
        p.vel.multiplyScalar(1 - 0.02 * dt);
        const prevY = pos.y;
        pos.addScaledVector(p.vel, dt);
        const wy = this.ocean.heightAt(pos.x, pos.z);
        const gy = this.td.heightAt(pos.x, pos.z);
        // solid props
        const hit = this.collision.pointInside(pos.x, pos.y, pos.z, 0.02);
        if (hit) {
          pos.addScaledVector(p.vel, -dt);
          p.vel.x *= -0.35; p.vel.z *= -0.35; p.vel.y *= 0.4;
          this.audio?.play('knock', { position: pos.clone(), volume: Math.min(1, p.vel.length() / 8) });
          continue;
        }
        if (pos.y <= wy && prevY > wy - 0.05 && wy > gy + 0.05) {
          // water entry: skip or splash
          const speed = Math.hypot(p.vel.x, p.vel.z);
          const angle = Math.atan2(-p.vel.y, speed);
          const depth = wy - gy;
          if (speed > 6 && angle < 0.36 && p.skips < 5 && depth > 0.25) {
            p.skips++;
            p.vel.y = Math.abs(p.vel.y) * 0.55 + 0.6;
            p.vel.x *= 0.78; p.vel.z *= 0.78;
            pos.y = wy + 0.01;
            this.particles.splash(pos.x, wy, pos.z, 0.25);
            this.ripples.addDrop(pos.x, pos.z, 0.25, 0.12);
            this.audio?.play('skip', { position: pos.clone() });
            game.onPebbleSkip?.(p.skips);
          } else {
            p.inWater = true;
            const strength = Math.min(1.4, p.vel.length() / 12);
            this.particles.splash(pos.x, wy, pos.z, 0.5 + strength * 0.6);
            this.ripples.addDrop(pos.x, pos.z, 0.35, 0.28 * (0.5 + strength));
            this.audio?.play('splash', { position: pos.clone(), volume: 0.6 + strength * 0.4 });
            p.vel.multiplyScalar(0.25);
          }
        } else if (pos.y <= gy + 0.012) {
          // bounce on land
          pos.y = gy + 0.012;
          const n = this.td.normalAt(pos.x, pos.z, new THREE.Vector3());
          const vn = p.vel.dot(n);
          if (vn < 0) p.vel.addScaledVector(n, -vn * 1.35);
          p.vel.multiplyScalar(0.55);
          const s = this.td.splatAt(pos.x, pos.z, {});
          if (Math.abs(vn) > 1.5) {
            this.audio?.play(s.sand > 0.5 ? 'thudSand' : 'knock', { position: pos.clone(), volume: Math.min(1, Math.abs(vn) / 8) });
            if (s.sand > 0.5) this.particles.sandPuff(pos.x, gy, pos.z, 1);
          }
          if (p.vel.lengthSq() < 0.05) this._rest(i, p, game, false);
        }
        if (p.life > 12) this._rest(i, p, game, false);
      } else {
        // sinking
        p.vel.y -= 2.4 * dt;
        p.vel.multiplyScalar(Math.exp(-3.2 * dt));
        pos.addScaledVector(p.vel, dt);
        if (Math.random() < dt * 12) this.particles.spawn({ pos: { x: pos.x, y: pos.y, z: pos.z }, vel: { x: 0, y: 0.6, z: 0 }, life: 1, size: 0.008, color: [0.9, 1, 1], alpha: 0.6, kind: 1, buoy: this.ocean.heightAt(pos.x, pos.z) - 0.02 });
        const gy = this.td.heightAt(pos.x, pos.z);
        if (pos.y <= gy + 0.012) { pos.y = gy + 0.012; this._rest(i, p, game, true); }
      }
    }
  }

  _rest(i, p, game, underwater) {
    this.active.splice(i, 1);
    const m = p.mesh;
    const it = this.interaction.add({
      object: m, name: 'pebble', interactionLabel: 'Pick up pebble', interactionDistance: 3.0, boxPadding: 0.15,
      onInteract: (g) => {
        g.rig.play('grab', { target: m.position.clone(), duration: 0.55, onPeak: () => {
          g.inventory.add('pebble', 1);
          g.audio?.play('pebble');
          this.interaction.remove(it);
          this.scene.remove(m);
          this.pool.release(m);
          const k = this.resting.indexOf(rec);
          if (k >= 0) this.resting.splice(k, 1);
        } });
      },
    });
    const rec = { mesh: m, it, underwater };
    this.resting.push(rec);
    // cap resting pebbles
    if (this.resting.length > 24) {
      const old = this.resting.shift();
      this.interaction.remove(old.it);
      this.scene.remove(old.mesh);
      this.pool.release(old.mesh);
    }
  }
}
