// The valley's fixed layout, shared by the sim (pure) and the renderer: stream path, burrows on both banks, fords.
export const streamX = (z) => -9 + 15 * Math.sin(z * 0.043 + 0.9) + 5 * Math.sin(z * 0.11 + 2.0);   // stream centre line
export const STREAM_W = 3.5;          // water half-width (m)
export const BANK = 1;                // rabbits keep this far back from the water's edge
export const WATER_LIM = STREAM_W + BANK;

// +1 = east bank, -1 = west bank
export const sideOf = (x, z) => (x >= streamX(z) ? 1 : -1);
export const inWater = (x, z, pad = 0) => Math.abs(x - streamX(z)) < WATER_LIM + pad;

// Warrens, alternating east / west so the first few founders already sit on both banks.
export const BURROWS = [
  { x: 24, z: 5 }, { x: -13, z: 7 },
  { x: 19, z: 29 }, { x: -29, z: -12 },
  { x: 8, z: -26 }, { x: -23, z: 27 },
  { x: 30, z: -22 }, { x: -38, z: 4 },
].map((b) => ({ ...b, side: sideOf(b.x, b.z) }));

// Stepping-stone fords (z of each crossing). The renderer puts a row of stones at each one.
export const FORDS = [-24, 4.2, 31];
export const fordPoint = (zf, side, back = 1.6) => ({ x: streamX(zf) + side * (WATER_LIM + back), z: zf });

// Where translocated rabbits walk in from (angle on the valley rim, radians; x = cos, z = sin) and what the UI calls it.
export const ARRIVE_FROM = {
  alpine: { angle: -Math.PI / 2, edge: 'north' },      // the pine ridge at the back of the valley
  desert: { angle: 0, edge: 'east' },
  river: { angle: Math.PI / 2 + 0.6, edge: 'south-west' },
};
