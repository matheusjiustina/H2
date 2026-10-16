// Helicopter flight model (Robinson R44 class), separate from the fixed-wing
// FlightModel, which it does not touch or share state with.
//
// Written for AGRO WINGS from standard rotorcraft theory (no external
// source; the Tropical Island helicopter code was not available):
//  * main rotor: blade-element thrust with momentum inflow solved each step
//    (translational lift, climb/descent, ground effect, a vortex-ring
//    penalty), profile + induced + climb power, in-plane H-force;
//  * rotor speed: rotor inertia driven through a sprag clutch by a governed,
//    density-limited piston engine; power deficit decays rotor rpm, a
//    descent with the collective down drives it (autorotation);
//  * teetering two-blade rotor: no hub moment — control comes only from
//    tilting the thrust vector about the hub (low-g matters); disc tilt is
//    a first-order flapping response to cyclic, with flap-back from airspeed
//    and the rotor's lag behind body rates (damping);
//  * tail rotor on the gear train (anti-torque, sideward drift and its own
//    inflow, which gives yaw damping); shaft-torque reaction on the cabin;
//  * fuselage drag per axis, fin and stabiliser stability terms;
//  * four skid contacts (spring/damper, Coulomb friction, no wheels);
//  * never-touch points: blade tips, tail rotor, stinger, nose, tank, booms.
//
// Body frame as the airplanes: +Z nose, +Y up, +X left. omega in body frame:
// +x = nose down, +y = yaw left, +z = roll right.
import { Vector3, Quaternion } from 'three';
import { UNITS } from '../config.js';
import { clamp, smoothstep } from '../core/math.js';

const G = 9.81;
const TAU = Math.PI * 2;
const _v1 = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3(), _v4 = new Vector3();
const _n = new Vector3(), _f = new Vector3(), _m = new Vector3(), _r = new Vector3(), _air = new Vector3(), _vb = new Vector3();
const _qInv = new Quaternion(), _dq = new Quaternion(), _Iw = new Vector3(), _gyro = new Vector3();
const _nrm = { x: 0, y: 1, z: 0 };

// Blade-element thrust coefficient with uniform inflow, solved together with
// momentum inflow (lambda: total inflow ratio, positive down through the disc).
// kGE scales induced inflow (ground effect). Returns { CT, lam, lamI }.
export function solveRotor(theta, lamC, mu, sigma, a, kGE, lam0) {
  let lam = lam0;
  let CT = 0, lamI = 0;
  for (let i = 0; i < 10; i++) {
    CT = (sigma * a / 2) * ((theta / 3) * (1 + 1.5 * mu * mu) - lam / 2);
    const den = 2 * Math.max(0.02, Math.sqrt(mu * mu + lam * lam));
    lamI = (CT / den) * kGE;
    const next = lamC + lamI;
    lam += 0.55 * (next - lam);
  }
  CT = (sigma * a / 2) * ((theta / 3) * (1 + 1.5 * mu * mu) - lam / 2);
  return { CT, lam, lamI };
}

export class HeliModel {
  constructor(A) {
    this.A = A;
    this.kind = 'heli';
    this.pos = new Vector3();
    this.vel = new Vector3();
    this.quat = new Quaternion();
    this.omega = new Vector3();
    // Pilot controls after the assist: cyclic (+fwd, +right), pedal (+right), collective 0..1.
    this.cyclicLon = 0; this.cyclicLat = 0; this.pedal = 0; this.collective = 0; this.trim = 0;
    // Engine / drive train.
    this.engine = 'off'; this.crankTime = 0; this.rpm = 0; this.throttle = 0; this.power = 0; this.powerCmd = 0;
    this.phase = 'off'; // off | idle | clutch | warm | flight
    this.phaseT = 0; this.clutch = 0; this.govI = 0;
    this.rotorOmega = 0; this.rotorRpm = 0; this.rotorAngle = 0; this.tailAngle = 0;
    this.rotorBrake = false;
    this.roughness = 0; this.extraDrag = 0;
    // Rotor state.
    this.a1 = 0; this.b1 = 0; this.lam = 0.03; this.lamTr = 0.06;
    this.thrust = 0; this.tailThrust = 0; this.pMain = 0; this.pTail = 0; this.shaftTorque = 0;
    // Engine instruments (derived from the simulated power and rpm).
    this.map = 0; this.cht = 30; this.oilT = 30; this.oilP = 0; this.amps = 0; this.fuelFlow = 0;
    this.fuel = A.fuelCapacity * 0.5;
    this.hopper = 0;
    // Skid contacts; `anchor` holds a static-friction stick point (world x, z).
    this.skid = A.skids.map((p) => ({ pv: new Vector3(...p), prevPen: -1, onGround: false, load: 0, anchor: null }));
    // Never-touch points except the rotor tips (those follow the disc).
    this.hard = [
      { name: 'tailRotor', p: [0.32, A.tailRotor.height - A.tailRotor.radius, -A.tailRotor.arm] },
      { name: 'stinger', p: [0, -0.05, -5.75] },
      { name: 'nose', p: [0, -0.62, 2.2] },
      { name: 'tank', p: [0, -1.07, 0.15] },
      { name: 'boomL', p: [4.3, -1.16, 0.55] },
      { name: 'boomR', p: [-4.3, -1.16, 0.55] },
    ].map((h) => ({ ...h, pv: new Vector3(...h.p), prev: -1 }));
    this.out = {
      airspeed: 0, groundSpeed: 0, alpha: 0, beta: 0, stall: 0, stallWarn: 0, agl: 100, onGround: false,
      wheelsOnGround: 0, thrust: 0, gLoad: 1, vs: 0, cropDepth: 0, surface: 'grass', density: 1.225, mass: 0,
      rotorPct: 0, enginePct: 0, lowRotor: 0, mu: 0, inGE: 0, vrs: 0,
    };
    this.events = [];
    this.inertia = new Vector3();
    this._accel = new Vector3();
    this.time = 0;
    this.updateMass();
  }

  updateMass() {
    const A = this.A;
    const fuelKg = this.fuel * A.fuelDensity, hopKg = this.hopper * A.liquidDensity;
    this.mass = A.emptyMass + A.agKitMass + A.pilotMass + fuelKg + hopKg;
    const [ip, iy, ir] = A.inertia;
    // Tank load sits under the mast: adds mostly to pitch and roll.
    this.inertia.set(ip + hopKg * 0.35 + fuelKg * 0.3, iy + hopKg * 0.3 + fuelKg * 0.4, ir + hopKg * 0.25 + fuelKg * 0.3);
    this.out.mass = this.mass;
  }

  heading() {
    const f = _v1.set(0, 0, 1).applyQuaternion(this.quat);
    return Math.atan2(f.x, f.z);
  }

  reset(p, heading, { speed = 0, engineOn = false } = {}) {
    this.pos.copy(p);
    this.quat.setFromAxisAngle(_v1.set(0, 1, 0), heading);
    this.vel.set(Math.sin(heading), 0, Math.cos(heading)).multiplyScalar(speed);
    this.omega.set(0, 0, 0);
    this.cyclicLon = this.cyclicLat = this.pedal = 0;
    this.a1 = this.b1 = 0;
    const R = this.A.rotor;
    if (engineOn) {
      this.engine = 'running'; this.phase = 'flight'; this.clutch = 1;
      this.rotorOmega = (R.rpm100 * R.govPct / 100) * TAU / 60;
      this.collective = 0.5; this.cht = 180; this.oilT = 80;
    } else {
      this.engine = 'off'; this.phase = 'off'; this.clutch = 0; this.rotorOmega = 0; this.collective = 0;
    }
    this.govI = 0; this.lam = 0.03; this.lamTr = 0.06; this.rotorBrake = false;
    for (const s of this.skid) { s.prevPen = -1; s.onGround = false; }
    for (const h of this.hard) h.prev = -1;
    this.updateMass();
    this._instruments(0, 1.2);
  }

  // At rest on the skids.
  settleOnGround(x, z, heading, env) {
    this.reset(new Vector3(x, 0, z), heading);
    const gh = env.ground(x, z);
    this.pos.y = gh - this.A.skids[0][1] - 0.02;
  }

  // ------------------------------------------------------------------ engine
  _driveTrain(h, rho, sigmaRho, pReq) {
    const A = this.A, E = A.engine, R = A.rotor;
    const om100 = R.rpm100 * TAU / 60;
    const nr = this.rotorOmega / om100;
    // Derated engine: full rated power available up to where the density
    // lapse of the unrated engine (≈ 6.5 % above the rating) reaches it.
    const pAvail = Math.min(E.ratedKW, E.ratedKW * 1.065 * Math.pow(sigmaRho, 1.1)) * 1000 * (1 - this.roughness * 0.3);
    let pEng = 0, engPct = 0;
    this.phaseT += h;
    if (this.engine === 'cranking') {
      this.crankTime += h;
      engPct = 9 + 4 * Math.sin(this.crankTime * 31);
      if (this.crankTime > E.crankS) {
        this.engine = 'running'; this.phase = 'clutch'; this.phaseT = 0; this.clutch = Math.max(this.clutch, 0);
        this.events.push({ kind: 'catch' });
      }
    } else if (this.engine === 'running') {
      if (this.fuel <= 0) { this.engine = 'off'; this.phase = 'off'; this.events.push({ kind: 'starved' }); }
    }
    if (this.engine === 'running') {
      // Phases of a (game-compressed) R44 start: belt clutch engages with the
      // engine at idle, warm-up near 75 %, then the governor brings the rotor
      // to 101–102 % and holds it.
      const idle = E.idlePct / 100;
      let setPct;
      if (this.phase === 'clutch') {
        this.clutch = Math.min(1, this.clutch + h / 16);
        setPct = idle;
        if (this.clutch >= 1 && nr > idle - 0.02) { this.phase = 'warm'; this.phaseT = 0; this.govI = 0; }
      } else if (this.phase === 'warm') {
        setPct = 0.75;
        if (this.phaseT > 6 && nr > 0.72) { this.phase = 'flight'; this.phaseT = 0; this.govI = 0; }
      } else {
        // Governor ramps the setpoint up, then holds 101.5 %.
        setPct = Math.min(R.govPct / 100, 0.75 + this.phaseT * 0.05);
      }
      const engRpmFrac = this.phase === 'clutch' ? Math.max(idle, nr) : nr;
      engPct = engRpmFrac * 100;
      // PI on rotor speed with power-required feed-forward.
      const err = setPct - nr;
      this.govI = clamp(this.govI + err * h, -0.5, 0.5);
      const ff = Math.max(0, pReq) / Math.max(pAvail, 1);
      let frac = clamp(ff + 9 * err + 4 * this.govI, 0, 1);
      if (this.phase === 'clutch') { frac = clamp(0.12 + 2 * err, 0, 0.3); this.govI = 0; }
      this.powerCmd = frac * pAvail;
      // Engine response lag.
      this.power += (this.powerCmd - this.power) * Math.min(1, h / E.lagS);
      pEng = this.power;
    } else {
      this.power += (0 - this.power) * Math.min(1, h / 0.3);
      if (this.engine === 'off') engPct = Math.max(0, (this.rpm / E.rpm100) * 100 - h * 40);
    }
    this.rpm = engPct / 100 * E.rpm100;
    this.throttle = clamp(this.power / (E.ratedKW * 1000), 0, 1.2);
    // Shaft power reaching the rotors: slips through the belt clutch while
    // it engages; the sprag clutch freewheels when the rotor overruns.
    let pShaft = pEng * E.transEff;
    if (this.engine === 'running' && this.phase === 'clutch') pShaft *= this.clutch;
    if (this.engine !== 'running') pShaft = 0;
    return { pShaft, pAvail, nr };
  }

  // ------------------------------------------------------------------ step
  step(h, env) {
    const A = this.A, R = A.rotor, TR = A.tailRotor;
    this.events.length = 0;
    this.time += h;
    const q = this.quat;
    _qInv.copy(q).invert();
    const alt = this.pos.y + UNITS.altOffsetM;
    const rho = 1.225 * Math.pow(Math.max(0.3, 1 - 2.25577e-5 * alt), 4.2559);
    const sigmaRho = rho / 1.225;
    const gh = env.ground(this.pos.x, this.pos.z);
    const cropH = env.cropHeight(this.pos.x, this.pos.z);
    _air.copy(this.vel).sub(env.wind);
    _vb.copy(_air).applyQuaternion(_qInv); // air-relative velocity, body frame
    const force = _f.set(0, -this.mass * G, 0); // world frame
    const mom = _m.set(0, 0, 0); // body frame

    // --- main rotor ------------------------------------------------------
    const Om = this.rotorOmega;
    const Vt = Math.max(1e-3, Om * R.radius);
    const area = Math.PI * R.radius * R.radius;
    const sigma = (R.blades * R.chord) / (Math.PI * R.radius);
    const theta = R.pitchMin + clamp(this.collective, 0, 1) * (R.pitchMax - R.pitchMin);
    // Disc tilt (flapping): cyclic, flap-back with airspeed, lag behind body rates.
    const om100 = R.rpm100 * TAU / 60;
    const tauF = 16 / (R.lock * Math.max(Om, om100 * 0.35));
    const muX = _vb.z / Vt, muY = _vb.x / Vt;
    const blow = (4 / 3) * theta - this.lam;
    const a1t = (clamp(this.cyclicLon + this.trim, -1, 1)) * R.cyclicLon - 2 * muX * blow + tauF * (-this.omega.x);
    const b1t = clamp(this.cyclicLat, -1, 1) * R.cyclicLat + 2 * muY * blow - tauF * this.omega.z;
    const kf = Math.min(1, h / Math.max(0.03, tauF));
    this.a1 += (clamp(a1t, -0.26, 0.26) - this.a1) * kf;
    this.b1 += (clamp(b1t, -0.22, 0.22) - this.b1) * kf;
    const nb = _n.set(-Math.sin(this.b1) * Math.cos(this.a1), Math.cos(this.a1) * Math.cos(this.b1), Math.sin(this.a1)).normalize();
    // Flow through the disc (body frame, includes the rotor's own motion from body rates at the hub).
    const hub = _r.set(-A.cgLateral, R.hubHeight, R.hubZ);
    const vHub = _v2.copy(_vb).add(_v3.copy(this.omega).cross(hub)); // ω × r adds the hub's rotational velocity
    const vn = vHub.dot(nb);
    const vip = _v4.copy(vHub).addScaledVector(nb, -vn);
    const mu = vip.length() / Vt;
    // Ground effect from the hub height over ground (crop canopy counts half).
    const hubY = this.pos.y + _v1.copy(hub).applyQuaternion(q).y;
    const zg = Math.max(0.5 * R.radius, hubY - gh - 0.5 * cropH);
    const vh0 = Math.sqrt((this.mass * G) / (2 * rho * area));
    let kGE = 1 - (R.radius / (4 * zg)) ** 2;
    const vHor = Math.hypot(_air.x, _air.z);
    kGE = 1 - (1 - kGE) / (1 + (vHor / vh0) ** 2);
    let T = 0, pMain = 0, H = 0, vrs = 0;
    if (Om > 2) {
      const sol = solveRotor(theta, vn / Vt, mu, sigma, R.liftSlope, kGE, this.lam);
      this.lam = sol.lam;
      T = sol.CT * rho * area * Vt * Vt;
      // Vortex-ring state: descending into its own wake at low airspeed the
      // rotor loses and buffets thrust (settling with power).
      const x = -vn / Math.max(1, vh0);
      if (x > 0.25 && x < 1.9 && mu < 0.1) {
        vrs = smoothstep(0.25, 0.7, x) * (1 - smoothstep(1.3, 1.9, x)) * (1 - mu / 0.1);
        T *= 1 - vrs * (0.16 + 0.06 * Math.sin(this.time * 9.1) * Math.sin(this.time * 3.3));
      }
      const p0 = (sigma * R.cd0 / 8) * rho * area * Vt * Vt * Vt * (1 + 4.65 * mu * mu);
      pMain = T * sol.lam * Vt + p0;
      H = (sigma * R.cd0 / 4) * mu * rho * area * Vt * Vt;
    } else this.lam = 0.03;
    // Rotor forces and moments (teetering hub: thrust tilt only).
    const Fr = _v3.copy(nb).multiplyScalar(T);
    if (mu > 1e-4 && H > 0) Fr.addScaledVector(vip, -H / (mu * Vt)); // H-force opposes in-plane flow
    mom.add(_v1.copy(hub).cross(Fr));
    force.add(_v2.copy(Fr).applyQuaternion(q));

    // --- tail rotor (on the gear train) ----------------------------------
    const OmT = Om * TR.gear;
    const VtT = Math.max(1e-3, OmT * TR.radius);
    const areaT = Math.PI * TR.radius * TR.radius;
    const sigmaT = (2 * TR.chord) / (Math.PI * TR.radius);
    const thetaT = TR.pitchMax + (TR.pitchMin - TR.pitchMax) * (clamp(this.pedal, -1, 1) + 1) / 2;
    const rT = _r.set(0.32, TR.height, -TR.arm);
    const vT = _v1.copy(_vb).add(_v2.copy(this.omega).cross(rT));
    // Thrust points to -X (pushes the tail right); flow along it is "climb".
    const vAx = -vT.x;
    const muT = Math.hypot(vT.y, vT.z) / VtT;
    let TT = 0, pTail = 0;
    if (Om > 2) {
      const sol = solveRotor(thetaT, vAx / VtT, muT, sigmaT, 5.73, 1, this.lamTr);
      this.lamTr = sol.lam;
      TT = sol.CT * rho * areaT * VtT * VtT;
      pTail = TT * sol.lam * VtT + (sigmaT * 0.012 / 8) * rho * areaT * VtT ** 3 * (1 + 4.65 * muT * muT);
    }
    const FT = _v2.set(-TT, 0, 0);
    mom.add(_v4.copy(rT).cross(FT));
    force.add(FT.applyQuaternion(q));

    // --- drive train and rotor speed -------------------------------------
    const friction = 900 + 4.5 * Om * Om; // bearings, gearbox, cooling fan (W)
    const pReq = pMain + pTail + friction;
    const dt = this._driveTrain(h, rho, sigmaRho, pReq);
    // Rotor brake (pilot applies it after shutdown below ~40 %).
    this.rotorBrake = this.engine === 'off' && dt.nr < 0.4 && dt.nr > 0;
    const brakeQ = this.rotorBrake ? 900 : 0;
    const Qnet = (dt.pShaft - pReq) / Math.max(Om, 4) - brakeQ * Math.sign(Om);
    this.rotorOmega = Math.max(0, Om + (Qnet / R.inertia) * h);
    if (this.rotorOmega < 0.05 && this.engine !== 'running') this.rotorOmega = 0;
    this.rotorRpm = this.rotorOmega * 60 / TAU;
    this.rotorAngle = (this.rotorAngle + this.rotorOmega * h) % TAU;
    this.tailAngle = (this.tailAngle - this.rotorOmega * TR.gear * h) % TAU;
    // Reaction of the torque applied to the main-rotor shaft on the cabin
    // (CCW rotor: nose right). The tail rotor and friction are driven by the
    // same gearbox, so in autorotation the reaction reverses (nose left).
    this.shaftTorque = (dt.pShaft - pTail - friction) / Math.max(Om, 4);
    mom.y -= this.shaftTorque;
    this.thrust = T; this.tailThrust = TT; this.pMain = pMain; this.pTail = pTail;

    // --- airframe aerodynamics --------------------------------------------
    const V = _vb.length();
    const [fx, fy, fz] = A.dragArea;
    const dragB = _v1.set(-0.5 * rho * Math.abs(_vb.x) * _vb.x * fx, -0.5 * rho * Math.abs(_vb.y) * _vb.y * fy, -0.5 * rho * Math.abs(_vb.z) * _vb.z * fz * (1 + this.extraDrag));
    force.add(dragB.applyQuaternion(q));
    const qd = 0.5 * rho * V * V;
    if (V > 3) {
      const fwd = smoothstep(4, 18, _vb.z);
      // Fin: weathercock into the relative wind; stabiliser: pitch stiffness.
      mom.y += A.finYaw * qd * (_vb.x / V) * (0.4 + 0.6 * fwd);
      mom.x += A.stabPitch * qd * (-_vb.y / V) * fwd;
    }
    // Airframe rate damping (fin, stabiliser, cabin), grows with speed.
    mom.x -= (120 + 9 * V) * this.omega.x;
    mom.y -= (160 + 14 * V) * this.omega.y;
    mom.z -= (90 + 4 * V) * this.omega.z;

    // --- skids --------------------------------------------------------------
    let touching = 0;
    let surface = 'grass';
    const nrm = env.normal ? env.normal(this.pos.x, this.pos.z, _nrm) : _nrm;
    for (const s of this.skid) {
      const pw = _v1.copy(s.pv).applyQuaternion(q).add(this.pos);
      const g = env.ground(pw.x, pw.z);
      const pen = g - pw.y;
      s.onGround = pen > 0;
      if (pen > 0) {
        touching++;
        surface = env.surface(pw.x, pw.z);
        // Point velocity (world): v + ω × r.
        const rW = _v2.copy(s.pv).applyQuaternion(q);
        const wW = _v3.copy(this.omega).applyQuaternion(q);
        const vp = _v4.copy(wW).cross(rW).add(this.vel);
        const vnn = vp.x * nrm.x + vp.y * nrm.y + vp.z * nrm.z;
        if (s.prevPen <= 0 && vnn < -0.3) this.events.push({ kind: 'touch', part: 'skid', speed: -vnn });
        const N = Math.max(0, A.skidK * pen - A.skidC * vnn);
        s.load = N;
        // Friction: stick (anchored spring, up to static friction) or slide
        // (Coulomb), so a skid neither creeps under a small torque nor
        // grips beyond mu·N.
        const vtx = vp.x - vnn * nrm.x, vty = vp.y - vnn * nrm.y, vtz = vp.z - vnn * nrm.z;
        const vtm = Math.hypot(vtx, vty, vtz);
        const cap = A.skidMu * N;
        let ftx, ftz, fty = 0;
        if (!s.anchor && vtm < 0.08) s.anchor = { x: pw.x, z: pw.z };
        if (s.anchor) {
          ftx = -60000 * (pw.x - s.anchor.x) - 5000 * vtx;
          ftz = -60000 * (pw.z - s.anchor.z) - 5000 * vtz;
          const fm2 = Math.hypot(ftx, ftz);
          if (fm2 > cap * 1.15) { s.anchor = null; ftx *= cap / fm2; ftz *= cap / fm2; }
        } else {
          const fr = cap / Math.max(vtm, 0.05);
          ftx = -vtx * fr; fty = -vty * fr; ftz = -vtz * fr;
        }
        const Fx = N * nrm.x + ftx, Fy = N * nrm.y + fty, Fz = N * nrm.z + ftz;
        force.x += Fx; force.y += Fy; force.z += Fz;
        // Moment in body frame.
        const Fb = _v4.set(Fx, Fy, Fz).applyQuaternion(_qInv);
        mom.add(_v2.copy(s.pv).cross(Fb));
      } else s.load = 0;
      if (pen <= 0) s.anchor = null;
      s.prevPen = pen;
    }

    // Skids, tank and booms through a crop canopy: drag, and a warning.
    const skidY = this.pos.y + _v1.set(0, A.skids[0][1], 0).applyQuaternion(q).y;
    const cropDepth = cropH > 0 ? Math.max(0, gh + cropH - skidY) : 0;
    if (cropDepth > 0.05 && !touching) {
      const k = Math.min(1, cropDepth / 0.6) * 260;
      force.x -= this.vel.x * k; force.z -= this.vel.z * k;
      if (Math.hypot(this.vel.x, this.vel.z) > 6) this.events.push({ kind: 'crop', depth: cropDepth, speed: Math.hypot(this.vel.x, this.vel.z) });
    }

    // --- integrate ----------------------------------------------------------
    this._accel.copy(force).divideScalar(this.mass);
    this.vel.addScaledVector(this._accel, h);
    this.pos.addScaledVector(this.vel, h);
    const I = this.inertia;
    _Iw.set(I.x * this.omega.x, I.y * this.omega.y, I.z * this.omega.z);
    _gyro.copy(this.omega).cross(_Iw);
    this.omega.x += ((mom.x - _gyro.x) / I.x) * h;
    this.omega.y += ((mom.y - _gyro.y) / I.y) * h;
    this.omega.z += ((mom.z - _gyro.z) / I.z) * h;
    const wl = this.omega.length();
    if (wl > 1e-9) {
      _dq.setFromAxisAngle(_v1.copy(this.omega).divideScalar(wl), wl * h);
      this.quat.multiply(_dq).normalize();
    }

    // --- never-touch points --------------------------------------------------
    this._hardPoints(env);

    // --- fuel ------------------------------------------------------------------
    const fuelLph = (this.engine === 'running' ? Math.max(this.power / 1000, 12) : 0) * A.fuelPerKWh;
    this.fuelFlow = fuelLph;
    this.fuel = Math.max(0, this.fuel - (fuelLph / 3600) * h * A.fuelBurnScale);
    this._instruments(h, sigmaRho);

    // --- outputs -----------------------------------------------------------------
    const o = this.out;
    o.density = rho;
    o.airspeed = Math.max(0, _vb.z); // pitot: forward component
    o.groundSpeed = Math.hypot(this.vel.x, this.vel.z);
    o.agl = skidY - gh;
    o.onGround = touching > 0;
    o.wheelsOnGround = touching;
    o.vs = this.vel.y;
    o.surface = surface;
    o.cropDepth = cropDepth;
    o.thrust = T;
    o.beta = V > 3 ? Math.atan2(-_vb.x, Math.max(0.5, _vb.z)) : 0;
    o.alpha = V > 3 ? Math.atan2(-_vb.y, Math.max(0.5, _vb.z)) : 0;
    o.gLoad = _v1.copy(this._accel).add(_v2.set(0, G, 0)).applyQuaternion(_qInv).y / G;
    o.rotorPct = (this.rotorOmega / om100) * 100;
    o.enginePct = (this.rpm / A.engine.rpm100) * 100;
    o.lowRotor = this.engine === 'running' && this.phase === 'flight' && this.phaseT > 6 && o.rotorPct < 97 ? 1 : 0;
    o.stall = 0; o.stallWarn = o.lowRotor;
    o.mu = mu; o.inGE = 1 - kGE; o.vrs = vrs;
  }

  _hardPoints(env) {
    const R = this.A.rotor, q = this.quat;
    // Blade tips at 8 azimuths on the tilted disc (coning while turning,
    // droop at rest). A strike stops the rotor and wrecks the aircraft.
    const cone = (this.rotorPct ?? this.out.rotorPct) > 50 ? R.precone : -0.03;
    const nb = _n.set(-Math.sin(this.b1) * Math.cos(this.a1), Math.cos(this.a1) * Math.cos(this.b1), Math.sin(this.a1)).normalize();
    const e1 = _v3.set(1, 0, 0).addScaledVector(nb, -nb.x).normalize();
    const e2 = _v4.crossVectors(e1, nb).normalize();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      const p = _v1.set(-this.A.cgLateral, R.hubHeight, R.hubZ)
        .addScaledVector(e1, Math.cos(a) * R.radius).addScaledVector(e2, Math.sin(a) * R.radius).addScaledVector(nb, cone * R.radius);
      p.applyQuaternion(q).add(this.pos);
      if (p.y < env.ground(p.x, p.z) + 0.05) {
        this.events.push({ kind: 'ground', part: 'rotor', speed: this.rotorOmega * R.radius });
        break;
      }
    }
    for (const hp of this.hard) {
      const pw = _v1.copy(hp.pv).applyQuaternion(q).add(this.pos);
      const pen = env.ground(pw.x, pw.z) - pw.y;
      if (pen > 0 && hp.prev <= 0) {
        const rW = _v2.copy(hp.pv).applyQuaternion(q);
        const vp = _v3.copy(this.omega).applyQuaternion(q).cross(rW).add(this.vel);
        this.events.push({ kind: 'ground', part: hp.name, speed: vp.length() });
      }
      hp.prev = pen;
    }
  }

  // Engine gauges from the simulated state (no animation of their own).
  _instruments(h, sigmaRho) {
    const E = this.A.engine;
    const running = this.engine === 'running';
    const pFrac = this.power / (E.ratedKW * 1000);
    // Manifold pressure: ambient with the engine stopped, falling to ~12 inHg
    // at idle, rising with power to ~25 inHg at take-off power (sea level).
    const amb = 29.92 * Math.pow(sigmaRho, 0.81);
    this.map = this.engine === 'off' ? amb : this.engine === 'cranking' ? amb - 4 : 12 + 13.5 * clamp(pFrac, 0, 1.1) * Math.pow(sigmaRho, 0.3);
    const k = Math.min(1, h / 40);
    this.cht += ((running ? 150 + 85 * pFrac : 30) - this.cht) * k;
    this.oilT += ((running ? 65 + 35 * pFrac : 30) - this.oilT) * Math.min(1, h / 90);
    const rpmF = this.rpm / E.rpm100;
    this.oilP = running || this.engine === 'cranking' ? clamp(25 + 55 * rpmF - (this.oilT - 60) * 0.15, 0, 95) : Math.max(0, this.oilP - h * 30);
    this.amps = running && rpmF > 0.5 ? 6 + 4 * Math.exp(-this.phaseT * 0.05) : this.engine === 'cranking' ? -40 : -3;
  }
}
