// World Optimization (phase 3, 2026-11): fixed views, for each: draw calls,
// triangles, per scene-group calls / triangles, CPU time of world.update and
// of a full frame (tick + render; the software renderer makes render time
// mostly raster), JS heap, GPU counts, geometry bytes per group (shown /
// hidden). Same views before and after. The game clock is reset first (the
// cockpit head motion follows it), so screenshots compare pixel for pixel.
//   AGRO_URL=http://localhost:5173/ [SHOTS_ONLY=1] node test/worldprobe.mjs [profile] [out.json] [shotsDir]
import { chromium } from 'playwright';
import fs from 'node:fs';
const url = process.env.AGRO_URL || 'http://localhost:5173/';
const q = process.argv[2] || 'high', out = process.argv[3], shots = process.argv[4];
if (shots) fs.mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
// Same random sequence on every run (the weather cycle draws from it), so
// two runs of one build differ only by the real-time length of the loading
// frames (the A/A noise floor; measure it by running a build twice).
await page.addInitScript(() => { let a = 0x9e3779b9; Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
const SHOTS_ONLY = !!process.env.SHOTS_ONLY;
const t0 = Date.now();
await page.goto(url + '?mem=high&q=' + q, { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 400000 });
const loadS = (Date.now() - t0) / 1000;
await page.addStyleTag({ content: '.overlay,.hud,.loading,.touch,#touch,button,.toast,.modal,.screen,.title{display:none!important}' });
const VIEWS = {
  base: { x: null, mode: 'chase' },
  lowpass: { x: -200, z: 470, hdg: Math.PI / 2, agl: 4, mode: 'chase' },
  cockpitLow: { x: -200, z: 470, hdg: Math.PI / 2, agl: 6, mode: 'cockpit' },
  high250: { x: 300, z: -280, hdg: Math.PI / 2, agl: 250, mode: 'chase' },
  aerial800: { x: 0, z: 0, hdg: Math.PI / 4, agl: 800, mode: 'aerial' },
  strip: { strip: true },
  forest: { x: 1500, z: 1500, hdg: 0, agl: 40, mode: 'chase' },
};
await page.evaluate(() => { const g = window.__agro; g.frozen = true; g.noRender = true; g.menuAction('free'); g.screens.close(); g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear'); g.time = 0; });
const res = { q, loadS };
for (const [name, v] of Object.entries(VIEWS)) {
  res[name] = await page.evaluate(async (v) => {
    const g = window.__agro, ac = g.aircraft;
    if (v.strip) {
      const s = g.sites.find((x) => x.id === 'mataalta') ?? g.sites.find((x) => !x.main) ?? g.sites[0];
      if (s !== g.site) g.service.setSite?.(s);
      ac.placeAirborne(s.runway.x0 - 600, s.runway.z, Math.PI / 2, 60, 45);
      g.cameraMode = 'chase'; g.rig.setMode('chase', ac);
    } else if (v.x == null) { ac.placeAtPad(); g.cameraMode = 'chase'; g.rig.setMode('chase', ac); }
    else {
      ac.placeAirborne(v.x, v.z, v.hdg, v.agl, 46);
      if (v.mode === 'aerial') { g.cameraMode = 'chase'; g.rig.setMode('chase', ac); }
      else { g.cameraMode = v.mode; g.rig.setMode(v.mode, ac); }
    }
    for (let i = 0; i < 40; i++) g.tick(1 / 60);
    if (v.mode === 'aerial') { const p = ac.rPos; g.cameraMode = 'free'; g.camera.position.set(p.x - 600, p.y + 300, p.z - 600); g.camera.lookAt(p.x, p.y - 700, p.z); }
    for (let i = 0; i < 60; i++) g.world.update(g.camera, g.camera.position, 1 / 60, g.time);
    const r = g.renderer;
    const meas = () => { r.info.reset?.(); g.render(); return [r.info.render.calls, r.info.render.triangles]; };
    meas();
    const total = meas();
    // CPU: world.update (median of 20) and tick.
    const med = (f, n = 20) => { const a = []; for (let i = 0; i < n; i++) { const t = performance.now(); f(); a.push(performance.now() - t); } a.sort((x, y) => x - y); return +a[n >> 1].toFixed(2); };
    const worldMs = med(() => g.world.update(g.camera, g.camera.position, 1 / 60, g.time));
    const renderMs = med(() => g.render(), 3);
    const parts = {};
    if (!v.shotsOnly) g.scene.children.slice().forEach((c, i) => {
      if (!c.visible) return;
      c.visible = false; const m = meas(); c.visible = true;
      const k = (c.name || c.type) + '#' + i;
      if (total[0] - m[0] > 0) parts[k] = [total[0] - m[0], total[1] - m[1]];
    });
    let png = null;
    if (v.shot) { g.render(); png = r.domElement.toDataURL('image/png'); }
    return { total, worldMs, renderMs, parts: Object.entries(parts).sort((a, b) => b[1][0] - a[1][0]).slice(0, 10), png };
  }, { ...v, shot: !!shots, shotsOnly: SHOTS_ONLY });
  if (res[name].png) fs.writeFileSync(`${shots}/${q}_${name}.png`, Buffer.from(res[name].png.split(',')[1], 'base64'));
  delete res[name].png;
  console.log(name, JSON.stringify(res[name].total), 'world', res[name].worldMs, 'ms render', res[name].renderMs, 'ms |', res[name].parts.map(([k, p]) => `${k}:${p[0]}`).join(' '));
}
res.mem = await page.evaluate(async () => {
  window.gc?.(); await new Promise((r) => setTimeout(r, 300));
  const g = window.__agro, i = g.renderer.info, by = {};
  // Each array counted once (geometries may share attributes / buffers).
  const arrs = new Set();
  const one = (a) => { const buf = a?.array?.buffer; if (!buf || arrs.has(buf)) return 0; arrs.add(buf); return buf.byteLength; };
  const bytes = (gg) => { let b = 0; for (const k in gg.attributes) b += one(gg.attributes[k]); return b + one(gg.index); };
  const seen = new Set(), ac = new Set(Object.values(g.fleet).map((a) => a.model.root));
  for (const ch of g.scene.children) {
    const k = ac.has(ch) ? 'aircraft' : (ch.name || ch.type);
    ch.traverse((o) => { if (!o.geometry || seen.has(o.geometry)) return; seen.add(o.geometry); let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) vis = false; (by[k] ||= [0, 0]); by[k][vis ? 0 : 1] += bytes(o.geometry); });
  }
  return { heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576), gpuGeo: i.memory.geometries, gpuTex: i.memory.textures, programs: i.programs?.length, geoMB: Object.fromEntries(Object.entries(by).map(([k, [a, b]]) => [k, [+(a / 1048576).toFixed(1), +(b / 1048576).toFixed(1)]]).filter(([, [a, b]]) => a + b > 0.3).sort((x, y) => (y[1][0] + y[1][1]) - (x[1][0] + x[1][1]))) };
});
res.errors = errs;
console.log('load', loadS, 's mem', JSON.stringify(res.mem), 'errors', errs.length);
if (out) fs.writeFileSync(out, JSON.stringify(res, null, 1));
await browser.close();
