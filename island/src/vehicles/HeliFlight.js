import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../utils/MathUtils.js';

// Six-degree-of-freedom model of a light single-turbine helicopter (H125 class).
//
// Body axes as the seaplane's: +Z forward, +Y up, +X left. omega.x > 0 pitches the
// nose down, omega.y > 0 yaws it left, omega.z > 0 rolls right.
//
// Main rotor: blade-element thrust balanced against momentum-theory inflow, so climb
// and descent damping, translational lift (the wake is swept back and the induced
// flow drops), ground effect (the ground blocks the wake) and autorotation all come
// out of the same two equations. The cyclic tilts the tip-path plane, which also
// flaps back with airspeed and lags the shaft when the fuselage rotates; the hub's
// hinge offset adds a direct moment. Rotor speed is a state: the engine's governor
// drives it against the rotor's aerodynamic torque, the fuselage takes the reaction
// of the engine torque and the tail rotor has to cancel it. Skids are spring-damper
// contacts with stick/slip friction, so it sits, slides and tips over like a body.

const G = 9.81;

export const ROTORCRAFT = {
  mass: 1950, // kg: pilot, fuel, an empty cabin
  inertia: new THREE.Vector3(6200, 5400, 2100), // pitch (x), yaw (y), roll (z) kg·m²
  R: 5.35, area: Math.PI * 5.35 * 5.35,
  hub: new THREE.Vector3(0, 1.62, 0), // rotor head above the centre of gravity
  omega0: 40.8, // rad/s at 100 % Nr (390 rpm)
  bladeK: 932000, // ρ·a·σ·A·(ΩR)²/2 at sea level and 100 % Nr (3 blades, 0.35 m chord)
  pitchMin: 0.02, pitchMax: 0.24, // collective blade pitch, rad
  sweep: 0.55, // how much of the in-plane flow sweeps the wake away (ETL strength)
  profilePower: 80200, // W at 100 % Nr
  maxPower: 400000, // W the transmission accepts (the turbine has more)
  rotorJ: 900, // kg·m² rotor polar inertia
  a1Max: 0.2, b1Max: 0.15, // cyclic authority (tip-path plane tilt, rad)
  flapTau: 0.06, blowback: 0.0011, flapLag: 0.075,
  hubStiff: 26000, // N·m per rad of flapping at 100 % Nr (Starflex hinge offset)
  dampPitch: 7000, dampRoll: 3600, // rotor damping that the flapping lag doesn't cover
  tail: new THREE.Vector3(0.24, 1.15, -6.5), // tail rotor hub (left of the fin)
  tailMax: 2900, tailBias: 0.3, tailInflow: 120,
  CdA: new THREE.Vector3(7.5, 6.5, 1.4), // side, vertical, frontal flat-plate area m²
  stabTrim: 1.8, stabAlpha: 14, stabDamp: 90, // horizontal stabiliser
  finK: 1.65, noseK: 2.4, // vertical fin vs the fuselage's own weathercock instability
  // skid contact points: four per skid tube and the tail stinger
  skids: (() => {
    const pts = [];
    for (const s of [1, -1]) for (const z of [1.25, 0.42, -0.42, -1.2]) pts.push(new THREE.Vector3(s * 1.05, -1.47, z));
    pts.push(new THREE.Vector3(0, -0.16, -6.18));
    return pts;
  })(),
  // airframe points that report impacts
  hard: [
    { name: 'nose', p: new THREE.Vector3(0, -0.25, 2.2) },
    { name: 'belly', p: new THREE.Vector3(0, -0.88, 0.2) },
    { name: 'roof', p: new THREE.Vector3(0, 1.32, -0.6) },
    { name: 'mast', p: new THREE.Vector3(0, 1.8, 0) },
    { name: 'boom', p: new THREE.Vector3(0, 0.6, -6.75) },
    { name: 'fin', p: new THREE.Vector3(0, 1.92, -6.62) },
    { name: 'stabL', p: new THREE.Vector3(1.2, 0.62, -5.25) },
    { name: 'stabR', p: new THREE.Vector3(-1.2, 0.62, -5.25) },
    { name: 'tailRotor', p: new THREE.Vector3(0.26, 2.05, -6.5), spin: true },
    { name: 'tailRotor', p: new THREE.Vector3(0.26, 0.25, -6.5), spin: true },
    { name: 'tailRotor', p: new THREE.Vector3(0.26, 1.15, -5.6), spin: true },
    { name: 'tailRotor', p: new THREE.Vector3(0.26, 1.15, -7.4), spin: true },
  ],
  tips: 8, // rotor disc check points
};

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _vb = new THREE.Vector3(), _nd = new THREE.Vector3(), _hw = new THREE.Vector3();
const _r = new THREE.Vector3(), _f = new THREE.Vector3(), _t = new THREE.Vector3();
const _w = new THREE.Vector3(), _iw = new THREE.Vector3(), _n = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _surf = { y: 0, nx: 0, ny: 1, nz: 0, kind: 'terrain', water: -100 };

export class HeliFlight {
  constructor(A = ROTORCRAFT) {
    this.A = A;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.omega = new THREE.Vector3();
    // pilot (or assist) controls
    this.collective = 0; // 0..1 lever
    this.cyclicX = 0; // -1..1, + = right
    this.cyclicY = 0; // -1..1, + = forward
    this.pedal = 0; // -1..1, + = right pedal (nose right)
    // rotor / engine state
    this.engine = 'off'; // off | starting | running
    this.startTime = 0;
    this.spool = 0; // turbine readiness 0..1
    this.nr = 0; // rotor speed / 100 %
    this.Qe = 0; this.Qa = 0; // engine and aerodynamic torque on the rotor, N·m
    this.vi = 0; // induced velocity at the disc
    this.a1 = 0; this.b1 = 0; // tip-path plane tilt relative to the shaft (forward, right)
    this.thrust = 0;
    this.rotorBrake = true;
    this.out = {
      airspeed: 0, groundSpeed: 0, vs: 0, agl: 0, hub: 10, surface: 0, overWater: false,
      onGround: false, onWater: false, contacts: 0, load: 0, slope: 0, wet: 0,
      thrust: 0, power: 0, torque: 0, n1: 0, ge: 1, etl: 0, vrs: 0, gLoad: 1, cHover: 0.5, cTilt: 0, cEtl: 0, demand: 0, tailThrust: 0,
    };
    this.events = [];
    this._prevPen = new Float32Array(A.skids.length).fill(-1);
    this._prevHard = new Float32Array(A.hard.length + A.tips).fill(-1);
    this._anchor = A.skids.map(() => new THREE.Vector3());
    this._anchored = new Uint8Array(A.skids.length);
    this._force = new THREE.Vector3();
    this._torque = new THREE.Vector3();
    this._accel = new THREE.Vector3();
    this.time = 0;
    this.windX = 0; this.windZ = 0;
  }

  /** Put the helicopter somewhere and stop everything. */
  reset(pos, heading, { speed = 0, running = false, collective = 0 } = {}) {
    this.pos.copy(pos);
    this.quat.setFromAxisAngle(UP, heading);
    this.vel.set(Math.sin(heading), 0, Math.cos(heading)).multiplyScalar(speed);
    this.omega.set(0, 0, 0);
    this.cyclicX = this.cyclicY = this.pedal = 0;
    this.collective = collective;
    this.engine = running ? 'running' : 'off';
    this.spool = running ? 1 : 0;
    this.nr = running ? 1 : 0;
    this.Qe = this.Qa = 0;
    this.vi = running && collective > 0 ? 9 : 0;
    this.a1 = this.b1 = 0;
    this._prevPen.fill(-1);
    this._prevHard.fill(-1);
    this._anchored.fill(0);
  }

  start() { if (this.engine === 'off') { this.engine = 'starting'; this.startTime = 0; } }
  stop() { this.engine = 'off'; }

  /**
   * env: { water(x,z), surface(x,z,maxY,out) -> out {y, nx, ny, nz, kind}, solid(x,y,z) -> bool,
   *        wind: Vector3, engineSubmerged }
   */
  step(dt, env) {
    const A = this.A;
    const m = A.mass;
    const q = this.quat;
    const out = this.out;
    const F = this._force.set(0, 0, 0);
    const T = this._torque.set(0, 0, 0); // body frame
    this.time += dt;
    _qi.copy(q).invert();
    const rho = 1.225 * Math.exp(-Math.max(0, this.pos.y) / 8500);
    const dens = rho / 1.225;

    // ---------------------------------------------------------------- air data
    const vb = _vb.copy(this.vel).sub(env.wind).applyQuaternion(_qi);
    const V = vb.length();
    this.windX = env.wind.x; this.windZ = env.wind.z;

    // what is under the rotor head: ground effect, downwash, height
    const hubW = _hw.copy(A.hub).applyQuaternion(q).add(this.pos);
    env.surface(hubW.x, hubW.z, hubW.y, _surf);
    const water = env.water(hubW.x, hubW.z);
    out.overWater = water > _surf.y;
    out.surface = Math.max(water, _surf.y);
    const hz = Math.max(0.5, hubW.y - out.surface);
    out.hub = hz;

    // ---------------------------------------------------------------- rotor speed
    this._engine(dt, env);
    const nr = this.nr;
    const Om = A.omega0 * nr;
    const OmR = Math.max(Om * A.R, 5);

    // ---------------------------------------------------------------- tip-path plane
    // the cyclic tilts it, airspeed blows it back (speed stability), and when the
    // fuselage pitches or rolls the disc lags behind the shaft (rate damping)
    const a1t = this.cyclicY * A.a1Max - A.blowback * vb.z - A.flapLag * this.omega.x;
    const b1t = this.cyclicX * A.b1Max + A.blowback * vb.x - A.flapLag * this.omega.z;
    const kf = 1 - Math.exp(-dt * (0.2 + nr) / A.flapTau);
    this.a1 += (clamp(a1t, -0.3, 0.3) - this.a1) * kf;
    this.b1 += (clamp(b1t, -0.25, 0.25) - this.b1) * kf;
    const nd = _nd.set(-Math.sin(this.b1), Math.cos(this.a1) * Math.cos(this.b1), Math.sin(this.a1)).normalize();

    // ---------------------------------------------------------------- thrust and inflow
    const vAx = vb.dot(nd); // climbing through the disc (+) raises the inflow
    const vPar = Math.sqrt(Math.max(0, V * V - vAx * vAx));
    const mu = vPar / OmR;
    const theta = lerp(A.pitchMin, A.pitchMax, clamp(this.collective, 0, 1));
    const K = A.bladeK * dens * nr * nr;
    // ground effect: the surface blocks the wake (Cheeseman–Bennett), until it is swept back
    const geK = Math.min(0.17, (A.R / (4 * hz)) ** 2) * (1 - smoothstep(4, 13, vPar));
    const sweep = A.sweep * vPar;
    let vi = this.vi, thrust = 0;
    for (let it = 0; it < 2; it++) {
      const viE = vi * (1 - geK);
      thrust = Math.max(0, K * ((theta / 3) * (1 + 1.5 * mu * mu) - (vAx + viE) / OmR / 2));
      const vh = Math.sqrt(thrust / (2 * rho * A.area));
      const vt = Math.max(Math.hypot(sweep, vAx + vi), 0.7 * vh, 0.5);
      vi += (thrust / (2 * rho * A.area * vt) - vi) * 0.5;
    }
    this.vi = vi = Math.max(0, vi);
    // vortex ring: settling straight down into its own wake costs thrust and shakes the disc
    const vh0 = 9.3;
    const sink = -vAx / vh0;
    const vrs = smoothstep(0.4, 0.7, sink) * (1 - smoothstep(1.2, 1.8, sink)) * (1 - smoothstep(3, 9, vPar));
    thrust *= 1 - vrs * (0.16 + 0.08 * Math.sin(this.time * 6.3) * Math.sin(this.time * 2.9));
    // the fuselage sits in the downwash in a hover
    thrust *= 1 - 0.03 * (1 - smoothstep(4, 14, vPar));
    this.thrust = thrust;

    // power: induced + climb (+ the propulsive part through the tilted disc) + blade profile
    const viE = vi * (1 - geK);
    const pRotor = thrust * (vAx + viE) + A.profilePower * dens * nr * nr * nr * (1 + 4.65 * mu * mu);
    this.Qa = (pRotor * 1.08) / Math.max(Om, 2); // + tail rotor and accessories

    // rotor force at the hub
    _f.copy(nd).multiplyScalar(thrust);
    _t.copy(A.hub).cross(_f);
    T.add(_t);
    T.x += A.hubStiff * nr * nr * this.a1;
    T.z += A.hubStiff * nr * nr * this.b1;
    T.x -= A.dampPitch * nr * this.omega.x;
    T.z -= A.dampRoll * nr * this.omega.z;
    // engine torque reaction: a clockwise rotor (seen from above) swings the nose left
    T.y += this.Qe;

    // ---------------------------------------------------------------- tail rotor and fin
    const rt = A.tail;
    const vtx = vb.x + this.omega.y * rt.z - this.omega.z * rt.y; // lateral air through the tail rotor
    const tailT = A.tailMax * nr * nr * dens * (A.tailBias + (1 - A.tailBias) * clamp(this.pedal, -1, 1)) - A.tailInflow * nr * vtx;
    out.tailThrust = tailT;
    const fin = -A.finK * dens * Math.max(V, 3) * clamp(vtx, -25, 25);
    _f.x += tailT + fin; // body side force on the tail (rotor force kept in _f from above for x/z)
    T.y -= -rt.z * (tailT + fin); // r × F, y component: r.z·F.x
    T.z += -rt.y * tailT - 1.2 * fin; // the tail rotor sits above the CG: it rolls the fuselage a little
    T.y -= A.noseK * dens * V * vb.x; // the cabin itself weathercocks the wrong way
    T.y -= 300 * this.omega.y;

    // ---------------------------------------------------------------- fuselage
    const h = 0.5 * rho;
    _f.x -= h * A.CdA.x * vb.x * Math.abs(vb.x);
    _f.y -= h * A.CdA.y * vb.y * Math.abs(vb.y);
    _f.z -= h * A.CdA.z * vb.z * Math.abs(vb.z);
    // horizontal stabiliser: angle-of-attack stability, a nose-up trim load at speed, damping
    const fwdFlow = smoothstep(3, 15, vb.z);
    const qbar = h * vb.z * vb.z * fwdFlow;
    const alpha = clamp(Math.atan2(-vb.y, Math.max(vb.z, 1)), -0.6, 0.6);
    T.x += A.stabAlpha * qbar * alpha - A.stabTrim * qbar - A.stabDamp * V * this.omega.x;
    T.z -= 20 * V * this.omega.z * fwdFlow;

    // body → world
    _f.applyQuaternion(q);
    F.add(_f);
    F.y -= m * G;

    // ---------------------------------------------------------------- skids
    this.events.length = 0;
    const wW = _w.copy(this.omega).applyQuaternion(q);
    let contacts = 0, load = 0, slope = 0, wet = 0;
    out.onGround = false; out.onWater = false;
    const near = this.pos.y - out.surface < 14;
    if (near) {
      const kN = 85000, cN = 5200, kT = 30000, cT = 3000;
      for (let i = 0; i < A.skids.length; i++) {
        const rW = _r.copy(A.skids[i]).applyQuaternion(q);
        const px = this.pos.x + rW.x, py = this.pos.y + rW.y, pz = this.pos.z + rW.z;
        const vp = _v2.copy(wW).cross(rW).add(this.vel);
        env.surface(px, pz, py + 0.6, _surf);
        const g = _surf.y;
        const wy = env.water(px, pz);
        const stinger = i === A.skids.length - 1;
        _f.set(0, 0, 0);
        const d = g - py;
        if (d > 0) {
          const n = _n.set(_surf.nx, _surf.ny, _surf.nz);
          const pen = d * n.y;
          const vn = vp.dot(n);
          if (this._prevPen[i] <= 0 && -vn > (stinger ? 1.2 : 1.6)) this.events.push({ kind: stinger ? 'tail' : 'skid', speed: -vn, h: Math.hypot(vp.x, vp.z), x: px, y: g, z: pz, surface: _surf.kind });
          const fn = Math.max(0, kN * Math.min(pen, 0.35) - cN * vn) * (stinger ? 0.6 : 1);
          // stick/slip: a spring to where the skid first settled, until friction lets go
          const sl = Math.acos(clamp(n.y, -1, 1));
          slope = Math.max(slope, sl);
          const mu = (_surf.kind === 'sand' ? 0.5 : 0.62) * (1 - 0.75 * smoothstep(0.2, 0.38, sl));
          const vtx2 = vp.x - vn * n.x, vty = vp.y - vn * n.y, vtz = vp.z - vn * n.z;
          if (!this._anchored[i]) { this._anchor[i].set(px, py, pz); this._anchored[i] = 1; }
          const an = this._anchor[i];
          let dx = px - an.x, dy = py - an.y, dz = pz - an.z;
          const dn = dx * n.x + dy * n.y + dz * n.z;
          dx -= dn * n.x; dy -= dn * n.y; dz -= dn * n.z;
          let tx = -kT * dx - cT * vtx2, ty = -kT * dy - cT * vty, tz = -kT * dz - cT * vtz;
          const tl = Math.hypot(tx, ty, tz), lim = mu * fn;
          if (tl > lim) {
            // sliding: kinetic friction against the motion, and the anchor follows the skid
            const vl = Math.hypot(vtx2, vty, vtz);
            const s = vl > 1e-3 ? lim / vl : (tl > 0 ? lim / tl : 0);
            if (vl > 1e-3) { tx = -vtx2 * s; ty = -vty * s; tz = -vtz * s; } else { tx *= s; ty *= s; tz *= s; }
            an.set(px, py, pz);
          }
          _f.set(n.x * fn + tx, n.y * fn + ty, n.z * fn + tz);
          if (!stinger) { contacts++; load += fn; out.onGround = true; }
          this._prevPen[i] = pen;
        } else {
          this._anchored[i] = 0;
          this._prevPen[i] = d;
        }
        // skid tubes in the water: drag and a little buoyancy from the hollow tubes
        if (wy > g + 0.05 && wy > py) {
          const dep = Math.min(wy - py, 0.4);
          wet++;
          out.onWater = true;
          if (this._prevPen[i] <= 0 && d <= 0 && -vp.y > 1.5) this.events.push({ kind: 'water', speed: -vp.y, h: Math.hypot(vp.x, vp.z), x: px, y: wy, z: pz });
          _f.x -= vp.x * 260 * dep + vp.x * Math.abs(vp.x) * 40 * dep;
          _f.z -= vp.z * 260 * dep + vp.z * Math.abs(vp.z) * 40 * dep;
          _f.y += 1500 * dep - vp.y * 500 * dep;
        }
        if (_f.lengthSq() > 0) {
          F.add(_f);
          _t.copy(rW).cross(_f).applyQuaternion(_qi);
          T.add(_t);
        }
      }
    } else {
      this._prevPen.fill(-1);
      this._anchored.fill(0);
    }
    out.contacts = contacts;
    out.load = clamp(load / (m * G), 0, 2);
    out.slope = slope;
    out.wet = wet / A.skids.length;

    // ---------------------------------------------------------------- airframe and rotor strikes
    if (near || this.pos.y - out.surface < 20) this._strikes(env, wW);

    // ---------------------------------------------------------------- integrate
    const I = A.inertia;
    _iw.set(this.omega.x * I.x, this.omega.y * I.y, this.omega.z * I.z);
    _t.copy(this.omega).cross(_iw);
    T.sub(_t);
    this.omega.x += (T.x / I.x) * dt;
    this.omega.y += (T.y / I.y) * dt;
    this.omega.z += (T.z / I.z) * dt;
    if (contacts > 0) this.omega.multiplyScalar(1 - Math.min(0.3, dt * 1.2));
    this.omega.clampLength(0, 5);

    this._accel.copy(F).divideScalar(m);
    this.vel.addScaledVector(this._accel, dt);
    this.pos.addScaledVector(this.vel, dt);
    const w = this.omega;
    _q.set(w.x * dt * 0.5, w.y * dt * 0.5, w.z * dt * 0.5, 1);
    q.multiply(_q).normalize();

    // ---------------------------------------------------------------- outputs
    out.airspeed = V;
    out.groundSpeed = Math.hypot(this.vel.x, this.vel.z);
    out.vs = this.vel.y;
    out.agl = this.pos.y - 1.47 - out.surface;
    out.thrust = thrust;
    out.power = (pRotor * 1.08) / A.maxPower;
    out.torque = this.Qe / (A.maxPower / A.omega0);
    out.n1 = this.spool * (0.62 + 0.38 * clamp(this.Qe / (A.maxPower / A.omega0), 0, 1.1));
    out.ge = 1 / Math.max(0.5, 1 - geK);
    out.etl = smoothstep(5, 13, vPar);
    out.vrs = vrs;
    // collective that would hold the present thrust = weight (feeds the assist)
    const need = (m * G) / Math.max(_v.copy(nd).applyQuaternion(q).y, 0.5) / (1 - 0.03 * (1 - smoothstep(4, 14, vPar))) / Math.max(0.6, 1 - 0.16 * vrs);
    const lam = (vAx + viE) / OmR;
    const pr = A.pitchMax - A.pitchMin;
    const th = (3 * (need / Math.max(K, 1) + lam / 2)) / (1 + 1.5 * mu * mu);
    out.cHover = clamp((th - A.pitchMin) / pr, 0, 1.2);
    // the part of that which only comes from tilting the disc (thrust leaning off vertical,
    // and the flow the tilted disc meets in forward flight)
    const vUp = this.vel.y - env.wind.y;
    const kk = (A.mass * G) / Math.max(K, 1);
    const thLevel = (3 * (kk + (vUp + viE) / OmR / 2)) / (1 + 1.5 * mu * mu);
    out.cTilt = clamp((th - thLevel) / pr, -0.1, 0.4);
    // and the part translational lift gives back (the induced flow falling away with speed)
    const viH = Math.sqrt((A.mass * G) / (2 * rho * A.area)) * (1 - geK);
    out.cEtl = clamp((thLevel - 3 * (kk + (vUp + viH) / OmR / 2)) / pr, -0.3, 0.05);
    out.demand = this.Qa / (A.maxPower / A.omega0);
    const aBody = _v.copy(this._accel).add(_v3.set(0, G, 0)).applyQuaternion(_qi);
    out.gLoad = aBody.y / G;
    if (!Number.isFinite(this.pos.x + this.pos.y + this.pos.z + this.vel.x + this.quat.w + this.omega.x + this.nr)) this._recover();
  }

  _strikes(env, wW) {
    const A = this.A, q = this.quat;
    const spinning = this.nr > 0.12;
    const nH = A.hard.length;
    for (let i = 0; i < nH + A.tips; i++) {
      let name, rB;
      if (i < nH) {
        const hp = A.hard[i];
        if (hp.spin && !spinning) { this._prevHard[i] = -1; continue; }
        name = hp.name; rB = _r.copy(hp.p);
      } else {
        if (!spinning) { this._prevHard[i] = -1; continue; }
        // blade tips on the tilted disc
        const k = ((i - nH) / A.tips) * Math.PI * 2;
        const x = Math.cos(k) * (A.R - 0.1), z = Math.sin(k) * (A.R - 0.1);
        rB = _r.set(x, A.hub.y + 0.12 - this.a1 * z + this.b1 * x, z);
        name = 'rotor';
      }
      const rW = rB.applyQuaternion(q);
      const px = this.pos.x + rW.x, py = this.pos.y + rW.y, pz = this.pos.z + rW.z;
      env.surface(px, pz, py + 0.3, _surf);
      const wy = env.water(px, pz);
      const pen = Math.max(_surf.y, wy) - py;
      const solid = env.solid(px, py, pz);
      const hit = pen > 0 || solid;
      if (hit && this._prevHard[i] <= 0) {
        const vp = _v2.copy(wW).cross(rW).add(this.vel);
        this.events.push({ kind: solid ? 'solid' : wy > _surf.y ? 'water' : 'ground', part: name, speed: vp.length(), h: Math.hypot(vp.x, vp.z), x: px, y: py, z: pz, depth: pen });
      }
      this._prevHard[i] = hit ? Math.max(pen, 0.01) : pen;
      if (pen > 0 && name !== 'rotor' && !A.hard[i]?.spin) {
        // keep the airframe out of the surface
        const vp = _v2.copy(wW).cross(rW).add(this.vel);
        _f.set(-vp.x * 400, Math.min(pen, 0.5) * 40000 - vp.y * 1500, -vp.z * 400);
        this._force.add(_f);
        _t.copy(rW).cross(_f).applyQuaternion(_qi);
        this._torque.add(_t);
      }
    }
  }

  _engine(dt, env) {
    const A = this.A;
    const qMax = A.maxPower / A.omega0;
    if (this.engine === 'starting') {
      // starter, light-off at ~1.2 s, then the gas generator winds up and the free turbine takes the rotor
      this.startTime += dt;
      if (this.startTime > 1.2) this.spool = Math.min(1, this.spool + dt / 4.2);
      if (this.nr > 0.97) this.engine = 'running';
    } else if (this.engine === 'running') {
      this.spool = Math.min(1, this.spool + dt * 0.5);
    } else this.spool = Math.max(0, this.spool - dt / 1.6);
    if (env.engineSubmerged && this.engine !== 'off') this.engine = 'off';

    let qe = 0;
    if (this.engine !== 'off' || this.spool > 0) {
      // the governor holds 100 % Nr; the turbine can only give what it has spooled up to
      const gov = this.Qa + 4 * (1 - this.nr) * qMax;
      qe = clamp(gov, 0, qMax * this.spool * this.spool * (this.engine === 'off' ? 0 : 1));
    }
    this.Qe = qe;
    let q = qe - this.Qa - 60 * Math.sign(this.nr);
    // rotor brake once it has slowed on the ground
    if (this.engine === 'off' && this.rotorBrake && this.out.onGround && this.nr < 0.45) q -= 2200 * smoothstep(0, 0.02, this.nr);
    this.nr = Math.max(0, this.nr + (q / (A.rotorJ * A.omega0)) * dt);
    if (this.nr > 1.18) this.nr = 1.18;
  }

  _recover() {
    this.vel.set(0, 0, 0);
    this.omega.set(0, 0, 0);
    if (!Number.isFinite(this.pos.x + this.pos.y + this.pos.z)) this.pos.set(-40, 4, 9);
    if (!Number.isFinite(this.quat.w + this.quat.x)) this.quat.identity();
    if (!Number.isFinite(this.nr)) this.nr = 0;
    this.vi = 0;
  }
}

/**
 * Stability augmentation between the keys and the controls.
 *
 * A keyboard is all or nothing, which on a real cyclic is a slam to the stop. With assist
 * on, the cyclic keys command an attitude (release and it levels), the pedals a yaw rate
 * with the torque trimmed out, and a power limiter keeps the collective inside the
 * transmission limit. "High" adds a hover hold and makes Space / Shift command a climb or
 * descent rate. "Off" hands the cyclic and pedals straight over (only the torque trim
 * stays). The rotorcraft underneath is the same full physical model in every mode.
 */
export class HeliAssist {
  constructor() { this.reset(); }

  reset() {
    this.iPitch = 0; this.iRoll = 0; this.iYaw = 0; this.iColl = 0;
    this.cLimit = 1;
    this.tiltComp = 0;
    this.sinkBoost = 0;
    this.hdg = null;
    this.air = 0; // 0 on the skids .. 1 flying
    this.att = { pitch: 0, bank: 0 };
  }

  _slip(h) {
    const q = h.quat;
    // body-left component of the air velocity over the airspeed
    const lx = 1 - 2 * (q.y * q.y + q.z * q.z), ly = 2 * (q.x * q.y + q.w * q.z), lz = 2 * (q.x * q.z - q.w * q.y);
    const V = Math.max(h.out.airspeed, 5);
    return ((h.vel.x - h.windX) * lx + h.vel.y * ly + (h.vel.z - h.windZ) * lz) / V;
  }

  static attitude(h, out) {
    const q = h.quat;
    const fy = 2 * (q.y * q.z - q.w * q.x);
    const ry = -2 * (q.x * q.y + q.w * q.z);
    out.pitch = Math.asin(clamp(fy, -1, 1));
    out.bank = Math.asin(clamp(-ry, -1, 1));
    return out;
  }

  /**
   * cmd: { x (right +), y (forward +), yaw (right +), lever 0..1, climb -1..1 (high mode) }
   * returns nothing; writes h.cyclicX / cyclicY / pedal / collective
   */
  update(h, cmd, mode, dt) {
    const A = h.A, o = h.out;
    const att = HeliAssist.attitude(h, this.att);
    const nr = Math.max(h.nr, 0.05);
    const ready = h.engine === 'running' && h.nr > 0.9;
    // how much the skids still carry
    const airT = o.contacts === 0 ? 1 : 1 - smoothstep(0.08, 0.5, o.load);
    this.air += (airT - this.air) * Math.min(1, dt * 6);
    const air = this.air;
    const V = o.airspeed;
    const qUp = -h.omega.x, p = h.omega.z, r = -h.omega.y;

    // torque trim: the pedal that cancels the engine's torque at this rotor speed
    const tailNeed = h.Qe / -A.tail.z;
    const ff = clamp((tailNeed / (A.tailMax * nr * nr) - A.tailBias) / (1 - A.tailBias), -1, 1);

    // the lever stays down on the skids until the rotor is up to speed
    const locked = !ready && o.contacts > 0;
    if (mode === 'off') {
      // no attitude hold, only rate damping (a keyboard can't fly a bare cyclic)
      // plus a weak pull back towards a level disc, like the speed stability of a real rotor
      h.cyclicX = clamp(cmd.x + (-0.8 * (att.bank + h.b1) - 0.45 * p) * air, -1, 1);
      h.cyclicY = clamp(cmd.y + (0.8 * (att.pitch - h.a1) + 0.6 * qUp) * air, -1, 1);
      h.pedal = clamp(ff + cmd.yaw - 0.8 * r * air, -1, 1);
      h.collective = locked ? Math.max(0, h.collective - dt * 0.5) : cmd.lever;
      this.iPitch = this.iRoll = this.iYaw = 0;
      return;
    }
    const high = mode === 'high';

    // ---------------------------------------------------------------- cyclic
    // on the skids: keep the disc level with the horizon (slope technique) plus a little input
    const gX = clamp(-att.bank / A.b1Max, -1, 1) * 0.8 + cmd.x * 0.35;
    const gY = clamp(att.pitch / A.a1Max, -1, 1) * 0.8 + cmd.y * 0.35;
    // flying: attitude command, levelling when released
    const fast = smoothstep(10, 30, V);
    const pMax = high ? 0.22 : 0.3;
    const bMax = high ? lerp(0.3, 0.42, fast) : lerp(0.36, 0.6, fast);
    let pitchT = -cmd.y * (cmd.y > 0 ? pMax : pMax * 0.8);
    let bankT = cmd.x * bMax;
    // drift damping near the hover (a real hover hold in High)
    const yaw = Math.atan2(2 * (h.quat.x * h.quat.z + h.quat.w * h.quat.y), 1 - 2 * (h.quat.x * h.quat.x + h.quat.y * h.quat.y));
    const sx = Math.sin(yaw), cz = Math.cos(yaw);
    const uG = h.vel.x * sx + h.vel.z * cz; // forward
    const vG = h.vel.x * -cz + h.vel.z * sx; // right
    const holdK = high ? 0.045 : 0.022;
    const holdV = high ? 14 : 12;
    const hold = (1 - smoothstep(holdV * 0.6, holdV, Math.hypot(uG, vG))) * air;
    const holdMax = high ? 0.2 : 0.12;
    if (Math.abs(cmd.y) < 0.05) pitchT += clamp(uG * holdK, -holdMax, holdMax) * hold;
    if (Math.abs(cmd.x) < 0.05) bankT -= clamp(vG * holdK, -holdMax, holdMax) * hold;
    // lean the disc against the tail rotor's sideways push (translating tendency)
    bankT += clamp(o.tailThrust / Math.max(h.thrust, 4000), -0.1, 0.1) * air * (1 - fast);

    // the loop flies the rotor disc (the thrust vector), not the cabin: released, the disc
    // levels and the helicopter coasts on its momentum while drag slows it
    const sched = 1 / clamp((h.thrust / (A.mass * G)) * nr, 0.6, 1.4);
    const ePitch = att.pitch - h.a1 - pitchT;
    const eBank = bankT - (att.bank + h.b1);
    if (air > 0.6) {
      this.iPitch = clamp(this.iPitch + ePitch * 0.7 * dt, -0.5, 0.5);
      this.iRoll = clamp(this.iRoll + eBank * 0.7 * dt, -0.5, 0.5);
    } else {
      this.iPitch *= 1 - Math.min(1, dt * 2);
      this.iRoll *= 1 - Math.min(1, dt * 2);
    }
    const fY = (3.0 * ePitch + 0.8 * qUp) * sched + this.iPitch;
    const fX = (3.2 * eBank - 0.55 * p) * sched + this.iRoll;
    h.cyclicY = clamp(lerp(gY, fY, air), -1, 1);
    h.cyclicX = clamp(lerp(gX, fX, air), -1, 1);

    // ---------------------------------------------------------------- pedals: yaw-rate command
    const coord = (G * Math.tan(clamp(att.bank, -1, 1))) / Math.max(V, 15) * smoothstep(12, 25, V);
    const rMax = lerp(0.95, 0.35, fast);
    // at speed the pedals also keep the slip ball centred (beta > 0: the air comes from the left)
    const vbx = this._slip(h);
    let rT = cmd.yaw * rMax + coord - clamp(vbx, -0.3, 0.3) * 1.5 * fast;
    // pedals released in the hover: hold the heading
    if (Math.abs(cmd.yaw) > 0.05 || air < 0.6 || this.hdg === null || fast > 0.5) this.hdg = yaw;
    else rT += clamp(Math.atan2(Math.sin(yaw - this.hdg), Math.cos(yaw - this.hdg)) * 1.5, -0.3, 0.3) * (1 - fast * 2);
    const eR = rT - r;
    if (air > 0.6) this.iYaw = clamp(this.iYaw + eR * 0.9 * dt, -0.5, 0.5);
    else this.iYaw *= 1 - Math.min(1, dt * 2);
    const fP = ff + 1.6 * eR + this.iYaw;
    h.pedal = clamp(lerp(ff + cmd.yaw * 0.6, fP, air), -1, 1);

    // ---------------------------------------------------------------- collective
    if (locked) {
      h.collective = Math.max(0, h.collective - dt * 0.5);
      this.iColl = 0;
      this.cLimit = 1;
      return;
    }
    // power limiter (first-limitation style): never ask for more than the transmission takes
    const over = Math.max(0, o.demand - 1) + Math.max(0, 0.985 - h.nr) * 3;
    if (over > 0) this.cLimit = Math.min(this.cLimit, h.collective) - over * dt * 3;
    else if (o.demand < 0.96) this.cLimit = Math.min(1, this.cLimit + dt * 0.25);
    let c;
    if (high && !ready) {
      // engine out: hold rotor speed down the descent, cushion with the lever near the ground
      c = 0.12 + 0.6 * (1 - smoothstep(1, 7, o.agl)) * smoothstep(0.75, 0.95, h.nr) - 2 * Math.max(0, 0.95 - h.nr);
      c = h.collective + clamp(c - h.collective, -0.8 * dt, 1.2 * dt);
    } else if (high) {
      // Space / Shift ask for a climb or a descent; released, it holds the height
      let vsT = cmd.climb > 0 ? 3.5 * cmd.climb : 2.5 * cmd.climb;
      if (o.agl < 4 && vsT < 0) vsT = Math.max(vsT, -lerp(0.6, 2.5, smoothstep(0.5, 4, o.agl)));
      if (o.contacts > 0 && cmd.climb <= 0) {
        // settled: lower the lever to flat pitch
        c = Math.max(0, h.collective - dt * 0.45);
        this.iColl = 0;
      } else {
        const e = vsT - o.vs;
        this.iColl = clamp(this.iColl + e * 0.03 * dt, -0.2, 0.2);
        c = o.cHover + 0.05 * e + this.iColl;
        // rate-limit the lever so the response stays smooth
        c = h.collective + clamp(c - h.collective, -0.5 * dt, 0.6 * dt);
      }
    } else {
      // the lever is the pilot's; the assist only adds what tilting the disc takes away,
      // so pushing the cyclic doesn't dive and pulling it doesn't balloon (ETL and ground
      // effect are left for the pilot to feel)
      this.tiltComp += (clamp(o.cTilt + 0.75 * o.cEtl, -0.2, 0.3) * air - this.tiltComp) * Math.min(1, dt * 3);
      c = cmd.lever + this.tiltComp;
      // sink-rate protection: slow and low, the assist won't let her settle faster than a safe
      // rate (and stays out of the vortex ring); fast and high the lever is all the pilot's
      if (ready && air > 0.5) {
        const slow = 1 - smoothstep(12, 22, V);
        const vsMin = -lerp(lerp(1.3, 4.0, smoothstep(1, 14, o.agl)), 9, 1 - slow);
        const need = o.cHover + 0.06 * (vsMin - o.vs) + 0.02;
        const k = smoothstep(vsMin + 1.2, vsMin, o.vs);
        this.sinkBoost += ((k > 0 ? Math.max(0, need - c) * k : 0) - this.sinkBoost) * Math.min(1, dt * 5);
        c += this.sinkBoost;
      } else this.sinkBoost = 0;
    }
    h.collective = clamp(Math.min(c, this.cLimit), 0, 1);
  }
}
