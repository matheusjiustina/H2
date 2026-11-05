// Short interactive introduction: service, engine, taxi, line-up, take-off,
// first pass with the spray, turn, and the return to the pad.
import { RUNWAY, BASE } from '../world/layout.js';
import { SPRAY } from '../config.js';
import { t } from '../i18n/index.js';

export class Tutorial {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.i = 0;
    this.t = 0;
    this.sprayGood = 0;
    this.passesAtStart = 0;
  }

  // kind: 'general' (first contract) or a flight-school contract id.
  start(kind = 'general') {
    this.active = true;
    this.kind = kind;
    this.i = 0;
    this.t = 0;
    this.sprayGood = 0;
    this.heightOk = 0;
    this.covT = 0;
    this.cov = 0;
  }
  // Key or touch-button label for an action (PC and mobile).
  k(a) {
    const g = this.game;
    if (!g.touch?.active) return g.hud.key(a);
    const T = {
      engine: t('hold ENG'), spray: 'SPRAY', brakes: 'BRAKE', flapsDown: 'FLP+', flapsUp: 'FLP−', map: 'MAP', orbit: t('FREE'),
      throttleUp: t('power slider up'), throttleDown: t('power slider down'), pitchUp: t('stick back'), pitchDown: t('stick forward'),
      rollLeft: t('stick left'), rollRight: t('stick right'), yawLeft: 'L', yawRight: 'R', interact: t('the button at the bottom'),
    };
    return `<span class="k">${T[a] ?? a}</span>`;
  }
  skip() {
    this.active = false;
    this.game.hud.setTutorial(null);
    this.game.career.tutorialDone = true;
    this.game.career.save();
  }

  // Flight school lessons: few, short steps on the two tiny talhões by the strip.
  schoolSteps() {
    const g = this.game;
    const k = (a) => this.k(a);
    const ac = g.aircraft, fm = ac.fm, o = fm.out;
    const pct = Math.round(this.cov * 100);
    const loaded = { label: t('Load'), text: t('The badeco is filling the aircraft for this lesson. Watch, or hold {0} to speed it up. A small load is enough here.', '<span class="k">T</span>'), done: () => !g.service.busy() && fm.hopper > 30 };
    const takeoff = { label: t('Take-off'), text: t('Hold {0} to start. Taxi to the strip, line up facing east, full power {1}, and lift off at about 60 kt with {2}.', k('engine'), k('throttleUp'), k('pitchUp')), done: () => !o.onGround && o.agl > 15 };
    const handIn = { label: t('Hand in'), text: t('Done! Land on the strip, taxi to the pad (blue circle) and stop the engine {0}. The report shows your grade.', k('engine')), done: () => !g.job || g.job.c.id !== this.kind };
    if (this.kind === 'school-1') return [
      loaded, takeoff,
      { label: t('Find E-01'), text: t('E-01 is the small soybean talhão right below, south of the strip (yellow outline on the map {0}). Turn onto the yellow line: the rows run east–west.', k('map')), done: () => this._nearJob(80) },
      { label: t('Work height'), text: t('Descend to 3–4 m over the crop: the HGT readout turns green. Keep about 90 kt — low and steady, eyes ahead.'), done: () => this.heightOk > 2 },
      { label: t('Spray'), text: t('Tap {0} at the edge of the talhão and again at the far edge. Keep the lightbar centred: it shows which way to steer.', k('spray')), done: () => this.sprayGood > 3 },
      { label: t('Three passes'), text: t('Climb gently at the end, turn around and line up on the next yellow line. A few passes cover E-01. Covered: {0}%', pct), done: () => !!g.job && this.cov >= g.job.target },
      handIn,
    ];
    return [
      loaded, takeoff,
      { label: t('The balão'), text: t('E-02 is the cotton beside the strip. At the end of a pass: spray OFF {0}, pull {1} to climb 20–30 m, turn 45° away, then bank back and dive onto the next line. Power line past the east end: turn early there.', k('spray'), k('pitchUp')), done: () => g.guidance.passes.filter((p) => p.done > 0.85).length >= 2 },
      { label: t('Close the gaps'), text: t('Keep going until no stripe is missing — the map {0} shows unsprayed gaps. Spraying outside the edges is waste. Covered: {1}%', k('map'), pct), done: () => !!g.job && this.cov >= g.job.target },
      handIn,
    ];
  }

  steps() {
    if (this.kind && this.kind !== 'general') return this.schoolSteps();
    const g = this.game;
    const k = (a) => this.k(a);
    const ac = g.aircraft, fm = ac.fm, o = fm.out;
    const onRunway = () => Math.abs(fm.pos.z - RUNWAY.z) < RUNWAY.width / 2 && fm.pos.x > RUNWAY.x0 - 5 && fm.pos.x < RUNWAY.x1;
    const hdg = ac.headingDeg();
    return [
      {
        label: t('Ground service'),
        text: t('The badeco is loading fuel and liquid. Watch him work with the free camera {0} (drag to look). Hold {1} to speed it up.', k('orbit'), '<span class="k">T</span>'),
        done: () => !g.service.busy() && fm.hopper > 50,
      },
      { label: t('Engine'), text: t('Hold {0} to start the engine. Keep the area clear — the crew is at the bench.', k('engine')), done: () => fm.engine === 'running' },
      {
        label: t('Taxi'),
        text: t('Add a little power {0} and steer with {1} {2} (or A / D). Hold {3} to brake. Taxi south to the strip (west end).', k('throttleUp'), k('yawLeft'), k('yawRight'), k('brakes')),
        done: () => onRunway() && fm.pos.x < RUNWAY.x0 + 80,
      },
      {
        label: t('Line up'),
        text: t('Line up on the centreline facing east (runway 09). Set 10° of flaps with {0}.', k('flapsDown')),
        done: () => onRunway() && Math.abs(((hdg - 90 + 540) % 360) - 180) < 12 && o.groundSpeed < 6,
      },
      {
        label: t('Take-off'),
        text: t('Full power {0}. Keep it straight with the rudder; ease the stick forward {1} to raise the tail, then back {2} at about 60 kt. A full hopper needs a longer run.', k('throttleUp'), k('pitchDown'), k('pitchUp')),
        done: () => !o.onGround && o.agl > 25,
      },
      {
        label: t('To the talhão'),
        text: t('Flaps up {0}. Turn toward the job (yellow outline on the minimap; {1} opens the map). Follow the yellow pass line.', k('flapsUp'), k('map')),
        done: () => g.job && this._nearJob(450),
      },
      {
        label: t('First pass'),
        text: t('Descend to 2.5–4.5 m over the crop (HGT turns green), line up on the yellow line and press {0} to spray. Keep the lightbar centred.', k('spray')),
        done: () => this.sprayGood > 5,
      },
      {
        label: t('Balão'),
        text: t('At the field edge press {0} to stop and fly the balão: pull {1} firmly to climb 20–30 m while the speed bleeds off, turn about 45° away, then bank steeply (60–75°) back toward the next line and let the nose fall. Dive back to 3 m on the yellow line. A loaded hopper climbs less and needs a shallower bank — watch the LOAD readout.', k('spray'), k('pitchUp')),
        done: () => g.guidance.passes.filter((p) => p.done > 0.85).length >= 2,
      },
      {
        label: t('Back to base'),
        text: t('Keep working until the job is done or the hopper is empty. Then land on the strip, taxi to the pad (blue circle) and tap {0} to shut down. The badeco reloads and your coverage is kept.', k('engine')),
        done: () => g.service.inZone() && fm.engine === 'off' && o.groundSpeed < 0.3,
      },
    ];
  }

  _nearJob(m) {
    const p = this.game.aircraft.fm.pos;
    return this.game.job.fields.some((f) => p.x > f.x0 - m && p.x < f.x1 + m && p.z > f.z0 - m && p.z < f.z1 + m);
  }

  update(dt) {
    if (!this.active) return;
    const g = this.game;
    const st = this.steps();
    if (this.i >= st.length) {
      g.hud.setTutorial(null);
      this.active = false;
      g.career.tutorialDone = true;
      g.career.save();
      g.toast(this.kind === 'school-1' ? t('Lesson 1 complete! Next: School 2 — the balão.') : this.kind === 'school-2' ? t('Flight school complete! The Level 1 orders are waiting.') : t('Tutorial complete. Good flying!'));
      return;
    }
    // A school lesson ends if its job is dropped for another.
    if (this.kind?.startsWith('school') && this.i < st.length - 1 && g.job?.c.id !== this.kind) { g.hud.setTutorial(null); this.active = false; return; }
    const s = st[this.i];
    // Count good spraying time for the first-pass step.
    const ac = g.aircraft;
    const hh = ac.workHeight();
    const inWin = !ac.fm.out.onGround && hh > SPRAY.idealHeight[0] - 0.5 && hh < SPRAY.idealHeight[1] + 1.5;
    if (g.sprayer.on && g.sprayer.flowNow > 0 && inWin) this.sprayGood += dt;
    this.heightOk = inWin && g.job && this._nearJob(30) ? this.heightOk + dt : 0;
    this.covT -= dt;
    if (this.covT <= 0 && g.job) { this.covT = 0.5; this.cov = g.job.stats().coverage; }
    const head = this.kind === 'school-1' ? t('School 1') : this.kind === 'school-2' ? t('School 2') : t('Tutorial');
    g.hud.setTutorial(t('{0} · {1} / {2} · {3}', head, this.i + 1, st.length, s.label), s.text, '');
    this.t += dt;
    if (this.t > 0.6 && s.done()) {
      this.i++;
      this.t = 0;
      g.audio?.play('success');
    }
    void BASE;
  }
}
