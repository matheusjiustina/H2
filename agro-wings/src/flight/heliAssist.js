// Helicopter control laws (optional assistance), separate from the airplane
// Assist. The pilot's stick, pedals and collective lever come in; cyclic,
// pedal and collective positions go to the HeliModel.
//  'off'    — raw: stick = cyclic (with longitudinal trim), pedals = tail-rotor
//             pitch, lever = collective. The aircraft is unstable in hover,
//             as a real one is.
//  'normal' — attitude command / attitude hold (an AFCS-like SAS): the stick
//             commands pitch and bank angles, centred it holds the pitch it
//             was released at and rolls wings-level; pedals command yaw
//             rate, released they hold heading (turn-coordinated above
//             ~35 kt; on the skids while the collective is up, too). The
//             collective stays the pilot's.
//  'high'   — beginner: with the power model (the default) the stick tilts
//             the helicopter for as long as it is held (up to 45° nose
//             down), so the speed follows the tilt and the power: let go and
//             it levels out and glides on, slowing down by itself. With the
//             detailed rotor model, a centred stick below ~55 kt brings the
//             aircraft back to a hover over the ground (above that it holds
//             speed). With the detailed rotor model the lever also
//             commands climb/descent rate and holds height when released
//             (without drooping the rotor); with the power model the lever
//             stays the pilot's power (only power moves the aircraft up and
//             down), with the landing cushion of 'normal'.
//  'auto'   — the test autopilot's mode: 'high' with the climb-rate lever law
//             in both models.
// Nothing here changes the physics; it only moves the controls.
import { clamp, smoothstep } from '../core/math.js';
import { FlightModel } from './flightModel.js';

const G = 9.81;
// 'high' with the power model: tilt rates (rad/s at full stick) and limits (rad).
const TILT = { pitchRate: 0.3, bankRate: 0.5, lead: 0.12, down: 0.79, up: 0.52, bank: 0.87 };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class HeliAssist {
  constructor() { this.reset(); this._att = {}; }

  reset() {
    this.iLon = 0; this.iLat = null; this.iYaw = 0; this.iCol = null;
    this.holdPitch = 0; this.holdHdg = null; this.holdAlt = null;
    this.pHeld = false; this.pRef = 0; this.vHold = null; this.iSpd = null; this.vsCmd = null; this.cush = 0;
    this.iHP = 0; this.iHR = 0; this.tP = 0; this.tB = 0; // 'high' (power model): tilt targets
    this.pT = null; this.bT = null; // power model: rate-limited attitude targets
  }

  // cmd: { pitch (+ aft stick), roll (+ right), yaw (+ right pedal), lever 0..1 }
  update(fm, cmd, mode, h) {
    const o = fm.out;
    // Lateral cyclic trim the hover needs: against the tail rotor's drift in
    // the rotor model, none in the power model.
    if (this.iLat === null) this.iLat = fm.powerModel === 'power' ? 0 : -0.3;
    const att = FlightModel.attitude(fm, this._att); // pitch + nose up, bank + right
    const airborne = !o.onGround && o.agl > 0.03; // the laws stay on down to the skids
    if (mode === 'off' || !airborne) {
      fm.cyclicLon = clamp(-cmd.pitch * 0.85, -1, 1);
      // (Rotor model: a little left cyclic against the tail rotor's drift.)
      const drift = mode === 'off' || fm.powerModel === 'power' ? 0 : -0.2 * (fm.collective > 0.3 ? 1 : 0);
      fm.cyclicLat = clamp(cmd.roll * 0.85 + drift, -1, 1);
      fm.collective = cmd.lever;
      // On the skids with the assist on, heading hold keeps working while the
      // rotor carries torque (fading out as the lever comes down), so the
      // anti-torque pedal isn't dropped at touchdown or before lift-off.
      const w = mode === 'off' ? 0 : clamp((fm.collective - 0.12) / 0.2, 0, 1);
      if (w > 0) {
        if (this.holdHdg === null) this.holdHdg = fm.heading();
        fm.pedal = clamp(cmd.yaw * (1 - w) + this._yaw(fm, cmd, 0, att, h) * w, -1, 1);
      } else {
        fm.pedal = clamp(cmd.yaw, -1, 1);
        this.iYaw = -(fm.pedal - this._torqueFF(fm)); this.holdHdg = fm.heading();
      }
      // Hand the trims to the hold laws for a smooth lift-off.
      this.iLon = -fm.cyclicLon; this.iLat = fm.cyclicLat;
      this.holdPitch = att.pitch; this.holdAlt = fm.pos.y; this.iCol = cmd.lever;
      this.pT = att.pitch; this.bT = att.bank;
      this.pHeld = false; this.vsCmd = null; this.iHP = 0; this.iHR = 0; this.tP = 0; this.tB = 0;
      return;
    }
    const V = Math.hypot(fm.vel.x, fm.vel.z);
    // --- attitude targets ---------------------------------------------------
    const stickP = Math.abs(cmd.pitch) > 0.02, stickR = Math.abs(cmd.roll) > 0.02;
    let pitchT, bankT;
    const hdg = fm.heading();
    const fwd = { x: Math.sin(hdg), z: Math.cos(hdg) };
    const vf = fm.vel.x * fwd.x + fm.vel.z * fwd.z, vl = fm.vel.x * fwd.z - fm.vel.z * fwd.x;
    const high = mode === 'high' || mode === 'auto';
    const pm = fm.powerModel === 'power';
    const hover = high && !stickP && !stickR && V < 28;
    // Power model, low speed: the hover hold works per axis, so rolling
    // sideways does not hand the pitch to the speed hold (and the reverse).
    const hoverP = pm && high && !stickP && V < 28, hoverR = pm && high && !stickR && V < 28;
    if (pm && mode === 'high') {
      // Power model, the default assist (the handling asked for, after the
      // other game's helicopter): the keys tilt the helicopter for as long as
      // they are held — the tilt keeps growing (≈ 17°/s nose, 29°/s bank) up
      // to 45° nose down, 30° up and 50° of bank — so the speed builds with
      // the tilt and, the thrust acting along the rotor axis, with the power.
      // Let go and it levels out and glides on, slowing down by itself (the
      // rotor's damping in the model), with no braking flare. Nearly stopped
      // (below ~5 kt over the ground) a released axis holds the hover
      // against the wind with a gentle lean (≤ ~2.5°), so it ends up still.
      // (The target never runs more than ~7° ahead of the attitude, and on
      // release it levels from where the aircraft is, so nothing runs on.)
      const tilt = (t, a, held, c, rate, lo, hi, back, max) => {
        if (held) return clamp(t + c * rate * h, Math.max(lo, a - TILT.lead), Math.min(hi, a + TILT.lead));
        if (t * a > 0 && Math.abs(t) > Math.abs(a)) t = a;
        return t - clamp(t * back, -max, max) * h;
      };
      this.tP = tilt(this.tP, att.pitch, stickP, cmd.pitch, TILT.pitchRate, -TILT.down, TILT.up, 1.6, 0.35);
      this.tB = tilt(this.tB, att.bank, stickR, cmd.roll, TILT.bankRate, -TILT.bank, TILT.bank, 2, 0.6);
      const w = 1 - smoothstep(1.5, 3, V);
      this.iHP = !stickP && w > 0 ? clamp(this.iHP + vf * h * 0.01 * w, -0.035, 0.035) : 0;
      this.iHR = !stickR && w > 0 ? clamp(this.iHR + vl * h * 0.012 * w, -0.05, 0.05) : 0;
      pitchT = this.tP + (stickP ? 0 : w * clamp(vf * 0.02 + this.iHP, -0.045, 0.045));
      bankT = this.tB + (stickR ? 0 : w * clamp(vl * 0.03 + this.iHR, -0.07, 0.07));
      this.holdPitch = pitchT; this.pHeld = stickP; this.pRef = 0; this.vHold = null; this.iSpd = null;
    } else if (pm && (hoverP || hoverR) && !hover) {
      // ('auto', the test autopilot: hover hold per axis.)
      const k = V < 8 ? 1 : 0.6;
      if (hoverP) { pitchT = this.holdPitch = clamp(vf * 0.035 * k, -0.1, 0.12); this.vHold = null; this.iSpd = null; this.pHeld = false; }
      else {
        if (!this.pHeld) { this.pRef = 0; this.pHeld = true; }
        pitchT = clamp(cmd.pitch * 0.32, -0.45, 0.35);
      }
      bankT = hoverR ? clamp(vl * 0.05 * k, -0.18, 0.18) : cmd.roll * 0.48;
    } else if (hover) {
      // Hover hold: lean against the drift (gently at speed: decelerate).
      // Power model: a calm flare, never more than ~7° nose up (a released
      // stick must not throw the nose up), a little more lean sideways.
      const k = V < 8 ? 1 : 0.6;
      pitchT = this.holdPitch = pm ? clamp(vf * 0.035 * k, -0.1, 0.12) : clamp(vf * 0.05 * k, -0.12, 0.16);
      bankT = pm ? clamp(vl * 0.05 * k, -0.18, 0.18) : clamp(vl * 0.06 * k, -0.14, 0.14);
      this.pHeld = false; this.vHold = null; this.iSpd = null;
    } else {
      if (stickP) {
        // The stick commands an attitude. Beginner modes with the power
        // model: an absolute one (centred = level, full = ~18°), so the
        // response never depends on where the nose was when it was pressed.
        if (!this.pHeld) { this.pRef = pm && high ? 0 : this.holdPitch; this.pHeld = true; }
        pitchT = clamp(this.pRef + cmd.pitch * 0.32, -0.45, 0.35);
      } else {
        if (this.pHeld) { this.holdPitch = clamp(att.pitch, -0.45, 0.35); this.pHeld = false; this.vHold = Math.min(V, 50); this.iSpd = this.holdPitch; }
        if (high) {
          // Beginner: released at speed, hold that speed (not the attitude).
          this.vHold ??= Math.min(V, 50); this.iSpd ??= att.pitch;
          this.iSpd = clamp(this.iSpd + (vf - this.vHold) * h * 0.01, -0.3, 0.15);
          pitchT = this.holdPitch = clamp(this.iSpd + (vf - this.vHold) * 0.03, -0.3, 0.15);
        } else pitchT = this.holdPitch;
      }
      bankT = stickR ? cmd.roll * 0.48 : 0;
    }
    // Power model: the targets move at a limited rate (~45°/s pitch,
    // ~70°/s bank) instead of jumping, so the nose follows the stick
    // smoothly, without a lurch when it is pressed or released.
    if (pm) {
      this.pT ??= att.pitch; this.bT ??= att.bank;
      this.pT += clamp(pitchT - this.pT, -0.8 * h, 0.8 * h);
      this.bT += clamp(bankT - this.bT, -1.2 * h, 1.2 * h);
      pitchT = this.pT; bankT = this.bT;
    }
    // --- attitude loops -> cyclic ----------------------------------------------
    const ep = pitchT - att.pitch, eb = bankT - att.bank;
    if (pm) {
      // Power model: cascaded loops — the attitude error asks for a limited
      // pitch / roll rate, a fast rate loop sets the cyclic, and the
      // integrator only trims near the target (no wind-up). The nose goes
      // where the stick puts it, without running past it.
      const kA = 3, qMax = 0.8, kQ = 3.2, kI = 0.5;
      const qCmd = clamp(ep * kA, -qMax, qMax), pCmd = clamp(eb * kA * 1.2, -qMax * 1.4, qMax * 1.4);
      if (Math.abs(ep) < 0.1) this.iLon = clamp(this.iLon + ep * h * kI, -0.7, 0.7);
      if (Math.abs(eb) < 0.1) this.iLat = clamp(this.iLat + eb * h * kI, -0.8, 0.8);
      fm.cyclicLon = clamp(-(qCmd + fm.omega.x) * kQ - this.iLon, -1, 1);
      fm.cyclicLat = clamp((pCmd - fm.omega.z) * kQ * 0.8 + this.iLat, -1, 1);
    } else {
      this.iLon = clamp(this.iLon + ep * h * 0.9, -0.7, 0.7);
      this.iLat = clamp(this.iLat + eb * h * 0.9, -0.8, 0.8);
      fm.cyclicLon = clamp(-ep * 2.4 - fm.omega.x * 0.85 - this.iLon, -1, 1);
      fm.cyclicLat = clamp(eb * 2.8 - fm.omega.z * 0.85 + this.iLat, -1, 1);
    }
    fm.pedal = this._yaw(fm, cmd, V, att, h);
    // --- collective ------------------------------------------------------------
    if (mode === 'auto' || (mode === 'high' && fm.powerModel !== 'power')) {
      const leverRate = cmd.leverRate ?? 0; // -1..1 from the power keys
      if (Math.abs(leverRate) > 0.02 || this.holdAlt === null) this.holdAlt = fm.pos.y;
      let vsT = Math.abs(leverRate) > 0.02 ? leverRate * 2.5 : clamp((this.holdAlt - fm.pos.y) * 0.7, -2, 2);
      // Close to the ground the commanded descent eases off (≈ 0.35 m/s at
      // touchdown), so a held lever-down still lands gently.
      vsT = Math.max(vsT, -clamp(0.35 + fm.out.agl * 0.3, 0.35, 2.2));
      // The demand slews (no steps), then a quick velocity loop follows it.
      this.vsCmd ??= fm.vel.y;
      this.vsCmd += clamp(vsT - this.vsCmd, -5 * h, 5 * h);
      if (this.iCol === null) this.iCol = fm.collective;
      // Rotor-speed protection: the law never pulls the rotor below the
      // green (it gives up height instead).
      const droop = Math.max(0, 99.5 - fm.out.rotorPct);
      const ev = this.vsCmd - fm.vel.y;
      let dI = ev * h * 0.25, kP = ev * 0.11;
      if (droop > 0) { dI = Math.min(dI, 0) - droop * h * 0.05; kP = Math.min(kP, 0) - droop * 0.02; }
      this.iCol = clamp(this.iCol + dI, 0, 1);
      fm.collective = clamp(this.iCol + kP, 0, 1);
      cmd.leverOut = fm.collective; // the lever follows the law
    } else {
      // Normal: the lever is the pilot's, plus a landing cushion — the sink
      // rate the height can still arrest (≈ 2.5 m/s² of braking) is allowed,
      // beyond that collective is added (fading out as the descent eases).
      // (Softer with the power model, where the lever is the power itself.)
      const pm = fm.powerModel === 'power';
      const sink = -fm.vel.y, allow = (pm ? 0.55 : 1.2) + Math.sqrt((pm ? 3 : 5) * Math.max(0, o.agl - 0.5));
      this.cush = sink > allow ? Math.min(pm ? 0.2 : 0.65, this.cush + (sink - allow) * h * (pm ? 0.5 : 1.5)) : Math.max(0, this.cush - h * (pm ? 0.6 : 0.25));
      fm.collective = clamp(cmd.lever + this.cush, 0, 1);
      this.holdAlt = fm.pos.y; this.iCol = cmd.lever; this.vsCmd = null;
    }
  }

  // Yaw: rate command, heading hold / turn coordination -> pedal.
  _yaw(fm, cmd, V, att, h) {
    // heading() grows as the nose swings to +X (yaw left, +omega.y).
    const hdg = fm.heading();
    let rateT;
    if (Math.abs(cmd.yaw) > 0.02) {
      rateT = -cmd.yaw * 0.85; // right pedal: nose right
      this.holdHdg = hdg;
    } else if (V > 18) {
      rateT = clamp(-G * Math.tan(att.bank) / V, -0.5, 0.5); // coordinated turn
      this.holdHdg = hdg;
    } else {
      if (this.holdHdg === null) this.holdHdg = hdg;
      rateT = clamp(wrap(this.holdHdg - hdg) * 1.6, -0.6, 0.6);
    }
    const er = rateT - fm.omega.y;
    this.iYaw = clamp(this.iYaw + er * h * 1.2, -0.9, 0.9);
    return clamp(-er * 1.6 - this.iYaw + this._torqueFF(fm), -1, 1);
  }

  // Detailed rotor model: the anti-torque pedal the shaft torque needs, fed
  // forward (measured trim: pedal ≈ 0.6 − 0.00034·Q), so a collective change
  // does not first swing the nose and wait for the heading hold. The power
  // model has no torque to hold.
  _torqueFF(fm) {
    if (fm.powerModel === 'power' || !fm.shaftTorque) return 0;
    return clamp(0.6 - 0.00034 * fm.shaftTorque, -1, 1) * 0.85;
  }
}
