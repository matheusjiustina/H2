import { dist2 } from '../core/util';
import { BOUNDS, DISTRICTS, DistrictId, districtAt, P, RAIL_Z, SEA, TUNNEL } from '../world/layout';
import { ACTIVITIES } from '../systems/activities';
import type { Game } from '../game';

const X0 = BOUNDS.x0 - 10, Z0 = BOUNDS.z0 - 10, W = BOUNDS.x1 - BOUNDS.x0 + 20, H = BOUNDS.z1 - BOUNDS.z0 + 20;

function shadeCss(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) * k), g = Math.min(255, ((n >> 8) & 255) * k), b = Math.min(255, (n & 255) * k);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export class Minimap {
  base = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private size = 176;

  constructor(private g: Game, private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.paintBase();
  }

  private paintBase() {
    const w = this.g.world;
    this.base.width = W;
    this.base.height = H;
    const c = this.base.getContext('2d')!;
    c.fillStyle = '#8cc6d6';
    c.fillRect(0, 0, W, H);
    for (let x = X0; x < X0 + W; x += 10)
      for (let z = Z0; z < Z0 + H; z += 10) {
        if (w.terrain.h(x + 5, z + 5) < SEA - 0.2) continue;
        const d = districtAt(x + 5, z + 5);
        c.fillStyle = d === 'ocean' ? '#cfe3ae' : DISTRICTS[d].color;
        c.fillRect(x - X0, z - Z0, 10.5, 10.5);
      }
    // building footprints
    for (const s of w.allSolids()) {
      if (s.y1 < 3.2 || s.tag === 'slab' || s.tag === 'fence' || s.y0 > 2 || s.hw * s.hd < 6) continue;
      const d = districtAt(s.x, s.z);
      c.fillStyle = shadeCss(DISTRICTS[d === 'ocean' ? 'harbor' : d].color, s.y1 > 40 ? 0.72 : 0.84);
      c.save();
      c.translate(s.x - X0, s.z - Z0);
      c.rotate(-s.rot);
      c.fillRect(-s.hw, -s.hd, s.hw * 2, s.hd * 2);
      c.restore();
    }
    // docks and piers
    c.fillStyle = '#c9a678';
    for (const s of w.allSolids()) if (s.tag === 'dock') c.fillRect(s.x - s.hw - X0, s.z - s.hd - Z0, s.hw * 2, s.hd * 2);
    // roads: casing then surface
    c.lineCap = 'round';
    for (const pass of [0, 1]) {
      for (const e of w.roads.edges) {
        c.strokeStyle = pass === 0 ? '#8a8576' : e.kind === 'dirt' ? '#d8c49a' : e.kind === 'highway' || e.kind === 'arterial' ? '#fff3c4' : '#fffaf0';
        c.lineWidth = Math.max(4, e.w * 0.62) + (pass === 0 ? 2.4 : 0);
        c.beginPath();
        c.moveTo(e.a.x - X0, e.a.z - Z0);
        c.lineTo(e.b.x - X0, e.b.z - Z0);
        c.stroke();
      }
    }
    c.setLineDash([7, 6]);
    c.strokeStyle = '#6a657a';
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(145 - X0, TUNNEL.zTop - Z0);
    c.lineTo(145 - X0, TUNNEL.zEnd - Z0);
    c.stroke();
    c.lineWidth = 2.5;
    c.strokeStyle = '#4a4458';
    c.setLineDash([5, 4]);
    c.beginPath();
    c.moveTo(0, RAIL_Z - Z0);
    c.lineTo(W, RAIL_Z - Z0);
    c.stroke();
    c.setLineDash([]);
  }

  /** Round HUD minimap, rotated so "up" is where the camera looks. */
  draw() {
    const g = this.g, c = this.ctx, p = g.player.pos;
    const S = this.size;
    if (this.canvas.width !== S) this.canvas.width = this.canvas.height = S;
    const zoom = g.player.vehicle ? (g.player.vehicle.spec.cls === 'heli' ? 0.3 : 0.5) : 0.82;
    const th = -Math.PI / 2 - Math.atan2(g.cam.fz, g.cam.fx);
    const cs = Math.cos(th), sn = Math.sin(th);
    c.save();
    c.clearRect(0, 0, S, S);
    c.beginPath();
    c.arc(S / 2, S / 2, S / 2, 0, 6.3);
    c.clip();
    c.fillStyle = '#8cc6d6';
    c.fillRect(0, 0, S, S);
    c.translate(S / 2, S / 2);
    c.rotate(th);
    c.scale(zoom, zoom);
    c.imageSmoothingEnabled = true;
    const r = S / zoom;
    c.drawImage(this.base, p.x - X0 - r, p.z - Z0 - r, r * 2, r * 2, -r, -r, r * 2, r * 2);
    c.restore();
    const R = S / 2 - 7;
    const blip = (x: number, z: number, col: string, size: number, clampEdge = false, shape = 0) => {
      const dx = (x - p.x) * zoom, dz = (z - p.z) * zoom;
      let sx = dx * cs - dz * sn, sy = dx * sn + dz * cs;
      const d = Math.hypot(sx, sy);
      if (d > R) {
        if (!clampEdge) return;
        sx *= R / d;
        sy *= R / d;
      }
      c.fillStyle = col;
      c.strokeStyle = '#1d1a2e';
      c.lineWidth = 1.5;
      c.beginPath();
      if (shape === 1) {
        c.moveTo(S / 2 + sx, S / 2 + sy - size);
        c.lineTo(S / 2 + sx + size, S / 2 + sy);
        c.lineTo(S / 2 + sx, S / 2 + sy + size);
        c.lineTo(S / 2 + sx - size, S / 2 + sy);
        c.closePath();
      } else if (shape === 2) c.rect(S / 2 + sx - size, S / 2 + sy - size, size * 2, size * 2);
      else c.arc(S / 2 + sx, S / 2 + sy, size, 0, 6.3);
      c.fill();
      c.stroke();
    };
    for (const d of g.world.interacts) if (d.kind === 'safehouse') blip(d.x, d.z, '#4c9a5a', 4, false, 2);
    for (const d of g.world.interacts) if (d.kind === 'metro') blip(d.x, d.z, '#2f8f86', 3.4);
    if (!g.missions.active && !g.activities.active) for (const a of ACTIVITIES) blip(a.where.x, a.where.z, '#5fd0ff', 3.6, false, 1);
    for (const v of g.vehicles.list) {
      if (v === g.player.vehicle || v.mode === 'wreck') continue;
      if (v.mode === 'police' || v.mode === 'heliAI') blip(v.x, v.z, Math.floor(g.time * 4) % 2 ? '#3b7bff' : '#ff3b30', v.mode === 'heliAI' ? 5 : 4);
      else if (dist2(v.x, v.z, p.x, p.z) < 90 * 90 && v.mode === 'parked') blip(v.x, v.z, '#f6ecd0', 2.2);
    }
    for (const n of g.npcs.list) {
      if (n.state === 'pursue' || n.state === 'attack' || n.state === 'alert') blip(n.x, n.z, '#d43a34', 2.8);
      else if (n.state === 'search') blip(n.x, n.z, '#ee8a3a', 2.4);
    }
    for (const cr of g.npcs.crowds) blip(cr.x, cr.z, '#f2c230', 4.6);
    for (const s of g.interact.switches) blip(s.x, s.z, '#f2c230', 3.4, false, 2);
    const mk = g.missions.marker;
    if (mk) blip(mk.x, mk.z, '#ee8a3a', 6, true, 1);
    // player arrow: points the way Trump is facing relative to the camera
    const a = Math.atan2(Math.cos(g.player.heading), Math.sin(g.player.heading)) + th;
    c.save();
    c.translate(S / 2, S / 2);
    c.rotate(a + Math.PI / 2);
    c.fillStyle = '#f6ecd0';
    c.strokeStyle = '#1d1a2e';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, -9);
    c.lineTo(6.5, 7);
    c.lineTo(0, 3.5);
    c.lineTo(-6.5, 7);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
    // north marker on the rim
    const nx = -sn * -1 * 0 + (0 * cs - -1 * sn), ny = 0 * sn + -1 * cs;
    c.fillStyle = '#d43a34';
    c.font = 'bold 13px Arial';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('N', S / 2 + nx * (R - 4), S / 2 + ny * (R - 4));
  }

  /** Full-screen map for the pause / M screen. */
  drawFull(cv: HTMLCanvasElement) {
    const g = this.g;
    cv.width = 1240;
    cv.height = Math.round((1240 * H) / W);
    const c = cv.getContext('2d')!;
    const k = cv.width / W;
    c.drawImage(this.base, 0, 0, cv.width, cv.height);
    const T = (x: number, z: number): [number, number] => [(x - X0) * k, (z - Z0) * k];
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const label = (x: number, z: number, t: string, size = 20, locked = false) => {
      const [sx, sy] = T(x, z);
      c.font = `italic ${size}px Bangers, Impact, sans-serif`;
      c.lineWidth = 4;
      c.strokeStyle = '#f6ecd0';
      c.strokeText(t, sx, sy);
      c.fillStyle = locked ? '#8a3a34' : '#1d1a2e';
      c.fillText(t, sx, sy);
    };
    const centres: Record<DistrictId, [number, number]> = { downtown: [-80, -80], wallstreet: [355, 200], government: [180, -180], suburbs: [-550, 20], beach: [-430, 372], harbor: [300, 290], desert: [720, -300], outskirts: [-520, -330], ocean: [-300, 600] };
    for (const d of Object.keys(centres) as DistrictId[]) {
      const locked = d !== 'ocean' && !g.save.districts.includes(d);
      label(centres[d][0], centres[d][1], DISTRICTS[d].name.toUpperCase() + (locked ? ' ✕' : ''), 22, locked);
    }
    const pin = (x: number, z: number, col: string, t = '', r = 6) => {
      const [sx, sy] = T(x, z);
      c.fillStyle = col;
      c.strokeStyle = '#1d1a2e';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(sx, sy, r, 0, 6.3);
      c.fill();
      c.stroke();
      if (t) {
        c.font = '600 13px "Barlow Condensed", Arial';
        c.lineWidth = 3;
        c.strokeStyle = '#f6ecd0';
        c.strokeText(t, sx, sy - r - 8);
        c.fillStyle = '#1d1a2e';
        c.fillText(t, sx, sy - r - 8);
      }
    };
    pin(P.tower.x, P.tower.z, '#f2c94c', 'GOLDEN TOWER', 7);
    pin(P.whiteHouse.x, P.whiteHouse.z, '#f7f4ea', 'WHITE HOUSE');
    pin(P.capitol.x, P.capitol.z, '#f7f4ea', 'CAPITOL');
    pin(P.obelisk.x, P.obelisk.z, '#f7f4ea', 'MONUMENT', 4);
    pin(P.exchange.x, P.exchange.z, '#d9d4c6', 'STOCK EXCHANGE');
    pin(P.liberty.x, P.liberty.z, '#7fbfa5', 'LIBERTY ISLAND');
    pin(P.ferris.x, P.ferris.z, '#f2a0a8', 'PIER');
    pin(P.compound.x, P.compound.z, '#c98f58', 'COMPOUND');
    pin(P.airstrip.x, P.airstrip.z, '#b9bcc4', 'AIRFIELD');
    for (const d of g.world.interacts) if (d.kind === 'safehouse') pin(d.x, d.z, '#4c9a5a', '', 5);
    for (const d of g.world.interacts) if (d.kind === 'metro') pin(d.x, d.z, '#2f8f86', '', 4);
    for (const a of ACTIVITIES) pin(a.where.x, a.where.z, '#5fd0ff', '', 4.5);
    const spots = g.world.collectSpots;
    spots.forEach((s, i) => {
      if (!g.save.collectibles.includes(i) && dist2(s.x, s.z, g.player.pos.x, g.player.pos.z) < 160 * 160) pin(s.x, s.z, '#f2c94c', '', 2.6);
    });
    const mk = g.missions.marker;
    if (mk) {
      const [sx, sy] = T(mk.x, mk.z);
      c.fillStyle = '#ee8a3a';
      c.strokeStyle = '#1d1a2e';
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(sx, sy - 11);
      c.lineTo(sx + 11, sy);
      c.lineTo(sx, sy + 11);
      c.lineTo(sx - 11, sy);
      c.closePath();
      c.fill();
      c.stroke();
    }
    const [px, py] = T(g.player.pos.x, g.player.pos.z);
    c.save();
    c.translate(px, py);
    c.rotate(Math.atan2(Math.cos(g.player.heading), Math.sin(g.player.heading)) + Math.PI / 2);
    c.fillStyle = '#d43a34';
    c.strokeStyle = '#1d1a2e';
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(0, -13);
    c.lineTo(9, 10);
    c.lineTo(0, 5);
    c.lineTo(-9, 10);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }
}
