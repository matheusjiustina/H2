// Hopper sight liquid (dynamic): the product seen through each aircraft's
// hopper sight window moves with the aircraft instead of standing as a flat
// band — it settles perpendicular to the felt gravity (accelerations, slips,
// pitch attitude), lags behind quick rolls and pitches and sloshes back,
// ripples with engine vibration, taxiing bumps and turbulence, and goes down
// as the hopper empties.
//
// Two parts, both cheap:
//  • HopperSlosh — a damped oscillator per axis (lateral tilt, fore-aft
//    tilt) driven by the specific force in the aircraft's frame, with the
//    first sloshing mode's natural frequency of a tank of that size. A few
//    vector operations a frame, run only while the cockpit is shown.
//  • sightLiquid() — the liquid is drawn by the sight's own material (a
//    fragment-shader addition: its surface line, gradient and meniscus over
//    the window of the existing canvas texture, or the cut of an existing
//    liquid sheet). No canvas redraw, no texture upload, no extra mesh or
//    draw call: a few uniforms change per frame.
//
// Frames: body x = left, y = up, z = forward. Sight windows sit on the
// hopper's rear wall facing the pilot, their texture u running to the
// pilot's right.
import * as THREE from 'three';

const G = 9.81;
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _f = new THREE.Vector3();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class HopperSlosh {
  // cap: hopper capacity (L). The tank's length / depth come from its volume.
  constructor(cap = 1000) {
    this.L = 1.05 * Math.cbrt(Math.max(0.1, cap / 1000)); // m (fore-aft length ≈ depth ≈ width)
    this.reset();
  }

  reset() {
    this.ok = false;
    this.tx = 0; this.vx = 0; // lateral tilt of the surface relative to the tank (rad) and its rate
    this.tz = 0; this.vz = 0; // fore-aft tilt
    this.acc = new THREE.Vector3(); this.accSlow = new THREE.Vector3();
    this.prevVel = new THREE.Vector3(); this.prevQ = new THREE.Quaternion();
    this.amp = 0; this.t = 0;
  }

  // dt: s; vel: world velocity (m/s); quat: the aircraft's (rendered)
  // orientation; s: { fill 0..1, onGround, gs (m/s), rpmFrac 0..1, running }.
  update(dt, vel, quat, s) {
    if (!(dt > 0)) return this;
    this.t += dt;
    if (!this.ok || dt > 0.5 || _f.copy(vel).sub(this.prevVel).length() > 25) {
      // First frame, after a pause or a teleport: settle at rest.
      this.prevVel.copy(vel); this.prevQ.copy(quat);
      this.acc.set(0, 0, 0); this.accSlow.set(0, 0, 0);
      this._target(quat);
      this.tx = this.gx; this.tz = this.gz; this.vx = this.vz = 0;
      this.ok = true;
      return this;
    }
    // World acceleration (filtered: the physics steps are not in phase with
    // the frames), then the specific force in the tank's frame.
    _f.copy(vel).sub(this.prevVel).divideScalar(dt).clampLength(0, 40);
    this.prevVel.copy(vel);
    this.acc.lerp(_f, 1 - Math.exp(-dt / 0.08));
    this.accSlow.lerp(this.acc, 1 - Math.exp(-dt / 0.6));
    this._target(quat);
    // The tank turning under the liquid: the surface keeps its place in the
    // world for an instant (partly: the walls drag it along).
    _q.copy(this.prevQ).invert().multiply(quat); // body-frame rotation this frame
    this.prevQ.copy(quat);
    if (_q.w < 0) { _q.x = -_q.x; _q.y = -_q.y; _q.z = -_q.z; _q.w = -_q.w; }
    const KC = 0.7;
    this.tx += 2 * _q.z * KC; // roll right (+z) → liquid higher on the right
    this.tz += -2 * _q.x * KC; // nose up (−x) → liquid runs aft (rear wall rises)
    // First sloshing mode of a tank of length L filled to depth d.
    const d = Math.max(0.06, s.fill) * this.L;
    const w = Math.sqrt(((G * Math.PI) / this.L) * Math.tanh((Math.PI * d) / this.L));
    const z = 0.07;
    const n = Math.ceil(dt / (1 / 120));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.vx += (-w * w * (this.tx - this.gx) - 2 * z * w * this.vx) * h; this.tx += this.vx * h;
      this.vz += (-w * w * (this.tz - this.gz) - 2 * z * w * this.vz) * h; this.tz += this.vz * h;
    }
    this.tx = clamp(this.tx, -0.9, 0.9); this.tz = clamp(this.tz, -0.9, 0.9);
    // Ripples: engine vibration, rolling on the ground, the slosh itself,
    // and bumps (fast changes of the felt acceleration).
    const bump = this.acc.distanceTo(this.accSlow);
    const want = Math.min(0.022,
      (s.running ? 0.0012 + 0.0028 * clamp(s.rpmFrac ?? 0, 0, 1) : 0)
      + (s.onGround ? Math.min(1, (s.gs ?? 0) / 15) * 0.006 : 0)
      + (Math.abs(this.vx) + Math.abs(this.vz)) * 0.008
      + bump * 0.0015);
    this.amp += (want - this.amp) * (1 - Math.exp(-dt / 0.25));
    return this;
  }

  // Equilibrium tilts: the surface perpendicular to the specific force.
  _target(quat) {
    _qi.copy(quat).invert();
    _f.copy(this.acc).add({ x: 0, y: G, z: 0 }).applyQuaternion(_qi);
    const up = Math.max(1, _f.y);
    this.gx = Math.atan2(_f.x, up);
    this.gz = Math.atan2(_f.z, up);
  }

  // Height of the surface at the rear wall's centre, as a share of the
  // tank's depth, for a level share `h0` (the fill as a height).
  wallHeight(h0) {
    if (h0 <= 0.002) return -1;
    // Fore-aft tilt over half the tank's length (≈ its depth), within what
    // the liquid there can give or take.
    const dh = clamp(0.5 * Math.tan(this.tz), -0.3, 0.3);
    return h0 + clamp(dh, -h0, Math.min(h0, 1 - h0 + 0.3));
  }
}

// ----------------------------------------------------------------------------
// The material part.
//
// sightLiquid(material, { size: [W, H], windows, sheet }) — `size` is the
// canvas in pixels (or, for a liquid sheet, its size in mm: the same maths
// in the sheet's own uv). Each window:
//   box:  [x0, x1, row0, row1] (px) where liquid may show,
//   rows: [[rowA, hA], [rowB, hB]] — the canvas row of two heights (share of
//         the tank's depth), linear in between (and beyond),
//   mask: optional { circle: [cx, cy, r] } or { capsule: [cx, r] } (a
//         vertical slot over the box's rows),
//   top / bot: [r, g, b, a] (0..255, 0..1) — the product at its surface and
//         at the box's bottom; men: [r, g, b, a] and menPx — the meniscus.
// A sheet (`sheet: true`, one window over the whole uv) keeps its own
// colour and lighting; above the surface it is cut away. `mirror`: the
// texture's u runs to the pilot's left on that mesh.
const MAXW = 3;
const col = (c) => new THREE.Vector4(c[0] / 255, c[1] / 255, c[2] / 255, c[3]);

export function sightLiquid(material, { size, windows, sheet = false, mirror = false, heightOf = (f) => f }) {
  const n = Math.min(MAXW, windows.length);
  const U = {
    uLqSize: { value: new THREE.Vector2(size[0], size[1]) },
    uLqT: { value: 0 },
    uLqBox: { value: [] }, uLqMask: { value: [] }, uLqDyn: { value: [] },
    uLqTop: { value: [] }, uLqBot: { value: [] }, uLqMen: { value: [] },
  };
  const rowsOf = [];
  for (let i = 0; i < n; i++) {
    const w = windows[i];
    U.uLqBox.value.push(new THREE.Vector4(...w.box));
    const m = w.mask?.circle ? [1, ...w.mask.circle] : w.mask?.capsule ? [2, w.mask.capsule[0], 0, w.mask.capsule[1]] : [0, 0, 0, 0];
    U.uLqMask.value.push(new THREE.Vector4(...m));
    U.uLqDyn.value.push(new THREE.Vector4(1e6, 0, 0, w.menPx ?? 3));
    U.uLqTop.value.push(col(w.top ?? [0, 0, 0, 0])); U.uLqBot.value.push(col(w.bot ?? w.top ?? [0, 0, 0, 0]));
    U.uLqMen.value.push(col(w.men ?? [255, 255, 255, 0]));
    const [[ra, ha], [rb, hb]] = w.rows;
    rowsOf.push({ ra, ha, k: (rb - ra) / (hb - ha), cx: (w.box[0] + w.box[1]) / 2 });
  }
  material.defines = { ...(material.defines ?? {}), USE_UV: '', LQ_N: n, ...(sheet ? { LQ_SHEET: '' } : {}) };
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => {
    prev?.call(material, sh, r);
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec2 uLqSize; uniform float uLqT;
uniform vec4 uLqBox[LQ_N]; uniform vec4 uLqMask[LQ_N]; uniform vec4 uLqDyn[LQ_N];
uniform vec4 uLqTop[LQ_N]; uniform vec4 uLqBot[LQ_N]; uniform vec4 uLqMen[LQ_N];`)
      .replace('#include <map_fragment>', `#include <map_fragment>
float lqEm = 1.0;
{
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uLqSize;
  for (int i = 0; i < LQ_N; i++) {
    vec4 B = uLqBox[i];
    if (px.x < B.x || px.x > B.y || px.y < B.z || px.y > B.w) continue;
    vec4 M = uLqMask[i];
    if (M.x > 0.5 && M.x < 1.5 && length(px - M.yz) > M.w) continue;
    if (M.x > 1.5 && length(px - vec2(M.y, clamp(px.y, B.z + M.w, B.w - M.w))) > M.w) continue;
    vec4 D = uLqDyn[i];
    float xn = (px.x - B.x) / max(1.0, B.y - B.x);
    float s = D.x - D.y * (px.x - 0.5 * (B.x + B.y))
      + D.z * (0.6 * sin(xn * 9.0 + uLqT * 7.3) + 0.4 * sin(xn * 17.0 - uLqT * 4.1 + 1.3));
#ifdef LQ_SHEET
    if (px.y < s - D.w) discard;
    if (px.y < s) diffuseColor.rgb = mix(diffuseColor.rgb, uLqMen[i].rgb, uLqMen[i].a);
#else
    if (px.y < s - D.w) continue;
    vec4 c = px.y < s ? uLqMen[i] : mix(uLqTop[i], uLqBot[i], clamp((px.y - s) / max(1.0, B.w - s), 0.0, 1.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, c.rgb, c.a);
    lqEm *= 1.0 - c.a * 0.6;
#endif
  }
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance *= lqEm;`);
  };
  material.customProgramCacheKey = () => `lq${n}${sheet ? 's' : ''}`;
  material.needsUpdate = true;
  return {
    material, uniforms: U, heightOf, size, windows, // (size / windows: where the product shows — tests, tools)
    // Per frame (cockpit shown): the slosh state and the fill (0..1).
    set(sl, fill) {
      U.uLqT.value = sl.t;
      const hw = sl.wallHeight(heightOf(clamp(fill, 0, 1)));
      const tan = Math.tan(sl.tx) * (mirror ? -1 : 1);
      for (let i = 0; i < n; i++) {
        const R = rowsOf[i], D = U.uLqDyn.value[i];
        D.x = hw < 0 ? 1e6 : R.ra + (hw - R.ha) * R.k; // the surface's row at the window's centre
        D.y = tan; // rows per pixel across (square pixels)
        D.z = sl.amp * Math.abs(R.k); // ripple, in rows
      }
    },
  };
}
