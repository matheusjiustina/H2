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
//  'high'   — beginner: as normal, plus a centred stick below ~55 kt brings
//             the aircraft back to a hover over the ground (above that it
//             holds speed). With the detailed rotor model the lever also
//             commands climb/descent rate and holds height when released
//             (without drooping the rotor); with the power model the lever
//             stays the pilot's power (only power moves the aircraft up and
//             down), with the landing cushion of 'normal'.
//  'auto'   — the test autopilot's mode: 'high' with the climb-rate lever law
//             in both models.
// Nothing here changes the physics; it only moves the controls.
import { clamp } from '../core/math.js';
import { FlightModel } from './flightModel.js';

const G = 9.81;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class HeliAssist {
  constructor() { this.reset(); this._att = {}; }

  reset() {
    this.iLon = 0; this.iLat = null; this.iYaw = 0; this.iCol = null;
    this.holdPitch = 0; this.holdHdg = null; this.holdAlt = null;
    this.pHeld = false; this.pRef = 0; this.vHold = null; this.iSpd = null; this.vsCmd = null; this.cush = 0;
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
        this.iYaw = -fm.pedal; this.holdHdg = fm.heading();
      }
      // Hand the trims to the hold laws for a smooth lift-off.
      this.iLon = -fm.cyclicLon; this.iLat = fm.cyclicLat;
      this.holdPitch = att.pitch; this.holdAlt = fm.pos.y; this.iCol = cmd.lever;
      this.pHeld = false; this.vsCmd = null;
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
    const hover = high && !stickP && !stickR && V < 28;
    if (hover) {
      // Hover hold: lean against the drift (gently at speed: decelerate).
      // The power model leans further (to ~13°), so a released stick stops
      // a fast sideways or backward drift within about six seconds.
      const k = V < 8 ? 1 : 0.6, lim = fm.powerModel === 'power' ? 0.23 : 0.14;
      pitchT = this.holdPitch = clamp(vf * 0.05 * k, -0.12, fm.powerModel === 'power' ? 0.23 : 0.16);
      bankT = clamp(vl * 0.06 * k, -lim, lim);
      this.pHeld = false; this.vHold = null; this.iSpd = null;
    } else {
      if (stickP) {
        if (!this.pHeld) { this.pRef = this.holdPitch; this.pHeld = true; }
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
    // --- attitude loops -> cyclic ----------------------------------------------
    const ep = pitchT - att.pitch, eb = bankT - att.bank;
    this.iLon = clamp(this.iLon + ep * h * 0.9, -0.7, 0.7);
    this.iLat = clamp(this.iLat + eb * h * 0.9, -0.8, 0.8);
    fm.cyclicLon = clamp(-ep * 2.4 - fm.omega.x * 0.85 - this.iLon, -1, 1);
    fm.cyclicLat = clamp(eb * 2.8 - fm.omega.z * 0.85 + this.iLat, -1, 1);
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
    return clamp(-er * 1.6 - this.iYaw, -1, 1);
  }
}
