// R44 Raven II instrument pod and pedestal in 3D (faces in r44Panel.js).
// The pod is a moulded shell with the outline measured on the frontal panel
// photo (wide top with rounded ears, sides drawn in to a narrower rounded
// bottom on the pedestal, the top edge rising at the shoulders): a deep
// back, a rounded rim standing proud of the recessed face, and the face with
// a hole for every instrument. Each instrument sits in its own case (black
// barrel, bezel ring, dial set back inside, glass) — the dials come from the
// same face canvas. The moving parts are 3D and set every frame from the
// simulation: needles, the attitude ball (pitch moves the tape, bank turns
// it), the heading card, the turn-coordinator symbol and ball, the lamps
// (emissive lenses), the pedestal gauges and the switches that follow the
// aircraft's state. The pedestal is a deep box with raised module plates
// (engine cluster, switch panel, avionics) and the GPS showing the game's
// guidance; an optional tablet on an arm at the right of the pod shows the
// same screen. Nothing is redrawn on a canvas for the needles.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Merge mixed geometries (indexed or not; uv kept only when all have one).
function merge(geos) {
  const uv = geos.every((g) => g.attributes.uv);
  return mergeGeometries(geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && !(uv && k === 'uv')) n.deleteAttribute(k);
    return n;
  }));
}
import { POD, podOutline, POD_OUT, POD_IN, POD_G, DIAL, ANG, POD_LAMPS, LAMP_R, CON, CON_LAMPS, CON_G, CON_GPS, CON_SW, CON_KEY, CON_KNOBS, CON_RADIO } from './r44Panel.js';

const LAMP_COL = { r: [0xff3b2a, 0x3a120e], a: [0xffb020, 0x3a2a0c], g: [0x3dff7a, 0x0f2e17] };
const conXY = (px, py) => [(px - CON.W / 2) * CON.s, (CON.H / 2 - py) * CON.s];

// Pod outline (metres, x right, y up), optionally inset (face inside the rim).
function podShape(ins = null) {
  return new THREE.Shape(podOutline(ins).map(([x, y]) => new THREE.Vector2(x, y)));
}

// Planar UVs: pod metres -> pod canvas.
function podUV(geo) {
  const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / POD.w + 0.5; uv[i * 2 + 1] = p.getY(i) / POD.h + 0.5; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
// Planar UVs over a rectangle (console face).
function faceUV(geo, W, H) {
  const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / W + 0.5; uv[i * 2 + 1] = p.getY(i) / H + 0.5; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// Tapered pointer along +x (tail behind the hub), length in metres.
function needleGeo(len, base, tail = 0.18) {
  const s = new THREE.Shape();
  s.moveTo(-len * tail, -base * 0.8);
  s.lineTo(len * 0.72, -base * 0.5);
  s.lineTo(len, 0);
  s.lineTo(len * 0.72, base * 0.5);
  s.lineTo(-len * tail, base * 0.8);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

export function createR44Instruments(panel) {
  const group = new THREE.Group();
  const faceMat = (map, e = 0.07) => new THREE.MeshStandardMaterial({ map, roughness: 0.66, metalness: 0.06, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: e });
  // Moulded pod: matte black with a slight sheen; cases a deeper black.
  const shellMat = new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.72, metalness: 0.05 });
  const caseMat = new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 0.5, metalness: 0.25, side: THREE.DoubleSide });
  const bezelMat = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.38, metalness: 0.45 });
  const needleW = new THREE.MeshStandardMaterial({ color: 0xf4f2ea, emissive: 0xf4f2ea, emissiveIntensity: 0.35, roughness: 0.45 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.4, metalness: 0.3 });
  const knobMat = new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: 0.45, metalness: 0.3 });
  const glassMat = new THREE.MeshBasicMaterial({ map: panel.glass, transparent: true, depthWrite: false, opacity: 0.9 });

  // ---------------- pod ----------------
  const pod = new THREE.Group();
  const shellParts = [], caseParts = [], bezelParts = [], knobParts = [];
  {
    // Back: the moulding behind the face, 14 cm deep.
    // (its front stops behind the instrument cases).
    const back = new THREE.ExtrudeGeometry(podShape(), { depth: 0.11, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.008, bevelSegments: 3 });
    back.translate(0, 0, -0.158);
    shellParts.push(back);
    // Rim standing proud of the face (deeper along the top: the hood).
    const ring = podShape();
    ring.holes.push(podShape(POD_IN));
    const rim = new THREE.ExtrudeGeometry(ring, { depth: 0.046, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.006, bevelSegments: 4 });
    rim.translate(0, 0, -0.028);
    shellParts.push(rim);
    // Rolled hood lip along the top, from ear to ear (just inside the outline).
    const pts = podOutline(null, 160).filter(([, y]) => y > 0.05)
      .map(([x, y]) => ({ x, y, a: Math.atan2(y + 0.05, x) })).sort((p, q) => p.a - q.a)
      .map(({ x, y }) => new THREE.Vector3(x * 0.975, y - 0.007, 0.022));
    shellParts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.013, 10, false));
    // The face, with a hole for every instrument case.
    const fs = podShape(POD_IN);
    for (const G of Object.values(POD_G)) { const h = new THREE.Path(); h.absarc(G.x, G.y, G.r, 0, Math.PI * 2, true); fs.holes.push(h); }
    const face = new THREE.Mesh(podUV(new THREE.ShapeGeometry(fs, 24)), faceMat(panel.texture));
    face.receiveShadow = true;
    pod.add(face);
    const shell = new THREE.Mesh(merge(shellParts), shellMat);
    shell.castShadow = true; shell.receiveShadow = true;
    pod.add(shell);
  }
  // Instrument cases: barrel set into the face, bezel ring, recessed dial.
  const DZ = -0.016; // dial plane (behind the face)
  const dialGeos = [];
  for (const [k, G] of Object.entries(POD_G)) {
    if (k === 'blank') continue;
    caseParts.push(new THREE.CylinderGeometry(G.r, G.r, 0.03, 40, 1, true).rotateX(Math.PI / 2).translate(G.x, G.y, DZ + 0.004));
    bezelParts.push(new THREE.TorusGeometry(G.r * 0.985, 0.0042, 8, 40).translate(G.x, G.y, 0.0035));
    if (!['att', 'dg'].includes(k)) dialGeos.push(podUV(new THREE.CircleGeometry(G.r, 40).translate(G.x, G.y, DZ)));
  }
  // The blank position: a flush cap with the moulded logo.
  { const G = POD_G.blank; dialGeos.push(podUV(new THREE.CircleGeometry(G.r * 1.02, 40).translate(G.x, G.y, -0.002))); bezelParts.push(new THREE.TorusGeometry(G.r * 1.01, 0.003, 6, 40).translate(G.x, G.y, -0.0005)); }
  pod.add(new THREE.Mesh(merge(dialGeos), faceMat(panel.texture, 0.09)));
  // Knobs: altimeter setting, attitude pitch trim, heading set / bug.
  const knob = (x, y, r, h = 0.012) => knobParts.push(new THREE.CylinderGeometry(r, r * 1.05, h, 18).rotateX(Math.PI / 2).translate(x, y, h / 2));
  knob(POD_G.alt.x - 0.033, POD_G.alt.y - 0.034, 0.0065);
  knob(POD_G.att.x, POD_G.att.y - 0.043, 0.0058);
  knob(POD_G.dg.x - 0.033, POD_G.dg.y - 0.034, 0.0062);
  knob(POD_G.dg.x + 0.033, POD_G.dg.y - 0.034, 0.0062);
  pod.add(new THREE.Mesh(merge(caseParts), caseMat));
  pod.add(new THREE.Mesh(merge(bezelParts), bezelMat));
  pod.add(new THREE.Mesh(merge(knobParts), knobMat));

  const at = (G, z) => new THREE.Vector3(G.x, G.y, z);
  const needles = {};
  const addNeedle = (key, gk, lenK, baseK, mat, z, tail) => {
    const G = POD_G[gk], r = G.r * DIAL;
    const n = new THREE.Mesh(needleGeo(r * lenK, r * baseK, tail), mat);
    n.position.copy(at(G, DZ + z));
    pod.add(n);
    needles[key] = n;
  };
  addNeedle('vsi', 'vsi', 0.9, 0.075, needleW, 0.002);
  addNeedle('asi', 'asi', 0.9, 0.075, needleW, 0.002);
  addNeedle('map', 'map', 0.9, 0.075, needleW, 0.002);
  addNeedle('eng', 'tach', 0.9, 0.07, needleW, 0.0024);
  addNeedle('rot', 'tach', 0.9, 0.07, needleW, 0.0028);
  addNeedle('altH', 'alt', 0.88, 0.07, needleW, 0.003);
  addNeedle('altT', 'alt', 0.58, 0.11, needleW, 0.0026);
  addNeedle('altTT', 'alt', 0.92, 0.025, needleW, 0.0022, 0.02);
  {
    const hubs = [];
    for (const gk of ['vsi', 'asi', 'map', 'tach', 'alt']) {
      const G = POD_G[gk];
      hubs.push(new THREE.CylinderGeometry(G.r * 0.08, G.r * 0.09, 0.004, 16).rotateX(Math.PI / 2).translate(G.x, G.y, DZ + 0.0045));
    }
    pod.add(new THREE.Mesh(merge(hubs), hubMat));
  }
  // Attitude ball (pitch moves the tape, bank turns the disc) + overlay.
  const ATT = POD_G.att, rA = ATT.r * DIAL;
  panel.attTape.wrapS = panel.attTape.wrapT = THREE.ClampToEdgeWrapping;
  panel.attTape.repeat.set(1, 60 / 180);
  const ball = new THREE.Mesh(new THREE.CircleGeometry(rA * 1.05, 48), new THREE.MeshStandardMaterial({ map: panel.attTape, emissive: 0xffffff, emissiveMap: panel.attTape, emissiveIntensity: 0.35, roughness: 0.5 }));
  ball.position.copy(at(ATT, DZ));
  pod.add(ball);
  const attOver = new THREE.Mesh(new THREE.PlaneGeometry(rA * 2.1, rA * 2.1), new THREE.MeshStandardMaterial({ map: panel.attOverlay, transparent: true, emissive: 0xffffff, emissiveMap: panel.attOverlay, emissiveIntensity: 0.3, depthWrite: false }));
  attOver.position.copy(at(ATT, DZ + 0.004));
  attOver.renderOrder = 3;
  pod.add(attOver);
  // Heading card + overlay.
  const DG = POD_G.dg, rD = DG.r * DIAL;
  const card = new THREE.Mesh(new THREE.CircleGeometry(rD * 1.04, 48), new THREE.MeshStandardMaterial({ map: panel.card, emissive: 0xffffff, emissiveMap: panel.card, emissiveIntensity: 0.3, roughness: 0.5 }));
  card.position.copy(at(DG, DZ));
  pod.add(card);
  const dgOver = new THREE.Mesh(new THREE.PlaneGeometry(rD * 2.1, rD * 2.1), new THREE.MeshStandardMaterial({ map: panel.cardOverlay, transparent: true, emissive: 0xffffff, emissiveMap: panel.cardOverlay, emissiveIntensity: 0.3, depthWrite: false }));
  dgOver.position.copy(at(DG, DZ + 0.004));
  dgOver.renderOrder = 3;
  pod.add(dgOver);
  // Turn coordinator: the aircraft symbol rolls with the rate of turn, the
  // ball rides in its tube with the slip.
  const TC = POD_G.tc, rT = TC.r * DIAL;
  const tcPlane = new THREE.Mesh(new THREE.PlaneGeometry(rT * 1.7, rT * 1.7), new THREE.MeshStandardMaterial({ map: panel.tcPlane, transparent: true, emissive: 0xffffff, emissiveMap: panel.tcPlane, emissiveIntensity: 0.35, depthWrite: false }));
  tcPlane.position.copy(at(TC, DZ + 0.003));
  tcPlane.position.y += rT * 0.02;
  tcPlane.renderOrder = 3;
  pod.add(tcPlane);
  const tcBall = new THREE.Mesh(new THREE.SphereGeometry(rT * 0.085, 12, 8), hubMat);
  const tcBall0 = new THREE.Vector3(TC.x, TC.y - rT * 0.3, DZ + 0.002);
  tcBall.position.copy(tcBall0);
  pod.add(tcBall);
  // Glass over every instrument, inside the bezel.
  {
    const gl = [];
    for (const [k, G] of Object.entries(POD_G)) if (k !== 'blank') gl.push(new THREE.CircleGeometry(G.r * 0.97, 40).translate(G.x, G.y, 0.002));
    const m = new THREE.Mesh(merge(gl), glassMat);
    m.renderOrder = 4;
    pod.add(m);
  }
  // Lamps: small domed lenses in bezels.
  const lampGeo = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.55);
  const lampBezels = [];
  const mkLamp = (l, parent, pos, rad, bezels) => {
    const [on, off] = LAMP_COL[l.col];
    const mat = new THREE.MeshStandardMaterial({ color: off, emissive: on, emissiveIntensity: 0, roughness: 0.22, metalness: 0 });
    const m = new THREE.Mesh(lampGeo, mat);
    m.scale.setScalar(rad);
    m.position.copy(pos);
    parent.add(m);
    bezels.push(new THREE.TorusGeometry(rad * 1.15, rad * 0.28, 6, 18).translate(pos.x, pos.y, pos.z + 0.0008));
    return { key: l.key, mat, on, off, lit: null };
  };
  const lamps = POD_LAMPS.map((l) => mkLamp(l, pod, new THREE.Vector3(l.x, l.y, 0.001), LAMP_R, lampBezels));
  pod.add(new THREE.Mesh(merge(lampBezels), bezelMat));

  // Optional navigation tablet on an arm at the right of the pod (as in one
  // of the reference photos), turned toward the right seat; it shows the
  // same guidance screen as the GPS in the pedestal.
  const tablet = new THREE.Group();
  {
    tablet.position.set(POD_OUT.wTop + 0.09, -0.03, 0.05);
    tablet.rotation.y = -0.38;
    const W = 0.2, H = 0.13;
    const body = new THREE.Mesh(new RoundedBoxGeometry(W + 0.02, H + 0.02, 0.014, 3, 0.006), caseMat);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: panel.gpsTex }));
    scr.position.z = 0.0075;
    const cradle = new THREE.Mesh(new RoundedBoxGeometry(W + 0.034, 0.02, 0.03, 2, 0.006), knobMat);
    cradle.position.set(0, -H / 2 - 0.012, 0.006);
    tablet.add(body, scr, cradle);
    // Arm back to the pod's right ear.
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 10).rotateZ(Math.PI / 2), knobMat);
    arm.position.set(-0.07, -0.02, -0.03);
    const ballJ = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), knobMat);
    ballJ.position.set(-0.13, -0.02, -0.03);
    tablet.add(arm, ballJ);
  }
  pod.add(tablet);

  // ---------------- pedestal ----------------
  const con = new THREE.Group();
  const conParts = { body: [], plate: [], knob: [], metal: [] };
  {
    // Deep body behind the face, with its sides and a rounded front edge.
    const b = new RoundedBoxGeometry(CON.w + 0.024, CON.h + 0.02, 0.2, 3, 0.012);
    b.translate(0, 0, -0.1);
    conParts.body.push(b);
    // Side flanges (folded edges of the sheet-metal console).
    for (const s of [-1, 1]) conParts.plate.push(new THREE.BoxGeometry(0.004, CON.h, 0.012).translate(s * (CON.w / 2 + 0.012), 0, 0.002));
    const face = new THREE.Mesh(faceUV(new THREE.PlaneGeometry(CON.w, CON.h), CON.w, CON.h), faceMat(panel.texture2));
    face.position.z = 0.0006;
    face.receiveShadow = true;
    con.add(face);
  }
  const cat = (px, py, z = 0.002) => { const [x, y] = conXY(px, py); return new THREE.Vector3(x, y, z); };
  // Raised module plates (avionics, GPS bezel, engine cluster): a frame of
  // four bars standing off the face, the face texture showing inside.
  const frame = (px, py, pw, ph, t = 0.006, d = 0.008) => {
    const [x0, y0] = conXY(px, py), [x1, y1] = conXY(px + pw, py + ph);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, w = x1 - x0, h = y0 - y1;
    for (const [bx, by, bw, bh] of [[cx, y0 - t / 2, w, t], [cx, y1 + t / 2, w, t], [x0 + t / 2, cy, t, h], [x1 - t / 2, cy, t, h]]) {
      conParts.plate.push(new RoundedBoxGeometry(bw, bh, d, 1, Math.min(bw, bh) * 0.3).translate(bx, by, d / 2));
    }
  };
  for (const R of CON_RADIO) frame(14, R.y, 484, R.h, 0.004, 0.012);
  frame(CON_GPS.x - 14, CON_GPS.y - 12, CON_GPS.w + 28, CON_GPS.h + 24, 0.008, 0.016);
  frame(220, 82, 266, 182, 0.004, 0.006);
  const conLampBezels = [];
  const conLamps = CON_LAMPS.map((l) => mkLamp(l, con, cat(l.x, l.y, 0.001), 9.5 * CON.s, conLampBezels));
  con.add(new THREE.Mesh(merge(conLampBezels), bezelMat));
  const small = {};
  {
    const hubs = [];
    for (const [k, G] of Object.entries(CON_G)) {
      const cy = G.wide ? G.y - G.r * 0.45 : G.y;
      const n = new THREE.Mesh(needleGeo(G.r * CON.s * 0.88, G.r * CON.s * 0.1, 0.1), needleW);
      n.position.copy(cat(G.x, cy + (G.wide ? G.r * 0.9 : 0), 0.0025));
      con.add(n);
      small[k] = { n, ang: ANG.small(G.v[0], G.v[1]) };
      const p = cat(G.x, cy + (G.wide ? G.r * 0.9 : 0), 0.004);
      hubs.push(new THREE.CylinderGeometry(G.r * CON.s * 0.12, G.r * CON.s * 0.13, 0.003, 12).rotateX(Math.PI / 2).translate(p.x, p.y, p.z));
    }
    con.add(new THREE.Mesh(merge(hubs), hubMat));
  }
  // Guidance screen (live canvas) set into the GPS bezel.
  {
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(CON_GPS.w * CON.s, CON_GPS.h * CON.s), new THREE.MeshBasicMaterial({ map: panel.gpsTex }));
    scr.position.copy(cat(CON_GPS.x + CON_GPS.w / 2, CON_GPS.y + CON_GPS.h / 2, 0.0012));
    con.add(scr);
  }
  // Toggle levers (those tied to the aircraft's state move), the clutch
  // switch's red guard, the magneto key, knobs. Black rockers as on the
  // Raven II (MASTER BATTERY red).
  const toggleMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.45, metalness: 0.15 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xa8161a, roughness: 0.45 });
  const toggles = {};
  const leverGeo = new RoundedBoxGeometry(0.014, 0.02, 0.007, 1, 0.002).translate(0, 0, 0.0035);
  for (const [k, px, py, , red, guard] of CON_SW) {
    const piv = new THREE.Group();
    piv.position.copy(cat(px, py, 0.003));
    piv.add(new THREE.Mesh(leverGeo, red && !guard ? redMat : toggleMat));
    con.add(piv);
    toggles[k] = piv;
    if (guard) {
      const [gx, gy] = conXY(px, py);
      conParts.knob.push(new RoundedBoxGeometry(0.022, 0.03, 0.02, 2, 0.004).translate(gx, gy + 0.002, 0.013));
    }
  }
  {
    const guard = new THREE.Mesh(new RoundedBoxGeometry(0.022, 0.03, 0.022, 2, 0.004), redMat);
    const sw = CON_SW.find((s) => s[5]);
    guard.position.copy(cat(sw[1], sw[2] - 6, 0.014));
    guard.rotation.x = 0.25;
    con.add(guard);
  }
  {
    const knob2 = (px, py, r, h) => { const g = new THREE.CylinderGeometry(r, r * 1.05, h, 18).rotateX(Math.PI / 2); const p = cat(px, py, h / 2); g.translate(p.x, p.y, p.z); conParts.knob.push(g); };
    for (const [px, py, r] of CON_KNOBS) knob2(px, py, r, 0.014);
    for (const R of CON_RADIO) if (R.lcd) { knob2(436, R.y + R.h / 2, 0.0055, 0.01); knob2(468, R.y + R.h / 2, 0.0055, 0.01); }
    // Key barrel and key.
    knob2(CON_KEY.x, CON_KEY.y, 0.0085, 0.008);
    const k = cat(CON_KEY.x, CON_KEY.y, 0.014);
    conParts.metal.push(new THREE.BoxGeometry(0.004, 0.022, 0.012).translate(k.x, k.y + 0.004, k.z));
  }
  // Mixture (red knob, pull to lean).
  {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.016, 16).rotateX(Math.PI / 2), redMat);
    m.position.copy(cat(214, 712, 0.016));
    con.add(m);
  }
  con.add(new THREE.Mesh(merge(conParts.body), shellMat));
  con.add(new THREE.Mesh(merge(conParts.plate), bezelMat));
  con.add(new THREE.Mesh(merge(conParts.knob), knobMat));
  con.add(new THREE.Mesh(merge(conParts.metal), new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.3, metalness: 0.85 })));
  group.add(pod, con);

  // ---------------- per-frame update ----------------
  const setLamp = (L, on) => {
    if (L.lit === on) return;
    L.lit = on;
    L.mat.emissiveIntensity = on ? 2.4 : 0;
    L.mat.color.setHex(on ? L.on : L.off);
  };
  const toggleTo = (k, on) => { toggles[k].rotation.x = on ? -0.5 : 0.5; };
  const update = (d) => {
    needles.vsi.rotation.z = -ANG.vsi(d.vsFpm);
    needles.asi.rotation.z = -ANG.asi(d.ias);
    needles.map.rotation.z = -ANG.map(d.map);
    needles.eng.rotation.z = -ANG.tach(d.enginePct);
    needles.rot.rotation.z = -ANG.tach(d.rotorPct);
    needles.altH.rotation.z = -ANG.altHund(d.altFt);
    needles.altT.rotation.z = -ANG.altThou(d.altFt);
    needles.altTT.rotation.z = -ANG.altTenThou(d.altFt);
    // Attitude: nose up shows more sky, a right bank turns the horizon
    // counter-clockwise.
    const pitch = Math.max(-1, Math.min(1, d.pitch));
    panel.attTape.offset.y = 0.5 - panel.attTape.repeat.y / 2 + pitch / Math.PI;
    ball.rotation.z = d.bank;
    card.rotation.z = (d.hdg * Math.PI) / 180;
    // Turn coordinator: standard rate (3°/s) at the 2-min mark (0.35 rad).
    tcPlane.rotation.z = -Math.max(-0.7, Math.min(0.7, ((d.yawRate ?? 0) / 0.0524) * 0.35));
    tcBall.position.x = tcBall0.x + Math.max(-1, Math.min(1, -(d.slip ?? 0) * 3)) * rT * 0.3;
    small.amps.n.rotation.z = -small.amps.ang(d.amps);
    small.oilT.n.rotation.z = -small.oilT.ang(d.oilT * 1.8 + 32);
    small.oilP.n.rotation.z = -small.oilP.ang(d.oilP);
    small.cht.n.rotation.z = -small.cht.ang(d.cht * 1.8 + 32);
    small.fuel.n.rotation.z = -small.fuel.ang(d.fuel);
    small.tank.n.rotation.z = -small.tank.ang(d.hopper);
    const st = {
      oil: d.engine === 'running' && d.oilP < 25, starter: d.engine === 'cranking', clutch: !!d.clutch,
      lowFuel: d.fuel < d.fuelCap * 0.1, lowRpm: !!d.lowRotor, rotorBrake: !!d.rotorBrake, spray: !!d.spray,
      alt: d.engine !== 'running', govOff: d.engine === 'running' && !d.gov,
      fullThrottle: d.engine === 'running' && (d.power ?? 0) > 0.995,
    };
    for (const L of lamps) setLamp(L, !!(L.key && st[L.key]));
    for (const L of conLamps) setLamp(L, !!(L.key && st[L.key]));
    toggleTo('nav', true); toggleTo('strobe', d.engine !== 'off');
    toggleTo('clutch', d.engine !== 'off' || d.rotorPct > 1); toggleTo('alt', d.engine === 'running');
    toggleTo('batt', true); toggleTo('pump', d.engine === 'running'); toggleTo('valve', !!d.spray);
  };
  return { group, pod, con, tablet, update, lamps: [...lamps, ...conLamps], needles };
}
