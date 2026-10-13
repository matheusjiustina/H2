import { LayoutBuilder, ROAD_STYLES } from '../layout/LayoutBuilder';
import { P } from '../kits/palette';
import { drawIcon } from '../../render/Atlases';

/**
 * CHAIN CITY — the social and technological centre. Consensus Square sits at the heart, with the
 * ring road ("The Chain") running along its southern edge, a small financial district to the
 * north, cafés and shops east, the library and relay office west, and Mempool Market to the south.
 */
export function layoutCity(L: LayoutBuilder): void {
  const R = 'city' as const;
  const S = ROAD_STYLES;

  // ---- Streets ---------------------------------------------------------------------------------
  L.localRoad(R, 'city.sidewalk.avenue', [[-31, -12], [-15, -12], [0, -12], [15, -12], [31, -11]], S.sidewalk);
  L.localRoad(R, 'city.north', [[0, 9], [0, 20], [0, 31]], S.street);
  L.localRoad(R, 'city.cross', [[-27, 19], [-13, 19], [0, 19.4], [13, 19], [27, 19]], S.street);
  L.localRoad(R, 'city.westlane', [[-9, 0.5], [-20, 1.5], [-33, 2.5]], S.street);
  L.localRoad(R, 'city.eastlane', [[9, 0.5], [20, 1], [33, 1.5]], S.street);
  L.localRoad(R, 'city.west', [[-21, -12], [-21, 1.5], [-21, 19]], S.lane);
  L.localRoad(R, 'city.east', [[21, -12], [21, 1], [21, 19]], S.lane);
  L.localRoad(R, 'city.market', [[0, -12], [0, -22], [0, -31]], S.lane);
  L.localRoad(R, 'city.pondpath', [[0, -31], [-6, -33.5], [-14, -36], [-20, -42], [-20, -50]], S.path);
  L.localRoad(R, 'city.pondpath2', [[0, -31], [8, -33.2], [17, -37], [21, -44]], S.path);
  L.localRoad(R, 'city.southwest', [[-21, -12], [-23, -20], [-26, -26]], S.lane);

  // ---- Consensus Square ------------------------------------------------------------------------
  L.flatten(R, 0, 0, { radius: 10.5, falloff: 3, priority: 1 });
  L.decal(R, 0, 0, 0, 10.4, (ctx) => drawConsensusSquare(ctx, L));
  L.place(R, 'sculpture.block', 0, 0, 180, {}, { id: 'city.sculpture' });
  const benchAngles = [28, 62, 118, 152, 208, 242, 298, 332];
  for (const a of benchAngles) {
    const r = a < 180 ? 7.6 : 7.4;
    const rad = (a * Math.PI) / 180;
    L.place(R, 'bench', Math.cos(rad) * r, Math.sin(rad) * r, 90 - a + 180, { color: P.wood }, { id: `city.bench.${a}` });
  }
  for (const a of [45, 135, 225, 315]) {
    const rad = (a * Math.PI) / 180;
    L.place(R, 'lamppost', Math.cos(rad) * 9.2, Math.sin(rad) * 9.2, 0, { height: 3.4 });
  }
  for (const a of [12, 168, 192, 348]) {
    const rad = (a * Math.PI) / 180;
    L.place(R, 'planter', Math.cos(rad) * 8.6, Math.sin(rad) * 8.6, 0, { tree: true, w: 1.3 });
  }

  // ---- North: financial district ----------------------------------------------------------------
  L.place(R, 'tower.consensus', -9, 26, 180, {}, { id: 'city.tower', pad: { hx: 4, hz: 4 } });
  L.place(R, 'building', 9.5, 26, 180, {
    w: 7, d: 6, floors: 3, glass: true, trim: P.paper, roof: 'flat', rooftop: 'solar', base: P.stoneDark,
    door: { color: P.violet, double: true, canopy: P.violet },
    sign: { text: 'NOVALABS', sub: 'decentralised apps, centralised snacks', bg: P.violet, fg: P.paper, icon: 'star', accent: P.butter, w: 4, h: 0.7, y: 3.0 },
    screen: { kind: 'contract', w: 2.2, h: 1.3, y: 6.2 },
  }, { id: 'city.novalabs', pad: { hx: 3.6, hz: 3.1 } });
  L.place(R, 'bank', 8.5, 14, 180, { name: 'NONCE & SONS' }, { id: 'city.bank', pad: { hx: 3.6, hz: 4.5 } });
  L.place(R, 'building', -8.5, 14.5, 180, {
    w: 6, d: 5, floors: 3, wall: P.peach, trim: P.paper, roof: 'hip', roofColor: P.brick, base: P.stoneDark,
    windows: { style: 'tall', per: 3, lit: 0.5 }, door: { color: P.navy, canopy: P.navy },
    sign: { text: 'HASHBROWN CAPITAL', sub: 'we only invest in breakfast', bg: P.butter, fg: P.woodDark, accent: P.woodDark, w: 4.2, h: 0.7 },
  }, { id: 'city.hashbrown', pad: { hx: 3.1, hz: 2.6 } });
  L.place(R, 'rowhouse', -18, 25.5, 180, { wall: P.mint, floors: 3 }, { pad: { hx: 2.2, hz: 2.6 } });
  L.place(R, 'rowhouse', 17.5, 25.5, 180, { wall: P.rose, floors: 2, balcony: true }, { pad: { hx: 2.2, hz: 2.6 } });
  L.place(R, 'billboard', -22, 22.5, 180, { screen: 'candles', span: 2, w: 4.6, h: 2.3, y: 3.6 });
  L.place(R, 'billboard', 23, 22.5, 180, { text: 'GM, CHAIN CITY', sub: 'have you said gm today?', bg: P.amber, fg: P.ink, w: 4.6, h: 2.3, y: 3.6, back: 'WAGMI', backSub: "we're all gonna make it" });

  // ---- West: library, relay office, homes ----------------------------------------------------------
  L.place(R, 'library', -15.5, 7.6, 90, {}, { id: 'city.library', pad: { hx: 4.8, hz: 4.4 } });
  L.place(R, 'relay.office', -14.6, -5.6, 90, {}, { id: 'city.relay', pad: { hx: 3.3, hz: 2.8 } });
  L.place(R, 'terminal', -10.4, -3.0, 90, { screen: 'relaymap', label: 'Use the Messenger Terminal', iid: 'city.messenger.terminal', kind: 'mission', title: 'Messenger Terminal', accent: P.amber }, { id: 'city.messenger.terminal' });
  L.place(R, 'msgbox', -10.8, -8.6, 90, {}, { id: 'city.msgbox.relay' });
  L.place(R, 'rowhouse', -25.2, 7.2, 180, { wall: P.butter }, { pad: { hx: 2.2, hz: 2.6 } });
  L.place(R, 'rowhouse', -29.8, 7.7, 180, { wall: P.powder, floors: 3 }, { pad: { hx: 2.2, hz: 2.6 } });
  L.place(R, 'rowhouse', -25.2, -4.6, 0, { wall: P.rose }, { pad: { hx: 2.2, hz: 2.6 } });
  L.place(R, 'rowhouse', -29.8, -4.0, 0, { wall: P.sage }, { pad: { hx: 2.2, hz: 2.6 } });
  L.place(R, 'rowhouse', -26, 14.8, 180, { wall: P.lavender, sign: { text: 'HODL HOSTEL', sub: 'check in · never check out', bg: P.navy, fg: P.paper, w: 3.2, h: 0.55 } }, { pad: { hx: 2.2, hz: 2.6 } });

  // ---- East: café, repair shop, homes ------------------------------------------------------------
  L.place(R, 'cafe', 15.6, 6.6, -90, {}, { id: 'city.cafe', pad: { hx: 3.7, hz: 3.4 } });
  L.place(R, 'table.set', 10.9, 4.4, 90, { umbrella: P.teal }, { id: 'city.cafe.table1' });
  L.place(R, 'table.set', 10.9, 8.6, 90, { umbrella: P.amber }, { id: 'city.cafe.table2' });
  L.place(R, 'table.set', 12.6, 11.6, 0, {}, { id: 'city.cafe.table3' });
  L.place(R, 'terminal', 12.2, 1.9, -90, { screen: 'terminal', label: 'Use the café guest terminal', iid: 'city.cafe.terminal', title: 'Proof of Brew — Guest Wi-Fi Log', color: P.woodDark }, { id: 'city.cafe.terminal' });
  L.place(R, 'repair.shop', 14.6, -5.6, -90, {}, { id: 'city.repair', pad: { hx: 3.0, hz: 2.8 } });
  L.place(R, 'rowhouse', 25.2, 7.2, 180, { wall: P.peach }, { pad: { hx: 2.2, hz: 2.6 } });
  L.place(R, 'rowhouse', 29.8, 7.7, 180, { wall: P.mint }, { pad: { hx: 2.2, hz: 2.6 } });
  L.place(R, 'rowhouse', 25.2, -4.6, 0, { wall: P.butter, floors: 3 }, { pad: { hx: 2.2, hz: 2.6 } });
  L.place(R, 'rowhouse', 29.8, -4.0, 0, { wall: P.powder }, { pad: { hx: 2.2, hz: 2.6 } });
  L.place(R, 'rowhouse', 26, 14.8, 180, { wall: P.cream, sign: { text: 'DIAMOND HANDS', sub: 'nail salon · never sells', bg: P.lavender, fg: P.ink, w: 3.2, h: 0.55 } }, { pad: { hx: 2.2, hz: 2.6 } });
  L.place(R, 'bulletin', 6.4, -9.0, 0, { doc: 'board.city', iid: 'city.bulletin' }, { id: 'city.bulletin' });
  L.place(R, 'msgbox', 5.0, -9.3, 0, { color: P.amber }, { id: 'city.msgbox.square' });

  // ---- South: arrivals, Mempool Market, Pixel's loft, Gas Station ---------------------------------
  L.place(R, 'bus.stop', -8, -15.3, 0, {}, { id: 'city.busstop' });
  const stalls: [number, number, string, string, string][] = [
    [-3.1, -17, 'fruit', P.red, 'FRESH BLOCKS'],
    [3.1, -17, 'gadgets', P.teal, 'COLD WALLETS'],
    [-3.1, -21.5, 'books', P.violet, 'WHITEPAPERS'],
    [-3.1, -26, 'coins', P.amber, 'COIN TOSS'],
    [3.1, -26, 'fish', P.deepTeal, 'WHALE MARKET'],
  ];
  for (const [x, y, goods, col, sign] of stalls) L.place(R, 'stall', x, y, x < 0 ? 90 : -90, { goods, color: col, sign, w: 2.6 }, { id: `city.stall.${goods}` });
  L.place(R, 'dex.kiosk', 3.3, -21.5, -90, {}, { id: 'city.dex' });
  L.place(R, 'terminal', -1.9, -29.6, 90, { screen: 'explorer', label: 'Use the market terminal', iid: 'city.market.terminal', title: 'Mempool Market — Public Explorer' }, { id: 'city.market.terminal' });
  L.place(R, 'flagpole', 1.8, -30.5, 0, { color: P.amber });
  L.place(R, 'loft.pixel', -10.6, -22, 90, {}, { id: 'city.pixelloft', pad: { hx: 3.5, hz: 3.0 } });
  L.place(R, 'gas.station', 26, -18.4, 0, {}, { id: 'city.gas', pad: { hx: 5, hz: 4.5, falloff: 2 } });
  L.place(R, 'rooftop.terrace', 14, -20.2, 0, { pizza: true, sign: { text: 'MOON BAKERY', sub: 'wen croissant?', bg: P.butter, fg: P.woodDark, icon: 'star', accent: P.woodDark, w: 3.6, h: 0.6 } }, { id: 'city.bakery', pad: { hx: 4.4, hz: 3.2 } });
  L.place(R, 'building', -16.4, -18.6, 0, {
    w: 5, d: 5, floors: 2, wall: P.coral, trim: P.paper, roof: 'gable', roofColor: P.navy, base: P.stoneDark,
    windows: { style: 'square', per: 2, lit: 0.5 }, door: { x: 1.2, color: P.navy }, shopfront: { w: 2.2, color: P.navy }, awning: P.navy,
    sign: { text: 'RUG PULL RUGS', sub: 'no refunds · great deals', bg: P.navy, fg: P.butter, w: 3.6, h: 0.6, y: 3.3 },
  }, { id: 'city.rugs', pad: { hx: 2.8, hz: 2.8 } });
  L.place(R, 'rowhouse', -22, -19.6, 0, { wall: P.sand }, { pad: { hx: 2.2, hz: 2.6 } });
  L.place(R, 'rowhouse', -27.2, -21, 20, { wall: P.mint }, { pad: { hx: 2.2, hz: 2.6 } });
  L.place(R, 'billboard', -21.5, -26.5, 45, { text: 'NOT YOUR KEYS', sub: 'not your cheese — Cold Storage Creamery', bg: P.powder, fg: P.navy, w: 4.4, h: 2.2, y: 3.4 });

  // ---- Pond park ---------------------------------------------------------------------------------
  for (const [x, y, h] of [[-4, -33.6, 200], [5, -33.8, 160], [12, -35.5, 140]] as [number, number, number][]) L.place(R, 'bench', x, y, h, {}, { id: `city.pondbench.${x}` });
  L.place(R, 'lamppost', 0.8, -32, 0);
  L.place(R, 'signpost', -1.8, -31.6, 0, { arms: [{ text: 'MEMPOOL POND', rot: Math.PI / 2 + 0.6 }, { text: 'CONSENSUS SQ.', rot: -Math.PI / 2 }] });

  // ---- Street furniture along roads ---------------------------------------------------------------
  const avenue: [number, number][] = [[-30, -12], [-15, -12], [0, -12], [15, -12], [30, -11]];
  L.along(R, 'lamppost', avenue, 10, 3.5, {}, { both: true, start: 4 });
  L.along(R, 'planter', avenue, 10, 3.4, { tree: true, w: 1.1 }, { both: false, start: 9 });
  L.along(R, 'lamppost', [[0, 11], [0, 31]], 8, 2.0, {}, { both: true, start: 3 });
  L.along(R, 'lamppost', [[-27, 19], [27, 19]], 9, 2.0, {}, { start: 4 });
  L.along(R, 'lamppost', [[-11, 0.7], [-33, 2.5]], 8, 1.9, {}, { start: 5 });
  L.along(R, 'lamppost', [[11, 0.7], [33, 1.5]], 8, -1.9, {}, { start: 5 });
  L.along(R, 'lamppost', [[0, -14], [0, -31]], 7, 1.5, {}, { start: 2 });
  for (const [x, y] of [[-6.2, 10.4], [6.4, -10.2], [-19.2, -9.6], [19.8, -9.6], [1.6, 21.3]] as [number, number][]) L.place(R, 'bin', x, y, 0);
  for (const [x, y] of [[-3, -10.6], [-1.5, -10.6], [1.5, -10.6], [3, -10.6]] as [number, number][]) L.place(R, 'bollard', x, y, 0);
  for (const [x, y] of [[-23, -9.9], [23.4, -9.9], [-19, 21.5]] as [number, number][]) L.place(R, 'hydrant', x, y, 0);
  L.place(R, 'bike', -12.2, -10.0, 90, {});
  L.place(R, 'bike', -12.2, -10.8, 90, {});
  L.place(R, 'flowerbed', -4.5, 11.2, 0, { w: 3.2, d: 1.1 });
  L.place(R, 'flowerbed', 4.2, 11.3, 0, { w: 2.2, d: 1.1 });
  L.place(R, 'flowerbed', -11.6, 1.8, 90, { w: 2.4, d: 0.9 });
  L.place(R, 'terminal', 6.2, 8.4, -135, { screen: 'candles', label: 'Check the square terminal', iid: 'city.terminal.square', title: 'Consensus Square — Market Board (simulated)' }, { id: 'city.terminal.square' });

  // Soft paving for café terrace and market forecourt.
  L.overlay((p) => {
    const f = L.get(R).frame;
    p.fillPolygon([f.dir(9.5, 2.4), f.dir(12.6, 2.4), f.dir(12.6, 13), f.dir(9.5, 13)], 'rgba(214,198,172,0.95)');
    p.fillPolygon([f.dir(-6.5, -30.5), f.dir(6.5, -30.5), f.dir(6.5, -14.2), f.dir(-6.5, -14.2)], 'rgba(205,190,166,0.9)');
    p.fillPolygon([f.dir(-12, -2.5), f.dir(-9.5, -2.5), f.dir(-9.5, -9.6), f.dir(-12, -9.6)], 'rgba(214,198,172,0.95)');
  }, 1);
}

/** The plaza mosaic: radial paving, a ring of twelve linked blocks, and a compass to every district. */
function drawConsensusSquare(ctx: CanvasRenderingContext2D, L: LayoutBuilder): void {
  const R = 9.6;
  ctx.save();
  // Paving disc.
  ctx.fillStyle = '#e4d8c3';
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  // Radial joints and rings.
  ctx.strokeStyle = 'rgba(150,132,104,0.35)';
  ctx.lineWidth = 0.04;
  for (let r = 1.2; r < R; r += 0.9) { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); }
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * 3.3, Math.sin(a) * 3.3); ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); ctx.stroke();
  }
  // Border.
  ctx.lineWidth = 0.45;
  ctx.strokeStyle = '#b8a688';
  ctx.beginPath(); ctx.arc(0, 0, R - 0.22, 0, Math.PI * 2); ctx.stroke();
  // The Chain: twelve blocks linked in a ring.
  const n = 12, rr = 5.9;
  ctx.lineWidth = 0.22;
  ctx.strokeStyle = '#7d6a52';
  ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ctx.save();
    ctx.translate(Math.cos(a) * rr, Math.sin(a) * rr);
    ctx.rotate(a);
    ctx.fillStyle = i % 2 ? '#f0b04a' : '#a99be0';
    ctx.strokeStyle = '#5b4b3a';
    ctx.lineWidth = 0.08;
    ctx.beginPath(); ctx.rect(-0.55, -0.55, 1.1, 1.1); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(-0.45, 0.15, 0.9, 0.25);
    ctx.restore();
  }
  // Inner ring around the sculpture.
  ctx.fillStyle = '#cdbd9f';
  ctx.beginPath(); ctx.arc(0, 0, 3.35, 0, Math.PI * 2); ctx.fill();
  // Compass arrows to each district.
  const f = L.get('city').frame;
  const targets: [string, string][] = [['hills', 'GENESIS HILLS'], ['coast', 'DEGEN COAST'], ['mining', 'MINING DISTRICT'], ['heights', 'NODE HEIGHTS'], ['woods', 'WHITEPAPER WOODS']];
  for (const [id, label] of targets) {
    const loc = f.local(L.get(id as any).frame.center);
    const a = Math.atan2(loc.y, loc.x);
    ctx.save();
    ctx.rotate(a);
    ctx.fillStyle = '#6f5f4a';
    ctx.beginPath(); ctx.moveTo(8.9, 0); ctx.lineTo(8.1, 0.32); ctx.lineTo(8.1, -0.32); ctx.closePath(); ctx.fill();
    ctx.translate(7.35, 0);
    ctx.rotate(Math.PI / 2 * (Math.cos(a) >= 0 ? -1 : 1));
    ctx.scale(1, -1);
    ctx.fillStyle = '#6f5f4a';
    ctx.font = '600 0.36px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }
  // Small engraved coin motifs.
  ctx.save(); ctx.translate(0, -4.1); ctx.scale(1, -1); drawIcon(ctx, 'btc', 0, 0, 0.7, '#c89a3c'); ctx.restore();
  ctx.save(); ctx.translate(0, 4.1); ctx.scale(1, -1); drawIcon(ctx, 'eth', 0, 0, 0.75, '#8576c4'); ctx.restore();
  ctx.restore();
}
