import { el } from '../core/util';
import type { Quality, TimeMode, WeatherMode } from '../core/save';
import { OUTFITS } from '../entities/character';
import { VSPECS } from '../entities/vehicleModels';
import { ACT_NAMES, MISSIONS } from '../systems/missionData';
import { ACTIVITIES } from '../systems/activities';
import { WEAPONS } from '../systems/combat';
import { fmtTime } from '../core/util';
import type { Game } from '../game';

const METRO: [string, string][] = [['downtown', 'Golden Square'], ['wallstreet', 'Wall Street'], ['government', 'Capitol Mall'], ['beach', 'Liberty Beach']];

export class Menus {
  private root: HTMLElement;
  /** Name of the open screen ('' when playing). */
  screen = '';
  private back: (() => void) | null = null;

  constructor(private g: Game, ui: HTMLElement) {
    this.root = el('div', '', '', ui);
    window.addEventListener('keydown', (e) => {
      if (!this.screen) return;
      if (e.code === 'Escape' || e.code === 'Backspace') {
        e.preventDefault();
        if (this.back) this.back();
      }
    });
  }

  get open() {
    return this.screen !== '';
  }

  private clear() {
    this.root.innerHTML = '';
  }
  private btn(parent: HTMLElement, label: string, fn: () => void, cls = '') {
    const b = el('div', 'btn ' + cls, label, parent);
    b.addEventListener('click', () => {
      this.g.audio.unlock();
      this.g.audio.play('ui', 0.6);
      fn();
    });
    return b;
  }
  private sheet(title: string, back: () => void, cls = 'sheet') {
    this.clear();
    const m = el('div', 'menu', '', this.root);
    const s = el('div', `${cls} panel`, '', m);
    el('h2', '', title, s);
    this.back = back;
    return s;
  }
  private footer(s: HTMLElement, back: () => void, label = 'Back') {
    const f = el('div', 'footer', '', s);
    this.btn(f, label, back, 'small');
    return f;
  }

  close() {
    this.clear();
    this.screen = '';
    this.back = null;
  }

  // ------------------------------------------------------------------ main menu
  main() {
    const g = this.g;
    this.clear();
    this.screen = 'main';
    this.back = null;
    const m = el('div', 'menu main', '', this.root);
    const col = el('div', '', '', m);
    const logo = el('div', 'logo', '', col);
    el('div', 'kicker', 'An open-world political satire', logo);
    el('h1', '', 'EVERYONE<br>AGAINST <span>TRUMP</span>', logo);
    el('p', '', 'Parachute in. Run. Drive. Escape. Survive.', logo);
    const items = el('div', 'items', '', col);
    const s = g.save;
    this.btn(items, 'New Game', () => {
      if (s.started && !confirm('Start a new campaign? Your current progress will be replaced.')) return;
      g.newGame();
    });
    this.btn(items, 'Continue', () => g.continueGame(), s.started ? '' : 'off');
    this.btn(items, 'Free Roam', () => g.startFreeRoam(), s.started ? '' : 'off');
    this.btn(items, 'Mission Replay', () => this.replay(() => this.main()), s.completed.length ? '' : 'off');
    this.btn(items, 'Settings', () => this.settings(() => this.main()));
    this.btn(items, 'Controls', () => this.controls(() => this.main()));
    this.btn(items, 'Credits', () => this.credits(false, () => this.main()));
    el('div', 'disclaimer', 'A work of satire and fiction. Every character, faction, brand and event is an invented parody; nothing here depicts real statements or actions of any real person. Not affiliated with or endorsed by anyone.', m);
  }

  // ------------------------------------------------------------------ pause
  pause() {
    const g = this.g;
    this.clear();
    this.screen = 'pause';
    this.back = () => g.resume();
    const m = el('div', 'menu', '', this.root);
    const col = el('div', 'sheet panel', '', m);
    col.style.width = 'min(430px, 92vw)';
    el('h2', '', 'PAUSED', col);
    const items = el('div', 'items', '', col);
    this.btn(items, 'Resume', () => g.resume());
    this.btn(items, 'Map', () => this.map(() => this.pause()));
    this.btn(items, 'Mission Information', () => this.info(() => this.pause()));
    this.btn(items, 'Controls', () => this.controls(() => this.pause()));
    this.btn(items, 'Settings', () => this.settings(() => this.pause()));
    const act = g.missions.active || g.activities.active;
    this.btn(items, g.missions.active ? 'Restart Mission' : 'Quit Challenge', () => {
      if (g.missions.active) g.missions.restart(true);
      else g.activities.stop();
      g.resume();
    }, act ? '' : 'off');
    if (g.missions.active && g.missions.activeId !== 'm01') this.btn(items, 'Abandon Mission', () => {
      g.missions.stop();
      g.resume();
    });
    this.btn(items, 'Main Menu', () => g.toMainMenu());
  }

  // ------------------------------------------------------------------ settings
  settings(back: () => void) {
    const g = this.g, st = g.save.settings;
    const s = this.sheet('SETTINGS', back);
    this.screen = 'settings';
    const rows = el('div', 'rows', '', s);
    const seg = <T extends string>(label: string, opts: [T, string][], get: () => T, set: (v: T) => void) => {
      el('span', '', label, rows);
      const box = el('div', 'seg', '', rows);
      const draw = () => {
        box.innerHTML = '';
        for (const [v, name] of opts) {
          const b = el('span', get() === v ? 'on' : '', name, box);
          b.addEventListener('click', () => {
            set(v);
            g.applySettings();
            g.audio.play('ui', 0.5);
            draw();
          });
        }
      };
      draw();
    };
    const slider = (label: string, get: () => number, set: (v: number) => void, min = 0, max = 1) => {
      el('span', '', label, rows);
      const i = el('input', '', '', rows) as HTMLInputElement;
      i.type = 'range';
      i.min = String(min);
      i.max = String(max);
      i.step = '0.05';
      i.value = String(get());
      i.addEventListener('input', () => {
        set(parseFloat(i.value));
        g.applySettings();
      });
    };
    seg<Quality>('Graphics', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], () => st.quality, (v) => (st.quality = v));
    slider('Master volume', () => st.master, (v) => (st.master = v));
    slider('Music', () => st.music, (v) => (st.music = v));
    slider('Effects', () => st.sfx, (v) => (st.sfx = v));
    slider('Mouse sensitivity', () => st.sensitivity, (v) => (st.sensitivity = v), 0.3, 2.5);
    seg('Invert look', [['n', 'Off'], ['y', 'On']], () => (st.invertY ? 'y' : 'n'), (v) => (st.invertY = v === 'y'));
    seg<TimeMode>('Time of day', [['cycle', 'Cycle'], ['day', 'Day'], ['afternoon', 'Late'], ['sunset', 'Sunset'], ['night', 'Night']], () => st.time, (v) => (st.time = v));
    seg<WeatherMode>('Weather', [['auto', 'Auto'], ['clear', 'Clear'], ['rain', 'Rain']], () => st.weather, (v) => (st.weather = v));
    seg('Performance readout', [['n', 'Off'], ['y', 'On']], () => (st.showFps ? 'y' : 'n'), (v) => (st.showFps = v === 'y'));
    el('p', '', 'Low: no shadows, shorter draw distance, fewer people and cars. High: full draw distance, sharper ink lines, densest crowds. Resolution also adapts automatically if the frame rate drops.', s);
    this.footer(s, () => {
      g.store.save();
      back();
    });
    this.back = () => {
      g.store.save();
      back();
    };
  }

  controls(back: () => void) {
    const s = this.sheet('CONTROLS', back);
    this.screen = 'controls';
    const k = (rows: [string, string][]) => {
      const box = el('div', 'keys', '', s);
      for (const [key, what] of rows) {
        el('span', 'key', key, box);
        el('span', '', what, box);
      }
    };
    el('h3', '', 'ON FOOT', s);
    k([['WASD', 'Move'], ['MOUSE', 'Look (click to capture)'], ['SHIFT', 'Sprint'], ['SPACE', 'Jump · climb low obstacles · open parachute when falling'], ['C', 'Sneak (harder to spot)'], ['Q', 'Dodge roll'], ['LMB', 'Punch combo · fire while aiming'], ['RMB', 'Aim'], ['R', 'Reload'], ['1 / 2', 'Previous / next gear'], ['E', 'Interact · enter / exit vehicles'], ['WHEEL', 'Camera distance']]);
    el('h3', '', 'VEHICLES', s);
    k([['W / S', 'Accelerate / brake & reverse'], ['A / D', 'Steer'], ['SPACE', 'Handbrake (cars) · climb (helicopter)'], ['C', 'Descend (helicopter)'], ['H', 'Horn'], ['E', 'Get out · bail out of a flying helicopter']]);
    el('h3', '', 'GENERAL', s);
    k([['TAB', 'Mission information'], ['M', 'Map'], ['ESC', 'Pause'], ['GAMEPAD', 'Sticks move/look · A jump · B dodge · X interact · RT attack/gas · LT aim/brake']]);
    this.footer(s, back);
  }

  credits(final = false, back?: () => void) {
    const g = this.g;
    const done = back ?? (() => g.resume());
    const s = this.sheet(final ? 'TRUMP SURVIVED AMERICA.' : 'CREDITS', done);
    this.screen = 'credits';
    if (final) {
      g.setState('pause');
      el('p', '', `Campaign complete. Cancelled ${g.save.stats.cancelled} times, ${g.save.stats.escapes} clean getaways, ${g.save.stats.knockouts} knockouts, ${(g.save.stats.distance / 1609).toFixed(1)} miles travelled.`, s);
      el('p', '', 'Free roam is open: every district, every challenge, every Golden T. The Golden Chopper waits on the tower roof.', s);
    }
    el('h3', '', 'EVERYONE AGAINST TRUMP', s);
    el('p', '', 'A satirical open-world action game. Design, code, procedural art and synthesised audio generated for this project — no third-party models, textures or sound files.', s);
    el('h3', '', 'BUILT WITH', s);
    el('p', '', 'Three.js (MIT) · TypeScript · Vite · Bangers and Barlow Condensed typefaces (SIL Open Font License).', s);
    el('h3', '', 'A NOTE ON SATIRE', s);
    el('p', '', 'This is parody. The public figures who appear are exaggerated cartoon characters in an invented story; nothing they say or do here is a claim about any real person or real event.', s);
    this.footer(s, done, final ? 'Continue in Free Roam' : 'Back');
  }

  replay(back: () => void) {
    const g = this.g;
    const s = this.sheet('MISSION REPLAY', back);
    this.screen = 'replay';
    let act = 0;
    const list = el('div', 'mlist', '', s);
    for (const m of MISSIONS) {
      if (m.act !== act) {
        act = m.act;
        el('h3', '', ACT_NAMES[act], list);
      }
      const done = g.save.completed.includes(m.id);
      const row = el('div', 'mrow' + (done ? '' : ' lock'), `<b>${String(m.num).padStart(2, '0')}</b>${m.title}<i>${done ? 'REPLAY ▸' : 'LOCKED'}</i>`, list);
      if (done)
        row.addEventListener('click', () => {
          g.beginPlay(false);
          g.missions.startById(m.id);
        });
    }
    this.footer(s, back);
  }

  /** Tab screen: objective, progress, unlocks. */
  info(back: () => void) {
    const g = this.g, sv = g.save;
    const s = this.sheet('MISSION INFORMATION', back);
    this.screen = 'info';
    const run = g.missions.run;
    if (run) {
      el('h3', '', `MISSION ${String(run.def.num).padStart(2, '0')} — ${run.def.title}`, s);
      el('p', '', run.def.intro, s);
      el('p', '', `<b>Objective:</b> ${g.missions.objective}`, s);
    } else if (g.missions.next) {
      el('h3', '', `NEXT: MISSION ${String(g.missions.next.num).padStart(2, '0')} — ${g.missions.next.title}`, s);
      el('p', '', g.missions.next.intro, s);
      el('p', '', 'Follow the orange diamond on the minimap to the golden beam to begin.', s);
    } else el('p', '', 'Campaign complete — the city is yours.', s);
    el('h3', '', 'PROGRESS', s);
    el('p', '', `Missions ${sv.completed.length}/${MISSIONS.length} · Golden Ts ${sv.collectibles.length}/${g.world.collectSpots.length} · Vehicles discovered ${sv.vehicles.length}/${Object.keys(VSPECS).length} · Cash $${sv.cash}`, s);
    el('p', '', `Districts open: ${sv.districts.length}/8 · Clean getaways ${sv.stats.escapes} · Times cancelled ${sv.stats.cancelled}`, s);
    el('h3', '', 'GEAR', s);
    el('p', '', WEAPONS.map((w) => `${sv.weapons.includes(w.id) ? '✔' : '✕'} ${w.name}${sv.weapons.includes(w.id) ? '' : ` (${w.unlock})`}`).join(' · '), s);
    el('h3', '', 'CHALLENGE RECORDS', s);
    el('p', '', ACTIVITIES.map((a) => `${a.name}: ${sv.records[a.id] !== undefined ? fmtTime(sv.records[a.id]) : '—'}`).join(' · '), s);
    this.footer(s, back);
  }

  map(back: () => void) {
    const g = this.g;
    this.clear();
    this.screen = 'map';
    this.back = back;
    const m = el('div', 'menu', '', this.root);
    const box = el('div', 'bigmap panel', '', m);
    const cv = el('canvas', '', '', box);
    g.hud.minimap.drawFull(cv);
    const lg = el('div', 'legend', '', box);
    lg.innerHTML = '<span><i style="background:#d43a34"></i>You</span><span><i style="background:#ee8a3a"></i>Objective</span><span><i style="background:#4c9a5a"></i>Safehouse</span><span><i style="background:#2f8f86"></i>Metro</span><span><i style="background:#5fd0ff"></i>Challenge</span><span><i style="background:#f2c94c"></i>Golden T nearby</span><span>✕ = hostile territory</span>';
    this.footer(box, back, 'Close');
  }

  /** Safehouse wardrobe. */
  wardrobe() {
    const g = this.g;
    g.setState('pause');
    const back = () => g.resume();
    const s = this.sheet('SAFEHOUSE', back);
    this.screen = 'wardrobe';
    el('p', '', 'Game saved. Health restored. Nobody saw you come in.', s);
    el('h3', '', 'WARDROBE', s);
    const list = el('div', 'mlist', '', s);
    const draw = () => {
      list.innerHTML = '';
      for (const [id, o] of Object.entries(OUTFITS)) {
        const have = g.save.outfits.includes(id);
        const row = el('div', 'mrow' + (have ? '' : ' lock'), `<b>${g.save.outfit === id ? '●' : '○'}</b>${o.name}<i>${have ? (g.save.outfit === id ? 'WEARING' : 'WEAR ▸') : o.how}</i>`, list);
        if (have)
          row.addEventListener('click', () => {
            g.player.setOutfit(id);
            g.audio.play('pickup', 0.5);
            g.store.save();
            draw();
          });
      }
    };
    draw();
    this.footer(s, back, 'Back to the street');
  }

  metro(from: string) {
    const g = this.g;
    g.setState('pause');
    const back = () => g.resume();
    const s = this.sheet('CITY METRO', back);
    this.screen = 'metro';
    el('p', '', 'Fare $10. Trains leave whenever you do. Nobody looks up from their phone.', s);
    const list = el('div', 'mlist', '', s);
    for (const [id, name] of METRO) {
      const here = id === from;
      const row = el('div', 'mrow' + (here ? ' lock' : ''), `<b>Ⓜ</b>${name}<i>${here ? 'YOU ARE HERE' : 'RIDE ▸'}</i>`, list);
      if (!here)
        row.addEventListener('click', () => {
          const d = g.world.interacts.find((x) => x.id === 'metro-' + id);
          if (!d) return;
          if (g.save.cash < 10) {
            g.hud.toast('Not enough cash for the fare ($10)', 'warn');
            return;
          }
          g.resume();
          g.addCash(-10);
          g.fade(() => {
            g.player.place(d.x + 3.5, d.y, d.z + 1);
            // riding underground breaks contact with pursuers
            if (!g.heat.locked) g.heat.clear();
            g.audio.play('door', 0.6);
          });
        });
    }
    this.footer(s, back, 'Stay here');
  }
}
