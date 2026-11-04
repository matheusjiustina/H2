// Fire-fighting service orders — Fire Boss only. They use the existing
// fire test zone (src/world/fires.js): accepting an order relights its
// spots; the job is done when every one of them is out; the pay goes to the
// career balance like any contract. Without an accepted order the fires may
// still burn there, but the HUD does not chase the pilot with them.
import { t } from '../i18n/index.js';

export const FIRE_JOBS = [
  { id: 'fb-spot', spots: [1], pay: 14000, bonusMin: 8, get title() { return t('Isolated fire at the reserve edge'); }, get brief() { return t('One spot near the forest edge. Scoop at the reservoir and put it out before it spreads.'); } },
  { id: 'fb-line', spots: [2, 3, 4], pay: 36000, bonusMin: 16, get title() { return t('Fire line on the hillside'); }, get brief() { return t('Three spots in a line along the slope. Several drops: plan the scooping circuit.'); } },
  { id: 'fb-all', spots: [1, 2, 3, 4, 5], pay: 62000, bonusMin: 28, get title() { return t('Forest fire — every spot'); }, get brief() { return t('The whole fire zone is burning. Put out all five spots; the faster, the bigger the bonus.'); } },
];
const BONUS = 0.25; // share of the pay for finishing inside bonusMin minutes

export class FireJobs {
  constructor(game) {
    this.game = game;
    this.job = null; // { def, t0 }
  }
  get active() { return !!this.job; }

  // Accept an order (Fire Boss only): its spots burn again from full.
  accept(id) {
    const g = this.game, def = FIRE_JOBS.find((j) => j.id === id);
    if (!def || !g.aircraft?.water || !g.fires) return false;
    for (const f of g.fires.fires) if (def.spots.includes(f.id)) { f.state = 'burning'; f.intensity = 1; f.water = 0; }
    g.fires.allOutT = 0;
    g.fires._writeFlames?.();
    this.job = { def, t0: g.time };
    g.toast(t('Fire order accepted: {0}. Spots marked on the HUD.', def.title));
    return true;
  }
  cancel() { if (this.job) { this.job = null; this.game.toast(t('Fire order handed in.')); } }

  // Burning spots of the accepted order (empty without one).
  spots() {
    const f = this.game.fires;
    return this.job && f ? f.fires.filter((s) => this.job.def.spots.includes(s.id)) : [];
  }
  nearest(pos) {
    let best = null, bd = 1e9;
    for (const f of this.spots()) {
      if (f.state !== 'burning') continue;
      const d = Math.hypot(f.x - pos.x, f.z - pos.z);
      if (d < bd) { bd = d; best = f; }
    }
    return best ? { fire: best, dist: bd, bearing: ((Math.atan2(best.x - pos.x, -(best.z - pos.z)) * 180) / Math.PI + 360) % 360 } : null;
  }

  update() {
    const g = this.game;
    if (!this.job) return;
    if (!g.aircraft?.water) { this.job = null; return; } // aircraft changed
    const s = this.spots();
    if (s.length && s.every((f) => f.state === 'out')) {
      const def = this.job.def, min = (g.time - this.job.t0) / 60;
      const bonus = min <= def.bonusMin ? Math.round(def.pay * BONUS) : 0;
      g.career.money += def.pay + bonus;
      g.career.save();
      g.toast(bonus ? t('Fire out! {0} paid + {1} bonus ({2} min).', def.pay.toLocaleString('pt-BR'), bonus.toLocaleString('pt-BR'), Math.round(min)) : t('Fire out! {0} paid ({1} min).', def.pay.toLocaleString('pt-BR'), Math.round(min)));
      g.audio?.play('ui');
      this.job = null;
    }
  }
}
