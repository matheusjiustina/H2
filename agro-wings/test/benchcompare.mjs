// Compares two benchmark results (before / after an optimisation).
//   node test/benchcompare.mjs before.json after.json [tolerancePct=5]
// For each scenario: frame time avg / P95 / P99, FPS, 1 % low, draw calls,
// triangles, heap — with the change in %. A FRAME-TIME or draw-call
// increase beyond the tolerance is flagged "WORSE"; the exit code is 1 if
// any scenario is flagged (usable as a gate). Results from different
// devices or quality presets are refused.
import fs from 'node:fs';
const [a, b] = [process.argv[2], process.argv[3]].map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const tol = +(process.argv[4] ?? 5);
if (a.device.gpu !== b.device.gpu || a.device.quality !== b.device.quality || (a.device.profile ?? null) !== (b.device.profile ?? null) || a.device.canvas.join() !== b.device.canvas.join()) {
  console.error('Refused: the two results come from different GPU / quality / canvas size.', { a: [a.device.gpu, a.device.quality, a.device.canvas], b: [b.device.gpu, b.device.quality, b.device.canvas] });
  process.exit(2);
}
const d = (x, y) => (x ? ((y - x) / x) * 100 : 0);
const f = (v) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
let bad = 0;
console.log(`before ${a.build?.slice(0, 7) ?? '?'} (${a.when})  →  after ${b.build?.slice(0, 7) ?? '?'} (${b.when})   device: ${a.device.gpu} · ${a.device.quality}`);
for (const k of Object.keys(a.scenarios)) {
  const x = a.scenarios[k], y = b.scenarios[k];
  if (!y) { console.log(k, 'missing in after'); continue; }
  if (x.error || y.error) { console.log(`\n${k}  skipped (no samples: ${x.error ? 'before' : 'after'})`); continue; }
  const rows = [
    ['frame avg ms', x.frameMs.avg, y.frameMs.avg, true], ['frame p95 ms', x.frameMs.p95, y.frameMs.p95, true], ['frame p99 ms', x.frameMs.p99, y.frameMs.p99, true],
    ['fps avg', x.fps.avg, y.fps.avg, false], ['fps 1% low', x.fps.low1pct, y.fps.low1pct, false],
    ['draw calls', x.render.calls, y.render.calls, true], ['triangles', x.render.triangles, y.render.triangles, false],
    ['geometries', x.render.geometries, y.render.geometries, false], ['textures', x.render.textures, y.render.textures, false],
    ['heap end MB', x.heapMB.end, y.heapMB.end, false], ['long tasks', x.longTasks.n, y.longTasks.n, true],
  ];
  console.log(`\n${k}  ${x.label}`);
  for (const [n, p, q, gate] of rows) {
    if (p == null || q == null) continue;
    const ch = d(p, q), worse = gate && ch > tol && (n !== 'long tasks' || q > p);
    if (worse) bad++;
    console.log(`  ${n.padEnd(14)} ${String(p).padStart(10)} → ${String(q).padStart(10)}  ${f(ch).padStart(8)}${worse ? '  WORSE' : ''}`);
  }
}
console.log(bad ? `\n${bad} metric(s) worse than ${tol}%` : `\nno metric worse than ${tol}%`);
process.exit(bad ? 1 : 0);
