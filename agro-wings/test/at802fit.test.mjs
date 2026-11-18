// AT-802A / Fire Boss cockpit fit: the instrument panel's wings must stay
// inside the cabin walls at every height (the walls lean in toward the
// sill; a panel corner running into them disappears from the pilot's view
// and pokes through the skin), and every instrument laid out on a wing must
// sit inside the wing's cut outline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { at802HullX } from '../src/aircraft/at802Model.js';
import { at802WingEdge, AT802_LAYOUT as L } from '../src/aircraft/at802Cockpit.js';

for (const variant of ['ag', 'fireboss']) {
  const fusX = at802HullX(variant);
  const WE = at802WingEdge(fusX);
  test(`${variant}: panel wing outline inside the cabin walls`, () => {
    for (const sgn of [-1, 1]) {
      for (let v = 0; v <= 0.37; v += 0.01) {
        const u = Math.min(WE.edge(v), WE.uC);
        const p = WE.at(sgn, u, v);
        const wall = fusX(p.z, p.y) - 0.022;
        assert.ok(Math.abs(p.x) <= wall - 0.01, `wing ${sgn} v=${v.toFixed(2)}: |x| ${Math.abs(p.x).toFixed(3)} vs wall ${wall.toFixed(3)}`);
      }
    }
  });
  test(`${variant}: the panel still fills the cabin (≥ 0.9 m across, wings ≥ 85 % wide at mid-height)`, () => {
    const p = WE.at(1, WE.edge(0), 0);
    assert.ok(2 * Math.abs(p.x) >= 0.9, `panel ${(2 * Math.abs(p.x)).toFixed(3)} m across`);
    assert.ok(WE.edge(0.15) >= 0.85 * 0.32, `wing width at mid-height ${WE.edge(0.15).toFixed(3)}`);
  });
  test(`${variant}: instruments inside the cut wings`, () => {
    const pts = [
      ['asi', L.asi.u + L.asi.r, L.asi.v], ['asi top', L.asi.u + L.asi.r * 0.7, L.asi.v + L.asi.r * 0.7],
      ['alt', L.alt.u + L.alt.r, L.alt.v], ['vent', L.vent.u + 0.022, L.vent.v],
      ['adi', L.adi.u + L.adi.s / 2, L.adi.v + L.adi.s / 2], ['aux', L.aux.u + L.aux.w / 2, L.aux.v + L.aux.h / 2],
      ['ems', -(L.ems.u - L.ems.bw / 2), L.ems.v + L.ems.bh / 2],
      ['placard top', -L.placard.u0, L.placard.v1], ['placard bottom', -L.placard.u0, L.placard.v0],
      ['boost', -L.boost.u + 0.012, L.boost.v + 0.012],
    ];
    for (const [n, u, v] of pts) assert.ok(u <= WE.edge(v) - 0.004, `${n}: u ${u.toFixed(3)} beyond the edge ${WE.edge(v).toFixed(3)} at v ${v.toFixed(3)}`);
  });
}
