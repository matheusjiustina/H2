// R44 instrument pod and pedestal in 3D (see r44Panel.js for the faces).
// The pod is a moulded "tombstone" on top of the pedestal, tilted toward
// the pilots. The moving parts are 3D and set every frame from the
// simulation: needles, the attitude ball (pitch moves the tape, bank turns
// it), the heading card, the warning lamps (emissive lenses), the pedestal
// gauges and the switches that follow the aircraft's state; the guidance
// screen is a live canvas. Nothing is redrawn on a canvas for the needles,
// so they move as smoothly as the frame rate allows.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { POD, CON, POD_G, ANG, POD_LAMPS, CON_LAMPS, CON_G, CON_GPS } from './r44Panel.js';

const LAMP_COL = { r: [0xff3b2a, 0x3a120e], a: [0xffb020, 0x3a2a0c], g: [0x3dff7a, 0x0f2e17] };

// Face pixels -> local metres (x right, y up, origin at the face centre).
const podXY = (px, py) => [(px - POD.W / 2) * POD.s, (POD.H / 2 - py) * POD.s];
const conXY = (px, py) => [(px - CON.W / 2) * CON.s, (CON.H / 2 - py) * CON.s];

// Tombstone outline of the pod face: straight top with rounded corners,
// sides tapering a little, large rounded bottom corners.
function podShape(grow = 0) {
  const w = POD.w / 2 + grow, h = POD.h / 2 + grow, wb = w - 0.03, rt = 0.045 + grow, rb = 0.11 + grow;
  const s = new THREE.Shape();
  s.moveTo(-w + rt, h);
  s.lineTo(w - rt, h);
  s.quadraticCurveTo(w, h, w, h - rt);
  s.lineTo(wb, -h + rb);
  s.quadraticCurveTo(wb, -h, wb - rb, -h);
  s.lineTo(-wb + rb, -h);
  s.quadraticCurveTo(-wb, -h, -wb, -h + rb);
  s.lineTo(-w, h - rt);
  s.quadraticCurveTo(-w, h, -w + rt, h);
  return s;
}

// Planar UVs over the face rectangle (so the face texture lines up).
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
  s.lineTo(len * 0.7, -base * 0.5);
  s.lineTo(len, 0);
  s.lineTo(len * 0.7, base * 0.5);
  s.lineTo(-len * tail, base * 0.8);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

export function createR44Instruments(panel) {
  const group = new THREE.Group();
  const faceMat = (map, e = 0.07) => new THREE.MeshStandardMaterial({ map, roughness: 0.62, metalness: 0.08, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: e });
  const body = new THREE.MeshStandardMaterial({ color: 0x1e2023, roughness: 0.55, metalness: 0.12 });
  const needleW = new THREE.MeshStandardMaterial({ color: 0xf4f2ea, emissive: 0xf4f2ea, emissiveIntensity: 0.35, roughness: 0.45 });
  const needleY = new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffd34d, emissiveIntensity: 0.35, roughness: 0.45 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.4, metalness: 0.3 });
  const glassMat = new THREE.MeshBasicMaterial({ map: panel.glass, transparent: true, depthWrite: false, opacity: 1 });

  // ---------------- pod ----------------
  const pod = new THREE.Group();
  {
    const D = 0.15, bt = 0.008;
    const shell = new THREE.ExtrudeGeometry(podShape(), { depth: D, bevelEnabled: true, bevelThickness: bt, bevelSize: 0.008, bevelSegments: 3, curveSegments: 18 });
    shell.translate(0, 0, -(D + bt));
    const m = new THREE.Mesh(shell, body);
    m.castShadow = true; m.receiveShadow = true;
    pod.add(m);
    // Visor lip over the top edge.
    const lip = new RoundedBoxGeometry(POD.w + 0.03, 0.014, 0.075, 2, 0.006);
    lip.translate(0, POD.h / 2 + 0.004, -0.02);
    lip.rotateX(-0.05);
    pod.add(new THREE.Mesh(lip, body));
    const face = new THREE.Mesh(faceUV(new THREE.ShapeGeometry(podShape(-0.002), 24), POD.w, POD.h), faceMat(panel.texture));
    face.position.z = 0.0006;
    face.receiveShadow = true;
    pod.add(face);
  }
  // Instruments on the pod face.
  const at = (px, py, z = 0.002) => { const [x, y] = podXY(px, py); return new THREE.Vector3(x, y, z); };
  const needles = {};
  const addNeedle = (key, gk, lenK, baseK, mat, z = 0.0025, tail) => {
    const G = POD_G[gk], r = G.r * POD.s;
    const n = new THREE.Mesh(needleGeo(r * lenK, r * baseK, tail), mat);
    n.position.copy(at(G.x, G.y, z));
    pod.add(n);
    needles[key] = n;
  };
  addNeedle('vsi', 'vsi', 0.9, 0.075, needleW);
  addNeedle('asi', 'asi', 0.9, 0.075, needleW);
  addNeedle('map', 'map', 0.9, 0.075, needleW);
  addNeedle('eng', 'tach', 0.72, 0.08, needleW, 0.0028);
  addNeedle('rot', 'tach', 0.9, 0.07, needleY, 0.0032);
  addNeedle('altH', 'alt', 0.88, 0.07, needleW, 0.0034);
  addNeedle('altT', 'alt', 0.58, 0.11, needleW, 0.003);
  addNeedle('altTT', 'alt', 0.92, 0.025, needleW, 0.0026, 0.02);
  const hubs = [];
  for (const gk of ['vsi', 'asi', 'map', 'tach', 'alt']) {
    const G = POD_G[gk];
    const h = new THREE.Mesh(new THREE.CylinderGeometry(G.r * POD.s * 0.09, G.r * POD.s * 0.1, 0.004, 16).rotateX(Math.PI / 2), hubMat);
    h.position.copy(at(G.x, G.y, 0.0045));
    hubs.push(h);
  }
  pod.add(...hubs);
  // Attitude ball (pitch moves the tape, bank turns the disc) + overlay.
  const ATT = POD_G.att, rA = ATT.r * POD.s;
  panel.attTape.wrapS = panel.attTape.wrapT = THREE.ClampToEdgeWrapping;
  panel.attTape.repeat.set(1, 60 / 180);
  const ball = new THREE.Mesh(new THREE.CircleGeometry(rA * 0.97, 48), new THREE.MeshStandardMaterial({ map: panel.attTape, emissive: 0xffffff, emissiveMap: panel.attTape, emissiveIntensity: 0.35, roughness: 0.5 }));
  ball.position.copy(at(ATT.x, ATT.y, 0.0012));
  pod.add(ball);
  const attOver = new THREE.Mesh(new THREE.PlaneGeometry(rA * 2, rA * 2), new THREE.MeshStandardMaterial({ map: panel.attOverlay, transparent: true, emissive: 0xffffff, emissiveMap: panel.attOverlay, emissiveIntensity: 0.3, depthWrite: false }));
  attOver.position.copy(at(ATT.x, ATT.y, 0.0035));
  attOver.renderOrder = 3;
  pod.add(attOver);
  // Heading card + overlay.
  const DG = POD_G.dg, rD = DG.r * POD.s;
  const card = new THREE.Mesh(new THREE.CircleGeometry(rD * 0.97, 48), new THREE.MeshStandardMaterial({ map: panel.card, emissive: 0xffffff, emissiveMap: panel.card, emissiveIntensity: 0.3, roughness: 0.5 }));
  card.position.copy(at(DG.x, DG.y, 0.0012));
  pod.add(card);
  const dgOver = new THREE.Mesh(new THREE.PlaneGeometry(rD * 2, rD * 2), new THREE.MeshStandardMaterial({ map: panel.cardOverlay, transparent: true, emissive: 0xffffff, emissiveMap: panel.cardOverlay, emissiveIntensity: 0.3, depthWrite: false }));
  dgOver.position.copy(at(DG.x, DG.y, 0.0035));
  dgOver.renderOrder = 3;
  pod.add(dgOver);
  // Glass over every instrument.
  for (const G of Object.values(POD_G)) {
    const gl = new THREE.Mesh(new THREE.CircleGeometry(G.r * POD.s * 1.02, 40), glassMat);
    gl.position.copy(at(G.x, G.y, 0.0075));
    gl.renderOrder = 4;
    pod.add(gl);
  }
  // Lamps: domed lenses that light up.
  const lampGeo = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.5);
  const mkLamp = (l, parent, pos, rad) => {
    const [on, off] = LAMP_COL[l.col];
    const mat = new THREE.MeshStandardMaterial({ color: off, emissive: on, emissiveIntensity: 0, roughness: 0.25, metalness: 0 });
    const m = new THREE.Mesh(lampGeo, mat);
    m.scale.setScalar(rad);
    m.position.copy(pos);
    parent.add(m);
    return { key: l.key, mat, on, off, lit: null };
  };
  const lamps = POD_LAMPS.map((l) => mkLamp(l, pod, at(l.x, l.y, 0.001), 12 * POD.s));

  // ---------------- pedestal ----------------
  const con = new THREE.Group();
  {
    const b = new RoundedBoxGeometry(CON.w + 0.03, CON.h + 0.03, 0.2, 3, 0.012);
    b.translate(0, 0, -0.1);
    const m = new THREE.Mesh(b, body);
    m.castShadow = true; m.receiveShadow = true;
    con.add(m);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(CON.w, CON.h), faceMat(panel.texture2));
    face.position.z = 0.0006;
    face.receiveShadow = true;
    con.add(face);
  }
  const cat = (px, py, z = 0.002) => { const [x, y] = conXY(px, py); return new THREE.Vector3(x, y, z); };
  const conLamps = CON_LAMPS.map((l) => mkLamp(l, con, cat(l.x, l.y, 0.001), 10 * CON.s));
  const small = {};
  for (const [k, G] of Object.entries(CON_G)) {
    const n = new THREE.Mesh(needleGeo(G.r * CON.s * 0.88, G.r * CON.s * 0.1, 0.1), needleW);
    n.position.copy(cat(G.x, G.y, 0.0025));
    con.add(n);
    small[k] = { n, ang: ANG.small(G.v[0], G.v[1]) };
    const h = new THREE.Mesh(new THREE.CylinderGeometry(G.r * CON.s * 0.12, G.r * CON.s * 0.13, 0.003, 12).rotateX(Math.PI / 2), hubMat);
    h.position.copy(cat(G.x, G.y, 0.004));
    con.add(h);
  }
  // Guidance screen (live canvas).
  {
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(CON_GPS.w * CON.s, CON_GPS.h * CON.s), new THREE.MeshBasicMaterial({ map: panel.gpsTex }));
    scr.position.copy(cat(CON_GPS.x + CON_GPS.w / 2, CON_GPS.y + CON_GPS.h / 2, 0.0012));
    con.add(scr);
  }
  // Toggle levers (the ones tied to the aircraft's state move), knobs, key.
  const toggleMat = new THREE.MeshStandardMaterial({ color: 0xd9dcdf, roughness: 0.3, metalness: 0.8 });
  const toggles = {};
  const leverGeo = new THREE.CylinderGeometry(0.0022, 0.0032, 0.016, 8).translate(0, 0.008, 0).rotateX(Math.PI / 2);
  for (const [k, px] of [['nav', 60], ['strobe', 110], ['clutch', 186], ['alt', 262], ['batt', 318], ['pump', 374], ['valve', 430]]) {
    const piv = new THREE.Group();
    piv.position.copy(cat(px, 510, 0.002));
    const lev = new THREE.Mesh(leverGeo, toggleMat);
    piv.add(lev);
    con.add(piv);
    toggles[k] = piv;
  }
  {
    const parts = [];
    const knob = (px, py, r, h) => { const g = new THREE.CylinderGeometry(r, r * 1.05, h, 18).rotateX(Math.PI / 2); const p = cat(px, py, h / 2); g.translate(p.x, p.y, p.z); parts.push(g); };
    knob(66, 680, 0.009, 0.012); // panel lights
    knob(430, 590, 0.008, 0.02); // cabin air
    for (const y of [1078, 1174]) { knob(436, y, 0.0052, 0.01); knob(464, y, 0.0052, 0.01); }
    knob(80, 590, 0.0085, 0.006); // key barrel
    con.add(new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.45, metalness: 0.35 })));
  }
  group.add(pod, con);

  // ---------------- per-frame update ----------------
  const setLamp = (L, on) => {
    if (L.lit === on) return;
    L.lit = on;
    L.mat.emissiveIntensity = on ? 2.4 : 0;
    L.mat.color.setHex(on ? L.on : L.off);
  };
  const toggleTo = (k, on) => { toggles[k].rotation.x = on ? -0.45 : 0.45; };
  const update = (d) => {
    needles.vsi.rotation.z = -ANG.vsi(d.vsFpm);
    needles.asi.rotation.z = -ANG.asi(d.ias);
    needles.map.rotation.z = -ANG.map(d.map);
    needles.eng.rotation.z = -ANG.tach(d.enginePct);
    needles.rot.rotation.z = -ANG.tach(d.rotorPct);
    needles.altH.rotation.z = -ANG.altHund(d.altFt);
    needles.altT.rotation.z = -ANG.altThou(d.altFt);
    needles.altTT.rotation.z = -ANG.altTenThou(d.altFt);
    // Attitude: nose up shows more sky (the window moves up the tape),
    // a right bank turns the horizon counter-clockwise.
    const pitch = Math.max(-1, Math.min(1, d.pitch));
    panel.attTape.offset.y = 0.5 - panel.attTape.repeat.y / 2 + pitch / Math.PI;
    ball.rotation.z = d.bank;
    card.rotation.z = (d.hdg * Math.PI) / 180;
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
    };
    for (const L of lamps) setLamp(L, !!(L.key && st[L.key]));
    for (const L of conLamps) setLamp(L, !!(L.key && st[L.key]));
    toggleTo('nav', true); toggleTo('strobe', d.engine !== 'off');
    toggleTo('clutch', d.engine !== 'off' || d.rotorPct > 1); toggleTo('alt', d.engine === 'running');
    toggleTo('batt', true); toggleTo('pump', d.engine === 'running'); toggleTo('valve', !!d.spray);
  };
  return { group, pod, con, update };
}
