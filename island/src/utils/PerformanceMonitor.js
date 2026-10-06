/** Smoothed frame time / FPS tracking for the debug panel. */
export class PerformanceMonitor {
  constructor() {
    this.fps = 60;
    this.ms = 16.7;
    this.last = 0;
    this.start = 0;
  }

  begin(now) {
    if (this.last) {
      const dt = now - this.last;
      if (dt > 0) this.fps += (1000 / dt - this.fps) * 0.05;
    }
    this.last = now;
    this.start = now;
  }

  end(now) {
    this.ms += (now - this.start - this.ms) * 0.05;
  }
}
