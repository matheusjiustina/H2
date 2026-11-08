// Adaptive Graphics Engine (performance phase 2, revised): the rules checked in
// the real game (browser), with frame times fed to the game's own PerfManager
// (SwiftShader frames are all "stalls" here, so the clock is driven):
//   1 automatic mode degrades in order: secondary effects (particle budgets
//     halved) → resolution steps → profile, and recovers in reverse;
//   2 no profile climb in the air; at most one profile drop per 2 min of flight;
//   3 cockpit: canvas ≥ 1 device px per CSS px; back outside;
//   4 manual profiles: no profile change; manual Ultra Original: nothing at all;
//   5 the flight model is untouched (fixed step, same state after the same input);
//   6 page errors, WebGL errors.
//   AGRO_URL=http://localhost:5173/ node test/agecheck.mjs
import { chromium } from 'playwright';
const url = process.env.AGRO_URL || 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = []; const ok = (k, v, info) => { results.push([k, !!v]); console.log(v ? 'PASS' : 'FAIL', k, info ?? ''); };
async function open(qs = '', vp = { width: 640, height: 400 }) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = []; let gl = 0;
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (/WebGL: INVALID/.test(m.text())) gl++; });
  await page.goto(url + qs, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 400000 });
  await page.evaluate(() => { const g = window.__agro; g.frozen = true; g.noRender = true; g.menuAction('free'); g.screens.close(); });
  return { page, errs, gl: () => gl };
}
// Feed `ms` of frames of `dt` ms to the PerfManager (game clock driven too).
const FEED = ({ ms, dt, fly }) => {
  const g = window.__agro, p = g.perf;
  window.__t ??= 1e6;
  const out = [];
  for (let t = 0; t < ms; t += dt) {
    window.__t += dt;
    if (fly) g.tick(dt / 1000);
    const before = { profile: p.profileId, scale: p.ctl.scale, fx: p.ctl.fx };
    p.update(window.__t, dt);
    const after = { profile: p.profileId, scale: p.ctl.scale, fx: p.ctl.fx };
    if (JSON.stringify(before) !== JSON.stringify(after)) out.push({ t: Math.round(window.__t / 1000), onGround: g.aircraft.fm.out.onGround, mist: g.mist?.limit, ...after });
  }
  return out;
};
// ---- 1, 2: automatic mode
{
  const { page, errs, gl } = await open('?mem=mid');
  await page.evaluate(() => { const g = window.__agro; g.perf.setProfile('auto'); g.perf.profileId = 'alto'; g.perf.ctl.configure({ auto: true, profile: 'alto', scale: 1 }, 0); g.perf.apply(); });
  // On the ground, slow (30 fps against 60): effects, then resolution, then a profile.
  const down = await page.evaluate(FEED, { ms: 90000, dt: 33 });
  const first = down[0], iRes = down.findIndex((d) => d.scale < 1), iProf = down.findIndex((d) => d.profile !== 'alto');
  ok('1a degrade order: effects first (particle budget halved), then resolution, then profile', first?.fx === 1 && first.scale === 1 && first.profile === 'alto' && iRes > 0 && (iProf === -1 || iProf > iRes) && first.mist <= 2500, JSON.stringify(down.slice(0, 4)));
  // Recovery on the ground (fast frames): resolution up, effects back, profile up.
  const up = await page.evaluate(FEED, { ms: 400000, dt: 9 });
  const fxBack = up.findIndex((d) => d.fx === 0), profUp = up.findIndex((d, i) => i > 0 && d.profile !== up[i - 1].profile) ;
  ok('1b recovery: resolution first, effects back before a profile climb', fxBack > 0 && up.slice(0, fxBack).every((d) => d.fx === 1) && (profUp === -1 || profUp > fxBack), JSON.stringify(up.slice(0, 6)));
  // In the air: slow frames for 5 minutes → at most ~one profile drop per 2 min; then fast frames → no climb.
  await page.evaluate(() => { const g = window.__agro, ac = g.aircraft; ac.placeAirborne(300, -280, Math.PI / 2, 300, 48); g.perf.profileId = 'ultra'; g.perf.ctl.configure({ auto: true, profile: 'ultra', scale: 1 }, window.__t); g.perf.apply(); });
  const airDown = await page.evaluate(FEED, { ms: 300000, dt: 40, fly: true });
  const drops = airDown.filter((d, i) => d.profile !== (i ? airDown[i - 1].profile : 'ultra'));
  const gaps = drops.slice(1).map((d, i) => d.t - drops[i].t);
  ok('2a in the air: profile drops at most one per 2 min (effects / resolution free)', drops.length >= 1 && gaps.every((s) => s >= 119) && airDown.every((d) => !d.onGround), JSON.stringify(drops.map((d) => [d.t, d.profile])));
  await page.evaluate(() => { const g = window.__agro, ac = g.aircraft; ac.placeAirborne(300, -280, Math.PI / 2, 300, 48); });
  const airUp = await page.evaluate(FEED, { ms: 300000, dt: 9, fly: true });
  const climbs = airUp.filter((d, i) => i && d.profile !== airUp[i - 1].profile);
  ok('2b in the air: no profile climb (resolution / effects may recover)', climbs.length === 0 && airUp.length > 0, JSON.stringify(airUp.slice(-3)));
  // ---- 3 cockpit legibility
  const ck = await page.evaluate(() => {
    const g = window.__agro, p = g.perf;
    p.profileId = 'economico'; p.ctl.configure({ auto: true, profile: 'economico', scale: 0.6 }, window.__t); p.apply();
    g.cameraMode = 'chase'; g.rig.setMode('chase', g.aircraft); p.update(window.__t += 16, 16); const outR = g.renderer.getPixelRatio();
    g.cameraMode = 'cockpit'; g.rig.setMode('cockpit', g.aircraft); p.update(window.__t += 16, 16); const inR = g.renderer.getPixelRatio();
    g.cameraMode = 'chase'; g.rig.setMode('chase', g.aircraft); p.update(window.__t += 16, 16); const backR = g.renderer.getPixelRatio();
    return { outR, inR, backR, dpr: devicePixelRatio };
  });
  ok('3 cockpit: ≥ 1 device px per CSS px for the instruments; the profile ratio outside', ck.inR >= Math.min(ck.dpr, 1) - 1e-6 && ck.outR < ck.inR && Math.abs(ck.backR - ck.outR) < 1e-6, JSON.stringify(ck));
  ok('6a no page errors / WebGL errors (automatic)', errs.length === 0 && gl() === 0, JSON.stringify(errs.slice(0, 3)));
  await page.context().close();
}
// ---- 4 manual profiles
{
  const { page, errs } = await open('?mem=mid');
  const r = await page.evaluate((FEEDsrc) => {
    const FEED = new Function('return ' + FEEDsrc)();
    const g = window.__agro, p = g.perf; const res = {};
    p.setProfile('medio'); res.medio = FEED({ ms: 120000, dt: 40 }); res.medioProfiles = [...new Set(res.medio.map((d) => d.profile))];
    p.setProfile('ultra'); res.ultra = FEED({ ms: 120000, dt: 60 });
    return { medioProfiles: res.medioProfiles, medioSteps: res.medio.length, ultraSteps: res.ultra.length, ultraScale: p.ctl.scale, ultraFx: p.ctl.fx };
  }, FEED.toString());
  ok('4 manual: Medium keeps its profile (effects / resolution only); Ultra Original is never touched', r.medioProfiles.length === 1 && r.medioProfiles[0] === 'medio' && r.medioSteps > 0 && r.ultraSteps === 0 && r.ultraScale === 1 && r.ultraFx === 0, JSON.stringify(r));
  ok('6b no page errors (manual)', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
  await page.context().close();
}
// ---- 5 the flight model does not depend on the graphics: same input, same state, whatever the profile
{
  const sim = async (prof) => {
    const { page } = await open(`?q=${prof}&mem=mid`);
    const s = await page.evaluate(() => {
      const g = window.__agro, ac = g.aircraft; Math.random = (() => { let x = 1; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
      ac.placeAirborne(300, -280, Math.PI / 2, 150, 48); ac.fm.throttle = 0.7;
      for (let i = 0; i < 600; i++) g.tick(1 / 60);
      const p = ac.fm.pos; return [p.x, p.y, p.z, ac.fm.vel.length()].map((v) => +v.toFixed(4));
    });
    await page.context().close();
    return s;
  };
  const a = await sim('economico'), b = await sim('ultra');
  ok('5 flight model: 10 s of flight identical on Economy and Ultra', JSON.stringify(a) === JSON.stringify(b), JSON.stringify({ a, b }));
}
const fails = results.filter((r) => !r[1]).length;
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
await browser.close();
