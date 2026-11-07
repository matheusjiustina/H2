// Persistent spray coverage per field: a 2 m grid of normalized dose
// (1.0 = target rate). Deposition is computed from where liquid actually
// lands (boom line projected down with drift), never from simply being
// inside the field boundary. Also tracks off-target and overdose waste.
import { SPRAY } from '../config.js';
import { CROPS, cropHeight } from '../world/layout.js';

export class FieldCoverage {
  constructor(field) {
    this.f = field;
    this.cell = SPRAY.cell;
    this.nx = Math.ceil((field.x1 - field.x0) / this.cell);
    this.nz = Math.ceil((field.z1 - field.z0) / this.cell);
    this.dose = new Float32Array(this.nx * this.nz);
    this.area = (field.x1 - field.x0) * (field.z1 - field.z0);
    this.cellArea = this.cell * this.cell;
    this.targetPerM2 = SPRAY.targetRate / 10000; // L/m²
    this.version = 0;
    this.applied = 0; // L landed on this field
    this.overdose = 0; // L above the good window
  }

  contains(x, z, m = 0) {
    const f = this.f;
    return x >= f.x0 - m && x <= f.x1 + m && z >= f.z0 - m && z <= f.z1 + m;
  }

  // Add `litres` at a ground point. Returns litres that counted as useful.
  deposit(x, z, litres) {
    const f = this.f;
    const ix = Math.floor((x - f.x0) / this.cell), iz = Math.floor((z - f.z0) / this.cell);
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return -1;
    const i = iz * this.nx + ix;
    const add = litres / (this.cellArea * this.targetPerM2);
    const before = this.dose[i];
    const after = before + add;
    this.dose[i] = after;
    this.applied += litres;
    const hi = SPRAY.doseGood[1];
    if (after > hi) {
      const excess = (after - Math.max(before, hi)) * this.cellArea * this.targetPerM2;
      this.overdose += excess;
    }
    this.version++;
    return litres;
  }

  stats() {
    const [lo, hi] = SPRAY.doseGood;
    let good = 0, under = 0, over = 0, sum = 0, sum2 = 0, n = 0;
    const N = this.dose.length;
    for (let i = 0; i < N; i++) {
      const d = this.dose[i];
      if (d >= lo) good++; else under++;
      if (d > hi) over++;
      if (d >= 0.3) { sum += d; sum2 += d * d; n++; }
    }
    const mean = n ? sum / n : 0;
    const cv = n > 1 ? Math.sqrt(Math.max(0, sum2 / n - mean * mean)) / Math.max(1e-6, mean) : 1;
    return {
      coverage: good / N, gaps: under / N, overlap: over / N,
      uniformity: Math.max(0, Math.min(1, 1 - cv)), meanDose: mean,
    };
  }

  // Coverage fraction of one pass strip (for guidance).
  stripCoverage(axis, c0, c1) {
    const f = this.f;
    const [lo] = SPRAY.doseGood;
    let good = 0, n = 0;
    if (axis === 'x') {
      const i0 = Math.max(0, Math.floor((c0 - f.z0) / this.cell)), i1 = Math.min(this.nz - 1, Math.floor((c1 - f.z0) / this.cell));
      for (let iz = i0; iz <= i1; iz++) for (let ix = 0; ix < this.nx; ix += 2) { n++; if (this.dose[iz * this.nx + ix] >= lo) good++; }
    } else {
      const i0 = Math.max(0, Math.floor((c0 - f.x0) / this.cell)), i1 = Math.min(this.nx - 1, Math.floor((c1 - f.x0) / this.cell));
      for (let iz = 0; iz < this.nz; iz += 2) for (let ix = i0; ix <= i1; ix++) { n++; if (this.dose[iz * this.nx + ix] >= lo) good++; }
    }
    return n ? good / n : 0;
  }

  serialize() {
    // Quantized dose (0..2.55 in 0.01 steps) as base64.
    const q = new Uint8Array(this.dose.length);
    for (let i = 0; i < q.length; i++) q[i] = Math.min(255, Math.round(this.dose[i] * 100));
    let s = '';
    for (let i = 0; i < q.length; i += 0x8000) s += String.fromCharCode.apply(null, q.subarray(i, i + 0x8000));
    return { d: btoa(s), applied: this.applied, overdose: this.overdose };
  }
  restore(o) {
    if (!o || !o.d) return;
    const s = atob(o.d);
    if (s.length !== this.dose.length) return;
    for (let i = 0; i < s.length; i++) this.dose[i] = s.charCodeAt(i) / 100;
    this.applied = o.applied || 0;
    this.overdose = o.overdose || 0;
    this.version++;
  }
  reset() {
    this.dose.fill(0);
    this.applied = 0;
    this.overdose = 0;
    this.version++;
  }
}

export function fieldCropTop(f) { return cropHeight(f); }
export { CROPS };
