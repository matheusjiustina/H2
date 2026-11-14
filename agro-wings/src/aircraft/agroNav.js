// AGROWINGS NAV: the game's own GPS unit, shared by the cockpits that carry
// it (Bell 206B, EMB-203). Four pages on its soft keys: MAPA (moving map:
// farms, strips, talhões, the destination), DESTINO (bearing, distance, ETE,
// a course arrow), MISSÃO (the job: farm, crop, area, coverage, passes,
// liquid, fuel) and COBERTURA (the talhão with the passes and the coverage
// the game has recorded). The unit follows the work like a real one: it
// opens on COBERTURA when the aircraft is on the job (passes, coverage, track,
// cross-track) and on MAPA when ferrying, free flying or returning; a key
// press keeps its page until the situation changes. It draws the game's own guidance and job data
// (game.guidance, the active job); nothing is loaded from outside and it
// keeps no state of its own beyond the page shown. Each cockpit mounts the
// screen texture in its own housing.
import { canvas, canvasTexture } from '../core/textures.js';
import { clamp } from '../core/math.js';
import { roundRect } from './panel.js';
import { text } from './r44Panel.js';

const D2R = Math.PI / 180;
export const NAV = { W: 512, H: 352 };
export const NAV_PAGES = ['map', 'dest', 'mission', 'cov'];
const PAGE_LABEL = { map: 'MAPA', dest: 'DESTINO', mission: 'MISSÃO', cov: 'COBERTURA' };
const NM = 1852;

function gpsFrame(g, page) {
  const { W } = NAV;
  g.fillStyle = '#07101a'; g.fillRect(0, 0, W, NAV.H);
  // Status bar: unit, page tabs.
  g.fillStyle = '#0d1d2e'; g.fillRect(0, 0, W, 30);
  text(g, 'AGROWINGS NAV', 72, 15, 12, '#52d8ff');
  NAV_PAGES.forEach((p, i) => {
    const x = 160 + i * 88;
    g.fillStyle = p === page ? '#52d8ff' : '#16304a';
    roundRect(g, x, 5, 82, 20, 4); g.fill();
    text(g, PAGE_LABEL[p], x + 41, 15, 11, p === page ? '#04121e' : '#a9c4d8');
  });
}
function bearingTo(d, x, z) {
  const p = d.pos;
  const brg = ((Math.atan2(x - p.x, -(z - p.z)) / D2R) + 360) % 360; // from north (-Z), clockwise
  return { brg, dist: Math.hypot(x - p.x, z - p.z) };
}
function drawGpsDest(g, d) {
  const { W, H } = NAV;
  const nav = d.nav;
  const box = (x, y, w, h, title, value, col = '#eef6ff') => {
    g.fillStyle = '#0d1d2e'; roundRect(g, x, y, w, h, 6); g.fill();
    text(g, title, x + w / 2, y + 14, 11, '#6f90a8');
    text(g, value, x + w / 2, y + h / 2 + 8, 26, col);
  };
  const { brg, dist } = bearingTo(d, nav.x, nav.z);
  const gsMs = Math.max(0.5, (d.gs ?? 0) / 1.943844);
  const ete = dist / gsMs;
  const etes = d.gs > 5 ? `${Math.floor(ete / 60)}:${String(Math.floor(ete % 60)).padStart(2, '0')}` : '--:--';
  text(g, nav.name, W / 2, 52, 22, '#ffd23a');
  text(g, nav.label ?? (nav.kind === 'strip' ? 'PISTA DA FAZENDA' : nav.kind === 'field' ? 'TALHÕES DO CONTRATO' : nav.kind === 'fire' ? 'FOCO DE INCÊNDIO MAIS PRÓXIMO' : 'BASE (SEM CONTRATO)'), W / 2, 74, 11, '#6f90a8');
  box(14, 92, 150, 64, 'DIST', `${(dist / NM).toFixed(1)} NM`);
  box(14, 166, 150, 64, 'RUMO (BRG)', `${String(Math.round(brg) % 360).padStart(3, '0')}°`);
  box(14, 240, 150, 64, 'ETE', etes);
  // Course arrow: bearing relative to the heading.
  const cx = 340, cy = 200, R = 104;
  g.strokeStyle = '#1f3d58'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  for (let a = 0; a < 360; a += 30) {
    const t = (a - d.hdg - 90) * D2R;
    g.strokeStyle = '#3f6a8a'; g.lineWidth = a % 90 === 0 ? 3 : 1.5;
    g.beginPath(); g.moveTo(cx + Math.cos(t) * R * 0.88, cy + Math.sin(t) * R * 0.88); g.lineTo(cx + Math.cos(t) * R, cy + Math.sin(t) * R); g.stroke();
    if (a % 90 === 0) text(g, 'NESW'[a / 90], cx + Math.cos(t) * R * 0.75, cy + Math.sin(t) * R * 0.75, 13, '#a9c4d8');
  }
  const rel = (brg - d.hdg) * D2R;
  g.save(); g.translate(cx, cy); g.rotate(rel);
  g.fillStyle = '#ff2fd0';
  g.beginPath(); g.moveTo(0, -R * 0.78); g.lineTo(14, -R * 0.42); g.lineTo(5, -R * 0.42); g.lineTo(5, R * 0.6); g.lineTo(-5, R * 0.6); g.lineTo(-5, -R * 0.42); g.lineTo(-14, -R * 0.42); g.closePath(); g.fill();
  g.restore();
  g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(cx, cy - 12); g.lineTo(cx - 9, cy + 10); g.lineTo(cx + 9, cy + 10); g.closePath(); g.fill();
  text(g, `PROA ${String(Math.round(d.hdg) % 360).padStart(3, '0')}°   GS ${Math.round(d.gs ?? 0)} KT`, cx, H - 16, 12, '#a9c4d8');
}
// Fire Boss: the accepted fire order — spots out, the nearest one, the load.
function drawGpsFire(g, d) {
  const { W, H } = NAV, f = d.fire;
  text(g, f.title, W / 2, 50, 17, '#ffb35c');
  text(g, 'ORDEM DE COMBATE A INCÊNDIO', W / 2, 72, 12, '#6f90a8');
  const near = f.near;
  const mm = Math.floor(f.mins), ss = Math.floor((f.mins - mm) * 60);
  const rows = [
    ['FOCOS APAGADOS', `${f.out} / ${f.total}`], ['TEMPO', `${mm}:${String(ss).padStart(2, '0')}`],
    ['MAIS PRÓXIMO', near ? `F${near.fire.id} · ${(near.dist / 1000).toFixed(1)} km` : '—'], ['RUMO', near ? `${String(Math.round(near.bearing) % 360).padStart(3, '0')}°` : '—'],
    ['ÁGUA', `${Math.round(d.hopper)} L`], ['COMBUSTÍVEL', `${Math.round(d.fuel)} L`],
  ];
  rows.forEach(([k, v], i) => {
    const x = 20 + (i % 2) * 245, y = 96 + Math.floor(i / 2) * 50;
    g.fillStyle = '#0d1d2e'; roundRect(g, x, y, 228, 42, 6); g.fill();
    text(g, k, x + 14, y + 21, 11, '#6f90a8', true, 'left');
    text(g, v, x + 214, y + 21, 17, '#eef6ff', true, 'right');
  });
  const y = 258, x0 = 20, w = W - 40, k = f.total ? f.out / f.total : 0;
  text(g, `FOCOS APAGADOS ${Math.round(k * 100)} %  ·  BÔNUS ATÉ ${f.bonusMin} MIN`, W / 2, y, 13, '#a9c4d8');
  g.fillStyle = '#0d1d2e'; roundRect(g, x0, y + 14, w, 22, 5); g.fill();
  g.fillStyle = k >= 1 ? '#6cf5a0' : '#ff9a3a'; roundRect(g, x0, y + 14, Math.max(6, w * clamp(k, 0, 1)), 22, 5); g.fill();
  text(g, k >= 1 ? 'INCÊNDIO CONTROLADO' : f.mins > f.bonusMin ? 'BÔNUS DE TEMPO ESGOTADO' : 'ACOMPANHE O FOCO PELO MAPA / DESTINO', W / 2, H - 16, 12, k >= 1 ? '#6cf5a0' : '#6f90a8');
}
function drawGpsMission(g, d) {
  const { W, H } = NAV;
  const m = d.mission;
  if (!m && d.fire) return drawGpsFire(g, d);
  if (!m) {
    text(g, 'SEM MISSÃO ATIVA', W / 2, H / 2 - 10, 20, '#a9c4d8');
    text(g, 'Voo livre — sem contrato aceito.', W / 2, H / 2 + 20, 13, '#6f90a8');
    return;
  }
  text(g, m.title, W / 2, 50, 17, '#ffd23a');
  text(g, m.client, W / 2, 72, 12, '#6f90a8');
  const rows = [
    ['CULTURA', m.crop], ['ÁREA', `${m.ha.toFixed(1)} ha`], ['FAIXAS', `${m.passesDone} / ${m.passes}`],
    ['CALDA', `${Math.round(d.hopper)} L`], ['COMBUSTÍVEL', `${Math.round(d.fuel)} L`], ['SURTIDAS', String(m.sorties)],
  ];
  rows.forEach(([k, v], i) => {
    const x = 20 + (i % 2) * 245, y = 96 + Math.floor(i / 2) * 50;
    g.fillStyle = '#0d1d2e'; roundRect(g, x, y, 228, 42, 6); g.fill();
    text(g, k, x + 14, y + 21, 11, '#6f90a8', true, 'left');
    text(g, v, x + 214, y + 21, 17, '#eef6ff', true, 'right');
  });
  // Coverage bar against the 90 % target.
  const y = 258, x0 = 20, w = W - 40;
  text(g, `COBERTURA ${Math.round(m.coverage * 100)} %  ·  META 90 %`, W / 2, y, 13, '#a9c4d8');
  g.fillStyle = '#0d1d2e'; roundRect(g, x0, y + 14, w, 22, 5); g.fill();
  g.fillStyle = m.coverage >= 0.9 ? '#6cf5a0' : '#52d8ff'; roundRect(g, x0, y + 14, Math.max(6, w * clamp(m.coverage, 0, 1)), 22, 5); g.fill();
  g.fillStyle = '#ffd23a'; g.fillRect(x0 + w * 0.9 - 1, y + 10, 3, 30);
  text(g, m.complete ? 'APLICAÇÃO CONCLUÍDA — RETORNE À BASE' : d.spray ? 'PULVERIZANDO' : 'BICOS FECHADOS', W / 2, H - 16, 12, m.complete ? '#6cf5a0' : d.spray ? '#ffd23a' : '#6f90a8');
}

// One unit: its screen canvas and the page shown. `home` is the destination
// with no ferry target and no job ({ x, z, name, label }).
export function createAgroNav({ home }) {
  const c = canvas(NAV.W, NAV.H);
  const nav = { c, g: c.getContext('2d'), tex: canvasTexture(c, { aniso: 4 }), key: '', page: 'map' };
  let t = 0, missionT = 0, mission = null, lastSit = null;
  nav.setPage = (p) => { if (NAV_PAGES.includes(p)) { nav.page = p; nav.key = ''; t = 0; } };
  nav.nextPage = () => nav.setPage(NAV_PAGES[(NAV_PAGES.indexOf(nav.page) + 1) % NAV_PAGES.length]);
  // d: the aircraft's instruments() (d.gps = the game's Guidance); at most
  // 4 Hz, redrawn only when what the page shows changed; the mission
  // figures (coverage statistics) once a second.
  nav.draw = (d, dt, master) => {
    t -= dt; missionT -= dt;
    if (t > 0) return;
    t = 0.25;
    const guide = d.gps, job = guide?.job;
    if (job && missionT <= 0) {
      missionT = 1;
      const st = job.stats();
      mission = {
        title: job.c.title, client: job.c.client ?? '', crop: job.crop, ha: job.ha, sorties: job.sorties,
        coverage: st.coverage, complete: st.coverage >= 0.9,
        passes: guide.passes.length, passesDone: guide.passes.filter((p) => p.done > 0.85).length,
      };
    } else if (!job) mission = null;
    const pos = d.pos;
    // Destination: the ferry target, else the job's talhões, else home.
    const ferryT = guide?.navTarget?.() ?? null; // the game's own target: ferry, way home, fire
    let dest = ferryT;
    if (!dest && job) {
      const fs = job.fields;
      dest = { x: (Math.min(...fs.map((f) => f.x0)) + Math.max(...fs.map((f) => f.x1))) / 2, z: (Math.min(...fs.map((f) => f.z0)) + Math.max(...fs.map((f) => f.z1))) / 2, name: fs.map((f) => f.name).join('+'), kind: 'field' };
    } else if (!dest) dest = { ...home, kind: 'base' };
    // The unit follows the work: on the job -> COBERTURA; ferrying (a target
    // far off, a farm strip, the way home, a fire) or free flight -> MAPA.
    // Sticky near the 1.6 km ferry limit so the page does not flap.
    const fj = d.gps?.game?.fireJobs;
    const fireOrder = !job && fj?.active && fj.job ? fj : null;
    const toField = ferryT?.kind === 'field' ? Math.hypot(ferryT.x - pos.x, ferryT.z - pos.z) : 0;
    const sit = job ? (ferryT?.kind === 'strip' || (ferryT?.kind === 'field' && !(lastSit === 'work' && toField < 2200)) ? 'ferry' : 'work') : fireOrder ? 'fire' : 'free';
    if (sit !== lastSit) { lastSit = sit; nav.page = sit === 'work' ? 'cov' : nav.page === 'cov' ? 'map' : nav.page; nav.key = ''; if (sit === 'fire') nav.page = 'map'; }
    let fire = null;
    if (fireOrder) {
      const sp = fireOrder.spots();
      fire = { title: fireOrder.job.def.title, total: sp.length, out: sp.filter((x) => x.state === 'out').length, near: fireOrder.nearest(pos), mins: Math.max(0, (d.gps.game.time - fireOrder.job.t0) / 60), bonusMin: fireOrder.job.def.bonusMin };
    }
    const page = nav.page;
    const key = !master ? 'off'
      : page === 'mission' ? `m|${mission ? `${mission.passesDone}|${Math.round(mission.coverage * 1000)}|${mission.sorties}` : '-'}|${fire ? `${fire.out}|${Math.round((fire.near?.dist ?? 0) / 25)}|${Math.floor(fire.mins * 6)}` : '-'}|${Math.round(d.hopper)}|${Math.round(d.fuel)}|${d.spray}`
        : page === 'dest' ? `d|${dest.name}|${Math.round(dest.x)}|${Math.round(dest.z)}|${Math.round(pos.x / 5)}|${Math.round(pos.z / 5)}|${Math.round(d.hdg)}|${Math.round(d.gs ?? 0)}`
          : `${page}|${Math.round(pos.x)}|${Math.round(pos.z)}|${Math.round(d.hdg)}|${guide?.trackHead}|${guide?.next?.k ?? '-'}|${Math.round((guide?.xte ?? 0) * 2)}|${Math.round(d.fuel)}|${Math.round(d.hopper)}|${d.spray}`;
    if (key === nav.key) return;
    nav.key = key;
    const g = nav.g, { W, H } = NAV;
    if (!master) { g.fillStyle = '#020304'; g.fillRect(0, 0, W, H); nav.tex.needsUpdate = true; return; }
    gpsFrame(g, page);
    g.save();
    g.translate(0, 30);
    if (page === 'map' || page === 'cov') guide?.draw(g, 0, 0, W, H - 30, { page: page === 'map' ? 'map' : 'cov' });
    else if (page === 'dest') drawGpsDest(g, { ...d, nav: dest, pos });
    else drawGpsMission(g, { ...d, mission, fire });
    g.restore();
    if (page === 'cov' && !job) text(g, 'SEM TALHÃO ATIVO — MAPA', W / 2, H - 14, 12, '#6f90a8');
    nav.tex.needsUpdate = true;
  };
  return nav;
}
