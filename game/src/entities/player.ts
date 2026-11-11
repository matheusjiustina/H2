import * as THREE from 'three';
import { angleDiff, clamp, damp, dampAngle, dist2 } from '../core/util';
import { MeshBuilder } from '../render/geo';
import { M } from '../render/materials';
import { SEA } from '../world/layout';
import { WEAPONS } from '../systems/combat';
import type { Game } from '../game';
import { AnimMode, buildParachute, CharacterRig, OUTFITS } from './character';
import type { Vehicle } from './vehicles';

export type PState = 'foot' | 'chute' | 'swim' | 'vehicle' | 'down' | 'climb' | 'frozen';

const tmp = { x: 0, z: 0 };
const dir = new THREE.Vector3();

export class Player {
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  heading = 0;
  state: PState = 'foot';
  rig: CharacterRig;
  chute: THREE.Group;
  health = 100;
  maxHealth = 100;
  vehicle: Vehicle | null = null;
  grounded = true;
  crouching = false;
  aiming = false;
  sprinting = false;
  invuln = 0;
  // combat
  weapon = 0;
  ammo: number[] = WEAPONS.map((w) => w.mag);
  reloadT = 0;
  private fireT = 0;
  private combo = 0;
  private attackT = -1;
  private attackHit = false;
  private comboWindow = 0;
  private dodgeT = -1;
  private dodgeCool = 0;
  private dodgeDir = { x: 0, z: 0 };
  private hitT = 0;
  private landT = 0;
  private fallStart = 0;
  private lastDamage = 0;
  private climb = { t: 0, x: 0, y: 0, z: 0, sx: 0, sy: 0, sz: 0 };
  private downT = 0;
  private enterT = 0;
  private stepT = 0;
  private anim: AnimMode = 'idle';
  private held: THREE.Mesh;
  private kx = 0;
  private kz = 0;
  lastSource = '';
  /** Free-fall deploy prompt. */
  canDeploy = false;
  victoryT = 0;

  constructor(private g: Game) {
    this.rig = new CharacterRig(OUTFITS[g.save.outfit]?.spec ?? OUTFITS.president.spec);
    this.chute = buildParachute();
    this.chute.visible = false;
    this.rig.root.add(this.chute);
    const hb = new MeshBuilder();
    hb.box(0, 0, 0.18, 0.09, 0.09, 0.5, 0x8b93a6, 0, 0);
    hb.box(0, -0.08, 0.02, 0.08, 0.2, 0.1, 0x23253a, 0, 0);
    hb.box(0, 0, 0.46, 0.14, 0.14, 0.1, 0xf2c94c, 0, 0);
    this.held = new THREE.Mesh(hb.build(), M.actor);
    this.held.visible = false;
    this.rig.hand.add(this.held);
    g.scene.add(this.rig.root);
  }

  get invulnerable() {
    return this.invuln > 0 || this.state === 'down' || this.state === 'frozen';
  }
  /** Can bystanders tell who this is? (hidden inside a closed car) */
  get recognizable() {
    if (this.state === 'down' || this.state === 'frozen') return false;
    return !this.vehicle || !!this.vehicle.spec.open;
  }
  get onFoot() {
    return this.state === 'foot';
  }

  setOutfit(id: string) {
    if (!OUTFITS[id]) return;
    this.g.save.outfit = id;
    this.rig.build(OUTFITS[id].spec);
  }

  place(x: number, y: number, z: number, heading = this.heading) {
    if (this.vehicle) this.forceExit();
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.heading = heading;
    this.state = 'foot';
    this.grounded = true;
    this.chute.visible = false;
    this.g.cam.snap();
  }

  /** Begin the sky-dive opening. */
  startChute(x: number, y: number, z: number) {
    this.place(x, y, z, Math.PI);
    this.state = 'chute';
    this.grounded = false;
    this.chute.visible = true;
    this.vel.set(0, -6, 0);
    this.g.cam.yaw = Math.PI;
    this.g.cam.pitch = 0.62;
  }

  // ------------------------------------------------------------------ damage
  hurt(dmg: number, source: string, fromX: number, fromZ: number) {
    if (this.invulnerable || dmg <= 0) return;
    if (this.dodgeT >= 0 && this.dodgeT < 0.34) {
      this.g.fx.text(this.pos.x, this.pos.y + 2.2, this.pos.z, 'MISSED!', 'good');
      return;
    }
    const g = this.g;
    this.health -= dmg * (this.crouching ? 0.85 : 1);
    this.lastDamage = g.time;
    this.lastSource = source;
    this.hitT = 0.28;
    g.renderer.flash = Math.min(0.4, 0.12 + dmg * 0.012);
    g.renderer.flashColor.setHex(0xd43a34);
    g.cam.shake = Math.max(g.cam.shake, 0.25);
    g.audio.play('hurt', 0.7);
    const a = Math.atan2(this.pos.x - fromX, this.pos.z - fromZ);
    this.knock(Math.sin(a) * 4, Math.cos(a) * 4);
    if (this.health <= 0) this.goDown();
  }

  knock(vx: number, vz: number) {
    this.kx += vx;
    this.kz += vz;
  }

  heal(n: number) {
    this.health = Math.min(this.maxHealth, this.health + n);
  }

  private goDown() {
    const g = this.g;
    this.health = 0;
    if (this.vehicle) this.forceExit();
    this.state = 'down';
    this.downT = 0;
    this.chute.visible = false;
    g.save.stats.cancelled++;
    const police = this.lastSource === 'police' || this.lastSource === 'security' || this.lastSource === 'dart';
    g.hud.banner(police ? 'DETAINED!' : 'CANCELLED!', police ? 'They let you go after a very long lecture.' : 'The internet has spoken. Try again.', 'bad');
    g.audio.play('fail', 0.9);
  }

  /** Stand back up at a position (checkpoint / safehouse). */
  revive(x: number, y: number, z: number, heading = 0) {
    this.place(x, y, z, heading);
    this.health = this.maxHealth;
    this.invuln = 3.5;
    this.kx = this.kz = 0;
    for (let i = 0; i < this.ammo.length; i++) this.ammo[i] = WEAPONS[i].mag;
  }

  // ------------------------------------------------------------------ vehicles
  enter(v: Vehicle) {
    const g = this.g;
    if (v.mode === 'traffic' || v.mode === 'dazed' || v.mode === 'flee') {
      // the driver bails out, loudly
      const n = g.npcs.spawn('civilian', v.x - v.fz * 2, v.z + v.fx * 2, { y: v.y });
      n.state = 'flee';
      g.fx.text(n.x, n.y + 2.2, n.z, 'MY CAR!!', 'bad');
      g.heat.crime(0.6, 'carjacking');
    }
    if (v.slot >= 0) v.persistent = true;
    this.vehicle = v;
    this.state = 'vehicle';
    v.mode = 'player';
    v.used = true;
    v.edge = null;
    this.aiming = false;
    this.crouching = false;
    this.chute.visible = false;
    this.enterT = 0.25;
    g.audio.play('door', 0.6);
    g.heat.vehicleSwapped();
    g.hud.vehicleName(v.spec.name);
    if (!g.save.vehicles.includes(v.kind)) {
      g.save.vehicles.push(v.kind);
      g.hud.toast(`New ride discovered: ${v.spec.name}`, 'good');
      g.addCash(50, 'Vehicle discovered');
    }
    g.missions.onEnterVehicle(v);
  }

  /** Leave the current vehicle. Returns false when there is nowhere to get out. */
  exit(): boolean {
    const v = this.vehicle;
    if (!v) return false;
    const g = this.g, w = g.world;
    const cls = v.spec.cls;
    if (cls === 'heli' && !v.landed && v.y - w.groundAt(v.x, v.z, v.y, 2) > 6) {
      // bail out and pop the parachute
      this.vehicle = null;
      v.mode = 'parked';
      this.pos.set(v.x - v.fz * 3, v.y - 1, v.z + v.fx * 3);
      this.state = 'chute';
      this.chute.visible = true;
      this.vel.set(v.vx, -4, v.vz);
      this.grounded = false;
      g.audio.play('chute', 0.7);
      return true;
    }
    if (Math.abs(v.speed) > 9 && cls !== 'heli') return false;
    const side = v.spec.wid / 2 + 0.9;
    const cands: [number, number][] = [[-v.fz * side, v.fx * side], [v.fz * side, -v.fx * side], [-v.fx * (v.spec.len / 2 + 1), -v.fz * (v.spec.len / 2 + 1)], [v.fx * (v.spec.len / 2 + 1), v.fz * (v.spec.len / 2 + 1)]];
    if (cls === 'boat') {
      // look further for a dock or shore
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        for (const r of [3, 5, 7]) cands.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
    }
    let found: [number, number, number] | null = null;
    for (const [ox, oz] of cands) {
      const x = v.x + ox, z = v.z + oz;
      const gy = w.groundAt(x, z, v.y + 1.6, 1.6);
      if (w.inside(x, gy + 1, z) || gy < v.y - 3) continue;
      if (cls === 'boat' && gy < SEA + 0.2) continue;
      found = [x, gy, z];
      break;
    }
    if (!found) {
      if (cls !== 'boat') return false;
      found = [v.x - v.fz * 2, SEA - 1.1, v.z + v.fx * 2]; // dive in
    }
    this.vehicle = null;
    v.mode = 'parked';
    this.pos.set(found[0], Math.max(found[1], cls === 'boat' ? SEA - 1.1 : -50), found[2]);
    this.vel.set(0, 0, 0);
    this.heading = v.heading;
    this.state = 'foot';
    this.grounded = false;
    g.audio.play('door', 0.5);
    g.hud.vehicleName('');
    return true;
  }

  forceExit(eject = false) {
    const v = this.vehicle;
    if (!v) return;
    this.vehicle = null;
    if (v.mode === 'player') v.mode = 'parked';
    this.pos.set(v.x - v.fz * 2.2, v.y + (eject ? 1 : 0.2), v.z + v.fx * 2.2);
    this.vel.set(-v.fz * 4, eject ? 6 : 0, v.fx * 4);
    this.state = 'foot';
    this.grounded = false;
    this.g.hud.vehicleName('');
  }

  // ------------------------------------------------------------------ update
  update(dt: number) {
    const g = this.g, inp = g.input;
    this.invuln = Math.max(0, this.invuln - dt);
    this.fireT -= dt;
    this.dodgeCool -= dt;
    this.hitT -= dt;
    this.landT -= dt;
    this.comboWindow -= dt;
    this.victoryT -= dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.ammo[this.weapon] = WEAPONS[this.weapon].mag;
        g.audio.play('reload', 0.5);
      }
    }
    // slow regeneration when left alone
    if (this.state !== 'down' && this.health < 60 && g.time - this.lastDamage > 7) this.health = Math.min(60, this.health + 4 * dt);
    // weapon switching
    if (inp.hit('next') || inp.hit('prev')) {
      const owned = WEAPONS.map((w, i) => (g.save.weapons.includes(w.id) ? i : -1)).filter((i) => i >= 0);
      const k = owned.indexOf(this.weapon);
      this.weapon = owned[(k + (inp.hit('next') ? 1 : owned.length - 1)) % owned.length] ?? 0;
      this.reloadT = 0;
      g.hud.toast(WEAPONS[this.weapon].name);
      g.audio.play('ui', 0.4);
    }
    switch (this.state) {
      case 'foot':
        this.foot(dt);
        break;
      case 'chute':
        this.parachute(dt);
        break;
      case 'swim':
        this.swim(dt);
        break;
      case 'vehicle':
        this.inVehicle(dt);
        break;
      case 'climb':
        this.climbing(dt);
        break;
      case 'down':
        this.downT += dt;
        this.anim = 'down';
        this.pos.y = Math.max(this.pos.y - 9 * dt, g.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5));
        if (this.downT > 2.6) g.missions.onPlayerDown();
        break;
      case 'frozen':
        this.anim = this.victoryT > 0 ? 'victory' : 'idle';
        break;
    }
    g.world.clampBounds(this.pos);
    // visuals
    const r = this.rig;
    const hidden = this.state === 'vehicle' && this.vehicle && !this.vehicle.spec.open;
    r.root.visible = !hidden;
    if (!hidden) {
      const v = this.vehicle;
      if (v) {
        const seat = v.spec.cls === 'bike' ? -0.25 : -0.7;
        r.root.position.set(v.x + v.fx * seat, v.y + (v.spec.cls === 'bike' ? 0.42 : 0.5), v.z + v.fz * seat);
        r.root.rotation.set(0, v.heading, v.spec.cls === 'bike' ? v.roll : 0);
      } else {
        r.root.position.copy(this.pos);
        r.root.rotation.set(0, this.heading, 0);
      }
      const sp = Math.hypot(this.vel.x, this.vel.z);
      let p = 0;
      if (this.attackT >= 0) p = this.attackT / 0.36;
      if (this.dodgeT >= 0) p = this.dodgeT / 0.42;
      if (this.state === 'climb') p = this.climb.t / 0.45;
      r.animate(this.anim, dt, sp, p, g.time);
      // blink while invulnerable
      if (this.invuln > 0 && this.state !== 'vehicle') r.root.visible = Math.floor(g.time * 14) % 2 === 0;
    }
    this.held.visible = this.aiming && this.state === 'foot';
  }

  private moveDir(): { x: number; z: number; m: number } {
    const g = this.g, mv = g.input.move();
    const c = g.cam;
    // right vector of the camera = (-fz, fx)
    const x = c.fx * mv.y + -c.fz * mv.x, z = c.fz * mv.y + c.fx * mv.x;
    return { x, z, m: Math.hypot(mv.x, mv.y) };
  }

  private foot(dt: number) {
    const g = this.g, inp = g.input, w = g.world;
    const md = this.moveDir();
    this.aiming = inp.down('aim') && this.attackT < 0 && this.dodgeT < 0;
    if (inp.hit('crouch') && this.grounded) this.crouching = !this.crouching;
    this.sprinting = inp.down('sprint') && md.m > 0.3 && !this.aiming && !this.crouching;
    let speed = this.crouching ? 2.2 : this.aiming ? 2.8 : this.sprinting ? 8.8 : 5.2;
    if (this.attackT >= 0) speed *= 0.35;
    if (this.hitT > 0) speed *= 0.3;
    // --- dodge roll
    if (inp.hit('dodge') && this.dodgeCool <= 0 && this.grounded && this.dodgeT < 0) {
      this.dodgeT = 0;
      this.dodgeCool = 0.85;
      const a = md.m > 0.2 ? Math.atan2(md.x, md.z) : this.heading;
      this.dodgeDir.x = Math.sin(a);
      this.dodgeDir.z = Math.cos(a);
      this.heading = a;
      this.attackT = -1;
      this.crouching = false;
      g.audio.play('whoosh', 0.5);
    }
    let vx: number, vz: number;
    if (this.dodgeT >= 0) {
      this.dodgeT += dt;
      const k = 1 - this.dodgeT / 0.42;
      vx = this.dodgeDir.x * (5 + 9 * k);
      vz = this.dodgeDir.z * (5 + 9 * k);
      if (this.dodgeT >= 0.42) this.dodgeT = -1;
    } else {
      vx = md.x * speed;
      vz = md.z * speed;
      if (this.aiming) this.heading = dampAngle(this.heading, g.cam.yaw, 18, dt);
      else if (md.m > 0.15 && this.attackT < 0) this.heading = dampAngle(this.heading, Math.atan2(md.x, md.z), 14, dt);
    }
    const acc = this.grounded ? 16 : 4;
    this.vel.x = damp(this.vel.x, vx, acc, dt);
    this.vel.z = damp(this.vel.z, vz, acc, dt);
    // knockback impulses
    this.vel.x += this.kx;
    this.vel.z += this.kz;
    this.kx = this.kz = 0;

    // --- jump / mantle
    if (inp.hit('jump') && this.grounded && this.dodgeT < 0) {
      if (!this.tryMantle()) {
        this.vel.y = 7.4;
        this.grounded = false;
        this.crouching = false;
        this.fallStart = this.pos.y;
        g.audio.play('jump', 0.4);
      }
    }
    // --- integrate
    const bx = this.pos.x, bz = this.pos.z;
    tmp.x = this.pos.x + this.vel.x * dt;
    tmp.z = this.pos.z + this.vel.z * dt;
    w.collide(tmp, 0.38, this.pos.y, this.crouching ? 1.2 : 1.85, 0.5);
    this.pos.x = tmp.x;
    this.pos.z = tmp.z;
    g.save.stats.distance += Math.hypot(this.pos.x - bx, this.pos.z - bz);
    const gy = w.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.05, this.grounded ? 0.55 : 0.25);
    if (this.grounded) {
      if (gy < this.pos.y - 0.6) {
        this.grounded = false;
        this.fallStart = this.pos.y;
        this.vel.y = 0;
      } else this.pos.y = gy;
    }
    if (!this.grounded) {
      this.vel.y -= 22 * dt;
      this.pos.y += this.vel.y * dt;
      const fallen = this.fallStart - this.pos.y;
      const above = this.pos.y - gy;
      this.canDeploy = this.vel.y < -6 && above > 11;
      if (this.canDeploy && inp.hit('jump')) {
        this.state = 'chute';
        this.chute.visible = true;
        this.vel.y = Math.max(this.vel.y, -9);
        this.canDeploy = false;
        g.audio.play('chute', 0.7);
        return;
      }
      if (this.pos.y <= gy && this.vel.y <= 0) {
        this.pos.y = gy;
        this.grounded = true;
        this.canDeploy = false;
        if (fallen > 7) {
          this.hurt((fallen - 7) * 5, 'fall', this.pos.x, this.pos.z);
          g.cam.shake = 0.4;
        }
        if (fallen > 1.2) {
          this.landT = 0.18;
          g.fx.puff(this.pos.x, this.pos.y + 0.1, this.pos.z, 0xe6dcc6, 5);
          g.audio.play('land', clamp(fallen / 8, 0.2, 0.8));
        }
        this.vel.y = 0;
      }
    } else this.canDeploy = false;
    // --- water
    if (w.waterAt(this.pos.x, this.pos.z) && this.pos.y < SEA - 0.75) {
      this.state = 'swim';
      this.crouching = false;
      this.aiming = false;
      g.fx.emit(this.pos.x, SEA, this.pos.z, 0xd6f0f2, 10, 4, 0.4, 0.6, 9);
      g.audio.play('splash', 0.6);
      return;
    }
    this.combat(dt);
    // footsteps
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (this.grounded && sp > 1) {
      this.stepT -= dt * sp;
      if (this.stepT <= 0) {
        this.stepT = 2.3;
        g.audio.play('step', this.sprinting ? 0.3 : 0.18);
      }
    }
    // --- animation state
    if (this.hitT > 0) this.anim = 'hit';
    else if (this.dodgeT >= 0) this.anim = 'dodge';
    else if (this.attackT >= 0) this.anim = this.combo === 1 ? 'punch1' : this.combo === 2 ? 'punch2' : 'punch3';
    else if (!this.grounded) this.anim = this.vel.y > 0 ? 'jump' : this.fallStart - this.pos.y > 3 ? 'fall' : 'jump';
    else if (this.landT > 0) this.anim = 'land';
    else if (this.aiming) this.anim = this.fireT > 0.02 ? 'shoot' : 'aim';
    else if (this.crouching) this.anim = 'crouch';
    else if (this.victoryT > 0) this.anim = 'victory';
    else this.anim = sp > 0.5 ? 'move' : 'idle';
  }

  private tryMantle(): boolean {
    const w = this.g.world;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const px = this.pos.x + fx * 0.9, pz = this.pos.z + fz * 0.9;
    // is something solid just ahead, with a standable top within reach?
    if (!w.inside(px, this.pos.y + 0.9, pz)) return false;
    const top = w.groundAt(px, pz, this.pos.y + 2.5, 0.1);
    const rise = top - this.pos.y;
    if (rise < 0.6 || rise > 2.45) return false;
    if (w.inside(px, top + 1, pz)) return false;
    const c = this.climb;
    c.t = 0;
    c.sx = this.pos.x;
    c.sy = this.pos.y;
    c.sz = this.pos.z;
    c.x = this.pos.x + fx * 1.15;
    c.y = top;
    c.z = this.pos.z + fz * 1.15;
    this.state = 'climb';
    this.vel.set(0, 0, 0);
    this.g.audio.play('whoosh', 0.35);
    return true;
  }

  private climbing(dt: number) {
    const c = this.climb;
    c.t += dt;
    const k = clamp(c.t / 0.45, 0, 1);
    const up = clamp(k * 1.6, 0, 1), fw = clamp((k - 0.4) / 0.6, 0, 1);
    this.pos.set(c.sx + (c.x - c.sx) * fw, c.sy + (c.y - c.sy) * up, c.sz + (c.z - c.sz) * fw);
    this.anim = 'climb';
    if (k >= 1) {
      this.state = 'foot';
      this.grounded = true;
    }
  }

  private combat(dt: number) {
    const g = this.g, inp = g.input;
    const W = WEAPONS[this.weapon];
    if (this.attackT >= 0) {
      this.attackT += dt;
      // the blow lands part-way through the swing
      if (!this.attackHit && this.attackT > 0.13) {
        this.attackHit = true;
        const heavy = this.combo === 3;
        const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
        if (g.combat.melee(this.pos.x, this.pos.z, this.heading, heavy ? 30 : 15, heavy ? 2.4 : 2.0, heavy ? 10 : 4.5)) {
          g.audio.play(heavy ? 'punchBig' : 'punch', 0.7);
          g.cam.shake = heavy ? 0.3 : 0.12;
        } else g.audio.play('whoosh', 0.3);
        this.vel.x += fx * 2.5;
        this.vel.z += fz * 2.5;
      }
      if (this.attackT > 0.36) {
        this.attackT = -1;
        this.comboWindow = 0.45;
      }
    }
    if (this.aiming) {
      if (inp.hit('reload') && this.ammo[this.weapon] < W.mag && this.reloadT <= 0) this.reloadT = W.reload;
      if (inp.down('attack') && this.fireT <= 0 && this.reloadT <= 0) {
        if (this.ammo[this.weapon] <= 0) {
          this.reloadT = W.reload;
          g.audio.play('empty', 0.5);
        } else {
          this.ammo[this.weapon]--;
          this.fireT = W.rate;
          // aim where the camera looks: find the point under the crosshair
          const cam = g.camera;
          cam.getWorldDirection(dir);
          const range = g.world.raycast(cam.position.x, cam.position.y, cam.position.z, dir.x, dir.y, dir.z, 90, 0.8);
          const tx = cam.position.x + dir.x * range, ty = cam.position.y + dir.y * range, tz = cam.position.z + dir.z * range;
          const ox = this.pos.x + Math.sin(this.heading) * 0.6 - Math.cos(this.heading) * 0.3, oy = this.pos.y + 1.45, oz = this.pos.z + Math.cos(this.heading) * 0.6 + Math.sin(this.heading) * 0.3;
          let dx = tx - ox, dy = ty - oy, dz = tz - oz;
          const l = Math.hypot(dx, dy, dz) || 1;
          dx /= l;
          dy /= l;
          dz /= l;
          g.combat.playerFire(W, ox, oy, oz, dx, dy, dz);
          g.audio.play(W.id === 'mega' ? 'mega' : W.id === 'order' ? 'thump' : 'pop', 0.6);
          g.cam.shake = Math.max(g.cam.shake, W.id === 'order' ? 0.2 : 0.05);
          g.heat.crime(0.015, 'causing a scene');
        }
      }
    } else if (inp.hit('attack') && this.attackT < 0 && this.dodgeT < 0 && this.grounded) {
      this.combo = this.comboWindow > 0 ? (this.combo % 3) + 1 : 1;
      this.attackT = 0;
      this.attackHit = false;
      this.crouching = false;
      // face the nearest foe in front so punches connect
      let best = 0.9, target = this.heading;
      for (const n of g.npcs.list) {
        const d2 = dist2(n.x, n.z, this.pos.x, this.pos.z);
        if (d2 > 3.2 * 3.2 || n.state === 'down') continue;
        const a = Math.atan2(n.x - this.pos.x, n.z - this.pos.z);
        const da = Math.abs(angleDiff(this.heading, a));
        if (da < best) {
          best = da;
          target = a;
        }
      }
      this.heading = target;
    } else if (inp.hit('reload') && this.ammo[this.weapon] < W.mag && this.reloadT <= 0) this.reloadT = W.reload;
  }

  private parachute(dt: number) {
    const g = this.g, inp = g.input, w = g.world;
    const md = this.moveDir();
    const dive = inp.down('sprint');
    this.vel.x = damp(this.vel.x, md.x * (dive ? 9 : 15), 2.2, dt);
    this.vel.z = damp(this.vel.z, md.z * (dive ? 9 : 15), 2.2, dt);
    this.vel.y = damp(this.vel.y, dive ? -19 : -6.5, 1.6, dt);
    if (md.m > 0.15) this.heading = dampAngle(this.heading, Math.atan2(md.x, md.z), 3, dt);
    tmp.x = this.pos.x + this.vel.x * dt;
    tmp.z = this.pos.z + this.vel.z * dt;
    if (w.collide(tmp, 0.5, this.pos.y, 1.9, 0.3)) {
      this.vel.x *= 0.4;
      this.vel.z *= 0.4;
    }
    this.pos.x = tmp.x;
    this.pos.z = tmp.z;
    this.pos.y += this.vel.y * dt;
    this.chute.rotation.z = damp(this.chute.rotation.z, clamp(-(this.vel.x * Math.cos(this.heading) - this.vel.z * Math.sin(this.heading)) * 0.02, -0.3, 0.3), 3, dt);
    this.chute.rotation.x = damp(this.chute.rotation.x, clamp(Math.hypot(this.vel.x, this.vel.z) * 0.012, 0, 0.25), 3, dt);
    this.anim = 'chute';
    const gy = w.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.3, 0.4);
    if (w.waterAt(this.pos.x, this.pos.z) && this.pos.y < SEA - 0.6) {
      this.chute.visible = false;
      this.state = 'swim';
      g.audio.play('splash', 0.6);
      g.missions.onLanded();
      return;
    }
    if (this.pos.y <= gy) {
      this.pos.y = gy;
      this.state = 'foot';
      this.grounded = true;
      this.chute.visible = false;
      this.landT = 0.3;
      this.vel.y = 0;
      this.invuln = Math.max(this.invuln, 1.2);
      g.fx.puff(this.pos.x, this.pos.y + 0.2, this.pos.z, 0xf6ecd0, 12);
      g.audio.play('land', 0.7);
      g.cam.shake = 0.25;
      g.missions.onLanded();
    }
  }

  private swim(dt: number) {
    const g = this.g, w = g.world;
    const md = this.moveDir();
    const sp = g.input.down('sprint') ? 4.6 : 3.2;
    this.vel.x = damp(this.vel.x, md.x * sp, 5, dt);
    this.vel.z = damp(this.vel.z, md.z * sp, 5, dt);
    if (md.m > 0.15) this.heading = dampAngle(this.heading, Math.atan2(md.x, md.z), 6, dt);
    tmp.x = this.pos.x + this.vel.x * dt;
    tmp.z = this.pos.z + this.vel.z * dt;
    w.collide(tmp, 0.4, SEA - 1.2, 1.4, 0.3);
    this.pos.x = tmp.x;
    this.pos.z = tmp.z;
    this.pos.y = damp(this.pos.y, SEA - 1.05 + Math.sin(g.time * 2.4) * 0.05, 6, dt);
    this.anim = 'swim';
    if (Math.random() < 0.15 && md.m > 0.2) g.fx.emit(this.pos.x, SEA + 0.05, this.pos.z, 0xe8f6f6, 1, 1.5, 0.3, 0.5, 4);
    // climb out onto shore, docks or boats
    const gy = w.groundAt(this.pos.x, this.pos.z, SEA + 1.0, 0.6);
    if (gy > SEA - 0.75 || !w.waterAt(this.pos.x, this.pos.z)) {
      this.pos.y = Math.max(gy, this.pos.y);
      this.state = 'foot';
      this.grounded = true;
      return;
    }
    // haul up onto a low dock edge ahead
    if (g.input.hit('jump')) {
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      const top = w.groundAt(this.pos.x + fx * 1.2, this.pos.z + fz * 1.2, SEA + 2.4, 0.2);
      if (top > SEA - 0.5 && top < SEA + 2.6) {
        this.pos.set(this.pos.x + fx * 1.4, top, this.pos.z + fz * 1.4);
        this.state = 'foot';
        this.grounded = true;
      }
    }
  }

  private inVehicle(dt: number) {
    const v = this.vehicle!;
    this.pos.set(v.x, v.y, v.z);
    this.vel.set(v.vx, 0, v.vz);
    this.heading = v.heading;
    this.enterT -= dt;
    this.anim = v.spec.cls === 'bike' ? 'ride' : 'drive';
    this.aiming = false;
    this.g.save.stats.distance += Math.hypot(v.vx, v.vz) * dt;
  }

  freeze(on: boolean) {
    if (on) {
      if (this.vehicle) return;
      this.state = 'frozen';
      this.vel.set(0, 0, 0);
    } else if (this.state === 'frozen') this.state = 'foot';
  }
}
