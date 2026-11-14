// Phase 5 audit: CPU-side bytes (geometry attributes, textures) per scene root group, caches, heap.
import { chromium } from 'playwright';
const url = process.env.AGRO_URL || 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
await page.goto(url + '?q=high', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 180000 });
const r = await page.evaluate(() => {
  const g = window.__agro; const rows = [];
  const seenG = new Set(), seenT = new Set();
  g.scene.children.forEach((c, i) => {
    let gb = 0, tb = 0, nodes = 0, meshes = 0;
    c.traverse((o) => { nodes++; if (o.geometry && !seenG.has(o.geometry)) { seenG.add(o.geometry); meshes++; const G = o.geometry; for (const k in G.attributes) gb += G.attributes[k].array?.byteLength || 0; if (G.index) gb += G.index.array.byteLength; if (o.isInstancedMesh) gb += o.instanceMatrix.array.byteLength; }
      for (const m of [].concat(o.material ?? [])) for (const k in m) { const t = m[k]; if (t?.isTexture && !seenT.has(t)) { seenT.add(t); const im = t.image; if (im?.width) tb += im.width * im.height * 4 * 1.33; } } });
    if (gb + tb > 200000) rows.push([i, c.name || c.type, nodes, +(gb / 1048576).toFixed(1), +(tb / 1048576).toFixed(1)]);
  });
  const w = g.world;
  return { rows: rows.sort((a, b) => (b[3] + b[4]) - (a[3] + a[4])), heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(0),
    terrainGridMB: +((w.terrain.h?.byteLength || 0) / 1048576).toFixed(1), info: { geo: g.renderer.info.memory.geometries, tex: g.renderer.info.memory.textures },
    treeCount: w.vegetation.count, sites: g.sites?.length };
});
console.log(JSON.stringify(r.rows.map((x) => x.join(' ')), null, 0));
const tot = r.rows.reduce((a, x) => a + x[3], 0); console.log('TOTAL geometry/instance MB', tot.toFixed(1), 'terrain', r.rows.find((x) => x[1] === 'terrain')?.[3], 'vegetation', r.rows.find((x) => x[1] === 'vegetation')?.[3]);
console.log('heap', r.heapMB, 'terrain grid MB', r.terrainGridMB, JSON.stringify(r.info), 'trees', r.treeCount, 'sites', r.sites);
await browser.close();
