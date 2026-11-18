// Phase 5: long scripted session. Flies every farm in turn (cruise, low pass over crops, high altitude,
// sudden reversals, long legs, return to the main base) while sampling heap, GPU resource counts,
// streaming state, hole checks and the CPU cost of the world update.
// Usage: AGRO_URL=... node test/p5long.mjs out.json [legsLimit]
import { chromium } from 'playwright';
import fs from 'node:fs';
const url = process.env.AGRO_URL || 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
page.setDefaultTimeout(900000);
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); });
await page.addInitScript(() => {
  const L = new Map(), T = { timeouts: 0, intervals: 0 };
  const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (t, f, o) { const k = (this === window ? 'window' : this === document ? 'document' : this.tagName || this.constructor.name) + ':' + t; L.set(k, (L.get(k) || 0) + 1); return add.call(this, t, f, o); };
  EventTarget.prototype.removeEventListener = function (t, f, o) { const k = (this === window ? 'window' : this === document ? 'document' : this.tagName || this.constructor.name) + ':' + t; L.set(k, (L.get(k) || 0) - 1); return rem.call(this, t, f, o); };
  window.__listeners = () => Object.fromEntries([...L].filter(([, v]) => v > 0));
});
await page.goto(url + '?q=high', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
const legsLimit = +process.argv[3] || 99;
const res = await page.evaluate(async (legsLimit) => {
  const g = window.__agro;
  g.frozen = true; g.noRender = true; g.menuAction('free'); g.screens.close();
  const ac = g.aircraft, cam = g.camera, T = g.world.terrain;
  const samples = []; let holes = { terrain: 0, veg: 0 }, maxUpd = 0, sumUpd = 0, nUpd = 0;
  const heap = () => (performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null);
  const snap = (label) => { const w = g.world, r = g.renderer.info; return { label, t: +g.time.toFixed(0), heapMB: heap(), geo: r.memory.geometries, tex: r.memory.textures, veg: w.vegetation.stats?.().built, vegTotal: w.vegetation.stats?.().cells, fine: w.terrainMesh.fineStats?.().built, listeners: Object.values(window.__listeners()).reduce((a, b) => a + b, 0), cropCells: w.cropPlants.count?.() }; };
  const pts = g.sites.map((s) => ({ id: s.id, x: (s.runway.x0 + s.runway.x1) / 2, z: s.runway.z }));
  const legs = [];
  const main = pts[0];
  const order = pts.slice(1).concat([main]);
  let prev = main;
  for (const p of order) { legs.push([prev, p]); prev = p; }
  const run = (from, to, agl, label, reverseAt = 0) => {
    const dx = to.x - from.x, dz = to.z - from.z, dist = Math.hypot(dx, dz), hdg = Math.atan2(dx, dz), sp = 70, dt = 0.1;
    const steps = Math.ceil(dist / (sp * dt));
    for (let i = 0; i <= steps; i++) {
      let u = i / steps;
      if (reverseAt && u > reverseAt) u = 2 * reverseAt - u; // sudden reversal back along the same line
      const x = from.x + dx * Math.max(0, u), z = from.z + dz * Math.max(0, u);
      const h = T.heightAt(x, z);
      ac.placeAirborne(x, z, hdg + (reverseAt && i / steps > reverseAt ? Math.PI : 0), Math.max(5, agl), sp);
      g.tick(dt);
      cam.position.set(x - Math.sin(hdg) * 20, h + agl + 6, z - Math.cos(hdg) * 20); cam.lookAt(x, h + agl, z); cam.updateMatrixWorld();
      const t0 = performance.now();
      g.world.update(cam, ac.rPos, dt, g.time);
      const ms = performance.now() - t0; sumUpd += ms; nUpd++; if (ms > maxUpd) maxUpd = ms;
      if (i % 5 === 0) {
        holes.terrain += g.world.terrainMesh.fineMissing?.(cam.position) ?? 0;
        holes.veg += g.world.vegetation.missing?.(cam.position) ?? 0;
      }
      if (i % 400 === 0) { g.render(); }
    }
    samples.push(snap(label));
  };
  samples.push(snap('boot'));
  let n = 0;
  for (const [a, b] of legs) {
    if (n++ >= legsLimit) break;
    const lbl = `${a.id}->${b.id}`;
    run(a, b, 150, lbl + ' cruise');
    if (n % 3 === 0) run(b, { x: b.x + 1500, z: b.z + 900 }, 4, lbl + ' low pass');
    if (n % 4 === 0) run(b, { x: b.x - 2500, z: b.z + 2500 }, 3000, lbl + ' high');
    if (n % 5 === 0) run(a, b, 120, lbl + ' reversal', 0.5);
    if (typeof gc === 'function') gc();
  }
  samples.push(snap('end'));
  return { samples, holes, updMsAvg: +(sumUpd / nUpd).toFixed(3), updMsMax: +maxUpd.toFixed(1), updates: nUpd, streaming: g.world.streaming?.stats?.() };
}, legsLimit);
res.errors = errors;
res.listeners = await page.evaluate(() => window.__listeners());
console.log(JSON.stringify(res.samples.map((s) => `${s.label}: heap ${s.heapMB} geo ${s.geo} tex ${s.tex} veg ${s.veg}/${s.vegTotal} fine ${s.fine} lis ${s.listeners}`), null, 0).replace(/","/g, '\n'));
console.log('holes', JSON.stringify(res.holes), 'update ms avg/max', res.updMsAvg, res.updMsMax, 'updates', res.updates, 'errors', errors.length);
console.log('streaming', JSON.stringify(res.streaming));
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(res, null, 1));
await browser.close();
