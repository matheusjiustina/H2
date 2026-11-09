// World Optimization (phase 3): CPU hitches of the world while flying. The
// camera is moved along fixed routes at flight speed, one 1/60 s frame at a
// time, and the CPU time of world.update (streaming, crop plants, crowns,
// grass, LOD switches) is recorded per frame, plus the render call (on the
// software renderer the raster dominates it, so only its spikes — first
// uploads of new meshes — are telling). Same routes before and after.
//   AGRO_URL=http://localhost:5173/ node test/worldhitch.mjs [profile] [out.json]
import { chromium } from 'playwright';
import fs from 'node:fs';
const url = process.env.AGRO_URL || 'http://localhost:5173/';
const q = process.argv[2] || 'high', out = process.argv[3];
const RENDER_EVERY = +(process.env.RENDER_EVERY || 6);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(url + '?mem=high&q=' + q, { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 400000 });
await page.evaluate(() => { const g = window.__agro; g.frozen = true; g.noRender = true; g.menuAction('free'); g.screens.close(); g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear'); });
// Routes: [name, start x, z, heading (rad, 0 = +z), AGL m, speed m/s, seconds, camera]
const ROUTES = [
  ['lowpass_fields', -900, 470, Math.PI / 2, 5, 45, 40, 'chase'],
  ['cockpit_low', -900, 300, Math.PI / 2, 6, 45, 30, 'cockpit'],
  ['cruise_cross', -3000, -2500, 0.9, 150, 65, 90, 'chase'],
  ['forest_low', 900, 900, 0.6, 35, 55, 45, 'chase'],
  ['climb_aerial', 0, 0, 1.2, 40, 60, 40, 'climb'],
];
const res = { q };
for (const [name, x, z, hdg, agl, v, secs, cam] of ROUTES) {
  res[name] = await page.evaluate(async ({ x, z, hdg, agl, v, secs, cam, every }) => {
    const g = window.__agro, ac = g.aircraft, w = g.world;
    ac.placeAirborne(x, z, hdg, agl, 46);
    g.cameraMode = cam === 'cockpit' ? 'cockpit' : 'chase';
    g.rig.setMode(g.cameraMode, ac);
    for (let i = 0; i < 10; i++) g.tick(1 / 60);
    g.cameraMode = 'free';
    const c = g.camera, T = w.terrain;
    const sx = Math.sin(hdg), sz = Math.cos(hdg);
    const frames = [], renders = [];
    // Per-subsystem CPU: max and count of calls over 4 ms.
    const sub = {};
    const wrap = (name, obj, fn) => {
      if (!obj?.[fn]) return;
      if (obj[fn].__w) { sub[name] = obj[fn].__rec; return; }
      const f = obj[fn];
      const rec = (sub[name] ||= { max: 0, over4: 0, total: 0 });
      obj[fn] = function (...a) { const t = performance.now(); const r = f.apply(this, a); const d = performance.now() - t; rec.total += d; if (d > rec.max) rec.max = d; if (d > 4) rec.over4++; return r; };
      obj[fn].__w = true; obj[fn].__rec = rec;
    };
    for (const [n, o] of [['atmo', w.atmo], ['sky', w.sky], ['terrain', w.terrainMesh], ['streaming', w.streaming], ['cropPlants', w.cropPlants], ['crops', w.crops], ['vegetation', w.vegetation], ['crowns', w.crowns], ['grass', w.grass], ['activity', w.activity]]) wrap(n, o, 'update');
    w.updaters.forEach((u, i) => wrap('u' + i + (u.name ? ':' + u.name : ''), u, 'update'));
    for (const k in sub) sub[k].max = sub[k].over4 = sub[k].total = 0;
    const n = Math.round(secs * 60);
    let px = x, pz = z;
    // settle the start (as if it had been flown into)
    c.position.set(px - sx * 25, T.heightAt(px, pz) + agl + 6, pz - sz * 25);
    c.lookAt(px, T.heightAt(px, pz) + agl, pz);
    for (let i = 0; i < 30; i++) w.update(c, c.position, 1 / 60, g.time);
    g.render();
    for (let i = 0; i < n; i++) {
      px += sx * v / 60; pz += sz * v / 60;
      const a = cam === 'climb' ? agl + i * (900 / n) : agl;
      const gy = T.heightAt(px, pz);
      if (cam === 'cockpit') { c.position.set(px, gy + a + 1, pz); c.lookAt(px + sx * 100, gy + a - 4, pz + sz * 100); }
      else { c.position.set(px - sx * 25, gy + a + 6, pz - sz * 25); c.lookAt(px, gy + a, pz); }
      c.updateMatrixWorld();
      const t0 = performance.now();
      w.update(c, c.position, 1 / 60, g.time + i / 60);
      frames.push(performance.now() - t0);
      if (i % every === 0) { const t1 = performance.now(); g.render(); renders.push(performance.now() - t1); }
    }
    const st = (a) => { const s = a.slice().sort((p, q) => p - q), k = (f) => +s[Math.min(s.length - 1, Math.floor(s.length * f))].toFixed(2); return { n: a.length, mean: +(a.reduce((p, q) => p + q, 0) / a.length).toFixed(2), p50: k(0.5), p95: k(0.95), p99: k(0.99), max: +s[s.length - 1].toFixed(2), over8: a.filter((t) => t > 8).length, over16: a.filter((t) => t > 16).length }; };
    const subs = Object.fromEntries(Object.entries(sub).filter(([, r]) => r.max > 1).map(([k, r]) => [k, { max: +r.max.toFixed(1), over4: r.over4, ms: +r.total.toFixed(0) }]));
    return { world: st(frames), render: st(renders), subs, stream: w.streaming.stats?.() && { vegBuilt: w.streaming.s.vegBuilt, tBuilt: w.streaming.s.tBuilt, maxScanMs: +w.streaming.s.maxScanMs.toFixed(1) } };
  }, { x, z, hdg, agl, v, secs, cam, every: RENDER_EVERY });
  console.log(name, 'world', JSON.stringify(res[name].world), '| render', JSON.stringify({ p50: res[name].render.p50, max: res[name].render.max }), '|', JSON.stringify(res[name].stream), '\n   subs', JSON.stringify(res[name].subs));
}
res.heapMB = await page.evaluate(async () => { window.gc?.(); await new Promise((r) => setTimeout(r, 300)); return Math.round(performance.memory.usedJSHeapSize / 1048576); });
res.errors = errs;
console.log('heap', res.heapMB, 'MB errors', errs.length, errs.slice(0, 3));
if (out) fs.writeFileSync(out, JSON.stringify(res, null, 1));
await browser.close();
