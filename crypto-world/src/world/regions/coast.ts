import { LayoutBuilder, ROAD_STYLES } from '../layout/LayoutBuilder';
import { P } from '../kits/palette';
import { SEA_LEVEL } from '../constants';

/**
 * DEGEN COAST — a relaxed seaside neighbourhood: boardwalk, pier and lighthouse, the Floor Price
 * Gallery, the Shill Shack café, Meme's mural wall, Fork's workshop and Airdrop Isle across a sandbar.
 */
export function layoutCoast(L: LayoutBuilder): void {
  const R = 'coast' as const;
  const S = ROAD_STYLES;

  // ---- Paths --------------------------------------------------------------------------------------
  L.localRoad(R, 'coast.boardwalk', [[-27, 0.6], [-14, -0.6], [-2, -1.0], [3, -1.0], [14, -1.4], [21, -0.8], [25, 1.5], [24, 4]], S.boardwalk);
  L.localRoad(R, 'coast.galleryPath', [[-12, 5.4], [-12, 7.6]], S.lane);
  L.localRoad(R, 'coast.cafePath', [[9, 5.3], [9, 8.4]], S.lane);
  L.localRoad(R, 'coast.beachstairs', [[-4, 5.4], [-4, 3.2], [-3, -0.8]], S.lane);
  L.localRoad(R, 'coast.pierstairs', [[4, 5.3], [3.4, 2], [3, -1]], S.lane);
  L.road('coast.sandbar', [L.get(R).frame.dir(7, -3), L.get(R).frame.dir(9, -10), L.get(R).frame.dir(11, -19), L.get(R).frame.dir(13, -28), L.get(R).frame.dir(14, -31)], S.sandbar, { fixedHeight: SEA_LEVEL + 0.32 });

  // ---- Pier and lighthouse -------------------------------------------------------------------------------
  L.place(R, 'pier', 3, -3.4, 168, { len: 22 }, { id: 'coast.pier', base: SEA_LEVEL + 0.95 });
  L.place(R, 'boat', -1.8, -13.5, 75, { color: P.red }, { base: SEA_LEVEL - 0.1 });
  L.place(R, 'boat', 9.5, -15.5, 100, { color: P.teal, sail: true }, { base: SEA_LEVEL - 0.1 });
  L.place(R, 'boat', -3.5, -21, 60, { color: P.amber }, { base: SEA_LEVEL - 0.1 });
  L.place(R, 'boat', -11.5, -4.6, 120, { color: P.paper, len: 3.0 }, {});

  // ---- Gallery, café, homes -------------------------------------------------------------------------------
  L.place(R, 'gallery', -12, 14.6, 180, {}, { id: 'coast.gallery', pad: { hx: 5.4, hz: 4.6 } });
  L.place(R, 'cafe.shack', 9, 13.4, 180, {}, { id: 'coast.cafe', pad: { hx: 3.2, hz: 3.4 } });
  L.place(R, 'table.set', 13.4, 9.2, 30, { umbrella: P.coral }, { id: 'coast.cafe.table' });
  L.place(R, 'beach.hut', -24, 12.4, 180, { wall: P.mint, sign: 'HUT 1' }, { pad: { hx: 2.2, hz: 2.6 } });
  L.place(R, 'beach.hut', 19.6, 12.6, 180, { wall: P.butter }, { pad: { hx: 2.2, hz: 2.6 } });
  L.place(R, 'beach.hut', 24.4, 10.6, 200, { wall: P.rose }, { pad: { hx: 2.2, hz: 2.6 } });
  L.place(R, 'beach.hut', -21.5, -3.8, 175, { wall: P.powder, sign: 'WHALE WATCH' }, {});
  L.place(R, 'beach.hut', -16.8, -4.4, 172, { wall: P.lavender }, {});
  L.place(R, 'rowhouse', -2.5, 13.2, 180, { wall: P.powder, floors: 2, sign: { text: 'GM MOTEL', sub: 'sea view · good mornings', bg: P.teal, fg: P.paper, w: 3, h: 0.55 } }, { pad: { hx: 2.2, hz: 2.6 } });

  // ---- Beach life ---------------------------------------------------------------------------------------------
  L.place(R, 'seawall', -9.5, 2.65, 180, { len: 9, text: 'WAGMI', sub: 'we are all gonna make it — MEME', icon: 'wave', iid: 'coast.mural', doc: 'mural.wagmi' }, { id: 'coast.mural' });
  L.place(R, 'stall', 8.6, 0.9, 190, { goods: 'fish', color: P.deepTeal, sign: 'CATCH OF THE DAY', w: 2.4 }, { id: 'coast.stall.fish' });
  L.place(R, 'stall', 12.6, 0.6, 190, { goods: 'gadgets', color: P.coral, sign: 'AIRDROP SOUVENIRS', w: 2.4 }, { id: 'coast.stall.souvenir' });
  L.place(R, 'stall', 16.6, 0.4, 190, { goods: 'fruit', color: P.amber, sign: 'TROPICAL TOKENS', w: 2.4 }, { id: 'coast.stall.fruit' });
  L.place(R, 'workshop.fork', 25.2, -2.2, -105, {}, { id: 'coast.workshop', pad: { hx: 2.8, hz: 2.6 } });
  L.place(R, 'lifeguard', -6.5, -3.8, 175, {}, {});
  L.place(R, 'volleyball', 14.5, -4.4, 8, {}, {});
  for (const [x, y, col] of [[-12.5, -5.2, P.coral], [-2.5, -5.4, P.teal], [18.2, -4.6, P.amber], [21, -3.6, P.violet]] as [number, number, string][]) {
    L.place(R, 'umbrella', x, y, 0, { color: col, towel: col });
  }
  for (let i = 0; i < 14; i++) L.place(R, 'shell', -24 + i * 3.6, -5.6 + Math.sin(i * 2.3) * 0.9, i * 40, {});
  L.place(R, 'bench', -5, 0.2, 180, {}, { id: 'coast.bench.1' });
  L.place(R, 'bench', 6.2, -0.3, 180, {}, { id: 'coast.bench.2' });
  L.along(R, 'lamppost', [[-26, 0.6], [-14, -0.6], [-2, -1.0], [14, -1.4], [21, -0.8]], 9, -1.6, { color: P.navy, height: 3.0 }, { start: 3 });
  L.place(R, 'signpost', 1.4, 0.4, 0, { arms: [{ text: 'PIER & LIGHTHOUSE', rot: Math.PI / 2 + 0.3 }, { text: 'AIRDROP ISLE', rot: Math.PI / 2 - 0.6 }, { text: 'THE CHAIN', rot: -Math.PI / 2 + 0.2 }] });
  L.place(R, 'msgbox', 6.6, 4.0, 180, { color: P.coral }, { id: 'coast.msgbox' });
  L.place(R, 'tree.palm', 5.6, 10.5, 0, {});
  L.place(R, 'tree.palm', 13.2, 14.2, 0, {});
  L.place(R, 'tree.palm', -18.5, 9.5, 0, {});
  L.place(R, 'tree.palm', -6.2, 8.8, 0, {});

  // ---- Airdrop Isle ----------------------------------------------------------------------------------------
  L.place(R, 'tree.palm', 12.4, -35.5, 0, { scale: 1.2 });
  L.place(R, 'tree.palm', 16.2, -33.2, 0, { scale: 1.0 });
  L.place(R, 'chest', 14.2, -34.4, 200, {}, { id: 'coast.chest' });
  L.place(R, 'signpost', 12.6, -31.4, 0, { arms: [{ text: 'AIRDROP ISLE', rot: 0.4 }, { text: 'CLAIM RESPONSIBLY', rot: -2.6 }] });
}
