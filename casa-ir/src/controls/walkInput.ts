/** Shared input state for the walk-through (keyboard, joystick, touch look). */
export const walkInput = {
  // virtual joystick vector (-1..1)
  jx: 0,
  jy: 0,
  // accumulated look deltas (pixels) from touch drag
  lookX: 0,
  lookY: 0,
  keys: new Set<string>(),
}
