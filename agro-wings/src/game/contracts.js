// Contracts (service orders), job state, scoring and persistence.
import { CONTRACT_FIELDS, CROPS } from '../world/layout.js';
import { FieldCoverage } from '../spray/coverage.js';
import { GAME, SPRAY } from '../config.js';
import { readSafe, writeSafe } from '../core/safeStore.js';
import { t } from '../i18n/index.js';
import { FARM_CONTRACTS } from './farmContracts.js';
import { SERRA, FRONTIER } from '../world/activeMap.js';
import { SERRA_CONTRACTS } from './serraContracts.js';

export { FARM_CONTRACTS };
export const contractById = (id) => CONTRACTS.find((c) => c.id === id) ?? FARM_CONTRACTS.find((c) => c.id === id);

export const CONTRACTS = [
  // --- FLIGHT SCHOOL: two tiny talhões beside the strip, guided step by step ---
  {
    id: 'school-1',
    school: 1,
    complete: 0.85,
    get title() { return t('School 1 — First swath · Talhão E-01'); },
    client: 'Escola Agro Wings',
    get brief() { return t('A tiny soybean talhão just south of the strip: a few straight passes. Learn the loading, the take-off, the work height and the spray switch.'); },
    get difficulty() { return t('Beginner'); },
    level: 0,
    fields: ['E-01'],
    payPerHa: 200,
    bonus: 800,
    recommended: { fuel: 80, liquid: 200 },
    get tip() { return t('Follow the guide box at the top of the screen.'); },
  },
  {
    id: 'school-2',
    school: 2,
    complete: 0.85,
    get title() { return t('School 2 — The balão · Talhão E-02'); },
    client: 'Escola Agro Wings',
    get brief() { return t('A small cotton talhão right beside the strip. Learn the balão turn, switching the spray off at the edges and closing the gaps.'); },
    get difficulty() { return t('Beginner'); },
    level: 0,
    fields: ['E-02'],
    payPerHa: 220,
    bonus: 1000,
    recommended: { fuel: 80, liquid: 260 },
    get tip() { return t('Power line past the east end: start the balão early on that side.'); },
  },
  // --- BEGINNER TALHÕES: five small, flat level-1 fields (8.7 ha each) in
  // open country 1.9–3.7 km from the base — the step between the school and
  // the full-size orders: a dozen short passes, no wires, no trees in the way.
  {
    id: 'beg-1',
    beginner: true,
    get title() { return t('Soybean — Talhão I-01'); },
    client: 'Sítio Bela Vista',
    get brief() { return t('A small soybean talhão on the open plain north of the base, short of the cerrado. About a dozen east–west passes: practise the full circuit on your own.'); },
    get difficulty() { return t('Beginner'); },
    level: 1,
    fields: ['I-01'],
    payPerHa: 240,
    bonus: 1500,
    recommended: { fuel: 110, liquid: 400 },
    get tip() { return t('Fly out north: the talhão lies 3.7 km from the base, at the edge of the cerrado.'); },
  },
  {
    id: 'beg-2',
    beginner: true,
    get title() { return t('Cotton — Talhão I-02'); },
    client: 'Sítio Dois Irmãos',
    get brief() { return t('A small cotton talhão in the open north-west. Short passes and plenty of room for the balão at both ends.'); },
    get difficulty() { return t('Beginner'); },
    level: 1,
    fields: ['I-02'],
    payPerHa: 250,
    bonus: 1600,
    recommended: { fuel: 110, liquid: 440 },
    get tip() { return t('Cotton stands 1.2 m: keep the work height over the canopy.'); },
  },
  {
    id: 'beg-3',
    beginner: true,
    get title() { return t('Soybean — Talhão I-03'); },
    client: 'Chácara Santa Luzia',
    get brief() { return t('The closest of the beginner talhões, 1.9 km west of the base. A quick job between two longer ones.'); },
    get difficulty() { return t('Beginner'); },
    level: 1,
    fields: ['I-03'],
    payPerHa: 230,
    bonus: 1200,
    recommended: { fuel: 90, liquid: 400 },
    get tip() { return t('A forest block lies 200 m to the north: turn your balão to the south side.'); },
  },
  {
    id: 'beg-4',
    beginner: true,
    get title() { return t('Soybean — Talhão I-04'); },
    client: 'Sítio Recanto',
    get brief() { return t('A small soybean talhão on dead-flat ground south of the base, beside a farm road. Ideal for working on straight, even swaths.'); },
    get difficulty() { return t('Beginner'); },
    level: 1,
    fields: ['I-04'],
    payPerHa: 240,
    bonus: 1400,
    recommended: { fuel: 100, liquid: 400 },
    get tip() { return t('Use the lightbar: the passes are short, so line up early after each turn.'); },
  },
  {
    id: 'beg-5',
    beginner: true,
    get title() { return t('Cotton — Talhão I-05'); },
    client: 'Sítio Pau-Brasil',
    get brief() { return t('A small cotton talhão east of the base, a forest block 370 m beyond its east end. Short passes with clear run-ins at both ends.'); },
    get difficulty() { return t('Beginner'); },
    level: 1,
    fields: ['I-05'],
    payPerHa: 250,
    bonus: 1800,
    recommended: { fuel: 110, liquid: 440 },
    get tip() { return t('Switch the spray off at each end before the balão.'); },
  },
  {
    id: 'soy',
    get title() { return t('Soybean — Talhão T-07'); },
    client: 'Fazenda Boa Esperança',
    get brief() { return t('A wide, flat soybean talhão right beside the strip. Fly long east–west passes at 3–4 m over the canopy and learn the circuit: pass, turn, line up on the next swath.'); },
    get difficulty() { return t('Training'); },
    level: 1,
    fields: ['T-07'],
    payPerHa: 260,
    bonus: 2500,
    recommended: { fuel: 140, liquid: 560 },
    get tip() { return t('Rows run east–west. Use the lightbar to stay on the yellow line.'); },
  },
  {
    id: 'corn',
    get title() { return t('Corn — Talhão T-12'); },
    client: 'Fazenda Boa Esperança',
    get brief() { return t('Tall corn (2.4 m) on a rolling swell, a tree line along the south edge and a power line past the east end. Keep the work height over the canopy, not the ground, and pull up before the wires.'); },
    get difficulty() { return t('Attention'); },
    level: 1,
    fields: ['T-12'],
    payPerHa: 330,
    bonus: 3500,
    recommended: { fuel: 140, liquid: 520 },
    get tip() { return t('The orange balls mark the power line at the east end of each pass.'); },
  },
  {
    id: 'cotton',
    get title() { return t('Cotton — Talhões T-03A + T-03B'); },
    client: 'Fazenda Boa Esperança',
    get brief() { return t('Two cotton talhões split by the creek crossing. One pass line runs over both: switch the spray OFF over the gap and back ON at the next field edge.'); },
    get difficulty() { return t('Precision'); },
    level: 1,
    fields: ['T-03A', 'T-03B'],
    payPerHa: 380,
    bonus: 4500,
    recommended: { fuel: 150, liquid: 500 },
    get tip() { return t('Liquid sprayed over the creek or the road counts as waste.'); },
  },
  // --- LEVEL 2: rolling fields (Campos do Sul, Chapada Oeste) ---
  {
    id: 'roll-soy',
    get title() { return t('Soybean — Talhões T-31A + T-31B'); },
    client: 'Fazenda Boa Esperança · Campos do Sul',
    get brief() { return t('An L-shaped soybean block on long, gentle swells, 3 km south-south-east of the strip. The ground rises and falls about 12 m across the talhão: hold the work height over the canopy, not a fixed altitude, and let the swath follow the land.'); },
    get difficulty() { return t('Rolling fields'); },
    level: 2,
    fields: ['T-31A', 'T-31B'],
    payPerHa: 330,
    bonus: 3800,
    recommended: { fuel: 150, liquid: 560 },
    get tip() { return t('The second talhão steps off the first: the pass lines run across both, switch the spray OFF over the gap.'); },
  },
  {
    id: 'roll-corn',
    get title() { return t('Corn — Talhões T-32A + T-32B'); },
    client: 'Fazenda Boa Esperança · Campos do Sul',
    get brief() { return t('Tall corn across a rolling slope east of the creek, two staggered talhões. The canopy is 2.4 m: with the land rising under the pass, the height over the crop changes faster than the altimeter suggests.'); },
    get difficulty() { return t('Rolling fields'); },
    level: 2,
    fields: ['T-32A', 'T-32B'],
    payPerHa: 400,
    bonus: 4500,
    recommended: { fuel: 150, liquid: 520 },
    get tip() { return t('Climb with the slope before it arrives — watch the HGT readout, not the horizon.'); },
  },
  {
    id: 'roll-cotton',
    get title() { return t('Cotton — Talhões T-33A + T-33B'); },
    client: 'Fazenda Boa Esperança · Chapada Oeste',
    get brief() { return t('A cotton block in the far north-west on the Chapada: a long swell across the whole talhão and a second field offset to the east. A long ferry flight each way — plan the loads.'); },
    get difficulty() { return t('Rolling fields'); },
    level: 2,
    fields: ['T-33A', 'T-33B'],
    payPerHa: 450,
    bonus: 5000,
    recommended: { fuel: 170, liquid: 500 },
    get tip() { return t('Liquid sprayed off the talhão counts as waste, also on the slopes.'); },
  },
  // --- LEVEL 3: hilly agricultural fields (Serra do Norte) ---
  {
    id: 'ridge-soy',
    get title() { return t('Soybean — Talhões T-41A + T-41B'); },
    client: 'Fazenda Boa Esperança · Serra do Norte',
    get brief() { return t('Soybean across a ridge flank in the north-east hills. About 25 m of relief across the talhão, an uneven contour and a stepped boundary. Fly along the slope where you can; the work height over the canopy keeps changing.'); },
    get difficulty() { return t('Hilly fields'); },
    level: 3,
    fields: ['T-41A', 'T-41B'],
    payPerHa: 420,
    bonus: 6000,
    recommended: { fuel: 160, liquid: 560 },
    get tip() { return t('Rising ground shortens your margin first: look ahead along the pass and fly the slope, not the horizon.'); },
  },
  {
    id: 'ridge-cotton',
    get title() { return t('Cotton — Talhões T-42A + T-42B'); },
    client: 'Fazenda Boa Esperança · Serra do Norte',
    get brief() { return t('Cotton on a ridge and its valley, 4 km north-north-east of the strip. Two talhões, stepped one above the other; the land climbs about 30 m across the main block.'); },
    get difficulty() { return t('Hilly fields'); },
    level: 3,
    fields: ['T-42A', 'T-42B'],
    payPerHa: 560,
    bonus: 7000,
    recommended: { fuel: 170, liquid: 500 },
    get tip() { return t('Pull up before the crest, not on it. The valley side hides the next ridge.'); },
  },
  {
    id: 'ridge-corn',
    get title() { return t('Corn — Talhões T-43A + T-43B'); },
    client: 'Fazenda Boa Esperança · Serra do Norte',
    get brief() { return t('Tall corn over a hill west of the creek, with a step-out talhão on the north side and the legal-reserve forest just south. Slopes up to 7° and 30 m of relief across the field: the corn canopy is 2.4 m, so the margin over a crest is thin.'); },
    get difficulty() { return t('Hilly fields'); },
    level: 3,
    fields: ['T-43A', 'T-43B'],
    payPerHa: 500,
    bonus: 8000,
    recommended: { fuel: 170, liquid: 520 },
    get tip() { return t('Fly across the hill rather than up and down it when the pass allows; the lightbar shows the line.'); },
  },
];

export const LEVELS = {
  0: { get label() { return t('Flight school'); }, get short() { return t('School'); }, get blurb() { return t('Two tiny talhões beside the strip, with a step-by-step guide. Start here.'); } },
  b: { get label() { return t('Beginner talhões'); }, get short() { return t('Beginner'); }, get blurb() { return t('Small flat talhões (8.7 ha) in open country: the step after the school. Quick jobs, no wires.'); } },
  1: { get label() { return t('Level 1 · Flat farmland'); }, get short() { return t('L1'); }, get blurb() { return t('Mostly level terrain.'); } },
  2: { get label() { return t('Level 2 · Rolling fields'); }, get short() { return t('L2'); }, get blurb() { return t('Gentle swells: about 20–30 m of relief across a field, slopes up to 5°.'); } },
  3: { get label() { return t('Level 3 · Hilly agricultural fields'); }, get short() { return t('L3'); }, get blurb() { return t('Noticeable hills and valleys: 25–37 m of relief, slopes up to 7°.'); } },
};

// Serra das Bananeiras (a separate map): its own orders and board heading.
if (SERRA) {
  CONTRACTS.length = 0; CONTRACTS.push(...SERRA_CONTRACTS);
  LEVELS[2] = { get label() { return t('Serra das Bananeiras · banana talhões'); }, get short() { return t('Banana'); }, get blurb() { return t('Small talhões laid along the hillsides: short passes that follow the terrain.'); } };
}

// Fireboss Frontier (premium map 03): fire missions only (src/game/fireJobs.js).
if (FRONTIER) CONTRACTS.length = 0;

const STORE = 'agrowings.save.v1';

export class Career {
  constructor() {
    this.money = GAME.startMoney;
    this.completed = {};
    this.jobs = {}; // id -> Job
    this.history = []; // main-farm jobs
    this.history2 = []; // secondary-farm jobs (kept apart)
    this.read = {}; // office inbox: request id -> read
    this.seq = 0; // operation counter (both histories)
    this.tutorialDone = false;
    this.resume = null; // the job in hand when the game was left: { job, ac, fuel, hopper, t }
    this.onSave = null; // game hook: returns the current resume point (undefined = keep)
    this.load();
  }

  job(id) {
    if (!this.jobs[id]) this.jobs[id] = new Job(contractById(id));
    return this.jobs[id];
  }

  // One finished operation into its history: what, where, with what, when, how well.
  record(job, r, aircraft, extra = {}) {
    const c = job.c;
    const e = {
      id: c.id, n: ++this.seq, t: Date.now(), farm: c.farm ?? 'main', ac: aircraft.type.reg, acId: aircraft.type.id,
      total: r.total, coverage: r.coverage, stars: r.stars, done: r.done, uniformity: r.uniformity, waste: r.waste,
      ha: job.ha, flight: Math.round(job.flightTime), sorties: job.sorties, damage: Math.round(r.damage), ...extra,
    };
    (c.farm ? this.history2 : this.history).push(e);
    return e;
  }

  save() {
    try {
      const jobs = { ...(this.otherJobs || {}) };
      for (const [id, j] of Object.entries(this.jobs)) jobs[id] = j.serialize();
      const r = this.onSave?.();
      if (r !== undefined) this.resume = r;
      // (phase 05: hashed envelope + previous good copy, see core/safeStore.js)
      writeSafe(STORE, { resume: this.resume ?? this.otherResume ?? null, money: this.money, completed: this.completed, jobs, history: this.history.slice(-30), history2: this.history2.slice(-30), read: this.read, seq: this.seq, tutorialDone: this.tutorialDone }, 1);
    } catch { /* storage unavailable: progress stays in memory */ }
  }
  load() {
    try {
      const r = readSafe(STORE);
      this.loadSource = r.source; // 'backup' when the main entry was damaged
      const s = r.data;
      if (!s) return;
      this.money = s.money ?? this.money;
      this.completed = s.completed || {};
      this.history = s.history || [];
      this.history2 = s.history2 || [];
      this.read = s.read || {};
      this.seq = s.seq ?? this.history.length + this.history2.length;
      this.tutorialDone = !!s.tutorialDone;
      this.resume = s.resume && contractById(s.resume.job) ? s.resume : null;
      // Jobs (and the job in hand) of another map — the main world while a
      // premium map is flown, or the other way round — are kept as they were
      // saved and written back unchanged, so no map loses progress.
      this.otherResume = s.resume && !this.resume ? s.resume : null;
      for (const [id, js] of Object.entries(s.jobs || {})) {
        const c = contractById(id);
        if (!c) { (this.otherJobs ||= {})[id] = js; continue; }
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
    this.history2 = [];
    this.read = {};
    this.seq = 0;
    this.tutorialDone = false;
    this.resume = null;
    this.otherJobs = {}; this.otherResume = null;
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

  get crop() { return t(CROPS[this.fields[0].crop].label); }

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

  // Coverage that completes the job (the tiny school talhões: 85 %, their
  // edges weigh more).
  get target() { return this.c.complete ?? GAME.completeCoverage; }
  complete() { return this.stats().coverage >= this.target; }

  // Payment for the work so far. Partial work is paid pro rata.
  evaluate(damage) {
    const s = this.stats();
    const base = this.c.payPerHa * this.ha * Math.min(1, s.coverage / this.target);
    const quality = 0.65 + 0.35 * s.uniformity;
    const wastePenalty = Math.max(0, s.waste - 0.1) * 0.8;
    const done = s.coverage >= this.target;
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

export const swathInfo = (type) => ({ swath: type?.spray.swath ?? SPRAY.swath, rate: SPRAY.targetRate });
