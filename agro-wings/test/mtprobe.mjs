// Mato Grosso map probe (map refinement 2.0): the same views on any build of
// the map, placed from its own data (the pad, talhão A-01, pivot P-01, the
// map centre), for each: draw calls, triangles, CPU time of world.update and
// of a render (the software renderer makes it mostly raster); then JS heap,
// GPU counts, geometry bytes per scene group, vegetation and collider counts,
// load time. Same random sequence on every run.
//   AGRO_URL=http://localhost:5173/ node test/mtprobe.mjs [profile] [out.json] [shotsDir]
import { chromium } from 'playwright';
import fs from 'node:fs';
const url = process.env.AGRO_URL || 'http://localhost:5173/';
const q = process.argv[2] || 'high', out = process.argv[3], shots = process.argv[4];
if (shots) fs.mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.setDefaultTimeout(900000);
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.addInitScript(() => { let a = 0x9e3779b9; Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
const t0 = Date.now();
await page.goto(url + '?map=matogrosso&mem=high&q=' + q, { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 600000 });
const loadS = (Date.now() - t0) / 1000;
await page.addStyleTag({ content: '.overlay,.hud,.loading,.touch,#touch,button,.toast,.modal,.screen,.title{display:none!important}' });
const info = await page.evaluate(() => {
  const g = window.__agro; g.frozen = true; g.noRender = true; g.menuAction('free'); g.screens.close(); g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'clear'); g.time = 0;
  const F = g.world.fields ?? [];
  return { fields: F.length };
});
const VIEWS = ['base', 'lowpass', 'cockpitLow', 'pivot', 'aerial800', 'overview'];
const res = { q, loadS, info };
for (const name of VIEWS) {
  res[name] = await page.evaluate(async ({ name, shot }) => {
    const g = window.__agro, ac = g.aircraft, L = await import('/src/world/layout.js');
    const F = (n) => L.FIELDS.find((f) => f.name === n);
    const a01 = F('A-01'), p01 = F('P-01');
    let free = null;
    if (name === 'base') { ac.placeAtPad(); g.cameraMode = 'chase'; g.rig.setMode('chase', ac); }
    else if (name === 'lowpass' || name === 'cockpitLow') {
      const cx = (a01.x0 + a01.x1) / 2, cz = (a01.z0 + a01.z1) / 2, alongX = a01.rowAxis === 'x';
      ac.placeAirborne(alongX ? a01.x0 + 40 : cx, alongX ? cz : a01.z0 + 40, alongX ? Math.PI / 2 : Math.PI, 5, 46);
      const m = name === 'lowpass' ? 'chase' : 'cockpit'; g.cameraMode = m; g.rig.setMode(m, ac);
    } else if (name === 'pivot') {
      const C = p01.circle ?? { x: (p01.x0 + p01.x1) / 2, z: (p01.z0 + p01.z1) / 2, r: (p01.x1 - p01.x0) / 2 };
      ac.placeAirborne(C.x - C.r * 1.4, C.z, Math.PI / 2, 60, 46); g.cameraMode = 'chase'; g.rig.setMode('chase', ac);
    } else if (name === 'aerial800') {
      ac.placeAirborne(0, 0, Math.PI / 4, 800, 46); g.cameraMode = 'chase'; g.rig.setMode('chase', ac);
      free = (p) => { g.camera.position.set(p.x - 600, p.y + 300, p.z - 600); g.camera.lookAt(p.x, p.y - 700, p.z); };
    } else if (name === 'overview') {
      ac.placeAirborne(0, 0, 0, 900, 46); g.cameraMode = 'chase'; g.rig.setMode('chase', ac);
      free = () => { g.camera.position.set(0, 4200, 1); g.camera.lookAt(0, 0, 0); };
    }
    for (let i = 0; i < 40; i++) g.tick(1 / 60);
    if (free) { g.cameraMode = 'free'; free(ac.rPos); g.camera.updateMatrixWorld(); }
    const far0 = g.camera.far; if (name === 'overview') { g.camera.far = 9000; g.camera.updateProjectionMatrix(); }
    for (let i = 0; i < 60; i++) g.world.update(g.camera, g.camera.position, 1 / 60, g.time);
    const r = g.renderer;
    const meas = () => { r.info.reset?.(); g.render(); return [r.info.render.calls, r.info.render.triangles]; };
    meas();
    const total = meas();
    const med = (f, n = 15) => { const a = []; for (let i = 0; i < n; i++) { const t = performance.now(); f(); a.push(performance.now() - t); } a.sort((x, y) => x - y); return +a[n >> 1].toFixed(2); };
    const worldMs = med(() => g.world.update(g.camera, g.camera.position, 1 / 60, g.time));
    const renderMs = med(() => { g.render(); r.getContext().finish(); }, 3);
    const parts = {};
    g.scene.children.slice().forEach((c, i) => {
      if (!c.visible) return;
      c.visible = false; const m = meas(); c.visible = true;
      if (total[0] - m[0] > 0) parts[(c.name || c.type) + '#' + i] = [total[0] - m[0], total[1] - m[1]];
    });
    let png = null;
    if (shot) { g.render(); png = r.domElement.toDataURL('image/png'); }
    if (name === 'overview') { g.camera.far = far0; g.camera.updateProjectionMatrix(); }
    return { total, worldMs, renderMs, parts: Object.entries(parts).sort((a, b) => b[1][0] - a[1][0]).slice(0, 10), png };
  }, { name, shot: !!shots });
  if (res[name].png) fs.writeFileSync(`${shots}/${q}_${name}.png`, Buffer.from(res[name].png.split(',')[1], 'base64'));
  delete res[name].png;
  console.log(name, JSON.stringify(res[name].total), 'world', res[name].worldMs, 'ms render', res[name].renderMs, 'ms |', res[name].parts.map(([k, p]) => `${k}:${p[0]}`).join(' '));
}
res.mem = await page.evaluate(async () => {
  window.gc?.(); await new Promise((r) => setTimeout(r, 300));
  const g = window.__agro, i = g.renderer.info, by = {};
  const arrs = new Set();
  const one = (a) => { const buf = a?.array?.buffer; if (!buf || arrs.has(buf)) return 0; arrs.add(buf); return buf.byteLength; };
  const bytes = (gg) => { let b = 0; for (const k in gg.attributes) b += one(gg.attributes[k]); return b + one(gg.index); };
  const seen = new Set(), ac = new Set(Object.values(g.fleet).map((a) => a.model.root));
  for (const ch of g.scene.children) {
    const k = ac.has(ch) ? 'aircraft' : (ch.name || ch.type);
    ch.traverse((o) => { if (!o.geometry || seen.has(o.geometry)) return; seen.add(o.geometry); (by[k] ||= 0); by[k] += bytes(o.geometry); });
  }
  const V = g.world.vegetation;
  return {
    heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576), gpuGeo: i.memory.geometries, gpuTex: i.memory.textures, programs: i.programs?.length,
    trees: V?.count ?? null, colliders: V?.colliders?.length ?? null,
    geoMB: Object.fromEntries(Object.entries(by).map(([k, b]) => [k, +(b / 1048576).toFixed(1)]).filter(([, b]) => b > 0.3).sort((x, y) => y[1] - x[1])),
  };
});
res.errors = errs;
console.log('load', loadS, 's mem', JSON.stringify(res.mem), 'errors', errs.length, errs.slice(0, 3).join(' | '));
if (out) fs.writeFileSync(out, JSON.stringify(res, null, 1));
await browser.close();
