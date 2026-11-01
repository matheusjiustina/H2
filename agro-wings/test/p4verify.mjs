// Phase 4 verification. Usage: AGRO_URL=... node test/p4verify.mjs <outDir> [views|switch|all]
//  views : every parked aircraft seen close up, frozen (asset manager) vs thawed (original meshes) — pixel diff + draw calls
//  switch: select every aircraft twice, cockpit camera, engine start, back — resources / heap per step
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] || 'p4v';
const mode = process.argv[3] || 'all';
fs.mkdirSync(out, { recursive: true });
const url = process.env.AGRO_URL || 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('pageerror', e.message); });
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) { errors.push(m.text()); console.log('console error', m.text().slice(0, 200)); } });
await page.goto(url + '?q=high', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 180000 });
await page.evaluate(() => { const g = window.__agro; g.frozen = true; g.noRender = true; g.menuAction('free'); g.screens.close(); const st = document.createElement('style'); st.textContent = '.overlay,.hud,.loading{display:none!important}'; document.head.appendChild(st); });
const summary = {};
if (mode === 'views' || mode === 'all') {
  const ids = (process.env.ONLY ? process.env.ONLY.split(',') : null) ?? await page.evaluate(() => Object.keys(window.__agro.fleet));
  const st = await page.evaluate(() => window.__agro.assets.report());
  console.log('assets', JSON.stringify(st));
  summary.views = {};
  for (const id of ids) {
    const setup = await page.evaluate((id) => {
      const g = window.__agro; const ac = g.fleet[id];
      if (ac === g.aircraft) return null;
      ac.model.root.visible = true;
      const p = ac.rPos; const cam = g.camera;
      cam.position.set(p.x + 14, p.y + 4, p.z + 14); cam.up.set(0, 1, 0); cam.lookAt(p.x, p.y + 1.5, p.z);
      cam.fov = 55; cam.near = 0.1; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      const r = g.renderer; g.render(); r.info.reset?.(); g.render();
      return { calls: r.info.render.calls, tris: r.info.render.triangles };
    }, id);
    if (!setup) continue;
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${out}/${id}_frozen.png`, timeout: 180000 });
    const thawed = await page.evaluate((id) => {
      const g = window.__agro; g.assets.thaw(id); const r = g.renderer; g.render(); r.info.reset?.(); g.render();
      const o = { calls: r.info.render.calls, tris: r.info.render.triangles }; return o;
    }, id);
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${out}/${id}_thawed.png`, timeout: 180000 });
    await page.evaluate((id) => window.__agro.assets.freeze(id), id);
    summary.views[id] = { frozen: setup, thawed };
    console.log(id, JSON.stringify(summary.views[id]));
  }
}
if (mode === 'switch' || mode === 'all') {
  await page.evaluate(() => { const g = window.__agro; g.frozen = false; g.noRender = false; });
  const ids = await page.evaluate(() => Object.keys(window.__agro.fleet));
  const snap = (label) => page.evaluate((label) => {
    const g = window.__agro, r = g.renderer.info; let nodes = 0, vis = 0; g.scene.traverse((o) => { nodes++; });
    return { label, active: g.aircraftId, geo: r.memory.geometries, tex: r.memory.textures, programs: r.programs.length, nodes, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, frames: g.frames };
  }, label);
  summary.switch = [await snap('start')];
  for (let round = 0; round < 2; round++) for (const id of ids) {
    const t0 = Date.now();
    await page.evaluate((id) => { const g = window.__agro; g.selectAircraft(id); g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', g.aircraft); }, id);
    await page.waitForFunction(() => window.__agro.frames > 0 && true, null, { timeout: 60000 });
    const f0 = await page.evaluate(() => window.__agro.frames);
    await page.waitForFunction((f) => window.__agro.frames > f + 1, f0, { timeout: 120000 });
    const s = await snap(`r${round} ${id} cockpit`);
    s.panel = await page.evaluate(() => { const a = window.__agro.aircraft; return { engine: a.fm.engine, parked: !!a.parked, cockpitVisible: a.model.cockpit.visible, pilotVisible: a.model.pilot.visible, assets: window.__agro.assets?.report().aircraft[window.__agro.aircraftId].state }; });
    s.ms = Date.now() - t0;
    summary.switch.push(s);
    console.log(JSON.stringify(s));
    await page.evaluate(() => { const g = window.__agro; g.cameraMode = 'chase'; g.rig.setMode('chase', g.aircraft); });
  }
  summary.switch.push(await snap('end'));
  summary.assetsFinal = await page.evaluate(() => window.__agro.assets?.report());
}
summary.errors = errors;
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 1));
await browser.close();
