// Emergency jettison (alijamento): the hopper's dump gate under the belly
// opened wide — the whole load goes in a few seconds, a heavy white curtain
// falling and trailing behind the aircraft (it leaves with the aircraft's
// speed and is slowed by the air), the aircraft getting lighter as it goes.
// Agricultural aircraft: the gatebox dump (Y on the PC; again to close the
// gate). The Fire Boss dumps through its drop door (fireboss.js: the door
// opens fully and stays open until the tank is empty).
//
// Nothing jettisoned counts as application (no coverage, no product on the
// job); the litres are simply gone from the hopper, so the mass, the CG and
// the handling follow (fm.updateMass after each step). The curtain uses the
// shared dust particle pool (bounded, nothing kept); work is done only while
// the gate is open.
import * as THREE from 'three';
import { t } from '../i18n/index.js';

const DUMP_S = 5; // a full hopper through the dump gate (≈ 4–6 s on the types flown)
const _p = new THREE.Vector3(), _d = new THREE.Vector3();

export class Jettison {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.flow = 0; // L/s now
    this.dumped = 0; // L, total
    this.acc = 0;
  }

  available(ac = this.game.aircraft) {
    return ac.kind !== 'heli' && !ac.type.spray?.none && ac.A.hopperCapacity > 0;
  }

  toggle() {
    const g = this.game, ac = g.aircraft;
    if (ac.water) { // Fire Boss: the door, all the way, to empty
      if (ac.fm.hopper < 1) { g.toast(t('Tank empty — nothing to jettison.')); return; }
      ac.water.jettison();
      g.toast(t('JETTISON — drop door fully open until the tank is empty.'));
      g.audio?.play('valve');
      return;
    }
    if (!this.available(ac)) { g.toast(t('No dump gate on this aircraft.')); return; }
    if (!this.on && ac.fm.hopper < 1) { g.toast(t('Hopper empty — nothing to jettison.')); return; }
    this.on = !this.on;
    if (this.on) g.sprayer.on = false; // (the spray valve closes: everything goes out of the gate)
    g.toast(this.on ? t('JETTISON — dump gate open ({0} L).', Math.round(ac.fm.hopper)) : t('Dump gate closed — {0} L kept.', Math.round(ac.fm.hopper)));
    g.audio?.play('valve');
  }

  reset() { this.on = false; this.flow = 0; }

  // Once per fixed simulation step (with the sprayer).
  step(h) {
    if (!this.on) { this.flow = 0; return; }
    const ac = this.game.aircraft, fm = ac.fm;
    if (ac.state !== 'ok' || ac.water) { this.on = false; this.flow = 0; return; }
    const rate = ac.A.hopperCapacity / DUMP_S;
    // The gate opens in a fraction of a second; the head of liquid over it
    // falls as the hopper empties (the last litres trickle).
    const head = 0.35 + 0.65 * Math.sqrt(Math.min(1, fm.hopper / ac.A.hopperCapacity));
    const L = Math.min(fm.hopper, rate * head * h);
    fm.hopper -= L;
    this.dumped += L;
    this.flow = L / h;
    if (fm.hopper <= 0.5) {
      fm.hopper = 0;
      this.on = false;
      this.flow = 0;
      this.game.toast(t('Hopper empty — dump gate closed.'));
    }
  }

  // The curtain (per rendered frame).
  emit(dt) {
    if (this.flow <= 0) return;
    const g = this.game, ac = g.aircraft, fm = ac.fm, pool = g.dust;
    if (!pool) return;
    const m = ac.model;
    // Gate: under the belly at the hopper (the side coupler's station).
    const hp = m.hopperPort;
    _p.set(0, (hp ? hp.y : -0.3) - 0.42, hp ? hp.z : -0.6).applyQuaternion(ac.rQuat).add(ac.rPos);
    _d.set(0, -1, 0).applyQuaternion(fm.quat);
    const L = g.world.atmo?.cur.light ?? 1, lk = 0.55 + 0.45 * Math.min(1, L);
    const col = [0.93 * lk, 0.95 * lk, 0.97 * lk];
    const k = Math.min(1, this.flow / (ac.A.hopperCapacity / DUMP_S));
    this.acc += dt * 90 * (0.4 + 0.6 * k) * 1;
    while (this.acc >= 1) {
      this.acc -= 1;
      const r = Math.random();
      // The liquid leaves with the aircraft's speed (it is carried forward
      // and slowed by the air), a dense core and a lighter skirt round it.
      const core = r < 0.55;
      pool.spawn(
        _p.x + (Math.random() - 0.5) * 0.5, _p.y - Math.random() * 0.4, _p.z + (Math.random() - 0.5) * 0.5,
        fm.vel.x * (0.75 + Math.random() * 0.15) + _d.x * 4 + (Math.random() - 0.5) * 1.5,
        fm.vel.y * 0.7 - 3 - Math.random() * 2.5,
        fm.vel.z * (0.75 + Math.random() * 0.15) + _d.z * 4 + (Math.random() - 0.5) * 1.5,
        core
          ? { life: 1.4 + Math.random() * 0.8, size: 1.1 + Math.random() * 0.6, grow: 3.2, alpha: 0.6 * (0.6 + 0.4 * k), drag: 0.9, gravity: 7.5, color: col }
          : { life: 2.4 + Math.random() * 1.4, size: 1.6 + Math.random(), grow: 5.5, alpha: 0.3 * (0.6 + 0.4 * k), drag: 1.6, gravity: 3.2, color: col },
      );
    }
  }
}
