// Builds a self-contained single HTML file (JS, CSS and fonts inlined) into dist-single/.
// Usage: npm run build:single
import { build } from "vite";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const out = "dist-single/.tmp";
await build({ logLevel: "warn", build: { outDir: out, emptyOutDir: true, assetsInlineLimit: 100_000_000, modulePreload: false } });
let html = readFileSync(join(out, "index.html"), "utf8");
const assets = readdirSync(join(out, "assets"));
for (const f of assets) {
  const content = readFileSync(join(out, "assets", f), "utf8");
  if (f.endsWith(".js")) {
    const safe = content.replace(/<\/script/gi, "<\\/script");
    html = html.replace(new RegExp(`<script[^>]*src="\\./assets/${f.replace(/\./g, "\\.")}"[^>]*></script>`), () => `<script type="module">${safe}</script>`);
  } else if (f.endsWith(".css")) {
    html = html.replace(new RegExp(`<link[^>]*href="\\./assets/${f.replace(/\./g, "\\.")}"[^>]*>`), () => `<style>${content}</style>`);
  }
}
if (/src="\.\/assets|href="\.\/assets/.test(html)) throw new Error("some assets were not inlined");
mkdirSync("dist-single", { recursive: true });
writeFileSync("dist-single/last-candle.html", html);
console.log(`dist-single/last-candle.html  ${(html.length / 1024 / 1024).toFixed(2)} MB`);
