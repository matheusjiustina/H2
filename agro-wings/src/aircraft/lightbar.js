// Swath-guidance light bar: the LED pattern (shared by every display) and
// the physical bar mounted on the cowl ahead of the windshield.
//
// The pattern: one row of LEDs centred on the pass line. On the line the
// centre lights green; off it, a run of LEDs grows from the centre toward
// the side to steer to — amber near the line, red far off it — so the
// further off the line, the more the light gathers on that side (the
// "fly to the lights" convention of the agricultural light bars). Turning
// toward the next pass, only the centre glows dimly; with no job the bar is
// dark. Everything is driven by a small integer key: the displays repaint
// only when the key changes (a few times a second at most while flying a
// pass, never while it holds still).
//
// The physical bar (after the bars fitted to agricultural aircraft): a dark
// housing with a short visor over the LED window, on two light steel
// brackets bolted to the cowl, the LEDs facing the pilot. Two draw calls:
// the housing and brackets in one merged mesh (vertex colours), the LEDs in
// one instanced mesh whose colours change only with the pattern.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// LED states.
export const LB_OFF = 0, LB_DIM = 1, LB_GREEN = 2, LB_AMBER = 3, LB_RED = 4;
const RANGE = 15; // m off the line that fills one side
const DEAD = 0.75; // m: on the line

// Steps lit from the centre (signed: + = steer right) for an n-LED bar.
// Finer near the line (square root): the first metres move the light most.
function stepsFor(n, xte) {
  const half = (n - 1) / 2;
  const a = Math.abs(xte);
  if (a < DEAD) return 0;
  const k = Math.max(1, Math.min(half, Math.round(Math.sqrt(Math.min(1, (a - DEAD) / (RANGE - DEAD))) * half)));
  return Math.sign(xte) * k;
}

// Key of the pattern for an n-LED bar: mode (0 dark, 1 standby, 2 guiding)
// and the signed steps. Equal keys draw the same pattern.
export function lightbarKey(n, mode, xte) {
  return mode === 2 ? 1000 + stepsFor(n, xte) : mode;
}

// LED states for an n-LED bar into `out` (index 0 = pilot's left).
export function lightbarFill(out, n, mode, xte) {
  out.fill(LB_OFF, 0, n);
  const c = (n - 1) / 2;
  if (mode === 1) { out[c] = LB_DIM; return out; }
  if (mode !== 2) return out;
  const k = stepsFor(n, xte);
  if (k === 0) { out[c] = LB_GREEN; out[c - 1] = LB_GREEN; out[c + 1] = LB_GREEN; return out; }
  out[c] = LB_DIM;
  const s = Math.sign(k), m = Math.abs(k);
  for (let j = 1; j <= m; j++) out[c + s * j] = j > c * 0.55 ? LB_RED : LB_AMBER;
  return out;
}

// Colours of the LED states (unlit material: what is seen is what is set;
// not tone-mapped, kept below full brightness so it reads without glare).
const COL = [0x1d1512, 0x1f5a2c, 0x34e36a, 0xffa424, 0xff3b24];

// Physical bar. opts: n (LEDs), width (m of LED window), stand (bracket
// height above the mount point), tilt (rad, LED face leaning back toward
// the pilot). Local frame: +Z = forward (aircraft nose), LEDs face -Z.
export function createLightbar({ n = 25, width = 0.3, stand = 0.03, tilt = 0.12 } = {}) {
  const group = new THREE.Group();
  group.name = 'lightbar';
  const L = width + 0.05, H = 0.046, D = 0.062;
  const parts = [];
  const paint = (g, hex) => {
    const c = new THREE.Color(hex), n3 = g.attributes.position.count, a = new Float32Array(n3 * 3);
    for (let i = 0; i < n3; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    if (g.index) return g.toNonIndexed();
    return g;
  };
  const body = new THREE.Group();
  body.position.y = stand + H / 2;
  body.rotation.x = tilt; // (top away from the pilot: the face looks up at the eye)
  // Housing cross-section (y up, z forward): a rounded back, flat top
  // running aft into the visor, the LED window recessed under it.
  const s = new THREE.Shape();
  const r = 0.012;
  s.moveTo(-D / 2 + 0.016, -H / 2); // bottom, pilot side (window foot)
  s.lineTo(D / 2 - r, -H / 2);
  s.quadraticCurveTo(D / 2, -H / 2, D / 2, -H / 2 + r);
  s.lineTo(D / 2, H / 2 - r);
  s.quadraticCurveTo(D / 2, H / 2, D / 2 - r, H / 2);
  s.lineTo(-D / 2 - 0.012, H / 2); // visor over the window
  s.lineTo(-D / 2 - 0.012, H / 2 - 0.006);
  s.lineTo(-D / 2 + 0.006, H / 2 - 0.012);
  s.lineTo(-D / 2 + 0.006, -H / 2 + 0.008);
  s.lineTo(-D / 2 + 0.016, -H / 2);
  const hg = new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: false, curveSegments: 3 });
  hg.translate(0, 0, -L / 2).rotateY(-Math.PI / 2); // profile x → +z (forward), extruded along x
  body.updateMatrix();
  parts.push(paint(hg.applyMatrix4(body.matrix), 0x17191c));
  // LED window: a black face set back under the visor.
  const win = new THREE.PlaneGeometry(width + 0.012, H - 0.02).rotateY(Math.PI).translate(0, -0.002, -D / 2 + 0.0055);
  parts.push(paint(win.applyMatrix4(body.matrix), 0x050505));
  // Brackets: light steel plates on the ends, feet bolted down.
  for (const sx of [-1, 1]) {
    const x = sx * (L / 2 - 0.035);
    parts.push(paint(new THREE.BoxGeometry(0.004, stand + H * 0.6, 0.036).translate(x + sx * 0.0005, (stand + H * 0.6) / 2, 0.004), 0xa9afb5));
    parts.push(paint(new THREE.BoxGeometry(0.03, 0.003, 0.05).translate(x, 0.0015, 0.004), 0xa9afb5));
  }
  const housing = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 }));
  housing.castShadow = false;
  group.add(housing);
  // LEDs: small square dots in the window, one instanced mesh.
  const pitch = width / n;
  const dot = new THREE.PlaneGeometry(pitch * 0.62, pitch * 0.62).rotateY(Math.PI);
  const ledMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const leds = new THREE.InstancedMesh(dot, ledMat, n);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    // Index 0 = pilot's left = +X (the pilot faces +Z).
    m4.makeTranslation((((n - 1) / 2) - i) * pitch, 0, -D / 2 + 0.0045);
    m4.premultiply(body.matrix);
    leds.setMatrixAt(i, m4);
    leds.setColorAt(i, col.setHex(COL[0]));
  }
  leds.instanceMatrix.needsUpdate = true;
  leds.frustumCulled = false; // (tiny; its bounds are the dot's)
  group.add(leds);
  const states = new Uint8Array(n).fill(255);
  const want = new Uint8Array(n);
  let key = -1;
  return {
    group, n,
    // Repaints only when the pattern changes.
    set(mode, xte) {
      const k = lightbarKey(n, mode, xte);
      if (k === key) return false;
      key = k;
      lightbarFill(want, n, mode, xte);
      let dirty = false;
      for (let i = 0; i < n; i++) if (want[i] !== states[i]) { states[i] = want[i]; leds.setColorAt(i, col.setHex(COL[want[i]])); dirty = true; }
      if (dirty) leds.instanceColor.needsUpdate = true;
      return dirty;
    },
    states,
  };
}
