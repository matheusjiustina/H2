# AGRO WINGS

Agricultural aviation on a Mato Grosso farm (Fazenda Boa Esperança, fictional).
Three.js + Vite, everything procedural (no external assets), built into a
single self-contained `dist/index.html`.

Three aircraft share the world and are chosen on the title screen:
**AIRCRAFT 01 · Original** — the EMB-202A Ipanema (PR-AGW),
**AIRCRAFT 02 · Air Tractor** — an AT-502B turboprop (PR-AWT), and
**AIRCRAFT 03 · Robinson R44** — an R44 Raven II helicopter in an
agricultural configuration (PR-AGH, "Rotary-Wing Agricultural Aircraft").
The airplanes not selected wait parked on the west apron; the helicopter
waits on its own pad at the east end of the apron.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/index.html (single file)
npm test           # flight (all three aircraft) + spray validation (Node)
```

URL option: `?q=low|medium|high` forces a graphics preset (otherwise the
first run measures the frame time on the title screen and steps the preset
down or up once; a manual choice in Settings turns that off).

Settings → Environment: time of day (dawn, morning, midday, golden hour,
dusk) and weather (clear, partly cloudy, overcast, light rain, morning mist).
Weather and time of day are visual and audio only — the flight model's wind
is the Wind setting, as before. Settings → Cockpit shake: off / low / normal.

## Gameplay loop

Service orders (9 contracts on three terrain levels) → load sheet (fuel / application liquid) → the
badeco services the aircraft on the pad → engine start → taxi → take-off →
spray passes → return → landing → taxi to the pad → shut down → results and
payment in Cr$ → next order. Partial work can be handed in; landing for a
reload keeps the coverage (also saved in `localStorage`). Free flight mode
starts on the pad or airborne.

Contracts (`src/game/contracts.js`):

| id | Talhão | Crop | Area | Challenge |
| --- | --- | --- | --- | --- |
| soy | T-07 | soybean 0.8 m | 18.4 ha | wide, flat, beside the strip — learn the circuit |
| corn | T-12 | corn 2.4 m | 16.1 ha | tall canopy on a swell, tree line along the south edge, power line past the east end |
| cotton | T-03A + T-03B | cotton 1.2 m | 13.8 ha | two fields split by the creek — valve off over the gap |
| roll-soy | T-31A + T-31B | soybean 0.8 m | 19.5 ha | level 2: 25 m of relief in the south-east swells, stepped boundary |
| roll-corn | T-32A + T-32B | corn 2.4 m | 19.8 ha | level 2: tall canopy over a swell, the longest ferry (4.2 km) |
| roll-cotton | T-33A + T-33B | cotton 1.2 m | 19.1 ha | level 2: 30 m of relief on the north-west plateau edge |
| ridge-soy | T-41A + T-41B | soybean 0.8 m | 16.1 ha | level 3: ridge flank, steepest field (mean 4.5°, max 7°) |
| ridge-cotton | T-42A + T-42B | cotton 1.2 m | 16.1 ha | level 3: 37 m of relief across the talhão |
| ridge-corn | T-43A + T-43B | corn 2.4 m | 15.8 ha | level 3: tall corn over a hill, forest along the south edge |

The order board groups them by terrain level (Level 1 · Flat farmland,
Level 2 · Rolling fields, Level 3 · Hilly agricultural fields); each card
shows the distance from the base and, for levels 2–3, the relief and the
steepest slope measured on the terrain itself. See *Terrain relief and
advanced missions* below.

Evaluation: useful coverage (dose ≥ 0.7 of target), uniformity (1 − CV of
dose), gaps, overlap (dose > 1.5), waste (off-target + drift/evaporation +
over-application) and aircraft condition (repairs).

## Controls

Flight keys come in two schemes for every aircraft — Settings → Flying →
**Flight keys** picks one (the choice is saved; the default is the numpad
scheme). Everything else is the same in both.

| Action | Numpad scheme (default) | Classic scheme (Tidemark layout) |
| --- | --- | --- |
| Stick forward / back (R44: cyclic) | Num 8 / Num 5 | W / S (↑ ↓) |
| Roll left / right (R44: cyclic) | Num 4 / Num 6 | A / D (← →) — also steer on the ground |
| Rudder left / right (R44: pedals) | Q / E | Z / X |

| Action | Keys (both schemes) |
| --- | --- |
| Engine | hold F to start, tap F to stop |
| Power (R44: collective) | Shift / Ctrl (R raises too), mouse wheel |
| Brakes (differential with rudder) | Space |
| Flaps | G (up) / B (down) |
| Trim (nose up / down) | ] / [ (Page Up / Page Down) — with the assist on it sets the climb or descent the aircraft holds hands-off |
| Spray valve | C (Enter) |
| Cockpit / chase | V |
| Free external camera | O |
| Pilot's eye higher / lower (taller or shorter pilot, cockpit view) | Shift + ↑ / Shift + ↓ |
| Service / interact | E |
| Map / coverage overlay / contracts | M / K / J |
| Minimap: farm map ↔ GPS guidance page | N (or click the minimap) |
| Reset aircraft | Backspace |
| Speed up ground service | hold T |

In the numpad scheme Q and E are the rudder; E is also the service key,
which only acts at the pad with the engine off, where the rudder does
nothing. The two schemes are separate sets of bindings, so rebinding a
numpad key never takes a key away from the classic ones, and the other way
round. (Bindings saved earlier with the engine on Q and power-down on F are
moved to the new defaults.)

All bindings are rebindable in Settings. Mouse: left-drag looks, right-drag
is a virtual stick. Gamepad: left stick, triggers = power, bumpers = rudder,
A = spray, B = brakes. Touch devices get a stick, a power slider and buttons.

## Flight model

`src/flight/flightModel.js` is a port of the Tidemark floatplane model: same
lift/drag/stall blending, stability derivatives, prop wash on the tail,
engine torque and p-factor, ground effect and gyroscopic terms, and the same
assist control law (`src/flight/assist.js`, modes off / normal / high) and
input shaping rates. Changes for an agricultural taildragger:

- spring/damper main gear and steerable tailwheel, rolling resistance per
  surface, brakes (differential with rudder), small ground irregularities;
- engine: Lycoming IO-540 on ethanol as on the EMB-202A, 320 hp (the
  alcohol engine gives ~7 % more than the 300 hp avgas one); fixed climb-pitch
  prop: static thrust fades toward pitch speed, windmill drag at idle (gives
  a real glide). Measured: ~990 ft/min at 1,800 kg and 70 kt (published
  930 ft/min for the 300 hp engine), ~124 kt top speed (published 121 kt);
- stall-warning vane: the horn sounds ~4° before the critical angle, so a
  hard pull or an over-steep loaded turn is heard before the wing quits;
- fuel burn and starvation; crop-canopy drag and crop strikes.

- mass, inertia and CG change with fuel and hopper load; MTOW 1,800 kg as on
  the EMB-202 (the load sheet warns above it and shows the steepest bank
  the wing can hold level at 90 kt for that load);
- stalled in a turn, the slower inner wing drops and roll damping is lost.

The simulation runs at a fixed 120 Hz with an accumulator and render
interpolation. All tuning values live in `src/config.js`.

### Assist and the balão

`src/flight/assist.js` (mode *normal*) is tuned for agricultural flying:

- rate command with expo: fine control near centre, full stick rolls
  ~75°/s and pitches ~26°/s; no bank limit below 80° while the stick is held.
  The elevator gets a feed-forward of what the commanded pitch rate needs
  (the pitch damping), the way a pilot's hand moves the stick at once: full
  back stick reaches the commanded rate in ~0.3 s and ~1.9 g in 0.5 s at
  90 kt (before, the loop only reached ~75 % of the rate and the g took over
  a second, which made pull-outs from the balão feel heavy);
- a hard pull (stick past half, the pull-out from the balão's dive) also
  turns the nose with the flight path's own rotation, so the angle of
  attack, and with it the g, keeps building up to the protected limit
  instead of the path catching up with a fixed pitch rate. This applies
  only while descending.
- from level or climbing flight a full pull is now progressive: ~19°/s
  (26°/s before, still available in a dive).
  - Holding the key for 2 s at 100 kt with the Ipanema loaded now ends
    32° nose up with the stall horn on for 0.6 s (before: 37° and 1.2 s).
  - On the keyboard a pull reaches full travel in 0.4 s; pushes and
    releases are unchanged.
- turns: the pull leads the bank by ~0.3 s of roll rate, and a g error adds
  pitch rate, so the load a steep turn needs arrives within ~0.5 s.
  - Before, rolling into 60° at 15 m the aircraft sank ~4 m/s before the g
    came, lost ~10 m, and the low wingtip went into the crop.
  - Now a 180° turn back from 15 m with a load (`lowTurn` in the harness)
    loses about this much height:

    | Aircraft | 45° bank | 60° bank |
    |---|---|---|
    | Ipanema, 560 L | 0 m | 4.6 m |
    | AT-502B, 1,180 L | 0.7 m | 4.3 m |

  - A level 70° turn with a full AT is beyond its wing (2.9 g needed,
    ~2.4 g available): it has to climb, as in the balão.
  - Measured with the same input ramp before and after, in a 20° dive at
    ~100 kt:

    | Ipanema load | g after 0.6 s, before | Now |
    |---|---|---|
    | Empty | 2.4 g | 2.85 g |
    | 450 L | 2.1 g | 2.2 g |

    With the faster keyboard pull the empty aircraft reaches 3.3 g after
    0.6 s.
- the stall and g limits close in continuously as the margin shrinks, and
  at the limit the nose turns with the path, holding the angle of attack or
  the g. Before:
  - at the angle-of-attack limit the nose was stopped outright, so the
    alpha fell away and came back, and the elevator chattered between full
    up and half down (11–24 jumps per pull-out with a load);
  - the alpha prediction looked 0.3 s ahead, which slowed the last part of
    every hard pull.

  The protected angle is now 1.0° under the critical one (1.4° before).
- stick released: flight-path hold. In a bank the assist asks for the load
  factor n = cos γ / cos φ that keeps the climb or descent, but never more
  than the wing can give at that speed and weight. Beyond that the nose
  falls and the aircraft descends — the real energy trade of a steep turn.
  A level turn settles at the bank the wing can sustain; a climbing aircraft
  (top of the balão) keeps up to 75°; a held climb flattens as speed bleeds;
- trim with the assist on moves that held flight path, about 3° per second
  on the key (a fly-by-wire trim; an elevator offset alone was cancelled by
  the hold loop within a second, so the trim barely did anything): two
  seconds of nose-up trim at 90 kt give a 4.4 m/s climb that stays
  hands-off, two seconds nose-down a 5.9 m/s descent. A HUD badge shows the
  trimmed path while it is set. The stall, low-speed and near-ground
  protections still apply. With the assist off (or on the ground) the trim
  is the elevator tab as before;
- stall protection anticipates the alpha trend (0.12 s ahead) and the path
  rotation (α̇ = q − γ̇), g protection at +3.8 / −1 g.

The balão at the end of each pass is flown as in the field: valve off, pull
up (~2.2–2.5 g, +25–40 m), turn ~45° away, bank 60–75° back toward the next
swath at the slow top, let the nose fall and dive back to 3 m. The HUD's
LOAD readout shows the g. Measured with the test pilot (`npm test`): 60°
bank in 1.1 s, 45° turns hold height within ~7 m, a balão with 560 L tops
out ~29 m above the pass and ends above it, never stalling.

**The whole balão near the ground.** `balaoDive` in `test/harness.mjs` flies
the balão with keyboard-shaped inputs over the real terrain (the table was
measured with the 0.2 s pull; with the final 0.4 s pull the Ipanema 560 L
20°/18 m case touches again, the AT 1,000 L 20°/18 m one clears by 1.6 m):

1. a pass at 3 m;
2. a full pull to 25° nose up;
3. a 65° bank and ~150° of turn;
4. a dive back at 14° or 20°;
5. a full pull once the wheels are 14–20 m up.

Lowest wheel height after the pull-out:

| Aircraft, load | Dive, pull height | Before | Now |
|---|---|---|---|
| Ipanema, 560 L (MTOW) | 14°, 14 m | 4.9 m | 6.0 m |
| Ipanema, 560 L | 20°, 20 m | 1.2 m | 2.4 m |
| Ipanema, 560 L | 20°, 18 m | hit | 0.4 m |
| Ipanema, 300 L | 20°, 14 m | hit | 0.7 m |
| AT-502B, 1,000 L | 14°, 14 m | 1.9 m | 3.5 m |
| AT-502B, 1,000 L | 20°, 18 m | hit | 2.4 m |
| AT-502B, 600 L | 20°, 14 m | hit | hit |

The last row is the wing's limit: 20 m/s of sink at 124 kt, 14 m up. With
the contracts' loads (Ipanema 560 L at its MTOW, AT 1,180 L at ~81 % of
its MTOW), the AT recovers higher from a 20° dive than the Ipanema: 2.1 m
against 0.4 m pulled at 18 m. Its power also takes it higher in the
pull-up. In a 14° dive the slower Ipanema bottoms out higher (6.0 m against
3.4 m).

The wings were left as published. The Ipanema stalls at ~59 kt at its
MTOW; the AT at 71 kt flaps up at 8,000 lb (82 mph on Air Tractor's sheet).
So a loaded pull-out is limited by the wing:

- Ipanema at its MTOW, 100 kt: ~2.7 g.
- AT with 1,000 L, 120 kt: ~2.9 g.

A stronger elevator on the AT was tried and changed nothing for that
reason.

### Crash recovery and the service truck

- **After a crash the panel offers two choices:** back to the runway, or
  back to the base (the R44 always goes to its pad). Either way the
  aircraft comes back repaired as new, with the hopper empty. The truck
  returns to its bay, and the badeco and the hoses are put back. The
  recovery cost is charged at the crash.
- **Esc no longer dismisses the crash panel.** If the panel is gone,
  Backspace brings it back.
- **The pause menu's reset after a crash also repairs.** Before, it put the
  aircraft back with 100 % damage, so it failed again at once ("Structural
  failure") and the engine would not start.
- **The engine may start once the badeco has finished,** with the truck
  still alongside or driving off.
- **The truck's route planner now knows the small props.** These are the
  pad's corner tyres, the drums by the mixing station and the
  extinguisher stand at the fuel slab. It used to drive over them; it now
  backs out and returns around them.
  - Measured with `test/truck.mjs`, all three aircraft: the truck arrives,
    services, and is back in its bay.
  - Closest approach to the aircraft: ≥ 0.5 m.

### Language

The game starts in **Portuguese (Brazil)**; **English** is the second
option.

- **Choosing:** two small flags (Brazil / United States) at the top right
  of the title screen switch the language. The page reloads in the chosen
  one.
- **Where the choice lives:** it is kept in `localStorage`
  (`agrowings.lang`). `?lang=en` or `?lang=pt` on the URL overrides it.
- **How it works** (`src/i18n/`):
  - The English text in the code is the key, and `t(en, ...args)` returns
    the Portuguese for it, with `{0}`, `{1}`… filled in.
  - The dictionaries are split by area: `pt-ui.js` (screens, HUD, touch),
    `pt-game.js` (game, aircraft, key actions, crash reasons), `pt-jobs.js`
    (contracts, tutorial, crops) and `pt-crew.js` (badeco and truck
    messages, time of day, weather).
  - Module-level data with visible text (contract titles, aircraft labels,
    key-action labels) uses getters, so it always shows in the current
    language.
  - Crash reasons stay in English inside the simulation and are translated
    where they are shown.
- **Missing translations:** any key asked for in Portuguese without an
  entry is collected in `window.__i18nMisses`. A browser tour of the title,
  settings, controls, contracts, load sheet, flight HUD, pause and crash
  screens found none.
- **Tests:** Node tests run in English (no `location`). `test/keys.mjs`
  loads with `?lang=en` because it checks the English key labels. The other
  browser runs use the Portuguese default.

## Tests

`npm test` runs `test/flight.test.mjs` (PR-AGW, incl. the trim),
`test/at502.test.mjs` (AT-502B), `test/r44.test.mjs` (R44, detailed rotor
model), `test/r44power.test.mjs` (R44, power model), `test/spray.test.mjs`,
`test/terrain.test.mjs` (relief, flat core, zones, fields, roads) and
`test/input.test.mjs` (key bindings) (Node).
Browser checks (need `npm run build && npx vite preview --port 4173`):

- `node test/e2e.mjs soy out/` — full contract flown by the test autopilot
  (`src/game/autopilot.js`) through the normal player inputs only (any
  contract id: `roll-soy`, `ridge-soy`, …);
- `node test/terrainviews.mjs out/ '<views>'` — terrain look-dev renders
  from the air and the ground (point AGRO_URL at two builds to compare);
- `node test/keys.mjs out/` — the numpad and classic key schemes with real
  key codes on all three aircraft (stick, roll, rudder, power, engine
  hold/tap), the HUD / Controls / Settings screens and rebinding;
- `node test/e2e_ui.mjs out/` — service interruption, crash + recovery,
  stuck reset, key rebinding, tutorial, mobile layout;
- `node test/perf.mjs` — per-view tick/render time, draw calls, triangles;
- `node test/profile.mjs <low|medium|high> <ipanema|at502|r44>` — load time,
  GPU object counts, JS heap, tick and frame avg/p95/p99 per view;
- `node test/envviews.mjs out/ [times] [weathers] [views]` — renders per
  time of day × weather; `node test/atmo_transition.mjs` — gradual blends;
- `node test/truck.mjs out/ [dx dz headingDeg]` — service truck cycle with
  timings, closest approach to the aircraft and loads;
- `node test/gpsview.mjs out/` — HUD GPS page and the cockpit unit;
- `AC=r44 node test/e2e.mjs soy out/` — the contract flown by the
  helicopter test autopilot (`src/game/heliAutopilot.js`);
  `node test/r44flight.mjs out/` — the R44 picked on the title screen and
  flown with the keyboard (start, spool-up, lift-off, hover, pedal turn,
  forward flight) with screenshots; `AC=r44 node test/truck.mjs out/ dx dz
  hdg` — service at the helipad.

### Measured in this container (Chromium + SwiftShader, 1280×720)

The container has no GPU, so render times are only the CPU cost of handing
frames to a software rasteriser and say nothing about real FPS. Game logic
time and scene complexity carry over to real hardware:

| preset | view | logic ms/frame | draw calls | triangles |
| --- | --- | --- | --- | --- |
| low | parked on the pad (chase) | 1.38 | 426 | 668k |
| low | spraying soy at 4 m (chase) | 2.58 | 369 | 574k |
| low | cockpit over corn | 2.60 | 361 | 931k |
| low | 400 m AGL | 2.25 | 327 | 489k |
| medium | spraying soy at 4 m | 4.01 | 379 | 582k |
| medium | cockpit over corn | 3.38 | 378 | 1054k |
| high | parked on the pad | 1.40 | 427 | 696k |
| high | spraying soy at 4 m | 3.91 | 381 | 585k |
| high | cockpit over corn | 3.81 | 378 | 1057k |

The logic column averages only 8 frames and moves by ±1 ms between runs of
the same build. Averaged over 600 frames while flying at spray speed over
pasture and over the soy (grass streaming and crop rows included), a tick
costs 0.6–0.7 ms on both low and high presets, the same as before the
world upgrade (0.5–0.8 ms). The detailed aircraft and world together cost
about 80 draw calls and 130k triangles more than the first build (parked on
the pad: 343 → 426 calls, 541k → 668k triangles).

SwiftShader stalls for 80–110 s on one frame when the spray mist first
appears and once in the 400 m view (no new WebGL program is linked; the
software rasteriser builds its pipelines then). The build before the
aircraft overhaul stalls on the same frames, so they are not a cost of the
new model.

With two aircraft (this build): flying the PR-AGW with the parked AT in
view on the pad costs 459 calls / 721k triangles (low; 435 / 655k before);
views where the parked aircraft is not on screen are unchanged (369 calls
spraying, 361 in the cockpit, 327 at 400 m). Flying the AT: 382 / 370 / 339
calls in those views, +11 to +13 over the PR-AGW. Logic averaged over 600
frames: PR-AGW 0.34–0.70 ms, AT 0.37–0.78 ms (it flies 28 % faster, so
grass cells stream in more often). The parked aircraft is not simulated,
its cockpit and pilot are hidden and it is not drawn beyond 1.2 km.

FPS on a real GPU was not measured here; the in-game counter (Settings →
Show FPS) reports fps, draw calls and triangles live.

### Validation runs (final build)

- `npm test`: 24/24 (flight model incl. braked pivot, aileron authority,
  pitch response, loaded pull-out, steep turns and the balão; spray
  deposition).
- `node test/worldviews.mjs`: world look-dev from the apron, strip, crops,
  forest, creek, HQ, the air, chase and cockpit (before/after compared).
- `node test/e2e_ui.mjs`: 15/15 (badeco service, abort and veto, crash,
  stuck reset, rebinding, tutorial, touch layout).
- `node test/e2e.mjs soy`: full contract in the browser through the player
  inputs — service, taxi, take-off, 12 passes, landing, taxi-in, second
  service, second sortie, 90 % coverage, results and payment.
- Look-dev renders (`test/planeviews.mjs`): livery, stripes, PR-AGW and the
  flag unchanged from every angle; ailerons, flaps, elevator and rudder
  deflect on their hinges; the propeller goes from blades to disc with rpm.
- `REFILL=1 node test/apsim.mjs soy|corn|cotton 4500`: all three contracts in
  Node with the farm-HQ and base colliders, one reload each (560/520/500 L
  loads within MTOW), 90 % coverage, no hard landing, parked at the pad.

Air Tractor expansion (this build):

- `npm test`: 35/35 — the PR-AGW suite unchanged, 10 AT-502B checks
  against published figures, and an AT spray pass (flat 0.88 dose plateau
  over a 30 m swath).
- `AC=at502 node test/e2e.mjs soy`: the whole contract in the browser with
  the AT through the player inputs — crew service (+1,178 L), PT6 start,
  taxi, take-off, passes, landing, taxi-in, park — 90 % in one sortie.
  `node test/e2e.mjs soy` (PR-AGW): two sorties, 90 %, as before.
- `node test/e2e_ui.mjs`: 15/15.
- `AC=at502 REFILL=1 node test/apsim.mjs soy 2400`: 90 % in one load, parked
  at the pad (the Node sim needed a no-op canvas since the world upgrade).
- PR-AGW unchanged: seeded trajectory identical to the previous build;
  model geometry and materials identical (117 meshes, 218,895 vertices).
- Look-dev of the AT from the front, sides, rear, above, under, close-ups
  and the cockpit (`LOOKDEV_VIEWS` + `selectAircraft('at502')`).

## World

The farm core — strip, base, HQ, the original fields, roads and colliders —
is unchanged (`src/world/layout.js`, `terrainData.js`); the outer land got
relief and new fields later (see *Terrain relief and advanced missions*).
Everything below is how the world is drawn, built for perceived realism at
low cost.

- **Trees** (`foliage.js`, `vegetation.js`): every plant is a cloud of
  alpha-tested leaf-cluster cards around a tapered trunk with branches, with
  "spherized" normals so a crown lights as a volume. One procedural 4×4 atlas
  (1024²) holds broadleaf and fine (leguminous) clusters, eucalyptus, ipê in
  bloom, buriti fronds, mango, shrub, two barks and two grass tufts, so each
  variant is one geometry, one material and one instanced draw per 500 m
  cell (two LODs: ~400 tris near, ~50 far). Alpha is boosted with the mip
  level so far crowns stay full. Species: mata/cerrado broadleaves, mango
  shade trees, ipê-amarelo, eucalyptus windbreaks, buriti palms by the
  creek, shrubby forest borders, scrub on road verges, cupinzeiros (termite
  mounds) in the pasture. The original trees and their colliders keep their
  exact positions; the extra detail uses its own random stream.
- **Grass** (`grass.js`): instanced green and dry tufts in 16 m cells
  streamed around the camera on pasture and verges only (2 draws), swaying
  in the wind and shrinking into the ground at the edge of the radius (45 /
  60 / 75 m by preset); off above 120 m.
- **Crops** (`crops.js`): canopy textures with individual plants, closed
  rows and straw in the inter-row; from the air the ground sprayer's
  tramlines (two wheel tracks every 27 m) and the headlands, where rows run
  across and the turning track shows; near the ground the rows under the
  tramlines are missing, so the tracks are real gaps.
- **Ground** (`terrain.js`): olive braquiária with dry patches instead of a
  flat green, muted red latosol, carreadores with wheel tracks and a rank
  verge, farm roads with ruts and grass between them; a tileable
  micro-detail texture (pebbles, dry-soil cracks, grass clumps) adds colour
  break-up and a ~2 cm bump close up and fades out with distance so nothing
  tiles from the air. The strip is compacted laterite with two darker wheel
  tracks, worn turn-arounds, tyre scuffs and grass creeping in at the edges;
  the apron has taxi tracks, a worn pad and oil stains by the fuel tank.
- **Base and farm** (`vehicles.js`, `structures.js`): double-cab support
  pickup with a tank in the bed, cab-over tanker with walkway, rail, domes,
  ladder and valve cabinet, IBC totes and drum pallets at the chemical
  store, an office container, a fire point; at the farm HQ a tractor, a
  combine with its platform and a self-propelled sprayer. Vehicles are
  extruded side profiles, rounded boxes and lathed tyres merged into the
  static per-material meshes, so they add no draw calls of their own.

`node test/worldviews.mjs <dir> [view,...]` renders the world look-dev views
(apron, service area, strip, low passes over each crop, forest, creek, HQ,
aerial, chase while spraying, cockpit).

## Aircraft

Modelled on the EMB-202 Ipanema (own registration PR-AGW): orange with navy
stripes and the Brazilian flag on the fin, dark anti-glare hopper deck,
raised cabin, tall tubular main gear, 3-blade prop, booms with nozzles on
drop tubes and a wind-driven pump. The cockpit follows a real Ipanema panel:
light grey, warning lamps, round gauges, switch rows, a guidance GPS in a
black bezel, lightbar at the centre post and a hopper sight window that
shows the live liquid level.

The model (`src/aircraft/model.js`) is purely visual: the flight model, gear
contact points, colliders and mass in `src/config.js` do not read it (it only
reads the gear points to place the wheels), so the look can change without
changing how the aircraft flies.

- **Fuselage**: stations interpolated along Catmull-Rom splines and lofted
  as superellipse rings (separate upper/lower roundness), so the cowling,
  cabin and tail cone are single smooth surfaces; the turtle deck is part of
  the aft loft rather than a separate box.
- **Livery**: side-projected 2048×1024 canvas with a matching bump map, so
  panel seams, rivet rows, inspection doors, louvres and the orange-peel of
  the paint are in relief; stripes, PR-AGW, AGRO WINGS and the flag are drawn
  in the same places as before.
- **Wings and tail**: real airfoil sections, Hoerner wingtips, ailerons,
  flaps, elevator and rudder hinged at their spars (with trim tabs), panel
  and rib lines in relief, walkway, fuel cap, hinge brackets, pitot,
  navigation lights.
- **Cabin**: curved windshield, tubular frame with joints, door handles and
  hinges, headliner; inside, a tubular cage, rounded seat with harness,
  gauge bezels with depth, pedals, stick with grip and trigger, throttle and
  prop levers; the pilot wears a flight suit (collar, zip, chest pockets),
  a four-point harness, a flight helmet with visor housing, tinted visor,
  boom mic and the filtered-air hose ag pilots use, a kneeboard on the right
  thigh, and has gloved hands on the stick and throttle (static parts merged
  per material).
- **Gear**: lathed tyres with sidewall and tread bump, hubs with bolts and
  valve stems, brake discs and calipers, A-frame legs with fittings and
  brake lines; leaf-spring tailwheel with fork.
- **Propeller**: three twisted blades (pitch angle from radius) with yellow
  tips, fading into a translucent disc with blade-shadow lobes as rpm rises,
  driven by the engine rpm as before.
- **Materials and light**: physical paint with a light clearcoat and its own
  environment reflection, metal, rubber and glass; ambient occlusion baked
  into vertex colours; a soft contact shadow under the aircraft near the
  ground; shadow normal offset scaled to the shadow texel size so the
  aircraft keeps its fine self-shadowing.
- **Cost**: parts are merged per material; nozzles, bolts, hinge brackets
  and other small fittings sit in a level-of-detail group dropped
  beyond 80 m.

`node test/planeviews.mjs <dir> [view,...]` renders the look-dev angles
(exterior close-ups, low sun, against the sun, cockpit); `LOOKDEV_VIEWS`
points it at a JSON list of custom views, each with an optional `post`
snippet (e.g. deflect the control surfaces) run before the render.

## Aircraft 02 — Air Tractor AT-502B (PR-AWT)

A second, independent aircraft. The Ipanema keeps its paint, registration,
configuration and flight model: its trajectory is bit-identical to the
previous build (seeded comparison) and its model's 117 meshes have the same
geometry, normals, UVs, vertex colours and materials (checksum in the
browser).

**Reference.** The uploaded video is game footage of a yellow Air Tractor
(blue cheat line with white pinstripes, blue fin and rudder, blue wingtip
bands, three-blade prop with a silver spinner, booms under the trailing edge,
spring-steel gear with white hubs, framed canopy, dark panel with round
gauges, stick with a red button); its features match the AT-502B. The
YouTube link could not be opened from this environment. The reference's
registration is not used.

**Published figures used** (Air Tractor AT-502B spec sheet, dealer and
operator data, Wikipedia AT-500 family):

| | |
| --- | --- |
| Engine | P&WC PT6A-34AG, 750 shp flat-rated, prop 2,200 rpm |
| Propeller | Hartzell 3-blade constant speed, 2.82 m |
| Span / wing area | 15.85 m (52 ft) / 29.0 m² (312 ft²) |
| Empty / max take-off | ≈ 2,073 kg (4,570 lb) / 4,264 kg (9,400 lb) |
| Hopper / fuel | 1,893 L (500 US gal) / 643 L (170 US gal) |
| Stall at 8,000 lb | 71 kt flaps up, 59 kt flaps down |
| Climb at 9,400 lb | 870 ft/min |
| Working speed | 120–145 mph |

Derived here (not published): CLmax 1.50/2.18 from the stall speeds; CD0
0.058 and Oswald 0.80 so the climb and a 75 %-power cruise of 134 kt at
8,000 ft come out of one polar; inertias scaled from mass and size; static
thrust ≈ 12.5 kN (figure of merit 0.64); fuel flow from ~0.6 lb/shp/h. No
speed multipliers: every number above enters the same equations as the
Ipanema's (`FLIGHT_AT502` in `src/config.js`).

**PT6A model** (`FlightModel._turbine`, `_propThrust`): the power lever
schedules gas-generator speed Ng, reached within the fuel control's
acceleration limits (≈ 3.7 s from idle to 90 % torque, the turbine lag a
pilot feels); shaft power follows Ng and is flat-rated; the constant-speed
prop governs 2,200 rpm and sits on its fine stop at low power, where the
windmilling disc makes drag; on the ground at idle the prop goes into beta.
Thrust comes from actuator-disc momentum theory with losses. Start: starter
to ~17 % Ng, light-off at 3.2 s (ITT peak, whoosh), ground idle 53 % Ng /
1,150 rpm at ~12 s. Shutdown: the spools run down over ~15 s and the prop
feathers. Torque (ft·lb), ITT, Ng, Np and fuel flow drive the cockpit gauges.

**Measured** (`node --test test/at502.test.mjs`):

| check | result | published |
| --- | --- | --- |
| climb, 9,400 lb, 95 kt | 847 ft/min | 870 ft/min |
| 1 g stall, 8,000 lb, flaps up | 73 kt | 71 kt |
| full power level, 8,000 lb | 139 kt IAS, 255 L/h | — |
| 62 % power lever | 113 kt (working speed) | 104–126 kt |
| ground roll 2,672 / 4,264 kg | 188 / 485 m | — |
| spool-up idle → 90 % torque | 3.7 s | — |
| roll to 60° (1,000 L) | 1.2 s | — |
| balão with 1,200 L | no stall, +44 m | — |
| landing with beta + brakes | 0.5 m/s touchdown, 261 m roll | — |

Spray: a 14 m boom with 50 nozzles; swath 30 m (scaled from the real ~21 m
the same way as the Ipanema's) and 6.4 L/s, the same 40 L/ha dose at a
117 kt working speed. A full hopper covers the soybean contract in one
sortie (Node autopilot: 90 % coverage, single load).

**Model** (`src/aircraft/atModel.js`, shared helpers from `model.js`):
lofted fuselage with the long PT6 cowling, matte anti-glare strip, chin
intake with screen, oval exhaust stacks with soot, big hopper lid, open
cabin under a framed canopy (curved windshield, doors, tinted roof),
wire cutter and deflector cable to the fin; constant-chord cantilever wing
with large flaps and long ailerons on their hinges, blue tip caps, nav and
strobe lights, landing lights, walkway and tank caps; booms on streamlined
hangers with check valves and nozzles; fan-driven pump; spring-steel main
gear (flexes with the suspension), white hubs, brakes; steerable tailwheel;
strut-braced tailplane, fin and slanted-hinge rudder, beacon. The polished
spinner carries three twisted blades that feather when the engine is
stopped, come out of feather in the start, and coarsen with speed. Cockpit:
dark panel with airspeed, attitude, altimeter, turn coordinator, heading,
VSI, torque, ITT, Ng, prop rpm, fuel, fuel flow, oil, hopper, flaps,
annunciators (BETA, START, GEN, CHIP…), the guidance GPS, flow monitor,
lightbar, hopper sight gauge; PT6 quadrant (power, prop and condition
levers). The seated pilot is the same model as the Ipanema's, laid into
this cockpit with the hands on the stick and power lever.

**Architecture.** `src/aircraft/types.js` is the registry: each type
carries its flight profile, model and panel factories, spray boom, crew
service points, collision bounds, cameras, audio profile and loads. Every
system reads the active aircraft (`game.aircraft`); the game keeps a fleet,
parks the other aircraft (settled on its springs, pilot out, an obstacle for
the flown one, not drawn beyond 1.2 km) and swaps on selection. Per-type:
load sheet, HUD bars, crew service (rates and walking points), guidance
swath spacing, chase/orbit cameras, cockpit vibration, overspeed and
low-fuel warnings, and audio (`profile: 'turboprop'`: compressor whine and
gas-generator hum from Ng, exhaust roar with power, prop buzz from Np,
light-off whoosh). Key bindings are unchanged.

## Realism 4.0 (atmosphere, farm operations, GPS)

Added on top of the existing game without touching the flight model, the
assist, the aircraft configurations, liveries, controls, save data,
missions, map coordinates or runway (`git diff checkpoint-before-realism-4
-- src/flight` is empty; `src/config.js` only gained `rainDrops` per preset).

**Atmosphere** (`src/world/atmosphere.js`, `sky.js`). Five times of day
(dawn, morning, midday, golden hour, dusk) × five weather presets (clear,
partly cloudy, overcast, light rain, morning mist), chosen in Settings and
saved. Each preset drives the Preetham sky, the sun's direction, colour,
intensity and shadow strength, the hemisphere light, the haze colour and
density, exposure, the cumulus cover (whole clouds fade in/out), an
overcast deck with horizon haze (one sky-dome draw), exponential height
mist that settles in the low ground (added to three's stock fog chunks
once, so no extra shader programs), GPU rain streaks (one instanced draw,
motion-blurred along the drop's speed relative to the eye, faded near the
eye so no drops appear inside the cabin), wet ground (darker, glossier
soil and roads; soaks in ~40 s, dries in ~2 min) and the ambience (rain,
breeze, birds, insects). Changes blend over ~5 s; the sky lighting (PMREM)
is re-baked once when the blend settles. Morning + partly cloudy reproduces
the previous look (mean pixel difference 0.2–1.8/255 in the same views; the
rest is the truck's new bay and the wind sway).

Weather is visual and audio only. The *visual* wind is the flight model's
own mean wind (`windAt`, same scale setting) mirrored into one shared
uniform that sways grass, trees (crowns bend downwind with travelling
gusts, leaves flutter), crop rows and canopy (wind waves), and slants the
rain. No aerodynamic wind solver was added and the physics never reads it.

**Service truck** (`src/crew/truck.js`, `planner.js`). The support tanker
(calda + fuel, rear reels, pump, amber beacon, brake/reverse lights,
headlights in low light, "BADECO · APOIO AGRÍCOLA") waits in a bay by the
crew post. On a service request it drives to a stand off the service-side
wingtip, facing aft with its reels level with the wing leading edge:
hybrid A* over (x, z, heading) with forward and reverse arcs at a 9.2 m
turning radius (the truck's lock is 0.6 rad on a 5.3 m wheelbase), around
the static colliders and every aircraft's footprint (+0.8 m), the truck
checked as a chain of circles. The search is spread over frames (3 ms each,
no hitch). Driving: kinematic bicycle model, rate-limited steering, pure
pursuit, accel/brake limits, corner and stop-distance speed limits, a
straight lead-in to the stand, live look-ahead braking for aircraft and
the badeco; wheels spin and steer, the body pitches and rolls. The badeco
walks to its reels along grid-A* paths around the truck and the aircraft,
runs the hoses as before, the truck backs out and returns to its bay
(either heading), and the aircraft is released once it is clear. If no
stand is reachable the station hoses are used, as before. The truck is an
obstacle for the aircraft and vetoes engine start while beside it.
Measured (`test/truck.mjs`): arrives in 24–32 s, parks within 0.25 m / 1°
of the stand, closest approach to an aircraft 0.88–1.35 m, standard and
off-centre parking (4 m, 60°; −5 m, 120° on the other side) for both
aircraft.

**Hangar.** Portal frames and purlins, corrugated inner lining, concrete
floor that darkens with depth (sky light cut by the roof), safety lines,
tool chest, wing trestles, spare hopper, parts pallet, ladder, drums on a
spill tray; four corrugated sliding door leaves on two top tracks (one
instanced draw) that close at dusk and open when an aircraft comes near;
high-bay lamps with light pools on the floor (no real lights). Colliders
are now the walls, roof and equipment, so an aircraft can taxi in when
the doors are open. Grass no longer grows through the slab.

**Farm activity.** A tractor with a disc harrow works the fallow T-08 lane
by lane with headland turns, raising dust; its pose is a function of time,
so updates are throttled with distance (every frame < 500 m, 8 Hz to
1.2 km, hidden beyond 800 m) and it costs nothing far away.

**Vehicles.** Shared materials; wheels are two instanced meshes per
vehicle; only the big parts cast shadows; small parts (lenses, reels,
decals, beacon) are hidden beyond 220 m and the whole vehicle beyond
800–900 m.

**GPS and scoring.** The guidance unit records the flight track (where the
boom was spraying in yellow) and shows heading, ground speed, cross-track
error, spray state and flow, progress, remaining area and overlap, all from
live state. The same page is available on the HUD minimap (N or a click).
Results add flight time, sorties and work rate (ha/h) to coverage, gaps,
overlap, uniformity and waste. The spray plume is finer and more
translucent (smaller growth, lower opacity, lit by the scene light).

**Cockpit and pilot.** Settings → Cockpit shake (off / low / normal) scales
the engine/ground vibration and the g head-sink. The pilot's head (exterior
views) looks into turns, along the boom on spray passes and out of the side
while taxiing, and dips under g.

**Audio.** Rain (muffled in the cabin), the truck's diesel with distance,
the tractor drone near T-08, tools and ratchets near the hangar, gustier
breeze, fewer birds in rain; aircraft audio unchanged.

**Performance manager.** First run only: the title screen's frame time
picks the preset (steps down under ~33 fps, up over ~80 fps); a manual
choice turns it off; `?q=` forces a preset. Settings → Show FPS now shows
frame-time average and p95, draw calls, triangles and the preset.

**Measured** (`test/profile.mjs`, SwiftShader, 960×540; tick = game logic
ms/frame over 120 ticks; "before" is the build tagged
`checkpoint-before-realism-4`, default morning / partly cloudy):

| preset · aircraft | view | tick avg (p95) before → after | draw calls | triangles |
| --- | --- | --- | --- | --- |
| low · PR-AGW | pad (chase) | 0.36 (0.5) → 0.57 (0.8) | 463 → 486 | 738k → 737k |
| low · PR-AGW | spraying soy, 4 m | 1.22 (2.7) → 0.84 (1.6) | 370 → 378 | 550k → 545k |
| low · PR-AGW | cockpit over corn | 0.82 (1.9) → 0.76 (1.5) | 362 → 362 | 912k → 912k |
| low · PR-AGW | 400 m AGL | 0.50 (0.6) → 0.66 (1.1) | 323 → 329 | 478k → 478k |
| high · PR-AGW | pad | 0.57 (0.7) → 0.52 (0.7) | 464 → 487 | 766k → 764k |
| high · PR-AGW | spraying soy | 1.74 (5.8) → 1.17 (2.3) | 398 → 408 | 572k → 569k |
| high · PR-AGW | cockpit over corn | 1.09 (2.0) → 1.49 (5.0) | 389 → 389 | 924k → 924k |
| high · AT-502B | pad | 0.53 (0.9) → 0.86 (1.8) | 476 → 504 | 784k → 785k |
| high · AT-502B | spraying soy | 1.99 (4.7) → 1.15 (1.9) | 400 → 410 | 568k → 573k |
| high · AT-502B | cockpit over corn | 1.40 (3.9) → 1.08 (2.2) | 392 → 392 | 952k → 952k |

Tick differences of a few tenths of a millisecond either way are run-to-run
noise in this container. Load to first frame: 19.5 → 19.3 s (low),
23.0 → 23.5 s (high), 22.2 → 21.7 s (AT). GPU objects: +17–28 geometries,
+1–2 textures, +6–8 shader programs (cloud deck, rain, hangar shading,
instanced wheels, sprites); JS heap 124–145 → 138–156 MB. The extra draw
calls on the pad are the truck and the hangar seen up close; in flight
they are the far tractor and the hangar slab (+6 to +10); the cockpit view
is unchanged. Sky-light re-bake on a weather/time change: ~40 ms in
SwiftShader, once per change. Truck route search: ~120–370 ms of CPU in
total in this container, spread at 3 ms per frame.

**Validation (this build).** `npm test` 35/35. `node test/e2e.mjs soy`
(PR-AGW): two sorties with the truck servicing, 90 %, 2★ (as before).
`AC=at502 node test/e2e.mjs soy`: one sortie, 90 %, 1★ / Cr$ 5,093 (the
pre-change build gave 2★ / Cr$ 4,993 on the same run: the AT sits at the
2★ uniformity/waste threshold and the truck's drive shifts when the passes
are flown, i.e. the gust phase; deposition, contracts and autopilot code
are unchanged). `node test/e2e_ui.mjs` 16/16 (one check now waits for the
truck to arrive; one new check: truck parked at its stand).
`node test/atmo_transition.mjs`: rain, dusk and back to morning blend over
~5–20 s, one sky re-bake each, no errors. Renders of all five times of day
and five weathers from the apron, the air and the chase camera; the
default look compared pixel-by-pixel with the previous build.

**Known limits.** Time of day is a preset, not a running clock; there is
no night (dusk is the darkest). Rain has no splashes or drops on the
windscreen; puddles are not modelled (the ground just gets wet). The
overcast deck is a sky-dome layer, not volumetric. The truck cannot reach
every possible parking pose inside the pad circle; then the fixed station
hoses are used as before. Only one farm vehicle works the fields. Real-GPU
frame times were not measured (no GPU here); use Settings → Show FPS.

## Aircraft 03 — Robinson R44 Raven II, agricultural (PR-AGH)

The third aircraft and the first rotary-wing one, added as a separate
aircraft: the airplanes keep their models, configurations and flight
solver (`src/flight/flightModel.js`, `src/flight/assist.js` and
`src/aircraft/aircraft.js` are not modified). The game creates a
`Helicopter` (`src/aircraft/helicopter.js`) for types with `kind: 'heli'`
and an `Aircraft` for the others; both expose the same interface, so the
crew, truck, sprayer, GPS, HUD, cameras, missions and save data work with
either. Title screen: AIRCRAFT 03 · ROBINSON R44 — "Rotary-Wing
Agricultural Aircraft".

**Tropical Island source.** The request was to reuse the Tropical Island
helicopter simulation where its source is accessible. It is not: this
environment can reach only the H2 repository, which has no Tropical Island
code. Nothing was imported from it. The helicopter model below was written
for this game from standard rotorcraft theory.

**References.** The two uploaded videos are game footage of a red R44 mod
on a gravel H pad (walk-around, start-up, hover, cockpit). They were used
for the overall look (red paint, gravel pad with a painted H, pedestal
console, T-bar cyclic). The mod's 800 L tank is not used.

**Published figures used** (R44 Raven II): two-blade main rotor, 33 ft
(10.06 m) diameter, turning counter-clockwise seen from above; two-blade
58 in (1.47 m) tail rotor with the advancing blade at the bottom; 100 % =
400 rotor rpm / 2,665 engine rpm, power-on limits 101–102 %, green 90–108 %,
low-rpm horn at 97 %; MTOW 2,500 lb (1,134 kg), empty ~1,505 lb (683 kg);
Lycoming IO-540-AE1A5 derated to 245 hp take-off (5 min) and 205 hp
continuous; fuel 29.5 + 17.0 US gal usable (176 L); length 38 ft 3 in,
height 10 ft 9 in; cruise 109–117 kt, Vne 130 kt; hover ceilings IGE /
OGE ~8,950 / ~7,500 ft. Sources: Robinson's R44 Raven II page and POH
(as quoted by POH study cards), Wikipedia, Vertipedia, AOPA, Aensa, Plane
& Pilot. Robinson's own site and Wikipedia could not be fetched from this
container; the figures were cross-checked in search results.
**Estimates** (marked as such in `FLIGHT_R44`, chosen to reproduce the
published performance): blade chord, rotor inertia, Lock number, airframe
inertias and drag areas, tail-rotor arm, chord and pitch range, skid tread
and spring rates, the ag kit's mass.

**Agricultural kit.** No crewed R44 ag kit with a published capacity was
found (the 110 US gal figure that turns up belongs to the unmanned R44
Sprayhawk). The game uses a 250 L virtual tank — what fits under the MTOW
with an 85 kg pilot, the ag kit (42 kg, estimate) and ~80 L of fuel; full
fuel and a full tank is over the MTOW and the load sheet says so. Belly
tank between the cross tubes, engine-driven pump (it works in the hover,
unlike the airplanes' wind-driven pumps), 8 m boom under the nose (80 % of
the rotor diameter, kept inside the rotor wake) with 28 nozzles on drops,
13 m swath and 1.3 L/s (the contracts' 40 L/ha at ~50 kt). The rotor
downwash pushes the droplets down at low speed (shorter fall time, less
drift); at working speed the wake trails behind the boom.

**Power model (the default handling).** Settings → Flying → Helicopter
model chooses between **Power (one lever)**, the default, and **Detailed
rotor**, the full simulation described below. The power model is the
handling asked for, after the Tropical Island helicopter (its code was not
available; the behaviour was rebuilt from the description). Disc tilt,
airframe, skids, crash points, crop contact and servicing are shared by
both models.

- One power lever (Shift / Ctrl, the wheel, the triggers). Rotor and torque
  act as one: once the engine runs, the rotor comes up to speed in about
  6 s and stays there. There is no governor to watch, no rotor droop and no
  low-rpm horn. The drive torque is balanced for the pilot, so a power
  change never swings the nose, and the pedals only turn the aircraft.
- The vertical part of the thrust follows the power. The power that holds a
  hover depends only on the weight: ~55 % light and ~70 % at the MTOW out
  of ground effect, ~49 % / ~62 % on the skids (the ground cushion of a
  rotor at constant power, (1/k_GE)^(2/3)). More power climbs and less
  sinks, at a rate that settles in proportion to the difference: ±10 % ≈
  ±2 m/s, ±20 % ≈ ±4 m/s; full power at the MTOW ≈ 870–1,000 ft/min.
- The power answers at once, and the aircraft holds where the power is
  set.
  - The lever moves at 0.9/s on the keys (0.55 before).
  - The power follows it within 0.1 s (0.25 s before).
  - A saturating extra damping of slow vertical motion (`holdDamp`,
    `holdV`) stops the drift without cutting the full-power climb.
  - Measured (`test/r44power.test.mjs`): a 2.5 m/s sink is stopped 1.2 s
    after the power key goes down, losing 1.1 m, and then holds. Before it
    took 1.8 s and 2.2 m, and 2.8 s to settle.
  - ±10 % power now gives +1.2 / −2.1 m/s; full power at the MTOW gives
    770 ft/min.
  - To land, take the power ~8 % under the hover figure. At −5 % it now
    sits on the ground cushion.
- The thrust acts along the rotor axis, so the speed comes from the tilt
  and the power together, as in the other game.
  - Tilting the disc turns lift into push: a steep tilt sinks unless the
    power comes up, and more power at the same tilt flies faster.
  - Translational lift (+10 % thrust from ~8 to ~27 kt) means cruise at
    ~20° needs about the hover power.
  - Towards the Vne the thrust falls off (`vLoss`, the retreating blade and
    profile power), which caps the top speed at ~125–130 kt.
  - The rotor's damping of slow motion (`glideDamp`) saturates at ~16 kt
    and fades out above ~60 kt, so the total drag rises smoothly with
    speed. Before this there was a "wall": at 10° the aircraft stuck at
    ~22 kt, then jumped to 80 kt with a little more power.
  - Measured with a held tilt (`test/r44power.test.mjs`), at the hover
    power:

    | Tilt | Speed | Climb |
    |---|---|---|
    | 5° | 11 kt | — |
    | 10° | 40 kt | — |
    | 20° | 102 kt | +0.2 m/s |
    | 30° | 121 kt | −2.7 m/s |

    With 20 % more power: 57 kt at 10°, and 128 kt at 30° sinking only
    1.4 m/s. Full power: 125 kt.
  - Before this, a tilt compensation kept the lift whatever the tilt, so
    power only moved the aircraft up and down, and the speed hit the
    assist's 18° limit at 100–115 kt.
- On the HUD, POWER shows the lever, with the hover figure for this weight
  and height next to the label. The slot that showed the rotor % shows the
  climb rate. The load sheet gives the hover power in %.
- Assist: **high** (the default) handles like the other game's helicopter.
  - The keys tilt the aircraft for as long as they are held: the tilt keeps
    growing (~17°/s nose, ~29°/s bank), up to 45° nose down, 30° nose up
    and 50° of bank. There is no fixed 18° stop any more, so the speed
    follows the tilt and the power.
  - Let go and it levels out from where it is (it runs on a few degrees at
    most) and glides
    on, slowing down by itself with no braking flare (`glideDamp`).
  - Once it is almost stopped (under ~5 kt over the ground), it holds the
    hover against the wind with a lean of at most ~2.5°.
  - The power stays the pilot's, with the landing cushion: below ~15 m only
    a gentle sink is let through.
  - **Normal** holds attitude and heading; **off** is raw.
  - Measured with the keyboard shaping (`test/r44power.test.mjs`):
    - forward key: −7° after 1 s, −24° after 2 s, −41° after 3 s, held at
      −45°;
    - released: level in 3.2 s, at most 1° nose up;
    - roll key: 12° after 1 s, peak 19° after release, no pitch change;
    - glide: 38 → 18 kt in 10 s after release, stopped within 50 s;
    - in a 2.5–2.9 m/s breeze the hover drifts 0.2–1.3 m in 20 s.
- Attitude (both assists).
  - The target attitude moves at a limited rate, and cascaded loops
    (attitude → rate → cyclic, the integrator only near the target) put the
    nose there without running past it.
  - Before the cascaded loops, releasing the stick at ~25 kt threw the nose
    up to +24° and held it 10–20° up for seconds.
- Measured (`test/r44power.test.mjs`, `test/r44flight.mjs` in the browser):
  - off the skids 1.3–1.9 s after raising the power;
  - 20 s hands-off hover at the hover figure: 0.3 m drift, 0.75 m height
    change;
  - pedal turns ±67° in 2 s, then the heading holds;
  - landing with the power a few % under the hover figure: touchdown
    0.3–0.9 m/s, no damage;
  - rotor run-down 10 s after shut-down;
  - `AC=r44 node test/e2e.mjs soy`: the whole contract, 90 %, 2★, no
    damage. The autopilot's obstacle probe now covers the rotor's width
    plus a margin, and holds a find for 4 s. Before this, the probe
    flickered on and off over the lone tree east of the pad, and the
    descent target there dropped from 18 m to 12 m in one step.

In the detailed rotor model the assists now feed the anti-torque pedal
forward from the shaft torque (pedal ≈ 0.6 − 0.00034·Q, from the trimmed
model), so a collective change no longer swings the nose first and waits
for the heading hold. The largest swing through a full climb-and-descent
sequence went from 4.6° to 3.4° with the high assist and from 6.0° to 1.7°
with the normal one (`test/r44.test.mjs`).

**Flight model** (detailed rotor, `src/flight/heliModel.js`, 120 Hz):
- main rotor: blade-element thrust with momentum inflow solved each step
  (translational lift, climb and descent), ground effect after Cheeseman
  and Bennett (induced velocity × (1 − (R/4z)²), canopy counts half),
  vortex-ring thrust loss with buffet when descending into the wake at low
  speed, profile + induced power, H-force;
- teetering rotor: no hub moment; the tip-path plane follows the cyclic
  with a first-order flapping lag (τ = 16/(γΩ)), flaps back with speed
  and lags the body rates (damping), so control is only the tilt of the
  thrust vector;
- rotor speed from the rotor inertia: a governed, density-limited piston
  engine drives it through a belt clutch and a sprag clutch; over-pitching
  droops it (LOW RPM horn below 97 %), with the collective down in a
  descent it autorotates; the engine response has a lag;
- start-up as on the R44 (compressed to ~13 s): crank, catch, clutch
  engagement with the rotor spinning up from rest, warm-up, then the
  governor brings the rotor to 101.5 % and holds it; the engine's power
  response lag is 0.08 s; shut-down: the rotor runs down on its
  own inertia, the rotor brake is applied below 40 %;
- tail rotor on the gear train (6.065:1), its own inflow, thrust and
  power; shaft-torque reaction on the cabin (hover needs left pedal, the
  reaction reverses in autorotation);
- fuselage drag per axis, fin and stabiliser terms, quadratic yaw damping
  of the tail cone and fins;
- four skid contacts with spring/damper and stick/slip friction (no wheels:
  it does not roll), hard landing and skid collapse limits;
- never-touch points: rotor tips (tilted disc, coning or droop), tail rotor,
  stinger, nose, tank, boom ends; rotor tips against trees, buildings,
  parked aircraft, the truck and the wires.

**Controls.** Numpad 8 / 5 / 4 / 6 move the cyclic forward / aft / left /
right, Q / E are the anti-torque pedals, Shift / Ctrl (or R to raise, the
wheel, the gamepad triggers, the touch slider) raise and lower the
collective — the power in the power model — and F starts (hold, lever down)
and stops (tap) the engine; Settings → Flying
→ Flight keys switches to the classic keys (W/S/A/D, Z/X). The governor
replaces a twist-grip throttle. Settings → Assist: **off** — raw controls
(unstable in the hover, as the real aircraft); **normal** — attitude
command / hold, a landing cushion (below ~15 m the sink rate the height can
still arrest is allowed, beyond that collective is added), heading hold (kept on the skids while the collective is
up, so the anti-torque pedal isn't dropped at touchdown), turn
coordination above ~35 kt; **high** — plus vertical-speed command / height
hold on the collective (never drooping the rotor below the green, and
easing the descent to ~0.5 m/s at touchdown), a hover hold with the stick
centred below ~55 kt and a speed hold above. The assists only move the
controls; the physics is the same. The helicopter has its own assist setting
(Settings → Flying → Helicopter assist, default **high**); the airplanes keep
theirs. With **high** the collective keys command the climb rate (a slewed
demand and a quick velocity loop: no dead time, no overshoot) and a held
lever-down lands at ~0.3 m/s; the law stays on down to the skids.

**Checked against the published figures** (`test/r44.test.mjs`): hover at
1,134 kg OGE 204 hp (≤ 245 hp take-off), IGE at a 2 ft skid height
189 hp — the gap matches the published IGE/OGE ceilings; the load sheet's
trimmed estimate matches both flown values; level flight 109 kt at 195 hp
(published cruise 109–117 kt); climb at MTOW with 205 hp 1,153 ft/min
(published max ~1,000 ft/min); autorotation with the rotor at 105–109 %;
over-pitch at MTOW droops below 97 %; start to governed rpm with the skids
still; pedal turns and heading hold; forward, backward and sideways
translations; vertical lift-off, hover hold, landing on the skids.

**Model** (`src/aircraft/r44Model.js`, visual only). One lofted cabin
bubble cut exactly along the window outlines (two-piece windshield with a
centre post and the compass, four door windows with the swept rear upper
corner), rubber seals along every outline, a dark inner skin, door seams,
hinges and handles, landing lights; mast fairing; aft body with the open
engine bay (flat-six with finned cylinders, cooling scroll, exhaust,
muffler and tailpipe, steel tube frame); riveted tail cone; swept upper
fin, lower fin with the stinger, horizontal stabiliser, tail-rotor guard;
skid tubes on arched cross tubes with wear shoes; side-projected livery
(red, graphite belly, pinstripes, AGRO WINGS, PR-AGH, flag, placards) with
a bump map. Main rotor: mast, swashplate, teetering hub, pitch links, two
blades with twist and root doublers; coning at speed, droop at rest,
collective pitch, tip-path-plane tilt from the simulation. Tail rotor on
the left with red-tipped blades.

**Rotor blur.** Each rotor has a ring in its tip-path plane drawn with the
lit standard material, whose alpha is the blade coverage smeared over one
frame's exposure behind each blade (rotor speed × exposure, in radians),
plus a faint persistence of the swept disc. Stopped or slow, the solid
blades carry the look; as the rotor speeds up they fade and the smeared
sectors take over — never a permanently opaque disc. The tail rotor blurs
to a light disc at its higher speed.

**Cockpit** (`src/aircraft/r44Panel.js` faces, `src/aircraft/r44Cockpit.js`
3D instruments), rebuilt after a frontal photo of a Raven II panel and three
photos from the right seat:
- **Pod**: the R44 outline traced on the frontal photo (`podOutline()`): a
  broad, slightly domed top, large rounded ears at the upper corners, the
  sides drawn in steeply to a bottom about two thirds as wide that sits on
  the pedestal. It is a moulded shell 15 cm deep, a rounded rim standing
  proud of the recessed face, a rolled hood lip from ear to ear and the
  slim guidance lightbar on the hood. Matte black materials.
- **Instruments**, in the photo's two rows:
  - top: the blank position with the moulded R44 cap, altimeter (three
    needles, Kollsman window), attitude, airspeed (green / yellow arcs,
    red line) and the dual tachometer (engine and rotor);
  - bottom: VSI, directional gyro, turn coordinator (the symbol rolls with
    the rate of turn, the ball rides with the slip) and manifold pressure.
  - Each one is a 3D case set into the face: black barrel, bezel ring,
    dial set back inside it, 3D needles and glass with a soft reflection;
    knobs on the altimeter, the attitude and the DG.
- **Lamps**: the photo's row (CLUTCH, MR TEMP, MR CHIP, CARBON MONOXIDE |
  STARTER ON, TR CHIP, LOW FUEL, LOW RPM) and FULL THROTTLE beside the
  manifold pressure, small domed lenses in bezels. Only the ones the game
  simulates ever light, and only from its state (clutch engaging, starter,
  fuel below 10 %, low rotor rpm, power at the limit); the others stay
  dark — there are no random failures.
- **Placards**: "DO NOT EXCEED 110 KIAS EXCEPT IN SMOOTH AIR" and the
  registration.
- **Pedestal**: a deep sloped box with raised module plates:
  - the lamp row (FUEL FILTER, AUX FUEL PUMP, ALT, ENG FIRE, OIL, GOV OFF);
  - hour meter and clock; the engine cluster (oil temperature and
    pressure, CHT, ammeter) and the ag tank and fuel gauges; "R44 Raven II";
  - BRAKE and SPRAY lamps; the switch row (NAV LTS, STROBE, the CLUTCH
    switch under its red guard, ALT, MASTER BATTERY, PUMP, VALVE) with
    toggles that follow the aircraft's state; the magneto key;
  - the avionics stack: audio panel, the guidance GPS, transponder and COM.
- **Tablet**: a navigation tablet on an arm at the right ear of the pod,
  turned toward the right seat, showing the same guidance screen as the GPS.
- **Live parts**: needles, attitude ball, heading card, turn coordinator,
  lamps and toggles are 3D and set every frame from the simulation in the
  cockpit view. The faces are drawn once; only the GPS screen is redrawn,
  at 15 Hz.
- **Camera**: the pilot's eye in the right seat, looking 20° down with a
  64° field of view, so the pod and the top of the pedestal fill the lower
  part of the frame (`camera.cockpitPitch` / `cockpitFov` of the type).
- **Cost**: two to four draw calls more than the previous pod in the
  cockpit view (see the R44 cockpit validation below).
- **Controls and cabin**:
  - the Robinson T-bar cyclic in satin black, on a pivot housing with the
    yellow "LOW-G PUSHOVERS PROHIBITED" placard;
  - rubber grips with red triggers;
  - grey carpet on the floor.
- **Moving controls**: the cyclic, the collective with its twist grip, and
  the pedals move with the simulation. The seated pilot (right seat, helmet) has the right hand on
the cyclic grip and the left on the collective (the forearm turns at the
elbow, the lever follows the hand), and looks down and out near the
ground and along the boom when spraying. The exact R44 instrument
arrangement varies between aircraft and is not claimed.

**Cameras and sound.** The chase camera follows the nose (a helicopter
flies sideways and backwards); the cockpit view adds a two-per-rev shake
in phase with the rotor, strongest through translational lift, at high
speed and in settling with power (Settings → Cockpit shake scales or
removes it). Audio profile `heli`: piston engine from engine rpm, the
starter and the engine catching, main-rotor blade passage as noise pulses
at 2/rev (chop and a low "whop", blade slap in descents), tail-rotor buzz
and main-gearbox whine — all from the rotor speed, so they spin up through
the clutch and run down after shut-down — with the cabin muffling and the
low-rpm horn.

**Farm integration.** Helipad at the east end of the apron (gravel, H and
touchdown circle; the runway, service pad and taxi route are unchanged).
The helicopter is serviced there: the crew waits until the rotor has
stopped; the truck parks ≥ 3 m clear of the stopped disc on either side
(its route search now also covers the grass east and north of the apron,
and tries both sides). When the helicopter is flown, both airplanes wait
on the west apron. Warnings: low rotor rpm, rotor overspeed, engine out
(autorotate), settling with power. HUD: rotor % in place of G (power model: the climb rate). The test
autopilot (`src/game/heliAutopilot.js`) flies through the player's inputs
with the high assist: service, start, lift-off, transit, passes with
hover turnarounds at the field ends, return over obstacles, landing on
the H, shut-down, rotor run-down and the next service.

### R44 cockpit reconstruction (validation)

Only the R44 cockpit changed (`r44Panel.js`, `r44Cockpit.js`, the pod /
lightbar placement in `r44Model.js`, the R44's `cockpitPitch` / `cockpitFov`
in `types.js`); the exterior, rotors, flight model, controls, the other
aircraft and their cameras, the scenery, missions and sounds are untouched.

| # | Test | Result |
|---|------|--------|
| 01 | front | pod outline, two instrument rows, lamp row and pedestal compared with the frontal Raven II photo (`node test/cockpitviews.mjs out r44 panel`) |
| 02 | pilot view | `test/r44cockpit.mjs`: parked, running, hover, level, turn — pod and top of the pedestal in the lower part of the frame |
| 03 | contour | traced outline: domed top, ears, sides drawn in to a bottom ~⅔ as wide |
| 04 | pedestal | look-down view: lamp row, cluster, switches with the red clutch guard, key, avionics |
| 05 | instruments | needles follow the flight model (26 → 86 kt: ASI −2.3 rad, altimeter −1.9 rad); lamps: cold → ALT only, flying → none, low rotor → LOW RPM, low fuel → LOW FUEL, same result on every update |
| 06 | cyclic | T-bar unchanged, moves with the cyclic (look-down view) |
| 07 | camera | 16:9, 4:3, 21:9; eye clearance 27.6 cm (dev server; nothing closer than 12 cm) |
| 08 | side views | looking left / right from the seat |
| 09 | exterior | `node test/acviews.mjs out r44 side,front34,front`: the pod stays inside the bubble; chase view unchanged |
| 10 | performance | below |

Performance (SwiftShader, 960×540, medium, R44 at 6 m over the corn, same
scene before and after, two runs each):

| | before | after |
|---|---|---|
| cockpit view, median frame (render) | 11.6 / 12.1 ms | 14.6 / 11.9 ms |
| cockpit view draw calls | 482 | 465 (pitch 20° down, FOV 64°) |
| same fixed camera (`cockpitviews` default / wide / panel) | 430 / 444 / 317 | 434 / 449 / 322 |
| cockpit meshes / triangles | 108 / 23,052 | 113 / 45,179 |
| geometries / textures in memory | 780 / 53 | 771 / 54 |
| JS heap | 377–388 MB | 376–380 MB |

### Validation (R44 build)

All runs below are on the final build (`npm run build`, `vite preview`),
Chromium + SwiftShader in this container.

| # | check | evidence |
| --- | --- | --- |
| 1 | PR-AGW behaves exactly as before | seeded trajectory fingerprint (take-off, pull-up, turn, wind on) identical, byte for byte, to the commit before the R44 work; `flightModel.js`, `assist.js`, `aircraft.js` and `FLIGHT` untouched; `node test/e2e.mjs soy`: full contract, two sorties, 90 %, 2★, Cr$ 5,396 |
| 2 | Air Tractor functional | same fingerprint test with `FLIGHT_AT`: identical; `AC=at502 node test/e2e.mjs soy`: 90 % in one sortie, 2★, Cr$ 4,967 |
| 3 | R44 spawns correctly | `test/r44flight.mjs`: card 03 selects it; parked on the helipad at (-323, -48), heading 090, four skids on the ground, rotor STOPPED |
| 4 | main and tail rotors | counter-clockwise main rotor seen from above, advancing tail blade at the bottom, measured in the browser; solid blades at rest, short blur at ~25 %, blur disc with the blades faded at 100 %, solid again after the run-down |
| 5 | vertical take-off | off the skids 2.1 s after raising the collective, 3 m 0.9 s later, 0.5 m drift |
| 6 | stable hover | 20 s hands-off hover (high assist): 0.6 m drift, height within 0.04 m, rotor 101.5 % |
| 7 | translations | 10 m/s forward and backward, 14.6 / 11.0 m/s sideways left / right, climb +7 m and descent −7.6 m on the collective |
| 8 | yaw | left pedal −75° in 2 s then heading held (0.0° in 6 s); right pedal +91° |
| 9 | skids on the ground | landing from 52 kt: four skids, 0.82 m/s touchdown, no damage, skid heights −0.02 m; the test autopilot's seven landings in the contract run all ended on the H |
| 10 | cameras | chase behind the nose, cockpit at the pilot's eye (pilot hidden), orbit around |
| 11 | instruments read the simulation | panel data equals the model's rotor %, engine %, MAP, fuel, tank, altitude and heading; rotor state STOPPED / STARTING / NORMAL / SHUTDOWN shown on the pod |
| 12 | virtual ag application | `AC=r44 node test/e2e.mjs soy`: the whole soybean contract flown through the player inputs with the high assist — seven sorties (service, start, spool-up, lift-off, passes with hover turnarounds, return, landing on the H, shut-down, run-down), 90 % coverage, 2★, Cr$ 5,293, no damage |
| 13 | ag GPS with the helicopter | the same run: passes flown on the guidance lines, with the lightbar, the HUD and cockpit GPS and the coverage map driven by the helicopter's 13 m swath |
| 14 | ground servicing | 7 services at the helipad in that run, all by the truck (no "could not reach the stand"); `AC=r44 node test/truck.mjs` at four headings: truck at the stand in ~35 s, 1.0–1.7 m clear of the stopped rotor disc, crew walks around the boom |
| 15 | aircraft selection | title screen 01 / 02 / 03, choice saved; `node test/e2e_ui.mjs`: 16/16 |
| 16 | no critical regressions | `npm test`: 44/44 (PR-AGW and AT suites unchanged, 9 R44 checks); no page errors in any browser run (the only console error is the preview server's missing favicon, also present before) |
| 17 | browser performance | `test/profile.mjs` against the build before the R44 work, below |

**Key schemes** (`node test/keys.mjs`, 22/22): on the PR-AGW, the AT-502B
and the R44, the numpad scheme is the default and the classic keys are
dead in it (and the other way round); Q does not start the engine and a
tap on Q (rudder) does not stop it, F does both (bindings saved by older
builds are cleaned up on load: Q is only the left rudder, F only the
engine — `test/input.test.mjs`); Shift
and Ctrl move the power in both; the HUD, Controls and Settings screens
name the keys of the scheme in use; the choice is saved; rebinding a
numpad key leaves the classic keys alone. `node test/r44flight.mjs` (22/22)
and `node test/e2e_ui.mjs` (16/16) were run again with the numpad default.
The flight solvers are untouched (the seeded trajectories above are still
identical).

**Performance** (`test/profile.mjs low`, 600 ticks per view; build before
the R44 work → this build; SwiftShader, so render times are only the CPU
cost of a software rasteriser):

| flying | view | logic ms/tick (avg / p95) | draw calls | triangles |
| --- | --- | --- | --- | --- |
| PR-AGW | parked on the pad (R44 parked in view) | 0.39 / 0.6 → 0.39 / 0.7 | 486 → 540 | 737k → 835k |
| PR-AGW | spraying soy at 4 m | 0.70 / 1.5 → 0.72 / 1.5 | 342 → 352 | 509k → 517k |
| PR-AGW | cockpit over corn | 0.57 / 1.2 → 0.58 / 1.1 | 331 → 330 | 868k → 870k |
| PR-AGW | 400 m AGL | 0.57 / 0.9 → 0.49 / 0.6 | 318 → 318 | 471k → 471k |
| R44 | on the helipad | 0.37 / 0.7 | 473 | 865k |
| R44 | spraying soy at 4 m | 0.54 / 1.2 | 340 | 670k |
| R44 | cockpit over corn | 0.62 / 1.8 | 314 | 1047k |
| R44 | 400 m AGL | 0.23 / 0.4 | 304 | 603k |

On average the helicopter's simulation (120 Hz rotor, inflow, skids)
costs no more per tick than the airplanes'. In the airplanes' views the
additions are the parked R44 and the helipad: beyond 40 m the R44's cabin,
glass and inner skin switch to a coarse version (same window cuts) and the
fine detail is dropped, so it costs 51k triangles there (125k at full
resolution). The rotor blur is one ring mesh per rotor (a standard
material with a small shader patch), not a particle system. Sustained
software-raster time per frame on the pad (once the frame queue has
filled): 1.50–1.57 s before, 1.61–1.63 s flying the PR-AGW now,
1.66–1.71 s flying the R44. Start-up in this container 18.7 → 21.1 s, JS
heap 142 → 173 MB, GPU geometries 525 → 554, textures 37 → 41. FPS on a
real GPU was not measured.

**Known limits.** No mast bumping or dynamic rollover beyond what the
four skid contacts produce; the governor is always on (no twist-grip
throttle or governor-off flying); the rotor brake is applied automatically
below 40 % during the run-down; the 250 L tank is a game figure (no crewed
R44 ag kit with a published capacity was found); the instrument layout is
representative, not a copy of a particular aircraft; the lone tree east of
the helipad stands in the departure path — the test autopilot routes
around it, players must too. Browser end-to-end runs are not bit-for-bit
repeatable because the truck's route search has a per-frame time budget.
FPS on a real GPU was not measured.

## Terrain relief and advanced missions

The outer farmland now has real relief: rolling country and a belt of hills
around the original farm, which stays exactly as it was. It is real
geometry, not a texture. One height function feeds the rendered ground,
the aircraft's wheels and skids, the crash and obstacle tests, crops,
trees, roads, fences, vehicles, cameras, the GPS and the maps.

### How it is built

- **One height source** (`src/world/terrainData.js`). `rawHeight(x, z)` is
  the original farm terrain plus `reliefAt(x, z)` (`src/world/relief.js`),
  sampled once at start-up into the 513 × 513 grid (15.6 m cells).
  `TerrainData.heightAt` interpolates that grid on the same triangles the
  renderer draws. The flight environment (`env.ground`, `env.top`,
  `env.normal`), surface types, crops, vegetation, roads, fences, cameras,
  the truck and the GPS all read `heightAt`, so what you see is what the
  wheels touch.
- **Protected core.** The relief weight is exactly zero inside the farm
  core: the strip, base, hangar, HQ, every original field and their run-in
  lines (`CORE`, x −1750…2850, z −1500…2050). It rises smoothly over 700 m
  beyond that, and fades out again between 3.3 and 3.9 km from the centre
  (the boundary where the game turns aircraft back). Heights in the
  core are bit-for-bit those of the previous build (12,000 samples compared,
  0 differ). The creek keeps a calm floodplain through the relief.
- **Natural landforms, not noise blobs.** Relief is a sum of a few long,
  smooth waves (wavelengths 560 m–2.6 km) sampled at a domain-warped point,
  so swells and ridges meander. Because each wave's steepest slope is its
  amplitude × wavenumber, slopes are bounded by construction: no spikes,
  cliffs or isolated bumps. The zones are warped ellipses with soft edges;
  the hills sit inside a wider rolling shoulder, so the land goes from flat
  to rolling to hilly continuously. The south-west hill zone samples the
  waves at an offset so it does not stack into one deep trough.
- **Zones** (`ZONES` in `relief.js`):

  | zone | class | where |
  | --- | --- | --- |
  | Serra do Norte | hilly (level 3) | north-east, ridges running SW–NE |
  | Morro do Sudoeste | hilly (scenery) | south-west corner |
  | Campos do Sul | rolling (level 2) | south and south-east |
  | Chapada Oeste | rolling (level 2) | north-west |
  | Vale do Oeste, Baixada Sul | rolling (scenery) | west side, south |

- **Distribution** (terrain class from the zone weights, 50 m grid over the
  whole map): **76.5 % flat, 18.0 % rolling, 5.5 % hilly** (target ~70 /
  20 / 10). The hilly share is lower than the target on purpose. The
  protected core plus its 700 m blend and the calm 600 m rim leave only a
  1–1.5 km wide band for relief on the north and west sides, and much less
  on the south and east. Packing 10 % hills into that band would push slopes
  past the 12° limit and make walls against the flat core.
- **Slopes** (8 m central differences, 25 m grid): flat land p95 2.0°
  (unchanged; its steepest points are the original creek banks); rolling
  land mean 2.5°, p95 5.5°; hilly land mean 3.5°, p95 6.5°, max 10.3°. The
  relief spans about −45 m (west valley floor) to +27 m (north-east crest)
  around the strip level.
- **Rendering** (`src/world/terrain.js`). Same chunked terrain as before:
  500 m chunks, `THREE.LOD` at 1/2/4/8× decimation with skirts, built once
  at load and never regenerated in flight. Shading normals exaggerate the
  slope ×1.9 so gentle relief reads from the air (`RELIEF_SHADE`; the
  physical normal is untouched). Steeper flanks blend towards bare soil.
  The far horizon ring keeps sampling `rawHeight`.
- **Crops** follow the ground: canopy and row fins are sampled from
  `heightAt` every 8 m / 12 m, with the same shading normals as the ground.
- **Access roads** (`src/world/roads.js`): seven new dirt roads (north
  trunk and branches, south, south-east, west, north-west) routed as
  least-slope A* paths over the height field, smoothed, with grades up to 10.4 %.
  Each is drawn as a ribbon draped on the terrain: every vertex, across the
  whole width, takes `heightAt` + 7 cm, so a road on a slope lies on the
  slope. Edges fade into the grass; ruts and a grass crown come from a small
  canvas texture. They are ordinary roads for the surface code (`dirt`). The
  core roads are still painted by the ground shader.
- **Vegetation** (`src/world/vegetation.js`). The original trees and their
  colliders keep their exact positions and random draws. Trees inside the
  new fields, on their run-in corridors and on the new roads are removed
  afterwards. A separate random stream adds vegetation that follows the
  landforms: gallery woods (mata, buriti) on the valley floors, capoeira
  scrub on steeper flanks, single shade trees and ipês on crests. Every
  plant stands on `heightAt`.
- **Fences** around the two outer pastures (T-36, T-44): every post stands
  on the terrain, so the wires follow the swells.

### Missions by level

The order board (`src/ui/screens.js`) shows three sections. The original
contracts are **Level 1 · Flat farmland**, unchanged. Each new contract is
two talhões with a stepped, irregular outline flown as one job; the GPS
builds its passes over both. Relief and slope on the cards are measured on
the terrain the aircraft flies over (`src/world/terrainInfo.js`), not typed
in.

| contract | level | ha | relief | slope mean / max | distance | Cr$/ha + bonus |
| --- | --- | --- | --- | --- | --- | --- |
| soy | 1 | 18.4 | 5.7 m | 0.6° / 1.1° | 0.8 km | 260 + 2,500 |
| corn | 1 | 16.1 | 5.1 m | 0.9° / 1.3° | 0.6 km | 330 + 3,500 |
| cotton | 1 | 13.8 | 2.0 m | 0.5° / 2.8° | 2.0 km | 380 + 4,500 |
| roll-soy | 2 | 19.5 | 25.0 m | 2.6° / 4.7° | 3.3 km | 330 + 3,800 |
| roll-corn | 2 | 19.8 | 18.7 m | 2.0° / 5.0° | 4.2 km | 400 + 4,500 |
| roll-cotton | 2 | 19.1 | 30.2 m | 2.8° / 5.3° | 3.0 km | 450 + 5,000 |
| ridge-soy | 3 | 16.1 | 24.8 m | 4.5° / 7.2° | 4.1 km | 420 + 6,000 |
| ridge-cotton | 3 | 16.1 | 36.5 m | 3.3° / 5.3° | 4.0 km | 560 + 7,000 |
| ridge-corn | 3 | 15.8 | 29.5 m | 3.8° / 6.8° | 3.2 km | 500 + 8,000 |

Harder levels pay more per hectare and a larger completion bonus, and need
more fuel for the longer ferry. Scoring is the same as before (coverage,
uniformity, waste, damage). The new fields sit where the procedure turn at
each end stays inside the farm boundary (the game turns an aircraft back at
3.9 km).

**GPS and maps.** The full map and the minimap carry a hillshade and a
light elevation tint computed from `rawHeight`. Flat land is drawn as
before; the swells and hills read as relief. On the GPS page of a job with
relief, the field area is shaded from the real heights under the coverage
map, and two small lines give the ground elevation under the aircraft
(`GND`) and the field's elevation range (`FLD`), both MSL. Flat jobs show
nothing extra, so the HUD stays as it was.

**Test autopilot.** `src/game/autopilot.js` is the validation tool that
flies the contracts in the e2e runs. For terrain it now has:

- a 1.3 km run-in;
- a feed-forward of the ground's rate of change 2 s ahead, so it follows
  falling ground fully and rising ground in part;
- planning of its height over the highest tree top in the corridor ahead
  on run-ins and turns. The north-east fields' run-ins cross the gallery
  forest along the creek;
- a run-in height referenced to the job's crop canopy, also over the gap
  between stepped talhões, so a canopy edge never comes up under the
  wheels.

None of this touches the aircraft: the player flies exactly the same
aircraft through the same inputs.

### Validation (terrain build)

All browser runs were on the final build (`npm run build`, `vite preview`),
Chromium + SwiftShader in this container. "Before" is the build just
before the terrain work, served alongside it.

| # | check | evidence |
| --- | --- | --- |
| 1 | runway level | `terrain.test`: the strip is exactly 0 m along its length and width; relief is exactly zero over the whole farm core; 12,000 core heights compared with the build before: 0 differ |
| 2 | buildings in place | base, hangar, HQ, sheds, helipad, spawns: relief 0, slope < 2° (`terrain.test`); fences, apron, windsocks and parked aircraft unchanged in the ground renders |
| 3 | aircraft physics unchanged | `flightModel.js`, `heliModel.js` (detailed model), engine power, lift, drag and control gains untouched by the terrain work; seeded PR-AGW and AT-502B trajectories identical byte for byte (md5 `9e021182…` / `57deadcb…`) |
| 4 | smooth hills | sum-of-waves relief with bounded slope: no rise of 4 m or more within 20 m anywhere; rolling ≤ 8°, hills ≤ 12° (measured: rolling p95 5.5°, hills p95 6.5°, max 10.3°) |
| 5 | only selected regions elevated | 76.5 % flat / 18.0 % rolling / 5.5 % hilly, the core exactly flat as before; relief fades out 3.3–3.9 km from the centre |
| 6 | crop rows follow the terrain | canopy and row fins sampled from `heightAt`; low and orbit renders over T-41 and T-31 show the rows and tramlines draped on the slopes |
| 7 | trees and roads placed correctly | every plant stands on `heightAt`; the original trees keep their positions; roads are ribbons on the terrain (+7 cm) with grades ≤ 10.4 %; ground renders show the north road and the pasture fence following the ground |
| 8 | collision and ground contact | one height source: `env.ground`, `env.top`, crop tops and surfaces equal `heightAt` (`terrain.test`); 9 contracts flown end to end over the relief with take-offs, passes at 3 m over the canopy and landings: no damage, no crop strike |
| 9 | advanced missions work | `node test/e2e.mjs <id>` for all nine contracts (PR-AGW) — see the table below; `AC=at502 … soy` and `AC=r44 … soy` too |
| 10 | game stays smooth | `test/profile.mjs low`, below: farm views unchanged, +0.2–0.3 ms logic per tick over the hills, +5–14 % triangles |
| 11 | before/after from the ground and the air | `test/terrainviews.mjs` against both builds: five aerial views (NE hills, SE swells, NW plateau, SW, the core — identical) and nine low / ground views (ridge and rolling fields, roads, fence, the strip — identical) |

End-to-end, the test autopilot flying through the player's inputs: service,
start, taxi, take-off, the passes, reloads, landing, taxi-in and payment.

| contract | coverage | ★ | sorties | Cr$ | damage |
| --- | --- | --- | --- | --- | --- |
| soy | 90 % | 2 | 2 | 5,576 | 0 |
| corn | 90 % | 2 | 2 | 6,582 | 0 |
| cotton | 90 % | 2 | 2 | 7,223 | 0 |
| roll-soy | 90 % | 2 | 2 | 7,489 | 0 |
| roll-corn | 90 % | 2 | 3 | 8,979 | 0 |
| roll-cotton | 90 % | 2 | 3 | 9,884 | 0 |
| ridge-soy | 90 % | 2 | 2 | 9,020 | 0 |
| ridge-cotton | 90 % | 1 | 3 | 10,205 | 0 |
| ridge-corn | 90 % | 1 | 2 | 10,012 | 0 |
| soy, AT-502B | 90 % | 2 | 1 | 5,540 | 0 |
| soy, R44 (power model) | 90 % | 2 | 6 | 5,804 | 0 |

The autopilot's stars on the hilly fields reflect its uniformity on the
slopes, not a scoring change.

Problems these runs found, and fixed:

- the creek's gallery forest on the ridge run-ins (tree-top planning);
- the turn at the east end of the first ridge-soy layout leaving the farm
  boundary (fields moved west);
- a stepped field entered from the gap at ground-referenced height, so the
  canopy edge came up under the wheels (canopy-referenced run-in);
- a GPS pass that was never marked done (overlap-weighted coverage).

**Performance** (`test/profile.mjs low ipanema`, 600 ticks per view, two
runs per build; SwiftShader, so render time says nothing about a real GPU):

| view | logic ms/tick before → after | draw calls | triangles |
| --- | --- | --- | --- |
| parked on the pad | 0.37–0.53 → 0.36–0.38 | 540 → 564 | 835k → 888k |
| spraying soy at 4 m | 0.58–0.79 → 0.86–0.88 | 341 → 354 | 511k → 544k |
| cockpit over corn | 0.64–0.81 → 0.56 | 330 → 351 | 870k → 925k |
| 400 m AGL | 0.65–0.68 → 0.60–0.62 | 318 → 323 | 471k → 496k |
| 5 m over the NE hills | 0.51–0.69 → 0.82–0.93 | 193 → 223 | 365k → 416k |
| 200 m toward the hills | 0.49–0.69 → 0.70–0.84 | 285 → 322 | 929k → 982k |

The terrain is still one grid sampled once at start-up and drawn as the same
LOD chunks; nothing is regenerated in flight. The extra calls are the road
ribbons (chunks of 64 sections, frustum-culled), the new fields' crops and
the landform vegetation in its existing instanced cells. Start-up 18–19.5 s
→ 19–21 s (the relief and the extra vegetation are built at load), GPU
geometries 618 → 687, programs 40 → 42, JS heap 154 → 163–181 MB. Over
the hills the logic costs ~0.3 ms more per tick (more trees around for the
obstacle tests, grass cells on the slopes), well inside a 16.7 ms frame.

**Known limits.**

- The hilly share is ~6 %, not 10 % (see *Distribution*).
- The relief is gentle on purpose: slopes stay workable for an ag
  aircraft, so from 200 m it reads mainly through shading and the
  horizon; it is clearest low and from the ground.
- The far horizon ring outside the 8 km map is flat farmland.
- Roads were routed once offline (`least-slope A*`) and are stored as
  data; moving a field means re-routing its road.
- The hilly contracts are harder for the test autopilot (1★ on two of
  them); a pilot who anticipates the slopes does better.
- FPS on a real GPU was not measured.

## Expansion — secondary farms, office, dynamic world, replay

Built into the existing game (aircraft, physics, the main farm and its
missions, saves, controls and cameras untouched). Modules and where they live:

| Module | File | What it does |
| --- | --- | --- |
| CockpitOperationsDisplay | `src/spray/guidance.js` | GPS unit with two pages chosen from the situation: **OPS** (track-up map of the talhão: boundaries, pass lines, coverage, flown track, cross-track, terrain shading, north pointer, scale bar, covered / total / remaining ha, progress bar) and **NAV** (ferry: strips and talhões around, course line, distance, bearing, ETE, WGS-84 position). Fuel and load columns, spray state, heading and ground speed on both. Colours per unit: green AgNav (PR-AGW), amber (AT-502B), cyan (R44). |
| SecondaryFarmManager | `src/world/layout.js` (`FARMS`, `SITES`), `src/world/terrainData.js`, `src/world/structures.js`, `src/crew/*` | Three farms with their own strip, service area, shed, sign, windsocks and local truck: **Fazenda Santa Rita** (far west, 640 × 22 m red earth, big flat soy/cotton, easy), **Fazenda Vale do Rio** (south-east, 480 × 18 m mown grass climbing 1 % east, corn on swells, humid), **Sítio Serra Azul** (south-west, 430 × 15 m gravel, hills, hard). The strips sit on level platforms (graded for Vale do Rio) and are drawn by the ground shader; surface type affects rolling and dust. The ground crew (truck + badeco) works at the service area the aircraft arrives at; the other farms' trucks wait parked in their bays. |
| Farm contracts | `src/game/farmContracts.js` | Six exclusive requests (two per farm) with a farmer's message and operating conditions: mornings only, postponed in rain, not in mist, before sunset. |
| HangarOfficeMissionSystem | `src/ui/office.js` | The office computer at the main base (key **I**, or from the service orders): messages, requests (accept when the conditions allow and you are on the ground at the base), map of the farms with their profile, aircraft choice, and the **two histories kept apart** (main farm / secondary farms: number, date, job, farm, aircraft, coverage, uniformity, flight time, result, credit, replay). |
| DistantFieldActivitySystem | `src/world/fieldActivity.js`, `src/world/cutState.js` | Tractor + disc harrow (T-08, VR-03), combines harvesting (T-16 soy, SR-03 corn), a self-propelled sprayer on its tramlines (T-13), a pickup on the sede road. Serpentine lanes with headland turns as analytic functions of time; distance-throttled updates and LOD, hidden beyond 1.5 km; never on the talhões of the player's job. The done lanes change the field: harvested ground loses its crop (canopy and row fins) and shows stubble, harrowed ground turns dark. |
| WaterRegionSystem | `src/world/water.js`, `WATER` in `layout.js` | The creek, the Córrego do Vale (a tributary whose level only falls downstream), two açudes, a valley lake. One water material: colour and shore alpha from the real depth, sky reflection through the environment map, two drifting noise ripples. Timber bridges where the farm roads cross water, gallery forest and buritis along the stream, tree clumps around the ponds, wet banks in the ground shader. |
| WeatherAndSkyManager | `src/world/weatherCycle.js` | Settings: weather **Dynamic** (clear spells, cloud building, brief light showers, clearing, morning mist that lifts) and time of day **Passing** (dawn → dusk and round, 6 min a stage). Farm tendencies near each farm. All changes use the atmosphere's smooth transitions; flight physics are not touched. Farm requests read the current state. |
| ReplayManager | `src/game/replay.js` | Every job is recorded at 5 Hz (26 bytes a sample; the last four replays also in localStorage). After the hand-in (results screen), from the history, or with **L**: chase, side, orbit, cinematic (fly-by / wingtip / wide cuts), distant observer and free (mouse) cameras, 0.5–4×, seek bar, flown track (sprayed parts yellow) and talhão boundaries; the recorded aircraft's own model with prop / rotor and controls animated. |
| GroundSurfaceEffectsManager | `src/world/groundMarks.js`, `aircraft.js`, `truck.js` | Tyre marks on bare earth from the aircraft wheels and the service truck (one instanced draw, ring buffer, fading over four minutes), dust puffs when the wheels bite (hard acceleration or braking on dirt), plus the existing taxi dust, prop wash, rotor downwash and contact shadows. |

Tests: `npm test` adds `i18n.test.mjs` (every `t()` text has Portuguese) and
`weather.test.mjs`; `terrain.test.mjs` checks the farm platforms. Browser:
`node test/farmflow.mjs <out>` (office, conditions, accept, ferry, local
truck service, work, separate history, replay with every camera) and
`node test/expviews.mjs <out>` (water, machinery, farms from the air).

### Validation (expansion build)

- `npm test`: 80/80 (adds i18n coverage, weather cycle, farm platforms).
- Browser: `e2e_ui` 22/22, `keys` 19/19, `farmflow` 15/15, `r44flight` 22/22.
- Hands-off soy job (autopilot through the player inputs), unchanged from
  before the expansion: Ipanema 2★, AT-502B 1★, R44 2★ (90 % coverage).
- `perf.mjs` (SwiftShader, so render times are not GPU figures): game-logic
  tick per frame unchanged (medium: base 1.8 ms, low soy pass 3.1 ms,
  cockpit over corn 4.5 ms, high 2.3 ms vs 2.7 / 4.8 / 3.9 / 2.8 ms before);
  draw calls about +5 % (water, gallery forest, machines when near; the
  farms' service areas are not drawn beyond 2.2 km, machines beyond 1.5 km).

## Crops, soil and forests — realism overhaul

Same fields, crops (soy, corn, cotton; stubble, fallow, pasture), rows,
growth, coverage, missions and flight model; only how they are drawn changed.

| LOD | Distance (medium) | What draws the field |
| --- | --- | --- |
| 0 | < ~14 m | 3D plants (`src/world/cropPlants.js`): soy clumps of branching stems with folded trifoliate leaves, corn with a tapering stalk, 10 arching distichous blades and a tassel, cotton with a reddish stem, long-petioled palmate leaves, a flower and bolls. Leaves are cut-out cards / ribbons from a botanical atlas (veins, two-tone blades). |
| 1 | ~11–24 m | The same rows with a simplified plant (fewer, wider leaves) at half density; the hand-over is a screen-space dissolve (no pop, no size dip). |
| 2 | ~20–240 m | Row hedges (`crops.js`): each row a leafy tent as wide as the crop's cover, lit flank and shaded flank. |
| 3 | beyond | The canopy surface: rows of trifoliate / palmate leaves (or corn blades) seen from above, tramlines, headlands, vigour patches. It dissolves (dithered) near the camera so the plants stand on the soil. |

- Plants follow each field's rows (spacing, axis, tramlines) with a
  deterministic jitter, yaw, height, width, tone and a few gaps; they stand
  on the terrain height (relief fields included); harvested lanes have none.
- One instanced draw per crop variant (two vec4 per plant), 4 m cells
  generated once and cached, buffers refilled only after the camera moved
  3–5 m (about 0.2 ms per frame on a 50 m/s pass); plants dissolved by the
  hand-over collapse in the vertex shader; plant radius 14 / 24 / 34 m
  (low / medium / high), off above ~90 m; crop shadows on high only.
- Wind: plants bend downwind with gusts rolling across the field and the
  leaves flutter (vertex shader, shared wind state). Leaves are translucent
  against the sun.
- Soil under the crops: red-brown latossolo with fine grain and clods
  (bump), straw (palhada) between the rows of no-till soy and corn, clean
  ridged rows under cotton, the soil shaded along each row and under a
  closed canopy.
- Trees: realistic leaf-mass atlas (lobes lit like small spheres), leaf
  relief, translucency, per-tree tone; 3D crowns over the forests near the
  camera (`src/world/forestCrowns.js`) instead of a flat block.
- Validation (SwiftShader container, medium): the 3D plants cost
  0.16–0.27 ms of CPU per frame on a 10 s, 47 m/s pass at 4 m (game tick
  1.1–1.6 ms, as before); triangles on the low soy pass 0.75 M → 1.36 M,
  draw calls +3 (one per crop variant), aerial and high views unchanged;
  Ipanema soy and R44 cotton autopilot missions unchanged (90 %, 2★),
  farm flow 15/15, UI 22/22, unit tests 80/80.
- Look-dev: `node test/cropviews.mjs <out>` (same 12 views before / after;
  `VIEWS='[["name",{"cam":[x,h,z],"target":[x,h,z]}]]'` for extra views).

## Aircraft 04 — PZL M-18B Dromader (PR-DMD)

A fourth aircraft built from scratch: the classic Polish radial-engined
crop sprayer. The PR-AGW Ipanema, the AT-502B and the R44 keep their
configurations (`test/m18.test.mjs` checks their engines and figures; their
models, panels and service are untouched). The registration PR-DMD is
fictional; the reference aircraft's registration is not used.

**References.** The side photo of a yellow M-18B, the engine close-up
(blue nose case, polished collector ring, four-blade prop with yellow tips)
and the real cockpit photo (two toed-in boards either side of the hopper's
litre scale, red-knob levers). The video was used only as a look reference
(paint, cabin and panel); none of its physics, controls, missions or code.
The fuselage was fitted to the side photo: a flat silhouette of the model,
rendered from the side and aligned on the wheels, is drawn over the photo
and the cowl, hopper top, cabin, rear fairing, tail cone, fin and rudder
were moved until the outlines matched.

**Published figures used** (Jane's via Wikipedia, flugzeuginfo, PZL data;
the ASz-62IR from the engine's data sheet):

| | |
| --- | --- |
| Engine | PZL-Kalisz ASz-62IR-M18, 9-cylinder supercharged radial, 980 hp (731 kW) at 2,200 rpm, 0.687 reduction |
| Propeller | 4-blade constant speed |
| Span / length / wing area | 17.70 m / 9.47 m / 40.0 m² |
| Empty / max take-off | 2,710 kg / 5,300 kg (agricultural) |
| Hopper / fuel | 2,500 L / 712 L avgas |
| Stall, flaps down | 108 km/h (58 kt) |
| Initial climb | ≈ 1,100 ft/min |
| Working speed | 160–190 km/h |

**Estimated for the game** (not published, or sources disagree; all in
`FLIGHT_M18` in `src/config.js` with comments): prop diameter 3.3 m; CLmax
1.49 / 2.06 from the stall speeds; CD0 0.075 and Oswald 0.76 so that the
climb and a ≈ 122 kt full-power level speed come from one polar; inertias
scaled from mass and size; static thrust from momentum theory (figure of
merit 0.62); fuel flow from a radial's ≈ 0.6 lb/hp/h; the governor
schedule, manifold pressure, CHT, oil temperature and pressure. Payload is
not hopper volume: with full fuel and pilot the MTOW leaves ≈ 2,000 kg for
the hopper, so a full 2,500 L of water is over weight (the load sheet says
so).

**Radial engine** (`FlightModel._radial`, sharing `_propThrust` with the
PT6): the inertia starter turns the engine slowly; after ≈ 1.6 s and 2.5 s
single cylinders fire (a cough, a bang and a puff of smoke from the stack)
and at ≈ 3.2 s it catches in a cloud of smoke. Manifold pressure follows the
throttle (13 inHg idle → 41.3 inHg take-off); on the fine stop the rpm
follows power, above ≈ 32 % throttle the governor holds 2,200 rpm and the
blades coarsen with speed. Power comes from manifold pressure and rpm;
CHT and oil temperature rise with power and cool with airspeed; oil
pressure follows rpm; fuel flow runs 24 L/h at idle to 330 L/h at take-off.
After shutdown the engine runs down over ≈ 10 s. All of these drive the
cockpit gauges.

**Measured** (`node --test test/m18.test.mjs`):

| check | result | published |
| --- | --- | --- |
| three-point attitude | 10.2° | ≈ 10° (photo) |
| full throttle, static | 2,198 rpm (prop 1,510), 41.3 inHg, 979 hp, 330 L/h, 15.0 kN | 980 hp at 2,200 rpm |
| ground roll 3,011 / 5,300 kg | 147 m / 460 m | — |
| climb 4,200 kg at 78 kt | 1,160 ft/min (746 at 5,300 kg) | ≈ 1,100 ft/min |
| 1 g stall, flaps down, 4,200 kg | 58 kt | 58 kt |
| level, 4,200 kg | 122 kt full power; 96 kt at 62 % | working 86–103 kt |
| roll to 60° (loaded, assist) | 1.57 s (heavier than the AT's 1.2 s) | — |
| balão with 1,500 L | +36 m, no stall | — |
| dive pull-out, 800 / 1,200 L | lowest 3.2 / 4.0 m, no stall | — |
| landing | 0.87 m/s touchdown, 250 m roll, no prop strike | — |

**Spray:** 28 nozzles a side on booms that follow the trailing edge (clear
of the lowered flaps), fan-driven pump; swath 32 m and 5.6 L/s (the same
dose as the others at its working speed).

**Model** (`src/aircraft/dromaderModel.js`): the exposed nine-cylinder
radial (finned barrels, heads, push-rod tubes, blue crankcase and nose
case, governor, ignition ring, polished collector ring) ahead of a small
cowl with gills, the big exhaust stack down the right side with soot, the
oil-cooler scoop; the four-blade prop (black, yellow tips with a black
band, brass clamps) with motion blur from the shared prop disc, geared
0.687 to the crankshaft; the long hopper bay with its light-grey lid; the
glazed cabin standing on the fuselage (raked windshield from the hopper
top, door and triangular rear windows, painted roof band, red beacon, steep
rear fairing), the slim tail cone, the strut-braced tailplane low on it,
the tall fin with a big rudder; the long rectangular wing with flaps,
ailerons, tip caps, lights, walkway and filler; raked oleo main gear and a
steerable tailwheel. Yellow paint with a black cheat line, the camel badge
and "PZL M-18B DROMADER" in red, AGRO WINGS lettering, PR-DMD on the tail
cone, white-over-red tail band. Fine parts sit in a LOD that drops beyond
95 m.

**Cockpit** (`src/aircraft/dromaderPanel.js`): two toed-in boards with
Polish labels and metric dials, as in the real aircraft — airspeed km/h,
attitude, altimeter in metres, turn coordinator, heading, variometer m/s,
g-meter, flaps, fuel; rpm, manifold pressure, CHT, oil temperature and
pressure, fuel flow, hopper litres, voltage — every needle from the flight
model; annunciators; between the boards the hopper's back wall with the
stencilled litre scale and the live liquid level; the guidance GPS and
lightbar on the coaming; stick, pedals, throttle and red-knob levers that
move; the shared pilot seated in this cabin.

**Integration.** `types.js` entry `m18` (slot 04): selection card, office
list, parking (a third apron spot for when the R44 is flown), crew service
points and rates for its filler and hopper coupler, collision and wire
points, load sheet, guidance swath and an amber GPS theme, chase/orbit
cameras, cockpit vibration, V-speeds and audio profile `radial` (nine
cylinders, 4.5 firings per revolution, deep exhaust, uneven idle with
pops, crackle on a closed throttle, inertia-starter whine, coughs and the
catch on start, four-blade prop buzz from the geared prop rpm). The
autopilot's taxi routes were moved a few metres so the 17.7 m span and the
long tail clear the parked R44 and the mixing station.

**Validation.** Unit tests 93/93 (`npm test`, 13 of them the Dromader's).
Autopilot soybean contract (`AC=m18 node test/e2e.mjs soy`): service,
start, taxi, take-off, spraying to 90 %, landing, taxi back to the pad,
results, no damage; the Ipanema and the AT-502B complete the same mission
with the adjusted taxi routes. Cost in the same scenes (medium, SwiftShader,
1280×720), Ipanema / AT-502B / Dromader: chase 424 / 436 / 463 draw calls
and 1.28 / 1.30 / 1.31 M triangles; cockpit 382 / 392 / 415 calls; at the
pad 618 / 636 / 672 calls; simulation tick 1.4–1.5 ms for all three.

**Limitations.** Supercharger, mixture and carburettor heat are not
modelled (the throttle sets manifold pressure, the governor the rpm);
engine temperatures are a simple first-order model; cylinder-by-cylinder
firing is an audio effect only. The windshield is a single curved surface
(the real one has more frames). The proportions were matched to one side
photo; the plan view and wing section come from published dimensions. The
cockpit labels are in Polish as on the real aircraft; the rest of the UI
follows the game language.

## Visual rebuilds — AT-502B exterior and Ipanema

Visual only: flight models, paint, registrations, collision and service
points and the model interfaces are unchanged (unit tests and the soybean
autopilot mission pass for both).

- **AT-502B (PR-AWT)** (`src/aircraft/atModel.js`): taller, narrower cabin
  under a rounded painted roof, raked windshield with a centre post, framed
  glazing (painted outside, grey inside) with door and rear posts, hinges
  and handle; turtle deck straight off the roof with a dorsal fillet; deeper
  belly with a flanged cast gatebox, dump handle and boarding step; slimmer
  PT6 nose with a screened chin intake, cowl landing lights and a long
  pointed spinner; thicker spring-steel gear legs with root fairings. Model
  96.6 k → 107 k triangles, one mesh fewer; 1–2 fewer draw calls per view.
  Look-dev: `node test/atviews.mjs`.
- **Ipanema EMB-202A (PR-AGW)** (`src/aircraft/model.js`, `panel.js`):
  one continuous canopy (raked one-piece windshield with centre post, door
  and rear quarter windows, crowned roof into the turtle deck) with painted
  frames, rubber seals, hinges and handle; wider flat-faced IO-540 cowl with
  twin inlets; swept fin with a dorsal fillet; two-blade prop; softer
  upturned wingtips. Cockpit: grey aluminium panel with recessed 3D
  instruments behind bezels and glass whose needles follow the flight model
  (airspeed, rpm, manifold pressure, three-hand altimeter, turn coordinator,
  VSI, oil, fuel, boom pressure), switches, magneto key, mixture and prop
  levers, the guidance GPS in an AGRONAV-style housing with a sun hood and a
  flow/engine-data display, padded glareshield, magnetic compass. Shared
  helpers keep their signatures (used by the AT-502B, R44 and Dromader).
  Model 120 → 135 meshes, 78.8 k → 89.7 k triangles; small cockpit parts
  drawn within 7 m only; +15–18 draw calls in close and cockpit views,
  slightly fewer from farther away. Look-dev: `node test/ipaviews.mjs`.

## Ipanema geometry from the real airframe

The Ipanema's airframe was rebuilt from measurements instead of being
reshaped by eye (`src/aircraft/model.js`). Reference: a true side photo of
an EMB-203 (same fuselage, nose, belly and tail as the 202A), scaled by the
7.43 m overall length and placed on the physics main-wheel point; a PR-AGW
render, a cowl close-up and an in-flight photo for the nose, cabin and plan
view. The aircraft stays an EMB-202A (two-blade prop, no 203 winglets, roof
a little lower than the 203's).

- **Fuselage**: every station is its own superellipse section (half-width,
  shoulder, belly, top, upper/lower exponents), so the sides are flat and
  the roof and belly turn at real corners instead of a tube. Hopper section
  1.06 m wide × 1.17 m deep (was 1.14 × 1.34); spinner tip 2.0 m ahead of the
  main wheels (was 2.6 m) and 2.77 m ahead of the origin (was 3.35); the
  belly is flat at −0.40 m, ~1 m above the ground parked (it hung 0.35 m
  lower); the rear fuselage stays deep and slab-sided to the rudder post.
- **Nose**: IO-540 cowl barely larger than the spinner at its lip (0.60 ×
  0.42 m), top line rising steadily to the windshield base, two round inlets
  beside a polished conical spinner, oil-cooler scoop, exhaust stubs.
- **Cabin**: the lower fuselage keeps the hopper's section and is cut at the
  window sill; the canopy sections start exactly on that cut, so the glass,
  frames and roof meet the skin without steps. Windshield from the hopper
  top (z −0.29) to the roof rail (z −0.73), roof crown 1.12 m, one side
  window per side bounded only by the real frames (A-pillar, window frame,
  roof rail, C-pillar and the sill tube, which now sits on the sill instead
  of crossing the glass 11 cm above it). Cockpit, pilot and eye point moved
  with the cabin (eye at z −1.12, 0.92 m); its walls and cage stay inside
  the skin.
- **Tail and wing**: fin, rudder, stabiliser and elevators re-placed on the
  photo (stabiliser LE z −3.42, rudder post z −3.96, fin top 1.38 m); wing
  root raised 0.22 m to the measured low-wing position; dorsal fillet, wing
  fillets and gear legs re-fitted to the new skin.
- **Kept**: flight model, gear contact points (three wheels on the ground
  as before), engine, controls, spray, servicing, weight/fuel, cameras,
  HUD, instruments, paint and PR-AGW identity. The crash points, collision
  boxes, boom height, service keep-outs and stub points that sit on the
  skin follow the new surface (`FLIGHT.hard`, `types.js`).
- **Validation**: the side silhouette overlaid on the reference photo
  (`test/acviews.mjs` side/front/rear/top/3-4/cabin/ground views at
  `SCALE`), 93 unit tests, the soybean autopilot mission. Model 135 meshes,
  87.7 k triangles (was 89.7 k). Known gap: the tail wheel stays at the
  physics point, ~0.35 m aft of the 203's in the photo.

## Ipanema finalization — cabin, tail, stance and cockpit

A second pass on the Ipanema against the confirmed reference airframe (true
side photo of the EMB-203 and the orange 202 in flight, a ground photo of the
203 for the tail wheel, two cockpit photos) (`src/aircraft/model.js`,
`panel.js`, `src/config.js`).

- **Cabin**: windshield top 1.10 m and roof crown 1.16 m (were 1.05 / 1.12),
  so the roof line runs on from the windshield without a dip.
- **Rear fuselage**: measured again on the clean true side view of the
  203 (belly line as datum): the turtle deck falls off the cabin in a
  concave sweep to ~0.37 m at the fin root (0.71 m at z −2.08, 0.48 m at
  z −2.52) and runs on nearly level to the rudder post; the slab sides keep
  more width to the tail (0.34 m half-width at z −3.0, 0.25 m at −3.5), so
  the tail cone stays deep and boxy instead of tapering to a point. (A
  first pass had lowered the deck to 0.21 m from a misread photo; that made
  the tail thin and low and is undone.)
- **Empennage**: the fin rises out of a longer dorsal fillet with a
  straight leading edge swept ~35° (z −3.39 at 0.57 m, tip z −3.94 at
  1.36 m), as on the photo; the rudder runs from below the cone (trailing
  edge 4.48 m aft) to 1.43 m (4.66 m aft); tailplane at 0.10 m on the
  cone. The navy band, flag and registration follow the tail.
- **Plan view and cabin height** (third pass): the body was nearly
  parallel-sided from the wing leading edge to well behind the cabin and
  the canopy a box as wide as the fuselage, so from above it read wide and
  blocky. Now the cabin is the widest station and the body tapers both
  ways: forward over the hopper and cowl (half-width 0.475 m at z 0.8,
  0.415 m at 1.4) and aft from the cabin's rear frame (0.49 m at z −1.78,
  0.44 m at −2.08, 0.36 m at −2.52, 0.28 m at −3.0, 0.195 m at −3.5). The
  canopy section is rounder (exponent 2.8 instead of 4.2): the side windows
  lean in from the sill and the roof is ~12 cm narrower at the rails, with
  the window top kept at 70 % of the cabin height. Roof crown 1.20 m,
  windshield top 1.13 m, rear frame 1.14 m (were 1.16 / 1.10 / 1.10). The
  cockpit, eye point, panel and pilot are unchanged; the crash point on
  the roof follows the skin.
- **Cabin, windshield and rear contour** (fourth pass, measured on a true
  side photo of an EMB-203 with the model's silhouette overlaid, aligned on
  the spinner tip and the rudder's top): roof crown 1.215 m and flat to
  z −1.25 (was 1.20, falling from −0.99); windshield top 1.17 m at
  z −0.70 (was 1.13 at −0.73) and its base on the hopper top 2.5 cm higher
  (0.795 m), so the glass stands more upright (~44°) above the cowl line,
  bowed out a little more. Behind the cabin the roof now ends in a short
  shoulder at the rear frame (1.12 m) and the deck falls in a nearly
  straight ramp (1.0 m at −1.62, 0.885 m at −1.78, 0.695 m at −2.08) easing
  to 0.38 m at the fin root, instead of a broad rounded hump; the deck
  keeps the cabin's rounder section there (no filling out behind the
  cabin). The upper contour now matches the photo within ~2 cm from the
  windshield to the fin; fin, rudder and tailplane already matched (rudder
  trailing edge and height on the photo, fin leading edge within ~8 cm)
  and are unchanged. The cockpit eye point (0.96 m) is unchanged; checked
  from the seat ahead, wide, panel, left, right, up and behind: no frame or
  roof in the way, no clipping. Roof crash point follows the skin.
- **Windshield base, cabin volume, deep tail cone** (fifth pass, same
  side-photo overlay plus close views matching the owner's screenshots):
  the windshield glass used to wrap down the sides to the window sills,
  ~25 cm below the cowl line; its lower edge now runs nearly level across
  the hopper top (the corners 4.5 cm lower than the centre) and the patch
  below the corners is painted skin (dark inside). The cabin section is
  less rounded (side windows more upright, the roof wider) and the roof
  crown is 1.25 m (windshield top 1.20 m). The rear fuselage was ~12 cm
  shallower at the bottom than the photo and its lower section V-shaped,
  so the tail cone looked pinched underneath: the belly now drops a little
  behind the wing (−0.47/−0.485 m behind the cabin, rising to −0.385 m
  at the fin) and the rear sections are flat-sided with a flat bottom
  (wider keel, shoulder kept low) right to the rudder post; the bottom
  matches the photo within ~2 cm from the fin forward to z −2.1. Tail
  wheel bracket moved down onto the new skin; fin, rudder, tailplane,
  wings, gear, physics and the cockpit eye point unchanged. Checked from
  the seat (11 views): no frame or roof in the way, no clipping.
- **Cabin height and the glareshield from the seat** (sixth pass): the
  cabin now stands clearly above the photo's 203 (roof crown 1.32 m,
  rear frame 1.22 m), with a long raked windshield (top at z −0.88, 1.28 m,
  ~29° from the horizontal) and the side windows' top rail at 74 % of the
  cabin height, so the canopy reads tall and angled when parked; the
  turtle deck starts from the higher rear frame. From the seat the hood
  over the panel used to stop ~4 cm short of the windshield's lower frame,
  so the painted (orange) frame and hopper top showed between them: the
  hood is now 10 cm deep, its top runs level just above the glass's lower
  frame and drops under the raked glass to the windshield base (as on the
  real 202), the inner side of the frame is dark, and the panel stays on
  the airframe (top 0.70 m) while the seat, pilot and eye ride 6 cm higher
  (eye 1.02 m) under the taller roof. Lightbar and compass on the hood's
  roll. Checked from the seat in 11 views (no frame or roof in the way, no
  clipping, nothing orange between the hood and the glass).
- **Tail wheel and stance**: the physics tail point moved from behind the
  rudder (z −4.55) to under it (z −4.30, y −0.82), on a leaf spring from a
  bracket under the tail cone; the three-point attitude is 6.3° (was 10.8°),
  so the fin top stands about level with the cabin roof parked, as in the
  photos, and the tail sits higher off the ground. Main gear unchanged.
- **Cockpit**: no centre post (the windshield is one piece) and no exterior
  wire-cutter rod across the glass; the black padded glareshield follows the
  windshield's lower frame from sill to sill and overhangs the panel by 5 cm;
  the panel plate rose 10 cm with it and its top edge is level in the middle
  and rounds down into the corners. Lightbar on the glareshield's roll,
  magnetic compass moved there (right of centre). The guidance unit is
  smaller and lower (clear of the rounded corner). The cockpit sits 4 cm
  higher under the raised roof (eye 0.96 m at z −1.12); from the seat the
  dark hopper deck and the spinner show over the glareshield.
- **Kept**: flight model (apart from the tail contact point), main gear,
  engine, controls, spray, HUD, servicing, paint and PR-AGW identity.
- **Validation**: 93 unit tests (three-point attitude test now 5–10°), the
  soybean autopilot mission with the Ipanema (2 stars, no damage), cockpit
  views (`node test/cockpitviews.mjs <dir> ipanema`) and side / rear / 3-4
  views against the photos.

## Air Tractor structure and cockpit from the real aircraft

The AT-502B (PR-AWT) airframe and cockpit were rebuilt from photos of the
type (front, side and three-quarter views on the ground and spraying; three
cockpit views) and its published figures (span 15.85 m, length ~10.1 m,
height 3.12 m, 29×11.0-10 mains) (`src/aircraft/atModel.js`,
`atPanel.js`).

- **Fuselage**: its own cross-sections (keel superellipse narrowed toward
  the bottom, a straight wall leaning in, a rounded top with tumblehome)
  instead of round barrels: a long slab-sided PT6 cowling with a narrow
  crown, a broad nose bowl with the chin inlet between the landing lights;
  the hopper section deep but keystone-shaped; the turtle deck a straight
  line from the canopy to the fin.
- **Stance**: the wing and belly sit 0.25 m higher on the airframe (belly
  on the wing's lower surface, ~0.5 m above the tyres instead of level with
  them) and the long spring legs now run from fairings under the wing root,
  splayed out to the unchanged wheels. The cowl top line rises ~7° to the
  windshield, so sitting on its tailwheel the nose is about level, as on the
  real aircraft; the cabin moved up 0.25 m with it (height in the three-point
  attitude 3.12 m, the published figure).
- **Behind the cabin** (second pass): the turtle deck was one straight ramp
  from the roof (1.89 m at z −1.5) to the tail, which made the airframe
  look short and wedge-shaped. It is now two regions of one skin, as on the
  real aircraft: a curved cabin fairing that rolls off the roof and falls
  steeply to about the window sill (1.08 m at z −2.55), then a long upper
  deck running nearly level (~5° to the fuselage line, 1.0 m at z −3.3,
  0.87 m at z −4.5) to the fin, the tail cone keeping its depth to the
  rudder post. The dorsal fillet and the blue fin paint follow the new deck;
  cabin, fin, tail position, wing, gear and physics are unchanged.
- **Canopy**: a narrow glasshouse set in on a sill ledge (0.94 m at the
  sill, leaning in to a rounded roof) with the three-piece windshield (flat
  centre pane between two posts, angled side panes to the A-posts), door and
  rear posts.
- **Cockpit**: an arched black panel (shoulders clear of the side panes)
  with the instruments set 16 mm into it behind bezels — PT6 block on the
  left, flight instruments in the middle, hopper and flaps on the right,
  annunciator row, two switch panels and the hopper sight window — under a
  padded glareshield roll whose top runs forward to the windshield base; the
  guidance screen and a flow monitor with LED readouts on their own mount
  turned to the pilot (regions of the same panel canvas); power quadrant on
  the left console, spray valve and dump handle on the right; yellow airframe
  inside (walls, tube frame, floor, roof), red seat. Eye point 1.55 m; from
  the seat the dark, rounded nose shows over the glareshield.
- **Kept**: flight model, gear contact points, prop and spinner, controls,
  spray system (the gameplay boom line and working points in `types.js` are
  unchanged; only the visual booms rose with the wing), servicing, HUD,
  paint and markings. Crash points, collision boxes and the service
  keep-outs / stub points that sit on the moved skin follow it.
- **Validation**: `node test/cockpitviews.mjs <dir> at502` (cockpit from the
  seat: default, ahead, wide, panel, left/right, parked), `test/atviews.mjs`
  for the exterior; 93 unit tests; the soybean autopilot mission (90 %
  coverage, no damage, as before). Model 107.4 k → 116.0 k triangles,
  129 → 138 meshes; +4 draw calls in the cockpit, +11 outside.

## Wing surfaces: inward-facing faces fixed (all aircraft)

The wings, wing tips, tailplanes, elevators, flaps and ailerons of every
aircraft looked hollow from some angles: the top skin vanished, the inside
of the lower skin showed through with odd sawtooth shading, and fittings on
the wing seemed to float. Cause: the shared panel builder `wingPanel`
(`src/aircraft/model.js`, also used by the AT-502B, M-18B and R44 models)
wound every triangle clockwise seen from outside, end caps included, and
these materials cull back faces, so the outward-facing skin was the one
dropped. It now winds faces outward on both wings and closes the profile
ring, which also closes the hinge face of each flap and aileron (it was
open). The fins and rudders, built by mirroring a panel (x/y swap), get
their winding flipped back (`flipWinding`, now exported). Checked with a
diagnostic render (both sides drawn, front faces green, back faces red)
from above, below, the sides, the tips and the root on the Ipanema,
AT-502B, M-18B and R44: no back face is visible from outside apart from the
deliberately double-sided prop disc, glass and headliner. Same draw calls;
two more triangles per panel segment. 93 unit tests and the soybean
autopilot mission on the Ipanema, AT-502B and M-18B pass (no damage).

## Airstrips expansion — eight Brazilian farm strips

The map grows from 8 × 8 km to 12 × 12 km (`WORLD_HALF` 6000; the terrain
grid stays 15.6 m: 768 × 768 cells, 750 m chunks with the same LOD steps).
The original 8 × 8 km country is untouched — heights, fields, trees, strips
and missions are the same, checked point by point against the previous
build. The new outer ring carries eight farms, each with its own strip,
service area, local truck and badeco, requests in the office computer and
its own land, all built on the existing systems (`FARMS` / `SITES` in
`src/world/layout.js`, the farm contracts, the office, the crew follow).

| Farm | Where | Strip | Land, surroundings | Difficulty | Aircraft |
| --- | --- | --- | --- | --- | --- |
| Fazenda Horizonte | north | 720 × 24 m red earth, level | flat cerrado farmland, big soy/corn blocks, silos, big shed | ★☆☆☆☆ | all |
| Fazenda Dois Lagos | north-west | 560 × 16 m red earth, −1.2 % eastbound | gentle swells, two açudes (one off the east end), farmhouse, corral, pier | ★★★☆☆ | all |
| Fazenda Serra do Cedro | north-east | 540 × 16 m gravel, +3.6 % eastbound, 1.2 % cross slope | the land climbs east into hills, stepped soy, corn on the ridge, boulders by the strip, stakes | ★★★★☆ | Ipanema, AT-502B, R44 |
| Fazenda Mata Alta | far west | 440 × 14 m rough red earth, −1 % | cut through tall native forest (trees 34 m from the centreline); the talhões are clearings walled in along their passes, with 150–230 m at each end to drop in and pull up over the trees; threshold tyres only, rustic shed | ★★★★★ | Ipanema, R44 |
| Sítio Ipê Amarelo | east | 400 × 13 m red earth, −2 % | small cerrado farm, yellow ipês round the house, whitewashed stones | ★★★☆☆ | Ipanema, R44 |
| Fazenda Vale Verde | south-east | 500 × 16 m mown grass, +1 %, tilted 2 % to the creek | strip cut into the valley side above the Córrego Vale Verde, soy and corn on both slopes, a dam downstream | ★★★★☆ | Ipanema, AT-502B, R44 |
| Fazenda Terra Vermelha | south | 580 × 20 m red earth, slight cross slope | big Mato Grosso farm: six silos, dryer, two big sheds, huge cotton/soy | ★★★☆☆ | all |
| Fazenda Chapada dos Ventos | south-west | 520 × 18 m pale sand, cross slope | on a plateau 42 m above the plain with a 300 m escarpment, wind turbines, radio mast, gusty wind (×1.45 mean, ×2.2 gusts) | ★★★★★ | Ipanema, AT-502B, R44 |

How it is built:

- **Terrain** (`src/world/relief.js` `ringReliefAt`): zero inside the old
  map, faded in over 400 m and out again at the map edge. Region zones set
  the land: calm swells on the flat farms, rolling ground at Dois Lagos, a
  21 m ramp plus hills at Serra do Cedro, a 24 m valley along the creek at
  Vale Verde, the warped rounded plateau at Chapada. The strips are graded
  platforms (`stripLevel(site, x, z)`: grade along, bank across, both only
  past the first 100 m so the service area stays level); on the outer farms
  the platform level is fitted along the grade, so a sloping strip follows
  its hillside (cut/fill under 14 m) instead of standing on a fill. No
  floating strips: the strip *is* the terrain the wheels and the renderer
  read. The creek now runs to both map edges.
- **Strips**: two new surfaces in the ground shader (rough red earth with
  grass tufts, chapada sand), both rolling like grass; markers per farm
  (tyres, white stakes, whitewashed stones, threshold rows only); a third
  windsock on the windy plateau; threshold boards share their materials.
- **Scenery** (`buildProp` in `src/world/structures.js`): silos, dryer, big
  sheds with machines, farmhouses, water towers, corrals, a pier and boat on
  the açude, boulders, a forest shack, fuel drums, a lattice radio mast and
  wind turbines with turning rotors — all with colliders, all outside the
  truck's planning yard, the strips, talhões and roads (unit-tested).
- **Vegetation**: everything in the outer ring — its forest blocks, the
  creek's new stretches, the new stream and açudes, isolated trees, cerrado
  clumps, scrub, termite mounds, gallery woods in the valleys — draws from
  its own random stream, after the original map's, so no original tree
  moves (checked instance by instance against the previous build: 29,688
  trees and 4,599 obstacles identical; one tree gives way to a new road and
  the new roads get their verge scrub). Tall trees are cleared 60 m from a
  strip's centreline (34 m at Mata Alta, whose talhões keep the forest up to
  their edges). Adjoining ring blocks close their roofs without a seam (a
  side against another block is not an edge), trees buried where blocks
  overlap are dropped, and forest roofs are merged per 3 km region (culled
  per region). Farm parked trucks are built when the camera first comes
  within 2.5 km.
- **Roads**: seven access roads (draped ribbons, grade under 10 %) from the
  farm yards to the farm network or off the map — Chapada's comes down its
  escarpment. Mata Alta is reached by air only.
- **Requests** (`src/game/farmContracts.js`): fourteen new ones from the
  farmers, with message, conditions and tips. Pay per hectare follows the
  farm's difficulty (≈280 / 360 / 450 / 560 / 680 R$/ha for 1–5, +40 per
  terrain level, a little more for corn and cotton) and the bonus rises
  with it (4,000 → 9,500).
- **Office** (`src/ui/office.js`): requests grouped by farm, easiest first,
  each card with the farmer, distance and direction from the base and from
  you, crop, area, terrain level, strip, difficulty stars, the aircraft the
  strip takes and the expected credit. Every farm strip has its own office:
  stopped on the ground at any site you can read and accept the next
  request there (`officeSite()`), so jobs follow one another with no flight
  back to the base; aircraft are still changed at the main base. A strip
  refuses an aircraft it is not cleared for (`stripAllows`).
- **Maps**: 12 km base map at 1536 px, farm pins in each farm's colour with
  a ring round the farm of the accepted request; the full map frames the
  aircraft with its job (or the base). Mouse wheel zooms about the cursor
  (out to the whole 12 km map, in to ~500 m) and a drag moves the full map
  (M) and the office map (`mapControls` in `src/ui/maps.js`; a plain click
  still closes the full map); the wheel over the minimap zooms it from
  ~500 m to ~6 km across.
- **Wind**: `windFactorAt` raises the mean wind and the gusts within 2 km of
  the Chapada strip (flight model wind, felt in the aircraft and windsocks);
  a "windy" weather tendency there.

### Validation (airstrips build)

- `npm test`: 101/101 — adds `test/farms.test.mjs`: the eight strips and
  their identities, no floating strip (strip = terrain, level service area,
  cut/fill under 14 m), the old map's relief untouched, every farm's
  requests and their talhões, pay rising with difficulty, aircraft
  clearance, scenery clear of strips / talhões / roads / the truck yard,
  the plateau wind, and a **take-off from every strip with each airplane it
  takes**, at the heaviest recommended load, downhill where graded: lift-off
  after 34–65 % of the strip (Ipanema 258–369 m, AT-502B 185–225 m,
  M-18B 187–199 m).
- Terrain: 331,776 samples over the original 8 × 8 km identical to the
  previous build.
- Browser, `node test/stripflow.mjs <out>` (all eight farms, Ipanema): crew
  and office follow to the strip, the farm office lists its requests and
  one is accepted on the spot, the local truck loads the recommended fuel
  and liquid, the talhão is sprayed to completion (98–99 %), handed in at
  that farm and paid (R$ 8.5–17.7 k), the save keeps money, completions
  and the farm history; Mata Alta refuses the AT-502B. 52/52.
- Regression: `farmflow` (the three earlier farms, office, replay) 15/15;
  the hands-off soybean job on the main farm by the test autopilot: 2★ as
  before.
- `node test/stripviews.mjs <out> [ids]`: pad, wide and final-approach
  views of each farm (no page errors).
- Generation in Node: terrain grid 0.73 s (previous build 0.62 s for a
  grid 2.25× smaller), vegetation 1.24 s (0.80 s) after exact quick rejects
  (creek and stream bounding boxes, zone circumcircles, plateau bounds) and
  a 200 m grid for the outer roads.
- `perf.mjs` (SwiftShader, so render times are not GPU figures), low:
  game-logic tick per frame unchanged within noise (base 0.96 / 0.79 ms,
  low soy pass 3.1 / 4.2, cockpit over corn 1.8 / 1.9, high 1.4 / 1.05);
  draw calls in the original map +3 % (626 / 608: forest roofs per region,
  long road ribbons), triangles −5 % (750 m terrain chunks). At the farms:
  Mata Alta 896 calls (forest all round), Chapada 721. Terrain fragments
  of the original map test only its own talhões and strips (outer pixels
  only the ring's). JS heap after load ~310 MB (250 MB before).
- Open point (software renderer only): in one scripted `perf.mjs`
  sequence, a single frame about ten frames after the airborne aircraft is
  teleported over the Chapada takes minutes under SwiftShader. It needs the
  aircraft model visible but none of the farm scenery, terrain, vegetation,
  spray, wind or crew move, and compiles no new shader; the previous build
  shows similar one-off stalls (~8 s) on its first airborne frame. Not seen
  in the farm flows or the view renders; not checked on a GPU here.

## Ipanema engine sound — layered IO-540

The Ipanema (EMB-202A, Lycoming IO-540, six cylinders flat, two-blade
fixed-pitch Hartzell) has its own engine sound, `src/audio/ipanemaEngine.js`,
on the game's single AudioContext (audio profile `ipanema`). Every other
aircraft keeps its sound unchanged. Everything is synthesized: no audio from
the reference videos is embedded, and no loop is just re-pitched.

**Reference analysis** (three recordings: start-up, take-off, landing/take-off
pass; RMS, 1/1-octave bands, peak picking, envelope modulation). Start-up:
starter whine ~850 Hz with compression pulses at 4–7 Hz, catch at +5 s with a
level flare ~1.4× the settled idle, then idle with firing at ~33 Hz and
harmonics at 67/100/199 Hz (≈650–670 rpm: firing = rpm/20). Take-off: firing
order dominant (145–151 Hz in the recording, with Doppler), strong 4, 4.5, 5
and 6 shaft orders, ½-order modulation (~24 Hz), and a 1–4 kHz band that rises
with power. Pass: Doppler shift ~148 → 127 Hz. The dominant peaks are orders
of the crank, so they are not read as rpm directly.

**Layers.** A starter (a heavy starter-motor growl at ~85–120 Hz and a low
thump per compression, as in the reference's 46–60 / 80–130 Hz weight, with
the whine and gear rasp above it; three compressions per revolution of the
simulated cranking rpm); B catch (individual firings
scheduled from the rpm, level flare, misfires while it settles, last cough
and the crank rocking back at shutdown, afterfire when the throttle is chopped
at high rpm); C/D/E three harmonic spectra on the engine-cycle frequency
(rpm/120 — so the ½ orders of a six are there), equal-power crossfaded by rpm
and load: low idle, mid, high power; plus exhaust blat and the open-throttle
rasp, both gated by the firing pulses, and the valve-train tick; F propeller
(blade-pass tone rpm/30, blade-modulated whoosh ∝ rpm³, tip-Mach rasp as the
2.2 m blades approach M 0.9 at 2700 rpm); G cabin path (low shelf, 95 Hz
airframe resonance, two low-passes and a high shelf for firewall/canopy, a
structural buzz at the firing order). Exterior path: high-pass, air-absorption
low-pass with distance, PannerNode (inverse distance, emitter on the
aircraft in camera space) and a mild Doppler (60 % of the physical shift,
clamped ±10 %) from the aircraft and camera velocities. Inside/outside
crossfade over ~0.3 s; the sources never restart.

**State machine.** OFF → START_REQUESTED (until the crank turns) →
STARTER_ACTIVE (while the flight model cranks) → CATCH (flight model
running, until the rpm nears idle) → IDLE_STABILIZATION (until the rpm stops
moving) → RUNNING; SHUTDOWN → OFF on cut-off. All transitions are read from
the flight model's engine state and rpm, which also spin the propeller.
Inputs (`ipanemaAudioState`): engine state, rpm, throttle, power fraction,
camera, emitter position in listener space, distance, closing speed —
never airspeed as rpm.

**Tests.** `node test/ipanema_audio.mjs [outDir]` renders the engine offline
(OfflineAudioContext, 30 Hz control steps driven by a copy of the piston
engine dynamics) for off/start/idle/throttle up/full/throttle down/shutdown
(outside and cockpit), a 50 m/s flyby and an aircraft switch; writes WAVs and
checks silence when off, after shutdown and after switching, the state
order, no clipping, bounded one-shots and no node growth.
`AGRO_URL=http://localhost:4173/ node test/ipanema_audio_game.mjs` checks the
same in the game (start sequence, cockpit crossfade without restart, high
layer at full throttle, silence on switching aircraft, nothing duplicated on
coming back, shutdown).

Rendered vs reference (bands relative to the loudest, 31 Hz…8 kHz):
idle 31/63/125/250/500/1k/2k/4k = −6/0/−2/−11/−10/−11/−12/−16 dB against
−20/0/−3/−11/−8/−10/−19/−19 dB; full power centroid ~1.05 kHz against
~0.96 kHz. The phone recordings lose everything below ~60 Hz, the game keeps
more of it.

**Limits.** The simulation cranks for 1.3 s toward 260 rpm (the real start
takes ~5 s at ~100–150 rpm), so the starter phase is shorter and its
compression chug faster than in the video; the sound follows the simulation
rather than a fixed recording. The simulated rpm does not overshoot on the
catch; the flare is a level effect only. A match with the recordings is
spectral and statistical, not sample-exact; real IO-540 samples (start, idle,
run-up, take-off, flyby, cabin) would allow a hybrid sample + synthesis
version.

## Aircraft 05 — Thrush 510G (PR-TSH)

A fifth aircraft with its own geometry, physics, cockpit and sound
profile; the other four keep theirs (`test/thrush.test.mjs` checks their
engines and figures). PR-TSH is a fictional registration.

**References.** Six exterior photographs of 510Gs (white with the red
swoosh, the parked side view, two in flight, a spray pass, a top-quarter
view) and three cockpit photographs (in flight over a field, the whole
panel from the front, the interior from the seat). Where the photos show
other 510 versions, the 510G figures were used.

**Figures used** (as given for the game; Thrush data): length 9.85 m,
span 14.48 m, height 2.84 m; GE H80 turboprop, 800 shp, prop governed at
2,080 rpm; Hartzell four-blade, 2.62 m; empty 2,132 kg, max take-off
4,763 kg; hopper 1,930 L; fuel 863 L; working speed 145–241 km/h; cruise
≈ 256 km/h at 55 %; stall ≈ 89 km/h; VNE 303 km/h.

**Estimated** (all in `FLIGHT_T510G`, `src/config.js`, with comments):
wing area 34.4 m² (the 510's 370 ft²); CLmax 1.57 clean / 2.3 flaps so the
89 km/h stall falls at ≈ 3,000 kg flaps down; CD0 0.045 — the 256 km/h
cruise is a clean-airframe figure; with booms, nozzles and wire cutter the
model flies 215 km/h at 61 % power; inertias scaled from the AT-502B by
mass and span; the H80's quicker spool (Ng 19 %/s up vs 14 for the
PT6A-34), fuel flow from ≈ 0.6 lb/shp/h. Geometry fitted to the parked side
photograph (outline points converted to the body frame at the 10.5°
three-point attitude) and to the published dimensions.

**Measured** (`node --test test/thrush.test.mjs`):

| check | result | reference |
| --- | --- | --- |
| three-point attitude | 10.5° | ≈ 10° (photo) |
| start | light-off 2.6 s, idle 11.6 s | — |
| full power, static | 801 shp, 2,080 rpm, 272 L/h | 800 shp |
| 90 % torque after full lever | 2.8 s (AT-502B ≈ 4 s) | quicker than the PT6 |
| take-off roll 2,617 / 4,763 kg | 148 m / 488 m | — |
| climb at 4,200 kg, 97 kt | 932 ft/min (AT-502B 861) | — |
| stall 3,000 kg flaps down / 4,763 kg clean | 48 kt / 75 kt | 48 kt |
| level at 3,800 kg | 145 kt (268 km/h) full power, 116 kt (215 km/h) at 61 % | below VNE; working band |
| roll to 60° (assist, loaded) | 1.07 s | — |
| balão 1,200 L / dive pull-outs / landing / low turns | no stall, lowest 2.7 m, 0.34 m/s touchdown, 2.5 m lost at 60° | — |

Payload is not hopper volume: with full fuel and pilot the MTOW leaves
≈ 1,850 kg, less than a full 1,930 L hopper of water (the load sheet says
so). Against the AT-502B: lighter, 50 shp more, a quicker engine and a
crisper roll, a slightly shorter span; heavier on the stall at MTOW.

**Exterior** (`src/aircraft/thrushModel.js`, shared sections in
`thrushGeom.js`): its own cross-sections — the slim H80 cowl falling to a
long polished spinner, round bronze exhaust stubs, chin inlet, dark
anti-glare top, the tan fibreglass hopper lid with the yellow vent cap,
the tall glasshouse (windshield base 1.2 m, roof 1.86 m above the CG) with
a three-piece windshield, door and quarter windows, white roof with the
vent hatch, wire cutter and deflector cable, the parked wiper; a steep
cabin fairing into the upswept tail cone; tall square-topped fin with a big
rudder and trim tab, strut-braced tailplane with red tips; constant-chord
wing (upper and lower surfaces closed, separate flaps and ailerons on
their hinge lines, red rounded tips with 510G, nav lights and strobes,
walkway, filler); tubular main legs with drag braces on 29×11 tyres, a
long tailwheel spring; booms with 48 nozzles on hangers ahead of the flap
hinge, fan pump, gatebox; four-blade Hartzell feathering on the ground,
blade fade into the shared disc. Livery: white with the five-band red
swoosh, GE roundel and THRUSH badges, registration, small AGRO WINGS.
Fine parts in a LOD beyond 90 m.

**Cockpit** (`thrushCockpit.js`, instruments in `thrushPanel.js`): a 3D
black panel tilted 12° under a padded hood with rounded corners; MVP-50T-
style engine monitor (Ng, ITT, Np, torque %, fuel flow, fuel, run timer,
alerts — oil, fuel pressure, volts and OAT are not simulated and read
"--- N/S"), master caution / warning lamps, airspeed (MPH, knots) and
altimeter with 3D needles, a G5-style attitude unit (attitude, tapes,
heading, slip), the hopper sight window with the live level, the AG-NAV-
style monitor in an olive bezel showing the game's guidance (talhão, pass
lines, coverage, track, cross-track, job progress, boom state; soft keys
are labels only), the glareshield guidance display with the LED lightbar;
sloped consoles (toggles, dimmers, low-fuel lamp; breaker matrix, start /
battery, tailwheel placard), the hopper wall with its litre scale, stick
with red buttons, two pedal sets with master cylinders, power and
condition levers on the left wall, the boom valve on the right, a black
mesh seat with harness, white walls and tube frame, window seals, roof
lining. Screens redraw only when their values change (G5 at 15 Hz, the
others at ≤ 5 Hz), each on its own small canvas. Eye 1.57 m above the CG,
0.44 m behind it, its own look-down (−11.5°) and 68° field of view.

**Integration:** registry entry `thrush` (slot 05): selection card,
office list, a fourth apron spot (used when the R44 is flown), farm strips
(cleared wherever the AT-502B is; not at Mata Alta and Ipê Amarelo), crew
service points and rates, collision / wire points, load sheet, guidance
theme, cameras, audio profile `h80` (the turboprop layers with a higher
compressor whine, brighter roar and the four-blade blade-pass — synthesized,
not a recording of an H80).

**Validation.** Unit tests 114/114 (`npm test`, 13 of them the Thrush's); `test/thrushcockpit.mjs`: the
game's cockpit camera parked, taxiing, level, turning, pulling up, looking
left / right / down / up, back to chase, in 16:9, 4:3 and 21:9; nearest
surface 27 cm from the eye; instruments follow the flight model.
Autopilot soybean contract (`AC=thrush node test/e2e.mjs soy`): done, 90 %
coverage, no damage (AT-502B: same score, 10 % longer flight). Draw calls
in the same scenes (medium, SwiftShader): chase 510 (AT-502B 468,
Dromader 486), cockpit 632 (619 / 641), side 635 (596 / 622).

**Limitations.** No oil, fuel-pressure, electrical or outside-air model,
so those indications read N/S. The wiper is static. The swoosh, the
windshield and the fin were matched to photographs, not drawings. The
cockpit switches are visual except where a simulated system exists
(spray valve, power and condition levers through the existing controls).

## Fix — aircraft missing after a change from the menu

Parked aircraft are not drawn beyond 1.2 km from the camera. When one of
them was hidden that way (the flown aircraft had gone far from the base)
and was then chosen from the menu, nothing showed it again: it flew
invisible until it was re-selected near the base. The aircraft made active
is now shown when it is activated, and the flown aircraft is never culled
(each frame). `test/fleetswitch.mjs` flies each aircraft far away, goes
back to the menu, picks every other one and starts it in the air and on
the ground (40 changes): 40 hidden before the fix, none after.

## Aircraft 06 — Bell 206B-3 JetRanger III, agricultural (PR-AGJ)

The second helicopter, with its own geometry, figures, engine branch,
cockpit and sound profile; the R44 and the four airplanes are unchanged
(their tests and the R44's end-to-end contract give the same results).
Title screen: AIRCRAFT 06 · Bell 206B — "Bell 206B JetRanger —
Agricultural". PR-AGJ is a fictional registration.

**References.** Five photographs of agricultural 206s (the dark-blue one
spraying over a canal, the white/maroon one with the belly tank, the green
one from the front, the green one in flight from the side, the red one in
three-quarter view) and five of the 206B-3 cabin (the whole cabin through
the left door, the classic analog panel from the front — the main panel
reference —, a simulator view, a cockpit with extra avionics and one with a
portable GPS on the glareshield). Operators' changes in the photos were
not copied; the build is one configuration: a 206B-3 with the classic
analog panel, the 250-C20J and the DART/Simplex Model 4900 spray kit.

**Figures used.** Bell 206B-3: rotor 33 ft 4 in (10.16 m), two blades,
13 in chord, 394 rpm at 100 % N2; tail rotor 5 ft 5 in (1.65 m); MTOW
3,200 lb (1,451 kg); 91 US gal (344 L) of Jet-A; Rolls-Royce (Allison)
250-C20J, 420 shp, limited by the transmission to 317 shp (torque 100 %,
5 min) and 270 shp continuous (85 %); N1 ground idle 62–64 %. Simplex 4900
(DART product page): belly tank 530 L (140 US gal), mid-ship booms 35 ft
(11 m) at 95 % of the rotor diameter, 84 kg, approved on the 206A/B;
swath 15–21 m, 100 mph placard with booms (manual).

**Estimated** (in `FLIGHT_B206`, `src/config.js`, with comments): empty
weight 771 kg, inertias, rotor inertia, drag areas, tail-rotor arm and
height, skid geometry, the power-model constants. Full of fuel the 530 L
tank is over the MTOW (as in service: the load sheet shows how much the
day allows — 415 L with 120 L of fuel).

**Physics** (`src/flight/heliModel.js`, shared with the R44 through its
figures; the R44's own behaviour is unchanged — its tests pass as before):
- turboshaft branch (`engine.turbine`): no belt clutch; the starter takes
  N1 up, light-off part-way through, the rotor comes up with N2 at ground
  idle, then the throttle opens to 100 %; N1, TOT (peak at light-off),
  torque (% of the 317 shp limit) and the transmission oil come from the
  simulated power and speeds;
- heavier per unit of power than the R44: hover at the MTOW at 82 % out of
  ground effect (R44: 70 %), ~920 ft/min at full power there, the power
  answering later (turbine), the nose turning slower on the pedals, level
  top speed ~123 kt;
- the spray kit is part of the state: its mass and drag, the tank and boom
  hard points; without the kit none of them (and no spraying);
- `test/b206.test.mjs` (8 tests, in `npm test`).

**Exterior** (`src/aircraft/b206Model.js`, visual only): the JetRanger's
round nose and wrap-round two-piece windshield, front and rear door
windows, green-tinted roof windows, the transmission/engine fairing with
the air inlets and the two upturned exhaust stacks, the long tapered boom
with the drive-shaft cover, the horizontal stabiliser with the B-3's
end-plate fins, swept upper and lower fins, tail skid, the tail rotor on
the left of the fin, low skids on arched cross tubes with steps. Main rotor:
two-blade underslung teetering hub, white tips, coning with rotor speed,
tilting with the simulated tip-path plane, the R44's speed-dependent motion
blur (never a solid disc). Spray kit: the carbon-glass belly tank between
the cross tubes (its hangers go to the cross-tube saddles; it does not
touch the tubes), its pump and manifold, the 10.7 m boom as a light truss
with 44 nozzles 0.3 m over the ground (≈ 3° of roll before a tip
touches), clamped to the skid tubes and braced to the fuselage. Three paint
schemes on one geometry (only the livery map and three colours change):
A Agricultural Classic (white, green and blue stripes), B Dark Green
Agricultural (dark green over cream, light tank), C Red Utility. Paint and
kit are chosen on the aircraft's card on the title screen; accepting a
contract refits the kit.

**Integration.** Second helipad (H2) on the grass east of the apron, 23 m
from the R44's (both rotor discs and the truck's stands clear), drawn at
the base and at every farm strip; the truck services the Bell there.
Parking, selection, contracts, the farm strips that take the R44, office,
history, save, map, HUD, the AGROWINGS NAV colour scheme of the guidance,
audio profile `c20` (the 250's sharper compressor whine and a softer roar
under the rotor layers), turbine start toast, the test autopilot (the
spool-up now waits for the type's governed rotor speed).

### Bell 206B-3 cockpit

`src/aircraft/b206Panel.js` (faces, screens), `src/aircraft/b206Cockpit.js`
(3D), placed in `b206Model.js`:
- **Panel** after the frontal photo: black housing with the photo's
  outline (wide, upper corners on a large radius, sides drawn in to the
  bottom), a moulded hood over the caution row, the light-grey face plate
  set into its rim, the panel tilted back 12°.
- **Instruments** in the photo's columns: ENG OIL (pressure / temperature),
  TORQUE, AIRSPEED, ATTITUDE, ALTIMETER; the digital clock, XMSN OIL, TURB
  OUT TEMP, the dual tachometer (rotor and power turbine), the directional
  gyro, the VSI; FUEL QTY, GAS PRODUCER (N1), two blanked optional
  positions, the turn coordinator; LOAD, FUEL PRESS; the guarded FUEL
  VALVE switch, LV knob, BAT TEMP and N2 placards. Every instrument: case,
  bezel, recessed dial, 3D needles, glass, four screws. All read the
  simulation (N1, TOT, torque, N2, rotor, oil, transmission oil, fuel,
  load, airspeed, altitude, vertical speed, attitude, heading, rate of turn
  and slip); fuel pressure is the boost pumps' with the master on.
- **Caution row**: 10 × 2 framed lenses (ENGINE OUT, ROTOR LOW RPM, XMSN
  OIL PRESS/TEMP, CHIP lights, FUEL PUMP/LOW/FILTER, GEN FAIL, BATTERY
  HOT/TEMP, START, BAGGAGE DOOR, AUTO REIGN, SPRAY ON). Only those the game
  simulates light, from its state (cold: dark; start: ENGINE OUT, ROTOR LOW
  RPM, XMSN OIL PRESS, GEN FAIL, START; flying: none; low fuel: FUEL LOW);
  redrawn only when a lamp changes.
- **Pedestal**: a sloping box from under the panel to the floor between
  the seats, raised modules (audio, COM 1, NAV 1, transponder, the Simplex
  controller, a switch row) with knobs and toggles, the two VENT pulls.
- **Controls and cabin**: Bell conventional cyclic from the floor (boot,
  grip with trim hat and trigger, the right hand on it), the collective
  with its throttle grip on the left of the seat, pedals on arms to their
  floor pivots, beige leather seats with belts, the rear bench.
- **AGROWINGS NAV**: a 7-inch colour unit on a short arm on the left of the
  hood (≈ 18° below the horizon, left of the pilot's forward view), live
  screen and anti-glare glass, four soft keys — MAPA (moving map: farms,
  strips, talhões, destination), DESTINO (name, distance, bearing, ETE,
  course arrow; the ferry target, else the job's talhões, else the base),
  MISSÃO (contract, crop, area, passes, liquid, fuel, sorties, coverage
  against the 90 % target), COBERTURA (the talhão with the passes and the
  coverage the game recorded). Click a key in the cockpit view, or press N
  there to step through the pages. Drawn from the game's guidance and job
  (nothing external), at most 4 Hz and only when its content changes; the
  mission figures once a second.
- **Camera**: the pilot's eye in the right seat, 0.78 m from the panel,
  17° down, 66° field of view.

### Validation (Bell 206 build)

| Check | Result |
|---|---|
| Node | `npm test` 122/122 (8 new Bell tests; R44 and airplanes unchanged) |
| Contract (`AC=b206 node test/e2e.mjs soy`) | flown through the player's inputs: three sorties, 90 %, 2★, no damage |
| R44 regression (`AC=r44 node test/e2e.mjs soy`) | 90 %, 2★, no damage |
| Views (`node test/b206views.mjs`) | left, right, front, rear, top, underside, front ¾, in flight, with and without the kit, cockpit, parked, the three schemes; four skids on the ground, boom tips 0.26 m and tank 0.16 m above it |
| Cockpit (`node test/b206cockpit.mjs`) | parked, start, hover, level, turn, left, right, pedestal, chase; 16:9, 4:3, 21:9; eye clearance 22.7 cm (dev server); GPS keys clicked through the game for every page with and without a contract; cyclic follows the cyclic; lamps follow the state; cockpit / chase / orbit switching |
| Fleet switch (`node test/fleetswitch.mjs`) | 60 changes, none with the flown aircraft hidden |

Performance (SwiftShader, 960×540, medium; the build before the Bell and
this one, two runs each; frame times on the software renderer are noisy):

| | before | after |
|---|---|---|
| load to the title screen | 63.7 / 46.1 s | 39.2 / 39.4 s |
| Ipanema at the pad (chase): draw calls / frame | 679 / 15.8, 12.0 ms | 745 / 14.2, 15.0 ms (the Bell parked on H2 in view) |
| R44 cockpit over the corn: calls / frame | 465 / 12.1, 14.4 ms | 465 / 11.3, 12.4 ms |
| Bell cockpit over the corn: calls / frame | — | 481 / 12.3, 15.1 ms |
| Bell chase: calls / triangles | — | 556 / 1.85 M |
| geometries / textures in memory | 753 / 54 | 923 / 70 |
| JS heap | 373–374 MB | 413–445 MB |
| parked meshes drawn (R44 / Bell / Thrush) | | 32 / 39 / 77 |

## Registrations chosen by the player

Settings → **Prefixos** (Registrations) has one row per aircraft: the
nationality prefix (PP, PR, PS, PT or PU) and three letters. Only marks in the
Brazilian civil format are accepted — letters only, not starting with Q (the
Q code), none of SOS / XXX / PAN / TTT / VFR / IFR / VMC / IMC, and no two
aircraft of the fleet with the same marks; the button beside each row puts
back the factory marks (PR-AGW, PR-AWT, PR-DMD, PR-TSH, PR-AGH, PR-AGJ). The
choice is saved with the settings and applied before the fleet is built.

Changing the marks only redraws the letters: the livery canvas (the fuselage
or tail-boom registration — on the Bell, for the scheme in use) and the panel
placard (Ipanema, AT-502B, Dromader, Thrush, R44). Geometry, colours, scheme,
kit, fuel, hopper and damage stay as they are. Every text that names the
aircraft (title card, load sheet, office, histories, replays, messages) reads
the current marks. `test/registration.test.mjs` checks the format rules and
the per-aircraft storage.

## Assistance: off or on, the physics unchanged

The old Normal / High assistance (control laws that held attitude, limited
bank, pitch and g, levelled the helicopter and held the hover) is gone from
the settings. Settings → **Assistência** has one switch per kind of aircraft,
**off by default**; older saves start off too (`assistV: 2`). With it off the
keys move the control surfaces, cyclic and pedals directly.

On, `src/flight/pilotAid.js` adds small helps after the raw mapping, each one
can be unticked:

| Airplane | |
|---|---|
| Soft pedal on the ground | expo on the pedal and less travel as the ground speed builds (full at a walk, half from ~45 m/s), light yaw damper — a 0.5 s 60 % jab at 15 m/s on the take-off roll swings the loaded Ipanema 142° raw, 5° with it (AT-502B: 61° / 4°) |
| Smoothed controls | expo on stick and roll — finer near the centre, full travel at the stop |
| Light turn coordination | a little rudder against the sideslip |
| Speed × weight warnings | "slow for the weight — N kt minimum" from the wing's CLmax, the mass, the flaps and the bank (1 / cos φ), and "speed running out in the climb" |

| Helicopter | |
|---|---|
| Torque compensation | detailed rotor model: the hover trim measured on each model (pedal = a + b·Q, left cyclic against the tail rotor's drift, `aidTrim` in the config) under the centred keys — hands-off yaw in a hover 188°/s → 2°/s (Bell 203 → 2) |
| Light stabiliser | rate damper on pitch, roll and yaw; no attitude hold: after a 0.7 s full forward jab the nose still goes on down, at about half the rate (R44 power model −47° → −21° 1.5 s later) |
| Smoothed controls | expo on the cyclic |
| Hover warnings | drift over the ground in the pilot's frame, ground effect |

The helicopter flight model stays as it was (Power — one lever — by default,
Detailed rotor as the option). `Assist` / `HeliAssist` keep their control laws
only for the test autopilot (`'normal'`, `'auto'`) and the handling tests.
`test/aids.test.mjs` checks the numbers above.

## Dromader cockpit — layout after the real cabin

The pilot's view is rebuilt after the reference photos (interior only — the
exterior is unchanged; outside views compared pixel by pixel, only the
interior seen through the glass differs):

- **Glareshield hood**: an arched black shell with a rolled lip, kept inside
  the windshield base, the lightbar on its crown. The flight panel sits
  recessed under it, low enough that the windshield is clear over the cowl
  (hood lip ≈ 15° below the eye line, at the windshield base; the camera
  looks 11° down instead of 17°, `cockpitPitch: -0.2`), the nose straight
  ahead in the centre.
- **Three boards on one canvas** (`M18_PANEL.up / left / right`): the wide
  flight panel (ASI km/h, attitude, metric altimeter, DG, variometer, turn
  coordinator); the lower left board with the eight warning lamps (built
  into the board — nothing floats above it any more), the switch row, RPM,
  manifold pressure, fuel, g-meter and flaps; the lower right board with
  CHT, oil temperature and pressure, fuel flow, hopper, voltage and the
  spray readout.
- **Hopper wall** between the lower boards: riveted tan plate with a narrow
  sight window, the liquid level shown in it, and the litre scale.
- **GPS**: a tablet on an arm at the right end of the hood, turned toward the
  pilot; the case sits behind the screen (the old bezel box stood in front of
  it and covered half the display).

`node test/m18cockpit.mjs <outDir>` renders the parked, level-flight and GPS
views at 16:9 and 4:3.

## Dromader paint schemes

Title card → Dromader → **Paint A / B** (saved as `m18Livery`):

- **A — Agro Wings yellow** (unchanged).
- **B — Hellenic fire-fighter**, after the Greek Air Force PZL M-18B:
  - white fuselage and cabin frame;
  - yellow cowl, wings, tailplane and elevators, with a black anti-glare
    panel on the cowl top and a black belly under the wing root and cabin;
  - black diagonal bands on the wings and black tips;
  - blue-white-blue roundels on the wings (upper and lower) and on the aft
    fuselage;
  - two blue bars on the fin;
  - ΠΑ, the red camel and DROMADER PZL M18 B on the sides;
  - the registration chosen in Settings on the fin.

Only the fuselage and wing canvases and the colour of the frame and tip
materials change between schemes; the geometry stays the same.
`node test/m18livery.mjs <outDir>` renders both schemes from the side, the
front and rear three-quarters, and the top.

## Aircraft 07 — Embraer Ipanema 203 (PR-IPB), phase 01: exterior

A seventh aircraft, separate from the EMB-202A: its own geometry
(`src/aircraft/e203Model.js`), its own flight figures (`FLIGHT_E203` and
`SPRAY_E203` in `src/config.js`) and its own entry in the registry
(`AIRCRAFT_TYPES.e203`, `src/aircraft/types.js`). It shares only the game's
infrastructure with the other aircraft: the mesh helpers in `model.js`, the
piston engine with constant-speed prop branch of the flight model, the
IO-540 sound, the panel and the pilot. Nothing in the 202A's model or
figures was changed (`test/e203.test.mjs` checks the 202A's engine and
numbers). PR-IPB is a fictional registration. Phase 01 covers the exterior;
the detailed cockpit comes later.

**References.** The photos and figures sent with the brief: PS-DIR
(green/blue/gold) parked, from the front while spraying and close up with
IPANEMA 203 on the cowl; PP-ZPK (white with the green swoosh) from three
angles and spraying from the front quarter; three untextured renders of a
203 used only to check proportions; the spec table.

**Figures used.** Lycoming IO-540-K1J5 on ethanol, 320 hp at 2,700 rpm;
Hartzell three-blade constant-speed prop, 86 in (2.18 m); span 13.30 m with
winglets; length 8.00 m; height 2.43 m; max take-off 1,900 kg; 292 L of
ethanol; hopper 1,050 L.

**Estimated** (all in `FLIGHT_E203`, with comments):
- empty mass 1,090 kg;
- wing area 22.2 m² and mean chord 1.71 m;
- dihedral 6.5°;
- CD0 0.054 with booms, nozzles and wire cutter;
- inertias scaled from the 202A by mass and span;
- ethanol flow 115 L/h at full power;
- VFE 95 kt and VNE 140 kt (indicator marks only).

**Volume is not payload.** The hopper holds 1,050 L, but the 1,900 kg
MTOW sets the product mass. `productLimit(A, fuelL)` in `types.js` gives
the litres the MTOW allows at a given fuel load: ≈ 494 kg of water with a
full 292 L of ethanol and the pilot. The 203 sets `loadByWeight`, so the
load sheet's recommended load and the autopilot's service request cap the
product at that figure. The load sheet shows the limit next to the hopper volume
and turns red when the load is over it.

**Measured** (`node --test test/e203.test.mjs`, run in this container):

| check | result | target |
| --- | --- | --- |
| model span / length | 13.299 m / 8.00 m | 13.30 / 8.00 |
| parked height / three-point attitude | 2.43 m / 7.4°, three wheels down (was 3.1° before the PS-SAR pass) | 2.43 m |
| start | catches after 1.4 s, idle 650 rpm, 12 L/h | — |
| full throttle, static | 2,700 rpm, 28.3 inHg, 320 hp, 115 L/h, 6.09 kN thrust | 320 hp at 2,700 rpm |
| take-off roll 1,270 / 1,900 kg | 196 m / 485 m | inside the 800 m strip |
| climb at 70 kt, 1,450 / 1,900 kg | 1,335 / 889 ft/min | positive at MTOW |
| clean stall at 1,900 kg | 58 kt (polar 56) | — |
| level at 1,700 kg | 116 kt at full power; 93 kt at 62 % (68 L/h) | below VNE |

**Exterior** (`createE203Model`):
- **Fuselage.** Its own superellipse sections:
  - the long cowl with the side inlet, landing light, chin inlet, louvres,
    camlocs and exhausts;
  - the hopper lid with the loading box and coupler;
  - the taller cabin with deck, roof, windshield, side glass, rear panels,
    the door with its lower window, and the frames;
  - the tail cone running into the dorsal fillet and fin.
- **Wing.** 13.30 m with real taper seen from above:
  - upper and lower surfaces closed and wound outwards, so neither face
    disappears from any angle;
  - flaps (0.6–3.62 m) and ailerons (3.7–6.2 m) on their hinge lines;
  - nav lights, strobes, root fillet, walkway, filler cap, hinge brackets
    and pitot.
- **Winglets.** Shark-fin shaped, grown from the tip:
  - one continuous surface: the path bends from the wing's dihedral up to
    78° through a knee;
  - the chord narrows from the wing's 1.71 m to 0.16 m along a concave
    leading edge, with the trailing edge held on the wing's;
  - 0.46 m tall, canted 12° out;
  - mirrored for the right side.
- **Tail.** Fin with the rudder on a vertical hinge, beacon, tailplane with
  elevators, painted tips.
- **Wire cutter.** A thin cable from the roof mast to the fin, plus the
  windshield deflector and the whip antenna.
- **Gear.**
  - Conventional: V legs to the main axles, a leaf-spring tailwheel and its
    fork.
  - Contact points match the mesh: three wheels on the ground; the prop tip
    clears by 0.66 m and the boom tip by 1.21 m; winglet tops at 2.24 m and
    fin at 2.36 m.
- **Ag kit.**
  - Booms on five hangers per side, 20 yellow nozzles each, and the cross
    pipe.
  - The wind-driven pump with seven orange fan blades.
- **Prop.**
  - Polished spinner and three blades with white tips.
  - Blade pitch follows the governor.
  - The blades give way to a blurred disc between 380 and 900 rpm.

Small parts sit in a level of detail dropped beyond 95 m. AO is baked into
the vertex colours.

**Paint schemes.** Title card → Ipanema 203 → **Pintura 01 / 02**, saved
as `e203Livery`. Both use the same geometry and UVs; only the fuselage and
wing canvases and a few material colours (frame, tips, gear) change.
- **01 — green, blue and gold** (after PS-DIR / PS-BYA): green cowl and
  cabin; a gold band from the cowl back along the fuselage; blue aft and
  under; blue wings; green fin cap with the gold stripe and white arrow.
- **02 — white, green and blue** (after PP-ZPK): white airframe; green
  swoosh with a gold line along the side; blue belly, rudder, wing tips,
  winglets and tailplane tips; blue arrow on the fin.
- Both carry the IPANEMA 203 marks and speed lines on the cowl, ETANOL low
  on the cowl, NÃO PISE by the tailplane and RESTRITA/EXPERIMENTAL by the
  door.
  The registration chosen in Settings goes on the side.

**Integration.**
- **Fleet.**
  - Slot 07. The apron gains a fifth airplane spot, `BASE.parking5`, at its
    west edge, so all six airplanes can wait parked while a helicopter
    flies (every farm site gets the same spot).
  - Listed on the five farms that take the 202A.
  - Has its own HUD/GPS theme and office entry.
- **Fuel and service.**
  - Ethanol from the ethanol tank, 4.5 L/s.
  - Product at 15 L/s.
  - Service points and keep-out boxes fitted to the 13.30 m wing and the
    longer fuselage.
- **Sound.** The IO-540 profile with a three-blade, 2.18 m configuration;
  power read from the shaft.
- **Cockpit (provisional).**
  - Reference points for eye, seat, panel, stick, throttle, pedals, roof,
    door and floor.
  - The shared Ipanema panel, a glareshield, stick, pedals, throttle,
    levers and interior skins.
  - The internal camera at 70° FOV: the nose and the deflector stay in
    view and nothing clips.
  - No detailed panel yet.

**Validation run in this container** (Chromium with SwiftShader):
- `node test/e203views.mjs <outDir>`: side, other side, top, front, rear,
  underside, two three-quarters, in flight, winglet close-ups and parked,
  for both schemes, plus the cockpit. No page errors.
- `AC=e203 node test/e2e.mjs soy`: the full soy contract flown by the test
  autopilot through the player inputs — 90 % coverage, 2 stars, 2
  sorties, no damage. The only console error is a 404 for a resource the
  preview server does not serve.
- `node test/fleetswitch.mjs`: 84 switches across the seven aircraft, none
  hidden.
- `npm test`: 136 tests, all passing.

**Pending for the next phases.**
- The detailed 203 cockpit; the panel is still the 202A's.
- Opening animations for the door and the hopper lid.
- The estimated figures above, to check against the manual.

### EMB-203 geometry correction — cabin, planform, rear fuselage

The first 203 model read as low and bulky: the turtle deck behind the cabin
started at roof height and fell slowly, a hump that buried the cabin; the
windshield was raked to 32°; the body kept a parallel planform from the
hopper to well behind the cabin; the cabin section was one rounded
superellipse. Compared with the photographs of PS-BYA (side), PS-DIR (high
front quarter), PS-WBM (rear quarter) and a 203 taxiing (front quarter),
using near-orthographic renders and cameras placed where the photos were
taken (`test/e203ortho.mjs`, `test/e203photo.mjs`).

**What changed** (`src/aircraft/e203Model.js`; wings, winglets, tail
surfaces, gear contact points, ag kit, physics and paint layout kept):

- **Structured sections.** The cabin and rear fuselage are lofted from
  sections of their own (`AFT_KEYS`, `aftRing`):
  - the lower fuselage keeps its superellipse up to the window sill;
  - above the sill, straight sides lean in to a flat top with rounded
    corners (7 cm radius at the roof).
  The cabin's rear frame is the first of these sections, so the roof flows
  into the fairing with no seam.
- **Cabin.**
  - Roof top 1.025 → 1.04 m (body frame); flat, 0.69 m wide (was a crowned
    0.84 m).
  - Side windows flat, leaning in 12° from the sill to the roof rails.
  - Windshield raked 43° from the hopper's top to the roof's front edge,
    which moved forward from z −1.12/−1.17 to −0.93/−0.97 m.
  - Roof rear frame at −1.78 m, B-posts at −1.58 m.
  - The lower door window is shorter and sits under the side window's front
    half.
  - Frames are slimmer: tubes of 1.1–1.7 cm radius instead of 1.8–2.6 cm,
    and no corner balls.
- **Behind the cabin.** The fairing drops from the roof's rear edge (convex
  at the edge, about 45° in the middle, concave into the dorsal) to a low,
  rounded dorsal near the sill height.
  - The fin root reaches down to it; the fin top is where it was.
  - A concave dorsal fillet runs into the fin's leading edge.
- **Planform.** About 8 % narrower from the cowl to the cabin, and the taper
  starts right behind the cabin (no parallel run).
- **Fits.**
  - The wing root goes 8 cm further into the narrower body (no gap).
  - The root fillet follows the body's surface.
  - The main gear legs and the hopper coupler sit on the new lower sides.
  - The provisional interior skins follow the cabin's leaning sides and
    roof.

| z (m) | half width before → after (m) | top before → after (m) |
| --- | --- | --- |
| 1.2 (cowl) | 0.43 → 0.395 | 0.52 (same) |
| 0.0 (hopper) | 0.51 → 0.465 | 0.62 (same) |
| −1.2 (cabin) | 0.53 → 0.485 | roof 1.025 → 1.04 |
| −2.3 | 0.49 → 0.449 | 0.86 → 0.70 |
| −2.8 | 0.44 → 0.405 | 0.71 → 0.47 |
| −3.3 | 0.38 → 0.352 | 0.60 → 0.41 |
| −3.9 | 0.30 → 0.278 | 0.52 → 0.37 |
| −4.5 | 0.21 → 0.185 | 0.47 → 0.335 |

**Paint.** Both schemes keep the same layout on the new surfaces:
- the gold band (01) now passes under the B-post and climbs the fairing to
  the dorsal, as on PS-BYA;
- the green swoosh (02) follows the lower dorsal into the fin;
- panel seams and the RESTRITA marking moved with the frames.

**Measured** (this container):
- span 13.299 m, length 8.00 m, height 2.44 m parked (roof top);
- three wheels on the ground, 3.1° three-point attitude;
- 71,542 triangles in 129 meshes (was 72,172 in 130);
- `npm test`: 136 tests passing.

**Still different from the photographs.**
- On PS-BYA the fin top looks level with the roof or slightly above it; on
  the model it is 8 cm below. It was left as it was rather than raised to
  balance the cabin.
- The real spinner looks larger in the front-quarter photo.
- The windshield's lower side corners look lower on the real aircraft.
- The photo comparisons use estimated camera positions, not surveyed ones.

### EMB-203 cockpit (phase 02)

`src/aircraft/e203Panel.js` (layout, dial faces, live screens),
`src/aircraft/e203Cockpit.js` (3D), placed in the corrected cabin by
`e203Model.js`. No document with the 203's panel was found, so the fit
follows one aircraft: the 203 PS-SBF in its start-and-taxi video (panel,
glareshield, hopper window, lower hopper face, the lightbar on the cowl).
The four cabin photographs (Ipanemas 202) gave the shapes, materials,
the yellow grab handles and the lower hopper sight.

- **Glareshield.** A black leather bullnose lofted along the windshield's
  base across the cabin: from under the glass aft over the top, round the
  nose and back under to the panel's top edge, 6 cm deep in the middle and
  thinning into trim strips down the side walls. One piece; its shape alone
  reads as the Ipanema's hood.
- **Panel.** Light-grey 3 mm plate tilted back 8°, cut to the cabin walls
  and the glareshield's underside, with real holes for every instrument,
  lamp, window and unit; sub-plates with dark seams and screws, a return
  flange under it.
- **Instruments** (all from `Aircraft.instruments()`, nothing invented):
  accelerometer with the max / min memory needles (reset on the ground with
  the engine off), airspeed (MPH, knots inside, the type's V-speed arcs),
  altimeter (100 / 1000 / 10 000 ft needles, Kollsman window, low-altitude
  flag); manifold pressure / fuel flow, CYL / OIL temperatures, tachometer
  with its live hour meter; ammeter (starter draw, recharge after the start,
  the running load); quartz chronometer (time since the start); the
  panel-mounted wet compass (a 3D card drum behind its window, lubber line);
  the elevator trim indicator (its pointer follows the trim); the fuel
  totalizer (quantity and flow). Each round instrument: can, recessed face
  (512 px per dial), thin 3D needles, hub, glass, bezel ring, four flange
  screws.
- **Lamps and switches.** PARTIDA, ALTERN., PRESS. ÓLEO, COMB. BAIXO,
  ESTOL, APLIC. light from the aircraft's state (starter engaged, alternator
  not charging, oil pressure under 15 psi, fuel under 15 %, stall warning,
  spray valve open); the magneto key turns with the engine (off / both /
  start); the master, alternator, boost pump and the NAV / STROBE / BEACON
  toggles follow the engine's state. Breakers, push buttons, eyeball vents,
  blank plates.
- **Hopper.** The big window shows the yellow fibreglass wall with the
  hopper's own large figures (as on PS-SBF), the narrow lower window its
  middle; below the panel, between the pilot's legs, the hopper's lower face
  with the U sight slot in its aluminium frame and the two scales of the
  photographs, VÔO (in flight) and SOLO (parked: about 1 : 1.4, read off
  the photograph). The product level comes from the aircraft's load.
- **GPS.** The game's own AGROWINGS NAV (`agroNav.js`, shared with the
  Bell 206; not a copy) set into the panel's right side: housing, bezel,
  recessed screen behind glass, the four page keys MAPA / DESTINO / MISSÃO /
  COBERTURA, clicked in the cockpit view through the same ray as the game's
  other cockpit buttons. Redrawn at most 4 Hz, only when its content changes.
- **Controls.** White stick column on the torque-tube box (rubber boot,
  black grip with trigger, trim hat and the red spray button; pivot at the
  box, moved by aircraft.js); pedals with toe brakes; the power quadrant
  against the left wall from the panel's lower corner aft (throttle,
  propeller, mixture, friction lock); the spray valve lever and the fuel
  shut-off on the right.
- **Cabin.** Inner skins of the walls, the door (with its lower window,
  handle and latch), the panels behind the B-posts, the headliner and the
  rear bulkhead (harness anchor bar, fire extinguisher); dark A- and B-post
  covers with rubber seals; kick strips; floor-side consoles over the wing's
  centre section; tread-plate floor; the high-backed leather seat with its
  four-point harness; the guidance lightbar on the cowl. No wiper: PS-SBF
  has none. The wire-cutter and its cable stay outside the glass.
- **Camera and free look.** The eye where the pilot figure's eyes are
  (0.68 m behind the panel's base), 8.6° down, 68° vertical field of view.
  Mouse drag or the keys Num 7 / Num 9 (left / right), Num ÷ / Num 2
  (up / down), Num + / Num − (zoom) and Num 0 or Home (back to the default
  view). Only the head turns and the lens zooms: the eye does not move, so
  the view never passes through the panel. The same keys swing the chase
  camera. On a touch screen (every aircraft): one finger dragged on the
  view looks around, a double tap brings the default view back; the GPS
  keys take a tap.
- **Cost.** Static parts are merged per material; the small hardware sits
  in a level of detail (shown within 24 m). Needles, lamps, switches, the
  key, the compass card and the GPS keys are updated only in the cockpit
  view or with the camera within 9 m; the live textures only when what
  they show changes.

### EMB-203 final geometry pass (measured on PS-SAR)

Measured on the side photograph of PS-SAR on the grass, scaled by the
type's 2.43 m height (`src/aircraft/e203Model.js`, `src/config.js`; wings,
winglets, flaps, ailerons, propeller, ag kit, cockpit and paints kept):
- **Tail on the ground.** The real 203 sits with its tail low, the
  tailwheel just under the rudder on a short spring: the tailwheel contact
  point moved up 0.42 m (`FLIGHT_E203.gear.tail`, −1.27 → −0.85), so the
  three-point attitude is 7.4° (was 3.1°). The take-off, climb and speed
  tests still pass. No extra structure: the earlier ventral keel is gone.
- **Fin and rudder.** Big and nearly square, as on the photograph: the
  chord at the top 0.9 of the root's (was a narrow point), the leading
  edge swept 26°, a flat top 1.16 m above the dorsal with a small radius at
  its front corner, the rudder of constant chord with a square trailing-edge
  corner. Green cap and gold stripe in the photograph's proportions.
- **Cabin.** Sill to roof 0.8 m as measured (was 0.6 m): roof 1.04 →
  1.20 m, the fairing behind it rebuilt to drop to a dorsal a little under
  the sill line. With the tail low, the parked height is 2.43 m (test).
- **Rear fuselage.** Narrower in plan from behind the cabin; its depth kept
  to about 0.74 m at the rudder post with a nearly straight underside, as
  on the photograph.
- **Tailplane.** High on the rear fuselage, just under the dorsal at the
  fin (y −0.28 → 0.22).
- **Nose.** Slimmer toward the spinner (lip 0.58 → 0.54 m wide) and its top
  line falling more steeply to it — the cowl rising at an angle from the
  spinner to the windshield; inlets and the landing light sized to fit.

### EMB-203 cockpit fixes — hopper sight, door window, eye height

- **Hopper sight on its wall.** The yellow lower face of the hopper with
  the VÔO / SOLO scales and the sight slot stood 34 cm aft of the footwell
  (z −0.84, a board in front of the pilot's legs, with yellow sides). It is
  now flush in the footwell's front wall, between the grey closures
  (z −0.501), up to the panel's lower edge; its side panels are gone and
  the slot's aluminium frame moved with it.
- **Door's lower window.** The real 203's door is glazed low down (it shows
  on PS-WBM with the door open), but from inside the cut-out had no frame,
  so it read as a hole in the wall with the ground behind it. It now has a
  dark trim frame round it on the inner skin, a rubber reveal out to the
  glass and a rubber seal, and it sits lower (y 0.10–0.32, was 0.20–0.38)
  so the power quadrant no longer covers its top edge (inside and outside
  move together).
- **Pilot's eye height (every aircraft).** Shift + ↑ raises the cockpit eye
  and Shift + ↓ lowers it — a taller or a shorter pilot — 15 cm/s, up to
  ±15 cm from the type's eye point. It is kept in the settings when the
  keys are let go (a short message gives the height); the default view
  (Num 0 / Home) resets the look and the zoom, not the eye height. While
  Shift + ↑ / ↓ is held, Shift does not add power and ↑ / ↓ do not move the
  stick (classic scheme); either key alone works as before. Bindings can be
  chords now: in Settings, hold Shift (or Ctrl / Alt) and press the key; a
  modifier alone is taken when it is released.

## Robinson R44 — exterior reconstruction and paint B

Visual only (`src/aircraft/r44Model.js`): the physics (`FLIGHT_R44`), rotor
pivots and animation, skid contact points, cockpit (pod, pedestal,
instruments, GPS, cyclic, collective, pedals, seats), sprayer, missions and
sound are unchanged. Compared with the five reference photographs (black
agricultural R44s, a grey one in flight and from below, a red one parked)
in near-orthographic and three-quarter views (`test/r44ortho.mjs`).

- **Cabin.** 1.28 m wide at the doors (R44 data; the model was 1.39 m),
  with a fuller lower nose so the pedals stay inside the bubble. The
  windshield's lower edge now runs from the A-pillar's foot down and
  forward into the nose: the deep two-piece glass of the R44, a short
  painted chin under it; the centre post follows the nose underneath.
- **Nose and windows (second pass, after a side photo of a black R44 II).**
  The pointed nose tip is gone: the nose is a blunt three-dimensional
  bubble, its foremost point low and its underside rounding up into it,
  4 cm longer; the front door window's lower edge falls toward the A-pillar
  and both door windows have generous corner radii.
- **Mast fairing.** The low hump became the R44's tall tapered tower:
  front edge raked back, rear edge raked forward, teardrop in plan, its top
  just under the swashplate (raised with it; the hub and the rotor pivots
  stay where they were). The pitot sits on its front.
- **Engine compartment.** Closed cowling (it was an open bay showing the
  engine and frame on both sides); its top continues the cabin roof line
  to the tail cone; the cooling-air outlet is the open lower rear, with the
  engine, muffler and the turned-down tailpipe seen through it; cowl seams
  and an access door in the paint.
- **Ag kit.** The boxy tank became the cylindrical belly tank of the
  photographs (0.38 m × 1.5 m) on two straps between the cross tubes; the
  fill coupler (where the service hose attaches) and the pump moved with
  it. Boom, nozzles, flow and capacity unchanged.
- **Interior fit.** Rear bench 1.0 m wide and the pedals 3 cm further in
  and 8 cm aft, so nothing passes through the narrower hull.
- **Paints** (same meshes; only the livery canvas and four colours change):
  - **A — Original**: the red and graphite scheme, as before.
  - **B — Black Agricultural**: deep black with a little more gloss so the
    shapes still read, a gold band from the nose along the lower cabin
    rising along the cowling with a fine line above it, gold marks on the
    tail cone, R44 / RAVEN II on the cowling, black fins, stabiliser,
    cross tubes and skids.
  Chosen on the title card (Paint A / B) and kept with the other settings.

**Not changed, and why.** The overall height is 3.05 m to the hub against
the R44's 3.28 m: the hub height is part of the flight model
(`FLIGHT_R44.rotor.hubHeight`) and was left alone.
