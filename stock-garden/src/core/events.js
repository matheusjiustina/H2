/** Minimal event emitter. */
export class Emitter {
  constructor() {
    this.map = new Map();
  }
  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type).add(fn);
    return () => this.map.get(type)?.delete(fn);
  }
  emit(type, payload) {
    this.map.get(type)?.forEach((fn) => fn(payload));
  }
}
