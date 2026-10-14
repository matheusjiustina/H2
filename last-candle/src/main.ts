import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-700.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-600.css";
import "@fontsource/permanent-marker/latin-400.css";
import "./style.css";
import { Game } from "./core/Game";

async function boot() {
  // Canvas textures need the fonts ready before they are drawn.
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('700 32px "Space Grotesk"'),
        document.fonts.load('500 32px "Space Grotesk"'),
        document.fonts.load('400 32px "JetBrains Mono"'),
        document.fonts.load('600 32px "JetBrains Mono"'),
        document.fonts.load('400 32px "Permanent Marker"'),
      ]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* fall back to system fonts */
  }
  const canvas = document.getElementById("view") as HTMLCanvasElement;
  const ui = document.getElementById("ui") as HTMLDivElement;
  const game = new Game(canvas, ui);
  (window as unknown as { __game: Game }).__game = game;
  game.start();
}

boot().catch((err) => {
  console.error(err);
  const ui = document.getElementById("ui");
  if (ui) ui.innerHTML = `<div class="fatal">Something broke while loading.<br><small>${String(err?.message ?? err)}</small></div>`;
});
