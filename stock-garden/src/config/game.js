/**
 * Gameplay tuning. Kept deliberately tiny: timings + layout.
 * Growth is driven only by (now - plantedAt), so state survives reloads.
 */
export const GROWTH = {
  // Seconds after planting at which each visual stage begins.
  // 0 Seed · 1 Sprout · 2 Growing · 3 Mature · 4 Ready
  stageStarts: [0, 4, 10, 16, 24],
  get readyAt() {
    return this.stageStarts[4];
  },
};

export const STAGE_NAMES = ['Seed', 'Sprout', 'Growing', 'Mature', 'Ready'];

export const LAYOUT = {
  plotSize: 1.72,
  cols: [-2.2, 0, 2.2],
  rows: [-1.15, 1.15],
  soilY: 0.3,
  // Plants are modelled ~1.5 units tall and scaled up to fill the bed.
  plantScale: 1.3,
  // Index of the plot highlighted on the very first visit (front centre).
  firstPlot: 4,
  vault: { x: 4.3, z: 1.55 },
};

export const PLOT_POSITIONS = LAYOUT.rows.flatMap((z) => LAYOUT.cols.map((x) => ({ x, z })));

export const STORAGE_KEY = 'stock-garden:v1';
