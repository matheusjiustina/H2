import { LayoutBuilder, ll, ROAD_STYLES } from '../layout/LayoutBuilder';
import { P } from '../kits/palette';

/**
 * GENESIS HILLS — green hills celebrating blockchain history: Block's research cabin, Sat's old
 * shack, the Genesis Stone, Server Henge, Luna's observatory on the summit and Halving Hill lookout.
 */
export function layoutHills(L: LayoutBuilder): void {
  const R = 'hills' as const;
  const S = ROAD_STYLES;
  const f = L.get(R).frame;

  // ---- Paths ----------------------------------------------------------------------------------
  L.localRoad(R, 'hills.main', [[0, -13.5], [0, -9], [-3, -4], [-5, 1], [-7, 6], [-8, 11], [-10, 17], [-14, 20.5], [-17, 21.5]], S.path);
  L.localRoad(R, 'hills.observatory', [[-5, 1], [0, 4], [5, 8], [9, 11.5], [11.5, 13.5]], S.path);
  L.localRoad(R, 'hills.henge', [[0, -9], [5, -6], [8, -3.5]], S.trail);
  L.localRoad(R, 'hills.memorial', [[-7, 6], [-10.5, 9.5]], S.trail);
  L.localRoad(R, 'hills.shack', [[-8, 11], [-14, 9.5], [-18, 8]], S.trail);
  // Long trail north to Whitepaper Woods.
  L.road('trail.hills-woods', [f.dir(-17, 21.5), f.dir(-22, 28), f.dir(-26, 36), ll(36, 52), ll(44, 40), ll(52, 28), ll(60, 18)], S.trail);

  // ---- Entrance --------------------------------------------------------------------------------
  L.place(R, 'gate.arch', 0, -11.2, 0, { text: 'GENESIS HILLS', sub: 'where it all began', w: 3.6 }, { id: 'hills.gate' });
  L.place(R, 'signpost', 2.2, -8.6, 0, { arms: [{ text: 'OBSERVATORY', rot: -0.9 }, { text: 'SERVER HENGE', rot: -0.2 }, { text: 'CABIN & STONE', rot: Math.PI - 0.3 }] });

  // ---- Block's research cabin ------------------------------------------------------------------------
  L.place(R, 'cabin', -11.5, -2, 90, {}, { id: 'hills.cabin', pad: { hx: 4.2, hz: 4.6, falloff: 3 } });
  L.place(R, 'windmill', -17.5, -6.5, 60, {}, { id: 'hills.windmill', pad: { hx: 1.6, hz: 1.6 } });
  L.place(R, 'garden', -12, 4.6, 90, { w: 4, d: 3 }, { pad: { hx: 2.3, hz: 1.8 } });
  L.place(R, 'picnic', -6.8, -7.5, 30, {}, { id: 'hills.picnic' });
  L.place(R, 'fence', -5.6, -4.5, 90, { len: 4 });
  L.place(R, 'msgbox', -6.0, -0.4, 90, { color: P.teal }, { id: 'hills.msgbox.cabin' });

  // ---- Genesis Stone and Sat's place ----------------------------------------------------------------
  L.place(R, 'memorial', -14.2, 12.6, 130, {}, { id: 'hills.memorial', pad: { hx: 0, hz: 0, round: 4.5, falloff: 3 } });
  L.place(R, 'shack.miner', -20.5, 7.4, 75, {}, { id: 'hills.shack', pad: { hx: 2.5, hz: 3.0 } });
  L.place(R, 'lamppost', -9.6, 8.6, 0, { height: 2.6, color: P.woodDark, pool: 2.6 });

  // ---- Server Henge -----------------------------------------------------------------------------------
  L.place(R, 'server.henge', 11, -1.5, 240, {}, { id: 'hills.henge', pad: { hx: 0, hz: 0, round: 5, falloff: 3 } });

  // ---- Luna's observatory on the summit ------------------------------------------------------------------
  L.place(R, 'observatory', 13.2, 16.2, 225, {}, { id: 'hills.observatory', pad: { hx: 0, hz: 0, round: 5.2, falloff: 2.5 } });
  L.place(R, 'bench', 8.8, 18.6, 120, {}, { id: 'hills.obs.bench' });

  // ---- Halving Hill lookout -----------------------------------------------------------------------------
  L.place(R, 'lookout', -17.8, 22.4, -40, { sign: 'HALVING HILL', iid: 'hills.lookout', doc: 'lookout.halving' }, { id: 'hills.lookout', pad: { hx: 2.8, hz: 1.8 } });

  // ---- Scattered details ---------------------------------------------------------------------------------
  for (const [x, y, s] of [[4, -12, 1.2], [-3, 14, 0.9], [16, 4, 1.4], [6, 20, 1.0], [-22, 16, 1.3]] as [number, number, number][]) L.place(R, 'rock', x, y, x * 37, { scale: s });
  L.place(R, 'crate', -8.4, -4.0, 20, { color: P.woodLight });
  L.place(R, 'barrel', -8.2, -5.2, 0, { color: P.woodDark });
}
