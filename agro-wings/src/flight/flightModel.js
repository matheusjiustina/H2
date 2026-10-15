// Six-degree-of-freedom flight model.
//
// Ported from the Tidemark floatplane model (same aerodynamic equations,
// stability derivatives, stall blending, prop-wash on the tail, engine torque
// and p-factor, ground effect and gyroscopic terms). Changes for AGRO WINGS:
//   * floats replaced by a taildragger gear: spring/damper struts, rolling
//     resistance per surface, brakes (differential with rudder), steerable
//     tailwheel and small ground irregularities;
//   * mass, inertia and CG change with fuel and hopper load;
//   * fuel burn and fuel starvation;
//   * crop canopy drag when wheels/booms run through a field.
//
// Body frame: +Z nose, +Y up, +X left wing. omega is stored in body frame:
// +x = nose down, +y = yaw left, +z = roll right (the Tidemark convention).

import { Vector3, Quaternion } from 'three';
import { FLIGHT, UNITS } from '../config.js';
import { clamp, lerp, smoothstep } from '../core/math.js';

const G = 9.81;
const UP = new Vector3(0, 1, 0);
const _v1 = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3(), _v4 = new Vector3();
const _air = new Vector3(), _aero = new Vector3(), _lift = new Vector3(), _dir = new Vector3();
const _r = new Vector3(), _vc = new Vector3(), _f = new Vector3(), _t = new Vector3();
const _n = new Vector3(), _fw = new Vector3(), _side = new Vector3(), _wOmega = new Vector3();
const _qInv = new Quaternion(), _dq = new Quaternion(), _qs = new Quaternion();
const _nrm = { x: 0, y: 1, z: 0 };

// Cheap deterministic bump field for the wheels (cm-scale irregularities).
function bump(x, z) {
  return Math.sin(x * 1.7 + z * 0.3) * 0.5 + Math.sin(x * 0.37 - z * 2.3) * 0.35 + Math.sin(x * 4.1 + z * 3.3) * 0.15;
}

export class FlightModel {
  constructor(A = FLIGHT) {
    this.A = A;
    this.pos = new Vector3();
    this.vel = new Vector3();
    this.quat = new Quaternion();
    this.omega = new Vector3();
    // Controls (-1..1) and systems.
    this.elevator = 0; this.aileron = 0; this.rudder = 0; this.trim = 0;
    this.throttle = 0; this.flaps = 0; this.flapsCmd = 0;
    this.brake = 0; this.parkBrake = false;
    this.engine = 'off'; this.crankTime = 0; this.rpm = 0; this.roughness = 0;
    this.fuel = A.fuelCapacity * 0.6;
    this.hopper = 0;
    this.extraDrag = 0; // spray valve, damage
    this.stallWobble = 0;
    this.gear = A.gear.map((g) => ({
      ...g, pv: new Vector3(...g.p), compression: 0, onGround: false, spin: 0, steerAngle: 0, prevPen: -1, load: 0,
    }));
    this.hard = A.hard.map((h) => ({ ...h, pv: new Vector3(...h.p), prev: -1 }));
    this.out = {
      airspeed: 0, groundSpeed: 0, alpha: 0, beta: 0, stall: 0, agl: 100, onGround: false, wheelsOnGround: 0,
      thrust: 0, gLoad: 1, vs: 0, cropDepth: 0, surface: 'grass', density: 1.225, mass: 0,
    };
    this.events = [];
    this._force = new Vector3(); this._torque = new Vector3(); this._accel = new Vector3();
    this.inertia = new Vector3();
    this.updateMass();
  }

  updateMass() {
    const A = this.A;
    const fuelKg = this.fuel * A.fuelDensity;
    const hopKg = this.hopper * A.liquidDensity;
    this.mass = A.emptyMass + A.pilotMass + fuelKg + hopKg;
    const [ip, iy, ir] = A.inertiaEmpty;
    const dz = A.hopperOffsetZ;
    this.inertia.set(
      ip + hopKg * (dz * dz + 0.18),
      iy + hopKg * (dz * dz + 0.16) + fuelKg * A.fuelTankSpanY ** 2,
      ir + hopKg * 0.12 + fuelKg * A.fuelTankSpanY ** 2,
    );
    this.out.mass = this.mass;
  }

  reset(p, heading, { speed = 0, engineOn = false, flaps = 0 } = {}) {
    this.pos.copy(p);
    this.quat.setFromAxisAngle(UP, heading);
    this.vel.set(Math.sin(heading), 0, Math.cos(heading)).multiplyScalar(speed);
    this.omega.set(0, 0, 0);
    this.elevator = this.aileron = this.rudder = 0;
    this.trim = speed > 0 ? 0.12 : 0;
    this.throttle = engineOn ? 0.62 : 0;
    this.flaps = this.flapsCmd = flaps;
    this.engine = engineOn ? 'running' : 'off';
    this.rpm = engineOn ? 2200 : 0;
    this.brake = 0;
    this.stallWobble = 0;
    for (const g of this.gear) { g.prevPen = -1; g.compression = 0; g.onGround = false; }
    for (const h of this.hard) h.prev = -1;
    this.updateMass();
  }

  // Place the aircraft at rest on its three wheels.
  settleOnGround(x, z, heading, env) {
    const A = this.A;
    const m = A.gear[0].p, t = A.gear[2].p;
    // Three-point attitude from the gear geometry with nominal static compression.
    const sm = 0.06, st = 0.04;
    const pitch = Math.atan2((t[1] + st) - (m[1] + sm), m[2] - t[2]); // positive = nose up
    const q = new Quaternion().setFromAxisAngle(UP, heading);
    const qp = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -pitch);
    this.reset(new Vector3(x, 0, z), heading);
    this.quat.copy(q).multiply(qp);
    // Lift until the main wheels sit at their static compression.
    const r = _r.set(...m).applyQuaternion(this.quat);
    const gh = env.ground(x + r.x, z + r.z);
    this.pos.y = gh - r.y - sm;
  }

  step(dt, env) {
    const A = this.A;
    const q = this.quat;
    const force = this._force.set(0, 0, 0);
    const torque = this._torque.set(0, 0, 0);
    _qInv.copy(q).invert();
    this.events.length = 0;

    this._engine(dt, env);

    // --- air data -------------------------------------------------------
    const altMSL = this.pos.y + UNITS.altOffsetM;
    const rho = 1.225 * Math.exp(-Math.max(0, altMSL) / 8500);
    const air = _air.copy(this.vel).sub(env.wind).applyQuaternion(_qInv);
    const u = air.length();
    const fwd = air.z, side = -air.x, down = -air.y;
    const alpha = Math.atan2(down, Math.max(Math.abs(fwd), 0.001)) * (fwd >= 0 ? 1 : -1);
    const beta = u > 0.5 ? Math.asin(clamp(side / u, -1, 1)) : 0;
    const qd = 0.5 * rho * u * u;
    const top = env.top(this.pos.x, this.pos.z);
    const wingH = this.pos.y - 0.55 - top;
    const ge = (16 * Math.max(0.1, wingH) / A.span) ** 2;
    const geB = ge / (1 + ge);
    const sigma = rho / 1.225;
    const S = this.rpm / A.maxRpm;
    const ceiling = smoothstep(4400, 3000, altMSL);
    const power = A.maxPower * Math.pow(Math.max(S, 0), 1.5) * sigma * ceiling;
    // Tidemark thrust law (static vs power-limited), plus two additions for a
    // fixed-pitch prop: static thrust fades as airspeed approaches the blade
    // pitch speed, and a slow-turning prop windmills (drag) — so idle gives a
    // real glide instead of a gentle push.
    const pitchSpeed = Math.max(S, 0.05) * A.propPitchSpeed;
    const staticT = A.staticThrust * S * S * sigma * (1 - 0.6 * Math.min(1, u / pitchSpeed));
    const windmill = 0.5 * rho * u * u * Math.PI * A.propRadius ** 2 * 0.12 * (1 - smoothstep(0.25, 0.6, S));
    const thrust = (this.engine === 'off' ? 0 : Math.min(staticT, (A.propEfficiency * power) / Math.max(u, 6))) - windmill;
    this.out.thrust = thrust;

    // --- forces (body frame) ------------------------------------------
    let CL = 0, CD = 0, stall = 0;
    const aero = _aero.set(0, 0, 0);
    if (u > 0.5) {
      const fl = this.flaps;
      const aStall = A.alphaStall - fl * 0.035;
      const lin = (a) => A.CL0 + A.CLa * a + A.CLflap * fl;
      const flat = 1.05 * Math.sin(2 * alpha); // post-stall flat-plate lift
      if (alpha > aStall) {
        const e = alpha - aStall;
        stall = smoothstep(0, 0.1, e);
        CL = lerp(lin(aStall) - e * 2.2, flat, smoothstep(0.02, 0.3, e));
      } else if (alpha < A.alphaStallNeg) {
        const e = A.alphaStallNeg - alpha;
        stall = smoothstep(0, 0.1, e) * 0.6;
        CL = lerp(lin(A.alphaStallNeg) + e * 2.2, flat, smoothstep(0.02, 0.3, e));
      } else CL = lin(alpha);
      CL *= 1 + 0.12 * (1 - geB);
      const aspect = (A.span * A.span) / A.wingArea;
      const CDi = (CL * CL) / (Math.PI * A.oswald * aspect) * geB;
      const s2 = Math.sin(alpha) ** 2;
      CD = A.CD0 + this.extraDrag + A.CDflap * fl + CDi + 1.1 * stall * s2 + Math.abs(beta) * 0.25
        + 0.5 * s2 * smoothstep(0.5, 1.2, Math.abs(alpha));
      const dir = _dir.copy(air).divideScalar(u);
      _lift.set(1, 0, 0);
      _lift.crossVectors(dir, _lift).normalize();
      aero.copy(_lift).multiplyScalar(CL * qd * A.wingArea);
      aero.addScaledVector(dir, -CD * qd * A.wingArea);
      const CY = A.CYb * beta + A.CYdr * this.rudder;
      aero.x -= CY * qd * A.wingArea;
    }
    aero.z += thrust;
    aero.applyQuaternion(q);
    force.add(aero);
    force.y -= this.mass * G;

    // Hopper weight acts slightly ahead of the reference CG.
    if (this.hopper > 0) {
      _r.set(0, 0, A.hopperOffsetZ).applyQuaternion(q);
      _f.set(0, -this.hopper * A.liquidDensity * G, 0);
      _t.crossVectors(_r, _f).applyQuaternion(_qInv);
      // Gravity of the hopper is already in mass*g; only the moment is added here.
      torque.add(_t);
    }

    // --- moments (body frame) -----------------------------------------
    const uu = Math.max(u, 8);
    const pRate = this.omega.z, qRate = -this.omega.x, rRate = -this.omega.y;
    const pHat = (pRate * A.span) / (2 * uu), qHat = (qRate * A.chord) / (2 * uu), rHat = (rRate * A.span) / (2 * uu);
    const propArea = Math.PI * A.propRadius * A.propRadius;
    const wash = u * u + (0.6 * thrust) / (rho * propArea);
    const qTail = 0.5 * rho * wash;
    const aC = clamp(alpha, -0.6, 0.6);
    const elev = clamp(this.elevator + this.trim * 0.45, -1.2, 1.2);
    if (stall > 0.2) this.stallWobble += (Math.random() - 0.5) * dt * 4 - this.stallWobble * dt;
    else this.stallWobble *= 1 - dt * 2;
    const CmWB = A.Cm0 + A.CmaWB * aC + A.Cmflap * this.flaps - 0.3 * stall;
    const CmT = A.CmaTail * aC + A.Cmq * qHat + A.Cmde * elev;
    const pitchM = qd * A.wingArea * A.chord * CmWB + qTail * A.wingArea * A.chord * CmT;
    const Cl = A.Clb * beta + A.Clp * pHat + A.Clr * rHat + A.Clda * this.aileron + this.stallWobble * stall * 0.12;
    const rollM = qd * A.wingArea * A.span * Cl - 0.025 * thrust;
    const yawM = qd * A.wingArea * A.span * (A.Cnb * beta + A.Cnda * this.aileron)
      + qTail * A.wingArea * A.span * (A.Cnr * rHat + A.Cndr * this.rudder)
      - 0.05 * thrust * (1 - smoothstep(10, 40, u));
    torque.x += -pitchM;
    torque.y += -yawM;
    torque.z += rollM;

    // --- ground contact -------------------------------------------------
    const out = this.out;
    out.onGround = false;
    out.wheelsOnGround = 0;
    const wOmega = _wOmega.copy(this.omega).applyQuaternion(q);
    let minClear = 1e9;
    const surf = env.surface(this.pos.x, this.pos.z);
    out.surface = surf;
    const nearGround = this.pos.y - env.ground(this.pos.x, this.pos.z) < 14;
    if (nearGround) {
      const speedGround = Math.hypot(this.vel.x, this.vel.z);
      const steerMax = A.tailSteer * (1 - 0.75 * smoothstep(3, 25, speedGround));
      const yawCmd = this.rudder;
      for (const g of this.gear) {
        const r = _r.copy(g.pv).applyQuaternion(q);
        const cx = this.pos.x + r.x, cy = this.pos.y + r.y, cz = this.pos.z + r.z;
        const st = env.surface(cx, cz);
        const gh = env.ground(cx, cz) + bump(cx, cz) * (A.groundBump[st] ?? 0.03);
        const pen = gh - cy;
        minClear = Math.min(minClear, -pen);
        // A tailwheel sits behind the CG: it points left to turn the nose right.
        g.steerAngle = g.steer ? yawCmd * steerMax : 0;
        if (pen <= 0) {
          g.onGround = false;
          g.compression = Math.max(0, g.compression - dt * 2);
          g.prevPen = pen;
          g.load = 0;
          // Free wheel slows down slowly.
          g.spin *= 1 - Math.min(1, dt * 0.4);
          continue;
        }
        g.onGround = true;
        out.onGround = true;
        out.wheelsOnGround++;
        env.normal(cx, cz, _nrm);
        const n = _n.set(_nrm.x, _nrm.y, _nrm.z);
        const vc = _vc.copy(wOmega).cross(r).add(this.vel);
        const vn = vc.dot(n);
        if (g.prevPen <= 0) this.events.push({ kind: 'touch', part: g.name, speed: -vn, h: Math.hypot(vc.x, vc.z), x: cx, y: gh, z: cz });
        const comp = Math.min(pen, g.travel);
        const over = Math.max(0, pen - g.travel);
        if (over > 0.02 && g.prevPen <= g.travel) this.events.push({ kind: 'bottom', part: g.name, speed: -vn, x: cx, y: gh, z: cz });
        let Fn = g.k * comp + g.k * 12 * over - g.c * vn;
        Fn = Math.max(0, Fn);
        g.compression = comp;
        g.load = Fn;
        // Wheel heading on the ground plane.
        _fw.set(Math.sin(g.steerAngle), 0, Math.cos(g.steerAngle)).applyQuaternion(q);
        _fw.addScaledVector(n, -_fw.dot(n)).normalize();
        _side.crossVectors(n, _fw).normalize();
        const vLong = vc.dot(_fw), vLat = vc.dot(_side);
        let b = 0;
        if (g.name === 'mainL') b = this.brake * clamp(1 - yawCmd * 0.9, 0, 1);
        else if (g.name === 'mainR') b = this.brake * clamp(1 + yawCmd * 0.9, 0, 1);
        if (this.parkBrake && g.name !== 'tail') b = 1;
        const muR = A.rollingResistance[st] ?? 0.05;
        const Flong = -clamp(vLong / 0.25, -1, 1) * muR * Fn - clamp(vLong / 0.06, -1, 1) * b * A.brakeMu * Fn;
        // Tailwheel: steerable within its range, full-castering (unlocked) when
        // the pilot pivots on a braked main wheel with full rudder.
        const unlocked = g.steer && this.brake * Math.abs(yawCmd) > 0.5;
        const muLat = g.steer ? (unlocked ? 0.05 : A.lateralMu * 0.6) : A.lateralMu;
        const Flat = -clamp(vLat / 0.18, -1, 1) * muLat * Fn;
        const F = _f.copy(n).multiplyScalar(Fn).addScaledVector(_fw, Flong).addScaledVector(_side, Flat);
        force.add(F);
        _t.crossVectors(r, F).applyQuaternion(_qInv);
        torque.add(_t);
        g.spin = vLong / g.radius;
        g.prevPen = pen;
      }

      // Hard points: anything other than the wheels touching the ground.
      for (const h of this.hard) {
        const r = _r.copy(h.pv).applyQuaternion(q);
        const cx = this.pos.x + r.x, cy = this.pos.y + r.y, cz = this.pos.z + r.z;
        const gh = env.ground(cx, cz);
        const pen = gh - cy;
        if (pen > 0 && h.prev <= 0) {
          const vc = _vc.copy(wOmega).cross(r).add(this.vel);
          this.events.push({ kind: 'ground', part: h.name, speed: vc.length(), vs: -vc.y, h: Math.hypot(vc.x, vc.z), x: cx, y: cy, z: cz });
        }
        h.prev = pen;
        if (pen > 0) {
          const vc = _vc.copy(wOmega).cross(r).add(this.vel);
          _f.set(-vc.x * 350, Math.min(pen, 0.5) * 4e4 - vc.y * 1200, -vc.z * 350);
          force.add(_f);
          _t.crossVectors(r, _f).applyQuaternion(_qInv);
          torque.add(_t);
        }
      }
    } else {
      for (const g of this.gear) { g.prevPen = -1; g.onGround = false; g.compression = 0; g.spin *= 1 - Math.min(1, dt * 0.4); }
      for (const h of this.hard) h.prev = -1;
    }

    // Crop canopy: wheels, booms and belly brushing through the plants.
    const ch = env.cropHeight(this.pos.x, this.pos.z);
    out.cropDepth = 0;
    if (ch > 0) {
      const ground = env.ground(this.pos.x, this.pos.z);
      // Lowest point of the aircraft that can touch the crop (wheels).
      const wheelY = this.pos.y + _v1.set(0, -1.25, 0.75).applyQuaternion(q).y;
      const depth = ground + ch - wheelY;
      if (depth > 0) {
        out.cropDepth = depth;
        const k = 9 * Math.min(depth, 2.5) * (ch > 1.5 ? 2.2 : 1);
        force.addScaledVector(this.vel, -k * Math.min(1, this.vel.length() / 10) * 12);
        if (depth > 0.05 && !this._inCrop) this.events.push({ kind: 'crop', part: 'gear', depth, speed: this.vel.length() });
        this._inCrop = true;
      } else this._inCrop = false;
    } else this._inCrop = false;

    // --- integrate --------------------------------------------------------
    const I = this.inertia;
    _v2.set(this.omega.x * I.x, this.omega.y * I.y, this.omega.z * I.z);
    _v3.copy(this.omega).cross(_v2);
    torque.sub(_v3);
    this.omega.x += (torque.x / I.x) * dt;
    this.omega.y += (torque.y / I.y) * dt;
    this.omega.z += (torque.z / I.z) * dt;
    const damp = out.onGround ? 1 - Math.min(0.3, dt * 0.6) : 1 - Math.min(0.2, dt * 0.05);
    this.omega.multiplyScalar(damp);
    if (this.omega.length() > 4) this.omega.setLength(4);
    this._accel.copy(force).divideScalar(this.mass);
    this.vel.addScaledVector(this._accel, dt);
    this.pos.addScaledVector(this.vel, dt);
    const w = this.omega;
    _dq.set(w.x * dt * 0.5, w.y * dt * 0.5, w.z * dt * 0.5, 1);
    q.multiply(_dq).normalize();

    out.airspeed = u;
    out.groundSpeed = Math.hypot(this.vel.x, this.vel.z);
    out.alpha = alpha;
    out.beta = beta;
    out.stall = u > 12 ? stall : 0;
    out.agl = nearGround ? Math.max(0, minClear) : this.pos.y - 1.25 - env.ground(this.pos.x, this.pos.z);
    out.vs = this.vel.y;
    out.density = rho;
    out.gLoad = _v4.copy(this._accel).add(_v1.set(0, G, 0)).applyQuaternion(_qInv).y / G;
    out.CL = CL;
    if (!Number.isFinite(this.pos.x + this.pos.y + this.pos.z + this.vel.x + this.quat.w + this.omega.x)) this._recover();
  }

  _engine(dt, env) {
    const A = this.A;
    if (this.engine === 'cranking') {
      this.crankTime += dt;
      this.rpm += (260 - this.rpm) * Math.min(1, dt * 3);
      if (this.crankTime > 1.3) this.engine = this.fuel > 0 ? 'running' : 'off';
    } else if (this.engine === 'running') {
      const target = A.idleRpm + this.throttle * (A.maxRpm - A.idleRpm) + this.out.airspeed * 4;
      let t = Math.min(target, A.maxRpm + 120);
      if (this.roughness > 0) t *= 1 - this.roughness * (0.08 + 0.08 * Math.sin(performance.now() * 0.009));
      this.rpm += (t - this.rpm) * Math.min(1, dt / 0.7);
      const burn = A.fuelFlowFull * (0.22 + 0.78 * this.throttle) * (this.rpm / A.maxRpm) * A.fuelBurnScale * dt;
      this.fuel = Math.max(0, this.fuel - burn);
      if (this.fuel <= 0) { this.engine = 'off'; this.events.push({ kind: 'starved' }); }
    } else {
      this.rpm += (Math.min(this.out.airspeed * 10, 900) - this.rpm) * Math.min(1, dt * 0.9);
    }
  }

  _recover() {
    this.vel.set(0, 0, 0);
    this.omega.set(0, 0, 0);
    if (!Number.isFinite(this.pos.x + this.pos.y + this.pos.z)) this.pos.set(0, 5, 0);
    if (!Number.isFinite(this.quat.w + this.quat.x)) this.quat.identity();
  }

  heading() {
    const f = _v1.set(0, 0, 1).applyQuaternion(this.quat);
    return Math.atan2(f.x, f.z);
  }

  // Pitch and bank angles (radians) from the body quaternion (Tidemark helper).
  static attitude(fm, out = {}) {
    const n = fm.quat;
    const r = 2 * (n.y * n.z - n.w * n.x);
    const i = -2 * (n.x * n.y + n.w * n.z);
    out.pitch = Math.asin(clamp(r, -1, 1));
    out.bank = Math.asin(clamp(-i, -1, 1));
    return out;
  }
}
