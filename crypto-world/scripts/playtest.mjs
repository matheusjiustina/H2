// Automated browser playtest: node scripts/playtest.mjs [outDir]
// Requires a running dev server (npm run dev) or URL=<preview url>.
// Checks: boot + title, play transition, HUD, every mission target exists in the world,
// a real dialogue driven by key presses, the journal, a lap around the planet and a few
// screenshots of the regions. Exits non-zero when a check fails.
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] ?? 'playtest-output';
fs.mkdirSync(outDir, { recursive: true });
const URL = process.env.URL ?? 'http://localhost:5173/';
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failures.push(what);
};

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const shot = (name) => page.screenshot({ path: `${outDir}/${name}.png` });
const g = (code) => page.evaluate(`(() => { const g = window.__game; ${code} })()`);

// ---- Boot ------------------------------------------------------------------------------------
const t0 = Date.now();
await page.goto(URL);
await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 180000 });
console.log(`world built in ${((Date.now() - t0) / 1000).toFixed(1)} s (software renderer)`);
await page.waitForTimeout(1500);
await shot('01-title');
check(await page.isVisible('text=PLAY'), 'title screen shows PLAY');
check(await page.isVisible('text=SETTINGS'), 'title screen shows SETTINGS');

// ---- Data integrity inside the running world ---------------------------------------------------
const integrity = await page.evaluate(async () => {
  const { MISSIONS } = await import('/src/data/missions.ts');
  const g = window.__game;
  const ids = new Set(g.props.interactables.map((i) => i.id));
  const npcs = new Set(g.npcs.npcs.map((n) => n.def.id));
  const missing = [];
  for (const m of MISSIONS)
    for (const o of m.objectives) {
      if (o.type === 'talk' || o.type === 'deliver') {
        if (!npcs.has(o.target)) missing.push(`${m.id}.${o.id} npc ${o.target}`);
      } else if (o.type === 'interact') {
        if (!ids.has(o.target)) missing.push(`${m.id}.${o.id} object ${o.target}`);
      } else if (o.type === 'collect') {
        if (![...ids].some((i) => i.startsWith(o.target))) missing.push(`${m.id}.${o.id} collectible ${o.target}`);
      }
    }
  const far = g.npcs.npcs.filter((n) => Math.abs(n.position.length() - 70) > 12).map((n) => n.def.id);
  return { missing, npcCount: npcs.size, interactables: ids.size, far };
});
check(integrity.missing.length === 0, `all mission targets exist in-world ${integrity.missing.join(', ')}`);
check(integrity.npcCount >= 15, `at least 15 NPCs (${integrity.npcCount})`);
check(integrity.far.length === 0, `NPCs stand on the planet surface ${integrity.far.join(',')}`);
console.log(`interactables: ${integrity.interactables}`);

// ---- Play ------------------------------------------------------------------------------------
await page.click('text=PLAY');
await page.waitForTimeout(300);
for (let i = 0; i < 6; i++) await g(`g.simulate(0.75, 1 / 30);`);
await page.waitForTimeout(600);
await shot('02-play-hud');
check((await g(`return g.mode;`)) === 'play', 'fly-in ends in play mode');
check(await page.isVisible('.tracker'), 'mission tracker visible');

// ---- Dialogue with NODE, driven by real key presses -------------------------------------------
await g(`
  const n = g.npcs.byId('node');
  const up = n.position.clone().normalize();
  const f = n.facing.clone();
  const d = n.position.clone().addScaledVector(f, 1.6).normalize();
  g.player.teleport(d, f.clone().negate());
  g.cam.reset(g.followTarget(0));
  g.simulate(0.5, 1 / 30);
`);
await page.waitForTimeout(400);
await shot('03-near-node');
const prompt = await page.textContent('.prompt').catch(() => '');
check(/NODE/i.test(prompt ?? ''), `interaction prompt names NODE (“${(prompt ?? '').trim()}”)`);
await page.keyboard.press('KeyE');
await page.waitForTimeout(150);
await g(`g.simulate(1.0, 1 / 30);`);
await page.waitForTimeout(500);
await shot('04-dialogue');
check((await g(`return g.mode;`)) === 'dialogue', 'pressing E starts dialogue');
for (let i = 0; i < 40 && (await g(`return g.mode;`)) === 'dialogue'; i++) {
  // E finishes the typewriter, then advances; choices take the first option.
  await page.keyboard.press(i % 3 === 2 ? 'Digit1' : 'KeyE');
  await page.waitForTimeout(80);
  await g(`g.simulate(0.4, 1 / 30);`);
}
check((await g(`return g.mode;`)) === 'play', 'dialogue can be completed with the keyboard');
const m01 = await g(`return g.state.data.missions.m01;`);
check(m01 && m01.objective >= 1, `talking to NODE advances M01 (objective ${m01?.objective})`);

// ---- Journal -----------------------------------------------------------------------------------
await page.keyboard.press('Tab');
await page.waitForTimeout(100);
await g(`g.simulate(0.2, 1 / 30);`);
await page.waitForTimeout(400);
await shot('05-journal');
check(await page.isVisible('.journal'), 'Tab opens the journal');
await page.keyboard.press('Escape');
await page.waitForTimeout(100);
await g(`g.simulate(0.2, 1 / 30);`);

// ---- Walk around the world ------------------------------------------------------------------------
const lap = await g(`
  const P = g.player;
  g.teleportTo('city', 0, -12.3, 90);
  g.simulate(0.3, 1 / 30);
  const start = P.dir.clone();
  let maxDev = 0, travelled = 0, blocked = 0, last = P.dir.clone();
  const axis = new start.constructor().crossVectors(start, P.facing).normalize();
  for (let i = 0; i < 30 * 140; i++) {
    // Steer along the great circle through the start point.
    const ahead = new start.constructor().crossVectors(axis, P.dir).normalize();
    P.facing.copy(ahead);
    P.update(1 / 30, ahead, true, false);
    const step = last.angleTo(P.dir) * 70;
    travelled += step;
    if (step < 0.05) blocked++;
    last.copy(P.dir);
    maxDev = Math.max(maxDev, Math.abs(P.dir.dot(axis)) * 70);
    if (travelled > 2 * Math.PI * 70 + 3) break;
  }
  return { travelled, maxDev, blocked, radiusOk: Math.abs(P.dir.length() - 1) < 1e-6, feet: P.feet };
`).catch((e) => ({ error: String(e) }));
console.log('lap', JSON.stringify(lap));
check(!lap.error && lap.travelled > 2 * Math.PI * 70 * 0.98, `a full lap around the planet is walkable (${lap.travelled?.toFixed(1)} units)`);

// ---- Region gallery -----------------------------------------------------------------------------
const VIEWS = {
  '06-city': `g.teleportTo('city', -4, -16, 20)`,
  '07-hills': `g.teleportTo('hills', 0, -12, 0)`,
  '08-coast': `g.teleportTo('coast', -2, 3, 170)`,
  '09-mining': `g.teleportTo('mining', -20, -3, 90)`,
  '10-heights': `g.teleportTo('heights', 0, -19, 0)`,
};
for (const [name, code] of Object.entries(VIEWS)) {
  await g(`${code}; g.simulate(1.0, 1 / 30);`);
  await page.waitForTimeout(500);
  await shot(name);
}
await g(`g.lighting.time = 0.92; g.simulate(1.0, 1 / 30);`);
await g(`g.teleportTo('city', 3, -14, 0); g.simulate(1.0, 1 / 30);`);
await page.waitForTimeout(500);
await shot('11-city-night');

// ---- Save round trip ----------------------------------------------------------------------------
const saved = await g(`g.saveNow(); return localStorage.getItem('crypto-world.save');`);
check(!!saved && JSON.parse(saved).version >= 2, 'progress is saved to local storage');

check(errors.length === 0, `no page errors ${errors.slice(0, 5).join(' | ')}`);
await browser.close();
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
