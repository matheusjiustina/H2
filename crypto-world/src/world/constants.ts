/** Planet-wide constants. Gameplay-relevant values live here so render quality never changes them. */
export const PLANET_RADIUS = 70;
/** Height of the sea surface relative to PLANET_RADIUS. */
export const SEA_LEVEL = -0.55;
/** Terrain below this relative height blocks walking (the player wades in the shallows, then stops). */
export const WATER_BLOCK_LEVEL = -0.95;
/** Cube-sphere grid resolution per face (quads). Shared by physics and rendering so feet never float. */
export const TERRAIN_RES = 128;
/** Terrain chunks per face side. */
export const TERRAIN_CHUNKS = 4;
export const WORLD_SEED = 'living-chain-21m';
