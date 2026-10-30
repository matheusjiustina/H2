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
      g.toast(t('Tutorial complete. Good flying!'));
      return;
    }
    const s = st[this.i];
    // Count good spraying time for the first-pass step.
    const ac = g.aircraft;
    const hh = ac.workHeight();
    if (g.sprayer.on && g.sprayer.flowNow > 0 && hh > SPRAY.idealHeight[0] - 0.5 && hh < SPRAY.idealHeight[1] + 1.5) this.sprayGood += dt;
    g.hud.setTutorial(t('Tutorial {0} / {1} · {2}', this.i + 1, st.length, s.label), s.text, '');
    this.t += dt;
    if (this.t > 0.6 && s.done()) {
      this.i++;
      this.t = 0;
      g.audio?.play('success');
    }
    void BASE;
  }
}
