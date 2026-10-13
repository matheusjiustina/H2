import { Cosmetics, Settings } from '../gameplay/SaveSystem';
import { confirmTwice, el, esc } from './UI';
import type { BagStyle, HairStyle, HatStyle } from '../characters/Appearance';
import { SKIN_TONES } from '../characters/Appearance';

export interface SettingsHandlers {
  settings: Settings;
  cosmetics: Cosmetics;
  inGame: boolean;
  onChange: (s: Settings) => void;
  onCosmetics: (c: Cosmetics) => void;
  onReset: () => void;
  onResume: () => void;
  onTitle?: () => void;
}

const JACKETS = ['#e8823a', '#2f8f8f', '#8f7ad6', '#d9584a', '#5f9e6e', '#2d4060', '#f0c24a', '#e98fb0'];
const BAG_COLORS = ['#2f8f8f', '#c9663e', '#2d4060', '#f0b04a', '#8a5a7c', '#3b2d26'];
const HAT_COLORS = ['#2d4060', '#d9584a', '#f0b04a', '#2f8f8f', '#f4efe6', '#2a2430'];
const HAIR_COLORS = ['#2b2321', '#4a3226', '#b07a3e', '#d9b36a', '#c4563f', '#4f6fa8', '#9d6fc9', '#e8e1d6'];

/** Settings + wardrobe card. */
export function buildSettings(card: HTMLElement, h: SettingsHandlers): void {
  const s = { ...h.settings };
  const c = { ...h.cosmetics };
  card.classList.add('settings');
  card.innerHTML = `<div class="kicker">${h.inGame ? 'Paused' : 'Options'}</div><h3>Settings</h3>`;

  const range = (label: string, key: keyof Settings, min = 0, max = 1, step = 0.05) => {
    const row = el('label', 'row', `<span>${esc(label)}</span>`);
    const inp = el('input') as HTMLInputElement;
    inp.type = 'range';
    inp.min = String(min);
    inp.max = String(max);
    inp.step = String(step);
    inp.value = String(s[key]);
    inp.oninput = () => {
      (s as any)[key] = Number(inp.value);
      h.onChange({ ...s });
    };
    row.appendChild(inp);
    card.appendChild(row);
  };
  const check = (label: string, key: keyof Settings) => {
    const row = el('label', 'row', `<span>${esc(label)}</span>`);
    const inp = el('input') as HTMLInputElement;
    inp.type = 'checkbox';
    inp.checked = !!s[key];
    inp.onchange = () => {
      (s as any)[key] = inp.checked;
      h.onChange({ ...s });
    };
    row.appendChild(inp);
    card.appendChild(row);
  };
  const select = (label: string, key: keyof Settings, opts: [string, string][]) => {
    const row = el('label', 'row', `<span>${esc(label)}</span>`);
    const sel = el('select') as HTMLSelectElement;
    for (const [v, t] of opts) {
      const o = el('option', '', esc(t)) as HTMLOptionElement;
      o.value = v;
      if (s[key] === v) o.selected = true;
      sel.appendChild(o);
    }
    sel.onchange = () => {
      (s as any)[key] = sel.value;
      h.onChange({ ...s });
    };
    row.appendChild(sel);
    card.appendChild(row);
  };

  card.appendChild(el('h4', '', 'Audio'));
  range('Master volume', 'master');
  range('Music', 'music');
  range('Ambience', 'ambience');
  range('Effects', 'sfx');
  card.appendChild(el('h4', '', 'Graphics'));
  select('Quality', 'quality', [['auto', 'Auto (adaptive)'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]);
  check('Show performance stats (F3)', 'showFps');
  card.appendChild(el('h4', '', 'Controls & comfort'));
  range('Camera sensitivity', 'sensitivity', 0.3, 2, 0.05);
  check('Invert vertical look', 'invertY');
  check('Camera follows movement', 'autoFollow');
  range('Dialogue text speed', 'textSpeed', 0.5, 3, 0.1);
  select('Day length', 'dayLength', [['slow', 'Slow (32 min)'], ['normal', 'Normal (16 min)'], ['fast', 'Fast (6 min)']]);

  // Wardrobe.
  card.appendChild(el('h4', '', 'Wardrobe'));
  const swatchRow = (label: string, colors: string[], get: () => string, set: (v: string) => void) => {
    const row = el('label', 'row', `<span>${esc(label)}</span>`);
    const sw = el('div', 'swatches');
    const render = () => {
      sw.innerHTML = '';
      for (const col of colors) {
        const b = el('span', `swatch${get() === col ? ' on' : ''}`);
        b.style.background = col;
        b.onclick = (e) => {
          e.preventDefault();
          set(col);
          h.onCosmetics({ ...c });
          render();
        };
        sw.appendChild(b);
      }
    };
    render();
    row.appendChild(sw);
    card.appendChild(row);
  };
  const chipRow = <T extends string>(label: string, opts: [T, string][], get: () => T, set: (v: T) => void) => {
    const row = el('label', 'row', `<span>${esc(label)}</span>`);
    const chips = el('div', 'chips');
    const render = () => {
      chips.innerHTML = '';
      for (const [v, t] of opts) {
        const b = el('button', `chip${get() === v ? ' on' : ''}`, esc(t));
        b.onclick = (e) => {
          e.preventDefault();
          set(v);
          h.onCosmetics({ ...c });
          render();
        };
        chips.appendChild(b);
      }
    };
    render();
    row.appendChild(chips);
    card.appendChild(row);
  };
  swatchRow('Jacket', JACKETS, () => c.jacket, (v) => (c.jacket = v));
  chipRow<BagStyle>('Bag', [['messenger', 'Messenger'], ['backpack', 'Backpack'], ['satchel', 'Satchel']], () => c.bag, (v) => (c.bag = v));
  swatchRow('Bag colour', BAG_COLORS, () => c.bagColor, (v) => (c.bagColor = v));
  chipRow<HatStyle>('Hat', [['cap', 'Cap'], ['beanie', 'Beanie'], ['bucket', 'Bucket'], ['headphones', 'Headphones'], ['none', 'None']], () => c.hat, (v) => (c.hat = v));
  swatchRow('Hat colour', HAT_COLORS, () => c.hatColor, (v) => (c.hatColor = v));
  chipRow<HairStyle>('Hair', [['swoop', 'Swoop'], ['short', 'Short'], ['bob', 'Bob'], ['ponytail', 'Ponytail'], ['curly', 'Curly'], ['bun', 'Bun']], () => c.hairStyle, (v) => (c.hairStyle = v));
  swatchRow('Hair colour', HAIR_COLORS, () => c.hair, (v) => (c.hair = v));
  swatchRow('Skin', SKIN_TONES, () => c.skin, (v) => (c.skin = v));

  const actions = el('div', 'actions');
  if (h.inGame) {
    const reset = el('button', 'btn small', 'Reset progress');
    confirmTwice(reset, 'Tap again to erase progress', () => h.onReset());
    actions.appendChild(reset);
  }
  const resume = el('button', 'btn small primary', h.inGame ? 'Resume' : 'Done');
  resume.onclick = () => h.onResume();
  actions.appendChild(resume);
  card.appendChild(actions);
}
