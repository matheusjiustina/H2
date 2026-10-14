// Contracts (service orders), job state, scoring and persistence.
import { CONTRACT_FIELDS, CROPS } from '../world/layout.js';
import { FieldCoverage } from '../spray/coverage.js';
import { GAME, SPRAY } from '../config.js';

export const CONTRACTS = [
  {
    id: 'soy',
    title: 'Soybean — Talhão T-07',
    client: 'Fazenda Boa Esperança',
    brief: 'A wide, flat soybean talhão right beside the strip. Fly long east–west passes at 3–4 m over the canopy and learn the circuit: pass, turn, line up on the next swath.',
    difficulty: 'Training',
    fields: ['T-07'],
    payPerHa: 260,
    bonus: 2500,
    recommended: { fuel: 160, liquid: 820 },
    tip: 'Rows run east–west. Use the lightbar to stay on the yellow line.',
  },
  {
    id: 'corn',
    title: 'Corn — Talhão T-12',
    client: 'Fazenda Boa Esperança',
    brief: 'Tall corn (2.4 m) on a rolling swell, a tree line on the west edge and a power line along the east end. Keep the work height over the canopy, not the ground, and pull up before the wires.',
    difficulty: 'Attention',
    fields: ['T-12'],
    payPerHa: 330,
    bonus: 3500,
    recommended: { fuel: 170, liquid: 720 },
    tip: 'The orange balls mark the power line at the east end of each pass.',
  },
  {
    id: 'cotton',
    title: 'Cotton — Talhões T-03A + T-03B',
    client: 'Fazenda Boa Esperança',
    brief: 'Two cotton talhões split by the creek and its buriti palms. One pass line crosses both: switch the spray OFF over the gap and back ON at the next field edge.',
    difficulty: 'Precision',
    fields: ['T-03A', 'T-03B'],
    payPerHa: 380,
    bonus: 4500,
    recommended: { fuel: 200, liquid: 650 },
    tip: 'Liquid sprayed over the creek or the road counts as waste.',
  },
];

const STORE = 'agrowings.save.v1';

export class Career {
  constructor() {
    this.money = GAME.startMoney;
    this.completed = {};
    this.jobs = {}; // id -> Job
    this.history = [];
    this.tutorialDone = false;
    this.load();
  }

  job(id) {
    if (!this.jobs[id]) this.jobs[id] = new Job(CONTRACTS.find((c) => c.id === id));
    return this.jobs[id];
  }

  save() {
    try {
      const jobs = {};
      for (const [id, j] of Object.entries(this.jobs)) jobs[id] = j.serialize();
      localStorage.setItem(STORE, JSON.stringify({ money: this.money, completed: this.completed, jobs, history: this.history.slice(-20), tutorialDone: this.tutorialDone }));
    } catch { /* storage unavailable: progress stays in memory */ }
  }
  load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (!s) return;
      this.money = s.money ?? this.money;
      this.completed = s.completed || {};
      this.history = s.history || [];
      this.tutorialDone = !!s.tutorialDone;
      for (const [id, js] of Object.entries(s.jobs || {})) {
        const c = CONTRACTS.find((x) => x.id === id);
        if (!c) continue;
        const j = new Job(c);
        j.restore(js);
        this.jobs[id] = j;
      }
    } catch { /* ignore corrupt save */ }
  }
  resetAll() {
    this.money = GAME.startMoney;
    this.completed = {};
    this.jobs = {};
    this.history = [];
    this.tutorialDone = false;
    this.save();
  }
}

export class Job {
  constructor(contract) {
    this.c = contract;
    this.fields = contract.fields.map((n) => CONTRACT_FIELDS.find((f) => f.name === n));
    this.coverages = this.fields.map((f) => new FieldCoverage(f));
    this.ha = this.fields.reduce((s, f) => s + ((f.x1 - f.x0) * (f.z1 - f.z0)) / 10000, 0);
    this.started = false;
    this.sorties = 0;
    this.sprayed = 0; this.offTarget = 0; this.lost = 0;
    this.damageAtStart = 0;
    this.damageTaken = 0;
    this.flightTime = 0;
    this.landings = [];
  }

  get crop() { return CROPS[this.fields[0].crop].label; }

  stats() {
    let area = 0, good = 0, gaps = 0, over = 0, uni = 0, applied = 0, overdose = 0;
    for (const cov of this.coverages) {
      const s = cov.stats();
      area += cov.area;
      good += s.coverage * cov.area;
      gaps += s.gaps * cov.area;
      over += s.overlap * cov.area;
      uni += s.uniformity * cov.area;
      applied += cov.applied;
      overdose += cov.overdose;
    }
    const sprayed = Math.max(1e-6, this.sprayed);
    const waste = (this.offTarget + this.lost + overdose) / sprayed;
    return {
      coverage: good / area, gaps: gaps / area, overlap: over / area, uniformity: uni / area,
      waste: this.sprayed > 1 ? Math.min(1, waste) : 0, sprayed: this.sprayed, offTarget: this.offTarget, lost: this.lost,
      overdose, applied, ha: this.ha,
    };
  }

  complete() { return this.stats().coverage >= GAME.completeCoverage; }

  // Payment for the work so far. Partial work is paid pro rata.
  evaluate(damage) {
    const s = this.stats();
    const base = this.c.payPerHa * this.ha * Math.min(1, s.coverage / GAME.completeCoverage);
    const quality = 0.65 + 0.35 * s.uniformity;
    const wastePenalty = Math.max(0, s.waste - 0.1) * 0.8;
    const done = s.coverage >= GAME.completeCoverage;
    const bonus = done ? this.c.bonus * Math.max(0, 1 - s.waste * 1.5) * s.uniformity : 0;
    const repair = Math.round(damage * GAME.repairPerDamage);
    const pay = Math.round(base * quality * (1 - Math.min(0.6, wastePenalty)) + bonus);
    const total = pay - repair;
    const stars = done ? (s.uniformity > 0.8 && s.waste < 0.12 && damage < 5 ? 3 : s.uniformity > 0.65 && s.waste < 0.22 ? 2 : 1) : 0;
    return { ...s, base: Math.round(base), quality, bonus: Math.round(bonus), repair, pay, total, done, stars, damage };
  }

  serialize() {
    return {
      cov: this.coverages.map((c) => c.serialize()),
      sprayed: this.sprayed, offTarget: this.offTarget, lost: this.lost, sorties: this.sorties, started: this.started,
      flightTime: this.flightTime,
    };
  }
  restore(o) {
    if (!o) return;
    (o.cov || []).forEach((c, i) => this.coverages[i]?.restore(c));
    this.sprayed = o.sprayed || 0; this.offTarget = o.offTarget || 0; this.lost = o.lost || 0;
    this.sorties = o.sorties || 0; this.started = !!o.started; this.flightTime = o.flightTime || 0;
  }
  reset() {
    for (const c of this.coverages) c.reset();
    this.sprayed = this.offTarget = this.lost = 0;
    this.sorties = 0;
    this.started = false;
    this.flightTime = 0;
  }
}

export const swathInfo = () => ({ swath: SPRAY.swath, rate: SPRAY.targetRate });
