/** Smoothed frame time / FPS tracking for the debug panel. */
export class PerformanceMonitor {
  constructor() {
    this.fps = 60;
    this.frameMs = 16.7; // smoothed wall time between frames
    this.ms = 16.7; // smoothed CPU time spent inside the frame
    this.last = 0;
    this.start = 0;
  }

  begin(now) {
    if (this.last) {
      const dt = now - this.last;
      if (dt > 0 && dt < 2000) {
        this.frameMs += (dt - this.frameMs) * 0.05;
        this.fps = 1000 / this.frameMs;
      }
    }
    this.last = now;
    this.start = now;
  }

  end(now) {
    this.ms += (now - this.start - this.ms) * 0.05;
  }
}
