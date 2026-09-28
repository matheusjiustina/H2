import { STOCKS } from '../config/stocks.js';
import { ICONS } from './icons.js';

export function stockIcon(stock) {
  return `<span class="card-icon" style="--c1:${stock.ui[0]};--c2:${stock.ui[1]}">${ICONS[stock.id]}</span>`;
}

/**
 * Compact stock picker. Floats above the plot on desktop,
 * becomes a bottom sheet on phones.
 */
export function createPicker({ onPick, onClose }) {
  const root = document.getElementById('picker');
  const cards = document.getElementById('pickerCards');
  const scrim = document.getElementById('scrim');
  let plotIndex = null;
  let busy = false;

  cards.innerHTML = STOCKS.map(
    (s, i) =>
      `<button class="card${s.rare ? ' rare' : ''}" type="button" data-id="${s.id}" style="--i:${i};--c1:${s.ui[0]};--c2:${s.ui[1]}" aria-label="Plant ${s.id}">
        ${stockIcon(s)}
        <span class="card-ticker">${s.id}</span>
      </button>`,
  ).join('');

  cards.addEventListener('click', (e) => {
    const btn = e.target.closest('.card');
    if (!btn || busy || plotIndex == null) return;
    busy = true;
    btn.classList.add('pressed');
    const idx = plotIndex;
    setTimeout(() => {
      api.close(true);
      btn.classList.remove('pressed');
      onPick(idx, btn.dataset.id);
      busy = false;
    }, 130);
  });

  const dismiss = (e) => {
    e?.preventDefault?.();
    api.close();
  };
  scrim.addEventListener('pointerdown', dismiss);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && api.isOpen) api.close();
  });

  const api = {
    isOpen: false,
    get plot() {
      return plotIndex;
    },
    isSheet() {
      return window.innerWidth <= 640 || (matchMedia('(pointer: coarse)').matches && window.innerHeight <= 520);
    },
    open(index, anchor) {
      // Move focus into the cards only for keyboard users (opened from a focused marker).
      const a = document.activeElement;
      const viaKeyboard = !!a?.closest?.('.marker') && a.matches(':focus-visible');
      plotIndex = index;
      api.isOpen = true;
      const sheet = api.isSheet();
      root.classList.toggle('sheet', sheet);
      scrim.classList.toggle('sheet', sheet);
      if (!sheet) api.position(anchor);
      root.setAttribute('aria-hidden', 'false');
      // force reflow so the open transition always plays
      void root.offsetWidth;
      root.classList.add('open');
      scrim.classList.add('on');
      if (viaKeyboard) setTimeout(() => cards.querySelector('.card')?.focus({ preventScroll: true }), 50);
    },
    position(anchor) {
      if (!anchor || root.classList.contains('sheet')) return;
      const w = 3 * 84 + 2 * 8 + 20;
      const h = 2 * 84 + 8 + 20;
      const margin = 12;
      const x = Math.min(window.innerWidth - w / 2 - margin, Math.max(w / 2 + margin, anchor.x));
      const below = anchor.y - h - 30 < 70;
      root.classList.toggle('below', below);
      const y = below ? anchor.yBelow ?? anchor.y + 40 : anchor.y;
      root.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    },
    close(picked = false) {
      if (!api.isOpen) return;
      api.isOpen = false;
      root.classList.remove('open');
      scrim.classList.remove('on');
      root.setAttribute('aria-hidden', 'true');
      const idx = plotIndex;
      plotIndex = null;
      if (!picked) onClose?.(idx);
      else onClose?.(idx, true);
    },
  };
  return api;
}
