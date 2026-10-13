import { clamp } from '../utils/MathUtils.js';

// Control laws between the pilot's keys and the control surfaces.
//
// A keyboard can only say "full" or "nothing", which on a real aircraft means
// slamming the yoke to its stop. With assist on, the keys command rates instead
// (like a fly-by-wire stick): W/S ask for a pitch rate, A/D for a roll rate, and
// releasing them holds the current attitude. An angle-of-attack limiter keeps the
// wing below the stall and the rudder is coordinated automatically. The aircraft
// itself is still the full physical model underneath; assist "off" hands the
// surfaces straight to the pilot.
//
// Body rates (FlightModel axes): p = omega.z roll right, q = -omega.x pitch up,
// r = -omega.y yaw right.

const G = 9.81;

export class FlightAssist {
  constructor() {
    this.reset();
  }

  reset() {
    this.ei = 0; // pitch integrator (acts as automatic trim)
    this.holdPitch = null;
    this.holdBank = null;
    this.airborne = false;
  }

  /** Attitude helpers from the model's orientation. */
  static attitude(fm, out = {}) {
    const q = fm.quat;
    // forward = q·(0,0,1), right = q·(-1,0,0)
    const fx = 2 * (q.x * q.z + q.w * q.y), fy = 2 * (q.y * q.z - q.w * q.x);
    const rx = -(1 - 2 * (q.y * q.y + q.z * q.z)), ry = -2 * (q.x * q.y + q.w * q.z);
    void fx; void rx;
    out.pitch = Math.asin(clamp(fy, -1, 1));
    out.bank = Math.asin(clamp(-ry, -1, 1));
    return out;
  }

  /**
   * cmd: { pitch, roll, yaw } in -1..1 (pitch + = pull / nose up, roll + = right, yaw + = right)
   * mode: 'off' | 'normal' | 'high'
   */
  update(fm, cmd, mode, dt) {
    const o = fm.out;
    const airborne = !o.onWater && !o.onGround && o.agl > 0.8;
    const att = FlightAssist.attitude(fm, this._att || (this._att = {}));
    if (!airborne || mode === 'off') {
      // direct control: keys move the surfaces (softened on the water so the take-off rotation is gentle)
      const lim = 1;
      fm.elevator = clamp(cmd.pitch * lim, -1, 1);
      fm.aileron = clamp(cmd.roll, -1, 1);
      fm.rudder = clamp(cmd.yaw + (airborne && mode !== 'off' ? o.beta * 3.2 + fm.omega.y * 0.6 : 0), -1, 1);
      this.ei = fm.elevator;
      this.holdPitch = null;
      this.holdBank = null;
      this.airborne = airborne;
      return;
    }
    if (!this.airborne) {
      // just left the water: start from where the pilot had the yoke
      this.ei = fm.elevator;
      this.holdPitch = null;
      this.holdBank = 0;
      this.airborne = true;
    }
    const V = Math.max(o.airspeed, 12);
    const auth = clamp(V / 32, 0.45, 1);
    const qbar = 0.5 * 1.225 * V * V;
    const qTail = qbar + 0.3 * o.thrust / 5.3;
    const pitch = att.pitch, bank = att.bank;
    const high = mode === 'high';

    // ---------------------------------------------------------------- pitch
    let qCmd;
    if (Math.abs(cmd.pitch) > 0.05) {
      qCmd = cmd.pitch * 0.24 * auth;
      this.holdPitch = null;
    } else {
      const qNow = -fm.omega.x;
      const pLim = high ? 0.17 : 0.26;
      if (this.holdPitch === null && Math.abs(qNow) < 0.08) this.holdPitch = clamp(pitch, -pLim, pLim);
      // hands off and getting slow: let the nose down to keep flying speed
      const vMin = 36 - fm.flaps * 6;
      if (this.holdPitch !== null && V < vMin) this.holdPitch = Math.max(-0.08, this.holdPitch - (vMin - V) * 0.012 * dt);
      qCmd = this.holdPitch === null ? 0 : clamp((this.holdPitch - pitch) * 1.2, -0.12, 0.12);
    }
    // a level, coordinated turn needs the nose to keep coming round
    const cb = Math.max(0.35, Math.cos(bank));
    qCmd += (G / V) * Math.sin(bank) * Math.tan(clamp(bank, -1.15, 1.15)) * (cb > 0.36 ? 1 : 0);
    // keep the wing flying: angle-of-attack limits
    const aMax = 0.27 - fm.flaps * 0.035 - (high ? 0.07 : 0.035);
    if (o.alpha > aMax) qCmd = Math.min(qCmd, -(o.alpha - aMax) * 5);
    if (o.alpha < -0.12) qCmd = Math.max(qCmd, (-0.12 - o.alpha) * 5);
    if (high) {
      if (pitch > 0.45) qCmd = Math.min(qCmd, -(pitch - 0.45) * 2);
      if (pitch < -0.45) qCmd = Math.max(qCmd, (-0.45 - pitch) * 2);
    }
    const sched = clamp(1800 / qTail, 0.35, 2.5);
    const q = -fm.omega.x;
    const err = qCmd - q;
    this.ei = clamp(this.ei + err * 2.4 * sched * dt, -1, 1);
    fm.elevator = clamp(this.ei + err * 1.8 * sched, -1, 1);

    // ---------------------------------------------------------------- roll
    let pCmd;
    if (Math.abs(cmd.roll) > 0.05) {
      pCmd = cmd.roll * 0.9 * auth;
      this.holdBank = null;
    } else {
      // released: roll level from a shallow bank, otherwise settle into a sustainable 30° turn
      if (this.holdBank === null) this.holdBank = (high || Math.abs(bank) < 0.12) ? 0 : clamp(bank, -0.52, 0.52);
      pCmd = clamp((this.holdBank - bank) * 1.6, -0.5, 0.5);
    }
    const bankLim = high ? 0.8 : 1.15;
    if (bank > bankLim) pCmd = Math.min(pCmd, -(bank - bankLim) * 2.5);
    if (bank < -bankLim) pCmd = Math.max(pCmd, (-bankLim - bank) * 2.5);
    const p = fm.omega.z;
    const rs = clamp(1500 / qbar, 0.35, 2.5);
    fm.aileron = clamp((pCmd * 0.85 + (pCmd - p) * 1.3) * rs, -1, 1);

    // ---------------------------------------------------------------- yaw: turn coordinator + yaw damper
    // sideslip from the right (beta > 0) needs right rudder; the damper opposes the yaw rate
    fm.rudder = clamp(cmd.yaw + o.beta * 3.2 + fm.omega.y * 0.6, -1, 1);
  }
}
