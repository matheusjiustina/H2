# Publishing AGROWINGS in the browser

**Build:** `npm run build` → one self-contained `dist/index.html` (vite-plugin-singlefile): about 1.8 MB raw,
590 KB gzip, 442 KB brotli. The `?bench` instrumentation and every module are inside it; nothing is fetched at run time.

## Recommended hosting settings
| Item | Recommendation | Why |
|---|---|---|
| Compression | Brotli (fallback gzip) for `text/html` | 1.8 MB → 442 KB; most static hosts (Vercel, Netlify, Cloudflare Pages) do this by default — verify with `curl -H 'Accept-Encoding: br' -I` |
| HTML cache | `Cache-Control: no-cache` (revalidate every load, ETag) | The whole game is the HTML file: a new release is picked up on the next visit, no stale half-updated bundle |
| If assets are split later | content-hashed file names + `Cache-Control: public, max-age=31536000, immutable`; HTML stays `no-cache` | safe long caching |
| CDN | Any edge CDN in front of the single file (Cloudflare / Vercel edge) | one file, big win for first load; no separate asset CDN needed |
| Security headers | `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`; do not add `Cross-Origin-Embedder-Policy` (no SharedArrayBuffer used) | |
| HTTPS | Required: Web Audio, Wake Lock and `DeviceOrientation` permission need a secure context | |
| Service worker | **Not enabled.** A future installable PWA should cache only the HTML shell and static code, never `localStorage` data, accounts or entitlement responses | no sensitive data in caches; progress stays in `localStorage` |

## Updates and saved progress
Progress, settings and the premium entitlement hook live in `localStorage` / the platform; a new release replaces only
code. Settings keys are additive with defaults (old saves migrate: `profile`, `fpsLimit`, `autoLast`, `tiltSens`),
so a returning player's progress, aircraft unlocks and accounts are unchanged. Before publishing a release that changes
a saved structure, add a migration and a test in the style of `test/perfmanager.test.mjs`.

## Loading
Time to first frame is dominated by building the procedural world and ten aircraft (≈ 12 s in the software-rendered
test container; a real GPU / phone must be measured). Splitting the bundle (benchmark tool, aircraft built on first
use) is possible later but changes the single-file build; keep it out of a release unless measured on real devices.
