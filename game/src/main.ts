import '@fontsource/bangers';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import './ui/styles.css';
import { Game } from './game';

const ui = document.getElementById('ui') as HTMLElement;
const canvas = document.getElementById('game') as HTMLCanvasElement;

function fatal(msg: string) {
  let e = document.querySelector('.err') as HTMLElement | null;
  if (!e) {
    e = document.createElement('div');
    e.className = 'err panel';
    document.body.appendChild(e);
  }
  e.textContent = msg;
}
window.addEventListener('error', (ev) => {
  console.error(ev.error ?? ev.message);
  if (!(window as unknown as { __game?: Game }).__game) fatal(`Something went wrong while starting the game: ${ev.message}`);
});

const loading = document.createElement('div');
loading.className = 'loading';
loading.innerHTML = 'BUILDING UNITED STATES CITY…<small>pouring concrete · planting trees · printing protest signs</small>';
document.body.appendChild(loading);

async function boot() {
  // Fonts are drawn into canvas textures (signs, billboards), so wait for them first.
  await Promise.race([
    Promise.all([document.fonts.load('32px Bangers'), document.fonts.load('700 32px "Barlow Condensed"'), document.fonts.load('600 32px "Barlow Condensed"')]),
    new Promise((r) => setTimeout(r, 2500)),
  ]);
  await new Promise((r) => setTimeout(r, 30));
  const probe = document.createElement('canvas');
  if (!probe.getContext('webgl2')) {
    loading.remove();
    fatal('This game needs WebGL 2. Please use a current version of Chrome, Edge, Firefox or Safari with hardware acceleration enabled.');
    return;
  }
  try {
    const game = new Game(canvas, ui);
    (window as unknown as { __game: Game }).__game = game;
  } catch (err) {
    console.error(err);
    fatal(`Could not start the game: ${(err as Error).message}`);
  }
  loading.remove();
}
void boot();
