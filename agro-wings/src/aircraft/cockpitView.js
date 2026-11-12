// Cockpit seen from outside.
//
// The real interior is drawn from the cockpit view and from any outside
// camera within CABIN_FULL m of the aircraft (kept to CABIN_FULL_OUT so it
// never flickers at the edge). Beyond that the canopy is a few pixels across
// and the interior is not drawn (its 60–130 draw calls are saved). No
// stand-in geometry: nothing extra can show through the glass at any angle.
export const CABIN_FULL = 30; // m
export const CABIN_FULL_OUT = 34; // m

// True while the detailed cockpit should be drawn (with hysteresis).
export function cabinFull(inCockpit, dist, wasFull) {
  return inCockpit || dist < (wasFull ? CABIN_FULL_OUT : CABIN_FULL);
}

// The flown aircraft, every frame (any camera: chase, orbit, replay, title
// screen). Parked aircraft keep their interior hidden.
export function updateCabin(ac) {
  const g = ac.game, m = ac.model;
  if (!g?.camera || ac.parked || !m.cockpit) return;
  const inCk = g.cameraMode === 'cockpit' && g.aircraft === ac;
  ac._ckFull = cabinFull(inCk, g.camera.position.distanceTo(ac.rPos), ac._ckFull);
  m.cockpit.visible = ac._ckFull;
}
