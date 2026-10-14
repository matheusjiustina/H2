import { makeGame } from './apsim.mjs';
import { Autopilot } from '../src/game/autopilot.js';
const game = makeGame('soy');
const ap = new Autopilot(game); ap.engage('contract');
const ac = game.aircraft;
ac.fm.settleOnGround(-385, 0, -Math.PI / 2, ac.env);
ac._afterPlace();
ac.fm.engine = 'running'; ac.fm.rpm = 700; ac.fm.hopper = 0; ac.fm.fuel = 150;
ap.set('taxiIn');
ap.wp = [[-382, -14], [-382, -36], [-372, -60], [-364, -64], [-352, -64]];
const mouse = { buttons: 0, dx: 0, dy: 0, wheel: 0 };
const dt = 1 / 60;
for (let t = 0; t < 120; t += dt) {
  ap.update(dt);
  ac.update(dt, game.input, { mouse, assist: 'normal', windScale: 1 });
  if (Math.floor(t * 60) % 60 === 0) {
    const fm = ac.fm, v = game.input.virtual;
    const tgt = ap.wp[ap.wi ?? 0] || [0, 0];
    console.log(t.toFixed(0), ap.phase, 'wi', ap.wi, 'x', fm.pos.x.toFixed(1), 'z', fm.pos.z.toFixed(1), 'hdg', ac.headingDeg().toFixed(0), 'd', Math.hypot(tgt[0]-fm.pos.x, tgt[1]-fm.pos.z).toFixed(1), 'yaw', v.yaw.toFixed(2), 'brk', v.brake, 'thr', (v.throttle ?? 0).toFixed(2), 'gs', fm.out.groundSpeed.toFixed(1), 'steer', fm.gear[2].steerAngle.toFixed(2), 'rud', fm.rudder.toFixed(2));
  }
  if (ap.phase !== 'taxiIn') { console.log('phase ->', ap.phase); break; }
}
