import { STOCKS } from '../config/stocks.js';
import { stockIcon } from './picker.js';

/** The Harvest Vault summary. Deliberately tiny. */
export function createVaultPanel({ onClose } = {}) {
  const root = document.getElementById('vaultPanel');
  const list = document.getElementById('vaultList');
  const total = document.getElementById('vaultTotal');
  const closeBtn = document.getElementById('vaultClose');

  const api = {
    isOpen: false,
    open(state) {
      const rows = STOCKS.filter((s) => state.vault[s.id] > 0).sort((a, b) => state.vault[b.id] - state.vault[a.id]);
      list.innerHTML = rows.length
        ? rows
            .map(
              (s, i) =>
                `<li class="vault-row" style="--i:${i}">${stockIcon(s)}<span class="tk">${s.id}</span><span class="n">× <b>${state.vault[s.id]}</b></span></li>`,
            )
            .join('')
        : `<li class="vault-empty">Nothing harvested yet.<br/>Plant a seed to get started.</li>`;
      total.textContent = String(state.total);
      api.isOpen = true;
      root.setAttribute('aria-hidden', 'false');
      void root.offsetWidth;
      root.classList.add('open');
      setTimeout(() => closeBtn.focus({ preventScroll: true, focusVisible: false }), 60);
    },
    close() {
      if (!api.isOpen) return;
      api.isOpen = false;
      root.classList.remove('open');
      root.setAttribute('aria-hidden', 'true');
      onClose?.();
    },
  };

  closeBtn.addEventListener('click', () => api.close());
  root.addEventListener('pointerdown', (e) => {
    if (e.target === root) api.close();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && api.isOpen) api.close();
  });
  return api;
}
