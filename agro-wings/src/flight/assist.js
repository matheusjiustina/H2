// Flight control laws of the test autopilot (game/autopilot.js flies through
// them; the player flies 'off', with the light aids of pilotAid.js when
// Assistance is on) — built on the Tidemark control law, retuned for agricultural
// flying (pull-ups, steep "balão" reversals at the end of each pass).
// 'off': raw surfaces. 'normal': rate command with expo, attitude/bank hold
// when the stick is centred, turn coordination limited to the load factor the
// wing can actually give, stall and g protection — but no bank limit below
// 80°, so a real wingover is possible. 'high': beginner limits (bank kept to
// what can be held level, gentler rates).
// On the ground the stick drives the surfaces directly (taxi feel unchanged).
import { clamp } from '../core/math.js';
import { FlightModel } from './flightModel.js';

const G = 9.81;
const TRIM_RATE = 0.05; // rad/s of held flight path per trim key

export class Assist {
  constructor() { this.reset(); this._att = {}; }

  reset() {
    this.ei = 0;
    this.aPrev = undefined;
    this.aDot = 0;
    this.holdPitch = null;
    this.holdBank = null;
    this.airborne = false;
    this.trimmed = false;
    this.gamDot = 0;
  }

  update(fm, cmd, mode, dt) {
    const a = fm.out;
    const A = fm.A;
    // Per-type scaling: control power per unit inertia (gain) and the speed
    // scale of the airframe (stall speed relative to the PR-AGW).
    const kp = A.assistGain?.pitch ?? 1, kr = A.assistGain?.roll ?? 1, vk = A.assistSpeedScale ?? 1;
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
      this.trimmed = false;
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
    const auth = clamp(v / (32 * vk), 0.45, 1);
    const qd = 0.6125 * v * v;
    const qTail = qd + (0.3 * a.thrust) / (5.3 * (A.propRadius / 1.1) ** 2);
    const pitch = att.pitch, bank = att.bank;
    const high = mode === 'high';

    // Load factor the wing can give right now at the protected angle of attack.
    const aProt = A.alphaStall - fm.flaps * 0.035 - (high ? 0.06 : 0.03);
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
    // Rolling into a turn, the pull leads the bank (~0.3 s of roll rate), as a
    // pilot's hand does: waiting for the bank first let a low steep turn sink
    // several metres before the g came (enough to put a wingtip in the crop).
    const bankL = bank + clamp(fm.omega.z, -1.2, 1.2) * 0.3;
    const cphiL = Math.abs(bankL) > Math.abs(bank) ? Math.max(Math.cos(clamp(bankL, -1.45, 1.45)), 0.12) : cphi;
    const nCoord = cphi > 0.02 ? Math.min(Math.cos(gamma) / cphiL, nAuto) : 0;
    let qCmd;
    const sp = cmd.pitch;
    // Rotation rate of the flight path itself (positive in a pull), lightly
    // filtered (the load factor jitters step to step).
    this.gamDot += ((G / v) * (a.gLoad - Math.cos(gamma) * cphi) - this.gamDot) * Math.min(1, dt * 20);
    const gamDot = this.gamDot;
    if (Math.abs(sp) > 0.05) {
      // (~19°/s at full stick, ~26°/s before: holding the key for 2 s from
      // level flight put the nose 37° up and the stall horn on.)
      // Pulling out of a dive the full rate (~26°/s) is there.
      const wDive = clamp((-gamma - 0.02) / 0.08, 0, 1);
      const qSoft = high ? 0.2 * sp + 0.06 * sp ** 3 : 0.19 * sp + 0.15 * sp ** 3;
      const qHard = high ? 0.24 * sp + 0.06 * sp ** 3 : 0.24 * sp + 0.22 * sp ** 3;
      qCmd = (sp > 0 ? qSoft + (qHard - qSoft) * wDive : qHard) * auth;
      this.holdPitch = null;
      this.trimmed = false;
      // Keep the turn coordinated underneath the pilot's own pull or push.
      if (cphi > 0.02) qCmd += (G / v) * Math.max(0, nCoord - Math.cos(gamma) * cphi);
      // A hard pull (pull-out from the balão): the nose also follows the
      // path's own rotation, so the angle of attack — and the g — keeps
      // building up to the protected limit instead of the path catching up
      // with a fixed pitch rate (before, a full pull at 100 kt took over a
      // second to reach ~3 g and the height went meanwhile).
      // Only while descending (a pull-out): from level or climbing flight
      // the same key raises the nose progressively instead of going straight
      // to the stall warning.
      if (sp > 0.5 && wDive > 0) qCmd += Math.max(0, gamDot) * Math.min(1, (sp - 0.5) / 0.4) * wDive * (high ? 0.6 : 1);
    } else {
      const lim = high ? [-0.1, 0.26] : [-0.15, 0.45];
      // Capture the flight path the moment the stick is released (the path
      // lags the nose, so there is no pull-up overshoot to catch).
      if (this.holdPitch === null) this.holdPitch = clamp(gamma, lim[0], lim[1]);
      // Trim moves the held flight path (~3°/s), as a fly-by-wire trim does:
      // an elevator offset alone would just be cancelled by the hold loop.
      if (cmd.trim) {
        this.holdPitch = clamp(this.holdPitch + cmd.trim * TRIM_RATE * dt, lim[0], lim[1]);
        this.trimmed = true;
      }
      if (this.holdPitch !== null) {
        // Dives level off on their own (not a descent the pilot trimmed for);
        // slow climbs give the speed back.
        if (this.holdPitch < -0.03 && !this.trimmed) this.holdPitch = Math.min(-0.03, this.holdPitch + 0.06 * dt);
        if (a.agl < 25 && this.holdPitch < -0.02) this.holdPitch = Math.min(-0.02, this.holdPitch + 0.25 * dt);
        const minV = (36 - fm.flaps * 6) * vk;
        if (v < minV) this.holdPitch = Math.max(-0.08, this.holdPitch - (minV - v) * 0.012 * dt);
        // Speed stability: a held climb flattens as the speed bleeds off (a
        // released pull-up tops out instead of climbing on and on).
        const gMax = clamp(((v - 30 * vk) / (16 * vk)) * 0.45, 0.04, lim[1]);
        if (this.holdPitch > gMax) this.holdPitch = Math.max(gMax, this.holdPitch - 0.25 * dt);
      }
      const gH = this.holdPitch ?? gamma;
      // (Below the held path in a bank: a firmer correction, so a steep turn
      // does not settle into a slow sink.)
      const kPath = gamma < gH && cphi < 0.85 ? 11 : 7;
      const nCmd = cphi > 0.02 ? clamp(Math.cos(gamma) / cphiL + (gH - gamma) * kPath, 0, nAuto) : 0;
      qCmd = (G / v) * (nCmd - Math.cos(gamma) * cphi);
      // The angle of attack has to build before the path turns: a g error
      // adds pitch rate, so the load the turn needs arrives within ~0.5 s
      // (a rate command alone left it a second behind in a steep turn).
      qCmd += clamp(nCmd - a.gLoad, -0.8, 1.2) * 0.22;
    }
    // Stall / negative-alpha / load protection.
    // Anticipating on the alpha trend (a sharp pull is caught before the
    // stall; a steady steep turn can still use the whole protected lift).
    const aDot = this.aPrev === undefined ? 0 : (a.alpha - this.aPrev) / Math.max(dt, 1e-3);
    this.aPrev = a.alpha;
    this.aDot = (this.aDot ?? 0) + (aDot - (this.aDot ?? 0)) * Math.min(1, dt * 12);
    const aPred = a.alpha + Math.max(0, this.aDot) * 0.12;
    // α̇ = q − γ̇: the limit is relative to the path's own rotation rate —
    // at low speed gravity bends the path down faster than the nose falls,
    // and in a pull-out the nose may keep rotating with the path, holding
    // the angle of attack at the limit (before, the nose was stopped there:
    // the alpha fell off, the elevator chattered and the pull lost g).
    // The ceiling closes in continuously as the margin shrinks (a switch at
    // the limit made the elevator chatter between full up and half down).
    qCmd = Math.min(qCmd, gamDot + (aProt - aPred) * 8);
    if (a.alpha < -0.12) qCmd = Math.max(qCmd, (-0.12 - a.alpha) * 5);
    // g limit, also closing in continuously (at the limit the nose turns
    // with the path, holding the g).
    qCmd = Math.min(qCmd, gamDot + (nLimit - a.gLoad) * (G / v) * 2);
    if (a.gLoad < -1) qCmd = Math.max(qCmd, (-1 - a.gLoad) * 0.6);
    if (high) {
      if (pitch > 0.45) qCmd = Math.min(qCmd, -(pitch - 0.45) * 2);
      if (pitch < -0.45) qCmd = Math.max(qCmd, (-0.45 - pitch) * 2);
    }
    // Rate tracking. Feed-forward of the elevator that cancels the pitch
    // damping at the commanded rate (what a pilot's hand does at once), so the
    // nose comes up within ~0.4 s instead of waiting on the integrator; the
    // PI loop only trims the rest. Without it a full pull only reached ~75 %
    // of the commanded rate and the g built over more than a second.
    const gain = clamp(1800 / qTail, 0.35, 2.5) * kp;
    const qRate = -fm.omega.x;
    const err = qCmd - qRate;
    const ff = (-A.Cmq * (qCmd * A.chord) / (2 * Math.max(a.airspeed, 8))) / A.Cmde;
    this.ei = clamp(this.ei + err * 5 * gain * dt, -1, 1);
    fm.elevator = clamp(this.ei + ff + err * 2.4 * gain, -1, 1);

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
    const rg = clamp(1500 / qd, 0.35, 2.5) * kr;
    fm.aileron = clamp((pCmd * 0.85 + (pCmd - pRate) * 1.3) * rg, -1, 1);
    fm.rudder = clamp(cmd.yaw + a.beta * 3.2 + fm.omega.y * 0.6, -1, 1);
    this.nAvail = nAvail;
  }
}
