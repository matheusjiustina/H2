// Thrush 510G cockpit, after three cockpit photographs of 510Gs (one in
// flight over a field, a frontal view of the whole panel, a wide view of
// the interior). One coherent fit for the GE H80 aircraft:
//   - a black panel under a big padded hood with rounded upper corners,
//     recessed behind the hood's rim, tilted back toward the pilot;
//   - left: master caution / warning lamps over the MVP-50T-style engine
//     monitor (screen, push buttons, select knob), its alerts switch, the
//     wet compass under it;
//   - centre: airspeed (MPH / knots) over the altimeter, and beside them
//     the G5-style attitude unit over the hopper sight window;
//   - right: the big AG-NAV-style guidance unit in its olive bezel;
//   - on the hood: the guidance display (pass, cross-track, ground speed,
//     height) with the LED lightbar;
//   - under the panel: two sloped consoles (engine / lights toggles and
//     dimmers on the left, the breaker matrix on the right), the hopper's
//     beige rear wall with its litre scale between them, the stick (white
//     shaft, black grip, red buttons) on its torque tube, two pedal sets
//     either side of the hopper, a metal floor; the power quadrant on the
//     left wall, the boom valve on the right; a black mesh seat with a
//     harness; white-painted walls and tube frame; window seals and the roof
//     lining.
// Every needle and screen shows the flight model's state through
// Aircraft.instruments() (see thrushPanel.js); the 3D needles follow the
// last values with a short visual damping. Materials and geometry are
// merged per material.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvas, canvasTexture } from '../core/textures.js';
import { clamp, lerp, smoothstep } from '../core/math.js';
import { tagged, shade, tx, rod, tube, ball, rbox, grid, lathe } from './model.js';
import { SILL, CAN, fusX, canW, canF, wsC, WS_K, COCKPIT_OFF, EYE } from './thrushGeom.js';
import { TH_SCREENS, FACE, CONSOLE, DIAL } from './thrushPanel.js';

const o3 = (x, y, z) => [x + COCKPIT_OFF[0], y + COCKPIT_OFF[1], z + COCKPIT_OFF[2]];
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

// Panel plane: lower edge centre P0, tilted back 12° (top forward).
const TILT = (12 * Math.PI) / 180;
const P0 = new THREE.Vector3(0, 0.8, 0.24);
const PU = new THREE.Vector3(-1, 0, 0); // u: the pilot's right
const PV = new THREE.Vector3(0, Math.cos(TILT), Math.sin(TILT));
const PW = new THREE.Vector3().crossVectors(PU, PV); // toward the pilot
const PMAT = new THREE.Matrix4().makeBasis(PU, PV, PW).setPosition(P0);
const pAt = (u, v, w = 0) => P0.clone().addScaledVector(PU, u).addScaledVector(PV, v).addScaledVector(PW, w);
// Panel outline (u, v): straight sides, rounded upper corners.
const PW2 = FACE.w / 2, PH = FACE.h, CR = 0.1;
function outlinePts(inset = 0, n = 10) {
  const w = PW2 - inset, h = PH - inset, r = CR - inset * 0.5, pts = [];
  pts.push([-w, inset]);
  for (let i = 0; i <= n; i++) { const a = Math.PI - (i / n) * (Math.PI / 2); pts.push([-w + r + Math.cos(a) * r, h - r + Math.sin(a) * r]); }
  for (let i = 0; i <= n; i++) { const a = Math.PI / 2 - (i / n) * (Math.PI / 2); pts.push([w - r + Math.cos(a) * r, h - r + Math.sin(a) * r]); }
  pts.push([w, inset]);
  return pts;
}

// Unit cut-outs in the panel face (u, v centre; w, h).
const UNITS = {
  mvp: { u: -0.282, v: 0.205, w: 0.166, h: 0.13, bez: [0.198, 0.19] },
  g5: { u: 0.055, v: 0.29, w: 0.072, h: 0.09, bez: [0.092, 0.122] },
  agnav: { u: 0.28, v: 0.212, w: 0.25, h: 0.164, bez: [0.31, 0.226] },
  sight: { u: 0.055, v: 0.142, w: 0.06, h: 0.098 },
};
const DIALS = { asi: { u: -0.063, v: 0.288, r: 0.041 }, alt: { u: -0.063, v: 0.152, r: 0.041 } };

function meshTexture() {
  const c = canvas(64, 64), g = c.getContext('2d');
  g.fillStyle = '#141516'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#2b2d30'; g.lineWidth = 2;
  for (let i = -64; i < 128; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); }
  const t = canvasTexture(c, { aniso: 4 });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6);
  return t;
}
function floorTexture() {
  const c = canvas(128, 256), g = c.getContext('2d');
  g.fillStyle = '#d4d6d6'; g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#8a8e91';
  for (let y = 10; y < 256; y += 64) g.fillRect(0, y, 128, 12);
  const t = canvasTexture(c, { aniso: 4 });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function buildThrushCockpit({ M, panel, posts, ringSurface, ringAt, roofYs }) {
  const cockpit = new THREE.Group();
  cockpit.name = 'thrushCockpit';
  const CM = {
    panelBody: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.72, metalness: 0.2 }),
    pad: new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.86, metalness: 0.0 }),
    bezel: new THREE.MeshStandardMaterial({ color: 0x141618, roughness: 0.72, metalness: 0.15 }),
    olive: new THREE.MeshStandardMaterial({ color: 0x5c5833, roughness: 0.7, metalness: 0.1 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.38, metalness: 0.8 }),
    screw: new THREE.MeshStandardMaterial({ color: 0x6d737a, roughness: 0.35, metalness: 0.9 }),
    white: new THREE.MeshStandardMaterial({ color: 0xe6e7e4, roughness: 0.62, metalness: 0.08, vertexColors: true }),
    tubeW: new THREE.MeshStandardMaterial({ color: 0xdedfdc, roughness: 0.5, metalness: 0.15 }),
    floor: new THREE.MeshStandardMaterial({ color: 0xffffff, map: floorTexture(), roughness: 0.75, metalness: 0.25, vertexColors: true }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.92 }),
    grip: new THREE.MeshStandardMaterial({ color: 0x0f1011, roughness: 0.55, metalness: 0.05 }),
    red: new THREE.MeshStandardMaterial({ color: 0xc8261b, roughness: 0.4 }),
    knob: new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.35, metalness: 0.2 }),
    toggle: new THREE.MeshStandardMaterial({ color: 0xd0d4d8, roughness: 0.25, metalness: 0.9 }),
    seat: new THREE.MeshStandardMaterial({ color: 0xffffff, map: meshTexture(), roughness: 0.92 }),
    harness: new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.8 }),
    headliner: new THREE.MeshStandardMaterial({ color: 0xe9e9e6, roughness: 0.95, side: THREE.DoubleSide }),
    hopperWall: new THREE.MeshStandardMaterial({ map: panel.hopperWall?.tex ?? null, color: panel.hopperWall ? 0xffffff : 0xb9a57c, roughness: 0.6 }),
    liquid: new THREE.MeshStandardMaterial({ color: 0x5e9a7c, roughness: 0.25, transparent: true, opacity: 0.85 }),
    sightBack: new THREE.MeshStandardMaterial({ color: 0xbcae8c, roughness: 0.7 }),
    needle: new THREE.MeshBasicMaterial({ color: 0xf2f2ee }),
    lampCaution: new THREE.MeshStandardMaterial({ color: 0x4d3a10, roughness: 0.4, emissive: 0xffb020, emissiveIntensity: 0 }),
    lampWarning: new THREE.MeshStandardMaterial({ color: 0x4a1712, roughness: 0.4, emissive: 0xff2a1a, emissiveIntensity: 0 }),
    lampLow: new THREE.MeshStandardMaterial({ color: 0x4a1712, roughness: 0.4, emissive: 0xff2a1a, emissiveIntensity: 0 }),
    lampGreen: new THREE.MeshStandardMaterial({ color: 0x173d22, roughness: 0.4, emissive: 0x3dff7a, emissiveIntensity: 0 }),
  };
  const scr = (tex, k = 0.7) => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.22, metalness: 0, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: k });
  const C = {};
  const addC = (mat, g) => { (C[mat] ||= []).push(tagged(g)); };
  const inPanel = (g) => g.applyMatrix4(PMAT);

  // ------------------------------------------------ CockpitStructure
  // Inner skin of the cabin walls below the sill, the floor, the footwell
  // front wall, the rear bulkhead behind the seat (also closing the cabin
  // fairing above the sill), the roof lining.
  const wallX = (z, y) => fusX(z, y) - 0.022;
  const Z0 = 0.6, Z1 = CAN.zR + 0.03, YF = 0.28;
  for (const sx of [1, -1]) {
    addC('white', grid((u, v) => { const z = lerp(Z0, Z1, u), y = lerp(YF, SILL - 0.008, v); return [sx * wallX(z, y), y, z]; }, 18, 8, [sx * 3, 0.4, -0.2]));
    // Tube frame along the walls: a longeron and diagonals.
    const Wp = (z, y) => [sx * (wallX(z, y) - 0.016), y, z];
    for (const [a, b] of [[[0.55, 0.78], [-0.9, 0.78]], [[0.5, 0.36], [-0.1, 1.15]], [[-0.1, 0.36], [-0.1, 1.15]], [[-0.1, 0.36], [-0.7, 1.15]], [[-0.7, 0.36], [-0.7, 1.15]]]) {
      addC('tubeW', tube(Array.from({ length: 6 }, (_, i) => Wp(lerp(a[0], b[0], i / 5), lerp(a[1], b[1], i / 5))), 0.016, 10, 8));
    }
  }
  {
    const shapeAt = (z, y0, y1, n = 12) => {
      const s = new THREE.Shape(), xs = (y) => wallX(z, y);
      s.moveTo(-xs(y0), y0);
      for (let i = 0; i <= n; i++) { const y = y0 + ((y1 - y0) * i) / n; s.lineTo(xs(y), y); }
      for (let i = n; i >= 0; i--) { const y = y0 + ((y1 - y0) * i) / n; s.lineTo(-xs(y), y); }
      return s;
    };
    // Footwell front wall (under the panel, ahead of the pedals).
    addC('white', tx(new THREE.ShapeGeometry(shapeAt(Z0, YF, P0.y - 0.02), 2).rotateY(Math.PI), 0, 0, Z0));
    // Rear bulkhead: from the floor up to above the sill, its top following
    // the glasshouse.
    const r = new THREE.Shape();
    const xr = (y) => (y <= SILL ? wallX(Z1, y) : canW(y) - 0.02);
    const yTop = CAN.yt - 0.03;
    r.moveTo(-xr(YF), YF);
    for (let i = 0; i <= 20; i++) { const y = YF + ((yTop - YF) * i) / 20; r.lineTo(xr(y), y); }
    for (let i = 20; i >= 0; i--) { const y = YF + ((yTop - YF) * i) / 20; r.lineTo(-xr(y), y); }
    addC('white', tx(new THREE.ShapeGeometry(r, 2), 0, 0, Z1));
  }
  // Floor (painted aluminium with anti-slip strips).
  {
    const fl = grid((u, v) => { const z = lerp(Z0, Z1, v), x = lerp(-1, 1, u) * wallX(z, YF + 0.02); return [x, YF, z]; }, 6, 10, [0, -1, 0]);
    const p = fl.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) * 1.2; uv[i * 2 + 1] = p.getZ(i) * 2.2; }
    fl.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    addC('floor', fl);
  }
  // Roof lining under the white fibreglass roof.
  const hlYs = roofYs.map((y) => y - 0.012);
  const headliner = mergeGeometries([tagged(ringSurface(hlYs, 0.012)), (() => {
    // Cap over the top ring (the lining stops short of the crown).
    const yTop = hlYs[hlYs.length - 1];
    const sh = new THREE.Shape(ringAt(yTop, 0.012).map(([x, , z]) => new THREE.Vector2(x, z)));
    return tagged(new THREE.ShapeGeometry(sh, 2).rotateX(Math.PI / 2).translate(0, yTop, 0));
  })()]);
  // Window seals: black rubber along the windshield panes' inner edges and
  // the door and quarter windows; an inner header across the windshield top.
  for (const sx of [1, -1]) {
    for (const key of ['centre', 'aPost', 'door', 'rear']) {
      const pts = posts[key][sx > 0 ? 0 : 1].map(([x, y, z]) => [x - Math.sign(x) * 0.018, y, z - (key === 'centre' ? 0.012 : 0)]);
      addC('rubber', tube(pts, 0.006, 12, 5));
    }
  }
  {
    const y = CAN.glassTop - 0.02, n = 16, pts = [];
    for (let i = 0; i <= n; i++) {
      const x = lerp(-1, 1, i / n) * (canW(y) - 0.03);
      const c = Math.min(wsC(y), canW(y) * 0.7);
      const z = canF(y) - Math.max(0, Math.abs(x) - c) * WS_K - 0.03;
      pts.push([x, y, z]);
    }
    addC('tubeW', tube(pts, 0.022, 24, 8));
  }

  // ------------------------------------------------ Dashboard
  // Panel body: the face plate with the units' cut-outs, 30 mm thick.
  const holeRect = (U) => { const h = new THREE.Path(); h.moveTo(U.u - U.w / 2, U.v - U.h / 2); h.lineTo(U.u - U.w / 2, U.v + U.h / 2); h.lineTo(U.u + U.w / 2, U.v + U.h / 2); h.lineTo(U.u + U.w / 2, U.v - U.h / 2); h.closePath(); return h; };
  const faceShape = () => {
    const s = new THREE.Shape(outlinePts().map(([u, v]) => new THREE.Vector2(u, v)));
    for (const k of ['mvp', 'g5', 'agnav', 'sight']) s.holes.push(holeRect(UNITS[k]));
    for (const d of Object.values(DIALS)) { const h = new THREE.Path(); h.absarc(d.u, d.v, d.r + 0.003, 0, Math.PI * 2, true); s.holes.push(h); }
    return s;
  };
  {
    const g = new THREE.ShapeGeometry(faceShape(), 12);
    const p = g.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) + PW2) / FACE.w; uv[i * 2 + 1] = p.getY(i) / PH; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    inPanel(g);
    const faceMat = new THREE.MeshStandardMaterial({ map: panel.face?.tex ?? panel.texture ?? null, roughness: 0.66, metalness: 0.18 });
    const faceMesh = new THREE.Mesh(g, faceMat);
    faceMesh.receiveShadow = true;
    cockpit.add(faceMesh);
    var panelMesh = faceMesh; // eslint-disable-line no-var
    const body = new THREE.ExtrudeGeometry(faceShape(), { depth: 0.03, bevelEnabled: false, curveSegments: 10 });
    body.translate(0, 0, -0.031);
    addC('panelBody', inPanel(body));
  }
  // Hood: a padded rim round the panel's sides and top, standing 7 cm proud
  // of the face toward the pilot, and the padded top from the rim forward
  // to the windshield base.
  {
    const path = outlinePts(-0.012, 14);
    const prof = [[0.0, -0.01], [0.012, 0.02], [0.022, 0.05], [0.02, 0.075], [0.005, 0.088], [-0.018, 0.09], [-0.032, 0.078], [-0.036, 0.05], [-0.034, 0.0]];
    // prof: [outward from the outline, toward the pilot]
    const rings = path.map(([u, v], i) => {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
      const tu = b[0] - a[0], tv = b[1] - a[1], l = Math.hypot(tu, tv) || 1;
      let nu = tv / l, nv = -tu / l; // outward normal in the panel plane
      if (nu * u + nv * (v - PH / 2) < 0) { nu = -nu; nv = -nv; }
      return prof.map(([o, w]) => pAt(u + nu * o, v + nv * o, w));
    });
    const pos = [], idx = [], m = prof.length;
    for (const r of rings) for (const q of r) pos.push(q.x, q.y, q.z);
    for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < m - 1; k++) { const a = i * m + k; idx.push(a, a + 1, a + m, a + 1, a + m + 1, a + m); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    addC('pad', g);
    // Padded top: from the rim's crown back to the windshield base.
    const N = 24;
    addC('pad', grid((uu, vv) => {
      const u = lerp(-PW2 + 0.02, PW2 - 0.02, uu);
      const top = pAt(u, PH + 0.02 - (Math.abs(u) > PW2 - CR ? CR - Math.sqrt(Math.max(0, CR * CR - (Math.abs(u) - (PW2 - CR)) ** 2)) : 0), 0.03);
      const x = -u, c = Math.min(wsC(SILL), canW(SILL) * 0.7);
      const fz = canF(SILL) - Math.max(0, Math.abs(x) - c) * WS_K - 0.015;
      return [top.x, lerp(top.y, SILL + 0.025, vv) + 0.02 * Math.sin(Math.PI * vv), lerp(top.z, fz, vv)];
    }, N, 4, [0, -1, 0]));
  }
  // Instrument dials: faces, bezels, 3D needles.
  const dialMat = new THREE.MeshStandardMaterial({ map: panel.dials?.tex ?? null, roughness: 0.5, emissive: 0xffffff, emissiveMap: panel.dials?.tex ?? null, emissiveIntensity: 0.06 });
  const needles = {};
  for (const [id, d] of Object.entries(DIALS)) {
    const face = new THREE.CircleGeometry(d.r, 40);
    const uv = face.attributes.uv;
    const u0 = id === 'asi' ? 0 : 0.5;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, uv.getY(i));
    face.translate(d.u, d.v, -0.018);
    cockpit.add(new THREE.Mesh(inPanel(face), dialMat));
    addC('bezel', inPanel(new THREE.TorusGeometry(d.r + 0.004, 0.0055, 8, 36).translate(d.u, d.v, -0.002)));
    addC('bezel', inPanel(new THREE.CylinderGeometry(d.r + 0.004, d.r + 0.004, 0.018, 36, 1, true).rotateX(Math.PI / 2).translate(d.u, d.v, -0.011)));
    // Mounting screws at the corners.
    for (const [du, dv] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) addC('screw', inPanel(new THREE.CylinderGeometry(0.0035, 0.0035, 0.004, 8).rotateX(Math.PI / 2).translate(d.u + du * (d.r + 0.007), d.v + dv * (d.r + 0.007), 0.002)));
    const mk = (len, w) => {
      const grp = new THREE.Group();
      const n = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.0015).translate(0, len / 2 - 0.006, 0), CM.needle);
      grp.add(n);
      grp.position.copy(pAt(d.u, d.v, -0.013));
      grp.quaternion.setFromRotationMatrix(new THREE.Matrix4().extractRotation(PMAT));
      cockpit.add(grp);
      return grp;
    };
    needles[id] = id === 'asi' ? [mk(d.r * 0.88, 0.0035)] : [mk(d.r * 0.86, 0.003), mk(d.r * 0.56, 0.0055)];
    addC('knob', inPanel(new THREE.CylinderGeometry(0.0045, 0.0045, 0.004, 10).rotateX(Math.PI / 2).translate(d.u, d.v, -0.01)));
    // Instrument glass: a very light, depth-writing-off clear disc.
    if (id === 'alt') addC('knob', inPanel(new THREE.CylinderGeometry(0.006, 0.006, 0.012, 10).rotateX(Math.PI / 2).translate(d.u - d.r * 0.86, d.v - d.r * 0.86, 0.004)));
  }
  // Screens: each unit's display set back in its cut-out, bezel, buttons.
  const screen = (U, tex, depth, bezMat, k) => {
    const g = new THREE.PlaneGeometry(U.w, U.h).translate(U.u, U.v, -depth);
    const m = new THREE.Mesh(inPanel(g), scr(tex, k));
    cockpit.add(m);
    if (U.bez) {
      const b = new RoundedBoxGeometry(U.bez[0], U.bez[1], 0.026, 3, 0.008);
      const hole = U; void hole;
      b.translate(U.u, U.v + (U.bez[1] - U.h) * 0.18, -0.006);
      // The bezel box would hide the screen: build it as a frame instead
      // (four rounded bars round the display).
      b.dispose();
      const bw = U.bez[0], bh = U.bez[1], cx = U.u, cy = U.v + (bh - U.h) * 0.18;
      const top = cy + bh / 2, bot = cy - bh / 2, l = cx - bw / 2, r = cx + bw / 2;
      const sl = U.u - U.w / 2, sr = U.u + U.w / 2, st = U.v + U.h / 2, sb = U.v - U.h / 2;
      for (const [x0, x1, y0, y1] of [[l, r, st, top], [l, r, bot, sb], [l, sl, sb, st], [sr, r, sb, st]]) {
        addC(bezMat, inPanel(new RoundedBoxGeometry(Math.max(0.004, x1 - x0), Math.max(0.004, y1 - y0), 0.014, 2, 0.003).translate((x0 + x1) / 2, (y0 + y1) / 2, 0.004)));
      }
      return { m, frame: { l, r, top, bot } };
    }
    return { m };
  };
  const SC = panel.screens ?? {};
  const mvp = screen(UNITS.mvp, SC.mvp?.tex, 0.012, 'bezel', 0.75);
  // MVP push buttons along the bezel's bottom, select knob at the right.
  for (let i = 0; i < 4; i++) addC('knob', inPanel(new RoundedBoxGeometry(0.02, 0.011, 0.008, 2, 0.002).translate(UNITS.mvp.u - 0.05 + i * 0.033, mvp.frame.bot + 0.012, 0.02)));
  addC('knob', inPanel(new THREE.CylinderGeometry(0.009, 0.01, 0.012, 16).rotateX(Math.PI / 2).translate(mvp.frame.r - 0.012, mvp.frame.bot + 0.014, 0.022)));
  const g5 = screen(UNITS.g5, SC.g5?.tex, 0.01, 'bezel', 0.8);
  addC('knob', inPanel(new THREE.CylinderGeometry(0.008, 0.009, 0.012, 16).rotateX(Math.PI / 2).translate(UNITS.g5.u + 0.03, g5.frame.bot + 0.01, 0.022)));
  const ag = screen(UNITS.agnav, SC.agnav?.tex, 0.014, 'olive', 0.7);
  // AG-NAV: radio-style page buttons down the bezel's left, a USB port and
  // a lamp row on top.
  for (let i = 0; i < 5; i++) addC('knob', inPanel(new THREE.CylinderGeometry(0.0045, 0.0045, 0.006, 10).rotateX(Math.PI / 2).translate(ag.frame.l + 0.013, UNITS.agnav.v + 0.06 - i * 0.03, 0.02)));
  addC('knob', inPanel(new THREE.BoxGeometry(0.014, 0.006, 0.004).translate(ag.frame.r - 0.03, ag.frame.bot + 0.007, 0.02)));
  // Hopper sight window: a beige well behind the cut-out with the liquid
  // level in it (scaled with the hopper load).
  const S = UNITS.sight;
  addC('panelBody', inPanel(new THREE.BoxGeometry(S.w + 0.012, 0.006, 0.05).translate(S.u, S.v + S.h / 2 + 0.003, -0.03)));
  addC('panelBody', inPanel(new THREE.BoxGeometry(S.w + 0.012, 0.006, 0.05).translate(S.u, S.v - S.h / 2 - 0.003, -0.03)));
  cockpit.add(new THREE.Mesh(inPanel(new THREE.PlaneGeometry(S.w, S.h).translate(S.u, S.v, -0.055)), CM.sightBack));
  const liquid = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.h).translate(0, S.h / 2, 0), CM.liquid);
  liquid.position.copy(pAt(S.u, S.v - S.h / 2, -0.05));
  liquid.quaternion.setFromRotationMatrix(new THREE.Matrix4().extractRotation(PMAT));
  cockpit.add(liquid);
  addC('metal', inPanel(new THREE.TorusGeometry(1, 0.08, 4, 4).scale(S.w * 0.55, S.h * 0.55, 0.02).rotateZ(Math.PI / 4).translate(S.u, S.v, 0.0)));
  // Annunciator lamps, the MVP alerts toggle, the wet compass.
  const lamp = (u, v, mat) => cockpit.add(new THREE.Mesh(inPanel(new RoundedBoxGeometry(0.028, 0.014, 0.01, 2, 0.003).translate(u, v, 0.004)), mat));
  lamp(-0.33, 0.362, CM.lampCaution);
  lamp(-0.22, 0.362, CM.lampWarning);
  addC('toggle', inPanel(new THREE.CylinderGeometry(0.0022, 0.003, 0.02, 8).rotateX(-1.2).translate(-0.41, 0.25, 0.01)));
  addC('screw', inPanel(new THREE.CylinderGeometry(0.0055, 0.0055, 0.006, 12).rotateX(Math.PI / 2).translate(-0.41, 0.25, 0.002)));
  addC('bezel', inPanel(new RoundedBoxGeometry(0.06, 0.05, 0.05, 2, 0.01).translate(-0.4, 0.11, 0.025)));
  cockpit.add(new THREE.Mesh(inPanel(new THREE.CylinderGeometry(0.019, 0.019, 0.04, 16, 1, true, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).translate(-0.4, 0.112, 0.045)), new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.5 })));
  // Panel screws round the edge.
  for (const [u, v] of [[-0.44, 0.04], [0.44, 0.04], [-0.44, 0.22], [0.44, 0.22], [-0.3, 0.385], [0.3, 0.385], [-0.11, 0.06], [0.11, 0.06], [-0.13, 0.39], [0.13, 0.39]]) {
    addC('screw', inPanel(new THREE.CylinderGeometry(0.0042, 0.0042, 0.004, 10).rotateX(Math.PI / 2).translate(u, v, 0.002)));
  }

  // Glareshield guidance display + LED lightbar (centre of the hood).
  const leds = [];
  {
    const c = new THREE.Vector3(0, SILL + 0.075, 0.37);
    const look = new THREE.Matrix4().lookAt(new THREE.Vector3(...EYE), c, new THREE.Vector3(0, 1, 0)).setPosition(c);
    const [hw, hh] = [0.15, 0.045];
    const face = new THREE.PlaneGeometry(hw, hh).translate(0, 0, 0.012).applyMatrix4(look);
    cockpit.add(new THREE.Mesh(face, scr(SC.hud?.tex, 0.9)));
    addC('bezel', new RoundedBoxGeometry(hw + 0.02, hh + 0.04, 0.02, 2, 0.005).translate(0, 0.008, 0).applyMatrix4(look));
    addC('bezel', new THREE.BoxGeometry(0.06, 0.05, 0.03).translate(0, -0.045, 0.0).applyMatrix4(look));
    for (let i = -7; i <= 7; i++) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.006, 0.004), new THREE.MeshBasicMaterial({ color: 0x1c1c1c }));
      led.position.set(-i * 0.0095, hh / 2 + 0.012, 0.012).applyMatrix4(look);
      led.quaternion.setFromRotationMatrix(new THREE.Matrix4().extractRotation(look));
      cockpit.add(led);
      leds.push(led);
    }
  }

  // ------------------------------------------------ Consoles
  // Two sloped consoles hanging under the panel: the face from the panel's
  // lower edge down and back toward the pilot, side cheeks and a bottom.
  const consoleMat = new THREE.MeshStandardMaterial({ map: panel.consoles?.tex ?? null, roughness: 0.7, metalness: 0.18 });
  const consoles = [];
  for (const [side, def, u0] of [[1, CONSOLE.left, 0], [-1, CONSOLE.right, 0.5]]) {
    const xc = side * 0.28;
    const top = new THREE.Vector3(xc, P0.y - 0.005, P0.z - 0.005), bot = new THREE.Vector3(xc, 0.6, 0.03);
    const up = top.clone().sub(bot);
    const h = up.length();
    up.normalize();
    const uDir = new THREE.Vector3(-1, 0, 0);
    const nrm = new THREE.Vector3().crossVectors(uDir, up).normalize(); // toward the pilot, up
    const cm = new THREE.Matrix4().makeBasis(uDir, up, nrm).setPosition(bot);
    const faceG = new THREE.PlaneGeometry(def.w, h).translate(0, h / 2, 0);
    const uv = faceG.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * 0.5);
    faceG.applyMatrix4(cm);
    cockpit.add(new THREE.Mesh(faceG, consoleMat));
    // Cheeks and bottom (body).
    for (const s of [-1, 1]) {
      const sh = new THREE.Shape([new THREE.Vector2(top.z, top.y), new THREE.Vector2(bot.z, bot.y), new THREE.Vector2(bot.z, 0.52), new THREE.Vector2(top.z, 0.52)]);
      const cg = new THREE.ShapeGeometry(sh).rotateY(-Math.PI / 2);
      cg.translate(xc + s * def.w / 2, 0, 0);
      addC('panelBody', cg);
    }
    addC('panelBody', tx(new THREE.BoxGeometry(def.w, 0.012, top.z - bot.z), xc, 0.52, (top.z + bot.z) / 2));
    const at = (u, v, w = 0) => new THREE.Vector3(u, v * (h / 0.2), w).applyMatrix4(cm);
    const cq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(cm));
    const place = (geo, u, v, w = 0) => { const p = at(u, v, w); geo.applyQuaternion(cq); geo.translate(p.x, p.y, p.z); return geo; };
    for (const [u, v] of def.toggles ?? []) {
      addC('screw', place(new THREE.CylinderGeometry(0.0055, 0.0065, 0.008, 10).rotateX(Math.PI / 2), u, v, 0.004));
      addC('toggle', place(new THREE.CylinderGeometry(0.0022, 0.003, 0.022, 8).translate(0, 0.011, 0).rotateX(0.5), u, v, 0.006));
    }
    for (const [u, v] of def.knobs ?? []) addC('knob', place(new THREE.CylinderGeometry(0.011, 0.012, 0.014, 18).rotateX(Math.PI / 2), u, v, 0.007));
    if (def.rows) {
      const parts = [];
      for (let i = 0; i < def.rows; i++) for (let j = 0; j < def.cols; j++) parts.push(place(new THREE.CylinderGeometry(0.0055, 0.0055, 0.012, 10).rotateX(Math.PI / 2), -0.12 + j * 0.022, 0.155 - i * 0.032, 0.006));
      addC('knob', mergeGeometries(parts));
      cockpit.add(new THREE.Mesh(place(new THREE.CylinderGeometry(0.009, 0.009, 0.01, 14).rotateX(Math.PI / 2), 0.12, 0.08, 0.005), CM.red));
    }
    if (def.lamp) {
      const lm = new THREE.Mesh(place(new RoundedBoxGeometry(0.026, 0.016, 0.01, 2, 0.003), def.lamp[0], def.lamp[1], 0.005), side > 0 ? CM.lampLow : CM.lampCaution);
      cockpit.add(lm);
    }
    consoles.push({ cm, h });
  }
  // Hopper rear wall between the consoles (litre / gallon scale).
  {
    const w = 0.24, y0 = YF + 0.02, y1 = P0.y - 0.01, z = P0.z - 0.02;
    cockpit.add(new THREE.Mesh(tx(new THREE.PlaneGeometry(w, y1 - y0), 0, (y0 + y1) / 2, z, 0, Math.PI), CM.hopperWall));
    // Its sides back to the footwell wall.
    for (const s of [-1, 1]) addC('white', tx(new THREE.PlaneGeometry(Z0 - z, y1 - y0), s * w / 2, (y0 + y1) / 2, (z + Z0) / 2, 0, s * Math.PI / 2));
  }

  // ------------------------------------------------ ControlStick
  // Same grip position as the PR-AGW's so the shared pilot's hand fits:
  // white shaft out of a boot on the torque tube, black grip with the two
  // red buttons, the trim hat and the spray trigger.
  const stick = new THREE.Group();
  stick.position.set(...o3(0, -0.22, -0.12));
  {
    const boot = new THREE.Mesh(lathe([[0.075, 0], [0.068, 0.02], [0.05, 0.06], [0.03, 0.1], [0.018, 0.14]], 16), CM.rubber);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.5, 12), CM.tubeW);
    shaft.position.y = 0.27;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 12), CM.metal);
    collar.position.y = 0.52;
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.12, 6, 14), CM.grip);
    grip.position.set(0, 0.62, 0.012);
    grip.rotation.x = 0.22;
    const head = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.05, 0.06, 2, 0.015), CM.grip);
    head.position.set(0, 0.705, 0.02);
    head.rotation.x = 0.22;
    const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.014, 12), CM.red);
    b1.position.set(0.014, 0.735, 0.03);
    const b2 = b1.clone(); b2.position.x = -0.014;
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.012, 8), CM.metal);
    hat.position.set(0, 0.724, 0.052); hat.rotation.x = 1.2;
    const trig = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.035, 0.012), CM.knob);
    trig.position.set(0, 0.61, 0.046);
    stick.add(boot, shaft, collar, grip, head, b1, b2, hat, trig);
  }
  cockpit.add(stick);
  // Torque tube housing on the floor under the stick.
  addC('white', rbox(0.12, 0.1, 0.5, 0.02, ...o3(0, -0.27, -0.05)));

  // ------------------------------------------------ RudderPedals
  const pedals = [];
  for (const sx of [1, -1]) {
    const p = new THREE.Group();
    p.position.set(...o3(sx * 0.17, -0.12, 0.42));
    p.rotation.x = -0.6;
    const plate = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.17, 0.02, 2, 0.006), CM.metal);
    const tread = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.004), CM.rubber);
    tread.position.z = -0.012;
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.02, 0.03), CM.metal);
    strap.position.set(0, 0.06, -0.025);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.22, 8), CM.tubeW);
    arm.position.set(0, -0.13, 0.03);
    // Master cylinder behind the pedal (white body, as in the photos).
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 12), CM.tubeW);
    cyl.position.set(sx * 0.07, -0.05, 0.08); cyl.rotation.x = 0.8;
    p.add(plate, tread, strap, arm, cyl);
    cockpit.add(p);
    pedals.push(p);
    // Pedal bar pivots on the floor.
    addC('white', rbox(0.16, 0.04, 0.06, 0.01, ...o3(sx * 0.17, -0.31, 0.5)));
  }

  // ------------------------------------------------ PilotSeat
  {
    const s = (w, h, d, x, y, z, rx = 0) => { const g = new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d) * 0.3); g.rotateX(rx); g.translate(x, y, z); return g; };
    const parts = [s(0.48, 0.09, 0.46, ...o3(0, 0.05, -0.55)), s(0.46, 0.66, 0.07, ...o3(0, 0.44, -0.82), -0.12), s(0.4, 0.2, 0.07, ...o3(0, 0.88, -0.88), -0.12)];
    const sg = mergeGeometries(parts.map((g) => { g.deleteAttribute('uv'); const p = g.attributes.position, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) * 2; uv[i * 2 + 1] = (p.getY(i) + p.getZ(i)) * 2; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g; }));
    cockpit.add(new THREE.Mesh(sg, CM.seat));
    // Aluminium frame and floor rails.
    for (const sx of [1, -1]) {
      addC('metal', rod(o3(sx * 0.23, -0.04, -0.33), o3(sx * 0.23, -0.04, -0.78), 0.012, 8));
      addC('metal', rod(o3(sx * 0.23, -0.04, -0.78), o3(sx * 0.22, 0.8, -0.92), 0.012, 8));
      addC('metal', rod(o3(sx * 0.2, -0.32, -0.38), o3(sx * 0.21, -0.05, -0.4), 0.012, 8));
      addC('metal', rod(o3(sx * 0.2, -0.32, -0.75), o3(sx * 0.21, -0.05, -0.76), 0.012, 8));
      addC('metal', rbox(0.03, 0.02, 0.62, 0.005, ...o3(sx * 0.2, -0.33, -0.56)));
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.62, 0.01), CM.harness);
      strap.position.set(...o3(sx * 0.12, 0.48, -0.76));
      strap.rotation.x = -0.12;
      cockpit.add(strap);
      const lap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.01, 0.3), CM.harness);
      lap.position.set(...o3(sx * 0.16, 0.11, -0.42));
      cockpit.add(lap);
    }
    addC('metal', rbox(0.07, 0.05, 0.012, 0.01, ...o3(0, 0.12, -0.3)));
  }

  // ------------------------------------------------ Power quadrant (left wall)
  // Power lever (black ball, also into beta / reverse), condition lever
  // (red), on a quadrant box against the left wall; the boom valve lever on
  // the right wall.
  const THR = [0.36, 0.3, -0.1]; // power lever pivot, PR-AGW frame
  addC('panelBody', rbox(0.09, 0.07, 0.42, 0.015, ...o3(0.44, 0.27, -0.08)));
  addC('panelBody', rbox(0.05, 0.16, 0.36, 0.012, ...o3(0.47, 0.18, -0.08)));
  for (const lx of [0.4, 0.44]) addC('knob', rbox(0.008, 0.004, 0.28, 0.002, ...o3(lx, 0.307, -0.08)));
  for (const lz of [-0.24, -0.14, 0.02, 0.08]) addC('toggle', rbox(0.06, 0.003, 0.006, 0.001, ...o3(0.43, 0.309, lz)));
  const throttle = new THREE.Group();
  throttle.position.set(...o3(...THR));
  {
    const tl = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.17, 8), CM.metal);
    tl.position.y = 0.085;
    const tk = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), CM.knob);
    tk.position.y = 0.175;
    throttle.add(tl, tk);
  }
  cockpit.add(throttle);
  {
    const lv = new THREE.Group();
    lv.position.set(...o3(0.44, 0.3, -0.06));
    lv.rotation.x = 0.35;
    const s2 = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.14, 8), CM.metal);
    s2.position.y = 0.07;
    const k = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.035, 14), CM.red);
    k.position.y = 0.14; k.rotation.z = Math.PI / 2;
    lv.add(s2, k);
    cockpit.add(lv);
  }
  const valve = new THREE.Group();
  valve.position.set(...o3(-0.42, 0.28, -0.12));
  {
    addC('panelBody', rbox(0.07, 0.06, 0.22, 0.012, ...o3(-0.44, 0.25, -0.12)));
    const vl = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.16, 8), CM.metal);
    vl.position.y = 0.08;
    const vk = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.03, 0.03, 2, 0.008), CM.red);
    vk.position.y = 0.16;
    valve.add(vl, vk);
  }
  cockpit.add(valve);
  // Emergency dump handle (red T) by the left console.
  cockpit.add(new THREE.Mesh(tx(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 10), 0.37, 0.56, 0.12, 0, 0, Math.PI / 2), CM.red));
  addC('metal', rod([0.37, 0.56, 0.12], [0.37, 0.52, 0.22], 0.006, 6));

  // ------------------------------------------------ merge
  for (const [mat, parts] of Object.entries(C)) {
    const g = mergeGeometries(parts);
    if (g.attributes.color && mat === 'white') shade(g, (x, y, z) => 0.62 + 0.38 * smoothstep(0.2, 1.2, y) * (z < -0.7 ? 0.9 : 1));
    const m = new THREE.Mesh(g, CM[mat]);
    m.receiveShadow = true;
    cockpit.add(m);
  }
  cockpit.add(new THREE.Mesh(headliner, CM.headliner));

  // ------------------------------------------------ CockpitDataAdapter
  // Needles and lamps follow the instruments' last values (15 Hz) with a
  // short damping; the hopper level from the flight model.
  const nd = { asi: 0, alt1: 0, alt10: 0 };
  const pq = new THREE.Quaternion(), zq = new THREE.Quaternion(), ZA = new THREE.Vector3(0, 0, 1);
  const base = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(PMAT));
  const setNeedle = (grp, ang) => { zq.setFromAxisAngle(ZA, -ang); pq.copy(base).multiply(zq); grp.quaternion.copy(pq); };
  let t = 0;
  const update = (dt, fm, ac) => {
    t += dt;
    const d = panel.last;
    if (d) {
      nd.asi = damp(nd.asi, DIAL.asiAngle(d.ias), 9, dt);
      // The altimeter needles unwrap: follow the altitude itself.
      nd.alt1 = damp(nd.alt1, d.altFt, 8, dt);
      setNeedle(needles.asi[0], nd.asi);
      setNeedle(needles.alt[0], DIAL.altAngle(nd.alt1, 1000));
      setNeedle(needles.alt[1], DIAL.altAngle(nd.alt1, 10000));
      const lowFuel = d.fuel < d.fuelCap * 0.15;
      CM.lampLow.emissiveIntensity = lowFuel ? 1.6 : 0;
      CM.lampWarning.emissiveIntensity = (d.stall > 0.5 || d.itt > 805) ? (t % 0.5 < 0.25 ? 1.8 : 0.3) : 0;
      CM.lampCaution.emissiveIntensity = (lowFuel || d.engine === 'cranking') ? 1.4 : 0;
    }
    const hf = clamp(fm.hopper / Math.max(1, ac?.A?.hopperCapacity ?? 1930), 0, 1);
    liquid.scale.y = Math.max(0.001, hf);
    liquid.visible = hf > 0.002;
  };

  return { cockpit, stick, pedals, throttle, valve, leds, panelMesh, THR, update, wiper: null };
}
