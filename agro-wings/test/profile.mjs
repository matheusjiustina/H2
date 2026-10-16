// Performance profile of a build (Chromium). Records start-up time, GPU
// object counts, JS heap, and per-view frame-time statistics (game tick +
// render submit, avg / p95 / p99 over N frames), draw calls and triangles.
// NOTE: in this container the GPU is SwiftShader (CPU rasteriser): render
// times are not representative of real hardware; tick times, draw calls,
// triangles and memory are.
// Usage: AGRO_URL=http://localhost:4173/ node test/profile.mjs [quality] [aircraft] [ticks] [frames]
// Tick statistics use [ticks] game ticks (no render); frame statistics (tick
// + render submit) use [frames] rendered frames.
import { chromium } from 'playwright';

const url = process.env.AGRO_URL || 'http://localhost:4173/';
const quality = process.argv[2] || 'medium';
const aircraft = process.argv[3] || 'ipanema';
const N = +(process.argv[4] || 120);
const R = +(process.argv[5] || 12);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const t0 = Date.now();
await page.goto(url + '?q=' + quality, { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
const loadMs = Date.now() - t0;
const views = {
  pad: `g.aircraft.placeAtPad(); g.cameraMode='chase'; g.rig.setMode('chase', g.aircraft);`,
  spraySoy: `g.aircraft.placeAirborne(300, -280, Math.PI/2, 4, 46 * (g.aircraft.A.assistSpeedScale ?? 1)); g.sprayer.on = true; g.aircraft.fm.hopper = 500; g.cameraMode='chase'; g.rig.setMode('chase', g.aircraft);`,
  cockpitCorn: `g.aircraft.placeAirborne(-200, 470, Math.PI/2, 6, 46 * (g.aircraft.A.assistSpeedScale ?? 1)); g.cameraMode='cockpit'; g.rig.setMode('cockpit', g.aircraft);`,
  high: `g.aircraft.placeAirborne(500, 0, Math.PI/2, 400, 50 * (g.aircraft.A.assistSpeedScale ?? 1)); g.cameraMode='chase'; g.rig.setMode('chase', g.aircraft);`,
};
const res = await page.evaluate(async ({ views, N, R, aircraft }) => {
  const g = window.__agro;
  if (g.fleet && g.fleet[aircraft]) g.selectAircraft(aircraft);
  g.frozen = true;
  g.menuAction('free');
  const out = {};
  for (const [name, setup] of Object.entries(views)) {
    new Function('g', setup)(g);
    for (let i = 0; i < 6; i++) { g.tick(1 / 60); g.render(); }
    for (let i = 0; i < 30; i++) g.tick(1 / 60);
    const ft = [], tk = [];
    for (let i = 0; i < N; i++) {
      const a = performance.now();
      g.tick(1 / 60);
      tk.push(performance.now() - a);
    }
    for (let i = 0; i < R; i++) {
      const a = performance.now();
      g.tick(1 / 60);
      g.render();
      ft.push(performance.now() - a);
    }
    const st = (arr) => { const s = arr.slice().sort((x, y) => x - y); const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return { avg: +(arr.reduce((x, y) => x + y, 0) / arr.length).toFixed(2), p95: +q(0.95).toFixed(2), p99: +q(0.99).toFixed(2) }; };
    const info = g.renderer.info;
    out[name] = { tick: st(tk), frame: st(ft), calls: info.render.calls, tris: info.render.triangles };
  }
  const info = g.renderer.info;
  out.memory = { geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length, jsHeapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(0) : null };
  return out;
}, { views, N, R, aircraft });
console.log(JSON.stringify({ quality, aircraft, loadMs, ...res }));
await browser.close();
