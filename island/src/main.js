import { Game } from './core/Game.js';

const canvas = document.getElementById('game');
const ui = document.getElementById('ui');

function start(data = {}) {
  const game = new Game(canvas, ui);
  window.__game = game;
  game.init().then(() => {
    if (data && data.save) game.restoreState(data.save);
  }).catch((err) => {
    console.error(err);
    ui.innerHTML = `<div class="fatal"><h1>Something went wrong</h1><p>${String(err && err.message ? err.message : err)}</p><p>This game needs a browser with WebGL2 support.</p></div>`;
  });
  // when hosted as a published page, keep the player where they were across page updates
  const hot = window.claude?.hot;
  if (hot && typeof hot.snapshot === 'function') hot.snapshot(() => ({ save: game.saveState() }));
}

const hot = window.claude?.hot;
if (hot && typeof hot.ready === 'function') hot.ready(start);
else start(hot?.data ?? {});
