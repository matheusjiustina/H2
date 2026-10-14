// Flight assist — direct port of the Tidemark control law.
// 'off': raw surfaces. 'normal': attitude hold when the stick is centred,
// turn coordination, bank limit and stall protection. 'high': tighter limits.
// On the ground the stick drives the surfaces directly (taxi feel unchanged).
import { clamp } from '../core/math.js';
import { FlightModel } from './flightModel.js';

const G = 9.81;

export class Assist {
  constructor() { this.reset(); this._att = {}; }

  reset() {
    this.ei = 0;
    this.holdPitch = null;
    this.holdBank = null;
    this.airborne = false;
  }

  update(fm, cmd, mode, dt) {
    const a = fm.out;
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

    // Pitch: rate command while the stick is moved, attitude hold when centred.
    let qCmd;
    if (Math.abs(cmd.pitch) > 0.05) {
      qCmd = cmd.pitch * 0.24 * auth;
      this.holdPitch = null;
    } else {
      const rate = -fm.omega.x;
      const lim = high ? 0.17 : 0.26;
      if (this.holdPitch === null && Math.abs(rate) < 0.08) this.holdPitch = clamp(pitch, -lim, lim);
      const minV = 36 - fm.flaps * 6;
      if (this.holdPitch !== null && v < minV) this.holdPitch = Math.max(-0.08, this.holdPitch - (minV - v) * 0.012 * dt);
      qCmd = this.holdPitch === null ? 0 : clamp((this.holdPitch - pitch) * 1.2, -0.12, 0.12);
    }
    // Keep the nose up through a banked turn.
    const cb = Math.max(0.35, Math.cos(bank));
    qCmd += (G / v) * Math.sin(bank) * Math.tan(clamp(bank, -1.15, 1.15)) * +(cb > 0.36);
    // Stall / negative-alpha protection.
    const aLim = 0.27 - fm.flaps * 0.035 - (high ? 0.07 : 0.035);
    if (a.alpha > aLim) qCmd = Math.min(qCmd, -(a.alpha - aLim) * 5);
    if (a.alpha < -0.12) qCmd = Math.max(qCmd, (-0.12 - a.alpha) * 5);
    if (high) {
      if (pitch > 0.45) qCmd = Math.min(qCmd, -(pitch - 0.45) * 2);
      if (pitch < -0.45) qCmd = Math.max(qCmd, (-0.45 - pitch) * 2);
    }
    const gain = clamp(1800 / qTail, 0.35, 2.5);
    const qRate = -fm.omega.x;
    const err = qCmd - qRate;
    this.ei = clamp(this.ei + err * 2.4 * gain * dt, -1, 1);
    fm.elevator = clamp(this.ei + err * 1.8 * gain, -1, 1);

    // Roll: rate command, bank hold when centred, bank limit.
    let pCmd;
    if (Math.abs(cmd.roll) > 0.05) {
      pCmd = cmd.roll * 0.9 * auth;
      this.holdBank = null;
    } else {
      if (this.holdBank === null) this.holdBank = high || Math.abs(bank) < 0.12 ? 0 : clamp(bank, -0.52, 0.52);
      pCmd = clamp((this.holdBank - bank) * 1.6, -0.5, 0.5);
    }
    const bLim = high ? 0.8 : 1.15;
    if (bank > bLim) pCmd = Math.min(pCmd, -(bank - bLim) * 2.5);
    if (bank < -bLim) pCmd = Math.max(pCmd, (-bLim - bank) * 2.5);
    const pRate = fm.omega.z;
    const rg = clamp(1500 / qd, 0.35, 2.5);
    fm.aileron = clamp((pCmd * 0.85 + (pCmd - pRate) * 1.3) * rg, -1, 1);
    fm.rudder = clamp(cmd.yaw + a.beta * 3.2 + fm.omega.y * 0.6, -1, 1);
  }
}
