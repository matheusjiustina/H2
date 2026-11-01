// Phase 4 audit: per-aircraft scene resources (nodes, meshes, unique geometries / materials /
// textures, texture memory) split into exterior / cockpit / pilot. Usage: AGRO_URL=... node test/p4audit.mjs [out.json]
import { chromium } from 'playwright';
import fs from 'node:fs';
const url = process.env.AGRO_URL || 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(url + '?q=high', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 180000 });
const res = await page.evaluate(() => {
  const g = window.__agro; const out = {};
  const texBytes = (t) => { const im = t.image; const w = im?.width || im?.videoWidth || 0, h = im?.height || 0; return w * h * 4 * (t.generateMipmaps === false ? 1 : 1.33); };
  const scan = (root) => {
    const geos = new Set(), mats = new Set(), texs = new Set(); let nodes = 0, meshes = 0, tris = 0, inst = 0, auto = 0;
    root.traverse((o) => { nodes++; if (o.matrixAutoUpdate) auto++; if (o.isMesh || o.isPoints || o.isLine) {
      meshes++; geos.add(o.geometry); const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach((x) => { mats.add(x); for (const k in x) if (x[k]?.isTexture) texs.add(x[k]); });
      const gi = o.geometry.index; tris += (gi ? gi.count : o.geometry.attributes.position?.count || 0) / 3; } });
    let gb = 0; geos.forEach((G) => { for (const k in G.attributes) gb += G.attributes[k].array.byteLength; if (G.index) gb += G.index.array.byteLength; });
    let tb = 0; texs.forEach((t) => { tb += texBytes(t); });
    return { nodes, meshes, tris: Math.round(tris), geos: geos.size, mats: mats.size, texs: texs.size, geoMB: +(gb / 1048576).toFixed(2), texMB: +(tb / 1048576).toFixed(2), autoMatrix: auto, _t: texs, _g: geos, _m: mats };
  };
  const all = { t: new Map(), g: new Map(), m: new Map() };
  for (const [id, ac] of Object.entries(g.fleet)) {
    const m = ac.model; const root = scan(m.root);
    const ck = m.cockpit ? scan(m.cockpit) : null, pl = m.pilot ? scan(m.pilot) : null;
    for (const [k, S] of [['t', root._t], ['g', root._g], ['m', root._m]]) S.forEach((x) => all[k].set(x, (all[k].get(x) || 0) + 1));
    const strip = (s) => { if (!s) return null; const { _t, _g, _m, ...r } = s; return r; };
    out[id] = { total: strip(root), cockpit: strip(ck), pilot: strip(pl), panelCanvas: !!ac.panel?.texture };
  }
  const shared = { tex: [...all.t.values()].filter((n) => n > 1).length, geo: [...all.g.values()].filter((n) => n > 1).length, mat: [...all.m.values()].filter((n) => n > 1).length, texTotal: all.t.size, geoTotal: all.g.size, matTotal: all.m.size };
  const r = g.renderer.info;
  return { fleet: out, shared, rendererMemory: { geometries: r.memory.geometries, textures: r.memory.textures }, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, bootFlow: window.__bootMs ?? null };
});
console.log(JSON.stringify(res.shared), JSON.stringify(res.rendererMemory), 'heap', res.heapMB);
for (const [id, v] of Object.entries(res.fleet)) console.log(id.padEnd(9), 'total', JSON.stringify(v.total), '\n          cockpit', JSON.stringify(v.cockpit), 'pilot', JSON.stringify(v.pilot));
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(res, null, 1));
await browser.close();
