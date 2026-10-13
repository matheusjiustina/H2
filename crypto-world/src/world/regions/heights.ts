import { LayoutBuilder, ll, ROAD_STYLES } from '../layout/LayoutBuilder';
import { P } from '../kits/palette';

/**
 * NODE HEIGHTS — an elevated plateau of antennas and research buildings, reached by a switchback
 * road from The Chain. Rooftop and cliff-edge vantage points look out over the planet's curve.
 */
export function layoutHeights(L: LayoutBuilder): void {
  const R = 'heights' as const;
  const S = ROAD_STYLES;
  const f = L.get(R).frame;

  // ---- Switchback road and plateau streets -------------------------------------------------------
  L.localRoad(R, 'heights.climb', [[0, -20], [5, -15], [6, -11.5], [0, -8], [-3.5, -5], [-1, -1.5], [0, 2], [0, 5]], S.street);
  L.localRoad(R, 'heights.plaza.w', [[0, 5], [-6, 9], [-7, 14]], S.lane);
  L.localRoad(R, 'heights.plaza.e', [[0, 5], [6, 8], [8, 14]], S.lane);
  L.localRoad(R, 'heights.north', [[0, 14], [0, 18], [-1, 24], [1, 27]], S.lane);
  // Trail north toward Whitepaper Woods.
  L.road('trail.heights-woods', [f.dir(1, 27), f.dir(2, 33), ll(32, -64), ll(44, -52), ll(56, -30), ll(64, -8)], S.trail);
  L.decal(R, 0, 5, 0, 4.2, (ctx) => {
    ctx.fillStyle = '#d9d1c2';
    ctx.beginPath(); ctx.arc(0, 0, 4.0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(80,100,130,0.55)';
    ctx.lineWidth = 0.09;
    const nodes: [number, number][] = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      nodes.push([Math.cos(a) * (i % 2 ? 2.9 : 2.0), Math.sin(a) * (i % 2 ? 2.9 : 2.0)]);
    }
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      if ((i + j) % 3 !== 0) continue;
      ctx.beginPath(); ctx.moveTo(nodes[i][0], nodes[i][1]); ctx.lineTo(nodes[j][0], nodes[j][1]); ctx.stroke();
    }
    for (const [x, y] of nodes) { ctx.fillStyle = '#9a86d6'; ctx.beginPath(); ctx.arc(x, y, 0.28, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#f0b04a'; ctx.beginPath(); ctx.arc(0, 0, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8e8578'; ctx.lineWidth = 0.18; ctx.beginPath(); ctx.arc(0, 0, 3.9, 0, Math.PI * 2); ctx.stroke();
  }, 512);

  // ---- Buildings ------------------------------------------------------------------------------------
  L.place(R, 'checkpoint', 2.6, -1.0, 0, {}, { id: 'heights.checkpoint', pad: { hx: 1.6, hz: 1.6 } });
  L.place(R, 'control.center', 0, 11.6, 180, {}, { id: 'heights.control', pad: { hx: 5.2, hz: 4.2 } });
  L.place(R, 'institute', -10, 19.5, 120, {}, { id: 'heights.institute', pad: { hx: 5.6, hz: 5.0 } });
  L.place(R, 'comm.station', 10.5, 20, 225, {}, { id: 'heights.station', pad: { hx: 5.0, hz: 3.6 } });
  L.place(R, 'lab', -2.5, 25.5, 180, {}, { id: 'heights.lab', pad: { hx: 3.8, hz: 3.2 } });
  L.place(R, 'antenna.tower', -12, 8, 0, { h: 12 }, { id: 'heights.tower.w', pad: { hx: 1.6, hz: 1.6 } });
  L.place(R, 'antenna.tower', 12.5, 7.5, 0, { h: 11 }, { id: 'heights.tower.e', pad: { hx: 1.6, hz: 1.6 } });
  L.place(R, 'antenna.tower', 5.5, 27.5, 0, { h: 15 }, { id: 'heights.tower.n', pad: { hx: 1.6, hz: 1.6 } });

  // ---- Vantage points over the planet's curve -------------------------------------------------------------
  L.place(R, 'lookout', 11.5, -3.2, 140, { sign: 'EDGE OF THE NETWORK', iid: 'heights.lookout.east', doc: 'lookout.heights' }, { id: 'heights.lookout.east', pad: { hx: 2.8, hz: 1.8 } });
  L.place(R, 'lookout', -14.6, 13, -95, { sign: 'SUNSET VALIDATOR', iid: 'heights.lookout.west', doc: 'lookout.sunset' }, { id: 'heights.lookout.west', pad: { hx: 2.8, hz: 1.8 } });
  L.place(R, 'bench', -3.6, 4.2, 120, {}, { id: 'heights.bench.1' });
  L.place(R, 'bench', 3.8, 4.4, -120, {}, { id: 'heights.bench.2' });
  L.place(R, 'msgbox', 3.4, 2.4, 180, { color: P.violet }, { id: 'heights.msgbox' });
  L.along(R, 'lamppost', [[0, -20], [5, -15], [6, -11.5], [0, -8], [-3.5, -5], [-1, -1.5], [0, 2]], 7, 1.8, { color: P.navy, height: 3.0 }, { start: 3 });
  L.place(R, 'signpost', -1.8, -18.6, 0, { arms: [{ text: 'NODE HEIGHTS', rot: Math.PI / 2 - 0.2 }, { text: 'THE CHAIN', rot: -Math.PI / 2 }] });
}
