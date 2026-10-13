// Plays the whole story in a real browser: node scripts/storybot.mjs [outDir]
// The bot reads the current objective from the game state, travels next to the target in the
// world (resident, object, place or collectible), presses the interact action, plays dialogue with
// the same inputs a player uses (advance / numbered choices) and closes panels. It fails if any
// objective cannot be completed this way, if the finale does not start, or on any page error.
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.argv[2] ?? 'playtest-output/story';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(process.env.URL ?? 'http://localhost:5173/');
await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 180000 });
await page.evaluate(() => {
  localStorage.clear();
  window.__game.skipTitle();
});

// In-page helpers.
await page.evaluate(() => {
  const g = window.__game;
  const R = 70;
  const step = (s = 0.1) => g.simulate(s, 1 / 30);
  const bot = (window.__bot = { log: [] });

  bot.approachNpc = (id) => {
    const n = g.npcs.byId(id);
    if (!n) throw new Error(`no npc ${id}`);
    for (let pass = 0; pass < 2; pass++) {
      const up = n.position.clone().normalize();
      for (const a of [0, 70, -70, 110, -110, 150, -150, 180, 35, -35]) {
        const f = n.facing.clone().applyAxisAngle(up, (a * Math.PI) / 180);
        const want = n.position.clone().addScaledVector(f, 1.8).normalize();
        g.player.teleport(want, f.clone().negate());
        g.cam.reset(g.followTarget(0));
        step(0.15);
        const ok =
          g.player.dir.angleTo(want) * R < 0.3 &&
          !g.sightBlocked(g.player.visualPosition().addScaledVector(g.player.dir, 1.3), n.headPosition(), 0.3);
        // The prompt must name this resident (others may be chatting right next to them).
        if (ok && g.focus && g.focus.kind === 'npc' && g.focus.npc === n) return true;
      }
      step(2); // the resident may be walking; let them settle and retry
    }
    return false;
  };

  bot.approachObject = (it) => {
    const d = it.pos.clone().normalize();
    const back = it.forward.clone().negate();
    for (const dist of [0, 0.4, -0.3, 0.8]) {
      const want = d.clone().multiplyScalar(R).addScaledVector(back, dist).normalize();
      g.player.teleport(want, it.forward.clone());
      g.cam.reset(g.followTarget(0));
      step(0.15);
      g.updateInteraction?.();
      if (g.focus && g.focus.kind === 'object' && g.focus.it.id === it.id) return true;
    }
    return false;
  };

  bot.playDialogue = () => {
    let guard = 0;
    while (g.mode === 'dialogue' && guard++ < 200) {
      const d = g.dialogue;
      const cur = d && d.runner.current();
      if (!g.ui.typingDone) g.input.press('interact');
      else if (cur && cur.choices.length) {
        const pick =
          cur.choices.findIndex((c) => {
            const ch = cur.line.choices[c.index];
            return !ch.end && !(ch.goto ?? '').startsWith('wrong') && !(ch.goto ?? '').startsWith('reassure');
          });
        g.input.press(`c${(pick < 0 ? 0 : pick) + 1}`);
      } else g.input.press('interact');
      step(0.07);
    }
    for (let i = 0; i < 5 && g.mode === 'panel'; i++) {
      g.input.press('pause');
      step(0.1);
    }
    return guard < 200;
  };

  bot.press = () => {
    g.input.press('interact');
    step(0.1);
    return bot.playDialogue();
  };
});

const missions = await page.evaluate(() => window.__game.state.missions.map((m) => m.id));
const shots = new Set(['m04', 'm07', 'm10', 'm12']);
let stalls = 0;
let lastKey = '';
for (let iter = 0; iter < 400; iter++) {
  const res = await page.evaluate(() => {
    const g = window.__game;
    const bot = window.__bot;
    const S = g.state;
    const active = S.missions.find((m) => S.status(m.id) === 'active');
    if (!active) {
      const avail = S.missions.find((m) => S.status(m.id) === 'available');
      if (!avail) return { done: true };
      const ok = bot.approachNpc(avail.giver);
      bot.press();
      return { key: `start:${avail.id}`, mission: avail.id, action: `talk ${avail.giver}`, ok };
    }
    const o = S.currentObjective(active.id);
    const key = `${active.id}.${o.id}.${JSON.stringify(S.data.missions[active.id]?.counts ?? {})}`;
    let ok = true;
    let action = '';
    if (o.type === 'talk' || o.type === 'deliver') {
      ok = bot.approachNpc(o.target);
      action = `talk ${o.target}`;
      bot.press();
    } else if (o.type === 'interact') {
      const it = g.props.interactables.find((i) => i.id === o.target);
      ok = !!it && bot.approachObject(it);
      action = `use ${o.target}`;
      bot.press();
    } else if (o.type === 'collect') {
      const it = g.props.interactables.find((i) => i.id.startsWith(o.target) && i.enabled() && !S.hasCollected(i.id) && !(i.kind === 'beacon' && g.props.beacons.get(i.id)?.lit));
      ok = !!it && bot.approachObject(it);
      action = `collect ${it?.id}`;
      bot.press();
    } else if (o.type === 'reach') {
      const a = g.content.anchors.get(o.target + '.console') ?? null;
      if (a) {
        g.player.teleport(a.pos.clone().normalize(), a.forward.clone());
        g.cam.reset(g.followTarget(0));
        g.simulate(1, 1 / 30);
      } else ok = false;
      action = `reach ${o.target}`;
    }
    return { key: `${key}:${action}:${(S.data.collected ?? []).length}`, mission: active.id, objective: o.id, action, ok, mode: g.mode };
  });
  if (res.done) break;
  console.log(`${res.mission} ${res.objective ?? ''} → ${res.action}${res.ok ? '' : '  (approach failed)'}`);
  if (res.key === lastKey) stalls++;
  else stalls = 0;
  lastKey = res.key;
  if (stalls >= 3) {
    console.log(`STUCK on ${res.key}`);
    break;
  }
  if (shots.has(res.mission) && res.objective) {
    shots.delete(res.mission);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${outDir}/${res.mission}-${res.objective}.png` });
  }
}

const summary = await page.evaluate(() => {
  const g = window.__game;
  return {
    statuses: Object.fromEntries(g.state.missions.map((m) => [m.id, g.state.status(m.id)])),
    mode: g.mode,
    inventory: g.state.data.inventory,
  };
});
console.log(JSON.stringify(summary.statuses));
const allDone = missions.every((m) => summary.statuses[m] === 'done');
// Let the finale play.
for (let i = 0; i < 12; i++) {
  await page.evaluate(() => window.__game.simulate(1, 1 / 30));
  if (i === 3 || i === 11) await page.screenshot({ path: `${outDir}/finale-${i}.png` });
}
const endMode = await page.evaluate(() => window.__game.mode);
console.log(`mode after finale: ${endMode}`);
console.log(errors.length ? `page errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
const pass = allDone && errors.length === 0;
console.log(pass ? 'STORY COMPLETE' : 'STORY INCOMPLETE');
process.exit(pass ? 0 : 1);
