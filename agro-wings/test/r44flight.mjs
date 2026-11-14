// R44 validation in the browser through the player's inputs (keyboard
// actions), with assertions: aircraft 03 picked on the title screen, spawn
// on the helipad, rotor states and visuals (blur, solid blades, rotation
// sense of both rotors), start-up, vertical take-off, hover, translations,
// pedal turns, landing on the skids, shut-down and run-down, camera modes,
// and the panel against the simulation. Screenshots go to <outDir>.
// The default flies the power model (Settings → Helicopter model → Power, the
// game's default: the power keys are the only control for up and down, set
// against the hover figure the HUD shows); MODEL=rotor flies the detailed
// rotor model with the 'high' assist's climb-rate lever.
// Usage: AGRO_URL=... [MODEL=rotor] node test/r44flight.mjs [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] || 'r44-out';
fs.mkdirSync(outDir, { recursive: true });
const url = process.env.AGRO_URL || 'http://localhost:4173/';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
await page.goto(url + '?q=low', { waitUntil: 'load' });
await page.waitForFunction(() => window.__agro && window.__agro.frames > 2, null, { timeout: 180000 });
await page.evaluate(() => localStorage.clear());

const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };

// --- selection (title screen) ---------------------------------------------
await page.click('[data-ac="r44"]');
const sel = await page.evaluate(() => ({ id: window.__agro.aircraftId, kind: window.__agro.aircraft.kind, checked: document.querySelector('[data-ac="r44"]').getAttribute('aria-checked'), role: document.querySelector('[data-ac="r44"] .ac-role')?.textContent }));
check('selection: card 03 selects the R44', sel.id === 'r44' && sel.kind === 'heli' && sel.checked === 'true', JSON.stringify(sel));
await page.screenshot({ path: `${outDir}/00_title.png` });
await page.click('[data-a="free"]');
const PM = (process.env.MODEL ?? 'power') !== 'rotor';
await page.evaluate((pm) => { const g = window.__agro; g.frozen = true; g.noRender = true; g.setSetting('heliAssist', 'normal'); g.setSetting('heliModel', pm ? 'power' : 'rotor'); }, PM);

const st = () => page.evaluate(() => {
  const g = window.__agro, ac = g.aircraft, fm = ac.fm, o = fm.out;
  return {
    t: +ac.simTime.toFixed(1), eng: fm.engine, phase: fm.phase, rs: ac.rotorState, nr: +o.rotorPct.toFixed(1), hp: Math.round(fm.power / 745.7),
    coll: +fm.collective.toFixed(3), agl: +o.agl.toFixed(2), kt: +(o.airspeed * 1.944).toFixed(1), vs: +o.vs.toFixed(2), hdg: +ac.headingDeg().toFixed(1),
    x: +fm.pos.x.toFixed(2), z: +fm.pos.z.toFixed(2), y: +fm.pos.y.toFixed(3), gnd: o.onGround, skids: fm.skid.filter((s) => s.onGround).length,
    state: ac.state, why: ac.crashReason, dmg: +ac.damage.toFixed(1), lastTouch: ac.lastTouch, fwd: 0,
    vf: +(fm.vel.x * Math.sin(fm.heading()) + fm.vel.z * Math.cos(fm.heading())).toFixed(2),
    vl: +(fm.vel.x * Math.cos(fm.heading()) - fm.vel.z * Math.sin(fm.heading())).toFixed(2), // + = left
  };
});
// n seconds of game time with actions held, 60 Hz.
const run = (sec, actions = []) => page.evaluate(([sec, actions]) => {
  const g = window.__agro;
  for (const a of actions) g.input.pressAction(a);
  for (let i = 0; i < Math.round(sec * 60); i++) g.tick(1 / 60);
  for (const a of actions) g.input.releaseAction(a);
  g.tick(1 / 60);
}, [sec, actions]);
const until = (cond, maxSec, actions = []) => page.evaluate(([cond, maxSec, actions]) => {
  const g = window.__agro, f = new Function('g', 'return ' + cond);
  for (const a of actions) g.input.pressAction(a);
  let t = 0;
  while (t < maxSec && !f(g)) { g.tick(1 / 60); t += 1 / 60; }
  for (const a of actions) g.input.releaseAction(a);
  return t;
}, [cond, maxSec, actions]);
// Power model: work the power keys (as a player watching the HUD) until the
// power reads the hover figure + d, then let go.
const powerTo = (d, maxSec = 4) => page.evaluate(([d, maxSec]) => {
  const g = window.__agro, ac = g.aircraft;
  let t = 0;
  for (; t < maxSec; t += 1 / 60) {
    const tm = ac.telemetry(), want = Math.min(1, Math.max(0, tm.hoverPower + d));
    const err = want - tm.power;
    if (Math.abs(err) < 0.012) break;
    const a = err > 0 ? 'throttleUp' : 'throttleDown';
    g.input.pressAction(a); g.tick(1 / 60); g.input.releaseAction(a);
  }
  g.tick(1 / 60);
  return t;
}, [d, maxSec]);
const snap = async (name, mode = 'chase') => {
  await page.evaluate((mode) => {
    const g = window.__agro;
    if (g.cameraMode !== mode) { g.cameraMode = mode; g.rig.setMode(mode, g.aircraft); }
    g.rig.initialized = false;
    for (let i = 0; i < 3; i++) g.tick(1 / 60);
    g.render();
  }, mode);
  await page.waitForTimeout(80);
  await page.screenshot({ path: `${outDir}/${name}.png` });
};
// Rotor visuals: blade opacity, blur disc, and the rotation sense of both
// rotors: the simulation's sense (one physics step) applied to the model.
const visuals = () => page.evaluate(() => {
  const g = window.__agro, ac = g.aircraft, m = ac.model, fm = ac.fm;
  const V = m.root.position.constructor;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  // One physics step (the tail rotor turns > π per rendered frame).
  const a0 = fm.rotorAngle, t0 = fm.tailAngle;
  fm.step(fm.A.sim.dt, ac.env);
  const dMain = Math.sign(wrap(fm.rotorAngle - a0)), dTail = Math.sign(wrap(fm.tailAngle - t0));
  const out = {
    bladeOpacity: m.blades[0].mesh.material.opacity, bladeVisible: m.blades[0].mesh.visible,
    disc: m.disc.visible ? m.disc.material.userData.u.uOpacity.value : 0, blur: m.disc.material.userData.u.uBlur.value,
  };
  const ra = fm.rotorAngle, ta = fm.tailAngle;
  const tip = (obj, local) => m.root.worldToLocal(obj.localToWorld(new V(...local)));
  const pose = (r, t) => { fm.rotorAngle = r; fm.tailAngle = t; m.update(0, fm, ac); m.root.updateMatrixWorld(true); };
  // Main rotor, blade 0 tip: (r x v).y > 0 = counter-clockwise from above.
  pose(0, ta); const m0 = tip(m.blades[0].mesh, [5, 0, 0]);
  pose(0.02 * dMain, ta); const m1 = tip(m.blades[0].mesh, [5, 0, 0]);
  const hub = m.rotor.position;
  const r = m0.clone().sub(hub), v = m1.clone().sub(m0);
  out.mainCrossY = r.z * v.x - r.x * v.z;
  // Tail rotor, blade 0 at the bottom of its disc: velocity along +Z (forward).
  pose(ra, Math.PI); const q0 = tip(m.tailBlades[0].mesh, [0, 0.7, 0]);
  pose(ra, Math.PI + 0.02 * dTail); const q1 = tip(m.tailBlades[0].mesh, [0, 0.7, 0]);
  out.tailBottom = q0.y < m.tail.position.y; out.tailVz = q1.z - q0.z;
  pose(ra, ta);
  out.turning = dMain !== 0;
  return out;
});

// --- spawn ---------------------------------------------------------------
await run(0.5);
let s = await st();
check('spawn on the helipad, all four skids on the ground, heading east', Math.hypot(s.x + 323, s.z + 48) < 1 && s.gnd && s.skids === 4 && Math.abs(s.hdg - 90) < 2, JSON.stringify({ x: s.x, z: s.z, hdg: s.hdg, skids: s.skids }));
check('rotor state at rest: STOPPED', s.rs === 'STOPPED', s.rs);
let vis = await visuals();
check('rotor at rest: solid blades, no blur disc', vis.bladeVisible && vis.bladeOpacity > 0.99 && vis.disc < 0.01, JSON.stringify(vis));
await snap('01_pad');

// --- start-up --------------------------------------------------------------
await run(0.6, ['engine']);
s = await st();
check('start: engine cranking, rotor state STARTING', s.eng === 'cranking' && s.rs === 'STARTING', `${s.eng} ${s.rs}`);
await until('g.aircraft.fm.engine === "running" && g.aircraft.fm.out.rotorPct > 25', 30);
vis = await visuals();
await snap('02_spinup');
check('spin-up (~25 %): blades still distinct, short blur', vis.bladeOpacity > 0.5 && vis.blur < 0.6, JSON.stringify({ op: +vis.bladeOpacity.toFixed(2), blur: +vis.blur.toFixed(2) }));
check('main rotor turns counter-clockwise seen from above', vis.mainCrossY > 0, vis.mainCrossY.toFixed(4));
const tSpool = await until('g.aircraft.rotorState === "NORMAL" && g.aircraft.fm.out.rotorPct > 100.5', 60);
await run(5);
s = await st();
check('governor: NORMAL at 101–103 % on the ground', s.rs === 'NORMAL' && s.nr > 100.5 && s.nr < 103.5 && s.gnd, `${s.rs} ${s.nr} % after ${tSpool.toFixed(0)} s more`);
vis = await visuals();
check('at 100 %: blur disc shown, solid blades faded', vis.disc > 0.5 && vis.bladeOpacity < 0.2, JSON.stringify({ disc: +vis.disc.toFixed(2), op: +vis.bladeOpacity.toFixed(2), blur: +vis.blur.toFixed(2) }));
check('tail rotor: advancing blade at the bottom (moves forward)', vis.tailBottom && vis.tailVz > 0, `${vis.tailVz.toFixed(4)}`);
await snap('03_running_chase');
await snap('04_running_cockpit', 'cockpit');

// --- panel against the simulation ------------------------------------------
const inst = await page.evaluate(() => {
  const g = window.__agro, ac = g.aircraft, fm = ac.fm, o = fm.out, d = ac.instruments();
  ac.panel.draw(d);
  return { d: { rotorPct: d.rotorPct, enginePct: d.enginePct, map: d.map, fuel: d.fuel, hopper: d.hopper, altFt: d.altFt, hdg: d.hdg, rotorState: d.rotorState, gov: d.gov },
    sim: { rotorPct: o.rotorPct, enginePct: o.enginePct, map: fm.map, fuel: fm.fuel, hopper: fm.hopper, altFt: (fm.pos.y + 320) * 3.28084, hdg: ac.headingDeg() } };
});
check('instruments read the simulation (rotor, engine, MAP, fuel, tank, altitude, heading)',
  Math.abs(inst.d.rotorPct - inst.sim.rotorPct) < 1e-6 && Math.abs(inst.d.enginePct - inst.sim.enginePct) < 1e-6 && Math.abs(inst.d.map - inst.sim.map) < 1e-6 &&
  Math.abs(inst.d.fuel - inst.sim.fuel) < 1e-6 && Math.abs(inst.d.hopper - inst.sim.hopper) < 1e-6 && Math.abs(inst.d.altFt - inst.sim.altFt) < 0.5 && Math.abs(inst.d.hdg - inst.sim.hdg) < 1e-6,
  JSON.stringify(inst.d));

// --- vertical take-off (normal assist: the lever is the pilot's) ------------
const p0 = await st();
const tLift = await until('!g.aircraft.fm.out.onGround && g.aircraft.fm.out.agl > 0.3', 12, ['throttleUp']);
// Stop raising once light on the skids; the aircraft climbs away vertically.
if (PM) await powerTo(0.06);
const tUp = await until('g.aircraft.fm.out.agl > 3', 10);
s = await st();
check('vertical take-off: off the skids, climbing, little drift', s.agl > 2.9 && s.vs > 0 && Math.hypot(s.x - p0.x, s.z - p0.z) < 2 && s.state === 'ok',
  `lift after ${tLift.toFixed(1)} s of ${PM ? 'power' : 'collective'} (lever ${s.coll}), 3 m after ${tUp.toFixed(1)} s more, drift ${Math.hypot(s.x - p0.x, s.z - p0.z).toFixed(2)} m`);
await snap('05_liftoff');
if (PM) await powerTo(0);
else await until('g.aircraft.fm.out.vs < 0.2', 8, ['throttleDown']);

// --- hover (high assist: hover hold; rotor model: also height hold) ----------
await page.evaluate(() => window.__agro.setSetting('heliAssist', 'high'));
await run(8);
if (PM) await powerTo(0);
const h0 = await st();
await run(20);
const h1 = await st();
check(`hover 20 s (high assist${PM ? ', power at the hover figure' : ''}): position and height held`, Math.hypot(h1.x - h0.x, h1.z - h0.z) < 3 && Math.abs(h1.y - h0.y) < (PM ? 1.2 : 0.6) && h1.rs === 'NORMAL',
  `drift ${Math.hypot(h1.x - h0.x, h1.z - h0.z).toFixed(2)} m, dh ${(h1.y - h0.y).toFixed(2)} m, NR ${h1.nr} %`);
await snap('06_hover_orbit', 'orbit');
await snap('06b_hover_cockpit', 'cockpit');
await snap('06c_hover_chase', 'chase');
// Climb and descend: power above / below the hover figure (rotor model: the
// lever's climb-rate command).
const c0 = await st();
if (PM) { await powerTo(0.15); await run(3); } else await run(3, ['throttleUp']);
const c1 = await st();
if (PM) { await powerTo(-0.15); await run(4); } else await run(3, ['throttleDown']);
const c2 = await st();
check(PM ? 'power climbs and descends' : 'collective climbs and descends', c1.y - c0.y > 3 && c2.y < c1.y - 2, `+${(c1.y - c0.y).toFixed(1)} m, then ${(c2.y - c1.y).toFixed(1)} m`);
if (PM) await powerTo(0);
await run(4);
if (PM) await powerTo(0);

// --- translations ---------------------------------------------------------------
// (Power model: up to ~10 m first, clear of the service truck parked north of the pad.)
if (PM) { await powerTo(0.1); await until('g.aircraft.fm.out.agl > 10', 8); await powerTo(0); await run(3); }
const tr = {};
for (const [name, act] of [['forward', 'pitchDown'], ['backward', 'pitchUp'], ['left', 'rollLeft'], ['right', 'rollRight']]) {
  // (Power model: a short press — the tilt grows while it is held — and the
  // speed still builds for a moment while it levels.)
  if (PM) { await run(1.8, [act]); await run(1); } else await run(3.5, [act]);
  const q = await st();
  tr[name] = { vf: q.vf, vl: q.vl, ...(q.state !== 'ok' ? { crashed: q.why, at: [q.x, q.z, q.agl] } : {}) };
  // Hover hold stops it (power model: it levels, glides on and slows down
  // by itself, then holds the hover).
  if (PM) { await until('Math.hypot(g.aircraft.fm.vel.x, g.aircraft.fm.vel.z) < 0.6', 40); await run(2); } else await run(8);
}
check('translations: forward, backward, left, right', tr.forward.vf > 3 && tr.backward.vf < -2 && tr.left.vl > 2 && tr.right.vl < -2, JSON.stringify(tr));

// --- yaw ---------------------------------------------------------------------------
const y0 = await st();
await run(2, ['yawLeft']);
const y1 = await st();
await run(4);
const y2 = await st();
await run(6);
const y3 = await st();
// Compass headings: nose left = decreasing.
const dHdg = (a, b) => ((b - a + 540) % 360) - 180;
check('pedals: left pedal yaws nose left, heading then held', dHdg(y0.hdg, y1.hdg) < -25 && Math.abs(dHdg(y2.hdg, y3.hdg)) < 3,
  `${dHdg(y0.hdg, y1.hdg).toFixed(0)}° in 2 s, then ${dHdg(y2.hdg, y3.hdg).toFixed(1)}° in 6 s`);
await run(2, ['yawRight']);
const y4 = await st();
check('pedals: right pedal yaws nose right', dHdg(y3.hdg, y4.hdg) > 25, `+${dHdg(y3.hdg, y4.hdg).toFixed(0)}°`);
await run(5);

// --- forward flight and camera modes ---------------------------------------------
// Point south (over the strip, clear of the lone tree east of the pad), climb.
const cur = (await st()).hdg;
await until('Math.abs(((g.aircraft.headingDeg() - 180 + 540) % 360) - 180) < 4', 10, [dHdg(cur, 180) < 0 ? 'yawLeft' : 'yawRight']);
await run(4);
if (PM) { await powerTo(0.12); await run(5); await powerTo(0.02); } else await run(6, ['throttleUp']);
await run(3);
// (Power model: the tilt grows while the key is held; let go and it levels
// and glides on.)
if (PM) { await run(4, ['pitchDown']); await run(3); } else await run(10, ['pitchDown']);
s = await st();
check('forward flight from the hover', s.kt > 30 && s.state === 'ok', `${s.kt} kt, NR ${s.nr} %`);
const cams = await page.evaluate(() => {
  const g = window.__agro, ac = g.aircraft, out = {};
  for (const mode of ['chase', 'cockpit', 'orbit']) {
    g.cameraMode = mode; g.rig.setMode(mode, ac);
    for (let i = 0; i < 30; i++) g.tick(1 / 60);
    const c = g.camera.position, p = ac.rPos;
    const eye = ac.toWorld(ac.model.eye);
    const f = ac.forward();
    const rel = c.clone().sub(p);
    out[mode] = { dist: +rel.length().toFixed(2), behind: +(-(rel.x * f.x + rel.z * f.z)).toFixed(2), eyeErr: +c.distanceTo(eye).toFixed(3), pilotVisible: ac.model.pilot.visible };
  }
  g.cameraMode = 'chase'; g.rig.setMode('chase', ac);
  return out;
});
check('cameras: chase behind, cockpit at the pilot eye (pilot hidden), orbit around',
  cams.chase.behind > 8 && cams.cockpit.eyeErr < 0.05 && !cams.cockpit.pilotVisible && cams.orbit.dist > 6, JSON.stringify(cams));
await snap('07_forward_chase');
await snap('07b_forward_cockpit', 'cockpit');

// --- back, slow down, land on the skids --------------------------------------
console.log('before flare', JSON.stringify(await st()));
if (PM) await run(2.5, ['pitchUp']); else await run(12, ['pitchUp']);
console.log('after flare', JSON.stringify(await st()));
await until('Math.hypot(g.aircraft.fm.vel.x, g.aircraft.fm.vel.z) < 1.5', PM ? 45 : 30);
let tDown;
if (PM) {
  // Down to a low hover, then the power a little under the hover figure.
  await powerTo(-0.12);
  await until('g.aircraft.fm.out.agl < 4', 40);
  await powerTo(-0.08);
  tDown = await until('g.aircraft.fm.out.onGround', 60);
} else tDown = await until('g.aircraft.fm.out.onGround', 60, ['throttleDown']);
await run(3, ['throttleDown']);
s = await st();
const ground = await page.evaluate(() => { const g = window.__agro, fm = g.aircraft.fm; return fm.skid.map((k) => { const p = k.pv.clone().applyQuaternion(fm.quat).add(fm.pos); return +(p.y - g.aircraft.env.ground(p.x, p.z)).toFixed(3); }); });
check('landing: on all four skids, gentle, no damage', s.gnd && s.skids === 4 && s.dmg === 0 && s.state === 'ok' && (s.lastTouch?.vs ?? 0) < 1.8 && ground.every((d) => Math.abs(d) < 0.08),
  `after ${tDown.toFixed(0)} s, touch ${(s.lastTouch?.vs ?? 0).toFixed(2)} m/s, skids ${s.skids}, dmg ${s.dmg}, ${s.state}, at ${s.x.toFixed(0)},${s.z.toFixed(0)}, skid heights ${ground.join(', ')}`);
console.log('toasts', JSON.stringify(await page.evaluate(() => (window.__agro.toastLog || []).slice(-12))));
await snap('08_landed');

// --- shut-down and run-down ------------------------------------------------------
await run(0.1, ['engine']);
await run(1);
s = await st();
check('shut-down: rotor state SHUTDOWN (running down)', s.eng === 'off' && s.rs === 'SHUTDOWN', `${s.rs} ${s.nr} %`);
const tStop = await until('g.aircraft.rotorState === "STOPPED"', 240);
s = await st();
vis = await visuals();
check('run-down to STOPPED, blades solid again', s.rs === 'STOPPED' && vis.bladeOpacity > 0.99 && vis.disc < 0.01, `${tStop.toFixed(0)} s`);

const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} checks passed`);
console.log('errors', errors.length, errors.slice(0, 5));
fs.writeFileSync(`${outDir}/results.json`, JSON.stringify({ results, errors }, null, 1));
await browser.close();
process.exit(pass === results.length && !errors.length ? 0 : 1);
