import { UI_ICONS } from './icons.js';

const R = 12;
const CIRC = 2 * Math.PI * R;

/**
 * Floating indicators pinned to each plot (screen-space HTML, crisp at any DPI):
 *  empty → "+"   ·   growing → progress ring   ·   ready → "HARVEST"
 */
export function createMarkers(count, { onTap, onHover }) {
  const host = document.getElementById('markers');
  const items = [];
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'marker is-empty';
    el.innerHTML = `
      <button class="m-plant" type="button" aria-label="Plant on plot ${i + 1}">
        <span class="m-plus">${UI_ICONS.plus}</span>
        <span class="m-label">PLANT</span>
      </button>
      <div class="m-grow" aria-hidden="true">
        <svg viewBox="0 0 30 30"><circle class="track" cx="15" cy="15" r="${R}"/><circle class="bar" cx="15" cy="15" r="${R}" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC}"/></svg>
      </div>
      <button class="m-ready" type="button" aria-label="Harvest plot ${i + 1}">${UI_ICONS.up}<span>HARVEST</span></button>`;
    host.appendChild(el);
    const bar = el.querySelector('.bar');
    const grow = el.querySelector('.m-grow');
    el.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        onTap(i);
      });
      b.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && onHover(i, true));
      b.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && onHover(i, false));
    });
    items.push({ el, bar, grow, state: 'empty', progress: -1, x: 0, y: 0, stage: -1, flags: '' });
  }

  return {
    show() {
      items.forEach((m, i) => setTimeout(() => m.el.classList.add('on'), i * 60));
    },
    setState(i, state, { color, first = false, quiet = false } = {}) {
      const m = items[i];
      const flags = `${state}|${color}|${first}|${quiet}`;
      if (m.flags === flags) return;
      m.flags = flags;
      m.state = state;
      m.el.classList.remove('is-empty', 'is-growing', 'is-ready', 'is-busy');
      m.el.classList.add(`is-${state}`);
      m.el.classList.toggle('first', first);
      m.el.classList.toggle('quiet', quiet);
      if (color) m.el.style.setProperty('--c', color);
    },
    setHover(i, on) {
      items[i].el.classList.toggle('hover', on);
    },
    setProgress(i, p, stage) {
      const m = items[i];
      if (Math.abs(m.progress - p) > 0.002) {
        m.progress = p;
        m.bar.setAttribute('stroke-dashoffset', String(CIRC * (1 - p)));
      }
      if (stage !== m.stage) {
        if (m.stage >= 0 && stage > m.stage) {
          m.grow.classList.remove('tick');
          void m.grow.offsetWidth;
          m.grow.classList.add('tick');
        }
        m.stage = stage;
      }
    },
    tick(i) {
      const g = items[i].grow;
      g.classList.remove('tick');
      void g.offsetWidth;
      g.classList.add('tick');
    },
    place(i, x, y) {
      const m = items[i];
      if (Math.abs(m.x - x) < 0.1 && Math.abs(m.y - y) < 0.1) return;
      m.x = x;
      m.y = y;
      m.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    },
  };
}
