// Phase 6: the spray result must not depend on frame rate or on the number of drawn particles.
// One crosswind pass over field T-07 through the game's own tick pipeline (fixed 120 Hz sim steps + per-frame visual
// emission), at 144 / 60 / 30 / 15 fps and with the mist pool limited to 1800 / 6000 particles. The aircraft is held on a
// rail inside every simulation step (as test/spray.test.mjs does), so only the pipeline can make results differ.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
page.setDefaultTimeout(900000);
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.AGRO_URL || 'http://localhost:5173/') + '?q=low', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 300000 });
const res = await page.evaluate(async () => {
  const g = window.__agro; g.frozen = true; g.noRender = true;
  const { FieldCoverage } = await import('/src/spray/coverage.js');
  const { CONTRACT_FIELDS } = await import('/src/world/layout.js');
  const soy = CONTRACT_FIELDS.find((f) => f.name === 'T-07');
  const out = [];
  for (const limit of [1800, 6000]) for (const fps of [144, 60, 30, 15]) {
    g.selectAircraft('ipanema'); g.menuAction('free'); g.screens.close();
    const ac = g.aircraft, fm = ac.fm, env = ac.env, z = -280;
    ac.windVec.set(2.5, 0, 3);
    const cov = new FieldCoverage(soy); g.sprayer.setTargets([cov]); g.sprayer.on = true;
    g.sprayer.onTarget = g.sprayer.offTarget = g.sprayer.sprayed = g.sprayer.lost = 0; g.sprayer.emitAcc = 0;
    g.mist.limit = limit;
    fm.hopper = 900; fm.fuel = 160; fm.updateMass();
    const x0 = soy.x0 - 30, top = env.top(x0, z);
    ac.placeAirborne(x0, z, Math.PI / 2, 3.4, 46);
    fm.pos.set(x0, top + ac.A.aglOffset + 3.4, z); fm.throttle = 0.75;
    const Y = fm.pos.clone().set(0, 1, 0);
    const orig = ac.onSimStep;
    ac.simTime = 0; let snap = null;
    const sumDose = () => { let q = 0; for (let k = 0; k < cov.dose.length; k++) q += cov.dose[k]; return q; };
    ac.onSimStep = (h) => { fm.quat.setFromAxisAngle(Y, Math.PI / 2); fm.omega.set(0, 0, 0); fm.vel.set(46, 0, 0); fm.pos.y = env.top(fm.pos.x, z) + ac.A.aglOffset + 3.4; fm.pos.z = z; orig(h); if (!snap && fm.pos.x >= soy.x1 + 30) snap = { dose: sumDose(), hopper: fm.hopper, on: g.sprayer.onTarget, off: g.sprayer.offTarget, x: fm.pos.x, t: ac.simTime }; };
    let maxPart = 0, n = 0;
    while (fm.pos.x < soy.x1 + 30 && n++ < 100000) { g.tick(1 / fps); maxPart = Math.max(maxPart, g.mist.points?.geometry?.drawRange?.count ?? 0); }
    ac.onSimStep = orig;
    out.push({ limit, fps, ticks: n, doseSum: +snap.dose.toFixed(3), hopper: +snap.hopper.toFixed(3), onTarget: +snap.on.toFixed(3), offTarget: +snap.off.toFixed(3), x: +snap.x.toFixed(2), t: +snap.t.toFixed(3) });
    g.sprayer.on = false;
  }
  return out;
});
for (const r of res) console.log(JSON.stringify(r));
const base = res[0]; const bad = res.filter((r) => Math.abs(r.doseSum - base.doseSum) > 0.002 * base.doseSum || Math.abs(r.hopper - base.hopper) > 0.01);
console.log(bad.length ? 'DIFFERENT: ' + JSON.stringify(bad.map((b) => [b.limit, b.fps])) : 'spray result identical across fps and particle limits (dose, hopper within tolerance)', errors.length ? errors : 'no page errors');
await browser.close();
