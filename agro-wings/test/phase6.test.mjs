import test from 'node:test';
import assert from 'node:assert/strict';
import { onRoad, onRoadSlow } from '../src/world/terrainData.js';
import { ROADS } from '../src/world/layout.js';

test('onRoad (grid) answers exactly like the full scan, on and around every road segment', () => {
  let s = 99; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  let hits = 0, n = 0;
  for (const r of ROADS) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      for (let k = 0; k < 40; k++) {
        const t = rnd(), off = (rnd() - 0.5) * (r.w * 3 + 4);
        const x = ax + (bx - ax) * t + off * 0.7, z = az + (bz - az) * t - off * 0.7;
        const a = onRoad(x, z), b = onRoadSlow(x, z);
        assert.equal(a, b, `(${x}, ${z})`); n++; if (a) hits++;
      }
    }
  }
  for (let k = 0; k < 60000; k++) { const x = (rnd() - 0.5) * 14000, z = (rnd() - 0.5) * 14000; assert.equal(onRoad(x, z), onRoadSlow(x, z)); n++; }
  assert.ok(hits > 100, `only ${hits} of ${n} probes were on a road`);
});
