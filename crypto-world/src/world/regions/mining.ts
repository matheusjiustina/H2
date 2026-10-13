import { LayoutBuilder, ROAD_STYLES } from '../layout/LayoutBuilder';
import { P } from '../kits/palette';

/**
 * MINING DISTRICT — data halls with roaring roof fans, an open-air GPU farm, cooling towers,
 * a substation, catwalks, and Hash's repair bay where an old rig called Old Faithful waits.
 */
export function layoutMining(L: LayoutBuilder): void {
  const R = 'mining' as const;
  const S = ROAD_STYLES;

  // ---- Industrial roads ----------------------------------------------------------------------
  L.localRoad(R, 'mining.north', [[-3, -2], [-3, 4], [-3, 11.5], [2, 12.5], [10, 12.5], [16, 6]], S.industrial);
  L.localRoad(R, 'mining.south', [[4, -6], [5, -9.5]], S.lane);
  L.localRoad(R, 'mining.bay', [[-11, -6], [-11, -9]], S.lane);
  L.localRoad(R, 'mining.sub', [[18, -4], [22, -7.5]], S.lane);

  // ---- Gate ------------------------------------------------------------------------------------
  L.place(R, 'gate.arch', -23, -3.4, 90, { text: 'MINING DISTRICT', sub: 'hard hats · soft hearts', w: 6.2, bg: '#f0b04a', fg: P.ink }, { id: 'mining.gate' });

  // ---- Data halls ---------------------------------------------------------------------------------
  L.place(R, 'datacenter', -10.5, 9.8, 180, { w: 12, d: 8, h: 6.4, sign: 'HASHRATE HALL', sub: 'proof of work, proof of warmth' }, { id: 'mining.hall', pad: { hx: 6.6, hz: 4.6 } });
  L.place(R, 'datacenter', 4.5, 19, 180, { w: 8, d: 6, h: 5, wall: '#d7cbbb', sign: 'BLOCK FOUNDRY', sub: 'fresh blocks every ten minutes' }, { id: 'mining.foundry', pad: { hx: 4.5, hz: 3.6 } });
  L.place(R, 'cooling.tower', 14.5, 15.5, 0, { h: 7.5 }, { pad: { hx: 0, hz: 0, round: 2.8 } });
  L.place(R, 'cooling.tower', 19.5, 9.8, 0, { h: 6.5 }, { pad: { hx: 0, hz: 0, round: 2.8 } });
  L.place(R, 'catwalk', 6.5, 7.8, 90, { len: 6, h: 2.2 }, { id: 'mining.catwalk' });

  // ---- GPU farm and repair bay ----------------------------------------------------------------------
  L.place(R, 'gpu.farm', 9.5, -13.8, 0, { w: 10, d: 7, sign: 'GPU FARM 3 · PLEASE DO NOT FEED THE FANS' }, { id: 'mining.farm', pad: { hx: 5.6, hz: 4.2 } });
  L.place(R, 'repair.bay', -11.2, -12.8, 0, {}, { id: 'mining.bay', pad: { hx: 4, hz: 3.4 } });
  L.place(R, 'crate', -16.4, -8.4, 15, { stack: true });
  L.place(R, 'barrel', -15.6, -7.4, 0, { color: '#c9663e' });
  L.place(R, 'spool', -6.2, -8.2, 70, { color: '#2f6c78' });

  // ---- Substation ------------------------------------------------------------------------------------
  L.place(R, 'transformer', 22.6, -11.2, 0, {});
  L.place(R, 'transformer', 25.6, -10.6, 10, {});
  L.place(R, 'fence.chain', 24.1, -13.6, 5, { len: 7 });
  L.place(R, 'fence.chain', 20.4, -10.8, 95, { len: 5 });
  L.place(R, 'spool', 17, -9.2, 30, { color: '#7a5234' });
  L.place(R, 'spool', 15.7, -10.4, 80, { color: '#2f6c78' });

  // ---- Relay panel (network congestion mission) and misc -------------------------------------------------
  L.place(R, 'relay.panel', 2.6, 1.4, 180, { iid: 'mining.relay.panel', label: 'MINING RELAY', prompt: 'Open the mining relay panel', title: 'Mining District — Relay Panel' }, { id: 'mining.relay' });
  L.place(R, 'forklift', -1.2, 5.6, 35, {});
  L.place(R, 'crate', 0.4, 3.4, 0, {});
  L.place(R, 'crate', 1.3, 3.0, 25, { size: 0.6 });
  L.place(R, 'barrel', -17.6, 4.2, 0, {});
  L.place(R, 'barrel', -16.8, 3.4, 0, { color: '#f0b04a' });
  L.place(R, 'msgbox', -5.2, -7.0, 0, { color: '#f0b04a' }, { id: 'mining.msgbox' });
  L.place(R, 'bench', -4.8, 15.2, 180, {}, { id: 'mining.bench' });
  L.along(R, 'powerpole', [[-26, 0.8], [-10, -0.2], [10, -0.2], [26, 1.6]], 10, 0, {}, { start: 2 });
  L.along(R, 'lamppost', [[-26, -3], [-10, -4], [10, -4], [26, -2]], 11, -3.2, { color: '#5b6672' }, { start: 6 });

  // The overlooked terminal behind Hashrate Hall (a secret).
  L.place(R, 'desk.secret', -12.5, 15.4, 0, { iid: 'secret.devnotes', secret: 'devnotes', label: 'Read the sticky notes' }, { id: 'mining.secretdesk' });
  L.place(R, 'crate', -14.2, 15.8, 40, {});
}
