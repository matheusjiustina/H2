import * as THREE from 'three';
import { angleDiff, dist2 } from '../core/util';
import { SEA } from '../world/layout';
import type { Npc } from '../entities/npcs';
import type { Game } from '../game';

export interface Weapon {
  id: string;
  name: string;
  dmg: number;
  speed: number;
  rate: number;
  mag: number;
  reload: number;
  grav: number;
  spread: number;
  color: number;
  size: number;
  aoe: number;
  cone?: boolean;
  unlock: string;
}

/** Deliberately silly, fictional arcade gear. */
export const WEAPONS: Weapon[] = [
  { id: 'golf', name: 'Nine-Iron Launcher', dmg: 24, speed: 48, rate: 0.42, mag: 8, reload: 1.1, grav: 4, spread: 0.008, color: 0xf7f4ea, size: 0.16, aoe: 0, unlock: 'Start' },
  { id: 'burger', name: 'Burger Blaster', dmg: 9, speed: 36, rate: 0.1, mag: 30, reload: 1.4, grav: 6, spread: 0.035, color: 0xd9a05a, size: 0.2, aoe: 0, unlock: 'Mission 04' },
  { id: 'order', name: 'Executive Order Cannon', dmg: 46, speed: 27, rate: 0.95, mag: 4, reload: 1.8, grav: 9, spread: 0.01, color: 0xf6ecd0, size: 0.34, aoe: 5, unlock: 'Mission 09' },
  { id: 'mega', name: 'The Megaphone', dmg: 14, speed: 0, rate: 1.2, mag: 6, reload: 1.6, grav: 0, spread: 0, color: 0xf2c94c, size: 0, aoe: 0, cone: true, unlock: 'Mission 11' },
];

interface Proj {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  life: number; dmg: number; grav: number; player: boolean; color: number; size: number; aoe: number; type: string;
}
interface Hazard {
  x: number; z: number; y: number; r: number; t: number; delay: number; dmg: number; label: string;
}
export interface Target {
  x: number; y: number; z: number; r: number; hp: number; max: number; alive: boolean; onHit?: (t: Target) => void; onDestroy: (t: Target) => void; tag: string;
}

const ENEMY: Record<string, { dmg: number; speed: number; color: number; size: number; grav: number; aoe: number }> = {
  tomato: { dmg: 6, speed: 19, color: 0xd43a34, size: 0.2, grav: 9, aoe: 0 },
  dart: { dmg: 8, speed: 30, color: 0xf2c94c, size: 0.12, grav: 1, aoe: 0 },
  paint: { dmg: 8, speed: 28, color: 0x4c9a5a, size: 0.14, grav: 2, aoe: 0 },
  gnome: { dmg: 10, speed: 17, color: 0xb8433a, size: 0.28, grav: 9, aoe: 0 },
  cone: { dmg: 9, speed: 20, color: 0xf2a0a8, size: 0.26, grav: 7, aoe: 0 },
  bomb: { dmg: 20, speed: 15, color: 0x23253a, size: 0.36, grav: 12, aoe: 4 },
};

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const v = new THREE.Vector3();
const s = new THREE.Vector3();
const col = new THREE.Color();
const near: Npc[] = [];

export class Combat {
  private projs: Proj[] = [];
  private mesh: THREE.InstancedMesh;
  private hazMesh: THREE.InstancedMesh;
  hazards: Hazard[] = [];
  targets: Target[] = [];
  group = new THREE.Group();

  constructor(private g: Game) {
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), 96);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    this.hazMesh = new THREE.InstancedMesh(
      new THREE.RingGeometry(0.86, 1, 28).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 }),
      24,
    );
    this.hazMesh.count = 0;
    this.hazMesh.frustumCulled = false;
    this.hazMesh.renderOrder = 5;
    this.group.add(this.hazMesh);
  }

  private add(p: Proj) {
    if (this.projs.length >= 96) this.projs.shift();
    this.projs.push(p);
  }

  /** Player fires along a direction from a muzzle point. */
  playerFire(w: Weapon, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number) {
    const g = this.g;
    if (w.cone) {
      // megaphone: a cone of pure opinion
      const yaw = Math.atan2(dx, dz);
      g.fx.emit(ox + dx * 2, oy, oz + dz * 2, 0xf2c94c, 16, 12, 0.3, 0.45, 0, 0.5, 0);
      g.fx.text(ox + dx * 3, oy + 0.6, oz + dz * 3, 'WRONG!', 'big');
      for (const n of g.npcs.near(ox, oz, 14, near)) {
        if (Math.abs(angleDiff(yaw, Math.atan2(n.x - ox, n.z - oz))) < 0.62) g.npcs.hurt(n, w.dmg, ox, oz, 10);
      }
      for (const t of this.targets) if (t.alive && dist2(t.x, t.z, ox, oz) < 12 * 12 && Math.abs(angleDiff(yaw, Math.atan2(t.x - ox, t.z - oz))) < 0.62) this.hitTarget(t, w.dmg);
      g.cam.shake = 0.25;
      return;
    }
    const sx = (Math.random() - 0.5) * 2 * w.spread, sy = (Math.random() - 0.5) * 2 * w.spread;
    this.add({
      x: ox, y: oy, z: oz, vx: (dx + sx * dz) * w.speed, vy: (dy + sy) * w.speed + w.grav * 0.12, vz: (dz - sx * dx) * w.speed,
      life: 2.4, dmg: w.dmg, grav: w.grav, player: true, color: w.color, size: w.size, aoe: w.aoe, type: w.id,
    });
  }

  /** An NPC lobs something at the player. */
  enemyShot(n: Npc, type: string) {
    const p = this.g.player;
    const tgt = p.vehicle ? p.vehicle : p.pos;
    this.shotAt(n.x, n.y + 1.5, n.z, tgt.x, tgt.y + 1.1, tgt.z, type, 0.06);
  }

  shotAt(x: number, y: number, z: number, tx: number, ty: number, tz: number, type: string, spread = 0) {
    const e = ENEMY[type] ?? ENEMY.tomato;
    const dx = tx - x, dy = ty - y, dz = tz - z;
    const d = Math.hypot(dx, dz) || 1;
    const t = d / e.speed;
    // ballistic lead so lobbed things land roughly on target
    this.add({
      x, y, z, vx: (dx / t) * (1 + (Math.random() - 0.5) * spread * 2), vy: dy / t + 0.5 * e.grav * t, vz: (dz / t) * (1 + (Math.random() - 0.5) * spread * 2),
      life: 4, dmg: e.dmg, grav: e.grav, player: false, color: e.color, size: e.size, aoe: e.aoe, type,
    });
    this.g.audio.play('throw', 0.35, x, z);
  }

  /** Telegraphed ground hazard (boss attacks): a ring shrinks, then it lands. */
  addHazard(x: number, z: number, r: number, delay: number, dmg: number, label = 'BONK!') {
    if (this.hazards.length >= 24) return;
    this.hazards.push({ x, z, y: this.g.world.groundAt(x, z, this.g.player.pos.y + 2), r, t: 0, delay, dmg, label });
  }

  addTarget(x: number, y: number, z: number, r: number, hp: number, tag: string, onDestroy: (t: Target) => void, onHit?: (t: Target) => void): Target {
    const t: Target = { x, y, z, r, hp, max: hp, alive: true, onDestroy, onHit, tag };
    this.targets.push(t);
    return t;
  }
  clearTargets(tag: string) {
    this.targets = this.targets.filter((t) => t.tag !== tag);
  }

  hitTarget(t: Target, dmg: number) {
    if (!t.alive) return;
    t.hp -= dmg;
    this.g.fx.emit(t.x, t.y + 1, t.z, 0xf2c94c, 6, 5, 0.2, 0.4);
    this.g.audio.play('clang', 0.6, t.x, t.z);
    t.onHit?.(t);
    if (t.hp <= 0) {
      t.alive = false;
      this.g.fx.boom(t.x, t.y + 1, t.z);
      this.g.audio.play('boom', 0.8, t.x, t.z);
      t.onDestroy(t);
    }
  }

  /** Player melee swing: everything in an arc in front. Returns true on contact. */
  melee(x: number, z: number, yaw: number, dmg: number, reach: number, knock: number): boolean {
    const g = this.g;
    let hit = false;
    for (const n of g.npcs.near(x, z, reach + 0.4, near)) {
      if (Math.abs(n.y - g.player.pos.y) > 1.8) continue;
      if (Math.abs(angleDiff(yaw, Math.atan2(n.x - x, n.z - z))) < 1.15) {
        g.npcs.hurt(n, dmg, x, z, knock);
        hit = true;
      }
    }
    for (const t of this.targets) {
      if (t.alive && dist2(t.x, t.z, x, z) < (reach + t.r) ** 2 && Math.abs(angleDiff(yaw, Math.atan2(t.x - x, t.z - z))) < 1.3) {
        this.hitTarget(t, dmg);
        hit = true;
      }
    }
    for (const veh of g.vehicles.list) {
      if (veh.mode === 'wreck' || dist2(veh.x, veh.z, x, z) > (reach + veh.radius) ** 2) continue;
      if (Math.abs(angleDiff(yaw, Math.atan2(veh.x - x, veh.z - z))) < 1.2) {
        g.vehicles.damage(veh, dmg * 0.25);
        g.fx.emit(x + Math.sin(yaw), g.player.pos.y + 1, z + Math.cos(yaw), 0xf2c94c, 4, 4, 0.18, 0.3);
        hit = true;
      }
    }
    return hit;
  }

  private impact(p: Proj) {
    const g = this.g;
    g.fx.splat(p.x, p.y, p.z, p.color);
    if (p.aoe > 0) {
      g.fx.boom(p.x, p.y, p.z);
      g.audio.play('boom', 0.6, p.x, p.z);
      if (p.player) {
        for (const n of g.npcs.near(p.x, p.z, p.aoe, near)) g.npcs.hurt(n, p.dmg, p.x, p.z, 9);
        for (const t of this.targets) if (t.alive && dist2(t.x, t.z, p.x, p.z) < (p.aoe + t.r) ** 2) this.hitTarget(t, p.dmg);
        g.fx.text(p.x, p.y + 1.5, p.z, 'SIGNED!', 'big');
      } else {
        const pl = g.player;
        if (dist2(pl.pos.x, pl.pos.z, p.x, p.z) < p.aoe * p.aoe) {
          if (pl.vehicle) g.vehicles.damage(pl.vehicle, p.dmg);
          else pl.hurt(p.dmg, 'blast', p.x, p.z);
        }
      }
    } else g.audio.play('splat', 0.4, p.x, p.z);
  }

  update(dt: number) {
    const g = this.g, w = g.world, pl = g.player;
    let n = 0;
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i];
      p.life -= dt;
      p.vy -= p.grav * dt;
      const steps = Math.max(1, Math.ceil((Math.hypot(p.vx, p.vy, p.vz) * dt) / 0.7));
      let dead = p.life <= 0;
      for (let k = 0; k < steps && !dead; k++) {
        p.x += (p.vx * dt) / steps;
        p.y += (p.vy * dt) / steps;
        p.z += (p.vz * dt) / steps;
        if (w.inside(p.x, p.y, p.z) || p.y < w.terrain.h(p.x, p.z) - 6 || (p.y < w.groundAt(p.x, p.z, p.y + 0.6, 0.6) && p.y > -8) || p.y < SEA - 0.2) {
          dead = true;
          this.impact(p);
          break;
        }
        if (p.player) {
          for (const e of g.npcs.near(p.x, p.z, 0.75 + p.size, near)) {
            if (p.y > e.y - 0.1 && p.y < e.y + 2.1) {
              if (p.aoe > 0) this.impact(p);
              else {
                g.npcs.hurt(e, p.dmg, p.x - p.vx, p.z - p.vz, p.type === 'golf' ? 6 : 3);
                g.fx.splat(p.x, p.y, p.z, p.color);
              }
              dead = true;
              break;
            }
          }
          if (!dead)
            for (const t of this.targets) {
              if (t.alive && dist2(t.x, t.z, p.x, p.z) < (t.r + p.size) ** 2 && p.y > t.y - 0.3 && p.y < t.y + 3.2) {
                if (p.aoe > 0) this.impact(p);
                else this.hitTarget(t, p.dmg);
                dead = true;
                break;
              }
            }
          if (!dead)
            for (const veh of g.vehicles.list) {
              if (veh === pl.vehicle || veh.mode === 'wreck') continue;
              if (dist2(veh.x, veh.z, p.x, p.z) < (veh.spec.wid * 0.7) ** 2 && p.y > veh.y && p.y < veh.y + veh.spec.hgt + 0.3) {
                g.vehicles.damage(veh, p.dmg * 0.6);
                if (veh.mode === 'police' || veh.mode === 'heliAI') g.heat.crime(0.1, 'attacking police');
                this.impact(p);
                dead = true;
                break;
              }
            }
        } else {
          const tx = pl.vehicle ? pl.vehicle.x : pl.pos.x, ty = pl.vehicle ? pl.vehicle.y : pl.pos.y, tz = pl.vehicle ? pl.vehicle.z : pl.pos.z;
          const r = pl.vehicle ? pl.vehicle.spec.wid * 0.7 : 0.55;
          if (dist2(tx, tz, p.x, p.z) < (r + p.size) ** 2 && p.y > ty - 0.1 && p.y < ty + (pl.vehicle ? pl.vehicle.spec.hgt : 1.95)) {
            if (p.aoe > 0) this.impact(p);
            else {
              if (pl.vehicle) g.vehicles.damage(pl.vehicle, p.dmg * 0.7);
              else pl.hurt(p.dmg, p.type, p.x - p.vx, p.z - p.vz);
              g.fx.splat(p.x, p.y, p.z, p.color);
            }
            dead = true;
          }
        }
      }
      if (dead) {
        this.projs[i] = this.projs[this.projs.length - 1];
        this.projs.pop();
      }
    }
    for (const p of this.projs) {
      m4.compose(v.set(p.x, p.y, p.z), q, s.setScalar(p.size));
      this.mesh.setMatrixAt(n, m4);
      this.mesh.setColorAt(n, col.setHex(p.color));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    // hazards
    let h = 0;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const z = this.hazards[i];
      z.t += dt;
      if (z.t >= z.delay) {
        g.fx.boom(z.x, z.y + 0.5, z.z);
        g.fx.text(z.x, z.y + 2, z.z, z.label, 'big');
        g.audio.play('boom', 0.7, z.x, z.z);
        if (dist2(pl.pos.x, pl.pos.z, z.x, z.z) < z.r * z.r && Math.abs(pl.pos.y - z.y) < 3) {
          if (pl.vehicle) g.vehicles.damage(pl.vehicle, z.dmg);
          else pl.hurt(z.dmg, 'hazard', z.x, z.z);
        }
        this.hazards.splice(i, 1);
      }
    }
    for (const z of this.hazards) {
      const k = z.t / z.delay;
      m4.compose(v.set(z.x, z.y + 0.12, z.z), q, s.setScalar(z.r * (1.15 - k * 0.15)));
      this.hazMesh.setMatrixAt(h, m4);
      this.hazMesh.setColorAt(h, col.setHex(Math.floor(z.t * (4 + k * 10)) % 2 ? 0xff3b30 : 0xf2c94c));
      h++;
    }
    this.hazMesh.count = h;
    this.hazMesh.instanceMatrix.needsUpdate = true;
    if (this.hazMesh.instanceColor) this.hazMesh.instanceColor.needsUpdate = true;
  }

  reset() {
    this.projs.length = 0;
    this.hazards.length = 0;
    this.targets.length = 0;
  }
}
