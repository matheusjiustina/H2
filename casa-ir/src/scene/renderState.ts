/** Shared render-loop state (composer presence + pending capture). */
export const renderState = {
  composerActive: false,
  capture: null as null | ((dataUrl: string) => void),
  /** the live scene (for UI helpers such as VER DETALHE) */
  scene: null as null | import("three").Scene,
}
