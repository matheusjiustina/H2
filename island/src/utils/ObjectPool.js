/** Minimal object pool to avoid allocations for frequently spawned objects. */
export class ObjectPool {
  constructor(factory, prewarm = 0) {
    this.factory = factory;
    this.free = [];
    for (let i = 0; i < prewarm; i++) this.free.push(factory());
  }

  acquire() { return this.free.pop() || this.factory(); }

  release(obj) { this.free.push(obj); }
}
