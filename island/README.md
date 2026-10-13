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
| E | Interact (open, take, inspect, board the skiff, the seaplane or the helicopter) |
| F / left click | Contextual action or use held item (light the lantern, throw a pebble, take a photo) |
| Right mouse | Aim the camera or binoculars |
| R | Put the held item down |
| Q | Stow the held item |
| 1–7 | Equip an inventory item |
| Tab / I | Inventory and photos |
| M | Survey chart (away from the home island, or afloat: the chart of the outer islands) |
| N | Field notebook |
| J | Journal: missions, Relic Archive, clues and the archipelago chart |
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
| E | Climb out (once she has stopped on the water). A "Get out of the plane" button also appears, and the pause menu has the same option |

To take off, start the engine, set 20° of flaps (press B twice) and open the throttle
(R). She climbs onto the step at about 25 kt. Ease back (S) at about 55 kt and she lifts
off near 60 kt after roughly 280 m of water. Without flaps she needs about 420 m and
about 72 kt. The lagoon is only about 300 m deep straight out from the pier, so taxi out
and take off east or west along the middle of the lagoon, where you have more than
600 m. To land, come down with flaps and power at around 65 kt and flare so you touch the
water gently, nose slightly up.

The engine sound is a synthesized nine-cylinder radial. The cylinders fire unevenly through the
exhaust stacks, the three-blade propeller adds its blade-passing tone, and the engine roars
under load and pops when you chop the throttle. Inside the cabin the engine is muffled but
loud, and the island's ambience fades behind it.

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

### Flying the helicopter

The helicopter PT-TDM (a light single-turbine machine in the H125 mould: three-blade
main rotor, tail rotor on the left of the fin, skids) is parked on the **helipad** on the
beach west of the camp, engine off. Walk up to it and press E: you board, the camera
eases out to the chase view and the turbine starts. The rotor takes about eight seconds
to reach 100 %; the collective stays down until it does.

| Input | Action |
| --- | --- |
| Space / Left Shift (or mouse wheel) | Collective up / down |
| W / S / A / D (or arrows) | Cyclic: tilt the rotor forward, back, left, right |
| Q / R (or Z / X) | Pedals: yaw left / right |
| T | Start or shut down the engine (press twice in flight) |
| Hold right mouse | Fly the cyclic with the mouse |
| L | Navigation lights (the red anti-collision beacons flash whenever the rotor turns) |
| V | Chase or cockpit camera (the mouse swings the chase camera round; it drifts back behind the tail) |
| O | Orbit camera (wheel zooms) |
| E | Get out once landed with the lever down. The engine shuts down and the rotor runs down by itself |

To fly: wait for NR 100 %, raise the collective (hold Space) until she gets light on the
skids and lifts into a hover, then ease the lever back to hold it. Tilt the cyclic
forward and she gathers speed; through about 15 kt translational lift makes her climb a
little. To land, slow down with back cyclic, come down gently over the spot and lower the
lever once the skids are on the ground. Land on firm, fairly level ground: on a slope she
slides, and a steep slope or a rotor strike ends the flight.

The rotorcraft model (`HeliFlight.js`) is not the seaplane's. Blade-element thrust is
balanced against momentum-theory inflow at 120 Hz, so climb and descent damping,
translational lift, ground effect and autorotation all come from the same equations, and
settling straight down too fast gets her into the vortex ring. The cyclic tilts the
tip-path plane, which also flaps back with airspeed and lags the shaft. Rotor speed is a
state: the governed turbine drives it against the rotor's own torque, the fuselage takes
the reaction (she swings nose-left when you pull power) and the tail rotor cancels it. The
skids are spring-damper contacts with stick-and-slip friction on the terrain, the helipad
and the decks. It cruises at about 110 kt, climbs at about 1,600 ft/min and hovers at
about 70 % torque.

**Flight assist** (Settings → Input) applies here too:

- **Normal** (default): the cyclic keys ask for a rotor attitude and level it when you
  let go, so she slows down on her own momentum; the pedals ask for a yaw rate with the
  torque trimmed out and hold the heading in the hover; turns are coordinated at speed. The
  lever is yours: it stays where you leave it, it doesn't sag when you tilt the cyclic, and
  it settles into a soft detent at the hover when you let go near level flight. A power
  limiter stops you over-torquing, and close to the ground at low speed she won't sink
  faster than is safe.
- **High**: also holds the hover in place, and Space / Shift ask for a climb or a descent
  rate (let go and she holds the height, and touches down gently).
- **Off**: the cyclic and pedals go straight to the rotor with only a little rate damping
  and the torque trim: hard work on a keyboard, like the real thing.

The rotor wash blows dust off the sand and the helipad, flattens the grass and shakes
the palms, and rings the water with ripples and spray. Hard landings and tail strikes
cost damage; rolling over, a rotor or tail-rotor strike, or ditching in the water ends the
flight: the blades break, you get clear, and the helicopter is recovered to the helipad a
little later. The harbour ledger can also bring it back to the helipad from anywhere,
and the developer panel (F2) can put it on the helipad, in a 40 m hover or repair it.

If the browser won't capture the mouse (some embedded pages refuse it), drag on the view
to look around instead.

**Touch screens** get on-screen controls. Your left thumb moves you (push to the rim of
the stick to run) and your right thumb looks around. The buttons for jump, E, F and dive
show up only when they do something. The top corner has your bag and pause. In the
helicopter the stick is the cyclic and buttons work the collective, the pedals, the
engine, the camera and getting out.

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
- **Seaplane:** a high-wing floatplane with a realistic six-degree-of-freedom flight
  model, full cockpit with working instruments, chase and orbit cameras, damage and
  break-up. See *Flying the seaplane*. The model is lofted procedurally: a tapered cowling
  with twin intakes and a polished spinner, cambered wings and tail surfaces with moving
  controls, stepped floats on streamlined struts and a furnished cabin. Panel seams,
  rivets, doors, vents, the livery and the window openings are baked at load into
  textures, and the cabin and small fittings switch off with distance.
- **Helicopter and helipad:** a light single-turbine helicopter with its own rotorcraft
  flight model, cockpit (pilot in the right seat: cyclic, collective and pedals move with
  the controls, a VEMD-style engine display and flight instruments), chase, cockpit and
  orbit cameras, rotor blur and rotor shadow, rotor wash, damage and recovery. See
  *Flying the helicopter*. The airframe is lofted procedurally like the seaplane's, in the
  same livery, with the windows, doors, seams, rivets and weathering baked into
  textures, a Starflex-style hub with three twisted, profiled blades and a cabin that
  switches off with distance. The helipad is a weathered concrete slab with an H,
  touchdown circle and perimeter line, flush green perimeter lights that come on at
  dusk, a windsock that follows the wind and the rotor wash, a fuel store and a small
  maintenance corner.
- **Boat:** buoyancy sampled at the hull points gives pitch and roll. It has a wake
  ribbon, spray, grounding in shallow water, a throttle and steering.
- **Vegetation:** palms, broadleaf trees, banana plants, ferns, big-leaf plants, bushes
  and clumped grass. Each type has its own wind behaviour in the shader. Plants are
  instanced per 32 m chunk with CPU culling and three LODs.
- **Time and weather:** the day runs early morning → noon → golden hour → sunset → night
  → pre-dawn. Weather drifts on its own between Clear, Light fog (a low bank over the
  water that thins with height), Overcast and Passing rain (short showers). Wind stays
  light in all of them, so sailing, flying and landing always work, and no mission
  depends on the weather. A Tropical storm exists only in the developer panel. Weather
  changes wetness, puddles, rain ripples on the water, wind, waves, fog and the audio mix.
- **Life:** birds, seabirds, fish, rays, butterflies, fireflies and crabs.
- **Exploration:** 12 rare shells to find. Reaching points of interest adds notes to the
  notebook.

## The outer islands

The world is 2 km across. Beyond the reef lie four explorable islands, two offshore
shoals and a wreck, reached by skiff or seaplane:

- **The Forgotten Outpost** (north-west): dock, communications hut with a radio console,
  a dead antenna mast, crates, a damaged solar array and storage under the hut floor.
- **Smuggler's Cove** (north-east): a secluded beach and loading dock, a cargo shelter
  with a radio and cipher wheel, shipping containers, and a narrow trail to a hidden
  store.
- **Relic Island** (west): ruins and a stone ring, rock outcrops, a small cave, a
  half-buried container and an observation tower on the summit.
- **Airstrip Island** (south): sheltered landing water, a floating dock, fuel store,
  research shelter, a radio beacon on the point and an abandoned camp.
- **The Lost Vessel**: a rusted coastal freighter aground on a shoal west of the cove,
  half under water. Board her from the skiff at the gap in the port rail aft. The deck
  and the wheelhouse are walkable.
- **Needle Rock** and the **Lost Sandbar**: two small offshore places with caches.

**Signal Lost** is the main story. A radio station on the ridge above the falls receives
five transmissions; each one opens the next step: restore the station's power (a breaker
panel), tune the receiver, follow the clues to the outpost, bring its antenna back online,
recover three signal fragments, chain them back together at the station, wake the old
node on Relic Island, link the nodes in the right order and open the vault under the
observation tower.

**Missions** come from the story, from the **harbour ledger** on the pier (skiff jobs and
seaplane charters) and from clues you find. Cargo runs show the cargo in the skiff or the
seaplane; it does not change how they handle. Load it next to the vehicle, arrive and stop
at the destination, step out and unload it. Missions can be tracked, restarted from the
ledger or the journal, and fail only if the cargo is lost (a seaplane crash), in which
case the cargo goes back to the pier. The ledger can also bring the skiff and the
seaplane back to their moorings, and the helicopter back to the helipad, from anywhere.
The helicopter can reach every mission area and land near it; it doesn't change any
mission.

**Treasure** comes in four kinds of container: supply caches, rugged hard cases,
encrypted strongboxes with keypads and heavy vaults. There are 17, each opened once.
Chart fragments mark caches on the archipelago chart.

**Relics** are fictional in-game collectibles kept in the **Relic Archive** (J). There are
ten, from Common to Legendary, each with an id, rarity, description, location and lore.
Relics and credits have no real-world value. Nothing is minted, traded or withdrawn.

**Progress** (missions, containers, relics, credits, clues, world changes such as opened
hatches and powered antennas) is saved in the browser (`localStorage`, key
`tidemark.progress.v1`) and restored on load. *Journal → Clues → Reset expedition
progress* clears it.

## Architecture

```
src/
  core/        Game loop & system wiring, Renderer (frame graph), Input, Settings,
               Shared uniforms + GLSL libraries, MaterialPatch (world shading injected
               into MeshStandardMaterial: wind, wetness, caustics, canopy, cloud shadows, fog)
  world/       Layout (art-directed map), Archipelago (outer islands and shoals),
               TerrainData (heights, distance fields, splats), Sites + SiteKit (buildings
               and props on the islands), Shipwreck,
               Terrain (chunked LOD), Textures (GPU-baked procedural materials), Sky,
               CloudBillboards, TimeOfDay, Weather, Atmosphere (sun, IBL, fog, grading),
               Ocean, Rocks, Waterfall, DistantScenery, Helipad
  vegetation/  Procedural plant geometry, canvas leaf textures, chunked instancing, grass
  player/      PlayerController (fixed 120 Hz step), Collision, InteractionSystem,
               Inventory, Tools (held items), FirstPersonRig (skinned hands)
  environment/ Camp, props, prop materials, pebbles, wildlife, collectibles
  vehicles/    Boat, Seaplane (FlightModel = 6-DOF physics, SeaplaneModel = procedural airframe + cockpit),
               Helicopter (HeliFlight = rotorcraft physics + assist, HeliModel = procedural airframe,
               rotors + cockpit)
  effects/     Post-processing passes, particles, rain, ripple simulation, footprints
  audio/       AudioManager (layered ambience, HRTF 3D sounds, underwater filter),
               ProceduralSounds (all default sounds are synthesized)
  systems/     Content (relics, containers, clues, missions as data), Progress (save),
               Expansion (containers, site interactions, cargo, mission engine)
  ui/          HUD, menus, inventory, notebook, chart, debug panel; ExpansionUI (mission
               tracker and waypoint, reveal card, puzzles, harbour ledger, journal)
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
