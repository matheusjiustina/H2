import { makeGame } from './apsim.mjs';
import { Autopilot } from '../src/game/autopilot.js';
const game = makeGame('soy');
const ap = new Autopilot(game); ap.engage('contract');
const ac = game.aircraft; ac.placeOnRunway('west'); ac.fm.engine = 'running'; ac.fm.rpm = 800; ac.fm.hopper = 820; ac.fm.fuel = 160;
ap.set('lineup');
const mouse = { buttons: 0, dx: 0, dy: 0, wheel: 0 };
const dt = 1 / 60;
for (let t = 0; t < 140; t += dt) {
  ap.update(dt);
  ac.update(dt, game.input, { mouse, assist: 'normal', windScale: 1 });
  game.guidance.update(dt);
  if (t > 95 && Math.floor(t * 60) % 60 === 0) {
    const fm = ac.fm, v = game.input.virtual;
    console.log(t.toFixed(0), ap.phase, 'st', ap.tdStage, 'x', fm.pos.x.toFixed(0), 'z', fm.pos.z.toFixed(0), 'y', fm.pos.y.toFixed(1), 'vs', fm.out.vs.toFixed(1), 'kt', (fm.out.airspeed*1.944).toFixed(0), 'bank', (ap.att.bank*57.3).toFixed(0), 'pitch', (ap.att.pitch*57.3).toFixed(0), 'thr', fm.throttle.toFixed(2), 'clr', ap._clearance().toFixed(0), 'area', ap._areaClearance().toFixed(0), 'stall', fm.out.stall.toFixed(2), 'pst', v.pitch.toFixed(2));
  }
  if (ac.state !== 'ok') { console.log('CRASH', ac.crashReason); break; }
}
