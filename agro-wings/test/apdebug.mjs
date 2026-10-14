import { makeGame } from './apsim.mjs';
import { Autopilot } from '../src/game/autopilot.js';
const game = makeGame('soy');
const ap = new Autopilot(game); ap.engage('contract');
const ac = game.aircraft; ac.placeOnRunway('west'); ac.fm.engine = 'running'; ac.fm.rpm = 800; ac.fm.hopper = 820; ac.fm.fuel = 160;
ap.set('lineup');
const mouse = { buttons: 0, dx: 0, dy: 0, wheel: 0 };
let lastSpray = false, lastPhase = '';
const dt = 1 / 60;
for (let t = 0; t < 400; t += dt) {
  ap.update(dt);
  ac.update(dt, game.input, { mouse, assist: 'normal', windScale: 1 });
  game.guidance.update(dt);
  const fm = ac.fm;
  if (game.sprayer.on !== lastSpray) {
    lastSpray = game.sprayer.on;
    const cross = fm.pos.z - (ap.pass ? ap.pass.c : 0);
    console.log(`${t.toFixed(1)} spray ${lastSpray ? 'ON ' : 'off'} x ${fm.pos.x.toFixed(0)} z ${fm.pos.z.toFixed(1)} cross ${cross.toFixed(1)} hgt ${ac.workHeight().toFixed(1)}`);
  }
  if (ap.phase !== lastPhase) {
    lastPhase = ap.phase;
    if (ap.phase === 'turnOut') {
      game.guidance.refresh();
      console.log(`${t.toFixed(1)} turnOut; passes done: ${game.guidance.passes.map((p) => p.done.toFixed(2)).join(' ')}`);
    }
  }
}
