// Graphics capability detection from what the platform actually offers
// (WebGL limits and extensions, the GPU string as ONE signal, the pointer
// type, pixel density), not from the user agent. Hints only: they pick a
// conservative starting profile for the automatic mode, which the frame-time
// measurements then confirm or correct. Never above 'alto' on its own.
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic|angle \(.*(null|none)/i;

export function detectCapabilities(renderer, win = typeof window !== 'undefined' ? window : null) {
  const gl = renderer?.getContext?.();
  const caps = renderer?.capabilities;
  const nav = win?.navigator ?? {};
  let gpu = 'unknown';
  try {
    const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
    if (dbg) gpu = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
  } catch { /* blocked: stays unknown */ }
  const has = (n) => { try { return !!gl?.getExtension(n); } catch { return false; } };
  const c = {
    webgl2: !!caps?.isWebGL2,
    maxTextureSize: caps?.maxTextureSize ?? 0,
    maxSamples: caps?.maxSamples ?? 0,
    maxAnisotropy: caps?.getMaxAnisotropy?.() ?? 0,
    floatRenderTargets: has('EXT_color_buffer_float') || has('EXT_color_buffer_half_float'),
    depthTexture: !!caps?.isWebGL2 || has('WEBGL_depth_texture'),
    gpu,
    software: SOFTWARE.test(gpu),
    coarsePointer: !!win?.matchMedia?.('(pointer: coarse)').matches,
    dpr: win?.devicePixelRatio ?? 1,
    cores: nav.hardwareConcurrency ?? null,
    memoryGB: nav.deviceMemory ?? null, // hint only (Chromium; coarse)
    screenPixels: win?.screen ? win.screen.width * win.screen.height * (win.devicePixelRatio ?? 1) ** 2 : null,
  };
  c.startProfile = startProfile(c);
  return c;
}

// Conservative starting rung. Fallbacks: no WebGL2 / software rendering →
// economico; unknown values count as not-strong.
export function startProfile(c) {
  if (!c.webgl2 || c.software || c.maxTextureSize < 4096) return 'economico';
  const weakHint = (c.memoryGB != null && c.memoryGB <= 2) || (c.cores != null && c.cores <= 2) || (c.coarsePointer && c.dpr >= 3 && (c.cores ?? 4) <= 4);
  if (weakHint) return 'economico';
  const strong = !c.coarsePointer && (c.cores ?? 0) >= 8 && c.maxTextureSize >= 16384 && c.maxSamples >= 4 && c.dpr <= 2;
  return strong ? 'alto' : 'medio';
}
