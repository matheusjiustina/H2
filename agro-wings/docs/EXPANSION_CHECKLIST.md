# Checklist for every new aircraft, farm, strip or crop (mandatory)

A feature is **not ready** if it causes a serious visual regression, a persistent leak, a change in existing
physics, any damage to saved progress, a broken mobile interface, or a relevant performance drop without a
written justification. Each item below names the file or test that enforces or measures it.

## New aircraft (aeroplane or helicopter)
1. **Registry.** Add it to `src/aircraft/types.js` (`AIRCRAFT_TYPES`, `AIRCRAFT_ORDER`) with flight config, `bounds`, `camera`,
   `audio`, `loads`, `service`, `parkSpot` — nothing hard-coded elsewhere. Premium aircraft carry `premium: <expansion id>`
   (`src/game/expansions.js`); never add purchase or unlock code with it.
2. **Own physics, untouched neighbours.** Own flight config / model branch. Existing aircraft traces must stay identical:
   `npm test` runs `test/golden.test.mjs` (28 scenarios vs `test/golden/physics.json`). Add the new type's scenarios to
   `test/p6golden.mjs`, regenerate the reference, and review the diff: only the new keys may appear.
   `golden.test.mjs` fails if a registered type has no scenario.
3. **Resources.** Build the model with the existing helpers (shared materials, `mergeGeometries`, instanced props, texture
   atlases/canvases from `src/core/textures.js`). Reuse textures between liveries; do not create a canvas per frame; no
   per-frame allocations in `update`.
4. **Memory management.** It is registered automatically by `src/aircraft/assetManager.js` (parked aircraft are baked to one
   mesh per opaque material, cockpit/pilot GPU copies released). Check with `node test/p4audit.mjs` (per-aircraft nodes,
   geometries, textures, MB) and `node test/p4verify.mjs <dir> all` (frozen vs original pixel diff must be ≤ noise;
   resources must not grow when switching aircraft repeatedly). Transparent parts stay out of the bake by design.
5. **Distance representations.** Parked: baked mesh + the existing 1.2 km cull. Detail meshes of animated parts follow
   `vehicleLod`-style distance rules; the cockpit and pilot are separate groups hidden when not in use
   (`model.cockpit`, `model.pilot`).
6. **Graphics profiles.** Everything quality-dependent reads `game.quality` / `PROFILES` (`src/core/perfProfiles.js`); the
   Ultra Original look is the reference and must not be reduced. Test the new aircraft at Economy, Medium, High, Ultra and Auto.
7. **Mobile.** Touch layout must keep every control visible: `node test/p7mobile.mjs <dir> layout` (0 overlaps, centre free).
8. **Benchmark.** Run `?bench&q=high` (or `node test/bench.mjs out.json high 10`) before and after; compare with
   `node test/benchcompare.mjs before.json after.json`. Same device, browser, window size and profile only.
9. **Lifecycle.** No new `window` / `document` listeners without removal; no new timers or loops (the game has exactly one
   animation loop). `node test/p5long.mjs` keeps the listener count flat.
10. **Persistence.** New settings are additive keys with defaults; never rename or reuse a saved key
    (`src/game/game.js` settings, `src/game/career.js`). Old saves must load (`test/perfmanager.test.mjs` shows the pattern).
11. **Text.** Every `t()` string needs a Portuguese entry (`npm test` → `i18n.test.mjs`).

## New farm / strip / field / crop
- Data only in `src/world/layout.js` (sites, strips, fields, roads) — never edit existing positions.
- Streaming is automatic (`src/world/worldStreaming.js`): forest cells and the finest terrain level follow the camera,
  the flight path, the current strip and the active contract. Verify with `node test/p5verify.mjs <dir>`
  (streamed vs everything resident must be pixel-identical, 0 missing cells / chunks) and `node test/p5long.mjs`.
- Roads and crop canopy/edges merge per region automatically; keep fields rectangular and registered in `FIELDS`.
- Collision and ground type must come from data (`terrainData.surfaceAt`, `obstacleAt`), never from a rendered mesh.
- Run `test/terrain.test.mjs`, `test/farms.test.mjs` and the farm flow (`node test/farmflow.mjs`).

## Release gate (all must pass)
`npm test` · `npm run build` · `node test/e2e.mjs` · `node test/farmflow.mjs` · `node test/fleetswitch.mjs` ·
`node test/p7mobile.mjs <dir> all` · Ultra pixel comparison against the previous release (`test/envviews.mjs`).
