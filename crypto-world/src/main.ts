import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/800.css';
import './ui/styles.css';
import { Game } from './core/Game';

async function boot() {
  const app = document.getElementById('app')!;
  app.style.cssText = 'position:fixed;inset:0;overflow:hidden;background:#1d2433';
  document.body.style.margin = '0';
  // Signs and screens are drawn to canvases, so fonts must be ready first.
  await Promise.all([
    document.fonts.load('600 32px Fredoka'),
    document.fonts.load('700 32px Fredoka'),
    document.fonts.load('500 32px Nunito'),
  ]).catch(() => undefined);
  const game = new Game(app);
  game.start();
  await game.build();
}
boot();
