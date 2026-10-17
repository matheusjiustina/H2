// Test/demo autopilot. Flies the aircraft only through the same virtual
// stick/throttle/rudder/brake inputs a player uses (no physics shortcuts), so
// it can validate a full contract: service, taxi, take-off, spray passes with
// turns, approach, landing, taxi back and shutdown.
import { clamp, wrapAngle, smoothstep } from '../core/math.js';
import { FlightModel } from '../flight/flightModel.js';
import { RUNWAY, BASE } from '../world/layout.js';
import { SPRAY } from '../config.js';

const G = 9.81;

export class Autopilot {
  constructor(game) {
    this.game = game;
    this.phase = null;
    this.log = [];
    this.att = {};
    this.t = 0;
    this.pt = 0;
  }

  get v() { return this.game.input.virtual; }

  engage(plan = 'contract') {
    this.plan = plan;
    const v = this.v;
    v.active = true; v.pitch = 0; v.roll = 0; v.yaw = 0; v.throttle = 0; v.brake = false; v.engine = false;
    this.set('service');
  }
  release() {
    const v = this.v;
    v.pitch = v.roll = v.yaw = 0; v.throttle = null; v.brake = false; v.engine = false;
    this.phase = null;
  }
  set(p) {
    this.phase = p;
    this.pt = 0;
    this.log.push({ t: +this.t.toFixed(1), phase: p });
    this.wp = null;
  }

  update(dt) {
    if (!this.phase) return;
    this.t += dt;
    this.pt += dt;
    const g = this.game;
    const ac = g.aircraft, fm = ac.fm, o = fm.out;
    FlightModel.attitude(fm, this.att);
    if (ac.state !== 'ok') { this.set('crashed'); this.release(); return; }
    const v = this.v;
    switch (this.phase) {
      case 'service': {
        v.throttle = 0; v.brake = false; v.engine = false;
        if (this.pt < 0.2) return;
        const job = g.job;
        if (!g.service.busy() && !this.requested) {
          const rec = job ? job.c.recommended : { fuel: 200, liquid: 600 };
          // Same scaling as the load sheet's recommendation for a bigger aircraft.
          const A = g.aircraft.A;
          g.requestService(rec.fuel * (A.fuelCapacity / 260), rec.liquid * (A.hopperCapacity / 900));
          this.requested = true;
        }
        if (this.requested && !g.service.busy()) { this.requested = false; this.set('start'); }
        return;
      }
      case 'start':
        v.engine = fm.engine === 'off';
        if (fm.engine === 'running' && this.pt > 1) { v.engine = false; this.set('taxiOut'); }
        return;
      case 'taxiOut': {
        this.wp ??= [[-341, -60], [-342, -44], [-350, -33], [-370, -30], [-382, -20], [-383, -6]];
        if (this._taxi(dt, this.wp, 5)) { this.set('lineup'); }
        return;
      }
      case 'lineup': {
        const done = this._taxi(dt, [[-360, 0]], 2.5, true);
        const hdgErr = wrapAngle(Math.PI / 2 - fm.heading());
        if (done || (Math.abs(hdgErr) < 0.05 && fm.pos.x > -385)) { this.set('takeoff'); fm.flapsCmd = 1 / 3; }
        return;
      }
      case 'takeoff': {
        v.brake = false;
        v.throttle = 1;
        const hdgErr = wrapAngle(Math.PI / 2 - fm.heading());
        // Rudder: positive = yaw right. Heading error positive -> need yaw left? heading increases toward north-east
        v.yaw = clamp(-hdgErr * 4 + fm.omega.y * 2.0 - o.beta * 0, -1, 1) * (o.onGround ? 1 : 0.3);
        v.roll = clamp(-this.att.bank * 2, -1, 1);
        const vs = Math.sqrt((2 * fm.mass * G) / (1.225 * fm.A.wingArea * 1.75));
        const vr = vs * 1.08;
        if (o.onGround) v.pitch = o.airspeed < 14 ? 0 : o.airspeed < vr ? -0.25 : 0.6;
        else v.pitch = clamp((0.16 - this.att.pitch) * 3 + (o.airspeed < vr ? -0.3 : 0), -1, 1);
        if (!o.onGround && o.agl > 15) { fm.flapsCmd = 0; this.set('route'); }
        return;
      }
      case 'route': {
        const g2 = g.guidance;
        if (!g.job || g.job.complete() || fm.hopper < 2) return this.set('approach');
        const next = g2.next;
        if (!next) return this.set('approach');
        this.pass = next;
        this.passDir = this._passDir(next);
        this.set('pass');
        return;
      }
      case 'pass':
        return this._pass(dt);
      case 'turnOut': {
        // Teardrop procedure turn (what ag pilots fly at the end of a pass):
        // pull up, turn 45° away from the next swath, then reverse 225°
        // toward it; L1 then aligns on the line well before the field edge.
        const gd = g.guidance;
        const hdg = Math.atan2(fm.vel.x, fm.vel.z);
        const passYaw = gd.axis === 'x' ? (this.outDir > 0 ? Math.PI / 2 : -Math.PI / 2) : (this.outDir > 0 ? 0 : Math.PI);
        if (this.pt < 0.05) {
          const next = gd.next;
          if (!g.job || g.job.complete() || fm.hopper < 2 || !next) return this.set('approach');
          this.pass = next;
          const rightSign = gd.axis === 'x' ? this.outDir : -this.outDir;
          const cur = gd.axis === 'x' ? fm.pos.z : fm.pos.x;
          this.turnRight = (next.c - cur) * rightSign >= 0;
          this.tdStage = 0;
        }
        if (g.sprayer.on) g.sprayer.toggle(false);
        const top = ac.env.top(fm.pos.x, fm.pos.z);
        const away = this.turnRight ? Math.PI / 4 : -Math.PI / 4; // + = left in yaw terms
        let bankCmd = 0;
        // Height for the whole balão: the highest clearance seen since the
        // pull-up began (obstacles leave the look-ahead while turning).
        this.tdWant = Math.max(this.pt < 0.05 ? 0 : this.tdWant || 0, top + fm.A.aglOffset + Math.max(28, this._clearance(), this._areaClearance()));
        if (this.tdStage === 0) {
          // Pull-up: wings level, firm pull, trade speed for height.
          bankCmd = clamp(-wrapAngle(passYaw - hdg) * 1.5, -0.3, 0.3);
          this._fly(bankCmd, this.tdWant, 34, dt, { kh: 1.2, maxClimb: 14, thrBase: 1, maxPitch: 0.45 });
          if (this.pt > 2 && (fm.pos.y > this.tdWant - 8 || this.pt > 5)) { this.tdStage = 1; this.tdT = 0; }
          return;
        } else if (this.tdStage === 1) {
          // Turn ~45° away at the top (climb wings-level first if still low).
          const climbFirst = fm.pos.y < this.tdWant - 6 && this._clearance(450) > 0;
          bankCmd = climbFirst ? 0 : clamp(-wrapAngle(passYaw + away - hdg) * 1.5, -0.6, 0.6);
          if (!climbFirst) this.tdT = (this.tdT || 0) + dt;
          if (this.tdT > 5 * (fm.A.assistSpeedScale ?? 1)) this.tdStage = 2;
        } else {
          // Steep reversal toward the next swath once high enough.
          const steep = fm.pos.y > this.tdWant - 4 ? 0.95 : 0.45;
          bankCmd = this.turnRight ? steep : -steep;
          const reverse = wrapAngle(passYaw + Math.PI);
          if (Math.abs(wrapAngle(reverse - hdg)) < 0.6) {
            this.passDir = -this.outDir;
            this.set('pass');
            return;
          }
        }
        // Keep the height of the top through the turn (no pushing over into
        // the trees); the descent to work height belongs to the next pass.
        this._fly(bankCmd, Math.max(this.tdWant, fm.pos.y - 4), 39, dt, { kh: 0.6, maxClimb: 7, maxSink: 2.5, thrBase: 0.75, minStick: -0.3 });
        return;
      }
      case 'approach':
        return this._approach(dt);
      case 'rollout': {
        v.throttle = 0;
        // Ease the stick back after touchdown so the tail settles instead of slamming.
        v.pitch = clamp((this.pt - 0.3) * 0.35, 0, 0.5);
        const hdgErr = wrapAngle(Math.PI / 2 - fm.heading());
        v.yaw = clamp(-hdgErr * 3 + fm.omega.y * 1.5, -1, 1);
        v.brake = o.airspeed < 24;
        if (o.groundSpeed < 3) { v.brake = false; this.set('taxiIn'); }
        return;
      }
      case 'taxiIn': {
        const x = fm.pos.x;
        // Slow down on the apron and keep north of the line to the pad: the
        // left wing passes the mixing station on the way in.
        this.wp ??= [[Math.min(x, -300), 0], [-378, 0], [-382, -14], [-382, -36, 4], [-378, -50, 3], [-370, -58, 3], [-361, -62, 2.5], [BASE.pad.x, BASE.pad.z, 2.5]];
        if (this._taxi(dt, this.wp, 6)) this.set('park');
        return;
      }
      case 'park':
        v.throttle = 0; v.brake = true;
        if (o.groundSpeed < 0.2 && this.pt > 1.0) {
          if (fm.engine !== 'off') { this.game.aircraft.stopEngine(); }
          v.brake = false;
          if (this.pt > 2.5) {
            if (g.job && !g.job.complete() && this.plan === 'contract') this.set('service');
            else { this.set('done'); }
          }
        }
        return;
      default:
        return;
    }
  }

  // Ground steering toward waypoints. Returns true when the last one is reached.
  _taxi(dt, pts, speed, final = false) {
    const ac = this.game.aircraft, fm = ac.fm, o = fm.out;
    const v = this.v;
    if (this.wi === undefined || this._wpRef !== pts) { this.wi = 0; this._wpRef = pts; }
    const [tx, tz, wpSpeed] = pts[this.wi];
    if (wpSpeed) speed = wpSpeed;
    const dx = tx - fm.pos.x, dz = tz - fm.pos.z;
    const d = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    const err = wrapAngle(want - fm.heading()); // positive -> target to the left
    const last = this.wi === pts.length - 1;
    if (d < (last ? 3.5 : 6)) {
      if (last) { v.throttle = 0; v.brake = true; v.yaw = 0; this.wi = undefined; return true; }
      this.wi++;
      return false;
    }
    const ae = Math.abs(err);
    const sp = o.groundSpeed;
    v.yaw = clamp(-err * 2.5 + fm.omega.y * 1.2, -1, 1);
    if (ae > 0.9) {
      // Pivot on the inner main wheel: full rudder + differential brake. Near
      // 180° the error flips sign every step; keep turning the same way.
      if (!this._pivotDir || ae < 2.6) this._pivotDir = err > 0 ? -1 : 1;
      v.yaw = this._pivotDir;
      v.brake = true;
      v.throttle = sp > 1.5 ? 0.15 : 0.42;
    } else {
      this._pivotDir = 0;
      const tgtSpeed = Math.min(speed, last ? Math.max(1.5, d * 0.35) : speed) * (ae > 0.4 ? 0.6 : 1);
      v.throttle = clamp(0.2 + (tgtSpeed - sp) * 0.15 + ae * 0.1, 0.05, 0.6);
      v.brake = sp > tgtSpeed + 1.0;
    }
    v.pitch = 0.4; // stick back: tail wheel stays planted
    v.roll = 0;
    void final; void dt;
    return false;
  }

  // Height above the local canopy/ground needed to clear trees, buildings and
  // wires along the next few hundred metres of the flight path.
  _clearance(look = 650) {
    const g = this.game, fm = g.aircraft.fm, env = g.aircraft.env;
    const gs = Math.max(5, Math.hypot(fm.vel.x, fm.vel.z));
    const dx = fm.vel.x / gs, dz = fm.vel.z / gs;
    let need = 0;
    for (let s = 0; s <= look; s += 25) {
      const x = fm.pos.x + dx * s, z = fm.pos.z + dz * s;
      const top = env.top(x, z);
      for (const h of [6, 12, 18, 24, 30, 36]) {
        if (g.world.obstacleAt(x, top + h, z)) need = Math.max(need, h + 10);
      }
      if (g.world.wireDistance(x, top + 8, z) < 25) need = Math.max(need, 22);
    }
    return need;
  }

  // Obstacle height around the aircraft (500 m radius), refreshed once a second.
  _areaClearance() {
    if (this._acT !== undefined && this.t - this._acT < 1) return this._acV;
    const g = this.game, fm = g.aircraft.fm, env = g.aircraft.env;
    let need = 0;
    for (let r = 0; r <= 800; r += 100) {
      const n = r === 0 ? 1 : Math.ceil((2 * Math.PI * r) / 100);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = fm.pos.x + Math.cos(a) * r, z = fm.pos.z + Math.sin(a) * r;
        const top = env.top(x, z);
        for (const h of [10, 20, 30, 40]) if (g.world.obstacleAt(x, top + h, z)) need = Math.max(need, h + 20);
      }
    }
    this._acT = this.t;
    this._acV = need;
    return need;
  }

  _passDir(p) {
    const g = this.game.guidance;
    const fm = this.game.aircraft.fm;
    // Fly the pass in the direction that needs the least turning from here.
    const along = g.axis === 'x' ? fm.pos.x : fm.pos.z;
    const mid = (g.l0 + g.l1) / 2;
    void p;
    return along < mid ? 1 : -1;
  }

  // Lateral L1 guidance onto a line (point + unit direction), returns bank command.
  _l1(px, pz, dx, dz, L1, maxBank) {
    const fm = this.game.aircraft.fm;
    // Same lateral acceleration for a faster aircraft: L1 grows with V².
    L1 *= (fm.A.assistSpeedScale ?? 1) ** 2;
    const rx = fm.pos.x - px, rz = fm.pos.z - pz;
    const along = rx * dx + rz * dz;
    const cross = rx * -dz + rz * dx; // positive: right of line? (dir rotated)
    const c = clamp(cross, -L1 * 0.95, L1 * 0.95);
    const ahead = Math.sqrt(L1 * L1 - c * c);
    const tx = px + dx * (along + ahead), tz = pz + dz * (along + ahead);
    const vx = fm.vel.x, vz = fm.vel.z;
    const V = Math.max(10, Math.hypot(vx, vz));
    const angV = Math.atan2(vx, vz), angT = Math.atan2(tx - fm.pos.x, tz - fm.pos.z);
    const eta = wrapAngle(angT - angV); // positive: target to the left (yaw convention)
    const a = (2 * V * V / L1) * Math.sin(clamp(eta, -Math.PI / 2, Math.PI / 2));
    // Positive eta (left) -> bank left (negative bank in our convention).
    return { bank: clamp(-Math.atan(a / G), -maxBank, maxBank), cross, along };
  }

  _fly(bankCmd, altTarget, speedTarget, dt, opts = {}) {
    const ac = this.game.aircraft, fm = ac.fm, o = fm.out;
    const v = this.v;
    const bank = this.att.bank, pitch = this.att.pitch;
    v.roll = clamp((bankCmd - bank) * 2.2 - fm.omega.z * 0.4, -1, 1);
    const hErr = altTarget - (opts.height ?? fm.pos.y);
    const vsT = clamp(hErr * (opts.kh ?? 0.35), -(opts.maxSink ?? 4), opts.maxClimb ?? 4);
    const pitchT = clamp(0.03 + (vsT - o.vs) * 0.08 + (vsT / Math.max(20, o.airspeed)), -0.25, opts.maxPitch ?? 0.3);
    v.pitch = clamp((pitchT - pitch) * 3.5 + fm.omega.x * 1.0, opts.minStick ?? -1, 1);
    if (Math.abs(v.pitch) < 0.06) v.pitch = Math.sign(v.pitch || 1) * 0.06;
    v.throttle = clamp((opts.thrBase ?? 0.62) + (speedTarget * (fm.A.assistSpeedScale ?? 1) - o.airspeed) * 0.08 + vsT * 0.04, 0, 1);
    v.yaw = 0;
    void dt;
  }

  _pass(dt) {
    const g = this.game, gd = g.guidance, ac = g.aircraft, fm = ac.fm, o = fm.out;
    const p = this.pass;
    if (!g.job) return this.set('approach');
    const dir = this.passDir;
    const axisX = gd.axis === 'x';
    const dx = axisX ? dir : 0, dz = axisX ? 0 : dir;
    const lineStart = dir > 0 ? gd.l0 - 1400 : gd.l1 + 1400;
    const px = axisX ? lineStart : p.c, pz = axisX ? p.c : lineStart;
    // Distance to the line decides how aggressively to manoeuvre.
    const crossNow = (fm.pos.x - px) * -dz + (fm.pos.z - pz) * dx;
    const far = Math.abs(crossNow) > 60 * (fm.A.assistSpeedScale ?? 1);
    const maxBank = o.agl < 10 ? 0.3 : far ? 0.75 : 0.6;
    const { bank, cross, along } = this._l1(px, pz, dx, dz, far ? 220 : 150, maxBank);
    // Position along the pass relative to the field span.
    const a = axisX ? fm.pos.x : fm.pos.z;
    const inSpan = dir > 0 ? a > gd.l0 - 60 && a < gd.l1 + 40 : a < gd.l1 + 60 && a > gd.l0 - 40;
    const established = Math.abs(cross) < 6 && Math.abs(wrapAngle(Math.atan2(fm.vel.x, fm.vel.z) - Math.atan2(dx, dz))) < 0.15;
    const top = ac.env.top(fm.pos.x, fm.pos.z);
    let alt;
    // Descend on the lead-in so the aircraft is at work height at the edge.
    const lead = dir > 0 ? a - (gd.l0 - 1000) : gd.l1 + 1000 - a;
    const workZone = lead > 0 && (dir > 0 ? a < gd.l1 + 40 : a > gd.l0 - 40);
    if (workZone && Math.abs(cross) < 12) alt = top + fm.A.aglOffset + 3.6; // CG height for ~3.3 m wheel height over the canopy
    else alt = top + fm.A.aglOffset + Math.max(far ? 35 : 22, this._clearance());
    // Look ahead for terrain/canopy/trees/wires.
    let ahead = top;
    const ux = fm.vel.x / Math.max(1, o.groundSpeed), uz = fm.vel.z / Math.max(1, o.groundSpeed);
    for (let s = 10; s <= 260; s += 10) {
      for (const lat of [-6, 0, 6]) {
        const x = fm.pos.x + ux * s - uz * lat, z = fm.pos.z + uz * s + ux * lat;
        if (s <= 90) ahead = Math.max(ahead, ac.env.top(x, z)); // terrain/canopy: short look
        if (g.world.obstacleAt(x, fm.pos.y - 2, z)) ahead = Math.max(ahead, fm.pos.y + 25); // trees: long look
      }
      const x = fm.pos.x + ux * s, z = fm.pos.z + uz * s;
      if (s <= 160 && g.world.wireDistance(x, fm.pos.y, z) < 18) ahead = Math.max(ahead, fm.pos.y + 15);
    }
    if (ahead > top + 2) alt = Math.max(alt, ahead + 4.5 + fm.A.aglOffset);
    this._fly(bank, alt, inSpan && established ? 46 : 44, dt, { kh: workZone ? 0.45 : 0.35, maxSink: workZone && alt - fm.pos.y > -8 ? 1.8 : 3.0 });
    // Spray only over a target field, never over gaps.
    const over = g.job.fields.some((f) => fm.pos.x > f.x0 + 2 && fm.pos.x < f.x1 - 2 && fm.pos.z > f.z0 + 2 && fm.pos.z < f.z1 - 2);
    const want = over && established && ac.workHeight() < 8 && fm.hopper > 0.5;
    if (want !== g.sprayer.on) g.sprayer.toggle(want);
    // Pass finished?
    const beyond = dir > 0 ? a > gd.l1 + 60 : a < gd.l0 - 60;
    if (beyond) {
      if (g.sprayer.on) g.sprayer.toggle(false);
      this.outDir = dir;
      this.set('turnOut');
      return;
    }
    if (fm.hopper <= 0.5 || g.job.complete()) { if (g.sprayer.on) g.sprayer.toggle(false); if (!inSpan) this.set('approach'); }
  }

  _approach(dt) {
    const g = this.game, ac = g.aircraft, fm = ac.fm, o = fm.out;
    const v = this.v;
    // Runway 09: final from the west along z = 0.
    const thrX = RUNWAY.x0 + 40;
    const dist = thrX - fm.pos.x; // >0 when west of the touchdown point
    // First fly to a fix 2.2 km west of the threshold (north of the base), then the final.
    if (this.pt < 0.05) this.apStage = fm.pos.x > thrX - 1500 ? 0 : 1;
    if (this.apStage === 0) {
      const fx = thrX - 2200, fz = -500;
      const want = Math.atan2(fx - fm.pos.x, fz - fm.pos.z);
      const err = wrapAngle(want - Math.atan2(fm.vel.x, fm.vel.z));
      this._fly(clamp(-err * 1.4, -0.6, 0.6), ac.env.top(fm.pos.x, fm.pos.z) + fm.A.aglOffset + 90, 44, dt, { kh: 0.3 });
      if (Math.hypot(fx - fm.pos.x, fz - fm.pos.z) < 350) this.apStage = 1;
      return;
    }
    const { bank } = this._l1(thrX - 3000, RUNWAY.z, 1, 0, o.agl < 30 ? 90 : 220, o.agl < 30 ? 0.25 : 0.6);
    // On final from 3 km out until the far part of the strip.
    const onFinal = dist > -520 && dist < 3000 && Math.abs(fm.pos.z - RUNWAY.z) < 60 && Math.abs(wrapAngle(fm.heading() - Math.PI / 2)) < 0.35;
    let alt;
    if (!onFinal) alt = Math.max(ac.env.top(fm.pos.x, fm.pos.z) + 60, 70);
    else alt = Math.max(0.5, Math.tan((3.2 * Math.PI) / 180) * dist) + fm.A.aglOffset;
    fm.flapsCmd = onFinal && dist < 2200 ? 2 / 3 : 0;
    const vs0 = Math.sqrt((2 * fm.mass * G) / (1.225 * fm.A.wingArea * 1.95));
    const vref = Math.max(30 * (fm.A.assistSpeedScale ?? 1), vs0 * 1.3) / (fm.A.assistSpeedScale ?? 1);
    if (o.agl > 5 || !onFinal) {
      this._fly(bank, alt, onFinal ? vref : 42, dt, { kh: onFinal ? 0.5 : 0.3, maxSink: 4.5, thrBase: 0.45 });
    } else {
      // Flare: raise the nose to arrest the sink, wings level. Idle when light;
      // a loaded aircraft keeps some power until just above the ground.
      const r = fm.A.mtow / 1800;
      const load = clamp((fm.mass - 1450 * r) / (650 * r), 0, 1);
      v.throttle = load * 0.35 * smoothstep(0.3, 2.5, o.agl);
      v.roll = clamp((0 - this.att.bank) * 2, -1, 1);
      // Aim for the three-point attitude close to the ground so mains and
      // tailwheel touch together (ground effect pitches the nose down).
      const vsT = -0.35 - o.agl * 0.12;
      const near = 1 - smoothstep(0.8, 4, o.agl);
      const tgtPitch = 0.12 + 0.07 * near;
      v.pitch = clamp((vsT - o.vs) * 0.6 + (tgtPitch - this.att.pitch) * (0.8 + 2.2 * near), -0.4, 1);
      const hdgErr = wrapAngle(Math.PI / 2 - fm.heading());
      v.yaw = clamp(-hdgErr * 2, -1, 1);
    }
    if (o.onGround) this.set('rollout');
    if (fm.pos.x > RUNWAY.x0 + 420 && !o.onGround) {
      // Too long: go around via the fix again.
      this.set('approach');
      this.apStage = 0;
      this.pt = 1;
    }
    void SPRAY;
  }
}
