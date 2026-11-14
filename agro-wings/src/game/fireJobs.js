// Fire-fighting service orders — Fire Boss only. They use the existing
// fire test zone (src/world/fires.js): accepting an order relights its
// spots; the job is done when every one of them is out; the pay goes to the
// career balance like any contract. Without an accepted order the fires may
// still burn there, but the HUD does not chase the pilot with them.
//
// Fireboss Frontier (premium map 03): the map's own missions
// (src/game/frontierMissions.js) replace these; their spots are unlit until
// accepted, a mission handed in puts them back out of sight, a completed
// one leaves the burnt ground; a mission may flare up (more spots lit when
// its fire is not under control in time).
import { t } from '../i18n/index.js';
import { FRONTIER } from '../world/activeMap.js';
import { FRONT_MISSIONS } from './frontierMissions.js';

const MAIN_FIRE_JOBS = [
  { id: 'fb-spot', spots: [1], pay: 14000, bonusMin: 8, get title() { return t('Isolated fire at the reserve edge'); }, get brief() { return t('One spot near the forest edge. Scoop at the reservoir and put it out before it spreads.'); } },
  { id: 'fb-line', spots: [2, 3, 4], pay: 36000, bonusMin: 16, get title() { return t('Fire line on the hillside'); }, get brief() { return t('Three spots in a line along the slope. Several drops: plan the scooping circuit.'); } },
  { id: 'fb-all', spots: [1, 2, 3, 4, 5], pay: 62000, bonusMin: 28, get title() { return t('Forest fire — every spot'); }, get brief() { return t('The whole fire zone is burning. Put out all five spots; the faster, the bigger the bonus.'); } },
];
export const FIRE_JOBS = FRONTIER ? FRONT_MISSIONS : MAIN_FIRE_JOBS;
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
    if (this.job && FRONTIER) g.fires.extinguish(this.ids());
    g.fires.relight(def.spots);
    this.job = { def, t0: g.time, extra: [] };
    g.toast(t('Fire order accepted: {0}. Spots marked on the HUD.', def.title));
    return true;
  }
  cancel() {
    if (!this.job) return;
    if (FRONTIER) this.game.fires?.extinguish(this.ids());
    this.job = null;
    this.game.toast(t('Fire order handed in.'));
  }
  // Every spot of the accepted order (with the flare-ups lit so far).
  ids() { return this.job ? [...this.job.def.spots, ...this.job.extra] : []; }

  // Burning spots of the accepted order (empty without one).
  spots() {
    const f = this.game.fires;
    if (!this.job || !f) return [];
    const ids = this.ids();
    return f.fires.filter((s) => ids.includes(s.id));
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
    if (!g.aircraft?.water) { if (FRONTIER) g.fires?.extinguish(this.ids()); this.job = null; return; } // aircraft changed
    const s = this.spots();
    // Flare-up: the fire jumps while the first spots still burn.
    const fl = this.job.def.flare;
    if (fl && !this.job.flared && g.time - this.job.t0 > fl.after * 60 && s.some((f) => f.state === 'burning')) {
      this.job.flared = true;
      this.job.extra.push(...fl.spots);
      g.fires.relight(fl.spots);
      g.toast(t('The fire jumped the line: new spots marked on the HUD.'));
      g.audio?.play('ui');
      return;
    }
    if (s.length && s.every((f) => f.state === 'out')) {
      const def = this.job.def, min = (g.time - this.job.t0) / 60;
      const bonus = min <= def.bonusMin ? Math.round(def.pay * BONUS) : 0;
      g.career.money += def.pay + bonus;
      if (FRONTIER && g.career.completed) g.career.completed[def.id] = { stars: bonus ? 3 : 2 };
      g.career.save();
      g.toast(bonus ? t('Fire out! {0} paid + {1} bonus ({2} min).', def.pay.toLocaleString('pt-BR'), bonus.toLocaleString('pt-BR'), Math.round(min)) : t('Fire out! {0} paid ({1} min).', def.pay.toLocaleString('pt-BR'), Math.round(min)));
      g.audio?.play('ui');
      this.job = null;
    }
  }
}
