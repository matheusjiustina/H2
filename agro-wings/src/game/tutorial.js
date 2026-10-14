// Short interactive introduction: service, engine, taxi, line-up, take-off,
// first pass with the spray, turn, and the return to the pad.
import { RUNWAY, BASE } from '../world/layout.js';
import { SPRAY } from '../config.js';

export class Tutorial {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.i = 0;
    this.t = 0;
    this.sprayGood = 0;
    this.passesAtStart = 0;
  }

  start() {
    this.active = true;
    this.i = 0;
    this.t = 0;
    this.sprayGood = 0;
  }
  skip() {
    this.active = false;
    this.game.hud.setTutorial(null);
    this.game.career.tutorialDone = true;
    this.game.career.save();
  }

  steps() {
    const g = this.game;
    const k = (a) => g.hud.key(a);
    const ac = g.aircraft, fm = ac.fm, o = fm.out;
    const onRunway = () => Math.abs(fm.pos.z - RUNWAY.z) < RUNWAY.width / 2 && fm.pos.x > RUNWAY.x0 - 5 && fm.pos.x < RUNWAY.x1;
    const hdg = ac.headingDeg();
    return [
      {
        label: 'Ground service',
        text: `The badeco is loading fuel and liquid. Watch him work with the free camera ${k('orbit')} (drag to look). Hold <span class="k">T</span> to speed it up.`,
        done: () => !g.service.busy() && fm.hopper > 50,
      },
      { label: 'Engine', text: `Hold ${k('engine')} to start the engine. Keep the area clear — the crew is at the bench.`, done: () => fm.engine === 'running' },
      {
        label: 'Taxi',
        text: `Add a little power ${k('throttleUp')} and steer with ${k('yawLeft')} ${k('yawRight')} (or A / D). Hold ${k('brakes')} to brake. Taxi south to the strip (west end).`,
        done: () => onRunway() && fm.pos.x < RUNWAY.x0 + 80,
      },
      {
        label: 'Line up',
        text: `Line up on the centreline facing east (runway 09). Set 10° of flaps with ${k('flapsDown')}.`,
        done: () => onRunway() && Math.abs(((hdg - 90 + 540) % 360) - 180) < 12 && o.groundSpeed < 6,
      },
      {
        label: 'Take-off',
        text: `Full power ${k('throttleUp')}. Keep it straight with the rudder; ease the stick forward ${k('pitchDown')} to raise the tail, then back ${k('pitchUp')} at about 60 kt. A full hopper needs a longer run.`,
        done: () => !o.onGround && o.agl > 25,
      },
      {
        label: 'To the talhão',
        text: `Flaps up ${k('flapsUp')}. Turn toward the job (yellow outline on the minimap; ${k('map')} opens the map). Follow the yellow pass line.`,
        done: () => g.job && this._nearJob(450),
      },
      {
        label: 'First pass',
        text: `Descend to 2.5–4.5 m over the crop (HGT turns green), line up on the yellow line and press ${k('spray')} to spray. Keep the lightbar centred.`,
        done: () => this.sprayGood > 5,
      },
      {
        label: 'Turn around',
        text: `At the field edge press ${k('spray')} to stop, climb a little, make a procedure turn and line up on the next pass.`,
        done: () => g.guidance.passes.filter((p) => p.done > 0.85).length >= 2,
      },
      {
        label: 'Back to base',
        text: `Keep working until the job is done or the hopper is empty. Then land on the strip, taxi to the pad (blue circle) and tap ${k('engine')} to shut down. The badeco reloads and your coverage is kept.`,
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
      g.toast('Tutorial complete. Good flying!');
      return;
    }
    const s = st[this.i];
    // Count good spraying time for the first-pass step.
    const ac = g.aircraft;
    const hh = ac.workHeight();
    if (g.sprayer.on && g.sprayer.flowNow > 0 && hh > SPRAY.idealHeight[0] - 0.5 && hh < SPRAY.idealHeight[1] + 1.5) this.sprayGood += dt;
    g.hud.setTutorial(`Tutorial ${this.i + 1} / ${st.length} · ${s.label}`, s.text, '');
    this.t += dt;
    if (this.t > 0.6 && s.done()) {
      this.i++;
      this.t = 0;
      g.audio?.play('success');
    }
    void BASE;
  }
}
