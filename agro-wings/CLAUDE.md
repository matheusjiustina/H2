# AGROWINGS — permanent development & performance policy

Every new aircraft, cockpit, scenery, system or effect follows the optimisation and stability
architecture built in phases 1–5 (README: "Memory at start-up", "Adaptive Performance System",
"World optimisation engine", "Aircraft performance engine", "Browser stability"). Phase 6 is
reserved for the full audit and final release validation.

**Absolute rule: no new feature may compromise smoothness, stability or compatibility.**

## Rules for every change
1. Reuse existing systems (assetManager / aircraftMemory, perfProfiles + adaptive, worldStreaming,
   LRU caches in `src/world/lru.js`, safeStore, diagnostics, lifecycle) instead of new parallel ones.
2. Build heavy resources only when needed (parked aircraft stay light shells; cockpits are prepared
   after selection; world cells stream).
3. Do not keep geometries, textures, canvases or processes that nothing draws or uses.
4. Respect the LOW / MEDIUM / HIGH / ULTRA profiles (`src/core/perfProfiles.js`, `QUALITY` in config).
5. Ultra Original stays visually identical — never reduce it silently.
6. Physics, controls and gameplay are identical in every profile; never change physics to gain FPS.
7. Use LOD, instancing and progressive loading where they actually pay off.
8. Avoid memory peaks, extra draw calls and redundant per-frame updates (time-budget heavy builds).
9. Keep desktop and mobile browsers working (touch modes, tilt fallback, lifecycle, WebGL loss).
10. Measure every change: FPS / frame time (p95, p99), JS heap (peak and settled), GPU geometries /
    textures, draw calls / triangles, load time.
11. Compare with the previous stable version; fix regressions before publishing.
12. Keep a reversible checkpoint (commit / worktree of the stable build) before important changes.

If a new feature costs too much, optimise it before it goes in. Never remove existing features or
change systems without need. Payments, accounts, purchase validation and premium access rules are
never touched by performance work.

## How to measure (Chromium + SwiftShader in the cloud container: counts / memory exact, ms are CPU)
- Reference build: `git worktree add <scratch>/wt_before <stable-commit>`, serve it with
  `npx vite --port 5176` next to the working copy on 5173 (never edit `src/` while a browser test
  runs against 5173 — HMR reloads the page).
- Unit tests: `npm test` (all must pass).
- World: `test/worldprobe.mjs` (calls / tris / memory / screenshots per view; seed + clock reset; A/A
  noise depends on load frames — compare runs with equal `framesAtFreeze`), `test/worldhitch.mjs`
  (CPU spikes per subsystem), `test/p3verify.mjs`, `test/p5long.mjs` (long session), `test/worldctx.mjs`.
- Aircraft: `test/p4baseline.mjs` (opening, first flight, cockpit entry, switches, memory per aircraft),
  `test/pa36e2e.mjs` (full gameplay regression).
- Stability: `test/p5stability.mjs` (boot, saves, lifecycle, fail-safe, WebGL loss, resize).
- In-game: open with `?diag`, Ctrl+Shift+D for the diagnostics panel.

## Delivery
- Reports to the user in Portuguese, with measured numbers only; say what was not tested
  (real phones, Safari / Firefox, real GPUs are not available in the container).
- Commit and push to both `claude/determined-keller-5pt4tw` and `feat/fireboss-gear`; do not commit
  `.claude/` or ad-hoc probes; no model identifiers in code or commits.
- Publish the artifact (build → `tools_publish.py` → same artifact URL, next version) only when the
  tests show no regression.
