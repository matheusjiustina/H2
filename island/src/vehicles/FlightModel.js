import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../utils/MathUtils.js';

// Six-degree-of-freedom flight model for a single-engine radial floatplane.
//
// Body axes: +Z forward (nose), +Y up, +X left (right-handed). Aerodynamic
// coefficients use the usual aero conventions (roll right, pitch up and yaw right
// positive) and are mapped onto the body axes where the moments are applied:
//   p (roll rate)  =  omega.z      L (roll moment)  -> torque.z
//   q (pitch rate) = -omega.x      M (pitch moment) -> -torque.x
//   r (yaw rate)   = -omega.y      N (yaw moment)   -> -torque.y
//
// Water and ground are handled with contact points on the float keels (buoyancy,
// planing drag, water rudders, beaching friction) and "hard points" on the airframe
// (wing tips, tail, propeller arc, belly) that only report impacts.

export const AIRFRAME = {
  mass: 2100, // kg, pilot + fuel + floats
  inertia: new THREE.Vector3(4300, 8600, 5600), // pitch (x), yaw (y), roll (z) kg·m²
  wingArea: 23.2, span: 14.0, chord: 1.66,
  aspect: 14.0 * 14.0 / 23.2,
  oswald: 0.78,
  CL0: 0.32, CLa: 4.9, alphaStall: 0.27, alphaStallNeg: -0.21,
  CD0: 0.068, CDflap: 0.05, // floats and struts are draggy
  CLflap: 0.72, // full flaps (30°)
  // pitch: wing-body (destabilising) + tail (stabilising, sits in the propeller slipstream)
  Cm0: 0.045, CmaWB: 0.25, CmaTail: -1.3, Cmq: -14, Cmde: 0.44, Cmflap: -0.05,
  Clb: -0.09, Clp: -0.5, Clr: 0.11, Clda: 0.08,
  Cnb: 0.08, Cnr: -0.17, Cndr: 0.075, Cnda: -0.012,
  CYb: -0.6, CYdr: 0.12,
  staticThrust: 7000, // N at full power
  maxPower: 336000, propEfficiency: 0.72, propArea: Math.PI * 1.3 * 1.3,
  idleRpm: 620, maxRpm: 2300,
  // float keel contact points (x, y, z) - both floats
  floats: (() => {
    const pts = [];
    const zs = [3.6, 2.3, 1.0, -0.3, -1.4, -2.6, -3.3];
    for (const side of [1, -1]) {
      for (const z of zs) {
        // bow rises, step at z ≈ -0.4, the afterbody sweeps up towards the stern
        const y = -2.15 + (z > 2.0 ? (z - 2.0) * 0.2 : 0) + (z < -0.45 ? 0.07 + (-0.45 - z) * 0.06 : 0);
        pts.push(new THREE.Vector3(side * 1.55, y, z));
      }
    }
    return pts;
  })(),
  // airframe points that must never touch anything
  hard: [
    { name: 'wingtipL', p: new THREE.Vector3(7.0, 1.42, 1.1) },
    { name: 'wingtipR', p: new THREE.Vector3(-7.0, 1.42, 1.1) },
    { name: 'tail', p: new THREE.Vector3(0, 0.55, -5.4) },
    { name: 'fin', p: new THREE.Vector3(0, 2.3, -5.1) },
    { name: 'stabL', p: new THREE.Vector3(2.5, 0.65, -4.8) },
    { name: 'stabR', p: new THREE.Vector3(-2.5, 0.65, -4.8) },
    { name: 'prop', p: new THREE.Vector3(0, -1.15, 3.5) },
    { name: 'spinner', p: new THREE.Vector3(0, 0.12, 4.0) },
    { name: 'belly', p: new THREE.Vector3(0, -0.55, 0.6) },
    { name: 'roof', p: new THREE.Vector3(0, 1.5, 1.0) },
  ],
};

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _r = new THREE.Vector3(), _f = new THREE.Vector3(), _fw = new THREE.Vector3(), _rt = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _w = new THREE.Vector3(), _t = new THREE.Vector3(), _iw = new THREE.Vector3();

export class FlightModel {
  constructor(A = AIRFRAME) {
    this.A = A;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.omega = new THREE.Vector3(); // body rates
    // controls (pilot + assists write these)
    this.elevator = 0; this.aileron = 0; this.rudder = 0; // -1..1 surface deflections
    this.trim = 0; // -1..1
    this.throttle = 0; this.flaps = 0; this.flapsCmd = 0; // 0..1 (0..30°)
    this.waterRudders = true;
    this.engine = 'off'; // off | cranking | running
    this.crankTime = 0;
    this.rpm = 0;
    this.roughness = 0; // 0..1 engine damage
    // outputs for HUD / audio / effects
    this.out = {
      airspeed: 0, alpha: 0, beta: 0, stall: 0, agl: 100, onWater: false, onGround: false, submerged: 0,
      thrust: 0, gLoad: 1, vs: 0, wet: [], planing: 0,
    };
    this.events = []; // impacts during the last step: { kind, part, speed, x, y, z }
    this._prevDepth = new Float32Array(A.floats.length).fill(-1);
    this._prevHard = new Float32Array(A.hard.length).fill(-1);
    this._force = new THREE.Vector3();
    this._torque = new THREE.Vector3();
    this._accel = new THREE.Vector3();
    this.stallWobble = 0;
  }

  /** Put the aircraft somewhere and stop everything. */
  reset(pos, heading, { speed = 0, engineOn = false, flaps = 0 } = {}) {
    this.pos.copy(pos);
    this.quat.setFromAxisAngle(UP, heading);
    this.vel.set(Math.sin(heading), 0, Math.cos(heading)).multiplyScalar(speed);
    this.omega.set(0, 0, 0);
    this.elevator = this.aileron = this.rudder = 0;
    this.trim = speed > 0 ? 0.12 : 0;
    this.throttle = engineOn ? 0.62 : 0;
    this.flaps = this.flapsCmd = flaps;
    this.engine = engineOn ? 'running' : 'off';
    this.rpm = engineOn ? 1900 : 0;
    this._prevDepth.fill(-1);
    this._prevHard.fill(-1);
  }

  /** env: { water(x,z), ground(x,z), solid(x,y,z) -> bool, wind: Vector3, mooring?: {anchor, heading} } */
  step(dt, env) {
    const A = this.A;
    const m = A.mass;
    const q = this.quat;
    const F = this._force.set(0, 0, 0);
    const T = this._torque.set(0, 0, 0); // body frame
    _qi.copy(q).invert();

    // ---------------------------------------------------------------- engine
    this._engine(dt, env);

    // ---------------------------------------------------------------- air data
    const alt = this.pos.y;
    const rho = 1.225 * Math.exp(-Math.max(0, alt) / 8500);
    const vAir = _v.copy(this.vel).sub(env.wind);
    const vb = vAir.applyQuaternion(_qi); // body components
    const V = vb.length();
    const u = vb.z, vRight = -vb.x, wDown = -vb.y;
    const alpha = Math.atan2(wDown, Math.max(Math.abs(u), 1e-3)) * (u >= 0 ? 1 : -1);
    const beta = V > 0.5 ? Math.asin(clamp(vRight / V, -1, 1)) : 0;
    const qbar = 0.5 * rho * V * V;

    // height of the wing above whatever is below (ground effect)
    const below = Math.max(env.water(this.pos.x, this.pos.z), env.ground(this.pos.x, this.pos.z));
    const agl = this.pos.y - below - 2.1; // float keels → ~0 when floating
    const hw = Math.max(0.1, agl + 3.5); // the wing sits 3.5 m above the keels
    const ge = (16 * hw / A.span) ** 2;
    const phi = ge / (1 + ge); // 0 on the surface → 1 high up

    // ---------------------------------------------------------------- thrust
    const dens = rho / 1.225;
    const rpmN = this.rpm / A.maxRpm;
    const ceiling = smoothstep(2200, 1500, alt); // the old radial runs out of breath up high
    const power = A.maxPower * Math.pow(rpmN, 1.5) * dens * ceiling;
    const thrust = this.engine === 'off' ? 0 : Math.min(A.staticThrust * rpmN * rpmN * dens, (A.propEfficiency * power) / Math.max(V, 6));
    this.out.thrust = thrust;

    // ---------------------------------------------------------------- aerodynamics
    let CL = 0, CD = 0, stall = 0;
    if (V > 0.5) {
      const fl = this.flaps;
      const aStall = A.alphaStall - fl * 0.035;
      const CLlin = (a) => A.CL0 + A.CLa * a + A.CLflap * fl;
      const flat = 1.05 * Math.sin(2 * alpha);
      if (alpha > aStall) {
        const over = alpha - aStall;
        stall = smoothstep(0, 0.1, over);
        CL = lerp(CLlin(aStall) - over * 2.2, flat, smoothstep(0.02, 0.3, over));
      } else if (alpha < A.alphaStallNeg) {
        const over = A.alphaStallNeg - alpha;
        stall = smoothstep(0, 0.1, over) * 0.6;
        CL = lerp(CLlin(A.alphaStallNeg) + over * 2.2, flat, smoothstep(0.02, 0.3, over));
      } else CL = CLlin(alpha);
      CL *= 1 + 0.12 * (1 - phi);
      const induced = (CL * CL) / (Math.PI * A.oswald * A.aspect) * phi;
      CD = A.CD0 + A.CDflap * fl + induced + 1.1 * stall * Math.sin(alpha) ** 2 + Math.abs(beta) * 0.25 + 0.5 * Math.sin(alpha) ** 2 * smoothstep(0.5, 1.2, Math.abs(alpha));
      // lift ⟂ airflow in the plane of symmetry, drag along the airflow
      const vHat = _v2.copy(vb).divideScalar(V);
      const liftDir = _v3.set(1, 0, 0); // left
      liftDir.crossVectors(vHat, liftDir).normalize();
      _f.copy(liftDir).multiplyScalar(CL * qbar * A.wingArea);
      _f.addScaledVector(vHat, -CD * qbar * A.wingArea);
      // side force (aero +Y is right = body -X)
      const CY = A.CYb * beta + A.CYdr * this.rudder;
      _f.x -= CY * qbar * A.wingArea;
    } else _f.set(0, 0, 0);
    _f.z += thrust;
    // body → world
    _f.applyQuaternion(q);
    F.add(_f);
    F.y -= m * 9.81;

    // ---------------------------------------------------------------- moments
    const Vn = Math.max(V, 8);
    const p = this.omega.z, qr = -this.omega.x, r = -this.omega.y;
    const ph = p * A.span / (2 * Vn), qh = qr * A.chord / (2 * Vn), rh = r * A.span / (2 * Vn);
    // propeller slipstream keeps the tail working at low airspeed
    const vTail2 = V * V + 0.6 * thrust / (rho * A.propArea);
    const qTail = 0.5 * rho * vTail2;
    const aEff = clamp(alpha, -0.6, 0.6);
    const de = clamp(this.elevator + this.trim * 0.45, -1.2, 1.2);
    // stalled wings drop unevenly
    if (stall > 0.2) this.stallWobble += (Math.random() - 0.5) * dt * 4 - this.stallWobble * dt;
    else this.stallWobble *= 1 - dt * 2;
    const CmWing = A.Cm0 + A.CmaWB * aEff + A.Cmflap * this.flaps - 0.3 * stall;
    const CmTail = A.CmaTail * aEff + A.Cmq * qh + A.Cmde * de;
    const M = qbar * A.wingArea * A.chord * CmWing + qTail * A.wingArea * A.chord * CmTail;
    const Cl = A.Clb * beta + A.Clp * ph + A.Clr * rh + A.Clda * this.aileron + this.stallWobble * stall * 0.12;
    const L = qbar * A.wingArea * A.span * Cl - 0.025 * thrust; // propeller torque rolls left a touch
    const N = qbar * A.wingArea * A.span * (A.Cnb * beta + A.Cnda * this.aileron) + qTail * A.wingArea * A.span * (A.Cnr * rh + A.Cndr * this.rudder) - 0.05 * thrust * (1 - smoothstep(10, 40, V)); // p-factor on the takeoff run
    T.x += -M; T.y += -N; T.z += L;

    // ---------------------------------------------------------------- floats, ground and hard points
    this.events.length = 0;
    const out = this.out;
    out.onWater = false; out.onGround = false;
    let wetCount = 0;
    const wWorld = _w.copy(this.omega).applyQuaternion(q);
    // horizontal float axes
    _fw.set(0, 0, 1).applyQuaternion(q); _fw.y = 0;
    if (_fw.lengthSq() < 1e-6) _fw.set(0, 0, 1);
    _fw.normalize();
    _rt.set(-_fw.z, 0, _fw.x); // right
    const near = agl < 12; // skip contact work high up
    let planing = 0;
    if (near) {
      const kB = (m * 9.81) / (A.floats.length * 0.24);
      for (let i = 0; i < A.floats.length; i++) {
        const rW = _r.copy(A.floats[i]).applyQuaternion(q);
        const px = this.pos.x + rW.x, py = this.pos.y + rW.y, pz = this.pos.z + rW.z;
        const vp = _v2.copy(wWorld).cross(rW).add(this.vel);
        const water = env.water(px, pz);
        const ground = env.ground(px, pz);
        const d = water - py;
        _f.set(0, 0, 0);
        if (d > 0 && ground < water - 0.05) {
          out.onWater = true;
          wetCount++;
          const dc = Math.min(d, 0.6);
          if (this._prevDepth[i] <= 0 && -vp.y > 1.2) this.events.push({ kind: 'water', part: 'float', speed: -vp.y, h: Math.hypot(vp.x, vp.z), x: px, y: water, z: pz });
          const vLong = vp.x * _fw.x + vp.z * _fw.z;
          const vLat = vp.x * _rt.x + vp.z * _rt.z;
          const plane = smoothstep(7.5, 14, Math.abs(vLong));
          planing = Math.max(planing, plane);
          // buoyancy + heave damping, planing lift on the forebody
          let fy = kB * dc - 700 * vp.y * Math.min(1, d / 0.1);
          if (A.floats[i].z > -0.45) fy += 34 * dc * vLong * vLong * (A.floats[i].z > 2 ? 1.25 : 1);
          const cLong = 12 * (1 - 0.72 * plane);
          const fLong = -(cLong * dc * vLong * Math.abs(vLong) + 40 * dc * vLong);
          const fLat = -(300 * dc * vLat * Math.abs(vLat) + 520 * dc * vLat);
          _f.set(_fw.x * fLong + _rt.x * fLat, fy, _fw.z * fLong + _rt.z * fLat);
        } else if (ground - py > 0) {
          // floats on sand / rock
          out.onGround = true;
          const dg = ground - py;
          if (this._prevDepth[i] <= 0 && (-vp.y > 1.5 || Math.hypot(vp.x, vp.z) > 9)) this.events.push({ kind: 'ground', part: 'float', speed: -vp.y, h: Math.hypot(vp.x, vp.z), x: px, y: ground, z: pz });
          const fn = Math.max(0, 70000 * Math.min(dg, 0.4) - 3500 * vp.y);
          const vh = Math.hypot(vp.x, vp.z);
          const fr = vh > 1e-3 ? Math.min(0.65 * fn, 4000 * vh) / vh : 0;
          _f.set(-vp.x * fr, fn, -vp.z * fr);
        }
        this._prevDepth[i] = Math.max(d, ground - py);
        if (_f.lengthSq() > 0) {
          F.add(_f);
          _t.copy(rW).cross(_f).applyQuaternion(_qi);
          T.add(_t);
        }
      }
      // airframe hard points
      for (let i = 0; i < A.hard.length; i++) {
        const rW = _r.copy(A.hard[i].p).applyQuaternion(q);
        const px = this.pos.x + rW.x, py = this.pos.y + rW.y, pz = this.pos.z + rW.z;
        const surf = Math.max(env.water(px, pz), env.ground(px, pz));
        const pen = surf - py;
        const solid = env.solid(px, py, pz);
        if ((pen > 0 || solid) && this._prevHard[i] <= 0) {
          const vp = _v2.copy(wWorld).cross(rW).add(this.vel);
          this.events.push({ kind: solid ? 'solid' : (env.ground(px, pz) > env.water(px, pz) ? 'ground' : 'water'), part: A.hard[i].name, speed: vp.length(), h: Math.hypot(vp.x, vp.z), x: px, y: py, z: pz });
        }
        this._prevHard[i] = solid ? 1 : pen;
        if (pen > 0) {
          // keep the airframe out of the surface (heavy drag + push)
          const vp = _v2.copy(wWorld).cross(rW).add(this.vel);
          _f.set(-vp.x * 300, Math.min(pen, 0.5) * 30000 - vp.y * 900, -vp.z * 300);
          F.add(_f);
          _t.copy(rW).cross(_f).applyQuaternion(_qi);
          T.add(_t);
        }
      }
    } else {
      this._prevDepth.fill(-1);
      this._prevHard.fill(-1);
    }
    out.planing = planing;
    out.wet = wetCount / A.floats.length;
    // water rudders hang off the float sterns: a side force behind the CG turns the nose
    if (wetCount > 0) {
      const vLong = this.vel.x * _fw.x + this.vel.z * _fw.z;
      const k = (this.waterRudders ? 1 : 0.12) * Math.min(1, out.wet * 3) * (1 - planing * 0.8);
      const steer = this.rudder * (60 * vLong * Math.abs(vLong) + 200 * vLong) * k;
      _f.set(-_rt.x * steer, 0, -_rt.z * steer);
      F.add(_f);
      _r.set(0, -2.0, -3.4).applyQuaternion(q);
      _t.copy(_r).cross(_f).applyQuaternion(_qi);
      T.add(_t);
    }

    // moored: a line to the pier keeps it in place
    if (env.mooring) {
      const mo = env.mooring;
      F.x += (mo.anchor.x - this.pos.x) * 900 - this.vel.x * 900;
      F.z += (mo.anchor.z - this.pos.z) * 900 - this.vel.z * 900;
      const heading = Math.atan2(_fw.x, _fw.z);
      let dh = mo.heading - heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      T.y += dh * 9000 - this.omega.y * 6000;
    }

    // ---------------------------------------------------------------- integrate
    const I = A.inertia;
    // ω̇ = I⁻¹ (τ − ω × Iω)
    _iw.set(this.omega.x * I.x, this.omega.y * I.y, this.omega.z * I.z);
    _t.copy(this.omega).cross(_iw);
    T.sub(_t);
    this.omega.x += (T.x / I.x) * dt;
    this.omega.y += (T.y / I.y) * dt;
    this.omega.z += (T.z / I.z) * dt;
    // a little structural / water damping keeps the integration calm
    const damp = wetCount > 0 ? 1 - Math.min(0.5, dt * 1.5) : 1 - Math.min(0.2, dt * 0.05);
    this.omega.multiplyScalar(damp);
    this.omega.clampLength(0, 4);

    this._accel.copy(F).divideScalar(m);
    this.vel.addScaledVector(this._accel, dt);
    this.pos.addScaledVector(this.vel, dt);

    const w = this.omega;
    _q.set(w.x * dt * 0.5, w.y * dt * 0.5, w.z * dt * 0.5, 1);
    q.multiply(_q).normalize();

    // ---------------------------------------------------------------- outputs
    out.airspeed = V;
    out.alpha = alpha;
    out.beta = beta;
    out.stall = V > 12 ? stall : 0;
    out.agl = agl;
    out.vs = this.vel.y;
    // load factor felt by the pilot: (a − g) along body up, in g
    const aBody = _v.copy(this._accel).add(_v3.set(0, 9.81, 0)).applyQuaternion(_qi);
    out.gLoad = aBody.y / 9.81;
    if (!Number.isFinite(this.pos.x + this.pos.y + this.pos.z + this.vel.x + this.quat.w + this.omega.x)) this._recover();
  }

  _engine(dt, env) {
    const A = this.A;
    if (this.engine === 'cranking') {
      this.crankTime += dt;
      this.rpm += (260 - this.rpm) * Math.min(1, dt * 3);
      if (this.crankTime > 1.25) this.engine = 'running';
    } else if (this.engine === 'running') {
      const V = this.out.airspeed;
      let target = A.idleRpm + this.throttle * (A.maxRpm - A.idleRpm) + V * 4;
      if (this.roughness > 0) target *= 1 - this.roughness * (0.08 + 0.08 * Math.sin(performance.now() * 0.009));
      this.rpm += (Math.min(target, 2450) - this.rpm) * Math.min(1, dt / 0.7);
      // drowned
      if (env.engineSubmerged) { this.engine = 'off'; }
    } else {
      // windmilling or spinning down
      const V = this.out.airspeed;
      this.rpm += (Math.min(V * 10, 900) - this.rpm) * Math.min(1, dt * 0.9);
    }
  }

  _recover() {
    this.vel.set(0, 0, 0);
    this.omega.set(0, 0, 0);
    if (!Number.isFinite(this.pos.x + this.pos.y + this.pos.z)) this.pos.set(0, 2, -60);
    if (!Number.isFinite(this.quat.w + this.quat.x)) this.quat.identity();
  }
}
