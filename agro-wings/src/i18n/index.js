// Language: Portuguese (Brazil) by default, English as the second option.
// The English text in the code is the key; t(en, ...args) returns the
// Portuguese for it (falling back to the English) with {0}, {1}… filled in.
// The choice is kept in localStorage (or ?lang=pt|en / #en on the URL).
import PT_UI from './pt-ui.js';
import PT_GAME from './pt-game.js';
import PT_JOBS from './pt-jobs.js';
import PT_CREW from './pt-crew.js';
import PT_FARMS from './pt-farms.js';

const STORE = 'agrowings.lang';
const PT = { ...PT_UI, ...PT_GAME, ...PT_JOBS, ...PT_CREW, ...PT_FARMS };

function initial() {
  try {
    const q = new URLSearchParams(location.search).get('lang') || (location.hash === '#en' ? 'en' : location.hash === '#pt' ? 'pt' : null);
    if (q === 'en' || q === 'pt') return q;
  } catch { /* no location */ }
  try {
    const s = localStorage.getItem(STORE);
    if (s === 'en' || s === 'pt') return s;
  } catch { /* storage blocked */ }
  return 'pt';
}

let lang = typeof location === 'undefined' ? 'en' : initial();
try { document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en'; } catch { /* no document */ }

// Keys asked for in Portuguese that have no entry (checked by the tests).
export const misses = new Set();
if (typeof globalThis !== 'undefined') globalThis.__i18nMisses = misses;

export const getLang = () => lang;

export function setLang(l) {
  if (l !== 'en' && l !== 'pt') return;
  lang = l;
  try { localStorage.setItem(STORE, l); } catch { /* storage blocked */ }
  try { document.documentElement.lang = l === 'pt' ? 'pt-BR' : 'en'; } catch { /* no document */ }
}

const fill = (s, args) => (args.length ? s.replace(/\{(\d+)\}/g, (m, i) => (args[i] ?? m)) : s);

export function t(en, ...args) {
  let s = en;
  if (lang === 'pt') { if (en in PT) s = PT[en]; else if (en) misses.add(en); }
  return fill(s, args);
}

// For tests: the keys without a Portuguese entry.
export const missing = (keys) => keys.filter((k) => !(k in PT));
