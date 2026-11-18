// Test/demo autopilot for the helicopter. Like the airplane autopilot it
// flies only through the player's inputs (virtual cyclic, pedals, collective
// rate, engine switch) with the assist's 'auto' mode (the beginner laws plus
// a climb-rate lever) engaged, so a full contract can
// be validated end to end: service on the helipad, start and spool-up,
// vertical lift-off, transit, spray passes with hover turnarounds at the
// field ends, return, hover over the H, vertical landing, collective down,
// shutdown, rotor run-down, and the next service.
import { clamp, wrapAngle } from '../core/math.js';
import { FlightModel } from '../flight/flightModel.js';

const KT = 1.943844;

export class HeliAutopilot {
  constructor(game) {
    this.game = game;
    this.phase = null;
    this.log = [];
    this.att = {};
    this.t = 0;
    this.pt = 0;
    this.iv = 0;
  }

  get v() { return this.game.input.virtual; }

  engage(plan = 'contract') {
    this.plan = plan;
    const v = this.v;
    v.active = true; v.pitch = 0; v.roll = 0; v.yaw = 0; v.throttle = null; v.leverRate = 0; v.engine = false;
    this.set('service');
  }
  release() {
    const v = this.v;
    v.pitch = v.roll = v.yaw = 0; v.leverRate = 0; v.engine = false;
    this.phase = null;
  }
  set(p) {
    this.phase = p;
    this.pt = 0;
    this.log.push({ t: +this.t.toFixed(1), phase: p });
  }

  update(dt) {
    if (!this.phase || this.phase === 'done') return;
    this.t += dt;
    this.pt += dt;
    const g = this.game, ac = g.aircraft, fm = ac.fm, o = fm.out, v = this.v;
    if (ac.kind !== 'heli') return;
    if (ac.state !== 'ok') { this.set('crashed'); this.release(); return; }
    FlightModel.attitude(fm, this.att);
    switch (this.phase) {
      case 'service': {
        this._neutral();
        if (this.pt < 0.3) return;
        if (!g.service.busy() && !this.requested) {
          const job = g.job, A = ac.A;
          const rec = job ? job.c.recommended : { fuel: 200, liquid: 600 };
          g.requestService(rec.fuel * (A.fuelCapacity / 260), rec.liquid * (A.hopperCapacity / 900));
          this.requested = true;
        }
        if (this.requested && !g.service.busy()) { this.requested = false; this.set('start'); }
        return;
      }
      case 'start':
        this._neutral();
        v.engine = fm.engine === 'off' && this.pt < 1;
        if (fm.engine === 'running') { v.engine = false; this.set('spool'); }
        if (this.pt > 6 && fm.engine === 'off') this.set('start');
        return;
      case 'spool':
        this._neutral();
        if (fm.phase === 'flight' && o.rotorPct > fm.A.rotor.govPct - 1 && this.pt > 2) this.set('liftoff');
        return;
      case 'liftoff': {
        // Collective up until light on the skids and off; then climb vertically.
        v.pitch = v.roll = v.yaw = 0;
        if (o.onGround || o.agl < 1.5) { v.leverRate = 1; return; }
        v.leverRate = clamp((this._transit() - ac.workHeight()) * 0.3, -1, 1);
        if (ac.workHeight() > this._transit() - 3) this.set('route');
        return;
      }
      case 'route': {
        if (!g.job || g.job.complete() || fm.hopper < 2) return this.set('return');
        const next = g.guidance.next;
        if (!next) return this.set('return');
        this.pass = next;
        this.passDir = this._passDir();
        this.set('pass');
        return;
      }
      case 'pass':
        return this._pass(dt);
      case 'turn':
        return this._turn(dt);
      case 'return':
        return this._return(dt);
      case 'land': {
        // Over the H: hold the spot and heading, descend slowly, touch down.
        const pad = ac.type.servicePad;
        this._hoverAt(pad.x, pad.z, pad.heading, dt);
        const hgt = fm.pos.y + fm.A.skids[0][1] - ac.env.ground(fm.pos.x, fm.pos.z);
        v.leverRate = o.onGround ? -1 : hgt > 2 ? -0.5 : -0.25;
        if (o.onGround && this.pt > 1) this.set('down');
        return;
      }
      case 'down':
        // Collective full down, then shut down and wait for the rotor to stop.
        this._neutral();
        v.leverRate = -1;
        if (this.pt > 3 && ac.lever < 0.02) { this.set('shutdown'); }
        return;
      case 'shutdown':
        this._neutral();
        v.leverRate = -1;
        v.engine = this.pt < 0.1;
        if (fm.engine === 'off' && this.pt > 0.2) { v.engine = false; this.set('rundown'); }
        return;
      case 'rundown':
        this._neutral();
        if (o.rotorPct < 0.5) {
          if (g.job && !g.job.complete() && this.plan === 'contract') this.set('service');
          else this.set('done');
        }
        return;
      default:
    }
  }

  _neutral() { const v = this.v; v.pitch = v.roll = v.yaw = 0; v.leverRate = 0; }

  // Transit height (lowest work point over the canopy).
  _transit() { return 18; }

  _passDir() {
    const g = this.game.guidance, fm = this.game.aircraft.fm;
    const along = g.axis === 'x' ? fm.pos.x : fm.pos.z;
    return along < (g.l0 + g.l1) / 2 ? 1 : -1;
  }

  // Cyclic/pedal/collective for a ground-velocity target (m/s, world) at a
  // work height, pointing the nose along `hdg` (null: keep the track).
  _flyVel(vx, vz, hgtT, hdg, dt) {
    const ac = this.game.aircraft, fm = ac.fm, o = fm.out, v = this.v;
    const h = fm.heading();
    const fx = Math.sin(h), fz = Math.cos(h);
    // Body-axis components (forward, right).
    const vf = fm.vel.x * fx + fm.vel.z * fz, vr = -(fm.vel.x * fz - fm.vel.z * fx);
    const tf = vx * fx + vz * fz, tr = -(vx * fz - vz * fx);
    this.iv = clamp(this.iv + (tf - vf) * dt * 0.01, -0.12, 0.12);
    const pitchT = clamp(-(tf - vf) * 0.035 - this.iv - 0.01 * Math.min(tf, 30) / 30, -0.3, 0.22);
    // The assist's stick law is pRef + stick·0.32, where pRef is the attitude
    // it captured when the stick came off centre: command relative to it.
    const ref = ac.assist?.pHeld ? ac.assist.pRef : 0;
    v.pitch = clamp((pitchT - ref) / 0.32, -1, 1);
    if (Math.abs(v.pitch) < 0.03) v.pitch = 0.03 * Math.sign(v.pitch || -1);
    const V = Math.hypot(fm.vel.x, fm.vel.z);
    if (hdg === null && V > 15) {
      // Coordinated turn onto the velocity target.
      const want = Math.atan2(vx, vz), cur = Math.atan2(fm.vel.x, fm.vel.z);
      const bankT = clamp(-wrapAngle(want - cur) * 1.2, -0.42, 0.42);
      v.roll = clamp(bankT / 0.48, -1, 1);
      v.yaw = 0;
    } else {
      v.roll = clamp(((tr - vr) * 0.06) / 0.48, -0.8, 0.8);
      const hd = hdg ?? Math.atan2(vx, vz);
      v.yaw = clamp(-wrapAngle(hd - h) * 1.4, -1, 1);
      if (Math.abs(v.yaw) < 0.03) v.yaw = 0;
    }
    if (Math.abs(v.roll) < 0.03) v.roll = 0.03 * Math.sign(v.roll || 1);
    const e = hgtT - ac.workHeight();
    v.leverRate = Math.abs(e) < 0.15 ? 0 : clamp(e * 0.45 - o.vs * 0.05, -1, 1);
  }

  // Hold a point (and heading) in the hover.
  _hoverAt(x, z, hdg, dt) {
    const fm = this.game.aircraft.fm;
    const dx = x - fm.pos.x, dz = z - fm.pos.z, d = Math.hypot(dx, dz);
    const sp = clamp(d * 0.4, 0, 6);
    this._flyVel(d > 0.05 ? (dx / d) * sp : 0, d > 0.05 ? (dz / d) * sp : 0, this.game.aircraft.workHeight(), hdg, dt);
  }

  // Something ahead (trees, wires, buildings) within `range` at work height?
  _clearance(range = 160) {
    // Re-probed every 0.3 s (the probe is ~250 obstacle queries). A find is
    // held for 4 s, so climbing over an obstacle does not lose it again.
    if (this._clrT !== undefined && this.t - this._clrT < 0.3 && this._clrR === range) return this._clr;
    this._clrT = this.t; this._clrR = range;
    const need = this._probe(range);
    if (need > 0) { this._clrNeed = Math.max(need, this.t < (this._clrUntil ?? -1) ? this._clrNeed : 0); this._clrUntil = this.t + 4; }
    return (this._clr = this.t < (this._clrUntil ?? -1) ? this._clrNeed : 0);
  }

  _probe(range) {
    const g = this.game, fm = g.aircraft.fm;
    if (range < 0) return 0;
    const V = Math.max(1, Math.hypot(fm.vel.x, fm.vel.z));
    const ux = fm.vel.x / V, uz = fm.vel.z / V;
    let need = 0;
    // The rotor disc is 10 m wide: probe the path, both tip tracks and a
    // margin outside them, from the skids up to the rotor.
    for (let s = -10; s <= range; s += 10) {
      for (const lat of [-8, -4, 0, 4, 8]) {
        const x = fm.pos.x + ux * s - uz * lat, z = fm.pos.z + uz * s + ux * lat;
        for (const dy of [-3, 0, 2]) if (g.world.obstacleAt(x, fm.pos.y + dy, z)) need = 24;
        if (g.world.wireDistance(x, fm.pos.y - 1.5, z) < 15) need = Math.max(need, 16);
      }
    }
    return need;
  }

  _pass(dt) {
    const g = this.game, gd = g.guidance, ac = g.aircraft, fm = ac.fm;
    if (!g.job) return this.set('return');
    const p = this.pass, dir = this.passDir, axisX = gd.axis === 'x';
    const dx = axisX ? dir : 0, dz = axisX ? 0 : dir;
    const a = axisX ? fm.pos.x : fm.pos.z;
    const cross = axisX ? (fm.pos.z - p.c) : (fm.pos.x - p.c);
    // Velocity target: along the pass, plus a pull onto the line.
    const lead = dir > 0 ? a - (gd.l0 - 220) : gd.l1 + 220 - a; // distance into the run-in
    const workZone = lead > 0 && (dir > 0 ? a < gd.l1 + 25 : a > gd.l0 - 25);
    const far = Math.abs(cross) > 40 || lead < -60;
    const spd = workZone ? 23 : 30; // ≈ 45 kt over the crop, ≈ 58 kt in transit
    const corr = clamp(-cross * (far ? 0.25 : 0.35), -12, 12);
    let tx = dx * spd + (axisX ? 0 : corr), tz = dz * spd + (axisX ? corr : 0);
    if (far && lead < 0) {
      // Head for the run-in point first.
      const sx = axisX ? (dir > 0 ? gd.l0 - 220 : gd.l1 + 220) : p.c, sz = axisX ? p.c : (dir > 0 ? gd.l0 - 220 : gd.l1 + 220);
      const ex = sx - fm.pos.x, ez = sz - fm.pos.z, d = Math.hypot(ex, ez);
      tx = (ex / d) * spd; tz = (ez / d) * spd;
    }
    const aligned = Math.abs(cross) < 4 && Math.abs(wrapAngle(Math.atan2(fm.vel.x, fm.vel.z) - Math.atan2(dx, dz))) < 0.12;
    let hgt = workZone && Math.abs(cross) < 15 ? 3.0 : this._transit();
    hgt = Math.max(hgt, this._clearance());
    this._flyVel(tx, tz, hgt, null, dt);
    const over = g.job.fields.some((f) => fm.pos.x > f.x0 + 2 && fm.pos.x < f.x1 - 2 && fm.pos.z > f.z0 + 2 && fm.pos.z < f.z1 - 2);
    const want = over && aligned && ac.workHeight() < 5.5 && fm.hopper > 0.5;
    if (want !== g.sprayer.on) g.sprayer.toggle(want);
    const beyond = dir > 0 ? a > gd.l1 + 35 : a < gd.l0 - 35;
    if (beyond || fm.hopper <= 0.5 || g.job.complete()) {
      if (g.sprayer.on) g.sprayer.toggle(false);
      this.outDir = dir;
      this.set(fm.hopper <= 0.5 || g.job.complete() ? 'return' : 'turn');
    }
  }

  // Field-end turnaround as helicopter ag pilots fly it: flare to a stop
  // just past the edge, climb a little, pedal-turn 180° in the hover,
  // side-step to the next pass, then dive back into the run.
  _turn(dt) {
    const g = this.game, gd = g.guidance, ac = g.aircraft, fm = ac.fm, o = fm.out;
    const axisX = gd.axis === 'x';
    if (this.pt < 0.05) {
      const next = gd.next;
      if (!g.job || g.job.complete() || fm.hopper < 2 || !next) return this.set('return');
      this.pass = next;
      this.stopAt = null;
    }
    const newDir = -this.outDir;
    const hd = Math.atan2(axisX ? newDir : 0, axisX ? 0 : newDir);
    if (!this.stopAt) {
      // Flare to a stop (nose up, climbing a little), then turn where it stopped.
      this._flyVel(0, 0, 6, null, dt);
      if (o.groundSpeed < 4 || this.pt > 10) this.stopAt = { x: fm.pos.x, z: fm.pos.z };
      return;
    }
    const sx = axisX ? this.stopAt.x : this.pass.c, sz = axisX ? this.pass.c : this.stopAt.z;
    this._hoverAt(sx, sz, hd, dt);
    const v = this.v;
    const e = 6 - ac.workHeight();
    v.leverRate = Math.abs(e) < 0.2 ? 0 : clamp(e * 0.45, -1, 1);
    const herr = Math.abs(wrapAngle(hd - fm.heading()));
    const d = Math.hypot(sx - fm.pos.x, sz - fm.pos.z);
    if (herr < 0.15 && d < 4) { this.passDir = newDir; this.set('pass'); }
  }

  _return(dt) {
    const g = this.game, ac = g.aircraft, fm = ac.fm, o = fm.out;
    if (g.sprayer.on) g.sprayer.toggle(false);
    const pad = ac.type.servicePad;
    const ex = pad.x - fm.pos.x, ez = pad.z - fm.pos.z, d = Math.hypot(ex, ez);
    const sp = clamp(d * 0.09, 0, 30);
    // Stay over obstacles on the way in (a lone tree sits east of the pad).
    const hgt = Math.max(Math.min(this._transit(), Math.max(4, d * 0.15)), this._clearance(Math.min(160, Math.round((d - 8) / 10) * 10)));
    this._flyVel((ex / Math.max(d, 1)) * sp, (ez / Math.max(d, 1)) * sp, hgt, d < 40 ? pad.heading : null, dt);
    if (d < 2.5 && o.groundSpeed < 1) this.set('land');
  }
}
