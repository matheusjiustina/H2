# AGROWINGS Adaptive Performance System — final validation (phase 8)

Reference ("original"): commit `2fe3dd3` = the v73 game (tag `ultra-original-v73`, commit `aa84723`) plus only the
benchmark instrumentation (`src/core/bench.js`); no rendering code differs. "Optimised": branch `perf/fase-8`.

**Environment of every measurement below:** Chromium 1194 headless, **software renderer (SwiftShader, CPU)**, 1280×720,
`?q=high` (Ultra Original pinned, adaptive controller frozen), Linux container. Draw calls, triangles, node counts and
pixel differences are exact and hardware-independent; **frame times here are not GPU figures** (7–20 s per frame) and are
not used to claim any FPS. No real GPU, phone, Safari, Firefox or Edge was available.

## Before / after (same scenes, same camera, same conditions)
| Measure | Original | Optimised |
|---|---|---|
| Draw calls, low pass over crop | 540 | 473 (−12 %) |
| 250 m high | 443 | 392 (−12 %) |
| Cockpit, low | 521 | 450 (−14 %) |
| Strip approach | 909 | 690 (−24 %) |
| Bench A hangar / B take-off / C low pass / J switching (calls) | 916 / 912 / 498 / 909 | 750 / 747 / 429 / 823 |
| Scene nodes | 13.8 k | 6.0–6.7 k |
| Scene matrix update (JS, per frame) | 2.7–3.3 ms | 0.2–0.5 ms |
| Triangles (same views) | 3.345 / 0.744 / 3.351 / 4.688 M | 3.376 / 0.782 / 3.385 / 4.689 M (+1…5 %: merged regions cull coarser) |
| Terrain resident (CPU buffers) | 35.3 MB | 13.3 MB (finest level streamed) |
| Game-logic CPU per tick (phase 6 profile) | 1.64 ms cruise / 2.26 ms spraying | 0.80 / 1.49 ms |
| Page load → first frames (software GPU) | 55.8, 56.1 s | 55.9, 51.5 s (unchanged within noise) |
| JS heap after boot | 550 MB | 557–573 MB (+ ≈ 45 MB baked parked aircraft, phase 4) |
| GPU geometries / textures after cycling all 10 aircraft twice | 1543 / 190 | 998 / 110 |
| Physics, 28 scenarios (take-off, landing, heli, spray) | reference | **identical** (`test/golden.test.mjs`) |

## Ultra Original visual check (original vs final, 7 deterministic views, `?q=high`)
pixels differing by > 8/255: aerial 0.0004 %, sunward 0.0004 %, hangar interior 0 %, hangar 0.016 %, apron 0.018 %,
truck bay 0.006 %, field 0.069 % (crop-plant speckle; same-build noise on this view is larger). Draw calls differ, geometry,
materials, ranges and quality values do not (`src/config.js` is byte-identical to v73).

## Regression suites on the final build
`npm test` 184/184 (physics golden, i18n, streaming, assets, controller, …) · `e2e` full mission · `farmflow` 15/15 (secondary farms,
replay, history, untranslated text) · `fleetswitch` 180 switches, 0 hidden · `at802e2e` 13/13 (premium lock re-applies) ·
`e2e_ui` 22/22 · mobile emulation (phase 7): modes, permission, lifecycle, WebGL context loss, 5 layouts, 0 overlaps.

## Untouched since v73 (git diff empty)
`src/flight/*`, `src/spray/*`, `src/config.js`, `src/world/layout.js`, `src/aircraft/types.js`,
`src/game/career.js`, `src/game/expansions.js` — physics, quality presets, farm layout, saves, accounts and unlocks.

## Device matrix
| Device / browser | Profiles | Status |
|---|---|---|
| A. Powerful PC, Chrome / Edge, real GPU | Ultra Original | **Not tested** (no GPU here); expected 60+ FPS is unverified |
| B. Mid PC | High, Medium | **Not tested** |
| C. Basic laptop | Medium, Economy | **Not tested** |
| D. Mid Android, Chrome | Auto, Economy | **Not tested** (Chromium mobile *emulation* only: layout, tilt, lifecycle pass) |
| E. iPhone, Safari | Auto, Economy | **Not tested** (no WebKit); code paths for iOS motion permission, `webkitAudioContext`, interrupted audio, gesture blocking exist but are unverified on a device |
| Chromium on Linux, software GPU (container) | Ultra, Economy (auto) | **Compatible with limitations**: runs and passes every functional test; ~5–20 s per frame, so not playable — only proves correctness |
Nothing above is a compatibility claim beyond the evidence in the last row. Targets (60 / 45–60 / 30 FPS) are open until measured on real devices with `?bench` (README → Benchmark).

## Fixed during the project
Draw-call and per-frame CPU waste (phases 3, 4, 5, 6), no handling of background / orientation / WebGL context loss /
audio interruption (phase 7), overlapping controls in portrait and short landscape (phase 7), tilt without sensor
or sensitivity (phase 7), unreproducible physics baseline (phase 6 seeded test) → continuous `golden.test.mjs` (phase 8).

## Known issues / not done
* No real-device measurements (above). Auto quality, particle limits and the "High" profile trims are calibrated by construction, not on a GPU.
* The stall wobble in `flightModel.js` uses `Math.random` shared with visual spawns: stall trajectories are not exactly reproducible (pre-existing; not changed).
* Audio nodes: ≈ 37 short-lived nodes per aircraft switch are created and left to the browser; no growth of the persistent graph was seen, but live-node counts were not instrumented.
* Parked-aircraft baking adds ≈ 45 MB of JS-side buffers; the helicopters' windshield order is kept (transparent parts excluded).
* Manual Ultra Original on a phone is unrestricted by design; weak phones should use Auto / Economy.
* Single-file build: no split caching of code vs data; PWA / service worker deliberately not enabled (see `docs/DEPLOY.md`).
* Per the brief the project is **not declared ready for public launch**: there is no failure known in the tested paths, but the target devices have not been measured.
