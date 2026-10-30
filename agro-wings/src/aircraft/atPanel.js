// AT-502B instrument panel (canvas texture, live values), laid out after
// Air Tractor cockpits: a black arched panel with the PT6A engine block on
// the left (torque, ITT, Ng, prop rpm, fuel, fuel flow, oil), the flight
// instruments in the middle (airspeed, attitude, altimeter over turn
// coordinator, heading, vertical speed), hopper quantity and flaps on the
// right, the annunciator row along the top and two switch panels below
// (lights / flaps and engine / dispersal) either side of the hopper sight
// window. The guidance GPS screen and the flow monitor's LED readouts are
// drawn in their own regions of the same canvas and shown on their own
// units in the cockpit. A second texture is the hopper sight gauge.
import { canvas, canvasTexture } from '../core/textures.js';
import { clamp, rng } from '../core/math.js';
import { gauge, bezel, needle, altimeter, flapInd, gps, roundRect, glassGlint, drawSightBackground } from './panel.js';

// Canvas regions (px). The panel face is FACE (1024 x 640 px) at K px per
// metre on the panel plane, so the face is 0.9 m wide; the GPS screen and
// the flow monitor have their own regions.
export const AT_PANEL = {
  W: 1024, H: 1024, K: 1024 / 0.9,
  FACE: { x: 0, y: 0, w: 1024, h: 640 },
  GPS: { x: 0, y: 656, w: 400, h: 256 },
  MON: { x: 416, y: 656, w: 320, h: 168 },
  // Round instruments [id, x, y, r] (face px): their 3D bezels and recesses
  // are cut at the same places.
  inst: [
    ['torque', 112, 160, 50], ['itt', 228, 160, 50], ['ng', 112, 292, 50], ['prop', 228, 292, 50],
    ['asi', 368, 158, 58], ['att', 510, 158, 58], ['alt', 652, 158, 58],
    ['turn', 368, 302, 52], ['hdg', 510, 302, 52], ['vsi', 652, 302, 52],
    ['fuel', 96, 412, 40], ['ff', 190, 412, 40], ['oil', 284, 412, 40],
    ['hopper', 796, 170, 46],
  ],
  flaps: [896, 176],
  annun: { x: 254, y: 54, w: 58, h: 24, dx: 65 },
  // Switch panels [x, y, w, h, title, labels]; toggles in one row.
  switches: [
    [178, 480, 278, 120, 'LIGHTS / FLAPS', ['NAV', 'STROBE', 'BEACON', 'LAND', 'WORK', 'FLAP']],
    [568, 480, 200, 120, 'ENGINE / DISPERSAL', ['BATT', 'GEN', 'IGN', 'VALVE']],
  ],
  sight: { x: 474, y: 470, w: 76, h: 158 },
};
const instAt = Object.fromEntries(AT_PANEL.inst.map(([id, x, y, r]) => [id, [x, y, r]]));

export function createTurbinePanel({ reg = 'PR-AWT' } = {}) {
  const c = canvas(AT_PANEL.W, AT_PANEL.H);
  const tex = canvasTexture(c, { aniso: 8 });
  const g = c.getContext('2d');
  const bg = canvas(AT_PANEL.W, AT_PANEL.H);
  const bgg = bg.getContext('2d');
  drawBackground(bgg, reg);
  const sc = canvas(256, 448);
  const sightTex = canvasTexture(sc, { aniso: 4 });
  const sg = sc.getContext('2d');
  const sightBg = canvas(256, 448);
  drawSightBackground(sightBg.getContext('2d'), 1900, 100);
  let lastHopper = -1;
  const drawSight = (hopper, cap) => {
    sg.drawImage(sightBg, 0, 0);
    const top = 24, bot = 424;
    const y = bot - clamp(hopper / 1900, 0, cap / 1900) * (bot - top);
    if (hopper > 0.5) {
      const lg = sg.createLinearGradient(0, y, 0, bot);
      lg.addColorStop(0, 'rgba(95,150,120,0.55)');
      lg.addColorStop(1, 'rgba(45,90,70,0.7)');
      sg.fillStyle = lg;
      sg.fillRect(14, y, 228, bot - y);
      sg.fillStyle = 'rgba(220,240,225,0.75)';
      sg.fillRect(14, y - 1, 228, 3);
    }
    sg.strokeStyle = 'rgba(0,0,0,0.6)'; sg.lineWidth = 14;
    sg.strokeRect(7, 7, 242, 434);
    sightTex.needsUpdate = true;
  };
  drawSight(0, 1893);
  const at = (id) => instAt[id];
  return {
    canvas: c, texture: tex, sightTexture: sightTex,
    setReg(r) { bgg.clearRect(0, 0, bg.width, bg.height); drawBackground(bgg, r); g.drawImage(bg, 0, 0); tex.needsUpdate = true; },
    draw(d) {
      g.drawImage(bg, 0, 0);
      annunciators(g, d);
      switchToggles(g, d);
      // Flight instruments.
      gauge(g, ...at('asi'), {
        label: 'AIRSPEED', unit: 'KNOTS', min: 0, max: 200, value: d.ias, major: 20, minor: 5,
        arcs: [[d.vs0, d.vfe, '#e8e8e8', 90], [d.vs1, 140, '#3fb24a', 98], [140, d.vne, '#f0c020', 98], [d.vne, 200, '#d0362a', 98]],
      });
      attitude(g, ...at('att'), d.pitch, d.bank, d.slip);
      altimeter(g, ...at('alt'), d.altFt);
      turn(g, ...at('turn'), d.yawRate, d.slip);
      heading(g, ...at('hdg'), d.hdg);
      gauge(g, ...at('vsi'), {
        label: 'VERTICAL SPEED', unit: 'x100 FT/MIN', min: -20, max: 20, value: d.vsFpm / 100, major: 5, minor: 1, sweep: 320, arcs: [],
      });
      // PT6A engine block.
      const run = d.engine !== 'off' || d.ng > 1;
      gauge(g, ...at('torque'), {
        label: 'TORQUE', unit: 'FT-LB x100', min: 0, max: 22, value: d.torque / 100, major: 4, minor: 1,
        arcs: [[0, 17.9, '#3fb24a', 98], [17.9, 22, '#d0362a', 98]],
      });
      gauge(g, ...at('itt'), {
        label: 'ITT', unit: '°C x100', min: 0, max: 11, value: d.itt / 100, major: 2, minor: 0.5,
        arcs: [[4, 6.95, '#3fb24a', 98], [6.95, 10.9, '#f0c020', 98], [10.9, 11, '#d0362a', 98]],
      });
      gauge(g, ...at('ng'), {
        label: 'Ng', unit: '% RPM', min: 0, max: 110, value: d.ng, major: 20, minor: 5,
        arcs: [[52, 101.5, '#3fb24a', 98], [101.5, 110, '#d0362a', 98]],
      });
      gauge(g, ...at('prop'), {
        label: 'PROP', unit: 'RPM x100', min: 0, max: 26, value: d.rpm / 100, major: 4, minor: 1,
        arcs: [[16, 22, '#3fb24a', 98], [22, 26, '#d0362a', 98]],
      });
      gauge(g, ...at('fuel'), {
        label: 'FUEL', unit: 'L x100', min: 0, max: Math.ceil(d.fuelCap / 100), value: d.fuel / 100, major: 2, minor: 1, sweep: 240,
        arcs: [[0, (d.fuelCap * 0.15) / 100, '#d0362a', 98]],
      });
      gauge(g, ...at('ff'), {
        label: 'FUEL FLOW', unit: 'L/H x10', min: 0, max: 30, value: d.fuelFlow / 10, major: 10, minor: 2, sweep: 240, arcs: [],
      });
      const oilP = run ? clamp(20 + d.ng * 0.85, 0, 120) : 0;
      gauge(g, ...at('oil'), {
        label: 'OIL PSI', unit: '', min: 0, max: 140, value: oilP, major: 40, minor: 10, sweep: 240,
        arcs: [[85, 105, '#3fb24a', 98], [0, 40, '#d0362a', 98]],
      });
      gauge(g, ...at('hopper'), {
        label: 'HOPPER', unit: 'L x100', min: 0, max: 20, value: d.hopper / 100, major: 5, minor: 1, sweep: 240, arcs: [], needle: '#9fd8ff',
      });
      flapInd(g, ...AT_PANEL.flaps, d.flaps);
      const G = AT_PANEL.GPS;
      gps(g, G.x, G.y, G.w, G.h, d.gps);
      flowMonitor(g, AT_PANEL.MON, d);
      tex.needsUpdate = true;
      if (Math.abs(d.hopper - lastHopper) > 1.5) { lastHopper = d.hopper; drawSight(d.hopper, d.hopperCap); }
    },
  };
}

function drawBackground(g, reg) {
  const { W, H, FACE } = AT_PANEL;
  g.fillStyle = '#0d0f11';
  g.fillRect(0, 0, W, H);
  // Black-anodised panel, as in Air Tractor cockpits: fine brushed grain,
  // a soft shadow under the glareshield.
  const grd = g.createLinearGradient(0, 0, 0, FACE.h);
  grd.addColorStop(0, '#16181b');
  grd.addColorStop(0.1, '#202326');
  grd.addColorStop(1, '#1b1e21');
  g.fillStyle = grd;
  g.fillRect(0, 0, FACE.w, FACE.h);
  const sh = g.createLinearGradient(0, 0, 0, 46);
  sh.addColorStop(0, 'rgba(0,0,0,0.7)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sh;
  g.fillRect(0, 0, FACE.w, 46);
  const r = rng(91);
  for (let i = 0; i < 2600; i++) {
    const v = r() < 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${0.015 + r() * 0.025})`;
    g.fillRect(r() * FACE.w, r() * FACE.h, 1 + r() * 30, 1);
  }
  // Scuffs round the instruments, where hands reach.
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = `rgba(150,150,150,${0.03 + r() * 0.05})`; g.lineWidth = 1;
    const x = 60 + r() * 900, y = 90 + r() * 480;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 8); g.stroke();
  }
  // Instrument clusters: engine block, flight block, lower row.
  g.strokeStyle = 'rgba(150,160,170,0.22)'; g.lineWidth = 2;
  roundRect(g, 46, 92, 248, 268, 10); g.stroke();
  roundRect(g, 300, 88, 420, 278, 10); g.stroke();
  roundRect(g, 46, 366, 300, 92, 10); g.stroke();
  g.fillStyle = '#c3c9cf';
  g.font = 'bold 11px Arial'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.fillText('PT6A-34AG', 170, 106);
  g.font = 'bold 10px Arial';
  g.fillText(`${reg} · AT-502B`, 510, 84);
  // Placards (white on black, as on the real panel).
  const placard = (x, y, w, h, lines) => {
    g.fillStyle = '#e6e8e9'; g.fillRect(x, y, w, h);
    g.fillStyle = '#111'; g.font = 'bold 8px Arial'; g.textAlign = 'center';
    lines.forEach((t, i) => g.fillText(t, x + w / 2, y + 11 + i * 10));
  };
  placard(744, 228, 120, 34, ['VNE 155 KIAS', 'MÁX. TORQUE 1790 FT-LB']);
  placard(370, 382, 210, 24, ['NÃO DECOLAR COM O HOPPER ABERTO']);
  placard(600, 382, 120, 24, ['ITT MÁX. 695 °C']);
  // Switch panels: raised plates with labels (the toggles are drawn live).
  for (const [x, y, w, h, title, labels] of AT_PANEL.switches) {
    g.fillStyle = '#121416';
    roundRect(g, x, y, w, h, 8); g.fill();
    g.strokeStyle = 'rgba(190,196,202,0.35)'; g.lineWidth = 1.5;
    roundRect(g, x + 4, y + 4, w - 8, h - 8, 6); g.stroke();
    g.fillStyle = '#d6dadd'; g.font = 'bold 10px Arial'; g.textAlign = 'center';
    g.fillText(title, x + w / 2, y + 20);
    g.font = 'bold 9px Arial';
    labels.forEach((t, i) => g.fillText(t, x + ((i + 0.5) * w) / labels.length, y + 98));
    g.fillStyle = '#5a6168';
    for (const [sx, sy] of [[x + 9, y + 9], [x + w - 9, y + 9], [x + 9, y + h - 9], [x + w - 9, y + h - 9]]) { g.beginPath(); g.arc(sx, sy, 3, 0, Math.PI * 2); g.fill(); }
  }
  // Hopper sight window frame (the gauge itself is 3D, behind a cut-out).
  const S = AT_PANEL.sight;
  g.fillStyle = '#c3c9cf'; g.font = 'bold 9px Arial'; g.textAlign = 'center';
  g.fillText('HOPPER', S.x + S.w / 2, S.y - 6);
  // Panel screws.
  g.fillStyle = '#5a6168';
  const screw = (x, y) => { g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill(); g.fillStyle = '#2a2e32'; g.fillRect(x - 3, y - 0.6, 6, 1.2); g.fillStyle = '#5a6168'; };
  for (const [x, y] of [[300, 26], [724, 26], [44, 172], [980, 172], [44, 470], [980, 470], [190, 626], [834, 626]]) screw(x, y);
}

function annunciators(g, d) {
  const T = d.throttle ?? 0;
  const items = [
    ['STALL', d.stall > 0.5, '#ff3b2a'],
    ['CHIP', false, '#ff3b2a'],
    ['FUEL LOW', d.fuel < d.fuelCap * 0.15, '#ffb020'],
    ['START', d.engine === 'cranking', '#ffb020'],
    ['GEN', d.engine !== 'running', '#ffb020'],
    ['BETA', !!d.beta || (d.engine === 'running' && d.onGround && T < 0.04), '#3dff7a'],
    ['BRAKE', d.brake, '#ffb020'],
    ['SPRAY', d.spray, '#3dff7a'],
  ];
  const A = AT_PANEL.annun;
  items.forEach(([t, on, col], i) => {
    const x = A.x + i * A.dx, y = A.y, w = A.w, h = A.h;
    g.fillStyle = '#0b0d0f';
    roundRect(g, x - 3, y - 3, w + 6, h + 6, 5); g.fill();
    const base = { '#ff3b2a': '#4a1712', '#ffb020': '#4d3a10', '#3dff7a': '#173d22' }[col];
    g.fillStyle = on ? col : base;
    roundRect(g, x, y, w, h, 3); g.fill();
    g.fillStyle = on ? '#111' : 'rgba(255,255,255,0.28)';
    g.font = 'bold 10px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, x + w / 2, y + h / 2 + 1);
  });
}

// Toggle switches on the switch panels (live where they mean something).
function switchToggles(g, d) {
  const live = {
    BATT: true, GEN: d.engine === 'running', IGN: d.engine === 'cranking', VALVE: d.spray,
    NAV: true, STROBE: d.engine !== 'off', BEACON: d.engine !== 'off', LAND: false, WORK: false, FLAP: d.flaps > 0.05,
  };
  g.textBaseline = 'alphabetic';
  for (const [x, y, w, , , labels] of AT_PANEL.switches) {
    labels.forEach((t, i) => {
      const cx = x + ((i + 0.5) * w) / labels.length, cy = y + 58;
      g.fillStyle = '#c9cdd0';
      g.beginPath(); g.arc(cx, cy, 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#6d747b';
      g.beginPath(); g.arc(cx, cy, 5.5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#e8eaec'; g.lineWidth = 4.5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy + (live[t] ? -16 : 16)); g.stroke();
      g.lineCap = 'butt';
      g.fillStyle = '#9aa1a8'; g.font = '8px Arial'; g.textAlign = 'center';
      g.fillText('ON', cx, y + 34);
    });
  }
}

// Attitude indicator: sky/ground ball moved by pitch, rolled by bank, fixed
// aircraft symbol and bank scale.
function attitude(g, x, y, r, pitch, bank, slip) {
  bezel(g, x, y, r);
  g.save();
  g.beginPath(); g.arc(x, y, r - 2, 0, Math.PI * 2); g.clip();
  g.translate(x, y);
  g.rotate(-bank);
  const k = r * 1.6; // px per rad of pitch
  const py = clamp(pitch, -0.6, 0.6) * k;
  g.fillStyle = '#2f78c4';
  g.fillRect(-r * 2, -r * 3 + py, r * 4, r * 3);
  g.fillStyle = '#7a4f2a';
  g.fillRect(-r * 2, py, r * 4, r * 3);
  g.strokeStyle = '#f2f2ec'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(-r * 2, py); g.lineTo(r * 2, py); g.stroke();
  g.lineWidth = 1.5;
  g.fillStyle = '#f2f2ec'; g.font = `${Math.round(r * 0.14)}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const p of [-20, -10, 10, 20]) {
    const yy = py - (p * Math.PI / 180) * k;
    const w = r * (Math.abs(p) === 10 ? 0.28 : 0.42);
    g.beginPath(); g.moveTo(-w, yy); g.lineTo(w, yy); g.stroke();
    g.fillText(String(Math.abs(p)), w + r * 0.14, yy);
  }
  // Bank pointer on the rotating card.
  g.fillStyle = '#f2f2ec';
  g.beginPath(); g.moveTo(0, -r * 0.92); g.lineTo(-6, -r * 0.78); g.lineTo(6, -r * 0.78); g.closePath(); g.fill();
  g.restore();
  // Fixed bank scale.
  g.strokeStyle = '#f2f2ec'; g.lineWidth = 2;
  for (const a of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
    const ang = -Math.PI / 2 + (a * Math.PI) / 180, l = Math.abs(a) % 30 === 0 ? 0.14 : 0.08;
    g.beginPath(); g.moveTo(x + Math.cos(ang) * r * 0.98, y + Math.sin(ang) * r * 0.98); g.lineTo(x + Math.cos(ang) * r * (0.98 - l), y + Math.sin(ang) * r * (0.98 - l)); g.stroke();
  }
  // Aircraft symbol.
  g.strokeStyle = '#ffb000'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(x - r * 0.55, y); g.lineTo(x - r * 0.2, y); g.lineTo(x - r * 0.1, y + r * 0.1); g.stroke();
  g.beginPath(); g.moveTo(x + r * 0.55, y); g.lineTo(x + r * 0.2, y); g.lineTo(x + r * 0.1, y + r * 0.1); g.stroke();
  g.fillStyle = '#ffb000'; g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill();
  void slip;
  glassGlint(g, x, y, r);
}

// Directional gyro: rotating compass card under a fixed lubber line.
function heading(g, x, y, r, hdg) {
  bezel(g, x, y, r);
  g.save();
  g.translate(x, y);
  g.rotate((-hdg * Math.PI) / 180);
  g.strokeStyle = '#e9e9e4'; g.fillStyle = '#e9e9e4';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let d = 0; d < 360; d += 5) {
    const a = (d * Math.PI) / 180 - Math.PI / 2;
    const major = d % 30 === 0;
    g.lineWidth = d % 10 === 0 ? 2 : 1;
    const r0 = r * (d % 10 === 0 ? 0.78 : 0.85);
    g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * r * 0.93, Math.sin(a) * r * 0.93); g.stroke();
    if (major) {
      g.save();
      g.translate(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6);
      g.rotate(a + Math.PI / 2);
      g.font = `bold ${Math.round(r * 0.2)}px Arial`;
      g.fillText({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d] ?? String(d / 10), 0, 0);
      g.restore();
    }
  }
  g.restore();
  g.strokeStyle = '#ff7a1a'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(x, y - r * 0.95); g.lineTo(x, y - r * 0.7); g.stroke();
  g.strokeStyle = '#ffb000'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(x, y - r * 0.35); g.lineTo(x, y + r * 0.3); g.moveTo(x - r * 0.28, y - r * 0.05); g.lineTo(x + r * 0.28, y - r * 0.05); g.moveTo(x - r * 0.12, y + r * 0.26); g.lineTo(x + r * 0.12, y + r * 0.26); g.stroke();
  glassGlint(g, x, y, r);
}

// Turn coordinator: rate-of-turn aircraft symbol and the slip ball.
function turn(g, x, y, r, yawRate, slip) {
  bezel(g, x, y, r);
  g.strokeStyle = '#e9e9e4'; g.lineWidth = 3;
  for (const a of [-0.35, 0.35]) {
    const ang = a;
    g.beginPath(); g.moveTo(x - Math.cos(ang) * r * 0.9, y + Math.sin(ang) * r * 0.9); g.lineTo(x - Math.cos(ang) * r * 0.72, y + Math.sin(ang) * r * 0.72); g.stroke();
    g.beginPath(); g.moveTo(x + Math.cos(ang) * r * 0.9, y + Math.sin(ang) * r * 0.9); g.lineTo(x + Math.cos(ang) * r * 0.72, y + Math.sin(ang) * r * 0.72); g.stroke();
  }
  g.fillStyle = '#b9bcb6'; g.font = `${Math.round(r * 0.13)}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('TURN COORDINATOR', x, y - r * 0.5);
  g.fillText('2 MIN', x, y + r * 0.58);
  // Standard rate (3°/s) at 0.35 rad of symbol tilt.
  const tilt = clamp((yawRate / 0.0524) * 0.35, -0.7, 0.7);
  g.save(); g.translate(x, y - r * 0.05); g.rotate(tilt);
  g.strokeStyle = '#f2f2ec'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(-r * 0.62, 0); g.lineTo(r * 0.62, 0); g.stroke();
  g.fillStyle = '#f2f2ec'; g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(0, -4); g.lineTo(0, -r * 0.18); g.stroke();
  g.restore();
  // Inclinometer tube and ball.
  g.fillStyle = '#1d2226';
  roundRect(g, x - r * 0.45, y + r * 0.22, r * 0.9, r * 0.2, r * 0.1); g.fill();
  g.strokeStyle = '#555'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(x - r * 0.1, y + r * 0.22); g.lineTo(x - r * 0.1, y + r * 0.42); g.moveTo(x + r * 0.1, y + r * 0.22); g.lineTo(x + r * 0.1, y + r * 0.42); g.stroke();
  g.fillStyle = '#0b0b0b';
  g.beginPath(); g.arc(x + clamp(-slip * 3, -1, 1) * r * 0.32, y + r * 0.32, r * 0.085, 0, Math.PI * 2); g.fill();
  glassGlint(g, x, y, r);
}

// Flow monitor (the box under the guidance screen): three rows of red LED
// readouts — flow, height over the crop, hopper — with their labels.
function flowMonitor(g, R, d) {
  const { x, y, w, h } = R;
  g.fillStyle = '#121416';
  g.fillRect(x, y, w, h);
  const rows = [
    ['L/MIN', d.spray ? (d.flow * 60).toFixed(0) : '0', d.spray],
    ['ALT m', d.hgt < 99 ? d.hgt.toFixed(1) : '--', true],
    ['HOPPER L', String(Math.round(d.hopper)), true],
  ];
  g.textBaseline = 'middle';
  rows.forEach(([lab, val, on], i) => {
    const ry = y + 14 + i * 52;
    g.fillStyle = '#050505';
    roundRect(g, x + 12, ry, w - 110, 40, 4); g.fill();
    g.fillStyle = on ? '#ff3a26' : '#4a1410';
    g.font = 'bold 30px monospace'; g.textAlign = 'right';
    g.fillText(val, x + w - 108, ry + 21);
    g.fillStyle = 'rgba(255,60,40,0.08)';
    g.fillRect(x + 12, ry, w - 110, 20);
    g.fillStyle = '#c9ced3'; g.font = 'bold 12px Arial'; g.textAlign = 'left';
    g.fillText(lab, x + w - 90, ry + 20);
  });
  void needle;
}

// Flight-instrument drawers shared with the R44 panel.
export { attitude, heading, turn };
