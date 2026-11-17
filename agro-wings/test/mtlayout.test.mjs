// Mato Grosso map refinement 2.0: the layout's geometry, checked on the data
// (the map is chosen through AGRO_MAP before any world module loads).
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.AGRO_MAP = 'matogrosso';
const L = await import('../src/world/layout.js');
const MT = await import('../src/world/matogrosso.js');
const S = await import('../src/world/fieldShape.js');
const { FieldCoverage } = await import('../src/spray/coverage.js');
const { MT_CONTRACTS, MT_FARM_CONTRACTS } = await import('../src/game/mtContracts.js');
const { segDist } = await import('../src/core/math.js');

const polyD = (pts, x, z) => { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])); return d; };
const F = L.FIELDS;
// Points inside a field, on a grid.
const samples = (f, step = 25) => {
  const out = [];
  for (let z = f.z0 + step / 2; z < f.z1; z += step) for (let x = f.x0 + step / 2; x < f.x1; x += step) if (S.fieldInside(f, x, z)) out.push([x, z]);
  return out;
};

test('the map is smaller: 4.8 km playable (−29 % in extent), everything inside it', () => {
  assert.equal(MT.MT_PLAY_HALF, 2400);
  assert.ok(1 - MT.MT_PLAY_HALF / 3400 >= 0.25 && 1 - MT.MT_PLAY_HALF / 3400 <= 0.35);
  for (const f of F) assert.ok(Math.max(Math.abs(f.x0), Math.abs(f.x1), Math.abs(f.z0), Math.abs(f.z1)) < MT.MT_PLAY_HALF, f.name);
  for (const s of MT.MT_STRIPS) assert.ok(Math.max(Math.abs(s.x0), Math.abs(s.x1), Math.abs(s.z)) < MT.MT_PLAY_HALF - 100, s.id);
});

test('irregular talhões dominate; pivots kept (and one added); five strips', () => {
  const irr = F.filter((f) => f.outline), piv = F.filter((f) => f.circle);
  assert.ok(irr.length >= 18, `irregular: ${irr.length}`);
  assert.deepEqual(piv.map((f) => [f.name, f.circle.r]), [['P-01', 420], ['P-02', 320], ['P-03', 300], ['P-04', 230]]);
  assert.equal(L.SITES.length, 5);
  // Their area: most of the cropland is irregular.
  const A = (l) => l.reduce((a, f) => a + S.fieldArea(f), 0);
  assert.ok(A(irr) > 0.6 * A(F), `${A(irr)} of ${A(F)}`);
});

test('no talhão overlaps another, a runway, an apron, the water or a road', () => {
  for (const f of F) {
    const pts = samples(f);
    assert.ok(pts.length > 20, f.name);
    for (const g of F) if (g !== f && g.x0 < f.x1 + 20 && g.x1 > f.x0 - 20 && g.z0 < f.z1 + 20 && g.z1 > f.z0 - 20) {
      for (const [x, z] of pts) assert.ok(!S.fieldInside(g, x, z, 12), `${f.name} meets ${g.name} at ${x},${z}`);
    }
    for (const s of L.SITES) {
      const r = s.runway, a = s.apron;
      for (const [x, z] of pts) {
        assert.ok(!(x > r.x0 - 25 && x < r.x1 + 25 && Math.abs(z - r.z) < r.width / 2 + 25), `${f.name} on runway ${s.id}`);
        assert.ok(!(x > a.x0 - 15 && x < a.x1 + 15 && z > a.z0 - 15 && z < a.z1 + 15), `${f.name} on apron ${s.id}`);
      }
    }
    for (const [x, z] of pts) {
      assert.ok(polyD(MT.MT_RIVER.points, x, z) > MT.MT_RIVER.width / 2 + 60, `${f.name} in the river at ${x},${z}`);
      assert.ok(polyD(MT.MT_CREEK.points, x, z) > 30, `${f.name} in the creek at ${x},${z}`);
    }
  }
  for (const r of L.ROADS) for (const [x, z] of r.pts) for (const f of F) assert.ok(!S.fieldInside(f, x, z, -(r.w / 2 + 3)), `road through ${f.name} at ${x},${z}`);
});

test('castanheiras: clear of runways, approaches and roads; inside a talhão only where meant (K-01)', () => {
  for (const [x, z] of MT.MT_CASTANHEIRAS) {
    for (const s of MT.MT_STRIPS) {
      const out = Math.max(s.x0 - x, x - s.x1, 0);
      assert.ok(!(out < 500 && Math.abs(z - s.z) < 60 + 50 * Math.min(1, out / 450) + 10), `castanheira ${x},${z} in ${s.id}'s approach`);
    }
    for (const r of L.ROADS) assert.ok(polyD(r.pts, x, z) > r.w / 2 + 12, `castanheira ${x},${z} on a road`);
    const inF = F.filter((f) => S.fieldInside(f, x, z, 10) && f.contract);
    for (const f of inF) assert.equal(f.name, 'K-01', `castanheira ${x},${z} in ${f.name}`);
  }
  assert.equal(MT.MT_CASTANHEIRAS.filter(([x, z]) => S.fieldInside(F.find((f) => f.name === 'K-01'), x, z)).length, 3);
});

test('the castanhal strip: its tree line stands clear of any wing on the runway, only along it', () => {
  const s = MT.MT_STRIPS.find((q) => q.treeLine);
  assert.ok(s, 'a strip with a tree line');
  const semispan = 9.2; // AT-802, the widest wing allowed there
  assert.ok(s.treeLine.offset - 3.5 > semispan + 12, `offset ${s.treeLine.offset}`);
  const farm = MT.MT_FARMS.find((f) => f.id === s.id);
  assert.ok(farm.aircraft.includes('at802'));
});

test('the forest: nothing on runways, approaches or talhões; closed beyond the playable area', () => {
  for (const s of MT.MT_STRIPS) for (let x = s.x0 - 400; x <= s.x1 + 400; x += 20) for (const dz of [-30, 0, 30]) {
    assert.ok(MT.mtWild(x, s.z + dz) < 0.05, `forest at ${s.id} ${x},${s.z + dz}`);
  }
  for (const f of F) for (const [x, z] of samples(f, 60)) assert.ok(MT.mtWild(x, z) < 0.05, `forest in ${f.name} at ${x},${z}`);
  let closed = 0, n = 0;
  for (let a = 0; a < Math.PI * 2; a += 0.2) { n++; if (MT.mtWild(Math.cos(a) * 2850, Math.sin(a) * 2850) > 0.8) closed++; }
  assert.ok(closed / n > 0.7, `${closed}/${n}`);
  // Gallery forest along the river.
  let gal = 0, m = 0;
  for (let i = 2; i < MT.MT_RIVER.points.length - 4; i++) { const [x, z] = MT.MT_RIVER.points[i]; m++; if (MT.mtWild(x, z - 120) > 0.5 || MT.mtWild(x, z + 120) > 0.5) gal++; }
  assert.ok(gal / m > 0.8, `${gal}/${m}`);
});

test('every order of the map before the refinement is still there; the new ones too', () => {
  const ids = [...MT_CONTRACTS, ...MT_FARM_CONTRACTS].map((c) => c.id).sort();
  for (const id of ['mt-a01', 'mt-a02', 'mt-a03', 'mt-a04', 'mt-a05', 'mt-a06', 'mt-p01', 'mt-p02', 'mt-p03', 'mt-b01', 'mt-b02', 'mt-c01', 'mt-c02', 'mt-c03', 'mt-d01', 'mt-d02', 'mt-e01', 'mt-p04', 'mt-k01', 'mt-k02']) assert.ok(ids.includes(id), id);
  for (const c of [...MT_CONTRACTS, ...MT_FARM_CONTRACTS]) { assert.ok(c.payPerHa > 0 && c.bonus > 0); assert.ok(c.title && c.brief); }
});

test('coverage and rows follow the outline: the sprayable area is the polygon, not its box', () => {
  for (const f of F.filter((q) => q.outline)) {
    const cov = new FieldCoverage(f), A = S.fieldArea(f), box = (f.x1 - f.x0) * (f.z1 - f.z0);
    assert.ok(Math.abs(cov.area - A) / A < 0.03, `${f.name}: cells ${cov.area} vs polygon ${A}`);
    assert.ok(A < box * 0.97, `${f.name} is not just its box`);
    // Rows: the spans across the field add up to its area.
    const alongX = f.rowAxis === 'x', c0 = alongX ? f.z0 : f.x0, c1 = alongX ? f.z1 : f.x1;
    let sum = 0;
    for (let c = c0 + 1; c < c1; c += 2) for (const [a, b] of S.fieldSpans(f, alongX, c)) sum += (b - a) * 2;
    assert.ok(Math.abs(sum - A) / A < 0.03, `${f.name}: spans ${sum} vs ${A}`);
    // A point in a forest inlet (inside the box, outside the outline) is not crop.
    let inlet = null;
    for (let z = f.z0 + 5; z < f.z1 && !inlet; z += 10) for (let x = f.x0 + 5; x < f.x1 && !inlet; x += 10) if (!S.fieldInside(f, x, z, 30)) inlet = [x, z];
    if (inlet) { assert.equal(L.fieldAt(inlet[0], inlet[1])?.name === f.name, false); assert.equal(cov.deposit(inlet[0], inlet[1], 1), -1); }
  }
});
