# Stock Garden 🌱

**Pick a stock. Plant it. Grow it. Harvest it.**

A tiny, polished casual web game: a futuristic miniature greenhouse (Wall Street × greenhouse × cozy game) where you plant stock-themed seeds, watch them grow through five visual stages and harvest them into the Harvest Vault.

> Stock Garden is a game experience. References to stocks or tickers are used as gameplay themes and do not represent ownership of real securities or financial returns.

## Run it

```bash
cd stock-garden
npm install
npm run dev       # http://localhost:5173
npm run build     # static build in dist/ (relative paths, host anywhere)
npm run preview   # serve the production build
```

No backend. Progress (what's planted where, and the vault) is saved in `localStorage`.

## The loop

`SELECT STOCK → PLANT → GROW → HARVEST → COLLECT → PLANT AGAIN`

- Tap an empty plot → pick one of 6 stocks (NVDA, AAPL, TSLA, AMZN, GOOGL, PONS).
- A seed capsule drops, lands with a small impact and sinks into the soil.
- Growth takes **24 seconds**: Seed → Sprout (4s) → Growing (10s) → Mature (16s) → Ready (24s).
- Tap a ready plant: micro zoom, burst, a `[TICKER]` coin rises and flies into the Vault.
- Tap the Vault (3D silo or the HUD button) to see what you harvested.

Each stock has its own plant, built from primitives and animated part by part (no simple scaling):

| Stock | Plant | Signature |
| --- | --- | --- |
| NVDA | Circuit Fern | Angular leaves with light running through circuit veins, glowing chip crown, orbiting data cubes |
| AAPL | Pearl Orchard | Silver S-curve trunk, soft pearl canopy, glossy minimalist fruit, quiet halo |
| TSLA | Voltage Vine | Zig-zag graphite trunk, energy pulses, copper coil crown with crackling arcs |
| AMZN | Cargo Bush | Sturdy trunk, broad canopy, swinging parcels with light bands |
| GOOGL | Spectrum Bloom | Four-colour leaves, blooming flower, orbiting orbs |
| PONS | Aurum Crystal | Gold stem, violet crystal shards, floating iridescent gem (the rare one) |

## Project structure

```
src/
  main.js                 Boot: intro → world → UI
  config/
    stocks.js             The 6 stocks (colours only — no stats)
    game.js               Growth timings, layout, storage key
  core/
    store.js              Game state + events (plant / harvest)
    tween.js, events.js   Tiny timeline + emitter
  services/
    persistence.js        localStorage adapter (swap for a backend later)
    audio.js              Sound hooks — every cue is already called, no audio shipped
  world/                  Three.js scene
    stage.js              Renderer, diorama camera (auto-framing), loop, picking
    environment.js        Platform, pipes, irrigation, ticker board, drone, decor
    plot.js, vault.js     Planter beds and the Harvest Vault silo
    fx.js, particles.js   Rings, beams, flashes, seed drop, harvest coin, GPU particles
    bake.js               Merges static decor into a few draw calls
    textures.js           Procedural canvas textures (no image assets)
  plants/                 One builder per stock + the PlantRig animation system
  ui/                     HUD, picker, vault panel, markers, intro (plain DOM + CSS)
  game/controller.js      Glue: input → store → 3D + UI, all the juicy sequences
```

### Tuning

- Growth speed: `GROWTH.stageStarts` in `src/config/game.js`.
- Add a stock: add an entry in `src/config/stocks.js`, a builder in `src/plants/`, an icon in `src/ui/icons.js`.

### Ready for later (not implemented on purpose)

The store emits `plant` and `harvest` events and persists through an adapter, so wallet / NFT / backend / leaderboard / rewards can be added as services that subscribe to those events — without touching gameplay code:

```js
store.on('harvest', ({ stockId, total }) => api.recordHarvest(stockId));
```

Sounds: `sfx.register('harvest', '/sfx/harvest.mp3'); sfx.enable();` (see `src/services/audio.js` for all cue names).

## Performance notes

- One directional shadow light, shadow map refreshed every other frame.
- Static decor merged per material (~170 meshes → ~25 draw calls).
- All particles live in two pooled `THREE.Points` (one draw call each); ambient motes animate on the GPU.
- Invisible (not yet grown) plant parts are skipped entirely.
- Pixel ratio capped (1.6 on touch devices) and lowered automatically if the frame rate drops.
- UI is DOM + CSS transforms/opacity only.
