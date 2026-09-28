import './styles.css';
import { Stage } from './world/stage.js';
import { Tweens } from './core/tween.js';
import { createStore } from './core/store.js';
import { createLocalPersistence } from './services/persistence.js';
import { STORAGE_KEY } from './config/game.js';
import { GameController } from './game/controller.js';
import { createHud } from './ui/hud.js';
import { createPicker } from './ui/picker.js';
import { createVaultPanel } from './ui/vaultPanel.js';
import { createMarkers } from './ui/markers.js';
import { playIntro } from './ui/intro.js';

async function fontsReady(timeout = 1500) {
  if (!document.fonts?.load) return;
  await Promise.race([
    Promise.all([
      document.fonts.load('700 40px "Space Grotesk"'),
      document.fonts.load('600 30px "Space Grotesk"'),
      document.fonts.load('500 14px "Inter"'),
    ]).catch(() => {}),
    new Promise((r) => setTimeout(r, timeout)),
  ]);
}

async function boot() {
  const introDone = playIntro({ hold: 2700 });
  await fontsReady();

  const store = createStore({ persistence: createLocalPersistence(STORAGE_KEY) });
  const tweens = new Tweens();
  const container = document.getElementById('scene');
  const stage = new Stage(container);

  let game = null;
  const ui = {};
  ui.hud = createHud({ onVault: () => game?.openVault() });
  ui.picker = createPicker({
    onPick: (i, id) => game?.plant(i, id),
    onClose: (i, picked) => game?.onPickerClosed(i, picked),
  });
  ui.vault = createVaultPanel();
  ui.markers = createMarkers(6, {
    onTap: (i) => game?.tapPlot(i),
    onHover: (i, on) => game?.hoverPlotFromMarker(i, on),
  });
  ui.hud.setCount(store.state.total);

  game = new GameController({ stage, store, tweens, ui });
  game.prepareIntro();
  stage.start();

  await introDone;
  container.classList.add('on');
  game.playIntro();

  // Handy for debugging / future integrations.
  window.__stockGarden = { store, game, stage };
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

if (webglAvailable()) boot();
else {
  document.getElementById('intro').innerHTML =
    '<p style="color:#8793a2;font-family:system-ui;text-align:center;padding:24px">Stock Garden needs WebGL. Please try a recent browser.</p>';
}
