// AT-802A / Fire Boss in the real game (browser): premium lock, aircraft
// selection, spraying, cameras, scooping on the Represa do Norte, a drop on
// the test fires, gear key (U), parking with the whole fleet, page errors.
//   AGRO_URL=http://localhost:5173/ node test/at802e2e.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
const outDir = process.argv[2] || 'at802-e2e';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(600000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=medium', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
const results = {};
const ok = (k, v, info) => { results[k] = { pass: !!v, info }; console.log(v ? 'PASS' : 'FAIL', k, info ?? ''); };
const shot = async (n) => { await page.waitForTimeout(80); await page.screenshot({ path: `${outDir}/${n}.png` }); };
const tick = (s, keys = []) => page.evaluate(({ s, keys }) => { const g = window.__agro; for (let i = 0; i < Math.round(s * 60); i++) g.tick(1 / 60); return true; }, { s, keys });

// 1, 10, 17: catalogue and premium lock.
let r = await page.evaluate(async () => {
  const g = window.__agro;
  const card = document.querySelector('[data-ac="at802f"]'), cardA = document.querySelector('[data-ac="at802"]');
  // Testing phase: the Fire Boss is open (card not locked); the lock is
  // checked with enforcement switched on.
  const openCard = !card?.classList.contains('locked');
  const ex = await import('/src/game/expansions.js');
  ex.setPremiumEnforced(true);
  const before = g.aircraftId;
  const sel = g.selectAircraft('at802f');
  g._activate('at802f');
  const after = g.aircraftId;
  if (after !== before) g._activate(before);
  return { openCard, badge: card?.querySelector('.ac-premium')?.textContent, cardA: !!cardA, sel, before, after, fleet: Object.keys(g.fleet) };
});
ok('catalogue: AT-802A and Fire Boss cards', r.cardA && r.badge, r.badge);
ok('testing phase: Fire Boss card open', r.openCard);
ok('premium enforced: Fire Boss refused (selectAircraft, _activate)', r.sel === false && r.after !== 'at802f', JSON.stringify({ sel: r.sel, after: r.after }));
await page.evaluate(() => { const st = document.createElement('style'); st.id = 'hideui'; st.textContent = '.overlay.title { display: none !important; }'; document.head.appendChild(st); });
await shot('00_title');

// AT-802A: select, base, spray, cameras.
r = await page.evaluate(() => {
  const g = window.__agro;
  g.selectAircraft('at802');
  g.menuAction('free'); g.screens.close();
  g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear');
  g.frozen = true;
  return { id: g.aircraftId, wheels: g.aircraft.fm.out.wheelsOnGround };
});
await tick(2);
await page.evaluate(() => { const g = window.__agro; g.cameraMode = 'orbit'; g.rig.setMode('orbit', g.aircraft); g.rig.orbit.dist = 30; g.render(); });
await tick(0.5); await page.evaluate(() => window.__agro.render());
await shot('01_at802_pad');
ok('AT-802A selected and on the pad', r.id === 'at802', JSON.stringify(r));
r = await page.evaluate(() => {
  const g = window.__agro, ac = g.aircraft;
  ac.placeAirborne(300, -280, Math.PI / 2, 4, 62); ac.fm.hopper = 1500; ac.fm.updateMass();
  g.sprayer.toggle();
  for (let i = 0; i < 120; i++) g.tick(1 / 60);
  return { on: g.sprayer.on, flow: g.sprayer.flowNow, hopper: ac.fm.hopper, mass: ac.fm.mass };
});
ok('spraying works on the AT-802A (flow, hopper going down)', r.on && r.flow > 0 && r.hopper < 1500, JSON.stringify(r));
for (const mode of ['chase', 'cockpit']) {
  await page.evaluate((mode) => { const g = window.__agro; g.cameraMode = mode; g.rig.setMode(mode, g.aircraft); for (let i = 0; i < 30; i++) g.tick(1 / 60); g.aircraft.panel.draw(g.aircraft.instruments()); g.render(); }, mode);
  await shot(`02_at802_${mode}`);
}
await page.evaluate(() => { window.__agro.sprayer.on = false; });

// Fire Boss: unlocked through the entitlement hook (as the platform would).
r = await page.evaluate(async () => {
  const ex = await import('/src/game/expansions.js');
  ex.setEntitlementSource((id) => id === 'expansion.at802f-fireboss');
  const g = window.__agro;
  const sel = g.selectAircraft('at802f');
  return { sel, id: g.aircraftId, fires: g.fires.active, wheels: g.aircraft.fm.out.wheelsOnGround };
});
ok('Fire Boss unlocked → selectable, fire test field active', r.id === 'at802f' && r.fires, JSON.stringify(r));
await tick(1);
await page.evaluate(() => { const g = window.__agro; g.cameraMode = 'orbit'; g.rig.setMode('orbit', g.aircraft); g.rig.orbit.dist = 30; for (let i = 0; i < 10; i++) g.tick(1 / 60); g.render(); });
await shot('03_fireboss_pad');
// Afloat on the reservoir, then a scoop run (keys: T probes, R power).
r = await page.evaluate(() => {
  const g = window.__agro, ac = g.aircraft;
  const ok = ac.placeOnWater(0, -3950, Math.PI / 2);
  for (let i = 0; i < 60; i++) g.tick(1 / 60);
  return { ok, onWater: ac.fm.out.onWater, gear: ac.fm.gearDown, draft: -ac.fm.out.waterClear };
});
ok('Fire Boss afloat on the reservoir (gear up)', r.ok && r.onWater && r.gear === 0, JSON.stringify(r));
await page.evaluate(() => { const g = window.__agro; g.cameraMode = 'chase'; g.rig.setMode('chase', g.aircraft); for (let i = 0; i < 30; i++) g.tick(1 / 60); g.render(); });
await shot('04_fireboss_afloat');
await page.keyboard.press('KeyT');
r = await page.evaluate(() => {
  const g = window.__agro, ac = g.aircraft, fm = ac.fm;
  g.tick(1 / 60);
  const probes = ac.water.probesCmd;
  fm.engine = 'running'; fm.ng = 98; fm.rpm = 1700; fm.throttle = 1;
  fm.vel.set(33, 0, 0);
  const h0 = fm.hopper;
  for (let i = 0; i < 60 * 4; i++) g.tick(1 / 60);
  return { probes, h0, h1: fm.hopper, mass: fm.mass, onWater: fm.out.onWater, kt: fm.out.groundSpeed * 1.944, scooping: ac.water.scooping };
});
await page.evaluate(() => window.__agro.render());
await shot('05_fireboss_scooping');
ok('scooping by key (T): water in, mass up', r.probes && r.h1 > r.h0 + 300, JSON.stringify(r));
// Gear key in flight.
await page.evaluate(() => { const g = window.__agro, ac = g.aircraft; ac.placeAirborne(-600, -3800, -Math.PI / 2, 120, 50); ac.fm.gearDown = 0; ac.fm.gearCmd = false; g.tick(1 / 60); });
await page.keyboard.press('KeyU');
r = await page.evaluate(() => { const g = window.__agro; for (let i = 0; i < 60; i++) g.tick(1 / 60); return { cmd: g.aircraft.fm.gearCmd, pos: g.aircraft.fm.gearDown }; });
ok('gear key (U) in flight: gear comes down', r.cmd === true && r.pos > 0, JSON.stringify(r));
// A drop on fire 2 (key C) from ≈ 35 m.
r = await page.evaluate(() => {
  const g = window.__agro, ac = g.aircraft, fm = ac.fm, f = g.fires.fires[1];
  const gy = g.world.terrain.heightAt(f.x + 160, f.z);
  ac.placeAirborne(f.x + 160, f.z, -Math.PI / 2, 35, 48);
  fm.gearDown = 0; fm.gearCmd = false; fm.hopper = 3000; fm.updateMass();
  for (let i = 0; i < 20; i++) g.tick(1 / 60);
  return { i0: f.intensity, x: fm.pos.x, fx: f.x };
});
await page.keyboard.press('KeyC');
await page.evaluate(() => { const g = window.__agro; for (let i = 0; i < 60 * 1.6; i++) g.tick(1 / 60); g.cameraMode = 'orbit'; g.rig.setMode('orbit', g.aircraft); g.rig.orbit.dist = 55; g.rig.orbit.pitch = 0.25; for (let i = 0; i < 4; i++) g.tick(1 / 60); g.render(); });
await shot('06_fireboss_drop');
r = await page.evaluate((r0) => {
  const g = window.__agro, f = g.fires.fires[1];
  for (let i = 0; i < 60 * 6; i++) g.tick(1 / 60);
  return { ...r0, i1: f.intensity, state: f.state, hopper: g.aircraft.fm.hopper, impacts: g.fires.impacts.length, onTarget: Math.round(g.fires.totalOnTarget) };
}, r);
await page.evaluate(() => window.__agro.render());
await shot('07_fireboss_after_drop');
ok('drop by key (C): water released, fire intensity down', r.hopper < 100 && r.impacts > 0 && r.i1 < r.i0, JSON.stringify(r));
// Cameras on the Fire Boss.
for (const mode of ['chase', 'cockpit', 'orbit']) {
  await page.evaluate((mode) => { const g = window.__agro, ac = g.aircraft; ac.placeAirborne(400, -3000, Math.PI / 2, 80, 50); ac.fm.gearDown = 0; g.cameraMode = mode; g.rig.setMode(mode, ac); if (mode === 'orbit') g.rig.orbit.dist = ac.type.camera.orbit; for (let i = 0; i < 40; i++) g.tick(1 / 60); ac.panel.draw(ac.instruments()); g.render(); }, mode);
  await shot(`08_fireboss_${mode}`);
}
// Whole fleet parked (a helicopter flown): the AT-802s on their own spots.
r = await page.evaluate(() => {
  const g = window.__agro;
  g.selectAircraft('r44');
  for (let i = 0; i < 30; i++) g.tick(1 / 60);
  const P = Object.values(g.fleet).filter((a) => a.parked).map((a) => ({ id: a.type.id, x: +a.fm.pos.x.toFixed(1), z: +a.fm.pos.z.toFixed(1), span: a.A.span ?? 0 }));
  // Any two parked airplanes whose spans overlap at similar x?
  const clash = [];
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    const a = P[i], b = P[j];
    if (Math.abs(a.x - b.x) < 11 && Math.abs(a.z - b.z) < (a.span + b.span) / 2 + 1) clash.push(`${a.id}/${b.id}`);
  }
  return { P, clash, hits: Object.values(g.fleet).some((a) => a.state !== 'ok') };
});
ok('fleet parked with the AT-802s, no overlapping spans', r.clash.length === 0 && !r.hits, JSON.stringify(r.clash));
await page.evaluate(() => { const g = window.__agro; g.cameraMode = 'orbit'; g.camera.position.set(-430, 60, -150); g.camera.lookAt(-440, 0, -70); g.camera.updateProjectionMatrix(); g.render(); });
await page.evaluate(() => { const g = window.__agro; g.frozen = true; g.noRender = true; g.camera.position.set(-420, 70, -175); g.camera.lookAt(-445, 0, -70); g.render(); });
await shot('09_fleet_parked');
// Back to the AT-802A and lock again: the Fire Boss is refused once more.
r = await page.evaluate(async () => {
  const g = window.__agro, ex = await import('/src/game/expansions.js');
  g.selectAircraft('at802');
  ex.setEntitlementSource(null);
  const sel = g.selectAircraft('at802f');
  return { sel, id: g.aircraftId };
});
ok('re-locked: Fire Boss refused again', r.sel === false && r.id === 'at802', JSON.stringify(r));
await page.evaluate(async () => { const ex = await import('/src/game/expansions.js'); ex.setPremiumEnforced(false); });
ok('no page errors', errors.length === 0, JSON.stringify(errors.slice(0, 5)));
fs.writeFileSync(`${outDir}/results.json`, JSON.stringify(results, null, 1));
await browser.close();
