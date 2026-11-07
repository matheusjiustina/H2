// Flight key schemes in the browser, with real key codes, for all three
// aircraft: the default numpad scheme (Num 8 / 5 stick forward / back,
// Num 4 / 6 roll left / right, Q / E rudder or pedals) and the secondary
// classic scheme (W/S/A/D, Z/X); Shift / Ctrl power and F engine in both.
// Also the engine hold/tap on each aircraft, the HUD / Controls / Settings
// screens naming the keys, and rebinding not breaking the other scheme.
// Usage: AGRO_URL=... node test/keys.mjs [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'keys-out';
fs.mkdirSync(outDir, { recursive: true });
const url = process.env.AGRO_URL || 'http://localhost:4173/';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url + '?q=low&lang=en', { waitUntil: 'load' }); // English labels are checked below
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 180000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 180000 });

const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };

await page.evaluate(() => { const g = window.__agro; g.frozen = true; g.noRender = true; g.menuAction('free'); g.screens.close?.(); });

const select = (id) => page.evaluate((id) => { const g = window.__agro; g.selectAircraft(id); for (let i = 0; i < 3; i++) g.tick(1 / 60); }, id);
const scheme = (v) => page.evaluate((v) => window.__agro.setSetting('keyScheme', v), v);
// What the aircraft actually reads while `codes` are held: its stick / pedal command.
const command = (codes) => page.evaluate((codes) => {
  const g = window.__agro, ac = g.aircraft;
  for (const c of codes) g.input.press(c);
  g.tick(1 / 60);
  const t = { pitch: ac.target.pitch, roll: ac.target.roll, yaw: ac.target.yaw };
  for (const c of codes) g.input.release(c);
  g.tick(1 / 60);
  return t;
}, codes);
const hold = (code, sec) => page.evaluate(([code, sec]) => {
  const g = window.__agro;
  g.input.press(code);
  g.simulate(sec, 1 / 60);
  g.input.release(code);
  g.simulate(0.1, 1 / 60);
  return g.aircraft.fm.engine;
}, [code, sec]);
const engine = () => page.evaluate(() => window.__agro.aircraft.fm.engine);

// Pitch is + for stick back (aft), roll + right, yaw + right.
const NUMPAD = [['Numpad8', { pitch: -1 }], ['Numpad5', { pitch: 1 }], ['Numpad4', { roll: -1 }], ['Numpad6', { roll: 1 }], ['KeyQ', { yaw: -1 }], ['KeyE', { yaw: 1 }]];
const CLASSIC = [['KeyW', { pitch: -1 }], ['KeyS', { pitch: 1 }], ['KeyA', { roll: -1 }], ['KeyD', { roll: 1 }], ['KeyZ', { yaw: -1 }], ['KeyX', { yaw: 1 }]];
const matches = async (list) => {
  const bad = [];
  for (const [code, want] of list) {
    const t = await command([code]);
    for (const k of ['pitch', 'roll', 'yaw']) if (Math.abs(t[k] - (want[k] ?? 0)) > 1e-6) bad.push(`${code}: ${k} ${t[k]}`);
  }
  return bad;
};
const inert = async (codes) => {
  const bad = [];
  for (const code of codes) { const t = await command([code]); if (t.pitch || t.roll || t.yaw) bad.push(code); }
  return bad;
};

const NAMES = { ipanema: 'PR-AGW', at502: 'AT-502B', r44: 'R44' };
for (const id of ['ipanema', 'at502', 'r44']) {
  const n = NAMES[id];
  await select(id);
  // Engine, at the pad with the engine off: F in both schemes (Q is the left
  // rudder in the numpad scheme: a tap on it must not shut the engine down).
  for (const sc of ['numpad', 'classic']) {
    await scheme(sc);
    const e0 = await hold('KeyQ', 0.8);
    const e1 = await hold('KeyF', 0.8);
    const eq = await hold('KeyQ', 0.1);
    const ef = await hold('KeyF', 0.1);
    check(`${n} (${sc}): holding Q does not start the engine, holding F does; tapping Q leaves it running, tapping F stops it`,
      e0 === 'off' && e1 !== 'off' && eq !== 'off' && ef === 'off', `${e0} / ${e1} / ${eq} / ${ef}`);
  }

  // Stick, rudder and power, airborne (E is also the service key at the pad).
  await page.evaluate((id) => { const ac = window.__agro.aircraft; if (id === 'r44') ac.placeAirborne(-250, -46, Math.PI / 2, 60, 0); else ac.placeAirborne(0, -300, Math.PI / 2, 150, 48); }, id);
  await scheme('numpad');
  let bad = [...await matches(NUMPAD), ...await inert(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyZ', 'KeyX'])];
  check(`${n}: numpad scheme is the default — Num 8/5 stick, Num 4/6 roll, Q/E rudder; W/S/A/D/Z/X do nothing`, bad.length === 0, bad.join('; '));
  await scheme('classic');
  bad = [...await matches(CLASSIC), ...await inert(['Numpad8', 'Numpad5', 'Numpad4', 'Numpad6'])];
  check(`${n}: classic scheme — W/S/A/D, Z/X; the numpad keys do nothing`, bad.length === 0, bad.join('; '));
  const pw = [];
  for (const sc of ['numpad', 'classic']) {
    await scheme(sc);
    pw.push(await page.evaluate(() => {
      const g = window.__agro, ac = g.aircraft, get = () => (ac.kind === 'heli' ? ac.lever : ac.fm.throttle);
      ac.kind === 'heli' ? (ac.lever = 0.5) : (ac.fm.throttle = 0.5);
      const a = get();
      g.input.press('ShiftLeft'); for (let i = 0; i < 20; i++) g.tick(1 / 60); g.input.release('ShiftLeft');
      const up = get();
      g.input.press('ControlLeft'); for (let i = 0; i < 20; i++) g.tick(1 / 60); g.input.release('ControlLeft');
      return up > a && get() < up;
    }));
  }
  check(`${n}: Shift raises and Ctrl lowers the power in both schemes`, pw.every(Boolean), JSON.stringify(pw));
}

// --- screens ------------------------------------------------------------------------
await select('ipanema');
await scheme('numpad');
const scr = await page.evaluate(() => {
  const g = window.__agro;
  const out = { engineKey: g.hud.key('engine'), yawKey: g.hud.key('yawLeft') };
  g.screens.help();
  out.help = document.querySelector('.helpgrid')?.textContent || '';
  out.sub = document.querySelector('.modal .sub')?.textContent || '';
  g.screens.close();
  g.screens.settings();
  out.settings = document.querySelector('.modal .panel')?.textContent || '';
  out.seg = [...document.querySelectorAll('.seg[data-key="keyScheme"] button')].map((b) => `${b.textContent}${b.classList.contains('on') ? '*' : ''}`);
  g.screens.close();
  return out;
});
check('HUD and the Controls screen name the numpad keys (Num 8 / Num 5 / Num 4 / Num 6, Q, E, I, Shift, Ctrl)',
  scr.engineKey.includes('>F<') && scr.yawKey.includes('>Q<') && /Pitch down[^N]*Num 8/.test(scr.help) && /Pitch up[^N]*Num 5/.test(scr.help)
  && /Roll left[^N]*Num 4/.test(scr.help) && /Roll right[^N]*Num 6/.test(scr.help) && /Rudder left[^Q]*Q/.test(scr.help) && /Shift/.test(scr.help) && /Ctrl/.test(scr.help),
  scr.help.slice(0, 200));
check('Settings offers both schemes (numpad selected) and lists their keys', scr.seg.length === 2 && scr.seg[0].endsWith('*') && /numpad scheme/i.test(scr.settings) && /classic scheme/i.test(scr.settings) && scr.settings.includes('Num 8'), JSON.stringify(scr.seg));
await page.evaluate(() => { const g = window.__agro; g.screens.settings(); });
await page.screenshot({ path: `${outDir}/settings.png` });
await page.evaluate(() => { const el = document.querySelector('.modal .panel'); el.scrollTop = el.scrollHeight; });
await page.screenshot({ path: `${outDir}/settings_keys.png` });
await page.evaluate(() => { const g = window.__agro; g.screens.close(); g.screens.help(); });
await page.screenshot({ path: `${outDir}/help.png` });
await page.evaluate(() => window.__agro.screens.close());

// --- the choice is saved; rebinding one scheme leaves the other alone -------------------
await scheme('classic');
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('agrowings.settings.v1')).keyScheme);
check('the chosen scheme is saved', saved === 'classic', saved);
await scheme('numpad');
const reb = await page.evaluate(() => {
  const g = window.__agro, i = g.input;
  i.rebind('nPitchDown');
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  const r = { num: i.bindings.nPitchDown.slice(), classic: i.bindings.pitchDown.slice(), rudder: i.bindings.nYawRight.slice(), interact: i.bindings.interact.slice(), engine: i.bindings.engine.slice(), yl: i.bindings.nYawLeft.slice() };
  i.resetBindings();
  r.after = i.bindings.nPitchDown.slice();
  return r;
});
check('rebinding a numpad key leaves the classic keys alone; E stays shared with service',
  reb.num[0] === 'KeyW' && reb.classic.includes('KeyW') && reb.rudder[0] === 'KeyE' && reb.interact[0] === 'KeyE' && reb.engine[0] === 'KeyF' && reb.yl[0] === 'KeyQ' && reb.after[0] === 'Numpad8', JSON.stringify(reb));

const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} checks passed`);
console.log('errors', errors.length, errors.slice(0, 5));
fs.writeFileSync(`${outDir}/results.json`, JSON.stringify({ results, errors }, null, 1));
await browser.close();
process.exit(pass === results.length && !errors.length ? 0 : 1);
