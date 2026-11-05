// On-foot mode (PilotFreeRoamSystem) in Chromium: exit / walk / collide /
// board at the main base, on the strip, at a secondary farm, with a
// helicopter; hidden in flight and while rolling; repeated exits (memory);
// frame time parked vs on foot. Screenshots to <outDir>.
//   AGRO_URL=http://localhost:5173/ node test/freeroam.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'freeroam-out';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=medium', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });

const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); console.log(ok ? 'PASS' : 'FAIL', name, info !== undefined ? JSON.stringify(info) : ''); };
// Run n ticks of the real loop (no rendering).
await page.evaluate(() => {
  const g = window.__agro;
  window.__run = (sec, dt = 1 / 30) => { for (let i = 0; i < sec / dt; i++) g.tick(dt); };
  window.__fr = () => { const f = g.freeRoam; return { state: f.state, btn: f._btnKind, x: +f.pos.x.toFixed(2), z: +f.pos.z.toFixed(2), y: +f.pos.y.toFixed(2) }; };
  g.frozen = true; // the test drives the loop
  window.__acs = () => { const a = g.aircraft, fm = a.fm; return { id: g.aircraftId, x: +fm.pos.x.toFixed(3), y: +fm.pos.y.toFixed(3), z: +fm.pos.z.toFixed(3), q: fm.quat.toArray().map((v) => +v.toFixed(4)), fuel: +fm.fuel.toFixed(2), hop: +fm.hopper.toFixed(2), dmg: a.damage, eng: fm.engine, cam: g.cameraMode, rig: g.rig.mode }; };
  g.noRender = true;
});
const snap = async (name) => {
  await page.evaluate(() => { const g = window.__agro; g.noRender = false; g.render(); g.noRender = true; });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${outDir}/${name}.png` });
};
const run = (s) => page.evaluate((s) => window.__run(s), s);
const fr = () => page.evaluate(() => window.__fr());
const acs = () => page.evaluate(() => window.__acs());
const key = (code, sec) => page.evaluate(([code, sec]) => { const g = window.__agro; g.input.press(code); window.__run(sec); g.input.release(code); }, [code, sec]);

// --- 1. Main base, at the pad ---------------------------------------------
await page.evaluate(() => { const g = window.__agro; g.selectAircraft('ipanema'); g.menuAction('free'); g.screens.close(); });
await run(1.5);
let s = await fr();
check('1 exit button shows at the pad (engine off, stopped)', s.btn === 'exit', s);
const tickMs = () => page.evaluate(() => { const g = window.__agro; const t0 = performance.now(); for (let i = 0; i < 120; i++) g.tick(1 / 60); return (performance.now() - t0) / 120; });
const perfIn = await tickMs();
const before = await acs();
await page.evaluate(() => window.__agro.freeRoam._press());
await run(0.6);
s = await fr();
const d0 = await page.evaluate(() => { const g = window.__agro, f = g.freeRoam, p = g.aircraft.fm.pos; return { dist: +Math.hypot(f.pos.x - p.x, f.pos.z - p.z).toFixed(2), blocked: f._blocked(f.pos.x, f.pos.z, f.pos.y), hit: g.aircraft.hitTest(f.pos.x, f.pos.y + 1, f.pos.z) }; });
check('1 got out: on foot beside the aircraft, not inside it', s.state === 'PILOT_ON_FOOT' && d0.dist > 0.8 && d0.dist < 6 && !d0.blocked && !d0.hit, { ...s, ...d0 });
await snap('01-exit');
check('13 flight keys ignored on foot (engine key does nothing)', await page.evaluate(() => { const g = window.__agro; g.input.press('KeyF'); window.__run(2); g.input.release('KeyF'); return g.aircraft.fm.engine === 'off'; }));
// Walk forward 4 s (W) and with the numpad / arrows.
const p0 = await fr();
await key('KeyW', 3);
const p1 = await fr();
check('6 W walks (≈2.6 m/s)', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 6.5, { from: p0, to: p1 });
await key('Numpad8', 1.5); const p2 = await fr();
await key('ArrowUp', 1.5); const p3 = await fr();
check('6 Numpad 8 and the arrow keys walk too', Math.hypot(p2.x - p1.x, p2.z - p1.z) > 1 && Math.hypot(p3.x - p2.x, p3.z - p2.z) > 1, { p2, p3 });
await snap('02-walk');
const runR = await page.evaluate(() => { const g = window.__agro, f = g.freeRoam, x0 = f.pos.x, z0 = f.pos.z, thr = g.aircraft.fm.throttle; g.input.press('ShiftLeft'); g.input.press('KeyW'); window.__run(2); g.input.release('KeyW'); g.input.release('ShiftLeft'); window.__run(0.5); return { d: +Math.hypot(f.pos.x - x0, f.pos.z - z0).toFixed(2), thrSame: g.aircraft.fm.throttle === thr }; });
check('Shift runs on foot (≈5.5 m/s) and leaves the aircraft throttle alone', runR.d > 9 && runR.thrSame, runR);
check('13 aircraft did not move while on foot', JSON.stringify((({ x, y, z, q }) => ({ x, y, z, q }))(await acs())) === JSON.stringify((({ x, y, z, q }) => ({ x, y, z, q }))(before)));
// Board button far away: hidden.
s = await fr();
check('10 no board button away from the own aircraft', s.btn === null, s);

// --- 8. Hangar walls: walk into the side wall from inside ------------------
const wall = await page.evaluate(() => {
  const g = window.__agro, f = g.freeRoam, h = { x: -385, z: -132, w: 34, d: 24 };
  f.pos.set(h.x, 0.2, h.z + 4); f._refreshNear(f.pos.x, f.pos.z);
  f.cam.yaw = -Math.PI / 2; // look toward -x: walk to the west wall
  g.input.press('KeyW'); window.__run(12); g.input.release('KeyW');
  return { x: +f.pos.x.toFixed(2), wallX: h.x - h.w / 2 };
});
check('8 stops at the hangar wall (does not walk through)', wall.x > wall.wallX + 0.2, wall);
await snap('03-hangar');
// Parked aircraft: walk into the AgTruck / Thrush spot from the south.
const parked = await page.evaluate(() => {
  const g = window.__agro, f = g.freeRoam;
  const p = g._parked.find((a) => a.kind !== 'heli' && a.model.root.visible !== false);
  f.pos.set(p.fm.pos.x, 0, p.fm.pos.z + 12); f.pos.y = f._floor(f.pos.x, f.pos.z); f._refreshNear(f.pos.x, f.pos.z);
  f.cam.yaw = Math.PI; // look toward -z (the aircraft)
  g.input.press('KeyW'); window.__run(12); g.input.release('KeyW');
  const hit = p.hitTest(f.pos.x, f.pos.y + 1, f.pos.z) || p.hitTest(f.pos.x, f.pos.y + 0.4, f.pos.z);
  return { reg: p.type.reg, d: +Math.hypot(f.pos.x - p.fm.pos.x, f.pos.z - p.fm.pos.z).toFixed(2), inside: hit, btn: f._btnKind };
});
check('8 stops at a parked aircraft, no board button there', !parked.inside && parked.btn === null, parked);
await snap('04-parked');
// Near the badeco / truck area.
const crew = await page.evaluate(() => { const g = window.__agro, f = g.freeRoam; f.pos.set(-350, 0, -84); f.pos.y = f._floor(-350, -84); f._refreshNear(-350, -84); window.__run(1); return { ok: f.state === 'PILOT_ON_FOOT' }; });
check('9 walking by the crew post and tanks', crew.ok);
await snap('05-crew');
// Edge of the base: cannot walk across the map.
const edge = await page.evaluate(() => { const g = window.__agro, f = g.freeRoam; f.pos.set(400, 0, 0); f.pos.y = f._floor(400, 0); f.cam.yaw = Math.PI / 2; g.input.press('KeyW'); window.__run(200, 1 / 20); g.input.release('KeyW'); return { x: +f.pos.x.toFixed(1), limit: f.zone.cx + f.zone.hw + 120 }; });
check('8 explore limit holds (no walk across the map)', edge.x <= edge.limit + 0.5, edge);
// Back to the aircraft door and board with the button.
const back = await page.evaluate(() => {
  const g = window.__agro, f = g.freeRoam;
  const d = f._doorPoint(g.aircraft, new (g.camera.position.constructor)());
  const spot = f._findExitSpot(g.aircraft);
  f.pos.set(spot.x, spot.y, spot.z); f._refreshNear(spot.x, spot.z);
  window.__run(0.5);
  return { btn: f._btnKind, d: +Math.hypot(f.pos.x - d.x, f.pos.z - d.z).toFixed(2) };
});
check('11 board button by the own aircraft', back.btn === 'board', back);
await page.evaluate(() => window.__agro.freeRoam._press());
const after = await acs(); // at the moment of boarding
await run(0.5);
s = await fr();
check('12 back in: state, camera restored, aircraft untouched', s.state === 'PILOT_IN_AIRCRAFT' && after.rig === before.rig && after.cam === before.cam && JSON.stringify({ ...after, eng: 0 }) === JSON.stringify({ ...before, eng: 0 }), { before, after });

// --- 5/6. Hidden in flight and while rolling -------------------------------
const air = await page.evaluate(() => { const g = window.__agro; g.aircraft.placeAirborne(-200, -280, Math.PI / 2, 120, 45); window.__run(1); return g.freeRoam._btnKind; });
check('5 no exit button in flight (over the base)', air === null, air);
const air2 = await page.evaluate(() => { const g = window.__agro; g.aircraft.placeAirborne(-350, -60, Math.PI / 2, 40, 45); window.__run(0.6); return g.freeRoam._btnKind; });
check('5 no exit button flying low over the apron', air2 === null, air2);
const roll = await page.evaluate(() => { const g = window.__agro; g.aircraft.placeOnRunway('west'); const fm = g.aircraft.fm; fm.vel.set(4, 0, 0); g.freeRoam.checkT = 0; g.freeRoam.update(0.01, null, true); return { btn: g.freeRoam._btnKind, gs: +fm.out.groundSpeed.toFixed(2) }; });
check('6 no exit button while rolling', roll.btn === null, roll);
// Engine running and stopped on the strip: hidden, with the hint.
const engOn = await page.evaluate(() => { const g = window.__agro; g.aircraft.placeOnRunway('west'); g.aircraft.fm.engine = 'running'; window.__run(1); const b = g.freeRoam._btnKind; g.aircraft.fm.engine = 'off'; return b; });
check('3 no exit button with the engine running', engOn === null, engOn);

// --- 2. Points along the strip ------------------------------------------------
for (const x of [-380, 0, 380]) {
  const r = await page.evaluate((x) => { const g = window.__agro; g.aircraft.placeParked(x, 0, Math.PI / 2); window.__run(1); const ok = g.freeRoam._btnKind === 'exit'; const e = g.freeRoam.exit(); window.__run(0.6); const st = g.freeRoam.state; g.freeRoam.forceBoard(); window.__run(0.3); return { ok, e, st }; }, x);
  check(`2 exit on the strip at x=${x}`, r.ok && r.e && r.st === 'PILOT_ON_FOOT', r);
}

// --- 4. Secondary farm ------------------------------------------------------
const farm = await page.evaluate(() => {
  const g = window.__agro; const s = g.sites.find((x) => x.id === 'serradocedro');
  g.service.setSite(s); g.aircraft.placeAtPad(s); window.__run(1.5);
  const ok = g.freeRoam._btnKind === 'exit'; const e = g.freeRoam.exit(); window.__run(0.6);
  const f = g.freeRoam, y0 = f.pos.y;
  f.cam.yaw = 0.4; g.input.press('KeyW'); window.__run(4); g.input.release('KeyW');
  return { site: s.id, ok, e, st: f.state, zone: f.zone?.id, walked: +Math.hypot(f.pos.x - s.pad.x, f.pos.z - s.pad.z).toFixed(1), dy: +(f.pos.y - y0).toFixed(2), onGround: Math.abs(f.pos.y - g.world.terrain.heightAt(f.pos.x, f.pos.z)) < 0.2 };
});
check('4 exit at a secondary farm (Serra do Cedro, sloping strip)', farm.ok && farm.e && farm.st === 'PILOT_ON_FOOT' && farm.zone === 'serradocedro', farm);
check('7 walks on uneven ground (feet on the terrain)', farm.onGround, farm);
await snap('06-farm');
await page.evaluate(() => { const g = window.__agro; g.freeRoam.forceBoard(); const m = g.sites.find((x) => x.main); g.service.setSite(m); g.aircraft.placeAtPad(m); window.__run(0.5); });

// --- Helicopter -------------------------------------------------------------
const heli = await page.evaluate(() => {
  const g = window.__agro; g.selectAircraft('r44'); g.menuAction('free'); g.screens.close(); window.__run(1.5);
  const ok = g.freeRoam._btnKind === 'exit'; const e = g.freeRoam.exit(); window.__run(0.6);
  const f = g.freeRoam, p = g.aircraft.fm.pos;
  return { ok, e, st: f.state, d: +Math.hypot(f.pos.x - p.x, f.pos.z - p.z).toFixed(2), hit: g.aircraft.hitTest(f.pos.x, f.pos.y + 1, f.pos.z) };
});
check('1 exit from the R44 on the helipad', heli.ok && heli.e && heli.st === 'PILOT_ON_FOOT' && !heli.hit, heli);
await snap('07-heli');
await page.evaluate(() => { window.__agro.freeRoam.forceBoard(); window.__run(0.3); window.__agro.selectAircraft('ipanema'); window.__agro.menuAction('free'); window.__agro.screens.close(); window.__run(1.5); });

// --- 17/18. Repeated exits, memory -----------------------------------------
const mem = await page.evaluate(() => {
  const g = window.__agro, info = () => ({ geo: g.renderer.info.memory.geometries, tex: g.renderer.info.memory.textures, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, kids: g.scene.children.length });
  window.__run(1); if (window.gc) window.gc();
  const a = info();
  let ok = 0;
  for (let i = 0; i < 30; i++) { if (g.freeRoam.exit()) ok++; window.__run(0.6); const f = g.freeRoam; const sp = f._findExitSpot(g.aircraft); f.pos.set(sp.x, sp.y, sp.z); window.__run(0.2); f.board(); window.__run(0.3); }
  if (window.gc) window.gc();
  const b = info();
  return { a, b, ok, state: g.freeRoam.state, figures: g.scene.getObjectByName('pilot-on-foot') ? 1 : 0 };
});
check('17 30 exit/board cycles', mem.ok === 30 && mem.state === 'PILOT_IN_AIRCRAFT' && mem.figures === 0, mem);
check('18 no growth in geometries / textures / scene nodes after the first exit', mem.b.geo <= mem.a.geo + 0 && mem.b.tex <= mem.a.tex && mem.b.kids === mem.a.kids, mem);

// --- 14. Mission continuity: a job's coverage and the load survive a walk
const job = await page.evaluate(() => {
  const g = window.__agro; g.mode = 'career'; const j = g.career.job('school-1'); g.setJob(j);
  for (let i = 0; i < 400; i++) j.coverages[0].dose[i] = 1;
  const a = { id: g.job.c.id, cov: j.stats().coverage, fuel: g.aircraft.fm.fuel, hop: g.aircraft.fm.hopper };
  g.freeRoam.exit(); window.__run(0.6); const f = g.freeRoam; const sp = f._findExitSpot(g.aircraft); f.pos.set(sp.x, sp.y, sp.z); window.__run(0.2); f.board(); window.__run(0.3);
  const b = { id: g.job?.c.id, cov: g.job.stats().coverage, fuel: g.aircraft.fm.fuel, hop: g.aircraft.fm.hopper };
  g.setJob(null); g.mode = 'free'; return { a, b };
});
check('14 job, coverage, fuel and hopper kept across a walk', JSON.stringify(job.a) === JSON.stringify(job.b), job);
// --- Take-off after boarding (on the strip, engine started with the normal keys)
const tko = await page.evaluate(() => {
  const g = window.__agro, ac = g.aircraft; ac.placeOnRunway('west'); window.__run(1);
  g.freeRoam.exit(); window.__run(0.6); const f = g.freeRoam; const sp = f._findExitSpot(ac); f.pos.set(sp.x, sp.y, sp.z); window.__run(0.3); f.board(); window.__run(0.3);
  g.input.press('KeyF'); window.__run(3); g.input.release('KeyF'); window.__run(2);
  g.input.press('ShiftLeft'); window.__run(4); g.input.release('ShiftLeft');
  let maxAgl = 0, t = 0;
  for (; t < 60 && maxAgl < 8; t += 0.5) { if (ac.fm.out.airspeed > 28) g.input.press('Numpad5'); window.__run(0.5); maxAgl = Math.max(maxAgl, ac.fm.out.onGround ? 0 : ac.fm.out.agl); }
  g.input.release('Numpad5');
  return { engine: ac.fm.engine, maxAgl: +maxAgl.toFixed(1), kt: Math.round(ac.fm.out.airspeed * 1.944), t, state: ac.state };
});
check('take-off after boarding: engine starts with F, climbs away', tko.engine === 'running' && tko.maxAgl > 5 && tko.state === 'ok', tko);
await page.evaluate(() => { const g = window.__agro; g.menuAction('free'); g.screens.close(); window.__run(1.5); });
// --- 20. CPU cost: the game's tick (no rendering) parked in the aircraft vs walking
const perfFoot = await page.evaluate(() => {
  const g = window.__agro; g.freeRoam.exit(); window.__run(0.6); g.input.press('KeyW');
  const t0 = performance.now(); for (let i = 0; i < 120; i++) g.tick(1 / 60); const ms = (performance.now() - t0) / 120;
  g.input.release('KeyW'); return ms;
});
const draw = await page.evaluate(() => { const g = window.__agro, f = g.freeRoam, c = g.camera; return { eyeAboveFeet: +(c.position.y - f.pos.y).toFixed(2), camAtPilot: +Math.hypot(c.position.x - f.pos.x, c.position.z - f.pos.z).toFixed(3), model: !!g.scene.getObjectByName('pilot-on-foot') }; });
check('first person: camera at the eye (1.65 m), no character model', Math.abs(draw.eyeAboveFeet - 1.65) < 0.05 && draw.camAtPilot < 0.01 && !draw.model, draw);
const perfIn2 = await page.evaluate(() => { const g = window.__agro; g.freeRoam.forceBoard(); window.__run(0.3); const t0 = performance.now(); for (let i = 0; i < 120; i++) g.tick(1 / 60); return (performance.now() - t0) / 120; });
const cost = await page.evaluate(() => {
  const g = window.__agro, f = g.freeRoam;
  const t0 = performance.now(); for (let i = 0; i < 400; i++) { f.checkT = 0; f.update(1 / 60, null, true); } const inMs = (performance.now() - t0) / 400;
  f.exit(); window.__run(0.6); g.input.press('KeyW');
  const t1 = performance.now(); for (let i = 0; i < 400; i++) f.update(1 / 60, { buttons: 0, dx: 0, dy: 0, wheel: 0 }, true); const footMs = (performance.now() - t1) / 400;
  g.input.release('KeyW'); f.forceBoard();
  return { exitCheckMs: +inMs.toFixed(4), footUpdateMs: +footMs.toFixed(4) };
});
console.log('PERF', JSON.stringify({ tickMsInAircraft: +perfIn.toFixed(2), tickMsInAircraftAfter: +perfIn2.toFixed(2), tickMsOnFoot: +perfFoot.toFixed(2), ...cost, view: draw }));
check('20 on-foot update under 0.5 ms per frame; exit check under 0.5 ms (run 4×/s)', cost.footUpdateMs < 0.5 && cost.exitCheckMs < 0.5, cost);
check('no page errors', errors.length === 0, errors.slice(0, 5));
// --- 16. Mobile: touch layout, walking joystick
{
  const ctx = await browser.newContext({ viewport: { width: 915, height: 412 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const m = await ctx.newPage();
  m.on('pageerror', (e) => errors.push('mobile: ' + e.message));
  await m.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=low', { waitUntil: 'load' });
  await m.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
  const r = await m.evaluate(() => {
    const g = window.__agro; g.frozen = true; g.noRender = true; const run = (s) => { for (let i = 0; i < s * 30; i++) g.tick(1 / 30); };
    g.selectAircraft('ipanema'); g.menuAction('free'); g.screens.close(); run(1.5);
    const b = document.querySelector('.foot-btn'); const r1 = b.getBoundingClientRect();
    const btnShown = !b.hidden && r1.width > 0, touch = g.touch.active;
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); run(0.6);
    const f = g.freeRoam, p0 = { x: f.pos.x, z: f.pos.z };
    g.touch.walk.x = 0; g.touch.walk.y = -1; run(2); g.touch.walk.y = 0;
    const walked = Math.hypot(f.pos.x - p0.x, f.pos.z - p0.z);
    const stick = getComputedStyle(document.querySelector('.t-stick')).display, thr = getComputedStyle(document.querySelector('.t-thr')).display, spray = getComputedStyle(document.querySelector('.t-btns')).display;
    g.noRender = false; g.render(); g.noRender = true;
    return { touch, btnShown, btnSize: [Math.round(r1.width), Math.round(r1.height)], state: f.state, walked: +walked.toFixed(2), stick, thr, spray };
  });
  await m.waitForTimeout(200);
  await m.screenshot({ path: `${outDir}/08-mobile.png` });
  check('16 mobile: button ≥ 44 px tall, joystick walks, flight controls hidden', r.touch && r.btnShown && r.btnSize[1] >= 44 && r.state === 'PILOT_ON_FOOT' && r.walked > 2 && r.stick === 'block' && r.thr === 'none' && r.spray === 'none', r);
  await ctx.close();
}
fs.writeFileSync(`${outDir}/results.json`, JSON.stringify(results, null, 1));
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
await browser.close();
