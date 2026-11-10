import * as THREE from 'three';
import { clamp, dist2, el, fmtTime } from '../core/util';
import { DISTRICTS, DistrictId } from '../world/layout';
import { HEAT_NAMES } from '../systems/heat';
import { WEAPONS } from '../systems/combat';
import type { Game } from '../game';
import { Minimap } from './minimap';

const v3 = new THREE.Vector3();

export class Hud {
  root: HTMLElement;
  minimap: Minimap;
  private mTag: HTMLElement;
  private mTitle: HTMLElement;
  private mObj: HTMLElement;
  private mDist: HTMLElement;
  private heatBox: HTMLElement;
  private hName: HTMLElement;
  private hNum: HTMLElement;
  private pips: HTMLElement[] = [];
  private hStatus: HTMLElement;
  private hBar: HTMLElement;
  private dName: HTMLElement;
  private hpBar: HTMLElement;
  private hpNum: HTMLElement;
  private chips: HTMLElement;
  private prompt: HTMLElement;
  private promptTxt: HTMLElement;
  private promptBar: HTMLElement;
  private cross: HTMLElement;
  private alt: HTMLElement;
  private pointer: HTMLElement;
  private pointerTxt: HTMLElement;
  private talk: HTMLElement;
  private toasts: HTMLElement;
  private cards: HTMLElement;
  private bossBox: HTMLElement;
  private bossName: HTMLElement;
  private bossBar: HTMLElement;
  private fadeEl: HTMLElement;
  private barsEl: HTMLElement;
  private fps: HTMLElement;
  private compass: CanvasRenderingContext2D;
  private district: DistrictId | '' = '';
  private vehName = '';
  private slow = 0;
  private lastChips = '';
  private lastObj = '';

  constructor(private g: Game, ui: HTMLElement) {
    this.root = el('div', 'hud hidden', '', ui);
    const r = this.root;
    const m = el('div', 'mission', '', r);
    this.mTag = el('span', 'tag', 'FREE ROAM', m);
    const mp = el('div', 'panel', '', m);
    this.mTitle = el('div', 'mtitle', '', mp);
    const row = el('div', 'obj', '', mp);
    this.mObj = el('span', '', '', row);
    this.mDist = el('span', 'dist', '', row);
    const cp = el('div', 'compass panel', '', r);
    const cc = el('canvas', '', '', cp);
    cc.width = 300;
    cc.height = 26;
    this.compass = cc.getContext('2d')!;
    this.bossBox = el('div', 'boss panel', '', r);
    this.bossName = el('div', 'bname', '', this.bossBox);
    this.bossBar = el('i', '', '', el('div', 'bar', '', this.bossBox));
    this.bossBox.style.display = 'none';
    this.heatBox = el('div', 'heat panel', '', r);
    const hl = el('div', 'hl', '', this.heatBox);
    this.hName = el('span', 'hname', '', hl);
    this.hNum = el('span', 'hnum', '', hl);
    const pips = el('div', 'pips', '', this.heatBox);
    for (let i = 0; i < 6; i++) this.pips.push(el('i', '', '', pips));
    const st = el('div', 'status', '', this.heatBox);
    this.hStatus = el('span', '', '', st);
    this.hBar = el('i', '', '', el('div', 'sbar', '', st));
    const mb = el('div', 'mapbox', '', r);
    this.dName = el('span', 'tag dname', '', mb);
    const mc = el('canvas', 'minimap', '', mb);
    this.minimap = new Minimap(g, mc);
    const sb = el('div', 'stat', '', r);
    const vit = el('div', 'vitals panel', '', sb);
    this.hpBar = el('i', '', '', el('div', 'hbar', '', vit));
    this.hpNum = el('span', 'hp', '100', vit);
    this.chips = el('div', 'chips', '', sb);
    this.prompt = el('div', 'prompt panel', '', r);
    el('span', 'key', 'E', this.prompt);
    this.promptTxt = el('span', '', '', this.prompt);
    this.promptBar = el('div', 'pbar', '', this.prompt);
    this.cross = el('div', 'cross', '', r);
    this.alt = el('div', 'alt panel', '', r);
    this.pointer = el('div', 'pointer', '<i></i>', r);
    this.pointerTxt = el('span', '', '', this.pointer);
    this.talk = el('div', 'talk', '', r);
    this.toasts = el('div', 'toasts', '', r);
    this.cards = el('div', '', '', ui);
    this.barsEl = el('div', '', '', ui);
    this.fadeEl = el('div', 'fade', '', ui);
    this.fps = el('div', 'fps', '', ui);
  }

  show(on: boolean) {
    this.root.classList.toggle('hidden', !on);
  }

  // ------------------------------------------------------------------ messages
  toast(text: string, kind = '') {
    const t = el('div', `toast panel ${kind}`, text, this.toasts);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild!.remove();
    setTimeout(() => t.remove(), kind === 'news' ? 6000 : 3600);
  }

  say(who: string, text: string) {
    const b = el('div', 'bubble', '', this.talk);
    el('span', 'who', who, b);
    el('span', 'txt', text, b);
    while (this.talk.children.length > 3) this.talk.firstElementChild!.remove();
    setTimeout(() => b.remove(), 3200 + text.length * 55);
  }

  banner(title: string, sub: string, kind = '', seconds = 3.2) {
    this.cards.querySelectorAll('.banner').forEach((e) => e.remove());
    const b = el('div', `banner panel ${kind}`, '', this.cards);
    el('h1', '', title, b);
    if (sub) el('p', '', sub, b);
    setTimeout(() => b.remove(), seconds * 1000);
  }

  title(tag: string, title: string, sub: string) {
    this.cards.querySelectorAll('.titlecard').forEach((e) => e.remove());
    const c = el('div', 'titlecard', '', this.cards);
    el('span', 'tag', tag, c);
    el('h1', '', title, c);
    if (sub) el('p', 'panel', sub, c);
    setTimeout(() => c.remove(), 4600);
  }

  private entering(d: DistrictId) {
    this.cards.querySelectorAll('.entering').forEach((e) => e.remove());
    const info = DISTRICTS[d];
    const locked = d !== 'ocean' && !this.g.save.districts.includes(d);
    const c = el('div', 'entering panel', '', this.cards);
    el('span', 'tag', locked ? 'HOSTILE TERRITORY' : 'ENTERING', c);
    el('h2', '', info.name, c);
    el('p', '', locked ? `Held by ${info.faction}` : info.tagline, c);
    setTimeout(() => c.remove(), 2600);
  }

  heatChanged(level: number, up: boolean) {
    if (up) {
      this.heatBox.classList.remove('flash');
      void this.heatBox.offsetWidth;
      this.heatBox.classList.add('flash');
      if (level >= 3) this.toast(`HEAT ${level}: ${HEAT_NAMES[level]}`, 'warn');
    }
  }

  vehicleName(name: string) {
    this.vehName = name;
  }

  boss(b: { name: string; hp: number; max: number } | null) {
    this.bossBox.style.display = b ? '' : 'none';
    if (b) {
      this.bossName.textContent = b.name;
      this.bossBar.style.width = `${clamp(b.hp / b.max, 0, 1) * 100}%`;
    }
  }

  cinema(on: boolean) {
    this.barsEl.className = on ? 'bars' : '';
    this.show(!on);
  }

  fade(on: boolean) {
    this.fadeEl.classList.toggle('on', on);
  }

  // ------------------------------------------------------------------ per-frame
  update(dt: number) {
    const g = this.g, p = g.player, heat = g.heat, ms = g.missions;
    // --- mission panel
    const run = ms.run;
    const act = g.activities;
    const tag = run ? `MISSION ${String(run.def.num).padStart(2, '0')}` : act.active ? 'CHALLENGE' : g.freeRoam || g.save.finished ? 'FREE ROAM' : 'NEXT MISSION';
    const title = run ? run.def.title : act.def ? act.def.name : ms.next ? ms.next.title : 'United States City';
    let obj = run ? ms.objective : act.active ? act.objective : ms.objective || 'Explore. Collect Golden Ts. Cause a reasonable amount of trouble.';
    if (run) {
      const s = run.def.steps[run.step];
      if (s?.timer && !obj.includes('s)')) obj += ` — ${fmtTime(run.timer)}`;
    }
    if (obj !== this.lastObj) {
      this.lastObj = obj;
      this.mObj.textContent = obj;
    }
    if (this.mTag.textContent !== tag) this.mTag.textContent = tag;
    if (this.mTitle.textContent !== title) this.mTitle.textContent = title;
    const mk = ms.marker;
    this.mDist.textContent = mk ? `${Math.round(Math.sqrt(dist2(p.pos.x, p.pos.z, mk.x, mk.z)))} m` : '';

    // --- heat
    const L = heat.level;
    this.hName.textContent = HEAT_NAMES[L];
    this.hNum.textContent = String(L);
    for (let i = 0; i < 6; i++) this.pips[i].className = i < L ? (L >= 4 ? 'on hot' : 'on') : '';
    if (L === 0) {
      this.hStatus.textContent = heat.meter > 0.05 ? 'NOTICED' : 'CALM';
      this.hBar.style.width = `${clamp(heat.meter, 0, 1) * 100}%`;
      this.hBar.style.background = 'var(--orange)';
    } else if (heat.visible) {
      this.hStatus.textContent = 'SPOTTED';
      this.hBar.style.width = `${clamp(heat.meter, 0, 1) * 100}%`;
      this.hBar.style.background = 'var(--red)';
    } else {
      this.hStatus.textContent = heat.locked ? 'HUNTED' : heat.hidden ? 'HIDDEN' : 'SEARCHING';
      this.hBar.style.width = `${heat.escapeProgress * 100}%`;
      this.hBar.style.background = 'var(--green)';
    }

    // --- district
    const d = g.world.district(p.pos.x, p.pos.z);
    if (d !== this.district) {
      if (this.district !== '' && p.state !== 'chute' && g.state === 'play') this.entering(d);
      this.district = d;
      this.dName.textContent = DISTRICTS[d].name.toUpperCase();
    }

    // --- vitals
    const hp = Math.max(0, Math.ceil(p.health));
    this.hpBar.style.width = `${hp}%`;
    this.hpBar.className = hp < 35 ? 'low' : '';
    this.hpNum.textContent = String(hp);
    this.slow -= dt;
    if (this.slow <= 0) {
      this.slow = 0.12;
      const W = WEAPONS[p.weapon];
      let html = `<span class="chip panel">$<b>${g.save.cash}</b></span>`;
      if (p.vehicle) {
        const v = p.vehicle;
        html += `<span class="chip panel"><b>${this.vehName}</b></span><span class="chip panel"><b>${Math.round(Math.abs(v.speed) * 3.6 * 0.62)}</b> MPH</span>`;
        html += `<span class="chip panel ${v.hp < v.spec.hp * 0.35 ? 'warn' : ''}">ARMOR <b>${Math.max(0, Math.round((v.hp / v.spec.hp) * 100))}</b></span>`;
        if (v.spec.cls === 'heli') html += `<span class="chip panel">ALT <b>${Math.round(v.y)}</b></span>`;
      } else {
        html += `<span class="chip panel ${p.reloadT > 0 ? 'warn' : ''}"><b>${W.name}</b> ${p.reloadT > 0 ? 'RELOADING' : `${p.ammo[p.weapon]}/${W.mag}`}</span>`;
        if (p.crouching) html += '<span class="chip panel">SNEAKING</span>';
      }
      if (html !== this.lastChips) {
        this.lastChips = html;
        this.chips.innerHTML = html;
      }
      this.minimap.draw();
      this.drawCompass();
      if (g.save.settings.showFps) this.fps.textContent = `${Math.round(g.renderer.fps)} fps · ${g.renderer.three.info.render.calls} calls · ${(g.renderer.three.info.render.triangles / 1000) | 0}k tris`;
      else if (this.fps.textContent) this.fps.textContent = '';
    }

    // --- prompt / crosshair / altitude
    const pr = g.interact.prompt;
    this.prompt.style.display = pr ? '' : 'none';
    if (pr) {
      if (this.promptTxt.textContent !== pr.label) this.promptTxt.textContent = pr.label;
      this.promptBar.style.width = `${pr.progress * 100}%`;
    }
    this.cross.style.display = p.aiming ? '' : 'none';
    if (p.state === 'chute') {
      const h = Math.max(0, p.pos.y - g.world.groundAt(p.pos.x, p.pos.z, p.pos.y));
      this.alt.style.display = '';
      this.alt.innerHTML = `${Math.round(h)} M<small>ALTITUDE · WASD STEER · SHIFT DIVE</small>`;
    } else if (p.canDeploy) {
      this.alt.style.display = '';
      this.alt.innerHTML = 'SPACE<small>DEPLOY PARACHUTE</small>';
    } else this.alt.style.display = 'none';

    // --- objective pointer
    if (mk && g.state === 'play') {
      const y = (mk.y ?? g.world.groundAt(mk.x, mk.z, p.pos.y + 2)) + 2.2;
      v3.set(mk.x, y, mk.z).project(g.camera);
      const w = g.renderer.width, h = g.renderer.height;
      let sx = (v3.x + 1) / 2, sy = (1 - v3.y) / 2;
      const behind = v3.z > 1;
      if (behind) {
        sx = 1 - sx;
        sy = 1;
      }
      const m = 0.06;
      const off = behind || sx < m || sx > 1 - m || sy < 0.12 || sy > 0.86;
      sx = clamp(sx, m, 1 - m);
      sy = clamp(sy, 0.12, 0.86);
      const dd = Math.sqrt(dist2(p.pos.x, p.pos.z, mk.x, mk.z));
      this.pointer.style.display = dd > 5 ? '' : 'none';
      this.pointer.style.transform = `translate(${sx * w}px, ${sy * h}px) scale(${off ? 0.85 : 1})`;
      this.pointerTxt.textContent = `${Math.round(dd)} m`;
    } else this.pointer.style.display = 'none';
  }

  private drawCompass() {
    const c = this.compass, g = this.g;
    const bearing = Math.atan2(g.cam.fx, -g.cam.fz); // 0 = north, clockwise
    c.clearRect(0, 0, 300, 26);
    c.fillStyle = '#1d1a2e';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const pxPerRad = 300 / 2.4;
    const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      let da = a - bearing;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const x = 150 + da * pxPerRad;
      if (x < -10 || x > 310) continue;
      if (i % 3 === 0) {
        const n = names[i / 3];
        c.font = n.length === 1 ? 'italic 17px Bangers, Impact' : '600 11px "Barlow Condensed", Arial';
        c.fillStyle = n === 'N' ? '#d43a34' : '#1d1a2e';
        c.fillText(n, x, 12);
      } else {
        c.fillStyle = '#1d1a2e';
        c.fillRect(x - 0.75, 9, 1.5, 8);
      }
    }
    const mk = g.missions.marker;
    if (mk) {
      const a = Math.atan2(mk.x - g.player.pos.x, -(mk.z - g.player.pos.z));
      let da = a - bearing;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const x = clamp(150 + da * pxPerRad, 6, 294);
      c.fillStyle = '#ee8a3a';
      c.beginPath();
      c.moveTo(x, 26);
      c.lineTo(x - 5, 19);
      c.lineTo(x + 5, 19);
      c.closePath();
      c.fill();
    }
    c.fillStyle = '#d43a34';
    c.fillRect(149, 0, 2, 5);
  }
}
