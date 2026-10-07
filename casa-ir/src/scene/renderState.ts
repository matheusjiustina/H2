/** Shared render-loop state (composer presence + pending capture). */
export const renderState = {
  composerActive: false,
  capture: null as null | ((dataUrl: string) => void),
}
