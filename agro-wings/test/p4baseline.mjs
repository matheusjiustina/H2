// Phase 04 (aircraft performance engine) baseline / after: opening, first
// flight, cockpit entry, aircraft switches, memory per aircraft.
//   AGRO_URL=http://localhost:5173/ node test/p4baseline.mjs [out.json]
// Scenarios (software renderer: times are this container's CPU, memory and
// counts are exact):
//   A  opening: time to the first interactive frames, JS heap (peak sampled
//      every 200 ms while loading, settled after GC), GPU geometries /
//      textures, per aircraft: geometry bytes drawn / hidden (originals kept
//      beside a parked aircraft's baked copy) / baked, CPU canvas pixels.
//   B  first flight on the default aircraft: time, heap.
//   C  cockpit entry: time of the first cockpit frame, heap delta.
//   D  12 consecutive switches over every type: time per switch, heap after.
import { chromium } from 'playwright';
import fs from 'node:fs';
const url = process.env.AGRO_URL || 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
// Heap peak while loading (sampled in the page).
await page.addInitScript(() => {
  window.__peak = 0;
  setInterval(() => { const m = performance.memory?.usedJSHeapSize ?? 0; if (m > window.__peak) window.__peak = m; }, 200);
});
const MB = (b) => +(b / 1048576).toFixed(1);
const t0 = Date.now();
await page.goto(url + '?mem=high&q=high', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 400000 });
const res = { loadS: (Date.now() - t0) / 1000 };
const snap = () => page.evaluate(async () => {
  window.gc?.(); await new Promise((r) => setTimeout(r, 300)); window.gc?.();
  const g = window.__agro, i = g.renderer.info;
  const arrs = new Set();
  const one = (a) => { const b = a?.array?.buffer; if (!b || arrs.has(b)) return 0; arrs.add(b); return b.byteLength; };
  const gBytes = (G) => { let s = 0; for (const k in G.attributes) s += one(G.attributes[k]); return s + one(G.index); };
  const per = {}; const canv = new Set(); let canvPx = 0;
  for (const [id, ac] of Object.entries(g.fleet)) {
    const st = g.assets?.entries?.get(id)?.state ?? '?';
    const r = { state: st, light: !!g.assets?.light?.has(id), drawnMB: 0, hiddenMB: 0, bakedMB: 0, meshes: 0, drawn: 0 };
    ac.model.root.traverse((o) => {
      if (o.geometry) {
        let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) { vis = false; break; }
        let baked = false; for (let p = o; p; p = p.parent) if (p.name === 'parkedMerge') { baked = true; break; }
        const b = gBytes(o.geometry);
        if (baked) r.bakedMB += b; else if (vis) r.drawnMB += b; else r.hiddenMB += b;
        if (o.isMesh) { r.meshes++; if (vis) r.drawn++; }
      }
      for (const m of [].concat(o.material ?? [])) for (const k in m) { const t = m[k]; const c = t?.isTexture && t.image; if (c && typeof c.getContext === 'function' && !canv.has(c)) { canv.add(c); canvPx += c.width * c.height; } }
    });
    for (const k of ['drawnMB', 'hiddenMB', 'bakedMB']) r[k] = +(r[k] / 1048576).toFixed(1);
    per[id] = r;
  }
  const tot = (k) => +Object.values(per).reduce((a, r) => a + r[k], 0).toFixed(1);
  return { heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), peakMB: +(window.__peak / 1048576).toFixed(1), gpuGeo: i.memory.geometries, gpuTex: i.memory.textures, programs: i.programs?.length, canvasMPx: +(canvPx / 1e6).toFixed(1), fleet: { drawnMB: tot('drawnMB'), hiddenMB: tot('hiddenMB'), bakedMB: tot('bakedMB') }, per };
});
res.A = await snap();
// B — first flight on the default aircraft.
res.B = await page.evaluate(() => {
  const g = window.__agro, t = performance.now();
  g.menuAction('free'); g.screens.close();
  for (let i = 0; i < 3; i++) { g.tick(1 / 60); g.render(); }
  return { ms: +(performance.now() - t).toFixed(0), id: g.aircraftId };
});
Object.assign(res.B, await snap());
// C — cockpit entry.
res.C = await page.evaluate(() => {
  const g = window.__agro, ac = g.aircraft;
  g.frozen = true; g.noRender = true;
  const h0 = performance.memory.usedJSHeapSize;
  const t = performance.now();
  g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', ac); g.tick(1 / 60); g.render();
  const first = performance.now() - t;
  for (let i = 0; i < 5; i++) { g.tick(1 / 60); g.render(); }
  return { firstFrameMs: +first.toFixed(0), heapDeltaMB: +((performance.memory.usedJSHeapSize - h0) / 1048576).toFixed(1) };
});
// D — switches.
res.D = await page.evaluate(async () => {
  const g = window.__agro, ids = ['e203', 'at802', 'r44', 'pa36', 'm18', 'b206', 'a188', 'thrush', 'at502', 'ipanema', 'e203', 'at802'];
  const times = [];
  for (const id of ids) {
    const t = performance.now();
    g.selectAircraft(id); g.cameraMode = 'chase'; g.rig.setMode('chase', g.aircraft); g.tick(1 / 60); g.render();
    times.push([id, +(performance.now() - t).toFixed(0)]);
    await new Promise((r) => setTimeout(r, 50));
  }
  const ms = times.map((x) => x[1]).sort((a, b) => a - b);
  return { times, medianMs: ms[ms.length >> 1], maxMs: ms[ms.length - 1] };
});
Object.assign(res.D, await snap());
res.errors = errs;
const s = (x) => `heap ${x.heapMB} MB (peak ${x.peakMB}) gpuGeo ${x.gpuGeo} gpuTex ${x.gpuTex} canvas ${x.canvasMPx} MPx fleet ${JSON.stringify(x.fleet)}`;
console.log('load', res.loadS, 's');
console.log('A', s(res.A));
for (const [id, r] of Object.entries(res.A.per)) console.log('   ', id.padEnd(8), JSON.stringify(r));
console.log('B', res.B.ms, 'ms', res.B.id, s(res.B));
console.log('C', JSON.stringify(res.C));
console.log('D median', res.D.medianMs, 'ms max', res.D.maxMs, JSON.stringify(res.D.times), '\n ', s(res.D));
console.log('errors', errs.length, errs.slice(0, 3));
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(res, null, 1));
await browser.close();
