import { Game } from './core/Game.js';

const canvas = document.getElementById('game');
const ui = document.getElementById('ui');
const game = new Game(canvas, ui);
window.__game = game;
game.init().catch((err) => {
  console.error(err);
  ui.innerHTML = `<div class="fatal"><h1>Something went wrong</h1><p>${String(err && err.message ? err.message : err)}</p><p>This game needs a browser with WebGL2 support.</p></div>`;
});
