// Benchmark instrumentation (Phase 1 of the performance work). Loaded ONLY
// when the page is opened with `?bench` (dynamic import in main.js): without
// it nothing here is fetched or run, and the game renders exactly as before.
// It never changes quality, rendering, physics or any setting of the game
// except what the scenarios themselves do (place the aircraft, switch the
// weather) — the same moves test/perf.mjs makes.
//
// What it measures, per scenario, while the game runs its own live loop:
//   frame time avg / P50 / P95 / P99 / max, FPS avg and 1 % low (from the
//   worst 1 % of frames) — from its own requestAnimationFrame deltas;
//   long tasks (> 50 ms) count and total, where the browser offers them;
//   renderer.info: draw calls, triangles, geometries and textures alive;
//   JS heap (Chromium only: performance.memory), start and end of the run;
//   device context: user agent, devicePixelRatio, canvas size, GL renderer,
//   quality preset in force, the game revision of the build.
// Plus, once: time to the first frame after load and the time the "start
// flight" setup takes (`startFlightMs`).
//
// Real devices: open  <game url>?bench&q=high  — a small panel appears;
// "Run" runs every scenario (about a minute), the result is shown as JSON,
// can be copied, and is saved in localStorage under agro-bench-last.
// Compare two results with  node test/benchcompare.mjs a.json b.json.
const SCENARIOS = {
  A_hangar: { label: 'Hangar / base, aircraft parked', setup: (g) => { pick(g, 'ipanema'); g.aircraft.placeAtPad(); cam(g, 'chase'); } },
  B_takeoff: { label: 'Ipanema, loaded, take-off roll', setup: (g) => { pick(g, 'ipanema'); const ac = g.aircraft; ac.fm.hopper = 900; ac.fm.fuel = 200; ac.fm.updateMass(); ac.placeOnRunway('west'); ac.fm.engine = 'running'; ac.fm.rpm = ac.A.idleRpm; ac.fm.throttle = 1; ac.fm.flaps = ac.fm.flapsCmd = 1 / 3; cam(g, 'chase'); } },
  C_lowpass: { label: 'Low pass over a large crop', setup: (g) => { pick(g, 'ipanema'); fly(g, -200, 470, 4); cam(g, 'chase'); } },
  D_spray: { label: 'Spraying with particles and wind', setup: (g) => { pick(g, 'ipanema'); fly(g, 300, -280, 4); g.aircraft.fm.hopper = 700; g.aircraft.fm.updateMass(); g.sprayer.on = true; cam(g, 'chase'); } },
  E_cockpit: { label: 'Air Tractor, cockpit view over the crop', setup: (g) => { pick(g, 'at502'); fly(g, -200, 470, 6); cam(g, 'cockpit'); } },
  F_strip: { label: 'Approach to a relief strip', setup: (g) => { pick(g, 'ipanema'); const s = g.sites.find((x) => x.id === 'mataalta') ?? g.sites.find((x) => !x.main) ?? g.sites[0]; if (s !== g.site) g.service.setSite?.(s); g.aircraft.placeAirborne(s.runway.x0 - 600, s.runway.z, Math.PI / 2, 60, 45); cam(g, 'chase'); } },
  G1_r44: { label: 'R44 helicopter, chase', setup: (g) => { pick(g, 'r44'); g.aircraft.placeAirborne(300, -280, Math.PI / 2, 40, 30); cam(g, 'chase'); } },
  G2_b206: { label: 'Bell 206B helicopter, cockpit', setup: (g) => { pick(g, 'b206'); g.aircraft.placeAirborne(300, -280, Math.PI / 2, 40, 30); cam(g, 'cockpit'); } },
  H_weather: { label: 'Weather and time-of-day changes', setup: (g) => { pick(g, 'ipanema'); fly(g, 300, -280, 60, 50); cam(g, 'chase'); }, during: (g, t, dur) => { const T = ['dawn', 'noon', 'golden', 'dusk'], W = ['clear', 'overcast', 'rain', 'mist']; const k = Math.min(3, Math.floor((t / dur) * 4)); if (g.__benchK !== k) { g.__benchK = k; g.setSetting('timeOfDay', T[k]); g.setSetting('weather', W[k]); } }, after: (g) => { g.setSetting('timeOfDay', 'morning'); g.setSetting('weather', 'partly'); delete g.__benchK; } },
  I_travel: { label: 'Long straight flight between farms (proxy)', setup: (g) => { pick(g, 'ipanema'); fly(g, -2000, -300, 120, 60); cam(g, 'chase'); } },
  J_switch: { label: 'Repeated aircraft / camera / menu changes', setup: (g) => { pick(g, 'ipanema'); cam(g, 'chase'); }, during: (g, t) => { const ids = ['ipanema', 'at502', 'm18', 'e203', 'a188', 'at802', 'r44']; const n = Math.floor(t / 1.2); if (g.__benchN !== n) { g.__benchN = n; g.selectAircraft(ids[n % ids.length]); cam(g, ['chase', 'cockpit', 'orbit'][n % 3]); if (n % 4 === 3) { g.screens.pause?.(); setTimeout(() => g.screens.close?.(), 250); } } }, after: (g) => { delete g.__benchN; } },
};
function pick(g, id) { if (g.aircraftId !== id) g.selectAircraft(id); }
function cam(g, mode) { g.cameraMode = mode; g.rig.setMode(mode, g.aircraft); }
function fly(g, x, z, agl, kt = 46) { const ac = g.aircraft; ac.placeAirborne(x, z, Math.PI / 2, agl, kt * (ac.A.assistSpeedScale ?? 1)); }

const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];

function deviceInfo(g) {
  const gl = g.renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    ua: navigator.userAgent, dpr: devicePixelRatio, cores: navigator.hardwareConcurrency ?? null, deviceMemoryGB: navigator.deviceMemory ?? null,
    screen: [screen.width, screen.height], canvas: [g.canvas.width, g.canvas.height],
    gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'n/a', pixelRatioInUse: g.renderer.getPixelRatio(),
    quality: g.settings.quality, qualityForced: !!g.qualityForced, qualityAuto: !!g.settings.qualityAuto,
  };
}

async function measure(g, def, dur) {
  def.setup(g);
  g.sprayer && def.label.includes('Spraying') && (g.sprayer.on = true);
  await new Promise((r) => setTimeout(r, 1500)); // settle: streaming / shader compilation, not measured
  const dts = [], long = [];
  let po = null;
  try { po = new PerformanceObserver((l) => { for (const e of l.getEntries()) long.push(e.duration); }); po.observe({ entryTypes: ['longtask'] }); } catch { /* not supported */ }
  const heap0 = performance.memory?.usedJSHeapSize ?? null;
  const t0 = performance.now();
  let last = t0;
  await new Promise((resolve) => {
    const step = (now) => {
      dts.push(now - last); last = now;
      def.during?.(g, (now - t0) / 1000, dur);
      if (now - t0 >= dur * 1000) resolve(); else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  po?.disconnect();
  def.after?.(g);
  g.sprayer.on = false;
  dts.shift();
  const s = [...dts].sort((a, b) => a - b);
  if (!s.length) return { label: def.label, seconds: dur, frames: 0, error: 'no frames sampled (frame time longer than the run)' };
  const avg = s.reduce((x, y) => x + y, 0) / s.length;
  const worst = s.slice(Math.floor(s.length * 0.99));
  const w1 = worst.reduce((x, y) => x + y, 0) / Math.max(1, worst.length);
  const info = g.renderer.info;
  return {
    label: def.label, seconds: dur, frames: s.length,
    frameMs: { avg: +avg.toFixed(2), p50: +pct(s, 0.5).toFixed(2), p95: +pct(s, 0.95).toFixed(2), p99: +pct(s, 0.99).toFixed(2), max: +s[s.length - 1].toFixed(2) },
    fps: { avg: +(1000 / avg).toFixed(1), low1pct: +(1000 / w1).toFixed(1) },
    longTasks: { n: long.length, totalMs: +long.reduce((x, y) => x + y, 0).toFixed(0), maxMs: +Math.max(0, ...long).toFixed(0) },
    over33ms: s.filter((v) => v > 33.4).length, over50ms: s.filter((v) => v > 50).length,
    render: { calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures },
    heapMB: { start: heap0 && +(heap0 / 1048576).toFixed(0), end: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(0) : null },
  };
}

export async function runBench(g, { only = null, dur = 10 } = {}) {
  const result = { schema: 1, when: new Date().toISOString(), build: window.__AGRO_BUILD ?? null, url: location.href, device: deviceInfo(g), caveat: 'Scenarios are scripted placements of the live game (G, I and B are proxies); numbers are only comparable between runs on the same device, quality and conditions.', scenarios: {} };
  if (!g.playing) g.menuAction('free');
  g.screens.close?.();
  for (const [k, def] of Object.entries(SCENARIOS)) {
    if (only && !only.includes(k)) continue;
    result.scenarios[k] = await measure(g, def, dur);
  }
  try { localStorage.setItem('agro-bench-last', JSON.stringify(result)); } catch { /* private mode */ }
  return result;
}

// On-screen panel for real devices.
function panel(g) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;width:min(360px,92vw);font:12px/1.35 monospace;color:#e8eef5;background:rgba(5,10,16,.88);border:1px solid #3a5a7a;border-radius:6px;padding:8px;max-height:80vh;overflow:auto';
  el.innerHTML = '<b>AGROWINGS bench</b> <span id="bs">idle</span><br><button id="br">Run all</button> <button id="bc">Copy JSON</button> <button id="bh">Hide</button><br><textarea id="bo" rows="8" style="width:100%;margin-top:6px;font:10px monospace" readonly></textarea>';
  document.body.appendChild(el);
  const $ = (id) => el.querySelector(id);
  let last = null;
  $('#br').onclick = async () => {
    $('#br').disabled = true; $('#bs').textContent = 'running…';
    const q = new URLSearchParams(location.search);
    last = await runBench(g, { dur: +(q.get('dur') ?? 10) });
    $('#bo').value = JSON.stringify(last, null, 1); $('#bs').textContent = 'done'; $('#br').disabled = false;
  };
  $('#bc').onclick = async () => { try { await navigator.clipboard.writeText($('#bo').value); $('#bs').textContent = 'copied'; } catch { $('#bo').select(); $('#bs').textContent = 'select + copy'; } };
  $('#bh').onclick = () => { el.style.display = 'none'; };
}

export function installBench() {
  const t0 = performance.now();
  const wait = () => {
    const g = window.__agro;
    if (g && g.frames > 2) {
      window.__bench = { run: (o) => runBench(g, o), scenarios: Object.keys(SCENARIOS), firstFrameMs: Math.round(performance.now() - t0), device: () => deviceInfo(g) };
      if (!new URLSearchParams(location.search).has('nopanel')) panel(g);
    } else setTimeout(wait, 100);
  };
  wait();
}
