/**
 * Tiny tween/timeline runner driven by the main loop (seconds).
 * tweens.add({ delay, dur, update(t), done() })
 */
export class Tweens {
  constructor() {
    this.list = [];
  }
  add({ delay = 0, dur = 0, update, done }) {
    const tw = { t: -delay, dur, update, done, dead: false };
    this.list.push(tw);
    return tw;
  }
  wait(sec, fn) {
    return this.add({ delay: sec, dur: 0, done: fn });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tw = this.list[i];
      if (tw.dead) {
        this.list.splice(i, 1);
        continue;
      }
      tw.t += dt;
      if (tw.t < 0) continue;
      const k = tw.dur > 0 ? Math.min(1, tw.t / tw.dur) : 1;
      tw.update?.(k);
      if (k >= 1) {
        tw.dead = true;
        this.list.splice(i, 1);
        tw.done?.();
      }
    }
  }
}
