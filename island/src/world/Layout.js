// Hand-authored layout of the island region. All coordinates are metres.
// +X = east, -Z = "north" (towards the lagoon / reef), sea level = 0.
// The camp sits on the northern beach at the origin looking north across the lagoon.

export const WORLD = {
  size: 1024, // terrain extent (square, centred on origin)
  res: 513, // heightfield samples per side (2 m spacing)
  seaLevel: 0,
  playRadius: 560, // soft boundary for player / boat
};

// Main island coastline (closed loop, clockwise seen from above). Smoothed with Catmull-Rom.
export const COASTLINE = [
  [-312, -52], [-268, -40], [-210, -33], [-150, -29], [-90, -23], [-35, -19], [15, -19], [62, -24],
  [110, -33], [152, -47], [186, -68], [210, -96], [236, -112], [266, -104], [292, -76], [318, -30],
  [338, 38], [350, 118], [340, 205], [306, 296], [248, 372], [162, 424], [50, 444], [-62, 438],
  [-170, 410], [-258, 346], [-322, 258], [-350, 160], [-356, 72], [-346, 4], [-330, -34],
];

// Barrier reef crest (open polyline) enclosing the lagoon to the north.
export const REEF = [
  [-364, 128], [-404, 52], [-444, -52], [-418, -170], [-336, -258], [-210, -318], [-70, -346], [60, -350],
  [150, -340], [250, -312], [348, -250], [420, -160], [450, -50], [428, 62], [360, 146],
];

// A boat channel cuts through the reef here (centre x, half width).
export const REEF_CHANNEL = { x: 112, z: -346, halfWidth: 26 };

// The small islet across the lagoon.
export const ISLET = { x: 138, z: -196, rx: 30, rz: 20, height: 2.6, sandbarTo: [92, -168] };

// Camp: flattened clearing on the beach berm.
export const CAMP = {
  x: 0, z: 6, radius: 15, height: 2.05,
  deck: { x: 0, z: 4.2, w: 7.2, d: 5.4, y: 2.42 },
};

// Wooden pier running from the beach out into the lagoon.
export const PIER = { x: 7.5, zStart: -9.5, zEnd: -50, width: 2.1, endWidth: 4.2, endDepth: 4.0 };

// Waterfall basin in the jungle valley.
export const WATERFALL = { x: -74, z: 204, poolLevel: 16.6, floor: 17.6, poolRadius: 11, cliffTop: 31.5, lipZ: 219 };

// The viewpoint on the eastern headland.
export const VIEWPOINT = { x: 224, z: -86 };

// Dirt paths (centrelines). Smoothed with Catmull-Rom.
export const PATHS = [
  // camp -> jungle -> waterfall basin
  { width: 2.0, points: [[1.5, 11], [-3, 26], [-10, 48], [-21, 76], [-30, 104], [-44, 134], [-56, 160], [-66, 184], [-70, 192]] },
  // camp -> east along the jungle edge -> headland viewpoint
  { width: 1.8, points: [[7, 10], [26, 14], [52, 13], [84, 6], [118, -6], [150, -22], [178, -40], [198, -58], [212, -72], [221, -83]] },
  // short spur from waterfall path towards the old ruin overlook on the ridge
  { width: 1.6, points: [[-30, 104], [-12, 122], [12, 140], [34, 150], [52, 154]] },
];

// Mountain features (peak + ridge spine).
export const MOUNTAINS = {
  peaks: [
    { x: 64, z: 318, h: 168, r: 120 },
    { x: -150, z: 300, h: 96, r: 95 },
    { x: 214, z: 236, h: 84, r: 85 },
    { x: -10, z: 230, h: 58, r: 70 },
  ],
};

// Points of interest used for discoveries / notebook / debug teleports.
export const POIS = [
  { id: 'camp', name: 'Survey Camp', x: 0, z: 3, radius: 14 },
  { id: 'pier', name: 'The Old Pier', x: 7.5, z: -40, radius: 10 },
  { id: 'islet', name: 'Lone Palm Islet', x: 138, z: -196, radius: 30 },
  { id: 'reef', name: 'The Reef Wall', x: -60, z: -338, radius: 40 },
  { id: 'channel', name: 'Blue Channel', x: 112, z: -346, radius: 28 },
  { id: 'waterfall', name: 'Hidden Falls', x: -74, z: 200, radius: 22 },
  { id: 'viewpoint', name: 'Headland Lookout', x: 224, z: -86, radius: 14 },
  { id: 'westpoint', name: 'Driftwood Point', x: -296, z: -48, radius: 26 },
  { id: 'overlook', name: 'Ridge Overlook', x: 52, z: 154, radius: 14 },
  { id: 'wreck', name: 'Beached Wreck', x: -168, z: -26, radius: 14 },
];

export const SPAWN = { x: 0.6, z: 5.6, yaw: 0.12, pitch: -0.04 };
