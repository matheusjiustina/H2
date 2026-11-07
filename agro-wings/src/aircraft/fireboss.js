// Fire Boss water systems (AT-802AF on Wipline amphibious floats):
//   * hydraulic gear in the floats (down for land, up for water);
//   * two scoop probes behind the step that fill the tank while planing;
//   * the drop door under the hopper (full or partial drops).
// WaterSystem is pure logic on the flight model (mass, forces, flows) so it
// runs headless in the tests; the visuals (spray, wake, the falling water)
// are in FireBossFx and the fires it puts out in world/fires.js.
//
// Rules of the game (calibrated for play — not an operating procedure):
//   - the probes fill only on the water, gear up, wings level, between
//     scoopMin and scoopMax, and never past what the scooping weight limit
//     (7,257 kg) leaves after fuel, pilot and airframe;
//   - water flowing in costs its momentum (ṁ·v drag) — the aircraft must be
//     flown through the scoop with power;
//   - from rest on the water the hulls only get onto the step up to the
//     5,216 kg water take-off weight: above it the overloaded floats plough;
//   - the door releases water progressively; the mass and the CG moment of
//     the hopper follow the litres actually released.
import { Vector3 } from 'three';
import { clamp, approach } from '../core/math.js';

const G = 9.81;
const _f = new Vector3(), _v = new Vector3(), _d = new Vector3();

export class WaterSystem {
  constructor(fm) {
    this.fm = fm;
    this.F = fm.A.firefight;
    this.probesCmd = false;
    this.probes = 0; // 0 up … 1 down
    this.dropping = false;
    this.door = 0; // 0 shut … 1 open
    this.scooping = false;
    this.flowIn = 0; this.flowOut = 0; // L/s
    this.scooped = 0; this.released = 0; // L, totals
    this.overload = false;
    this.packets = []; // released water this step: { litres, x, y, z, vx, vy, vz }
    this.msgs = [];
    this._force = new Vector3();
  }

  // Litres the scooping weight limit allows in the tank now.
  scoopLimit() {
    const fm = this.fm, A = fm.A;
    const dry = fm.mass - fm.hopper * A.liquidDensity;
    return clamp((A.mtowScoop - dry) / A.liquidDensity, 0, this.F.capacity);
  }

  toggleGear() {
    const fm = this.fm;
    // Squat switch: no retraction with weight on the wheels.
    if (fm.gearCmd && fm.out.wheelsOnGround > 0) { this.msgs.push('gearWeight'); return false; }
    fm.gearCmd = !fm.gearCmd;
    this.msgs.push(fm.gearCmd ? 'gearDown' : 'gearUp');
    return true;
  }
  toggleProbes() {
    this.probesCmd = !this.probesCmd;
    this.msgs.push(this.probesCmd ? 'probesDown' : 'probesUp');
  }
  toggleDrop() {
    if (!this.dropping && this.fm.hopper < 1) { this.msgs.push('empty'); return; }
    this.dropping = !this.dropping;
    this.msgs.push(this.dropping ? 'dropOpen' : 'dropClose');
  }

  step(dt, dropWorld = null) {
    const fm = this.fm, o = fm.out, A = fm.A, F = this.F;
    this.packets.length = 0;
    this.probes = approach(this.probes, this.probesCmd ? 1 : 0, 1.6, dt);
    this.door = approach(this.door, this.dropping ? 1 : 0, 5, dt);
    const f = this._force.set(0, 0, 0);
    // Scooping.
    const bank = Math.abs(Math.asin(clamp(_v.set(1, 0, 0).applyQuaternion(fm.quat).y, -1, 1)));
    const spd = o.waterSpeed;
    const ok = this.probes > 0.6 && o.onWater && fm.gearDown < 0.02 && spd >= F.scoopMin && spd <= F.scoopMax && bank < F.scoopBank;
    const room = Math.max(0, this.scoopLimit() - fm.hopper);
    this.flowIn = ok && room > 0 ? Math.min(F.scoopRate * this.probes, room / dt) : 0;
    this.scooping = this.flowIn > 0;
    if (this.scooping) {
      const L = this.flowIn * dt;
      fm.hopper += L;
      this.scooped += L;
      // Momentum drag of the water taken aboard (kg/s × m/s), against the
      // velocity over the water.
      _d.set(fm.vel.x, 0, fm.vel.z);
      if (_d.lengthSq() > 1e-4) f.addScaledVector(_d.normalize(), -this.flowIn * A.liquidDensity * spd);
    } else if (this.probes > 0.3 && o.onWater && spd > 3) {
      // Probes down without filling (too slow / full): their own drag.
      _d.set(fm.vel.x, 0, fm.vel.z);
      if (_d.lengthSq() > 1e-4) f.addScaledVector(_d.normalize(), -this.probes * 160 * spd);
    }
    // Overloaded floats from rest: they plough instead of planing.
    this.overload = o.onWater && fm.mass > A.mtowWater + 1 && spd < F.scoopMin * 0.85 && !this.scooping;
    if (this.overload && spd > 1.5) {
      _d.set(fm.vel.x, 0, fm.vel.z).normalize();
      f.addScaledVector(_d, -Math.min(1, (fm.mass - A.mtowWater) / 600) * 0.18 * fm.mass * G * clamp(spd / 6, 0, 1));
    }
    // Drop door.
    this.flowOut = 0;
    if (this.door > 0.05 && fm.hopper > 0) {
      const L = Math.min(fm.hopper, F.dropRate * this.door * dt);
      fm.hopper -= L;
      this.released += L;
      this.flowOut = L / dt;
      if (dropWorld) this.packets.push({ litres: L, x: dropWorld.x, y: dropWorld.y, z: dropWorld.z, vx: fm.vel.x, vy: fm.vel.y, vz: fm.vel.z });
    }
    if (this.dropping && fm.hopper <= 0) { fm.hopper = 0; this.dropping = false; this.msgs.push('dropEmpty'); }
    fm.extForce = f.lengthSq() > 0 ? f : null;
  }
}

// --------------------------------------------------------------------------
// Visuals: spray thrown up by the floats on the water and by the probes, and
// the water falling from the door (handed to the fire field as packets).
export class FireBossFx {
  constructor(ac) {
    this.ac = ac;
    this.t = 0;
  }
  update(dt) {
    const ac = this.ac, fm = ac.fm, o = fm.out, ws = ac.water, game = ac.game;
    const dust = game.dust;
    if (!dust) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.04;
    const white = [0.92, 0.95, 0.97];
    // Wake and spray where the hulls meet the water (more at the hump).
    if (o.onWater && o.waterSpeed > 2) {
      const k = Math.min(1, o.waterSpeed / 12) * (0.4 + 0.6 * Math.min(1, o.waterSupport));
      for (const sx of [1, -1]) {
        _v.set(sx * fm.A.floats.x, -2.55, -0.6 - Math.random() * 1.2).applyQuaternion(fm.quat).add(fm.pos);
        const wl = ac.env.water(_v.x, _v.z);
        if (wl < -1e8) continue;
        const side = _f.set(sx, 0, 0).applyQuaternion(fm.quat);
        dust.spawn(_v.x, wl + 0.1, _v.z, side.x * 3 * k - fm.vel.x * 0.25, 1.2 + 2.5 * k * Math.random(), side.z * 3 * k - fm.vel.z * 0.25,
          { life: 0.9 + Math.random() * 0.8, size: 0.6 + 1.2 * k, grow: 2.6, alpha: 0.42 * k, drag: 1.4, gravity: 6, color: white });
      }
    }
    // Probes in the water: a rooster tail behind each.
    if (ws.scooping) {
      for (const sx of [1, -1]) {
        _v.set(sx * (fm.A.floats.x - 0.28), -2.6, -1.0).applyQuaternion(fm.quat).add(fm.pos);
        const wl = ac.env.water(_v.x, _v.z);
        for (let i = 0; i < 3; i++) {
          dust.spawn(_v.x, wl + 0.2, _v.z, -fm.vel.x * 0.55 + (Math.random() - 0.5) * 2, 3 + Math.random() * 4, -fm.vel.z * 0.55 + (Math.random() - 0.5) * 2,
            { life: 1.2 + Math.random() * 0.6, size: 1.0 + Math.random(), grow: 3.0, alpha: 0.5, drag: 1.0, gravity: 7, color: white });
        }
      }
    }
  }
}
