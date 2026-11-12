// Serra das Bananeiras in the browser: the map loads from the stored choice,
// a banana order is flown from the base (GPS, coverage, hand-in), the two
// farm strips take the crew and their requests, take-offs from the three
// strips, and the map switch both ways
// with the career kept.
//   node test/serrae2e.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'serra-out';
fs.mkdirSync(outDir, { recursive: true });
const url = process.env.AGRO_URL || 'http://localhost:5173/';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'],
});
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`); };
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(600000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const ready = () => page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
const shot = async (name) => { await page.evaluate(() => { const g = window.__agro; g.tick(1 / 60); g.render(); }); await page.waitForTimeout(500); await page.screenshot({ path: `${outDir}/${name}.png`, timeout: 180000 }); };
const mapInfo = () => page.evaluate(() => {
  const g = window.__agro, T = g.world.terrain;
  return { fields: g.sprayer?.fields?.length ?? document.title.length, sites: g.sites.map((s) => s.id), crops: [...new Set(g.career.contracts ? [] : [])], bananas: !!g.world.bananas, h: Math.round(T.heightAt(-1700, -1640)), money: g.career.money };
});

// --- Main map first: a career with money, then choose the Serra in the UI.
await page.goto(url + '?q=low', { waitUntil: 'load' });
await ready();
await page.evaluate(() => { localStorage.clear(); const g = window.__agro; g.career.resetAll(); g.career.tutorialDone = true; g.career.money = 4321; g.career.save(); });
const main0 = await mapInfo();
check('main map by default', !main0.bananas && main0.sites.length > 3, JSON.stringify(main0).slice(0, 140));
await page.evaluate(() => window.__agro.screens.expansions());
await shot('map-selector');
const rows = await page.evaluate(() => [...document.querySelectorAll('[data-map]')].map((b) => [b.dataset.map, b.disabled, b.textContent.trim()]));
check('map selector lists the Serra', rows.some((r) => r[0] === 'serra' && !r[1]), JSON.stringify(rows));
let t0 = Date.now();
await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 120000 }), page.evaluate(() => document.querySelector('[data-map="serra"]').click())]);
await ready();
const toSerra = (Date.now() - t0) / 1000;
const s0 = await mapInfo();
check('Serra loaded after the switch (stored choice, page reload)', s0.bananas && s0.sites.join() === 'main,baixadao,pistadaserra', JSON.stringify(s0));
check('career kept across the switch', s0.money === 4321, String(s0.money));
console.log(`INFO switch main -> serra ${toSerra.toFixed(1)} s (SwiftShader)`);

// --- Board and a base order.
await page.evaluate(() => { const g = window.__agro; g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear'); g.menuAction('career'); });
await shot('board');
const board = await page.evaluate(() => [...document.querySelectorAll('[data-id], [data-contract]')].map((b) => b.dataset.id || b.dataset.contract));
const ids = await page.evaluate(() => window.__agro.career.contracts?.().map((c) => c.id) ?? null);
console.log('INFO board', JSON.stringify(board).slice(0, 200), JSON.stringify(ids)?.slice(0, 120));
const acc = await page.evaluate(() => { const g = window.__agro; g.screens.close(); g.selectContract('sb-01'); return { job: g.job?.c.id, title: g.job?.c.title, fields: g.job?.fields.map((f) => f.name), open: g.screens.open, nav: g.guidance.navTarget?.()?.name ?? null }; });
check('banana order accepted at the base, load sheet open', acc.job === 'sb-01' && acc.fields.length >= 1 && acc.open === 'load', JSON.stringify(acc));
await shot('loadsheet');
const svc = await page.evaluate(() => {
  const g = window.__agro; g.screens.close();
  const rec = g.job.c.recommended; g.aircraft.fm.fuel = 40; g.aircraft.fm.hopper = 0;
  g.requestService(rec.fuel, rec.liquid); g.simulate(500, 1 / 20, () => g.service.state !== 'idle');
  return { st: g.service.state, fuel: Math.round(g.aircraft.fm.fuel), hop: Math.round(g.aircraft.fm.hopper), rec };
});
check('serviced at the base', svc.st === 'idle' && svc.fuel >= svc.rec.fuel - 2 && svc.hop >= svc.rec.liquid - 2, JSON.stringify(svc));

// Take-off from the main strip by hand (full throttle, tail up, rotate).
const takeoff = (site) => page.evaluate((site) => {
  const g = window.__agro, A = g.aircraft, fm = A.fm, T = g.world.terrain, s = g.sites.find((x) => x.id === site), v = g.input.virtual;
  A.placeOnRunway('west', s); g.simulate(1, 1 / 60);
  const p0 = { x: fm.pos.x, z: fm.pos.z }, hdg0 = fm.heading();
  let roll = null, t = 0;
  v.active = true; v.pitch = v.roll = v.yaw = 0; v.brake = false; v.throttle = 0;
  fm.flapsCmd = 1 / 3;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  g.simulate(70, 1 / 60, () => {
    t += 1 / 60;
    const o = fm.out, agl = fm.pos.y - T.heightAt(fm.pos.x, fm.pos.z);
    v.engine = fm.engine === 'off';
    v.throttle = fm.engine === 'running' ? 1 : 0;
    const err = wrap(hdg0 - fm.heading());
    v.yaw = Math.max(-1, Math.min(1, -err * 4 + fm.omega.y * 2)) * (o.onGround ? 1 : 0.3);
    const vs = Math.sqrt((2 * fm.mass * 9.81) / (1.225 * fm.A.wingArea * 1.75)), vr = vs * 1.08;
    v.pitch = o.onGround ? (o.airspeed < 14 ? 0 : o.airspeed < vr ? -0.25 : 0.6) : Math.max(-1, Math.min(1, (0.16 - Math.asin(Math.max(-1, Math.min(1, fm.vel.y / Math.max(10, o.airspeed)))) - 0.06) * 3));
    if (roll === null && !o.onGround && agl > 1.5) roll = Math.hypot(fm.pos.x - p0.x, fm.pos.z - p0.z);
    return agl < 15 && A.state === 'ok';
  });
  const agl = fm.pos.y - T.heightAt(fm.pos.x, fm.pos.z);
  v.pitch = v.roll = v.yaw = 0; v.throttle = null; v.engine = false; v.active = false; fm.flapsCmd = 0;
  return { site, roll: roll && Math.round(roll), agl: Math.round(agl), state: A.state, why: A.crashReason, t: Math.round(t), ias: Math.round(fm.out.airspeed ?? 0), len: s.farm?.len ?? 720 };
}, site);

// Spray every band of the job, terrain-following (as test/stripflow.mjs).
const sprayJob = () => page.evaluate(() => {
  const g = window.__agro, A = g.aircraft, sp = 46 * (A.A.assistSpeedScale ?? 1), W = A.type.spray.swath * 0.85, T = g.world.terrain;
  let k = 0; const ev = {}; A.damage = 0; const prevEv = A.onEvent; A.onEvent = (e) => { ev[e.kind + (e.part ? ':' + e.part : '')] = (ev[e.kind + (e.part ? ':' + e.part : '')] || 0) + 1; prevEv?.(e); };
  for (const f of g.job.fields) {
    const ax = f.rowAxis === 'x';
    const across0 = ax ? f.z0 : f.x0, across1 = ax ? f.z1 : f.x1, a0 = (ax ? f.x0 : f.z0) - 10, a1 = (ax ? f.x1 : f.z1) + 10;
    for (let c = across0 + W / 2; c < across1 + W * 0.3; c += W, k++) {
      const dir = k % 2 ? -1 : 1;
      let a = dir > 0 ? a0 : a1;
      const hdg = ax ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      while (dir > 0 ? a < a1 : a > a0) {
        const x = ax ? a : Math.min(c, across1 - 2), z = ax ? Math.min(c, across1 - 2) : a;
        A.fm.hopper = Math.max(A.fm.hopper, 300);
        A.placeAirborne(x, z, hdg, 4 + 3.4, sp); // over the 3.4 m canopy from before the edge
        const dt = Math.min(0.25, Math.max(0.05, (dir > 0 ? a1 - a : a - a0) / sp));
        g.sprayer.on = true; g.simulate(dt, 1 / 30);
        a += dir * sp * dt;
      }
      g.sprayer.on = false;
    }
  }
  A.onEvent = prevEv;
  return { ev, cov: g.job.stats().coverage, done: g.job.complete(), passes: k, state: A.state, damage: A.damage, top: T.surfaceTop(g.job.fields[0].x0 + 20, g.job.fields[0].z0 + 20) - T.heightAt(g.job.fields[0].x0 + 20, g.job.fields[0].z0 + 20) };
});

const to1 = await takeoff('main');
check('take-off from Vale das Bananeiras', to1.state === 'ok' && to1.agl >= 15 && to1.roll < to1.len, JSON.stringify(to1));
// GPS guidance over the plot.
const gps = await page.evaluate(() => {
  const g = window.__agro, f = g.job.fields[0], A = g.aircraft, T = g.world.terrain;
  A.placeAirborne((f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2, f.rowAxis === 'x' ? Math.PI / 2 : 0, 6, 46); g.simulate(0.5, 1 / 30);
  const st = g.guidance.state?.() ?? g.guidance.info?.() ?? {};
  return { keys: Object.keys(st).slice(0, 12), field: g.guidance.field?.name ?? st.field ?? null, lines: g.guidance.lines?.length ?? st.lines ?? null, xtk: st.xtk ?? st.offset ?? null, canopy: T.surfaceTop(A.fm.pos.x, A.fm.pos.z) - T.heightAt(A.fm.pos.x, A.fm.pos.z) };
});
console.log('INFO gps', JSON.stringify(gps));
const cov = await sprayJob();
check('banana plot sprayed to completion (all bands)', cov.done && cov.state === 'ok' && cov.damage < 5, JSON.stringify(cov));
check('banana canopy height seen by the terrain (3.4 m)', Math.abs(cov.top - 3.4) < 0.3, String(cov.top));
await page.evaluate(() => { const g = window.__agro; g.aircraft.placeAtPad(g.sites[0]); g.simulate(1, 1 / 30); g.handIn(); });
await shot('results');
const hist = await page.evaluate(() => { const g = window.__agro; return { main: g.career.history.map((e) => e.id), money: g.career.money }; });
check('order handed in and paid', hist.main.includes('sb-01') && hist.money > 4321, JSON.stringify(hist));

// --- The two farm strips.
for (const id of ['baixadao', 'pistadaserra']) {
  const arr = await page.evaluate((id) => {
    const g = window.__agro, s = g.sites.find((x) => x.id === id);
    g.screens.close(); g.setJob(null);
    if (!s.farm.aircraft.includes(g.aircraftId)) g.selectAircraft(s.farm.aircraft[0]);
    g.aircraft.placeAtPad(s); g.simulate(1.5, 1 / 30);
    const p = g.aircraft.fm.pos;
    return { site: g.site.id, inZone: g.service.inZone(), office: g.officeSite()?.id, state: g.aircraft.state, y: Math.round(p.y), ac: g.aircraftId };
  }, id);
  check(`${id}: crew, truck and office at the strip`, arr.site === id && arr.inZone && arr.office === id && arr.state === 'ok', JSON.stringify(arr));
  await page.evaluate(() => { const g = window.__agro; g.cameraMode = 'orbit'; g.rig.setMode('orbit', g.aircraft); g.rig.orbit.yaw = 2.2; g.rig.orbit.dist = 34; g.rig.orbit.pitch = 0.3; g.simulate(0.3, 1 / 30); });
  await shot(`${id}-pad`);
  const first = await page.evaluate((id) => { const g = window.__agro; g.screens.office('requests'); const b = [...document.querySelectorAll('[data-accept]')].find((x) => !x.disabled && g.career.job(x.dataset.accept).c.farm === id); return b?.dataset.accept ?? null; }, id);
  await shot(`${id}-office`);
  const a2 = await page.evaluate((cid) => { const g = window.__agro; document.querySelector(`[data-accept="${cid}"]`)?.click(); return { job: g.job?.c.id, open: g.screens.open }; }, first);
  check(`${id}: request ${first} accepted at the farm office`, !!first && a2.job === first && a2.open === 'load', JSON.stringify(a2));
  await page.evaluate(() => window.__agro.screens.close());
  const to = await takeoff(id);
  check(`${id}: take-off within the strip`, to.state === 'ok' && to.agl >= 15 && to.roll < to.len, JSON.stringify(to));
  const c2 = await sprayJob();
  check(`${id}: plot sprayed to completion`, c2.done && c2.state === 'ok' && c2.damage < 5, JSON.stringify(c2));
  await page.evaluate((id) => { const g = window.__agro; g.aircraft.placeAtPad(g.sites.find((x) => x.id === id)); g.simulate(1, 1 / 30); g.handIn(); }, id);
  const h2 = await page.evaluate(() => window.__agro.career.history2.map((e) => [e.id, e.farm]));
  check(`${id}: hand-in in the farm history`, h2.some((e) => e[0] === first && e[1] === id), JSON.stringify(h2));
  await page.evaluate(() => window.__agro.screens.close());
}

// --- Edge of the map: the far check uses the playable half.
const edge = await page.evaluate(() => { const g = window.__agro; g.aircraft.placeAirborne(2200, 0, Math.PI / 2, 150, 50); g.simulate(4, 1 / 30); const a = g.aircraft.state; g.aircraft.placeAirborne(2850, 0, Math.PI / 2, 150, 50); g.simulate(12, 1 / 30); return { inside: a, x: Math.round(g.aircraft.fm.pos.x), state: g.aircraft.state }; });
check('edge of the playable area turns the aircraft back', edge.inside === 'ok' && edge.x < 2950, JSON.stringify(edge));

const mem = await page.evaluate(() => { const g = window.__agro, m = g.renderer.info; return { geo: m.memory.geometries, tex: m.memory.textures, heapMB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576), banana: g.world.bananas.stats() }; });
console.log('INFO serra memory', JSON.stringify(mem));
const miss = await page.evaluate(() => [...(globalThis.__i18nMisses || [])]);
check('no untranslated text', miss.length === 0, miss.slice(0, 6).join(' | '));

// --- Back to the main map: progress of both kept.
const serraMoney = await page.evaluate(() => { const g = window.__agro; g.setJob(null); g.career.save(); g.screens.expansions(); return g.career.money; });
t0 = Date.now();
await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 120000 }), page.evaluate(() => document.querySelector('[data-map="main"]').click())]);
await ready();
const toMain = (Date.now() - t0) / 1000;
const m1 = await mapInfo();
const save = await page.evaluate(() => { const g = window.__agro; return { money: g.career.money, other: Object.keys(g.career.otherJobs ?? {}).length, hist: g.career.history.length, hist2: g.career.history2.length }; });
check('main map back, identical data', !m1.bananas && m1.fields === main0.fields && m1.sites.join() === main0.sites.join() && m1.h === main0.h, JSON.stringify(m1).slice(0, 120));
check('money and histories kept; Serra jobs kept aside', Math.abs(save.money - serraMoney) < 0.01 && save.other > 0 && save.hist2 === 2, JSON.stringify(save));
console.log(`INFO switch serra -> main ${toMain.toFixed(1)} s (SwiftShader)`);
check('no page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
