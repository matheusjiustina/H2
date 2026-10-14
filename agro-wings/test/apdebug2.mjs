import { makeGame } from './apsim.mjs';
import { Autopilot } from '../src/game/autopilot.js';
const game = makeGame('soy');
const ap = new Autopilot(game); ap.engage('contract');
const ac = game.aircraft;
ac.placeAirborne(1500, -200, Math.PI / 2, 40, 45);
ac.fm.hopper = 0; ac.fm.fuel = 150;
ap.set('approach');
const mouse = { buttons: 0, dx: 0, dy: 0, wheel: 0 };
const dt = 1 / 60;
for (let t = 0; t < 400; t += dt) {
  ap.update(dt);
  ac.update(dt, game.input, { mouse, assist: 'normal', windScale: 1 });
  if (Math.floor(t * 60) % 300 === 0) {
    const fm = ac.fm;
    console.log(t.toFixed(0), ap.phase, 'stage', ap.apStage, 'x', fm.pos.x.toFixed(0), 'z', fm.pos.z.toFixed(0), 'agl', fm.out.agl.toFixed(1), 'kt', (fm.out.airspeed*1.944).toFixed(0), 'hdg', ac.headingDeg().toFixed(0), 'bank', (ap.att.bank*57.3).toFixed(0), 'roll', game.input.virtual.roll.toFixed(2), 'gs', fm.out.groundSpeed.toFixed(1), ac.state);
  }
  if (ap.phase === 'service' || ac.state !== 'ok') break;
}
console.log(ap.log.map((l) => `${l.t}:${l.phase}`).join(' '), game.toasts.slice(-5));
