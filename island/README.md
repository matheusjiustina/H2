# Tidemark

A first-person tropical island exploration game that runs in the browser. It uses
Three.js on WebGL2 with plain ES modules and has no other frameworks. Everything in the
world is generated: terrain, textures, vegetation, sky, water, props and sound. The repo
ships no image, model or audio assets.

You wake up in an improvised survey camp on a beach. In front of it are a turquoise
lagoon, a long pier with a skiff tied to it, and a reef line with deep blue water beyond.
Behind it are jungle valleys, a waterfall and a headland viewpoint. Crossing the island
on foot takes about five minutes.

## Playing

The quickest way is the single-file build: `dist/tidemark.html` holds the whole game
(about 940 KB). Double-click it to open it in a browser. It needs no server and no
install, and it can be uploaded as-is to any static host.

## Running from source

```bash
cd island
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve the production build
```

`npm run build` writes three things to `dist/`:

| Output | Use |
| --- | --- |
| `index.html` + `assets/` | Regular static site, for any web host |
| `tidemark.html` | Whole game in one file; opens straight from disk |
| `tidemark.fragment.html` | Same page without the `<html>`/`<head>`/`<body>` wrapper, for hosts that add their own |

You need a browser with WebGL2: a current Chrome, Edge, Firefox or Safari. The first
load generates all textures and geometry on the GPU, which takes a few seconds on a
desktop GPU. The game picks a quality preset from the GPU it finds (phones and tablets
start on Low) and remembers any change you make in Settings.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move |
| Mouse | Look (click the view to capture the mouse) |
| Shift | Sprint |
| Space | Jump / swim up |
| C / Ctrl | Dive while swimming |
| E | Interact (open, take, inspect, board) |
| F / left click | Contextual action or use held item (light the lantern, throw a pebble, take a photo) |
| Right mouse | Aim the camera or binoculars |
| R | Put the held item down |
| Q | Stow the held item |
| 1–7 | Equip an inventory item |
| Tab / I | Inventory and photos |
| M | Survey chart |
| N | Field notebook |
| Esc / P | Pause, settings and controls |
| F2 / ` | Debug panel (time of day, weather, speed, stats) |
| [ / ] | Move the clock back or forward one hour |
| F1 | Hide the HUD |

In the boat: W/S set the throttle, A/D steer, and E steps out.

### Flying the seaplane

The floatplane PT-ILH is tied up on the west side of the pier. Walk up to it and press E.

| Input | Action |
| --- | --- |
| Hold Q | Start the engine (tap Q to stop it) |
| W / S | Pitch: push the nose down / pull it up |
| A / D | Roll (on the water they steer) |
| Z / X | Rudder |
| R / F or mouse wheel | Throttle |
| G / B | Flaps up / down (0°, 10°, 20°, 30°) |
| [ / ] or PgDn / PgUp | Elevator trim |
| U | Raise / lower the water rudders |
| L | Navigation lights and strobes |
| Hold right mouse | Fly with the mouse (mouse yoke) |
| V | Cockpit or chase camera |
| O | Orbit camera (wheel zooms) |
| Hold E | Climb out (only once she has stopped) |

To take off, start the engine, set 20° of flaps (press B twice) and open the throttle
(R). She climbs onto the step at about 25 kt. Ease back (S) at about 55 kt and she lifts
off near 60 kt after roughly 280 m of water. Without flaps she needs about 420 m and
about 72 kt. The lagoon is only about 300 m deep straight out from the pier, so taxi out
and take off east or west along the middle of the lagoon, where you have more than
600 m. To land, come down with flaps and power at around 65 kt and flare so you touch the
water gently, nose slightly up.

The flight model has six degrees of freedom. Lift and drag come from the angle of
attack, with a stall break and wing drop, induced drag and ground effect. The propeller
has limited power and its slipstream acts on the tail, and the engine adds torque and
p-factor. The floats have buoyancy, hump drag, planing lift and water rudders. Wind and
gusts follow the weather. It flies like a heavy bush plane on floats: it climbs at about
1,200 ft/min and cruises at about 100 kt.

A keyboard key is either fully pressed or not pressed, so with **flight assist** on
(Settings → Input) the keys fly the aircraft the way a fly-by-wire stick does:

- **Normal** (default): W/S ask for a pitch rate and A/D for a roll rate. Let go and she
  holds that attitude (pitch held within ±15°, bank settles to at most 30°). An
  angle-of-attack limiter keeps the wing from stalling, the nose comes down by itself
  if she gets too slow, and the rudder is coordinated automatically.
- **High**: also levels the wings when you let go, with tighter pitch and bank limits.
- **Off**: the keys move the control surfaces directly. This is the raw aircraft: you
  can stall and spin it.

Hard landings crack the windshield, and more damage makes the engine run rough and
smoke. A real crash breaks the airframe apart: wings, floats and fuselage tumble, float
and slowly sink, and you end up in the water. The plane is recovered and moored at the
pier again a little later. The developer panel (F2) can also put the seaplane at the
pier, put it in the air at 300 m, or repair it.

If the browser won't capture the mouse (some embedded pages refuse it), drag on the view
to look around instead.

**Touch screens** get on-screen controls. Your left thumb moves you (push to the rim of
the stick to run) and your right thumb looks around. The buttons for jump, E, F and dive
show up only when they do something. The top corner has your bag and pause.

## What's in the island

- **Camp:** a deck and shelter, a crate with a hinged lid, a storm lantern (real light),
  a flashlight (real spot light), a radio with static and music, the survey chart and
  notebook, a compass, a camera (photos go to your inventory), a mug, binoculars, a
  campfire, a hammock (rest until golden hour or morning) and a tarp-covered supply pile.
- **Water:** six Gerstner waves, damped inside the lagoon by an energy mask. The CPU
  height query matches the GPU surface, so swimming, the boat and pebbles all float on
  the same water you see. The water shader handles refraction, depth absorption, planar
  or analytic reflections, a GGX sun glint, shore and reef foam and caustics. It also
  draws a GPU ripple simulation (pebbles, swimming, the boat's wake, rain) and Snell's
  window when seen from below.
- **Pebbles:** pick them up from piles on the beach and throw them. They splash, make
  ripples and sink, and a low, fast throw skips them. Thrown pebbles can be picked up
  again.
- **Seaplane:** a high-wing radial floatplane with a realistic six-degree-of-freedom flight
  model, full cockpit with working instruments, chase and orbit cameras, damage and
  break-up. See *Flying the seaplane*.
- **Boat:** buoyancy sampled at the hull points gives pitch and roll. It has a wake
  ribbon, spray, grounding in shallow water, a throttle and steering.
- **Vegetation:** palms, broadleaf trees, banana plants, ferns, big-leaf plants, bushes
  and clumped grass. Each type has its own wind behaviour in the shader. Plants are
  instanced per 32 m chunk with CPU culling and three LODs.
- **Time and weather:** the day runs early morning → noon → golden hour → sunset → night
  → pre-dawn. Weather moves gradually between Clear, Cloudy, Light rain and Tropical
  storm. Weather changes wetness, puddles, rain ripples on the water, wind, waves,
  lightning and the audio mix.
- **Life:** birds, seabirds, fish, rays, butterflies, fireflies and crabs.
- **Exploration:** 12 rare shells to find. Reaching points of interest adds notes to the
  notebook.

## Architecture

```
src/
  core/        Game loop & system wiring, Renderer (frame graph), Input, Settings,
               Shared uniforms + GLSL libraries, MaterialPatch (world shading injected
               into MeshStandardMaterial: wind, wetness, caustics, canopy, cloud shadows, fog)
  world/       Layout (art-directed map), TerrainData (heights, distance fields, splats),
               Terrain (chunked LOD), Textures (GPU-baked procedural materials), Sky,
               CloudBillboards, TimeOfDay, Weather, Atmosphere (sun, IBL, fog, grading),
               Ocean, Rocks, Waterfall, DistantScenery
  vegetation/  Procedural plant geometry, canvas leaf textures, chunked instancing, grass
  player/      PlayerController (fixed 120 Hz step), Collision, InteractionSystem,
               Inventory, Tools (held items), FirstPersonRig (skinned hands)
  environment/ Camp, props, prop materials, pebbles, wildlife, collectibles
  vehicles/    Boat, Seaplane (FlightModel = 6-DOF physics, SeaplaneModel = procedural airframe + cockpit)
  effects/     Post-processing passes, particles, rain, ripple simulation, footprints
  audio/       AudioManager (layered ambience, HRTF 3D sounds, underwater filter),
               ProceduralSounds (all default sounds are synthesized)
  ui/          HUD, menus, inventory, notebook, chart, debug panel
```

Each frame is one central loop (`Game.update` and then `Game.render`). The renderer
draws HDR into a half-float target with depth, then runs SSAO, the refraction copy, the
planar reflection, water and effects, the view-model pass, bloom, the composite (ACES,
grading, the per-pixel waterline, underwater tint and distortion, vignette, grain) and
finally FXAA with sharpening.

### Interactions

Anything can become interactive by registering it with the interaction system:

```js
game.interaction.add({
  object: mesh,                       // raycast target (bounding box + padding)
  name: 'radio',
  interactionLabel: 'Switch on',      // or a function (game) => string
  interactionDistance: 2.7,
  priority: 0,                        // higher wins when targets overlap
  onInteract: (game) => { /* E */ },
  secondaryLabel: 'Tune', onSecondary: (game) => { /* F */ },
});
```

### Replacing sounds

All sounds are generated at startup. To use recorded audio instead, put the files in
`public/sounds/` and map them in `public/sounds/manifest.json`:

```json
{ "ocean": "ocean_loop.ogg", "splash": "splash.wav" }
```

Any name you leave out keeps its synthesized version. The manifest's `_readme` entry
lists every sound name.

## Quality and debugging

Pause → Settings has Low, Medium and High presets, plus separate controls for render
scale, shadows, vegetation, water, post-processing, audio, FOV and sensitivity. Gameplay
is the same on every preset.

These URL parameters help with testing:

| Parameter | Example | Effect |
| --- | --- | --- |
| `quality` | `?quality=low` | Force a preset |
| `time` | `?time=18.2` | Start hour |
| `weather` | `?weather=STORM` | `CLEAR`, `CLOUDY`, `LIGHT_RAIN`, `STORM` (also turns off automatic weather) |
| `pos` | `?pos=-40,90,0.6,0` | Spawn at x, z, yaw, pitch |
| `item` | `?item=compass,pebble` | Start with items |
| `autostart` | `?autostart=1` | Skip the title screen |

The debug panel (F2) shows FPS, frame time, draw calls and triangles. It can also scrub
the clock, speed up time (up to 600×), force the weather and switch to fast weather
transitions. `window.__game` exposes `setTime(h)`, `setWeather(name)`, `teleport(x, z,
yaw, pitch)` and `lookAt(x, y, z)` for console use.
