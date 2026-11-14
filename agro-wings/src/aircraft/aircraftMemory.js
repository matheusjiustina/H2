// Aircraft memory (optimisation, stage 1). The fleet stays in the world —
// every aircraft is parked where it was — but only the flown one keeps its
// full resources:
//
//  * a PARKED aircraft is "light": the canvases of its cockpit, pilot and
//    panel (instrument faces, placards, GPS screen…) are released — a parked
//    aircraft's cockpit is hidden anyway (Aircraft.park) — and, on devices
//    with less memory, its exterior paint is kept at a lower resolution (it
//    is seen across the apron; the flown aircraft always has full textures);
//  * the FLOWN aircraft is rebuilt in full (a fresh model and panel from its
//    type, exactly as at start-up) when it is selected, and the CPU copies of
//    its exterior paint are released once the GPU has them;
//  * after a WebGL context loss every aircraft is rebuilt (the GPU copies are
//    gone and some CPU copies were released), one per frame.
//
// Nothing here changes a geometry, a material's look, a physics value or an
// access rule. Memory tier: `?mem=low|mid|high` forces it (tests).

export function memoryTier(caps = {}, win = typeof window !== 'undefined' ? window : null) {
  const q = win?.location?.search ? new URLSearchParams(win.location.search).get('mem') : null;
  if (q === 'low' || q === 'mid' || q === 'high') return q;
  const gb = caps.memoryGB;
  if (caps.coarsePointer) return gb != null && gb >= 6 ? 'mid' : 'low'; // phones / tablets (iOS: no deviceMemory → low)
  if (gb != null && gb <= 4) return 'mid';
  return 'high';
}
// Exterior paint of a PARKED aircraft, linear scale per tier.
export const PARKED_PAINT = { low: 0.25, mid: 0.5, high: 1 };

const isCanvas = (img) => img && typeof img.getContext === 'function' && img.width > 0;

// Textures of an aircraft (model tree + panel), split by where they are used:
// inside the cockpit / pilot subtree only, or anywhere outside it.
export function aircraftTextures(ac) {
  const { root, cockpit, pilot } = ac.model;
  const inside = new Set(), outside = new Set();
  const take = (set, o) => { for (const m of [].concat(o.material ?? [])) for (const k in m) { const t = m[k]; if (t?.isTexture) set.add(t); } };
  const walk = (o, ck) => {
    const c = ck || o === cockpit || o === pilot;
    take(c ? inside : outside, o);
    for (const ch of o.children) walk(ch, c);
  };
  walk(root, false);
  if (ac.panel?.texture?.isTexture && !outside.has(ac.panel.texture)) inside.add(ac.panel.texture);
  for (const t of outside) inside.delete(t);
  return { cockpit: inside, exterior: outside };
}

// Free a canvas's pixels now (the GC would, later).
export function releaseCanvas(c) { if (isCanvas(c) && c.width * c.height > 1) { c.width = 1; c.height = 1; } }

// Scale a canvas's content down in place (the texture keeps the same object).
export function shrinkCanvas(c, s) {
  if (!isCanvas(c) || s >= 1) return false;
  const w = Math.max(4, Math.round(c.width * s)), h = Math.max(4, Math.round(c.height * s));
  if (w >= c.width && h >= c.height) return false;
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  const g = tmp.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(c, 0, 0, w, h);
  c.width = w; c.height = h; // clears and frees the old pixels
  c.getContext('2d').drawImage(tmp, 0, 0);
  tmp.width = tmp.height = 1;
  return true;
}

// Give the GPU resources of a model back (its canvases are released too).
// Shared things are never touched: the scene's environment map and render
// targets; `keep` = canvases another aircraft still uses.
// (After a context loss the GPU objects are gone already: `gpu` false skips
// the deletes, which would only raise WebGL errors.)
export function disposeModel(model, scene, keep = new Set(), gpu = true) {
  const seen = new Set();
  model.root.traverse((o) => {
    if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); if (gpu) o.geometry.dispose(); }
    for (const m of [].concat(o.material ?? [])) {
      if (seen.has(m)) continue;
      seen.add(m);
      for (const k in m) {
        const t = m[k];
        if (!t?.isTexture || seen.has(t) || t.isRenderTargetTexture || t === scene.environment) continue;
        seen.add(t);
        if (gpu) t.dispose();
        if (!keep.has(t.image)) releaseCanvas(t.image);
      }
      if (gpu) m.dispose();
    }
  });
}

// A fresh model and panel for an aircraft, from its type (as at start-up),
// in place of the current ones; pose and visibility carried over.
export function rebuildModel(ac, keep, { gpu = true } = {}) {
  const g = ac.game, old = ac.model, reg = ac.type.reg;
  ac.panel = ac.type.createPanel({ reg });
  ac.model = ac.type.createModel(ac.panel, { envMap: g.scene.environment, reg });
  const r = ac.model.root;
  r.visible = old.root.visible;
  g.scene.remove(old.root);
  g.scene.add(r);
  if (ac.model.pilot && old.pilot) ac.model.pilot.visible = old.pilot.visible;
  if (ac.model.cockpit && old.cockpit) ac.model.cockpit.visible = old.cockpit.visible;
  disposeModel(old, g.scene, keep, gpu);
  ac._sync?.();
  // (A parked aircraft is posed now; the flown one at its next frame — its
  // cockpit decides then, from the camera, what to show.)
  if (!ac.headless && ac.parked) ac._animate?.(0);
  return ac.model;
}
