# AGRO WINGS

Agricultural aviation on a Mato Grosso farm (Fazenda Boa Esperança, fictional).
Three.js + Vite, everything procedural (no external assets), built into a
single self-contained `dist/index.html`.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/index.html (single file)
npm test           # flight + spray validation (Node)
```

URL option: `?q=low|medium|high` forces a graphics preset.

## Gameplay loop

Service orders (3 contracts) → load sheet (fuel / application liquid) → the
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

Evaluation: useful coverage (dose ≥ 0.7 of target), uniformity (1 − CV of
dose), gaps, overlap (dose > 1.5), waste (off-target + drift/evaporation +
over-application) and aircraft condition (repairs).

## Controls (Tidemark aircraft mapping kept)

| Action | Keys |
| --- | --- |
| Pitch | W / S (↑ ↓) |
| Roll | A / D (← →) — also steer on the ground |
| Rudder / tailwheel | Z / X |
| Power | R / F (Shift / Ctrl), mouse wheel |
| Brakes (differential with rudder) | Space |
| Flaps | G (up) / B (down) |
| Trim | [ / ] |
| Engine | hold Q to start, tap Q to stop |
| Spray valve | C (Enter) |
| Cockpit / chase | V |
| Free external camera | O |
| Service / interact | E |
| Map / coverage overlay / contracts | M / K / J |
| Reset aircraft | Backspace |
| Speed up ground service | hold T |

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
- fixed-pitch prop: static thrust fades toward pitch speed, windmill drag at
  idle (gives a real glide);
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
  ~75°/s and pitches ~26°/s; no bank limit below 80° while the stick is held;
- stick released: flight-path hold. In a bank the assist asks for the load
  factor n = cos γ / cos φ that keeps the climb or descent, but never more
  than the wing can give at that speed and weight. Beyond that the nose
  falls and the aircraft descends — the real energy trade of a steep turn.
  A level turn settles at the bank the wing can sustain; a climbing aircraft
  (top of the balão) keeps up to 75°; a held climb flattens as speed bleeds;
- stall protection anticipates the alpha trend and the path rotation
  (α̇ = q − γ̇), g protection at +3.8 / −1 g.

The balão at the end of each pass is flown as in the field: valve off, pull
up (~2.2–2.5 g, +25–40 m), turn ~45° away, bank 60–75° back toward the next
swath at the slow top, let the nose fall and dive back to 3 m. The HUD's
LOAD readout shows the g. Measured with the test pilot (`npm test`): 60°
bank in 1.1 s, 45° turns hold height within ~7 m, a balão with 560 L tops
out ~29 m above the pass and ends above it, never stalling.

## Tests

`npm test` runs `test/flight.test.mjs` and `test/spray.test.mjs` (Node).
Browser checks (need `npm run build && npx vite preview --port 4173`):

- `node test/e2e.mjs soy out/` — full contract flown by the test autopilot
  (`src/game/autopilot.js`) through the normal player inputs only;
- `node test/e2e_ui.mjs out/` — service interruption, crash + recovery,
  stuck reset, key rebinding, tutorial, mobile layout;
- `node test/perf.mjs` — per-view tick/render time, draw calls, triangles.

### Measured in this container (Chromium + SwiftShader, 1280×720)

The container has no GPU, so render times are only the CPU cost of handing
frames to a software rasteriser and say nothing about real FPS. Game logic
time and scene complexity carry over to real hardware:

| preset | view | logic ms/frame | draw calls | triangles |
| --- | --- | --- | --- | --- |
| low | parked on the pad (chase) | 0.96 | 395 | 642k |
| low | spraying soy at 4 m (chase) | 2.94 | 347 | 505k |
| low | cockpit over corn | 2.21 | 333 | 884k |
| low | 400 m AGL | 0.95 | 315 | 464k |
| medium | spraying soy at 4 m | 3.57 | 357 | 511k |
| medium | cockpit over corn | 2.86 | 348 | 1004k |
| high | parked on the pad | 1.25 | 396 | 645k |
| high | spraying soy at 4 m | 2.30 | 359 | 514k |
| high | cockpit over corn | 2.65 | 348 | 1004k |

The logic column averages only 8 frames and moves by ±1 ms between runs of
the same build (the soy pass read 1.79 and 2.94 ms in two runs minutes apart); averaged
over 600 frames a parked tick is 0.2–0.4 ms, of which the aircraft's visual
update is 0.03 ms. The detailed aircraft costs about 50 draw calls and 100k
triangles more than the first model (parked on the pad: 343 → 395 calls,
541k → 642k triangles); it accounts for about half the draw calls of a
chase view, main and shadow pass together.

SwiftShader stalls for 80–110 s on one frame when the spray mist first
appears and once in the 400 m view (no new WebGL program is linked; the
software rasteriser builds its pipelines then). The build before the
aircraft overhaul stalls on the same frames, so they are not a cost of the
new model.

FPS on a real GPU was not measured here; the in-game counter (Settings →
Show FPS) reports fps, draw calls and triangles live.

### Validation runs (final build)

- `npm test`: 22/22 (flight model incl. braked pivot, aileron authority,
  steep turns and the balão; spray deposition).
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
  prop levers; the pilot has a helmet, visor, boom mic and gloved hands on
  the stick and throttle.
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
