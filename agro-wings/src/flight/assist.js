// Flight assist — built on the Tidemark control law, retuned for agricultural
// flying (pull-ups, steep "balão" reversals at the end of each pass).
// 'off': raw surfaces. 'normal': rate command with expo, attitude/bank hold
// when the stick is centred, turn coordination limited to the load factor the
// wing can actually give, stall and g protection — but no bank limit below
// 80°, so a real wingover is possible. 'high': beginner limits (bank kept to
// what can be held level, gentler rates).
// On the ground the stick drives the surfaces directly (taxi feel unchanged).
import { clamp } from '../core/math.js';
import { FlightModel } from './flightModel.js';
import { FLIGHT } from '../config.js';

const G = 9.81;

export class Assist {
  constructor() { this.reset(); this._att = {}; }

  reset() {
    this.ei = 0;
    this.aPrev = undefined;
    this.aDot = 0;
    this.holdPitch = null;
    this.holdBank = null;
    this.airborne = false;
  }

  update(fm, cmd, mode, dt) {
    const a = fm.out;
    const A = FLIGHT;
    const flying = !a.onGround && a.agl > 0.8;
    const att = FlightModel.attitude(fm, this._att);
    if (!flying || mode === 'off') {
      fm.elevator = clamp(cmd.pitch, -1, 1);
      fm.aileron = clamp(cmd.roll, -1, 1);
      // On the ground the assist adds a light yaw damper against ground loops.
      const damper = mode === 'off' ? 0 : flying ? a.beta * 3.2 + fm.omega.y * 0.6 : a.onGround ? fm.omega.y * (mode === 'high' ? 1.6 : 0.9) : 0;
      fm.rudder = clamp(cmd.yaw + damper, -1, 1);
      this.ei = fm.elevator;
      this.holdPitch = null;
      this.holdBank = null;
      this.airborne = flying;
      return;
    }
    if (!this.airborne) {
      this.ei = fm.elevator;
      this.holdPitch = null;
      this.holdBank = 0;
      this.airborne = true;
    }
    const v = Math.max(a.airspeed, 12);
    const auth = clamp(v / 32, 0.45, 1);
    const qd = 0.6125 * v * v;
    const qTail = qd + (0.3 * a.thrust) / 5.3;
    const pitch = att.pitch, bank = att.bank;
    const high = mode === 'high';

    // Load factor the wing can give right now at the protected angle of attack.
    const aProt = A.alphaStall - fm.flaps * 0.035 - (high ? 0.06 : 0.025);
    const clProt = A.CL0 + A.CLa * aProt + A.CLflap * fm.flaps;
    const nAvail = clamp((clProt * qd * A.wingArea) / (fm.mass * G), 0.3, 6);
    const nLimit = high ? 3.0 : 3.8; // normal-category structural limit

    // Pitch. Stick: rate command with expo (fine near centre, full authority
    // for the pull-up). Centred: flight-path hold — the assist asks for the
    // load factor that keeps the climb/descent angle in any bank,
    // n = cos γ / cos φ, never more than the wing can give (then the nose
    // falls and the aircraft descends: the real energy trade of a steep turn).
    const vel = fm.vel;
    const gamma = Math.asin(clamp(vel.y / Math.max(1, vel.length()), -1, 1));
    const cphi = Math.cos(bank);
    const nAuto = Math.min(nAvail * (Math.abs(cmd.pitch) > 0.05 ? 1 : 0.88), nLimit);
    const nCoord = cphi > 0.02 ? Math.min(Math.cos(gamma) / cphi, nAuto) : 0;
    let qCmd;
    const sp = cmd.pitch;
    if (Math.abs(sp) > 0.05) {
      qCmd = (high ? 0.24 * sp + 0.06 * sp ** 3 : 0.24 * sp + 0.22 * sp ** 3) * auth;
      this.holdPitch = null;
      // Keep the turn coordinated underneath the pilot's own pull or push.
      if (cphi > 0.02) qCmd += (G / v) * Math.max(0, nCoord - Math.cos(gamma) * cphi);
    } else {
      const lim = high ? [-0.1, 0.26] : [-0.15, 0.45];
      // Capture the flight path the moment the stick is released (the path
      // lags the nose, so there is no pull-up overshoot to catch).
      if (this.holdPitch === null) this.holdPitch = clamp(gamma, lim[0], lim[1]);
      if (this.holdPitch !== null) {
        // Dives level off on their own; slow climbs give the speed back.
        if (this.holdPitch < -0.03) this.holdPitch = Math.min(-0.03, this.holdPitch + 0.06 * dt);
        if (a.agl < 25 && this.holdPitch < -0.02) this.holdPitch = Math.min(-0.02, this.holdPitch + 0.25 * dt);
        const minV = 36 - fm.flaps * 6;
        if (v < minV) this.holdPitch = Math.max(-0.08, this.holdPitch - (minV - v) * 0.012 * dt);
        // Speed stability: a held climb flattens as the speed bleeds off (a
        // released pull-up tops out instead of climbing on and on).
        const gMax = clamp(((v - 30) / 16) * 0.45, 0.04, lim[1]);
        if (this.holdPitch > gMax) this.holdPitch = Math.max(gMax, this.holdPitch - 0.25 * dt);
      }
      const gH = this.holdPitch ?? gamma;
      const nCmd = cphi > 0.02 ? clamp(Math.cos(gamma) / cphi + (gH - gamma) * 7, 0, nAuto) : 0;
      qCmd = (G / v) * (nCmd - Math.cos(gamma) * cphi);
    }
    // Stall / negative-alpha / load protection.
    // Anticipating on the alpha trend (a sharp pull is caught before the
    // stall; a steady steep turn can still use the whole protected lift).
    const aDot = this.aPrev === undefined ? 0 : (a.alpha - this.aPrev) / Math.max(dt, 1e-3);
    this.aPrev = a.alpha;
    this.aDot = (this.aDot ?? 0) + (aDot - (this.aDot ?? 0)) * Math.min(1, dt * 12);
    const aPred = a.alpha + Math.max(0, this.aDot) * 0.3;
    // α̇ = q − γ̇: at low speed gravity bends the path down faster than the
    // nose falls, so the limit is relative to the path's own rotation rate.
    const gamDot = (G / v) * (a.gLoad - Math.cos(gamma) * cphi);
    if (aPred > aProt) qCmd = Math.min(qCmd, Math.min(0, gamDot) - (aPred - aProt) * 5);
    if (a.alpha < -0.12) qCmd = Math.max(qCmd, (-0.12 - a.alpha) * 5);
    if (a.gLoad > nLimit) qCmd = Math.min(qCmd, -(a.gLoad - nLimit) * 0.6);
    if (a.gLoad < -1) qCmd = Math.max(qCmd, (-1 - a.gLoad) * 0.6);
    if (high) {
      if (pitch > 0.45) qCmd = Math.min(qCmd, -(pitch - 0.45) * 2);
      if (pitch < -0.45) qCmd = Math.max(qCmd, (-0.45 - pitch) * 2);
    }
    const gain = clamp(1800 / qTail, 0.35, 2.5);
    const qRate = -fm.omega.x;
    const err = qCmd - qRate;
    this.ei = clamp(this.ei + err * 2.4 * gain * dt, -1, 1);
    fm.elevator = clamp(this.ei + err * 1.8 * gain, -1, 1);

    // Roll: rate command with expo, bank hold when centred, bank limit.
    let pCmd;
    const sr = cmd.roll;
    // Bank the wing can hold without sinking at this speed and weight with the
    // stick centred. While the pilot holds the roll stick there is no limit
    // below 80°. Released: a climbing aircraft (top of a balão) keeps up to
    // 75°; a level or descending one settles at the bank it can sustain, so a
    // steep turn at spray height does not quietly sink into the crop.
    const bSust = Math.acos(1 / Math.max(1.02, nAuto * 0.92));
    const bLim = high ? Math.min(1.05, Math.max(0.35, bSust)) : 1.4;
    let bHold = high ? bLim : gamma > 0.06 ? 1.3 : clamp(bSust, 0.52, 1.3);
    // Falling below the held flight path: shallow the bank to recover it.
    const gTarget = this.holdPitch ?? gamma;
    if (Math.abs(cmd.pitch) <= 0.05 && gamma < gTarget - 0.03) bHold = Math.max(0.35, bHold - (gTarget - 0.03 - gamma) * 4);
    if (Math.abs(sr) > 0.05) {
      pCmd = (high ? 0.75 * sr + 0.15 * sr ** 3 : 0.9 * sr + 0.4 * sr ** 3) * auth;
      this.holdBank = null;
    } else {
      if (this.holdBank === null) this.holdBank = Math.abs(bank) < (high ? 0.15 : 0.1) ? 0 : clamp(bank, -1.3, 1.3);
      // The allowed hold follows the energy state (speed, climb) as it changes.
      const hb = clamp(this.holdBank, -bHold, bHold);
      pCmd = clamp((hb - bank) * 1.6, -0.45, 0.45);
    }
    if (bank > bLim) pCmd = Math.min(pCmd, -(bank - bLim) * 2.5);
    if (bank < -bLim) pCmd = Math.max(pCmd, (-bLim - bank) * 2.5);
    const pRate = fm.omega.z;
    const rg = clamp(1500 / qd, 0.35, 2.5);
    fm.aileron = clamp((pCmd * 0.85 + (pCmd - pRate) * 1.3) * rg, -1, 1);
    fm.rudder = clamp(cmd.yaw + a.beta * 3.2 + fm.omega.y * 0.6, -1, 1);
    this.nAvail = nAvail;
  }
}
