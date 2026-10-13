// Finds every secret in the running world and reveals it through normal interactions:
// node scripts/secretbot.mjs   (needs a running dev server)
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(process.env.URL ?? 'http://localhost:5173/');
await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 180000 });
const res = await page.evaluate(async () => {
  const g = window.__game;
  localStorage.clear();
  g.skipTitle();
  const { SECRETS } = await import('/src/data/docs.ts');
  const step = (s) => g.simulate(s, 1 / 30);
  const R = 70;
  const report = [];
  const finish = () => {
    for (let k = 0; k < 200 && g.mode === 'dialogue'; k++) {
      const cur = g.dialogue?.runner.current();
      if (!g.ui.typingDone) g.input.press('interact');
      else if (cur && cur.choices.length) {
        // Puzzles: pick the choice whose label is 'right' / 'open' if present, else the first.
        const i = cur.choices.findIndex((c) => /right|open|correct|unlock/.test(cur.line.choices[c.index].goto ?? ''));
        g.input.press(`c${(i < 0 ? 0 : i) + 1}`);
      } else g.input.press('interact');
      step(0.07);
    }
  };
  const approach = (it) => {
    for (const dist of [0, 0.4, -0.3, 0.8]) {
      const want = it.pos.clone().normalize().multiplyScalar(R).addScaledVector(it.forward, -dist).normalize();
      g.player.teleport(want, it.forward.clone());
      g.cam.reset(g.followTarget(0));
      step(0.2);
      if (g.focus && g.focus.kind === 'object' && g.focus.it.id === it.id) return true;
    }
    return false;
  };
  for (const it of g.props.interactables.filter((i) => i.kind === 'secret')) {
    const before = g.state.data.secrets.length;
    const ok = approach(it);
    g.input.press('interact');
    step(0.2);
    finish();
    for (let k = 0; k < 4 && g.mode === 'panel'; k++) { g.input.press('pause'); step(0.1); }
    report.push(`${it.id}: approach ${ok ? 'ok' : 'FAILED'}, revealed ${g.state.data.secrets.length > before ? 'yes' : 'NO'}`);
  }
  // The Genesis Stone dials: turn each dial to the code.
  const code = [0, 3, 0, 1];
  for (let d = 0; d < 4; d++) {
    const it = g.props.interactables.find((i) => i.id === `hills.dial.${d}`);
    if (!it) { report.push(`dial ${d} missing`); continue; }
    approach(it);
    let guard = 0;
    while (g.dials[d] !== code[d] && guard++ < 12) { g.input.press('interact'); step(0.2); }
  }
  // The reveal is staged a moment after the last dial clicks into place (real time).
  await new Promise((r) => setTimeout(r, 1500));
  report.push(`dials now ${g.dials.join('')}; genesis-dials: revealed ${g.state.data.secrets.includes('genesis-dials') ? 'yes' : 'NO'}`);
  return { report, found: g.state.data.secrets, total: Object.keys(SECRETS).length };
});
console.log(res.report.join('\n'));
console.log(`secrets: ${res.found.length}/${res.total} → ${res.found.join(', ')}`);
console.log(errs.join('\n') || 'no page errors');
await browser.close();
process.exit(res.found.length === res.total && !errs.length ? 0 : 1);
