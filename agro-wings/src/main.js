import { Game } from './game/game.js';
import './ui/styles.css';
import { t } from './i18n/index.js';

const game = new Game(document.getElementById('game'), document.getElementById('ui'));
window.__agro = game;
game.boot().catch((err) => {
  console.error(err);
  const el = document.getElementById('ui');
  el.innerHTML = `<div class="fatal"><h1>${t('Agro Wings could not start')}</h1><p>${String(err && err.message || err)}</p></div>`;
});
