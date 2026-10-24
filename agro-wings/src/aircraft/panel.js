// Instrument panel of the PR-AGW (EMB-202A Ipanema) on a canvas texture.
// Light grey aluminium; annunciator lamps on top; a 3x2 block of flight and
// engine instruments with an engine column beside it; a switch strip with the
// magneto key, the flap indicator and the boom pressure gauge; a SATLOC-style
// guidance unit (AGRONAV M3) with a flow monitor under it on the right.
// The round instruments are 3D in the cockpit (model.js): recessed cans with
// bezels, glass and 3D needles. This canvas holds their dial faces (drawn
// once into the static layer) and the live parts that are flat on a real
// panel: lamps, the GPS screen and the LCD readouts. readings(d) turns the
// telemetry into the needle angles, the turn coordinator, the ball, the
// switch and key positions that model.js applies.
// A second small texture is the hopper sight window under the panel (level
// graduations + live liquid level).
import { canvas, canvasTexture } from '../core/textures.js';
import { clamp, rng, smoothstep } from '../core/math.js';
import { FLIGHT, SPRAY } from '../config.js';

const TAU = Math.PI * 2;
const SWEEP = [Math.PI * 0.75, Math.PI * 2.25]; // 270° engine-gauge sweep

// Layout in canvas pixels (1024 x 512 = 0.96 x 0.48 m of panel).
export const IPA_PANEL = {
  W: 1024, H: 512,
  gauges: {
    asi: { x: 110, y: 150, r: 60 }, tach: { x: 255, y: 150, r: 60 }, map: { x: 400, y: 150, r: 60 },
    alt: { x: 110, y: 300, r: 60 }, tc: { x: 255, y: 300, r: 60 }, vsi: { x: 400, y: 300, r: 60 },
    oilP: { x: 538, y: 100, r: 40 }, oilT: { x: 538, y: 196, r: 40 }, fuel: { x: 538, y: 292, r: 40 },
    psi: { x: 548, y: 447, r: 38 },
  },
  // Needle -> [gauge, length (x r), width (x r), layer (0 = nearest the dial)].
  needles: {
    asi: ['asi', 0.86, 0.075, 0], tach: ['tach', 0.86, 0.075, 0], map: ['map', 0.86, 0.075, 0],
    alt10k: ['alt', 0.92, 0.03, 0], alt1000: ['alt', 0.56, 0.13, 1], alt100: ['alt', 0.88, 0.07, 2],
    vsi: ['vsi', 0.86, 0.075, 0], oilP: ['oilP', 0.84, 0.085, 0], oilT: ['oilT', 0.84, 0.085, 0],
    fuel: ['fuel', 0.84, 0.085, 0], psi: ['psi', 0.84, 0.085, 0],
  },
  lamps: [[175, 34, 'STALL', '#ff3b2a'], [220, 34, 'ÓLEO', '#ff3b2a'], [265, 34, 'COMB.', '#ffb020'], [310, 34, 'FREIO', '#ffb020'], [355, 34, 'SPRAY', '#3dff7a']],
  toggles: [[122, 'BAT'], [159, 'ALT'], [196, 'B.COMB'], [233, 'NAV'], [270, 'STROBE'], [307, 'FARÓIS'], [344, 'VÁLV.'], [381, 'GPS']].map(([x, t]) => ({ x, y: 458, t })),
  key: { x: 60, y: 452 },
  flap: { x: 452, y: 450 },
  gps: { x: 625, y: 16, w: 380, h: 300 },
  screen: { x: 643, y: 32, w: 344, h: 218 },
  lcd: { x: 642, y: 364, w: 356, h: 132 },
  sight: { cap: 900, step: 50 },
};

// Dial scales: value range and the canvas angles of its ends (radians,
// 0 = 3 o'clock, clockwise; canvas y points down).
const SCALES = {
  asi: { min: 0, max: 160, a0: -Math.PI / 2 + 0.1, a1: -Math.PI / 2 + 0.1 + TAU * 0.9 },
  tach: { min: 0, max: 30, a0: SWEEP[0], a1: SWEEP[1] },
  map: { min: 10, max: 35, a0: SWEEP[0], a1: SWEEP[1] },
  alt: { min: 0, max: 1000, a0: -Math.PI / 2, a1: Math.PI * 1.5 },
  vsi: { min: -20, max: 20, a0: Math.PI - (175 * Math.PI) / 180, a1: Math.PI + (175 * Math.PI) / 180 },
  oilP: { min: 0, max: 120, a0: SWEEP[0], a1: SWEEP[1] },
  oilT: { min: 40, max: 140, a0: SWEEP[0], a1: SWEEP[1] },
  fuel: { min: 0, max: 260, a0: SWEEP[0], a1: SWEEP[1] },
  psi: { min: 0, max: 60, a0: SWEEP[0], a1: SWEEP[1] },
};
const angOf = (sc, v) => sc.a0 + ((clamp(v, sc.min, sc.max) - sc.min) / (sc.max - sc.min)) * (sc.a1 - sc.a0);
const KEY_ANG = { off: -2.25, r: -1.8, l: -1.35, both: -0.9, start: -0.42 };

export function createPanel() {
  const L = IPA_PANEL;
  const c = canvas(L.W, L.H);
  const tex = canvasTexture(c, { aniso: 8 });
  const g = c.getContext('2d');
  const bg = canvas(L.W, L.H);
  const bgg = bg.getContext('2d');
  // The static layer (plate, placards, dial faces) depends on the type's
  // limits (V-speeds, tank size); it is redrawn if they change.
  let bgKey = '';
  const ensureBg = (d) => {
    const k = [d.vs0, d.vs1, d.vfe, d.vne, d.fuelCap].join();
    if (k === bgKey) return;
    bgKey = k;
    drawIpaBackground(bgg, d);
  };
  const sc = canvas(256, 448);
  const sightTex = canvasTexture(sc, { aniso: 4 });
  const sg = sc.getContext('2d');
  const sightBg = canvas(256, 448);
  drawSightBackground(sightBg.getContext('2d'), L.sight.cap, L.sight.step);
  let lastHopper = -1;
  const drawSight = (hopper, cap) => {
    sg.drawImage(sightBg, 0, 0);
    const top = 24, bot = 424;
    const y = bot - (clamp(hopper / cap, 0, 1)) * (bot - top);
    if (hopper > 0.5) {
      const lg = sg.createLinearGradient(0, y, 0, bot);
      lg.addColorStop(0, 'rgba(95,150,120,0.55)');
      lg.addColorStop(1, 'rgba(45,90,70,0.7)');
      sg.fillStyle = lg;
      sg.fillRect(14, y, 228, bot - y);
      sg.fillStyle = 'rgba(220,240,225,0.75)';
      sg.fillRect(14, y - 1, 228, 3);
    }
    // Window frame shadow.
    sg.strokeStyle = 'rgba(0,0,0,0.6)'; sg.lineWidth = 14;
    sg.strokeRect(7, 7, 242, 434);
    sightTex.needsUpdate = true;
  };
  drawSight(0, L.sight.cap);
  const DEF = { vs0: 48, vs1: 55, vfe: 95, vne: 140, fuelCap: 260 };
  const panel = {
    canvas: c, texture: tex, sightTexture: sightTex, layout: L,
    draw(d) {
      ensureBg(d);
      g.drawImage(bg, 0, 0);
      lampsIpa(g, d);
      flapInd(g, L.flap.x, L.flap.y, d.flaps);
      gpsUnit(g, d.gps);
      lcd(g, d);
      tex.needsUpdate = true;
      if (Math.abs(d.hopper - lastHopper) > 0.8) { lastHopper = d.hopper; drawSight(d.hopper, d.hopperCap); }
    },
    readings,
  };
  // Not blank before the first cockpit frame (seen through the windshield).
  ensureBg(DEF);
  g.drawImage(bg, 0, 0);
  flapInd(g, L.flap.x, L.flap.y, 0);
  gpsUnit(g, null);
  return panel;
}

// Telemetry -> instrument state (angles in canvas radians).
function readings(d) {
  const run = d.engine === 'running', crank = d.engine === 'cranking';
  const rpm = d.rpm;
  // Manifold pressure from the ambient (altitude) and the throttle opening.
  const amb = 29.92 * Math.exp(-(Math.max(0, d.altFt) * 0.3048) / 8400);
  const map = run ? amb - (amb - 11.5) * (1 - clamp(d.throttle, 0, 1)) ** 1.3 * clamp(rpm / 1200, 0.6, 1.2) : crank ? amb - 4 : amb;
  // Oil pressure rises with rpm; oil warm while running.
  const oilP = run ? 25 + 55 * smoothstep(600, 2300, rpm) : crank ? 12 : 0;
  const oilT = run ? 72 + 16 * clamp(rpm / FLIGHT.maxRpm, 0, 1) : 34;
  const psi = d.spray && d.flow > 0 ? 40 * clamp(d.flow / SPRAY.flow, 0, 1.3) : 0;
  const alt = Math.max(0, d.altFt);
  const S = SCALES;
  const a = {
    asi: angOf(S.asi, d.ias), tach: angOf(S.tach, rpm / 100), map: angOf(S.map, map),
    alt100: S.alt.a0 + ((alt % 1000) / 1000) * TAU, alt1000: S.alt.a0 + ((alt % 10000) / 10000) * TAU, alt10k: S.alt.a0 + ((alt % 100000) / 100000) * TAU,
    vsi: angOf(S.vsi, d.vsFpm / 100), oilP: angOf(S.oilP, oilP), oilT: angOf(S.oilT, oilT),
    fuel: angOf({ ...S.fuel, max: d.fuelCap || 260 }, d.fuel), psi: angOf(S.psi, psi),
  };
  // Turn coordinator: the aircraft symbol tilts 20° at standard rate (3°/s);
  // the ball runs out to the side the skid throws it.
  const tc = clamp(d.yawRate / 0.0524, -1.6, 1.6) * 0.349;
  const G = IPA_PANEL.gauges.tc, R = G.r * 1.15, phi = d.onGround ? 0 : clamp(d.slip * 4, -0.33, 0.33);
  const ball = [G.x + Math.sin(phi) * R, G.y + G.r * 0.5 - R * (1 - Math.cos(phi))];
  const master = d.engine !== 'off' || !d.onGround;
  const toggles = [master, run, crank || (run && d.onGround), master, master && run, false, !!d.spray, master];
  const key = d.engine === 'off' ? KEY_ANG.off : crank ? KEY_ANG.start : KEY_ANG.both;
  return { a, tc, ball, toggles, key, master, mixture: run || crank ? 1 : 0, prop: run || crank ? 1 : 0.15 };
}

function drawIpaBackground(g, d) {
  const L = IPA_PANEL, W = L.W, H = L.H;
  // Light grey aluminium, a little darker under the glareshield.
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#8e979f');
  grd.addColorStop(0.1, '#a9b2ba');
  grd.addColorStop(1, '#a0a9b1');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  const sh = g.createLinearGradient(0, 0, 0, 40);
  sh.addColorStop(0, 'rgba(0,0,0,0.6)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sh;
  g.fillRect(0, 0, W, 40);
  // Brushed texture + scuffs and finger marks round the switches.
  const r = rng(77);
  for (let i = 0; i < 2600; i++) {
    const v = r() < 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${0.02 + r() * 0.03})`;
    g.fillRect(r() * W, r() * H, 1 + r() * 30, 1);
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(40,40,40,${0.03 + r() * 0.04})`;
    g.beginPath(); g.ellipse(100 + r() * 320, 430 + r() * 60, 6 + r() * 10, 4 + r() * 6, r() * 3, 0, TAU); g.fill();
  }
  // Sub-panel seams (switch strip, engine column) and screws.
  g.strokeStyle = 'rgba(40,46,52,0.5)'; g.lineWidth = 2;
  g.strokeRect(24, 392, 592, 112);
  g.beginPath(); g.moveTo(486, 40); g.lineTo(486, 392); g.stroke();
  g.fillStyle = '#3b4148';
  const screw = (x, y) => {
    g.fillStyle = '#3b4148'; g.beginPath(); g.arc(x, y, 4.5, 0, TAU); g.fill();
    g.strokeStyle = '#7d858c'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x - 3, y); g.lineTo(x + 3, y); g.stroke();
  };
  for (const x of [14, 170, 330, 486, 612, 1010]) { screw(x, 22); screw(x, 500); }
  for (const y of [140, 260, 380]) { screw(14, y); screw(1010, y); }
  for (const [x, y] of [[32, 400], [608, 400], [32, 496], [608, 496]]) screw(x, y);
  // Placards.
  g.fillStyle = '#1f252b';
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.font = 'bold 12px Arial';
  g.fillText('PR-AGW', 30, 32);
  g.font = 'bold 9px Arial';
  g.fillText('EMB-202A', 30, 46);
  const placard = (x, y, w, h, lines, fill = '#e9e6dc', ink = '#1d1f22') => {
    g.fillStyle = fill; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    g.fillStyle = ink; g.font = 'bold 8px Arial'; g.textAlign = 'center';
    lines.forEach((t, i) => g.fillText(t, x + w / 2, y + 11 + i * 10));
    g.textAlign = 'left';
  };
  placard(30, 371, 168, 16, ['NÃO DECOLAR COM O HOPPER ABERTO'], '#c8261b', '#fff4ea');
  placard(210, 371, 170, 16, ['MANOBRAS ACROBÁTICAS PROIBIDAS']);
  placard(394, 362, 86, 26, ['VNE 140 KT', 'VA 105 KT']);
  // Dial faces.
  const G = L.gauges, S = SCALES;
  const vne = d.vne ?? 140;
  dialFace(g, G.asi, S.asi, { major: 20, minor: 5, from: 40, label: ['KNOTS'], labelY: [0.36],
    arcs: [[d.vs0, d.vfe, '#f2f2ee', 0.68], [d.vs1, vne * 0.82, '#3fb24a', 0.8], [vne * 0.82, vne, '#f0c020', 0.8]], red: [vne] });
  dialFace(g, G.tach, S.tach, { major: 5, minor: 1, label: ['RPM', 'x100'], labelY: [0.3, 0.44], arcs: [[21, 27, '#3fb24a', 0.8]], red: [27] });
  {
    // Hour meter.
    const t = G.tach;
    g.fillStyle = '#000'; g.fillRect(t.x - 22, t.y + 0.58 * t.r - 8, 44, 15);
    g.fillStyle = '#e6e6e0'; g.font = 'bold 11px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('3472.6', t.x, t.y + 0.58 * t.r);
  }
  dialFace(g, G.map, S.map, { major: 5, minor: 1, label: ['MANIFOLD', 'PRESS', 'IN.HG'], labelY: [0.24, 0.38, 0.52], arcs: [[15, 25, '#3fb24a', 0.8]], red: [] });
  dialFace(g, G.alt, { min: 0, max: 10, a0: S.alt.a0, a1: S.alt.a1 }, { major: 1, minor: 0.2, wrap: true, label: ['ALT', '100 FEET'], labelY: [-0.32, 0.4], arcs: [], red: [] });
  {
    const t = G.alt;
    g.fillStyle = '#000'; g.fillRect(t.x + 0.3 * t.r, t.y - 7, 26, 14);
    g.fillStyle = '#e6e6e0'; g.font = 'bold 10px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('29.92', t.x + 0.3 * t.r + 13, t.y);
  }
  tcFace(g, G.tc);
  dialFace(g, G.vsi, S.vsi, { major: 5, minor: 1, abs: true, fmt: (v) => String(Math.abs(v) / 10).replace(/^0\./, '.'), label: ['VERTICAL SPEED', '1000 FT/MIN'], labelY: [-0.3, 0.32], arcs: [], red: [],
    extra: (x, y, r) => { g.fillStyle = '#b9bcb6'; g.font = `bold ${Math.round(r * 0.12)}px Arial`; g.fillText('UP', x - r * 0.42, y - r * 0.5); g.fillText('DN', x - r * 0.42, y + r * 0.52); } });
  dialFace(g, G.oilP, S.oilP, { major: 40, minor: 20, label: ['ÓLEO', 'PSI'], labelY: [0.32, 0.5], arcs: [[0, 25, '#d0362a', 0.82], [60, 90, '#3fb24a', 0.82]], red: [100] });
  dialFace(g, G.oilT, S.oilT, { major: 20, minor: 10, label: ['ÓLEO', '°C'], labelY: [0.32, 0.5], arcs: [[60, 118, '#3fb24a', 0.82]], red: [118] });
  const cap = d.fuelCap || 260;
  dialFace(g, G.fuel, { ...S.fuel, max: cap }, { major: cap / 4, minor: cap / 8, fmt: (v) => ['E', '¼', '½', '¾', 'F'][Math.round((v / cap) * 4)], label: ['COMB.', 'LITROS'], labelY: [0.32, 0.5], arcs: [[0, cap * 0.12, '#d0362a', 0.82]], red: [] });
  dialFace(g, G.psi, S.psi, { major: 20, minor: 5, label: ['BARRA', 'PSI'], labelY: [0.32, 0.5], arcs: [[25, 45, '#3fb24a', 0.82]], red: [55] });
  // Switch strip: magneto key, toggles with their labels, breakers.
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#1f252b';
  {
    const k = L.key;
    g.fillStyle = '#23272c'; g.beginPath(); g.arc(k.x, k.y, 22, 0, TAU); g.fill();
    g.fillStyle = '#c9ced3'; g.beginPath(); g.arc(k.x, k.y, 18, 0, TAU); g.fill();
    g.fillStyle = '#1f252b'; g.font = 'bold 8px Arial';
    for (const [t, a] of [['OFF', KEY_ANG.off], ['R', KEY_ANG.r], ['L', KEY_ANG.l], ['BOTH', KEY_ANG.both], ['START', KEY_ANG.start]]) {
      g.fillText(t, k.x + Math.cos(a) * 31, k.y + Math.sin(a) * 31);
    }
    g.font = 'bold 9px Arial'; g.fillText('MAGNETOS', k.x, k.y + 36);
  }
  for (const t of L.toggles) {
    g.fillStyle = '#1f252b'; g.font = 'bold 8px Arial';
    g.fillText(t.t, t.x, t.y - 34);
    g.font = '7px Arial';
    g.fillText('ON', t.x, t.y - 22);
    g.fillText('OFF', t.x, t.y + 24);
    g.fillStyle = '#2b3036'; g.beginPath(); g.arc(t.x, t.y, 9, 0, TAU); g.fill();
    g.fillStyle = '#8d949b'; g.beginPath(); g.arc(t.x, t.y, 6.5, 0, TAU); g.fill();
  }
  g.fillStyle = '#c8261b'; g.fillRect(L.toggles[6].x - 15, L.toggles[6].y - 44, 30, 3);
  for (let i = 0; i < 9; i++) {
    const x = 120 + i * 30, y = 492;
    g.fillStyle = '#16191c'; g.beginPath(); g.arc(x, y, 5.5, 0, TAU); g.fill();
    g.fillStyle = '#3a3f45'; g.beginPath(); g.arc(x, y, 3.5, 0, TAU); g.fill();
  }
  g.fillStyle = '#1f252b'; g.font = '7px Arial';
  g.fillText('CIRCUIT BREAKERS', 240, 482);
  // Lamp housings and labels (the light itself is live, lampsIpa()).
  for (const [x, y, t] of L.lamps) {
    g.fillStyle = '#1a1d20'; g.beginPath(); g.arc(x, y, 15, 0, TAU); g.fill();
    g.fillStyle = '#1f252b'; g.font = 'bold 8px Arial'; g.fillText(t, x, y + 23);
  }
  // Guidance unit and flow monitor recesses.
  roundRect(g, L.gps.x - 4, L.gps.y - 4, L.gps.w + 8, L.gps.h + 8, 16); g.fillStyle = '#2a2f35'; g.fill();
  roundRect(g, L.lcd.x - 6, L.lcd.y - 6, L.lcd.w + 12, L.lcd.h + 12, 8); g.fillStyle = '#16191c'; g.fill();
}

// Static dial face: black can, arcs, graduations, numbers, legend. No needle
// (the needles are 3D) and no glint (the 3D glass reflects).
function dialFace(g, G, sc, o) {
  const { x, y, r } = G;
  const ang = (v) => sc.a0 + ((v - sc.min) / (sc.max - sc.min)) * (sc.a1 - sc.a0);
  const face = g.createRadialGradient(x, y - r * 0.3, r * 0.1, x, y, r + 6);
  face.addColorStop(0, '#16181a');
  face.addColorStop(1, '#050606');
  g.fillStyle = face;
  g.beginPath(); g.arc(x, y, r + 6, 0, TAU); g.fill();
  for (const [v0, v1, col, rr] of o.arcs) {
    if (!(v1 > v0)) continue;
    g.strokeStyle = col; g.lineWidth = Math.max(3.5, r * 0.075);
    g.beginPath(); g.arc(x, y, rr * r, ang(clamp(v0, sc.min, sc.max)), ang(clamp(v1, sc.min, sc.max))); g.stroke();
  }
  for (const v of o.red) {
    const a = ang(clamp(v, sc.min, sc.max));
    g.strokeStyle = '#d82a1f'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7); g.lineTo(x + Math.cos(a) * r * 0.96, y + Math.sin(a) * r * 0.96); g.stroke();
  }
  g.strokeStyle = '#ecebe4'; g.fillStyle = '#ecebe4';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold ${Math.round(r * (r > 50 ? 0.19 : 0.22))}px Arial`;
  const n = Math.round((sc.max - sc.min) / o.minor);
  for (let i = 0; i <= n; i++) {
    const v = sc.min + i * o.minor;
    if (o.wrap && i === n) break;
    const a = ang(v);
    const major = Math.abs(((v - sc.min) / o.major) - Math.round((v - sc.min) / o.major)) < 1e-6;
    const r0 = r * (major ? 0.78 : 0.86);
    g.lineWidth = major ? 2.6 : 1.3;
    g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95); g.stroke();
    if (major && v >= (o.from ?? -Infinity)) {
      const t = o.fmt ? o.fmt(v) : String(Math.round(o.abs ? Math.abs(v) : v));
      if (t !== undefined) g.fillText(t, x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6);
    }
  }
  g.font = `${Math.round(r * 0.12)}px Arial`;
  g.fillStyle = '#b9bcb6';
  o.label.forEach((t, i) => g.fillText(t, x, y + r * o.labelY[i]));
  o.extra?.(x, y, r);
}

// Turn coordinator face: wing-level and standard-rate marks, the inclinometer
// tube (the aircraft symbol and the ball are 3D).
function tcFace(g, G) {
  const { x, y, r } = G;
  g.fillStyle = '#0a0b0c';
  g.beginPath(); g.arc(x, y, r + 6, 0, TAU); g.fill();
  // Wings level (0, π) and standard-rate marks (a wingtip 20° down).
  g.strokeStyle = '#ecebe4'; g.lineWidth = 3;
  for (const t of [0, Math.PI, 0.349, Math.PI - 0.349]) {
    g.beginPath(); g.moveTo(x + Math.cos(t) * r * 0.74, y + Math.sin(t) * r * 0.74); g.lineTo(x + Math.cos(t) * r * 0.92, y + Math.sin(t) * r * 0.92); g.stroke();
  }
  g.fillStyle = '#ecebe4'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold ${Math.round(r * 0.16)}px Arial`;
  g.fillText('L', x - r * 0.56, y + r * 0.5);
  g.fillText('R', x + r * 0.56, y + r * 0.5);
  g.font = `${Math.round(r * 0.11)}px Arial`;
  g.fillStyle = '#b9bcb6';
  g.fillText('TURN COORDINATOR', x, y - r * 0.45);
  g.fillText('2 MIN', x, y + r * 0.82);
  // Inclinometer: curved glass tube with two wire marks.
  const R = r * 1.15, cy = y + r * 0.5 - R;
  g.strokeStyle = 'rgba(210,225,220,0.55)'; g.lineWidth = r * 0.17; g.lineCap = 'round';
  g.beginPath(); g.arc(x, cy, R, Math.PI / 2 - 0.36, Math.PI / 2 + 0.36); g.stroke();
  g.strokeStyle = 'rgba(25,30,28,0.9)'; g.lineWidth = r * 0.13;
  g.beginPath(); g.arc(x, cy, R, Math.PI / 2 - 0.35, Math.PI / 2 + 0.35); g.stroke();
  g.lineCap = 'butt';
  g.strokeStyle = '#ecebe4'; g.lineWidth = 1.6;
  for (const s of [-1, 1]) {
    const t = Math.PI / 2 + s * 0.08;
    g.beginPath(); g.moveTo(x + Math.cos(t) * (R - r * 0.09), cy + Math.sin(t) * (R - r * 0.09)); g.lineTo(x + Math.cos(t) * (R + r * 0.09), cy + Math.sin(t) * (R + r * 0.09)); g.stroke();
  }
  g.fillStyle = '#b9bcb6'; g.font = `${Math.round(r * 0.085)}px Arial`;
  g.fillText('NO PITCH INFORMATION', x, y + r * 0.66);
}

function bezel(g, x, y, r) {
  // Four mounting screws, black case, glass reflection.
  g.fillStyle = '#2b3036';
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    g.beginPath(); g.arc(x + Math.cos(a) * (r + 12), y + Math.sin(a) * (r + 12), 3.5, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#16191c';
  g.beginPath(); g.arc(x, y, r + 7, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#070808';
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}

function glassGlint(g, x, y, r) {
  const gl = g.createLinearGradient(x - r, y - r, x + r * 0.2, y + r * 0.2);
  gl.addColorStop(0, 'rgba(255,255,255,0.12)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gl;
  g.beginPath(); g.arc(x, y, r, Math.PI * 0.95, Math.PI * 1.75); g.lineTo(x, y); g.fill();
}

function gauge(g, x, y, r, o) {
  const sweep = ((o.sweep ?? 300) * Math.PI) / 180;
  const a0 = Math.PI / 2 + (Math.PI * 2 - sweep) / 2;
  const ang = (v) => a0 + ((clamp(v, o.min, o.max) - o.min) / (o.max - o.min)) * sweep;
  bezel(g, x, y, r);
  for (const [v0, v1, col, rr] of o.arcs) {
    if (v1 <= v0) continue;
    g.strokeStyle = col; g.lineWidth = Math.max(4, r * 0.07);
    g.beginPath(); g.arc(x, y, (rr / 108) * r, ang(v0), ang(v1)); g.stroke();
  }
  g.strokeStyle = '#e9e9e4'; g.fillStyle = '#e9e9e4';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold ${Math.round(r * 0.18)}px Arial`;
  for (let v = o.min; v <= o.max + 1e-6; v += o.minor) {
    const a = ang(v);
    const major = Math.abs(((v - o.min) / o.major) - Math.round((v - o.min) / o.major)) < 1e-6;
    const r0 = r * (major ? 0.78 : 0.85);
    g.lineWidth = major ? 3 : 1.5;
    g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a) * r * 0.93, y + Math.sin(a) * r * 0.93); g.stroke();
    if (major) g.fillText(String(Math.round(Math.abs(v))), x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6);
  }
  g.font = `${Math.round(r * 0.12)}px Arial`;
  g.fillStyle = '#b9bcb6';
  g.fillText(o.label, x, y + r * 0.3);
  g.fillText(o.unit, x, y + r * 0.46);
  needle(g, x, y, r * 0.82, ang(o.value), o.needle || '#f2f2ec');
  glassGlint(g, x, y, r);
}

function needle(g, x, y, len, a, col) {
  g.save();
  g.translate(x, y); g.rotate(a);
  g.fillStyle = col;
  g.beginPath(); g.moveTo(-len * 0.15, -4); g.lineTo(len, 0); g.lineTo(-len * 0.15, 4); g.closePath(); g.fill();
  g.restore();
  g.fillStyle = '#2a2d30';
  g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill();
}

function altimeter(g, x, y, r, ft) {
  bezel(g, x, y, r);
  g.strokeStyle = '#e9e9e4'; g.fillStyle = '#e9e9e4';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold ${Math.round(r * 0.19)}px Arial`;
  for (let i = 0; i < 50; i++) {
    const a = -Math.PI / 2 + (i / 50) * Math.PI * 2;
    const major = i % 5 === 0;
    g.lineWidth = major ? 3 : 1.5;
    const r0 = r * (major ? 0.78 : 0.86);
    g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a) * r * 0.93, y + Math.sin(a) * r * 0.93); g.stroke();
    if (major) g.fillText(String(i / 5), x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62);
  }
  g.font = `${Math.round(r * 0.12)}px Arial`;
  g.fillStyle = '#b9bcb6';
  g.fillText('ALT', x, y - r * 0.3);
  g.fillText('FEET', x, y + r * 0.44);
  g.fillStyle = '#000'; g.fillRect(x - 25, y + 6, 50, 20);
  g.fillStyle = '#fff'; g.font = 'bold 16px Arial';
  g.fillText(String(Math.max(0, Math.round(ft))).padStart(4, '0'), x, y + 17);
  const a100 = -Math.PI / 2 + ((ft % 1000) / 1000) * Math.PI * 2;
  const a1000 = -Math.PI / 2 + ((ft % 10000) / 10000) * Math.PI * 2;
  needle(g, x, y, r * 0.5, a1000, '#d9d9d2');
  needle(g, x, y, r * 0.84, a100, '#f2f2ec');
  glassGlint(g, x, y, r);
}

// Vertical-card magnetic compass in a small housing.
function compass(g, x, y, hdg) {
  g.fillStyle = '#16191c';
  g.fillRect(x - 52, y - 36, 104, 72);
  g.fillStyle = '#050606';
  g.fillRect(x - 44, y - 22, 88, 40);
  g.save();
  g.beginPath(); g.rect(x - 44, y - 22, 88, 40); g.clip();
  g.fillStyle = '#e9e9e4'; g.strokeStyle = '#e9e9e4';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 14px Arial';
  const pxPerDeg = 2.2;
  for (let d = -40; d <= 40; d += 5) {
    const h = Math.round(hdg / 5) * 5 + d;
    const px = x + (h - hdg) * pxPerDeg;
    const hh = ((h % 360) + 360) % 360;
    g.lineWidth = hh % 30 === 0 ? 2 : 1;
    g.beginPath(); g.moveTo(px, y - 22); g.lineTo(px, y - (hh % 10 === 0 ? 12 : 16)); g.stroke();
    if (hh % 30 === 0) {
      const lbl = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[hh] ?? String(hh / 10);
      g.fillText(lbl, px, y + 4);
    }
  }
  g.restore();
  g.strokeStyle = '#ff7a1a'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x, y - 24); g.lineTo(x, y + 20); g.stroke();
  // Correction card.
  g.fillStyle = '#e8e6df';
  g.fillRect(x - 32, y + 40, 64, 30);
  g.fillStyle = '#333';
  g.font = '8px Arial';
  g.fillText('N 0  E 90', x, y + 50);
  g.fillText('S 180 W 270', x, y + 62);
}

function flapInd(g, x, y, flaps) {
  g.fillStyle = '#16191c';
  g.fillRect(x - 40, y - 34, 80, 78);
  g.fillStyle = '#e9e9e4';
  g.font = 'bold 11px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('FLAPS', x, y - 22);
  g.strokeStyle = '#555'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x - 24, y - 8); g.lineTo(x - 24, y + 34); g.stroke();
  g.font = '10px Arial'; g.textAlign = 'left';
  ['0', '10', '20', '30'].forEach((t, i) => g.fillText(t, x - 12, y - 6 + i * 13));
  g.fillStyle = '#ffb000';
  g.fillRect(x - 31, y - 9 + flaps * 39, 14, 5);
}

// Annunciator lamps (the domed lenses over them are 3D).
function lampsIpa(g, d) {
  const on = [d.stall > 0.5, d.engine !== 'running', d.fuel < d.fuelCap * 0.15, d.brake, d.spray];
  const base = { '#ff3b2a': '#5e1a14', '#ffb020': '#5e4210', '#3dff7a': '#17452a' };
  IPA_PANEL.lamps.forEach(([x, y, , col], i) => {
    g.fillStyle = on[i] ? col : base[col];
    g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2); g.fill();
    if (on[i]) {
      const halo = g.createRadialGradient(x, y, 3, x, y, 15);
      halo.addColorStop(0, '#ffffffcc');
      halo.addColorStop(0.35, col + 'ff');
      halo.addColorStop(1, col + '00');
      g.fillStyle = halo;
      g.beginPath(); g.arc(x, y, 15, 0, Math.PI * 2); g.fill();
    }
  });
}

// SATLOC-style guidance unit face: rugged bezel, the live guidance screen,
// soft keys and the status LEDs.
function gpsUnit(g, s) {
  const { x, y, w, h } = IPA_PANEL.gps, S = IPA_PANEL.screen;
  const body = g.createLinearGradient(0, y, 0, y + h);
  body.addColorStop(0, '#2a2e33');
  body.addColorStop(1, '#17191c');
  g.fillStyle = body;
  roundRect(g, x, y, w, h, 14); g.fill();
  g.strokeStyle = '#3a4047'; g.lineWidth = 2;
  roundRect(g, x + 4, y + 4, w - 8, h - 8, 11); g.stroke();
  g.fillStyle = '#050806';
  roundRect(g, S.x - 5, S.y - 5, S.w + 10, S.h + 10, 6); g.fill();
  g.fillStyle = '#0a0f0b';
  g.fillRect(S.x, S.y, S.w, S.h);
  g.save();
  g.beginPath(); g.rect(S.x, S.y, S.w, S.h); g.clip();
  if (s && s.draw) s.draw(g, S.x, S.y, S.w, S.h);
  else {
    g.fillStyle = '#3d6e8a'; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('AGRONAV', S.x + S.w / 2, S.y + S.h / 2 - 8);
    g.font = '12px Arial'; g.fillStyle = '#6c8796';
    g.fillText('M3 · DGPS GUIDANCE', S.x + S.w / 2, S.y + S.h / 2 + 20);
  }
  g.restore();
  // Brand, soft keys, LEDs.
  const by = S.y + S.h + 16;
  g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillStyle = '#e9ecef'; g.font = 'bold 19px Arial';
  g.fillText('AGRONAV', x + 22, by + 8);
  g.fillStyle = '#ff8a1c'; g.font = 'bold 15px Arial';
  g.fillText('M3', x + 112, by + 8);
  const on = !!s;
  [['GPS', on ? '#3dff7a' : '#17452a'], ['DIF', on ? '#3dff7a' : '#17452a']].forEach(([t, col], i) => {
    const lx = x + 22 + i * 34, ly = by + 30;
    g.fillStyle = col; g.beginPath(); g.arc(lx, ly, 4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#9aa1a8'; g.font = '8px Arial'; g.fillText(t, lx + 7, ly);
  });
  ['MENU', '◄', '►', 'A/B', 'OK'].forEach((t, i) => {
    const kx = x + 168 + i * 40, ky = by - 4;
    g.fillStyle = '#0f1113';
    roundRect(g, kx, ky, 34, 28, 6); g.fill();
    g.fillStyle = '#3b4047';
    roundRect(g, kx + 2, ky + 2, 30, 23, 5); g.fill();
    g.fillStyle = '#e3e6e8'; g.font = 'bold 10px Arial'; g.textAlign = 'center';
    g.fillText(t, kx + 17, ky + 14);
    g.textAlign = 'left';
  });
}

// Flow monitor / engine data LCD under the guidance unit.
function lcd(g, d) {
  const { x, y, w, h } = IPA_PANEL.lcd;
  const run = d.engine === 'running';
  const lg = g.createLinearGradient(0, y, 0, y + h);
  lg.addColorStop(0, '#0d170f');
  lg.addColorStop(1, '#071008');
  g.fillStyle = lg;
  g.fillRect(x, y, w, h);
  const ff = run ? FLIGHT.fuelFlowFull * (0.22 + 0.78 * clamp(d.throttle, 0, 1)) * (d.rpm / FLIGHT.maxRpm) * 3600 : 0;
  const psi = d.spray && d.flow > 0 ? 40 * clamp(d.flow / SPRAY.flow, 0, 1.3) : 0;
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.font = 'bold 19px monospace';
  g.fillStyle = '#9ff0a4';
  g.fillText(`HDG ${String(Math.round(d.hdg) % 360).padStart(3, '0')}°`, x + 12, y + 28);
  g.fillText(`HGT ${d.hgt < 99 ? d.hgt.toFixed(1) : '--'} m`, x + 186, y + 28);
  g.fillText(`VS ${(d.vsFpm >= 0 ? '+' : '') + Math.round(d.vsFpm / 10) * 10}`, x + 12, y + 60);
  g.fillText(`FF ${ff.toFixed(0).padStart(3, ' ')} L/h`, x + 186, y + 60);
  g.fillStyle = d.spray ? '#7fd0ff' : '#4a6a7a';
  g.fillText(`FLOW ${d.spray ? (d.flow * 60).toFixed(0) : '0'} L/min`, x + 12, y + 90);
  g.fillText(`${psi.toFixed(0).padStart(2, ' ')} PSI`, x + 236, y + 90);
  g.font = '11px monospace';
  g.fillStyle = '#6f8a74';
  g.fillText('FLOW MONITOR · ENGINE DATA', x + 12, y + 118);
  g.fillStyle = 'rgba(255,255,255,0.04)';
  g.fillRect(x, y, w, h / 2);
}

function gps(g, x, y, w, h, s) {
  // Rugged bezel with a USB port and brand, screen inset.
  g.fillStyle = '#0d0f11';
  roundRect(g, x, y, w, h, 14); g.fill();
  g.strokeStyle = '#2a2f35'; g.lineWidth = 3;
  roundRect(g, x + 3, y + 3, w - 6, h - 6, 12); g.stroke();
  g.fillStyle = '#c9ced3';
  g.font = 'bold 12px Arial'; g.textAlign = 'right'; g.textBaseline = 'middle';
  g.fillText('SKYGUIDE', x + w - 20, y + 18);
  g.fillStyle = '#3a4047'; g.fillRect(x + 20, y + 12, 18, 10);
  const sx = x + 18, sy = y + 32, sw = w - 36, sh = h - 74;
  g.fillStyle = '#0a0f0b';
  g.fillRect(sx, sy, sw, sh);
  g.save();
  g.beginPath(); g.rect(sx, sy, sw, sh); g.clip();
  if (s && s.draw) s.draw(g, sx, sy, sw, sh);
  g.restore();
  g.fillStyle = '#e9ecef';
  g.font = 'bold 22px Arial'; g.textAlign = 'center';
  g.fillText('AGRONAV', x + w / 2 - 12, y + h - 22);
  g.beginPath();
  g.moveTo(x + w / 2 + 58, y + h - 30); g.lineTo(x + w / 2 + 78, y + h - 30); g.lineTo(x + w / 2 + 68, y + h - 16); g.closePath(); g.fill();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

function drawSightBackground(g, cap = 900, step = 50) {
  // Translucent fibreglass hopper wall seen through the sight window, with
  // stencilled level marks (litres).
  g.fillStyle = '#cdb98e';
  g.fillRect(0, 0, 256, 448);
  const r = rng(19);
  for (let i = 0; i < 1600; i++) {
    g.strokeStyle = `rgba(${120 + r() * 60},${100 + r() * 50},${60 + r() * 30},0.25)`;
    g.lineWidth = 1;
    const x = r() * 256, y = r() * 448, a = r() * Math.PI;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10); g.stroke();
  }
  g.fillStyle = '#17130d';
  g.textAlign = 'left'; g.textBaseline = 'middle';
  const top = 24, bot = 424;
  for (let v = 0; v <= cap; v += step) {
    const y = bot - (v / cap) * (bot - top);
    const major = v % (step * 2) === 0;
    g.fillRect(18, y - 2, major ? 44 : 24, 4);
    if (major && v > 0) {
      g.font = 'bold 34px Arial';
      g.fillText(`-${v}`, 72, y + 1);
    }
  }
}

// Drawing helpers shared with the other aircraft panels.
export { gauge, bezel, needle, altimeter, compass, flapInd, gps, roundRect, glassGlint, drawSightBackground };
