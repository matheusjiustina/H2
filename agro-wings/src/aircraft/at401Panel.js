// Air Tractor AT-401B — instrument textures. (Exterior phase placeholder:
// nothing is drawn until the AT-401B cockpit replaces it.)
export function createAT401Panel({ reg = 'PR-ATR' } = {}) {
  let r = reg;
  return { texture: null, draw() {}, setReg(x) { r = x; }, get reg() { return r; } };
}
