// PilotFreeRoamSystem — get out of the aircraft at a farm base and walk
// around, then get back into the same aircraft.
//
// States: PILOT_IN_AIRCRAFT → PILOT_EXITING → PILOT_ON_FOOT → PILOT_BOARDING
// → PILOT_IN_AIRCRAFT. While the pilot is in the aircraft the system costs a
// throttled condition check (4 per second, a few comparisons) and nothing
// else: no figure is built until the first exit, no collision or camera
// work runs.
//
// While on foot the aircraft is not stepped at all (it stays exactly where
// it stopped, engine off, fuel, load and damage untouched), the flight
// inputs are not read, and the camera rig is not run: this module drives
// the camera. Everything else (world, crew, streaming, rendering) runs
// through the game's own single loop.
//
// Zones: one oriented rectangle per base (SITES), built from its runway,
// apron, hangar and crew area plus a margin — the whole base, strip
// included. The exit button needs the aircraft inside one; the pilot may
// walk a wider margin around it (EXPLORE_MARGIN), not across the map.
//
// Collisions reuse the world's own data: the structures' box colliders
// (hangar walls, sheds, tanks…), the tree collider, the parked aircraft and
// the service truck (world.extraObstacle) and the flown aircraft's hit boxes.
import * as THREE from 'three';
import { SITES, BASE } from '../world/layout.js';
import { PilotFigure } from './pilotFigure.js';
import { t } from '../i18n/index.js';
import { clamp, damp } from '../core/math.js';

export const FOOT = { IN: 'PILOT_IN_AIRCRAFT', EXITING: 'PILOT_EXITING', ON_FOOT: 'PILOT_ON_FOOT', BOARDING: 'PILOT_BOARDING' };

export const FREE_ROAM = {
  zoneMargin: 40, // m around a base's runway / apron / hangar: where the exit button can show
  exploreMargin: 120, // m further out the pilot can walk
  maxExitSpeed: 0.3, // m/s ground speed
  walkSpeed: 1.55, // m/s
  accel: 5, // m/s²
  radius: 0.3, // pilot's collision circle (m)
  height: 1.8,
  boardRadius: 3.2, // m from the cockpit door point
  camDist: 4.2, camHeight: 1.55,
};

// One zone per base: an oriented rectangle (centre, half sizes, rotation
// about Y). The strips here run east–west, but the rotation follows the
// runway direction so a rotated strip would work the same way.
export function buildZones(sites = SITES, margin = FREE_ROAM.zoneMargin) {
  return sites.map((s) => {
    const r = s.runway, a = s.apron, h = s.hangar;
    const xs = [r.x0, r.x1, a.x0, a.x1, h.x - h.w / 2, h.x + h.w / 2];
    const half = r.width / 2 + (r.shoulder ?? 0);
    const zs = [r.z - half, r.z + half, a.z0, a.z1, h.z - h.d / 2, h.z + h.d / 2];
    for (const k of ['crewBase', 'helipad', 'parking7', 'parking8', 'fuelTank', 'truck']) if (s[k]) { xs.push(s[k].x); zs.push(s[k].z); }
    const x0 = Math.min(...xs) - margin, x1 = Math.max(...xs) + margin, z0 = Math.min(...zs) - margin, z1 = Math.max(...zs) + margin;
    const rot = Math.atan2(0, 1); // runway direction (x axis)
    return { id: s.id, site: s, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2, rot };
  });
}
export function inZone(z, x, zz, extra = 0) {
  const dx = x - z.cx, dz = zz - z.cz, c = Math.cos(z.rot), s = Math.sin(z.rot);
  const u = dx * c + dz * s, v = -dx * s + dz * c;
  return Math.abs(u) <= z.hw + extra && Math.abs(v) <= z.hd + extra;
}

const _v = new THREE.Vector3(), _p = new THREE.Vector3();

export class PilotFreeRoamSystem {
  constructor(game) {
    this.game = game;
    this.state = FOOT.IN;
    this.zones = buildZones();
    this.zone = null; // zone of the current walk
    this.ac = null; // aircraft the pilot got out of
    this.figure = null; // built on the first exit
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector2();
    this.yaw = 0; // body heading
    this.cam = { yaw: 0, pitch: 0.18, dist: FREE_ROAM.camDist };
    this.camPos = new THREE.Vector3();
    this.near = []; // colliders around the pilot
    this.nearT = 0;
    this.checkT = 0;
    this.canExit = false;
    this.exitSpot = null;
    this.tr = 0; // transition timer
    this._limitToast = 0;
    this._engineHint = 0;
    this.stats = { exits: 0, boards: 0 };
    this._buildButton();
  }

  get active() { return this.state !== FOOT.IN; }
  get onFoot() { return this.state === FOOT.ON_FOOT; }

  _buildButton() {
    const ui = this.game.uiRoot;
    if (!ui) return;
    const b = document.createElement('button');
    b.className = 'foot-btn interactive';
    b.type = 'button';
    b.hidden = true;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this._press(); });
    ui.appendChild(b);
    this.btn = b;
    this._btnKind = null;
  }
  _showButton(kind) {
    if (!this.btn || kind === this._btnKind) return;
    this._btnKind = kind;
    this.btn.hidden = !kind;
    if (kind) {
      this.btn.dataset.kind = kind;
      this.btn.textContent = kind === 'exit' ? t('GET OUT') : t('BOARD');
    }
  }
  _press() {
    if (this._btnKind === 'exit') this.exit();
    else if (this._btnKind === 'board') this.board();
  }

  // ------------------------------------------------------------ conditions
  _zoneAt(x, z) { for (const zn of this.zones) if (inZone(zn, x, z)) return zn; return null; }

  // Everything but the exit spot (cheap): flown aircraft, stopped on the
  // ground at a base, engine off, nothing else going on.
  _baseConditions() {
    const g = this.game, ac = g.aircraft;
    if (!g.playing || g.mode === 'title' || g.screens?.open || g.replay?.active || (g.autopilot?.phase && g.autopilot.phase !== 'done') || g._outro || g._camFly) return null;
    if (!ac || ac.state !== 'ok' || ac.stuck) return null;
    const fm = ac.fm, o = fm.out;
    if (!o.onGround || o.onWater || o.groundSpeed > FREE_ROAM.maxExitSpeed || fm.vel.length() > 0.5) return null;
    const zn = this._zoneAt(fm.pos.x, fm.pos.z);
    if (!zn) return null;
    if (fm.engine !== 'off' || g._rotorTurning?.()) return { zone: zn, engineOn: true };
    return { zone: zn };
  }

  // ------------------------------------------------------------ collisions
  _refreshNear(x, z) {
    const cs = this.game.world.structures.colliders, R = 40;
    this.near.length = 0;
    for (const c of cs) if (x > c.x0 - R && x < c.x1 + R && z > c.z0 - R && z < c.z1 + R) this.near.push(c);
    this.nearX = x; this.nearZ = z;
  }
  _floor(x, z) {
    const th = this.game.world.terrain.heightAt(x, z);
    // The main hangar's floor slab stands a little above the ground.
    const h = BASE.hangar;
    if (Math.abs(x - h.x) < h.w / 2 + 0.5 && Math.abs(z - h.z) < h.d / 2 + 0.5) return Math.max(th, 0.175);
    return th;
  }
  // Is a standing pilot (circle `r` around x,z, feet at y) blocked?
  _blocked(x, z, y, r = FREE_ROAM.radius) {
    const H = FREE_ROAM.height;
    for (const c of this.near) {
      if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r && y + 0.15 < c.top && !(y + H < (c.bottom ?? -Infinity))) return c.name;
    }
    const w = this.game.world, ac = this.ac ?? this.game.aircraft;
    const th = w.terrain.heightAt(x, z);
    for (const hh of [0.35, 1.0, 1.65]) {
      const yy = y + hh;
      if (w.treeHit(x, yy, z, th)) return 'tree';
      for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
        if (ac?.hitTest(x + dx, yy, z + dz)) return 'aircraft';
        const o = w.extraObstacle?.(x + dx, yy, z + dz);
        if (o) return o;
      }
    }
    return null;
  }

  // A safe place beside the aircraft: by the cockpit on the left side first,
  // then the right, then further back, then a ring round it.
  _findExitSpot(ac) {
    const fm = ac.fm;
    this._refreshNear(fm.pos.x, fm.pos.z);
    const eye = ac.type.stub?.eye ?? [0, 1, 0];
    const xs = Math.max(0.9, ...(ac.type.bounds ?? []).filter((b) => b[5] > eye[2] - 1 && b[4] < eye[2] + 1 && b[3] - b[2] > 0.5).map((b) => Math.max(Math.abs(b[0]), Math.abs(b[1]))).filter((v) => v < 2));
    const cand = [];
    for (const side of [1, -1]) for (const dz of [0, -0.8, 0.8, -1.8, -3, -4.5]) for (const lat of [xs + 0.6, xs + 1.2, xs + 2.2]) cand.push([side * lat, eye[2] + dz]);
    for (let r = 4; r <= 10; r += 2) for (let a = 0; a < 12; a++) cand.push([Math.sin((a / 12) * Math.PI * 2) * r, Math.cos((a / 12) * Math.PI * 2) * r]);
    for (const [bx, bz] of cand) {
      // Body frame → world (heading only, so the point stays on the ground).
      _p.set(bx, 0, bz).applyQuaternion(fm.quat);
      const x = fm.pos.x + _p.x, z = fm.pos.z + _p.z;
      const y = this._floor(x, z);
      if (Math.abs(y - this.game.world.terrain.heightAt(fm.pos.x, fm.pos.z)) > 1.5) continue;
      if (!this._blocked(x, z, y, FREE_ROAM.radius + 0.1)) return { x, z, y };
    }
    return null;
  }

  // Cockpit door point on the ground (where boarding is offered).
  _doorPoint(ac, out) {
    const eye = ac.type.stub?.eye ?? [0, 1, 0];
    _p.set(eye[0], 0, eye[2]).applyQuaternion(ac.fm.quat);
    return out.set(ac.fm.pos.x + _p.x, 0, ac.fm.pos.z + _p.z);
  }

  // ------------------------------------------------------------ transitions
  exit() {
    if (this.state !== FOOT.IN) return false;
    const c = this._baseConditions();
    if (!c || c.engineOn) return false;
    const ac = this.game.aircraft;
    const spot = this._findExitSpot(ac);
    if (!spot) { this.game.toast(t('No clear place to get out here.')); return false; }
    try {
      this.ac = ac;
      this.zone = c.zone;
      this.prevCamera = this.game.cameraMode;
      this.figure ??= new PilotFigure();
      if (!this.figure.root.parent) this.game.scene.add(this.figure.root);
      this.pos.set(spot.x, spot.y, spot.z);
      this.vel.set(0, 0);
      // Face away from the aircraft, the camera behind the pilot and high
      // enough to look over the wing (forward walks away from the aircraft).
      const awayX = spot.x - ac.fm.pos.x, awayZ = spot.z - ac.fm.pos.z;
      this.yaw = Math.atan2(awayX, awayZ);
      this.cam.yaw = this.yaw + Math.PI - 0.35;
      this.cam.pitch = 0.5;
      this.cam.dist = FREE_ROAM.camDist;
      this.figure.root.position.copy(this.pos);
      this.figure.root.rotation.y = this.yaw;
      this.figure.root.visible = true;
      ac.model.pilot.visible = false;
      this.camFrom = this.game.camera.position.clone();
      this.camFromQ = this.game.camera.quaternion.clone();
      this.game.sprayer.on = false;
      this.state = FOOT.EXITING;
      this.tr = 0;
      this.stats.exits++;
      this._refreshNear(spot.x, spot.z);
      this.game.uiRoot?.classList.add('on-foot');
      this._showButton(null);
      this.game.toast(this.game.touch?.active ? t('On foot: joystick to walk, drag the view to look round. BOARD by your aircraft.') : t('On foot: W A S D, arrows or the numpad to walk, drag the mouse to look. BOARD (or E) by your aircraft.'));
      return true;
    } catch (e) {
      console.error(e);
      this._restore();
      return false;
    }
  }

  board(force = false) {
    if (this.state !== FOOT.ON_FOOT && !(force && this.active)) return false;
    if (!force && !this._nearOwnAircraft()) return false;
    this.state = FOOT.BOARDING;
    this._restore();
    this.stats.boards++;
    return true;
  }
  // Back in the aircraft (also the safe fallback after any error): figure
  // hidden, camera rig and flight controls back as they were.
  _restore() {
    const g = this.game;
    if (this.figure) this.figure.root.visible = false;
    g.uiRoot?.classList.remove('on-foot');
    const mode = this.prevCamera ?? g.cameraMode ?? 'chase';
    if (g.aircraft) {
      g.cameraMode = mode;
      g.rig.setMode(mode, g.aircraft);
      g.rig.initialized = false;
    }
    this.ac = null;
    this.zone = null;
    this.state = FOOT.IN;
    this._showButton(null);
    this.checkT = 0;
  }
  // Called by anything that changes aircraft, leaves the game or replays.
  forceBoard() { if (this.active) this.board(true); }

  _nearOwnAircraft() {
    const ac = this.ac;
    if (!ac || ac !== this.game.aircraft) return false;
    const d = this._doorPoint(ac, _v);
    return Math.hypot(this.pos.x - d.x, this.pos.z - d.z) < FREE_ROAM.boardRadius;
  }

  // ------------------------------------------------------------ per frame
  // dt: 0 while paused. mouse: the frame's mouse (drag looks around).
  update(dt, mouse, live) {
    const g = this.game;
    if (this.state === FOOT.IN) {
      // Exit button: conditions 4 times a second.
      if ((this.checkT -= dt) <= 0) {
        this.checkT = 0.25;
        const c = this._baseConditions();
        let ok = !!c && !c.engineOn;
        if (ok) { this.exitSpot = this._findExitSpot(g.aircraft); ok = !!this.exitSpot; }
        this.canExit = ok;
        this._showButton(ok ? 'exit' : null);
        // Stopped at a base with the engine running: one hint.
        if (c?.engineOn && (this._engineHint += 0.25) > 4 && this._engineHint < 4.3) g.toast(t('Shut the engine down to get out of the aircraft.'));
        if (!c) this._engineHint = 0;
      }
      return false;
    }
    if (!this.ac || this.ac !== g.aircraft || !g.playing) { this.forceBoard(); return false; }
    try {
      this._walk(dt, mouse, live);
      this._camera(dt, mouse, live);
    } catch (e) {
      console.error(e);
      this.forceBoard();
      return false;
    }
    if (this.state === FOOT.EXITING && (this.tr += dt) > 0.45) this.state = FOOT.ON_FOOT;
    if (this.state === FOOT.ON_FOOT) {
      const near = this._nearOwnAircraft();
      this._showButton(near ? 'board' : null);
      if (near && live && g.input.wasPressed('interact')) this.board();
    }
    return true;
  }

  _walkInput(live) {
    const g = this.game, input = g.input;
    if (!live || this.state !== FOOT.ON_FOOT) return [0, 0];
    const d = input.down;
    const any = (...codes) => codes.some((c) => d.has(c));
    const act = (a) => input.isDown(a);
    let f = (any('KeyW', 'ArrowUp', 'Numpad8') || act('pitchDown') ? 1 : 0) - (any('KeyS', 'ArrowDown', 'Numpad5', 'Numpad2') || act('pitchUp') ? 1 : 0);
    let s = (any('KeyD', 'ArrowRight', 'Numpad6') || act('rollRight') ? 1 : 0) - (any('KeyA', 'ArrowLeft', 'Numpad4') || act('rollLeft') ? 1 : 0);
    const st = g.touch?.walk;
    if (g.touch?.active && st && (st.x || st.y)) { f = -st.y; s = st.x; }
    const l = Math.hypot(f, s);
    if (l > 1) { f /= l; s /= l; }
    return [f, s];
  }

  _walk(dt, mouse, live) {
    if (dt <= 0) return;
    const P = FREE_ROAM;
    const [f, s] = this._walkInput(live);
    const cy = this.cam.yaw + Math.PI; // direction the camera looks
    const fx = Math.sin(cy), fz = Math.cos(cy);
    const tx = (fx * f - fz * s) * P.walkSpeed, tz = (fz * f + fx * s) * P.walkSpeed;
    const k = 1 - Math.exp(-P.accel * dt / P.walkSpeed);
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.y += (tz - this.vel.y) * k;
    const sp = this.vel.length();
    if (sp > 0.02) {
      if (Math.hypot(this.pos.x - this.nearX, this.pos.z - this.nearZ) > 15) this._refreshNear(this.pos.x, this.pos.z);
      const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.y * dt;
      const inside = (x, z) => inZone(this.zone, x, z, P.exploreMargin);
      const try1 = (x, z) => inside(x, z) && !this._blocked(x, z, this._floor(x, z));
      if (try1(nx, nz)) { this.pos.x = nx; this.pos.z = nz; }
      else if (try1(nx, this.pos.z)) { this.pos.x = nx; this.vel.y = 0; }
      else if (try1(this.pos.x, nz)) { this.pos.z = nz; this.vel.x = 0; }
      else {
        this.vel.set(0, 0);
        if (!inside(nx, nz) && this.game.time - this._limitToast > 6) { this._limitToast = this.game.time; this.game.toast(t('Edge of the base — walk back towards the hangar.')); }
      }
      if (sp > 0.15) {
        const want = Math.atan2(this.vel.x, this.vel.y);
        let dy = want - this.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        this.yaw += dy * (1 - Math.exp(-10 * dt));
      }
    }
    this.pos.y = damp(this.pos.y, this._floor(this.pos.x, this.pos.z), 14, dt);
    const fig = this.figure;
    fig.root.position.copy(this.pos);
    fig.root.rotation.y = this.yaw;
    fig.animate(dt, this.vel.length());
  }

  _camera(dt, mouse, live) {
    const g = this.game, cam = g.camera, P = FREE_ROAM;
    if (live && mouse) {
      if (mouse.buttons & 1) {
        this.cam.yaw -= mouse.dx * 2.2;
        this.cam.pitch = clamp(this.cam.pitch + mouse.dy * 1.6, -0.25, 1.1);
      }
      if (mouse.wheel) this.cam.dist = clamp(this.cam.dist * (1 + mouse.wheel * 0.1), 2.2, 9);
    }
    // Head, then back along the view until something is in the way.
    const hx = this.pos.x, hy = this.pos.y + P.camHeight, hz = this.pos.z;
    const cp = Math.cos(this.cam.pitch);
    const dx = Math.sin(this.cam.yaw) * cp, dy = Math.sin(this.cam.pitch), dz = Math.cos(this.cam.yaw) * cp;
    let dist = this.cam.dist;
    for (let d = 0.4; d <= this.cam.dist; d += 0.25) {
      const x = hx + dx * d, y = hy + dy * d, z = hz + dz * d;
      if (this._pointBlocked(x, y, z)) { dist = Math.max(0.9, d - 0.35); break; }
    }
    const lift = dist < this.cam.dist ? clamp((this.cam.dist - dist) * 0.25, 0, 1.2) : 0;
    const tx = hx + dx * dist, tz = hz + dz * dist;
    let ty = hy + dy * dist + lift;
    ty = Math.max(ty, g.world.terrain.heightAt(tx, tz) + 0.4);
    _v.set(tx, ty, tz);
    if (this.state === FOOT.EXITING) {
      // Ease from where the camera was.
      const k = clamp(this.tr / 0.45, 0, 1), e = k * k * (3 - 2 * k);
      this.camPos.lerpVectors(this.camFrom, _v, e);
    } else this.camPos.lerp(_v, 1 - Math.exp(-14 * dt));
    if (dt <= 0 && this.state !== FOOT.EXITING) this.camPos.copy(_v);
    cam.position.copy(this.camPos);
    cam.up.set(0, 1, 0);
    cam.lookAt(hx, hy - 0.15, hz);
    cam.fov = damp(cam.fov, 60, 6, dt || 1);
    cam.near = 0.1;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  _pointBlocked(x, y, z) {
    for (const c of this.near) if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1 && y < c.top && !(y < (c.bottom ?? -Infinity))) return true;
    if (this.ac?.hitTest(x, y, z)) return true;
    const w = this.game.world;
    if (w.extraObstacle?.(x, y, z)) return true;
    return false;
  }
}
