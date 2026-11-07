// Bell 206B-3 JetRanger III cockpit in 3D (faces in b206Panel.js), after the
// photographed classic panel and the cabin photos:
//  * instrument panel: the black housing with the photo's outline (wide,
//    the upper corners on a large radius, the sides curving in to the
//    bottom), a moulded hood over the caution row, the light-grey face plate
//    set inside its rim; every instrument in its own case (barrel, bezel,
//    recessed dial, needles, glass, screws drawn on the plate); the caution
//    row as a framed strip of lenses lit from the simulator's state; knobs,
//    the guarded fuel-valve switch, the digital clock;
//  * centre pedestal: a sloping box from under the panel to the floor
//    between the seats, raised avionics modules (audio, COM, NAV,
//    transponder, the spray-kit controller, a switch row), knobs and toggles,
//    the two VENT pulls;
//  * AGROWINGS NAV: a modern colour GPS on a short arm on the left of the
//    hood (clear of the pilot's forward view), its screen a live canvas, its
//    four soft keys pickable (MAPA / DESTINO / MISSÃO / COBERTURA);
//  * the guidance lightbar on the hood, in the pilot's line of sight.
// Needles, attitude, heading card, turn symbol and ball move every frame
// from the simulation (update()); nothing is rebuilt in flight.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { B6_FACE, B6_HOUSING, B6_ANN, B6_ANN_TEST, B6_INST, B6_CLOCK, B6_FUEL_VALVE, B6_KNOBS, B6_DIAL, B6_ANG, B6_PED, B6_PED_MODS, B6_GPS, B6_GPS_PAGES } from './b206Panel.js';

// Panel placement (body frame): face centre, tilt back from the vertical.
export const B6_PANEL_POS = new THREE.Vector3(-0.12, -0.212, 1.9);
export const B6_PANEL_TILT = 0.22;

// Merge mixed geometries (indexed or not; uv kept only when all have one).
function merge(geos) {
  const uv = geos.every((g) => g.attributes.uv);
  return mergeGeometries(geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && !(uv && k === 'uv')) n.deleteAttribute(k);
    return n;
  }));
}
// Rounded-rectangle shape (corner radii: top, bottom).
function rrect(x0, y0, x1, y1, rt, rb = rt) {
  const s = new THREE.Shape();
  s.moveTo(x0 + rb, y0);
  s.lineTo(x1 - rb, y0);
  s.absarc(x1 - rb, y0 + rb, rb, -Math.PI / 2, 0, false);
  s.lineTo(x1, y1 - rt);
  s.absarc(x1 - rt, y1 - rt, rt, 0, Math.PI / 2, false);
  s.lineTo(x0 + rt, y1);
  s.absarc(x0 + rt, y1 - rt, rt, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, y0 + rb);
  s.absarc(x0 + rb, y0 + rb, rb, Math.PI, Math.PI * 1.5, false);
  return s;
}
// Housing outline: the photo's shape — top corners on a large radius, the
// sides bowed slightly and drawn in toward the bottom.
function housingShape(inset = 0) {
  const H = B6_HOUSING;
  const x0 = H.x0 + inset, x1 = H.x1 - inset, y0 = H.y0 + inset, y1 = H.y1 - inset;
  const r = H.r - inset * 0.5, rb = 0.03 - inset * 0.3, pinch = 0.012;
  const s = new THREE.Shape();
  s.moveTo(x0 + pinch + rb, y0);
  s.lineTo(x1 - pinch - rb, y0);
  s.absarc(x1 - pinch - rb, y0 + rb, rb, -Math.PI / 2, 0, false);
  s.quadraticCurveTo(x1 + 0.004, (y0 + y1) / 2, x1, y1 - r);
  s.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false);
  s.lineTo(x0 + r, y1);
  s.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false);
  s.quadraticCurveTo(x0 - 0.004, (y0 + y1) / 2, x0 + pinch, y0 + rb);
  s.absarc(x0 + pinch + rb, y0 + rb, rb, Math.PI, Math.PI * 1.5, false);
  return s;
}
function faceUV(geo) {
  const F = B6_FACE, p = geo.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) - F.x0) / (F.x1 - F.x0); uv[i * 2 + 1] = (p.getY(i) - F.y0) / (F.y1 - F.y0); }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
// Tapered pointer along +x (tail behind the hub).
function needleGeo(len, base, tail = 0.18) {
  const s = new THREE.Shape();
  s.moveTo(-len * tail, -base * 0.8);
  s.lineTo(len * 0.74, -base * 0.5);
  s.lineTo(len, 0);
  s.lineTo(len * 0.74, base * 0.5);
  s.lineTo(-len * tail, base * 0.8);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

export function createB206Instruments(panel, { M }) {
  const group = new THREE.Group();
  const faceMat = (map, e = 0.06) => new THREE.MeshStandardMaterial({ map, roughness: 0.7, metalness: 0.04, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: e });
  const housingMat = new THREE.MeshStandardMaterial({ color: 0x151618, roughness: 0.78, metalness: 0.05 });
  const caseMat = new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 0.5, metalness: 0.25, side: THREE.DoubleSide });
  const bezelMat = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.36, metalness: 0.45 });
  const needleW = new THREE.MeshStandardMaterial({ color: 0xf4f2ea, emissive: 0xf4f2ea, emissiveIntensity: 0.3, roughness: 0.45 });
  const needleY = new THREE.MeshStandardMaterial({ color: 0xf1c21b, emissive: 0xf1c21b, emissiveIntensity: 0.25, roughness: 0.45 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.4, metalness: 0.3 });
  const knobMat = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.45, metalness: 0.3 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xbfc3c7, roughness: 0.3, metalness: 0.85 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xb3171a, roughness: 0.45 });
  const glassMat = new THREE.MeshBasicMaterial({ map: panel.glass, transparent: true, depthWrite: false, opacity: 0.85 });

  // ---------------- instrument panel (local: x right, y up, +z to the pilot)
  const pan = new THREE.Group();
  pan.position.copy(B6_PANEL_POS);
  pan.quaternion.setFromEuler(new THREE.Euler(B6_PANEL_TILT, 0, 0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
  const F = B6_FACE;
  {
    const shell = [];
    // Deep housing behind the face (black moulding), its front rim round
    // the face plate, and the hood over the caution row.
    const back = new THREE.ExtrudeGeometry(housingShape(), { depth: 0.17, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 3, curveSegments: 16 });
    back.translate(0, 0, -0.205);
    shell.push(back);
    const ring = housingShape();
    ring.holes.push(rrect(F.x0, F.y0, F.x1, F.y1, 0.014));
    const rim = new THREE.ExtrudeGeometry(ring, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.005, bevelSegments: 3, curveSegments: 16 });
    rim.translate(0, 0, -0.026);
    shell.push(rim);
    // Hood: a visor along the top, deeper at the centre (glare shield).
    const hood = new THREE.Shape();
    const H = B6_HOUSING, hw = (H.x1 - H.x0) / 2 - 0.035;
    hood.moveTo(-hw, 0); hood.quadraticCurveTo(0, 0.085, hw, 0); hood.lineTo(hw, -0.012); hood.quadraticCurveTo(0, 0.06, -hw, -0.012); hood.closePath();
    const hg = new THREE.ExtrudeGeometry(hood, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 16 });
    hg.rotateX(-Math.PI / 2).translate(0, H.y1 + 0.004, 0.005);
    shell.push(hg);
    const m = new THREE.Mesh(merge(shell.map((g) => { g.deleteAttribute('uv'); return g; })), housingMat);
    m.castShadow = true; m.receiveShadow = true;
    pan.add(m);
    // Face plate with a hole for every instrument case.
    const fs = rrect(F.x0, F.y0, F.x1, F.y1, 0.014);
    for (const o of Object.values(B6_INST)) { const h = new THREE.Path(); h.absarc(o.x, o.y, o.r, 0, Math.PI * 2, true); fs.holes.push(h); }
    const face = new THREE.Mesh(faceUV(new THREE.ShapeGeometry(fs, 20)), faceMat(panel.texture));
    face.receiveShadow = true;
    pan.add(face);
  }
  // Cases, bezels, recessed dials, glass.
  const DZ = -0.014;
  {
    const cases = [], bezels = [], dials = [], glass = [];
    for (const [k, o] of Object.entries(B6_INST)) {
      cases.push(new THREE.CylinderGeometry(o.r, o.r, 0.03, 36, 1, true).rotateX(Math.PI / 2).translate(o.x, o.y, DZ + 0.002));
      bezels.push(new THREE.TorusGeometry(o.r * 0.985, o.r * 0.1, 8, 36).translate(o.x, o.y, 0.003));
      const blank = k.startsWith('blank');
      if (!['att', 'dg'].includes(k)) dials.push(faceUV(new THREE.CircleGeometry(o.r * (blank ? 1 : 1), 36).translate(o.x, o.y, blank ? -0.002 : DZ)));
      if (!blank) glass.push(new THREE.CircleGeometry(o.r * 0.97, 36).translate(o.x, o.y, 0.002));
    }
    pan.add(new THREE.Mesh(merge(cases), caseMat));
    pan.add(new THREE.Mesh(merge(bezels), bezelMat));
    pan.add(new THREE.Mesh(merge(dials), faceMat(panel.texture, 0.08)));
    const gm = new THREE.Mesh(merge(glass), glassMat);
    gm.renderOrder = 4;
    pan.add(gm);
  }
  // Needles.
  const at = (o, z) => new THREE.Vector3(o.x, o.y, DZ + z);
  const N = {};
  const needle = (key, ik, len, base, mat, z, tail) => {
    const o = B6_INST[ik], r = o.r * B6_DIAL;
    const n = new THREE.Mesh(needleGeo(r * len, r * base, tail), mat);
    n.position.copy(at(o, z));
    pan.add(n);
    N[key] = n;
  };
  needle('oilP', 'engOil', 0.86, 0.08, needleW, 0.002);
  needle('oilT', 'engOil', 0.86, 0.08, needleW, 0.0026);
  needle('xP', 'xmsnOil', 0.86, 0.08, needleW, 0.002);
  needle('xT', 'xmsnOil', 0.86, 0.08, needleW, 0.0026);
  for (const k of ['torque', 'tot', 'n1', 'fuel', 'fuelP', 'load']) needle(k, k, 0.86, 0.08, needleW, 0.002);
  needle('asi', 'asi', 0.88, 0.07, needleW, 0.002);
  needle('vsi', 'vsi', 0.88, 0.075, needleW, 0.002);
  needle('altH', 'alt', 0.88, 0.07, needleW, 0.003);
  needle('altT', 'alt', 0.58, 0.11, needleW, 0.0024);
  needle('tachT', 'tach', 0.9, 0.065, needleW, 0.0024);
  needle('tachR', 'tach', 0.72, 0.085, needleY, 0.003);
  {
    const hubs = [];
    for (const k of ['engOil', 'xmsnOil', 'torque', 'tot', 'n1', 'fuel', 'fuelP', 'load', 'asi', 'vsi', 'alt', 'tach']) {
      const o = B6_INST[k];
      hubs.push(new THREE.CylinderGeometry(o.r * 0.09, o.r * 0.1, 0.004, 14).rotateX(Math.PI / 2).translate(o.x, o.y, DZ + 0.0045));
    }
    pan.add(new THREE.Mesh(merge(hubs), hubMat));
  }
  // Attitude ball and overlay, heading card and overlay, turn coordinator.
  const ATT = B6_INST.att, rA = ATT.r * B6_DIAL;
  panel.attTape.wrapS = panel.attTape.wrapT = THREE.ClampToEdgeWrapping;
  panel.attTape.repeat.set(1, 60 / 180);
  const ball = new THREE.Mesh(new THREE.CircleGeometry(rA * 1.05, 40), new THREE.MeshStandardMaterial({ map: panel.attTape, emissive: 0xffffff, emissiveMap: panel.attTape, emissiveIntensity: 0.3, roughness: 0.5 }));
  ball.position.copy(at(ATT, 0));
  const attOver = new THREE.Mesh(new THREE.PlaneGeometry(rA * 2.1, rA * 2.1), new THREE.MeshStandardMaterial({ map: panel.attOverlay, transparent: true, emissive: 0xffffff, emissiveMap: panel.attOverlay, emissiveIntensity: 0.3, depthWrite: false }));
  attOver.position.copy(at(ATT, 0.004)); attOver.renderOrder = 3;
  const DG = B6_INST.dg, rD = DG.r * B6_DIAL;
  const card = new THREE.Mesh(new THREE.CircleGeometry(rD * 1.04, 40), new THREE.MeshStandardMaterial({ map: panel.card, emissive: 0xffffff, emissiveMap: panel.card, emissiveIntensity: 0.25, roughness: 0.5 }));
  card.position.copy(at(DG, 0));
  const dgOver = new THREE.Mesh(new THREE.PlaneGeometry(rD * 2.1, rD * 2.1), new THREE.MeshStandardMaterial({ map: panel.cardOverlay, transparent: true, emissive: 0xffffff, emissiveMap: panel.cardOverlay, emissiveIntensity: 0.3, depthWrite: false }));
  dgOver.position.copy(at(DG, 0.004)); dgOver.renderOrder = 3;
  const TC = B6_INST.tc, rT = TC.r * B6_DIAL;
  const tcPlane = new THREE.Mesh(new THREE.PlaneGeometry(rT * 1.7, rT * 1.7), new THREE.MeshStandardMaterial({ map: panel.tcPlane, transparent: true, emissive: 0xffffff, emissiveMap: panel.tcPlane, emissiveIntensity: 0.3, depthWrite: false }));
  tcPlane.position.copy(at(TC, 0.003)); tcPlane.position.y += rT * 0.05; tcPlane.renderOrder = 3;
  const tcBall = new THREE.Mesh(new THREE.SphereGeometry(rT * 0.09, 12, 8), hubMat);
  const tcBall0 = new THREE.Vector3(TC.x, TC.y - rT * 0.29, DZ + 0.004);
  tcBall.position.copy(tcBall0);
  pan.add(ball, attOver, card, dgOver, tcPlane, tcBall);
  // Caution row: a framed strip, the lenses a live canvas (lit cells glow).
  {
    const A = B6_ANN;
    const w = A.n * A.w + (A.n - 1) * A.gap, x0 = A.x0;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(w, A.h), new THREE.MeshStandardMaterial({ map: panel.ann.tex, emissive: 0xffffff, emissiveMap: panel.ann.tex, emissiveIntensity: 0.9, roughness: 0.35 }));
    strip.position.set(x0 + w / 2, A.y, 0.0125); // on the rim's black band
    pan.add(strip);
    const fr = [];
    for (let i = 0; i <= A.n; i++) fr.push(new THREE.BoxGeometry(0.0035, A.h + 0.004, 0.006).translate(x0 + i * (w / A.n), A.y, 0.0145));
    for (const dy of [-1, 0, 1]) fr.push(new THREE.BoxGeometry(w + 0.004, dy ? 0.0035 : 0.0018, 0.006).translate(x0 + w / 2, A.y + (dy * A.h) / 2, 0.0145));
    fr.push(new THREE.CylinderGeometry(0.009, 0.01, 0.012, 16).rotateX(Math.PI / 2).translate(B6_ANN_TEST.x, B6_ANN_TEST.y, 0.017));
    pan.add(new THREE.Mesh(merge(fr), bezelMat));
  }
  // Clock LCD, knobs, the guarded fuel-valve switch.
  {
    const C = B6_CLOCK;
    const lcd = new THREE.Mesh(new THREE.PlaneGeometry(C.w * 0.78, C.h * 0.42), new THREE.MeshStandardMaterial({ map: panel.clock.tex, emissive: 0xffffff, emissiveMap: panel.clock.tex, emissiveIntensity: 0.7, roughness: 0.3 }));
    lcd.position.set(C.x, C.y + C.h * 0.12, 0.0012);
    pan.add(lcd);
    const kn = [];
    for (const [x, y, r] of B6_KNOBS) kn.push(new THREE.CylinderGeometry(r, r * 1.08, 0.012, 16).rotateX(Math.PI / 2).translate(x, y, 0.006));
    kn.push(new THREE.CylinderGeometry(0.006, 0.0065, 0.012, 14).rotateX(Math.PI / 2).translate(B6_INST.alt.x - 0.035, B6_INST.alt.y - 0.035, 0.006));
    kn.push(new THREE.CylinderGeometry(0.006, 0.0065, 0.012, 14).rotateX(Math.PI / 2).translate(B6_INST.dg.x - 0.035, B6_INST.dg.y - 0.036, 0.006));
    kn.push(new THREE.CylinderGeometry(0.0055, 0.006, 0.012, 14).rotateX(Math.PI / 2).translate(B6_INST.att.x, B6_INST.att.y - 0.046, 0.006));
    pan.add(new THREE.Mesh(merge(kn), knobMat));
    const FV = B6_FUEL_VALVE;
    pan.add(new THREE.Mesh(merge([new THREE.BoxGeometry(0.006, 0.02, 0.012).translate(FV.x, FV.y + 0.005, 0.008)]), metalMat));
    const guard = new THREE.Mesh(new RoundedBoxGeometry(0.022, 0.034, 0.018, 2, 0.004), redMat);
    guard.position.set(FV.x, FV.y, 0.012);
    pan.add(guard);
  }
  // Guidance lightbar on the hood, in the pilot's line of sight.
  const leds = [];
  {
    const lb = new THREE.Group();
    lb.position.set(0.15, B6_HOUSING.y1 + 0.03, 0.02);
    lb.add(new THREE.Mesh(new RoundedBoxGeometry(0.19, 0.024, 0.022, 2, 0.005), housingMat));
    for (let i = -7; i <= 7; i++) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.0085, 0.01, 0.005), new THREE.MeshBasicMaterial({ color: 0x222222 }));
      led.position.set(i * 0.0112, 0, 0.011);
      lb.add(led);
      leds.push(led);
    }
    pan.add(lb);
  }

  // ---------------- AGROWINGS NAV (on its arm at the left of the hood) ----
  const gpsG = new THREE.Group();
  const pickables = [];
  {
    const GW = 0.15, GH = (GW * B6_GPS.H) / B6_GPS.W; // 7-inch class unit
    const CW = GW + 0.022, CH = GH + 0.034, CD = 0.032;
    gpsG.position.set(-0.165, B6_HOUSING.y1 + 0.012 + 0.036 + CH / 2, -0.03);
    gpsG.rotation.set(-0.12, 0.3, 0);
    const caseM = new THREE.Mesh(new RoundedBoxGeometry(CW, CH, CD, 3, 0.008), new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.55, metalness: 0.15 }));
    gpsG.add(caseM);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(GW, GH), new THREE.MeshBasicMaterial({ map: panel.gps.tex }));
    scr.position.set(0, (CH - GH) / 2 - 0.007, CD / 2 + 0.0005);
    gpsG.add(scr);
    // Thin anti-glare glass over the screen.
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(GW, GH), new THREE.MeshBasicMaterial({ map: panel.glass, transparent: true, opacity: 0.35, depthWrite: false }));
    gl.position.set(scr.position.x, scr.position.y, CD / 2 + 0.0015); gl.renderOrder = 5;
    gpsG.add(gl);
    // Four soft keys under the screen (one per page) and the power knob.
    const keyGeo = new RoundedBoxGeometry(0.026, 0.009, 0.006, 1, 0.002);
    const keyMat = new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.5, emissive: 0x52d8ff, emissiveIntensity: 0 });
    B6_GPS_PAGES.forEach((p, i) => {
      const k = new THREE.Mesh(keyGeo, keyMat.clone());
      k.position.set(-0.054 + i * 0.034, -CH / 2 + 0.01, CD / 2 + 0.002);
      k.userData.gpsPage = p;
      gpsG.add(k);
      pickables.push(k);
    });
    const pw = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.0065, 0.008, 14).rotateX(Math.PI / 2), knobMat);
    pw.position.set(CW / 2 - 0.009, -CH / 2 + 0.01, CD / 2 + 0.003);
    gpsG.add(pw);
    // Arm: ball mounts and a short double socket arm down to a base on the hood.
    const arm = [
      new THREE.SphereGeometry(0.011, 12, 8).translate(0, -CH / 2 - 0.004, -0.006),
      new THREE.CylinderGeometry(0.008, 0.008, 0.026, 10).translate(0, -CH / 2 - 0.017, -0.006),
      new THREE.SphereGeometry(0.011, 12, 8).translate(0, -CH / 2 - 0.03, -0.006),
      new THREE.CylinderGeometry(0.022, 0.024, 0.008, 18).translate(0, -CH / 2 - 0.035, -0.006),
    ];
    gpsG.add(new THREE.Mesh(merge(arm), knobMat));
    // Antenna stub and the data cable to the pedestal.
    gpsG.add(new THREE.Mesh(merge([new THREE.CylinderGeometry(0.004, 0.005, 0.07, 8).translate(CW / 2 - 0.012, CH / 2 + 0.035, -0.01)]), hubMat));
    pan.add(gpsG);
  }
  group.add(pan);

  // ---------------- centre pedestal (body frame) ----------------
  const ped = new THREE.Group();
  {
    // Side profile (z, y): from under the panel down and back to the floor.
    const top = new THREE.Vector2(1.86, -0.375), bot = new THREE.Vector2(1.47, -0.68), back = 2.06;
    const prof = new THREE.Shape([top, new THREE.Vector2(back, top.y), new THREE.Vector2(back, bot.y), bot]);
    const W = B6_PED.w;
    const body = new THREE.ExtrudeGeometry(prof, { depth: W, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2 });
    body.rotateY(-Math.PI / 2).translate(W / 2, 0, 0);
    const bm = new THREE.Mesh(body, new THREE.MeshStandardMaterial({ color: 0x232528, roughness: 0.6, metalness: 0.3 }));
    bm.castShadow = true; bm.receiveShadow = true;
    ped.add(bm);
    // Sloping face: the canvas (modules, labels) and raised parts on it.
    const dir = new THREE.Vector3(0, bot.y - top.y, bot.x - top.x).normalize(); // down the face
    const nrm = new THREE.Vector3(0, -dir.z, dir.y); // toward the pilot and up
    if (nrm.z > 0) nrm.negate();
    const P = (u, v, off = 0) => new THREE.Vector3(-u, top.y, top.x).addScaledVector(dir, v).addScaledVector(nrm, off);
    const faceM = new THREE.Mesh(new THREE.PlaneGeometry(W, B6_PED.h), faceMat(panel.ped.tex, 0.05));
    faceM.position.copy(P(0, B6_PED.h / 2, 0.007));
    faceM.lookAt(faceM.position.clone().add(nrm));
    ped.add(faceM);
    const q = faceM.quaternion;
    const parts = [], knobs = [], metal = [];
    const onFace = (g, u, v, off) => { g.applyQuaternion(q); const p = P(u, v, off); g.translate(p.x, p.y, p.z); return g; };
    for (const m of B6_PED_MODS) {
      // Module frames standing proud of the face.
      parts.push(onFace(new RoundedBoxGeometry(W - 0.016, m.h, 0.012, 2, 0.003), 0, m.y + m.h / 2, 0.012));
      if (m.kind === 'com' || m.kind === 'nav') for (const u of [-0.085, 0.09]) knobs.push(onFace(new THREE.CylinderGeometry(0.008, 0.009, 0.016, 14).rotateX(Math.PI / 2), u, m.y + m.h / 2, 0.026));
      if (m.kind === 'xpdr') knobs.push(onFace(new THREE.CylinderGeometry(0.008, 0.009, 0.014, 14).rotateX(Math.PI / 2), 0.09, m.y + m.h / 2, 0.025));
      if (m.kind === 'audio') for (let i = 0; i < 2; i++) knobs.push(onFace(new THREE.CylinderGeometry(0.006, 0.007, 0.012, 12).rotateX(Math.PI / 2), -0.09 + i * 0.18, m.y + m.h * 0.55, 0.024));
      if (m.kind === 'spray' || m.kind === 'switches') {
        const n = m.kind === 'spray' ? 4 : 6;
        for (let i = 0; i < n; i++) {
          const u = -W / 2 + 0.028 + i * ((W - 0.056) / (n - 1));
          metal.push(onFace(new THREE.CylinderGeometry(0.0022, 0.0028, 0.018, 8).rotateX(Math.PI / 2 - 0.4), u, m.y + m.h * 0.42, 0.026));
          parts.push(onFace(new THREE.CylinderGeometry(0.006, 0.006, 0.005, 12).rotateX(Math.PI / 2), u, m.y + m.h * 0.42, 0.019));
        }
      }
    }
    ped.add(new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.55, metalness: 0.25 })));
    ped.add(new THREE.Mesh(merge(knobs), knobMat));
    ped.add(new THREE.Mesh(merge(metal), metalMat));
    // VENT pull knobs either side of the pedestal top, under the panel.
    const vents = [];
    for (const sx of [1, -1]) vents.push(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 14).rotateX(Math.PI / 2 - 0.4).translate(sx * 0.15, -0.37, 1.84), new THREE.CylinderGeometry(0.004, 0.004, 0.04, 8).rotateX(Math.PI / 2 - 0.4).translate(sx * 0.15, -0.364, 1.855));
    ped.add(new THREE.Mesh(merge(vents), knobMat));
  }
  group.add(ped);

  // ---------------- per frame ----------------
  const tmpLit = new THREE.Color();
  const update = (d) => {
    const A = B6_ANG;
    const master = d.engine !== 'off' || (d.rotorPct ?? 0) > 1;
    N.oilP.rotation.z = -A.oilP(d.oilP ?? 0);
    N.oilT.rotation.z = -A.oilT(d.oilT ?? 0);
    N.xP.rotation.z = -A.xmsnP(d.xmsnOilP ?? 0);
    N.xT.rotation.z = -A.xmsnT(d.xmsnOilT ?? 0);
    N.torque.rotation.z = -A.torque(d.torque ?? 0);
    N.tot.rotation.z = -A.tot(d.itt ?? 0);
    N.n1.rotation.z = -A.n1(d.ng ?? 0);
    N.fuel.rotation.z = -A.fuel(master ? d.fuel / 3.785 : 0);
    // Fuel pressure: the boost pumps run with the master on.
    N.fuelP.rotation.z = -A.fuelP(master ? 6 + 0.06 * (d.ng ?? 0) : 0);
    N.load.rotation.z = -A.load(master && d.amps > 0 ? clampLoad(d.amps) : 0);
    N.asi.rotation.z = -A.asi(d.ias);
    N.vsi.rotation.z = -A.vsi(d.vsFpm);
    N.altH.rotation.z = -A.altHund(d.altFt);
    N.altT.rotation.z = -A.altThou(d.altFt);
    N.tachT.rotation.z = -A.tach(d.enginePct);
    N.tachR.rotation.z = -A.tach(d.rotorPct);
    const pitch = Math.max(-1, Math.min(1, d.pitch));
    panel.attTape.offset.y = 0.5 - panel.attTape.repeat.y / 2 + pitch / Math.PI;
    ball.rotation.z = d.bank;
    card.rotation.z = (d.hdg * Math.PI) / 180;
    tcPlane.rotation.z = -Math.max(-0.7, Math.min(0.7, ((d.yawRate ?? 0) / 0.0524) * 0.35));
    tcBall.position.x = tcBall0.x + Math.max(-1, Math.min(1, -(d.slip ?? 0) * 3)) * rT * 0.3;
    // Lit GPS soft key for the page shown.
    for (const k of pickables) k.material.emissiveIntensity = master && k.userData.gpsPage === panel.page ? 0.6 : 0;
    void tmpLit;
  };
  const clampLoad = (amps) => Math.max(0, Math.min(100, (amps / 105) * 100));
  // A click in the cockpit: the GPS soft keys.
  const pick = (raycaster) => {
    const h = raycaster.intersectObjects(pickables, false)[0];
    if (!h) return null;
    panel.setPage(h.object.userData.gpsPage);
    return h.object.userData.gpsPage;
  };
  return { group, panelGroup: pan, gps: gpsG, pickables, leds, update, pick };
}
