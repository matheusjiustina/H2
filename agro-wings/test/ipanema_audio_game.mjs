// Ipanema engine sound inside the game: the start sequence follows the real
// flight model (state by state), switching to the cockpit crossfades without
// restarting it, the panner follows the camera, selecting another aircraft
// silences it, and coming back does not duplicate anything.
//   AGRO_URL=http://localhost:4173/ node test/ipanema_audio_game.mjs
import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.setDefaultTimeout(600000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.AGRO_URL || 'http://localhost:4173/') + '?q=low', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
let fail = 0;
const check = (ok, msg, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg} ${info}`); if (!ok) fail++; };

const r = await page.evaluate(async () => {
  const g = window.__agro;
  localStorage.clear(); g.career.resetAll(); g.career.tutorialDone = true;
  g.menuAction('free'); g.screens.close();
  g.selectAircraft('ipanema');
  g.audio.start();
  await g.audio.ctx.resume();
  const ipa = g.audio.ipa;
  const dt = 1 / 30;
  // The sim runs faster than real time here; gains are read after letting
  // the audio clock catch up with their ramps.
  const settle = () => new Promise((res) => setTimeout(res, 1200));
  const run = (sec, fn) => { for (let t = 0; t < sec; t += dt) { fn?.(t); g.tick(dt, true); g._audio(dt); } };
  const states = [];
  const rec = () => { if (states.at(-1) !== ipa.state) states.push(ipa.state); };
  const nodes0 = ipa.nodes.length + ipa.sources.length;
  run(0.5, rec);
  g.aircraft.startEngine();
  run(7, rec);
  await settle();
  const idleRpm = g.aircraft.fm.rpm;
  const ext = { ext: ipa.extGain.gain.value, int: ipa.intGain.gain.value };
  // Cockpit: crossfade, same state, same sources.
  g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', g.aircraft);
  const before = ipa.state;
  run(1.5, rec);
  await settle();
  const ck = { ext: ipa.extGain.gain.value, int: ipa.intGain.gain.value, state: ipa.state, before };
  g.cameraMode = 'chase'; g.rig.setMode('chase', g.aircraft);
  run(1.5, rec);
  // Full throttle.
  run(4, () => { g.aircraft.fm.throttle = 1; rec(); });
  await settle();
  const fullRpm = g.aircraft.fm.rpm;
  const gens = { core: ipa.coreG.map((x) => +x.gain.value.toFixed(2)), tip: +ipa.tipGain.gain.value.toFixed(3) };
  g.aircraft.fm.throttle = 0;
  run(3, rec);
  // Another aircraft, then back.
  g.selectAircraft('at502');
  run(1.5);
  await settle();
  const sw = { active: ipa.active, ext: ipa.extGain.gain.value, int: ipa.intGain.gain.value, shots: ipa.oneShots.size, state: ipa.state };
  g.selectAircraft('ipanema');
  run(1.5);
  const back = { state: ipa.state, nodes: ipa.nodes.length + ipa.sources.length };
  // Shutdown sequence from running.
  g.aircraft.startEngine(); run(5, rec);
  g.aircraft.stopEngine(); run(5, rec);
  return { states, idleRpm, fullRpm, ext, ck, gens, sw, back, nodes0, end: ipa.state, ctxState: g.audio.ctx.state };
});
console.log(JSON.stringify(r));
check(['off', 'start_requested', 'starter_active', 'catch', 'idle_stabilization', 'running'].every((s, i) => r.states[i] === s), 'B: start sequence follows the engine', r.states.join('>'));
check(r.ext.ext > 0.9 && r.ext.int < 0.05, 'H: exterior mix in chase view');
check(r.ck.int > 0.4 && r.ck.ext < 0.05 && r.ck.state === r.ck.before, 'G: cockpit crossfade without restarting the sequence');
check(r.fullRpm > 2400 && r.gens.core[2] > 0.5, 'E: high-power layer up at full throttle', JSON.stringify(r.gens));
check(!r.sw.active && r.sw.ext < 0.01 && r.sw.shots === 0, 'J: silent after selecting another aircraft');
check(r.back.nodes === r.nodes0 && r.back.state === 'off', 'J: back on the Ipanema, nothing duplicated');
check(r.end === 'off' && r.states.includes('shutdown'), 'I: shutdown then off');
check(errors.length === 0, 'no page errors', errors.join(' | '));
await browser.close();
process.exit(fail ? 1 : 0);
