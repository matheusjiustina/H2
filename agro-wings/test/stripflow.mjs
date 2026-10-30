// Airstrips expansion in the browser, farm by farm: the crew follows to the
// strip, the farm office opens there and lists its requests, a request is
// accepted on the spot (no flight back to the base), the local truck loads
// the aircraft, the talhão is sprayed to completion, the job is handed in
// at that farm and paid, and the save keeps it. Also: a strip refuses an
// aircraft it is not cleared for.   node test/stripflow.mjs <outDir> [ids]
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'strip-out';
fs.mkdirSync(outDir, { recursive: true });
const IDS = process.argv[3]?.split(',') ?? ['horizonte', 'doislagos', 'serradocedro', 'mataalta', 'ipeamarelo', 'valeverde', 'terravermelha', 'chapada'];
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`); };
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(600000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const t0 = Date.now();
await page.goto((process.env.AGRO_URL || 'http://localhost:4173/') + '?q=low', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
console.log(`loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await page.evaluate(() => {
  localStorage.clear(); const g = window.__agro; g.career.resetAll(); g.career.tutorialDone = true;
  g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear');
  g.menuAction('career'); g.screens.close();
  g.selectAircraft('ipanema');
});

// A strip refuses what it is not cleared for (Mata Alta: Ipanema and R44 only).
const fit = await page.evaluate(() => {
  const g = window.__agro;
  g.selectAircraft('at502');
  const s = g.sites.find((x) => x.id === 'mataalta');
  g.aircraft.placeAtPad(s); g.simulate(1.2, 1 / 30);
  g.screens.office('requests');
  const btn = document.querySelector('[data-accept="ma-soy"]');
  const card = btn.closest('.os-req');
  g.selectContract('ma-soy');
  const r = { disabled: btn.disabled, nofit: card.classList.contains('nofit'), job: g.job?.c.id ?? null };
  g.screens.close();
  g.aircraft.placeAtPad(g.sites[0]); g.simulate(1.2, 1 / 30);
  g.selectAircraft('ipanema');
  return r;
});
check('Mata Alta refuses the AT-502 (accept disabled, card marked, no job)', fit.disabled && fit.nofit && fit.job === null, JSON.stringify(fit));

let money0 = await page.evaluate(() => window.__agro.career.money);
for (const id of IDS) {
  const arr = await page.evaluate((id) => {
    const g = window.__agro, s = g.sites.find((x) => x.id === id);
    g.aircraft.repair(); g.aircraft.placeAtPad(s); g.simulate(1.5, 1 / 30);
    return { site: g.site.id, inZone: g.service.inZone(), office: g.officeSite()?.id, truckHome: g.service.truck.atHome, y: g.aircraft.fm.pos.y, ground: g.world.terrain.heightAt(g.aircraft.fm.pos.x, g.aircraft.fm.pos.z), state: g.aircraft.state };
  }, id);
  check(`${id}: crew, truck and office at the strip`, arr.site === id && arr.inZone && arr.office === id && arr.truckHome && arr.state === 'ok', JSON.stringify(arr));
  // The farm office lists this farm's requests, open now (clear morning).
  const off = await page.evaluate((id) => {
    const g = window.__agro;
    g.screens.office('requests');
    const where = document.querySelector('.os-where')?.textContent;
    const open = [...document.querySelectorAll('[data-accept]')].filter((b) => !b.disabled).map((b) => b.dataset.accept);
    const pre = { horizonte: 'hz', doislagos: 'dl', serradocedro: 'sc', mataalta: 'ma', ipeamarelo: 'ia', valeverde: 'vv', terravermelha: 'tv', chapada: 'cv' }[id];
    const mine = [...document.querySelectorAll('[data-accept]')].filter((b) => b.dataset.accept.startsWith(pre + '-')).map((b) => [b.dataset.accept, !b.disabled, b.closest('.os-req').querySelector('.os-cond')?.textContent]);
    return { where, mine, open: open.filter((c) => c.startsWith(pre + '-')) };
  }, id);
  const first = await page.evaluate((id) => { const all = [...document.querySelectorAll('[data-accept]')].map((b) => b.dataset.accept); return all.find((c) => c.startsWith({ horizonte: 'hz', doislagos: 'dl', serradocedro: 'sc', mataalta: 'ma', ipeamarelo: 'ia', valeverde: 'vv', terravermelha: 'tv', chapada: 'cv' }[id] + '-')); }, id);
  check(`${id}: farm office open at the strip with its requests`, !!first && off.open.includes(first) && /·/.test(off.where), JSON.stringify(off).slice(0, 160));
  await page.screenshot({ path: `${outDir}/${id}-office.png` });
  // Accept on the spot: the load sheet opens (crew is here).
  const acc = await page.evaluate((cid) => { const g = window.__agro; document.querySelector(`[data-accept="${cid}"]`).click(); return { job: g.job?.c.id, open: g.screens.open }; }, first);
  check(`${id}: ${first} accepted at the farm, load sheet open`, acc.job === first && acc.open === 'load', JSON.stringify(acc));
  // Local truck loads the aircraft.
  const svc = await page.evaluate(() => {
    const g = window.__agro; g.screens.close();
    const rec = g.job.c.recommended;
    g.aircraft.fm.fuel = 40; g.aircraft.fm.hopper = 0;
    g.requestService(rec.fuel, rec.liquid);
    g.simulate(500, 1 / 20, () => g.service.state !== 'idle');
    return { st: g.service.state, fuel: Math.round(g.aircraft.fm.fuel), hop: Math.round(g.aircraft.fm.hopper), rec };
  });
  check(`${id}: serviced by the local truck`, svc.st === 'idle' && svc.fuel >= svc.rec.fuel - 2 && svc.hop >= svc.rec.liquid - 2, JSON.stringify(svc));
  // Spray every pass over the talhões, terrain-following (placed each second).
  const cov = await page.evaluate(() => {
    const g = window.__agro, A = g.aircraft, sp = 46 * (A.A.assistSpeedScale ?? 1), W = A.type.spray.swath * 0.85;
    const T = g.world.terrain;
    let k = 0;
    for (const f of g.job.fields) {
      const ax = f.rowAxis === 'x';
      // (Run-in / run-out kept short: the forest clearings end in trees.)
      const across0 = ax ? f.z0 : f.x0, across1 = ax ? f.z1 : f.x1, a0 = (ax ? f.x0 : f.z0) - 10, a1 = (ax ? f.x1 : f.z1) + 10;
      for (let c = across0 + W / 2; c < across1 + W * 0.3; c += W, k++) {
        const dir = k % 2 ? -1 : 1;
        let a = dir > 0 ? a0 : a1;
        const hdg = ax ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
        while (dir > 0 ? a < a1 : a > a0) {
          const x = ax ? a : Math.min(c, across1 - 2), z = ax ? Math.min(c, across1 - 2) : a;
          A.fm.hopper = Math.max(A.fm.hopper, 300);
          A.placeAirborne(x, z, hdg, 4 + (T.surfaceTop(x, z) - T.heightAt(x, z)), sp);
          const dt = Math.min(0.5, Math.max(0.05, (dir > 0 ? a1 - a : a - a0) / sp));
          g.sprayer.on = true; g.simulate(dt, 1 / 30);
          a += dir * sp * dt;
        }
        g.sprayer.on = false;
      }
    }
    return { cov: g.job.stats().coverage, done: g.job.complete(), passes: k, state: A.state, damage: A.damage, events: (g.toastLog || []).slice(-3) };
  });
  check(`${id}: talhão sprayed to completion`, cov.done && cov.state === 'ok' && cov.damage < 5, JSON.stringify(cov));
  // Back at the farm pad: hand in there, paid, recorded.
  const hand = await page.evaluate((id) => {
    const g = window.__agro, s = g.sites.find((x) => x.id === id);
    const m0 = g.career.money;
    g.aircraft.placeAtPad(s); g.simulate(1.5, 1 / 30);
    g.aircraft.fm.engine = 'off'; g.simulate(0.5, 1 / 30);
    g.handIn();
    const last = g.career.history2.at(-1);
    const r = { paid: Math.round(g.career.money - m0), farm: last?.farm, id: last?.id, stars: last?.stars, open: g.screens.open, site: g.site.id };
    g.screens.close();
    return r;
  }, id);
  check(`${id}: handed in at the farm and paid`, hand.paid > 1000 && hand.farm === id && hand.id === first && hand.site === id, JSON.stringify(hand));
}
const saved = await page.evaluate(() => {
  const g = window.__agro; g.career.save();
  const s = JSON.parse(localStorage.getItem('agrowings.save.v1'));
  return { money: s.money, completed: Object.keys(s.completed), hist2: s.history2.map((e) => e.farm) };
});
check('save keeps the money, the completed requests and the farm history', IDS.every((id) => saved.hist2.includes(id)) && saved.completed.length >= IDS.length && saved.money > money0, JSON.stringify(saved));
// Map with the farm markers.
await page.evaluate(() => { const g = window.__agro; g.screens.office('map'); });
await page.screenshot({ path: `${outDir}/office-map.png` });
const miss = await page.evaluate(() => [...(globalThis.__i18nMisses || [])]);
check('no untranslated text', miss.length === 0, miss.slice(0, 5).join(' | '));
check('no page errors', errors.length === 0, errors.join(' | '));
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
