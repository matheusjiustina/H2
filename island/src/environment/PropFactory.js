import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, lerp } from '../utils/MathUtils.js';

// ------------------------------------------------------------------ geometry helpers

/** Box with world-scaled UVs (wood grain along local X) and a vertex tint. */
export function woodBox(w, h, d, { seed = 0, scale = 1.6, tint = null, uvOffset = null } = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  const r = rng(seed + 1);
  const ou = uvOffset ? uvOffset[0] : r() * 4, ov = uvOffset ? uvOffset[1] : r() * 4;
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0] / scale + ou, uv.getY(i) * dims[f][1] / scale * 4 + ov);
    }
  }
  const t = tint || (() => { const k = 0.82 + r() * 0.3; return [k * (0.97 + r() * 0.06), k, k * (0.92 + r() * 0.1)]; })();
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < col.length; i += 3) { col[i] = t[0]; col[i + 1] = t[1]; col[i + 2] = t[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Round log / post along Y with wood UVs (grain along the axis). */
export function woodCylinder(r0, r1, h, { seed = 0, radial = 10, tint = null } = {}) {
  const g = new THREE.CylinderGeometry(r1, r0, h, radial, 1);
  const r = rng(seed + 7);
  const uv = g.attributes.uv;
  const ou = r() * 4;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * h / 1.6 + ou, uv.getX(i) * 2 * Math.PI * r0 / 1.6 * 4);
  const t = tint || [0.85 + r() * 0.2, 0.85 + r() * 0.15, 0.82 + r() * 0.15];
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < col.length; i += 3) { col[i] = t[0]; col[i + 1] = t[1]; col[i + 2] = t[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function place(g, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
  m.setPosition(x, y, z);
  return g.applyMatrix4(m);
}

export function merge(list) {
  const clean = list.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) ng.deleteAttribute(k);
    if (!ng.attributes.color) {
      const col = new Float32Array(ng.attributes.position.count * 3).fill(1);
      ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    return ng;
  });
  const m = mergeGeometries(clean, false);
  m.computeBoundingSphere();
  return m;
}

/** Rope as a tube along a catenary between a and b. */
export function ropeGeometry(a, b, sag = 0.2, radius = 0.012, segs = 12) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    pts.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, segs * 2, radius, 5, false);
  const uv = g.attributes.uv;
  const len = a.distanceTo(b);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len * 20, uv.getY(i));
  return g;
}

function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// ------------------------------------------------------------------ props

export function buildTable(M, seed = 3) {
  const g = new THREE.Group();
  const parts = [];
  const W = 1.6, D = 0.82, H = 0.76;
  for (let i = 0; i < 5; i++) {
    const pw = D / 5 - 0.008;
    parts.push(place(woodBox(W, 0.035, pw, { seed: seed + i }), 0, H - 0.0175, -D / 2 + pw / 2 + i * (D / 5)));
  }
  for (const [x, z] of [[-W / 2 + 0.08, -D / 2 + 0.08], [W / 2 - 0.08, -D / 2 + 0.08], [-W / 2 + 0.08, D / 2 - 0.08], [W / 2 - 0.08, D / 2 - 0.08]]) {
    parts.push(place(woodBox(H - 0.035, 0.06, 0.06, { seed: seed + x * 10 + z }), x, (H - 0.035) / 2, z, 0, 0, Math.PI / 2));
  }
  parts.push(place(woodBox(W - 0.1, 0.08, 0.025, { seed: seed + 11 }), 0, H - 0.08, -D / 2 + 0.09));
  parts.push(place(woodBox(W - 0.1, 0.08, 0.025, { seed: seed + 12 }), 0, H - 0.08, D / 2 - 0.09));
  parts.push(place(woodBox(W - 0.2, 0.05, 0.03, { seed: seed + 13 }), 0, 0.18, 0));
  g.add(mesh(merge(parts), M.wood));
  g.userData.top = H;
  return g;
}

export function buildChair(M) {
  const g = new THREE.Group();
  const frame = [];
  const leg = (x, z, rot) => frame.push(place(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 6), x, 0.42, z, rot, 0, 0));
  leg(-0.24, 0, 0.5); leg(0.24, 0, 0.5); leg(-0.24, 0, -0.5); leg(0.24, 0, -0.5);
  frame.push(place(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), 0, 0.82, -0.22, 0, 0, Math.PI / 2));
  frame.push(place(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), 0, 0.42, 0.2, 0, 0, Math.PI / 2));
  g.add(mesh(merge(frame), M.metal));
  const seat = new THREE.PlaneGeometry(0.48, 0.42, 6, 6);
  const sp = seat.attributes.position;
  for (let i = 0; i < sp.count; i++) { const x = sp.getX(i), y = sp.getY(i); sp.setZ(i, -0.04 * (1 - (x * x) / 0.06) * (1 - (y * y) / 0.05)); }
  seat.computeVertexNormals();
  g.add(mesh(place(seat, 0, 0.44, 0, -Math.PI / 2), M.olive));
  const back = new THREE.PlaneGeometry(0.48, 0.32, 4, 4);
  g.add(mesh(place(back, 0, 0.68, -0.2, -0.25), M.olive));
  return g;
}

/** Crate with a lid hinged on its back edge. Returns { group, lid, pivot }. */
export function buildCrate(M, W = 0.92, H = 0.56, D = 0.56, seed = 5) {
  const g = new THREE.Group();
  const parts = [];
  const t = 0.022;
  // side planks
  for (let i = 0; i < 3; i++) {
    const ph = (H - 0.02) / 3 - 0.006;
    const y = 0.01 + ph / 2 + i * ((H - 0.02) / 3);
    parts.push(place(woodBox(W, ph, t, { seed: seed + i }), 0, y, D / 2 - t / 2));
    parts.push(place(woodBox(W, ph, t, { seed: seed + i + 10 }), 0, y, -D / 2 + t / 2));
    parts.push(place(woodBox(D - 2 * t, ph, t, { seed: seed + i + 20 }), W / 2 - t / 2, y, 0, 0, Math.PI / 2));
    parts.push(place(woodBox(D - 2 * t, ph, t, { seed: seed + i + 30 }), -W / 2 + t / 2, y, 0, 0, Math.PI / 2));
  }
  parts.push(place(woodBox(W, t, D, { seed: seed + 40 }), 0, t / 2, 0));
  // corner battens
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(place(woodBox(H, 0.045, 0.045, { seed: seed + sx + sz * 3 }), sx * (W / 2 + 0.005), H / 2, sz * (D / 2 - 0.03), 0, 0, Math.PI / 2));
  const body = mesh(merge(parts), M.wood);
  g.add(body);
  // lid: pivot at back top edge
  const pivot = new THREE.Group();
  pivot.position.set(0, H, -D / 2);
  const lidParts = [];
  for (let i = 0; i < 4; i++) {
    const pw = D / 4 - 0.006;
    lidParts.push(place(woodBox(W + 0.02, t, pw, { seed: seed + 50 + i }), 0, t / 2, pw / 2 + i * (D / 4)));
  }
  lidParts.push(place(woodBox(0.05, 0.03, D - 0.04, { seed: seed + 60 }), -W / 2 + 0.1, t + 0.015, D / 2));
  lidParts.push(place(woodBox(0.05, 0.03, D - 0.04, { seed: seed + 61 }), W / 2 - 0.1, t + 0.015, D / 2));
  const lid = mesh(merge(lidParts), M.wood);
  pivot.add(lid);
  // metal hinges + latch
  const hingeG = merge([place(new THREE.BoxGeometry(0.08, 0.004, 0.06), -W / 3, 0.024, 0.02), place(new THREE.BoxGeometry(0.08, 0.004, 0.06), W / 3, 0.024, 0.02)]);
  pivot.add(mesh(hingeG, M.metalBlack, { cast: false }));
  const latch = mesh(new THREE.BoxGeometry(0.06, 0.08, 0.01), M.metalBlack, { cast: false });
  latch.position.set(0, H - 0.03, D / 2 + 0.005);
  g.add(latch);
  // stencil-ish label band
  g.add(pivot);
  return { group: g, pivot, lid };
}

export function buildLantern(M) {
  const g = new THREE.Group();
  const frame = [];
  frame.push(place(new THREE.CylinderGeometry(0.075, 0.085, 0.05, 16), 0, 0.025, 0)); // tank
  frame.push(place(new THREE.CylinderGeometry(0.06, 0.075, 0.03, 16), 0, 0.06, 0));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    frame.push(place(new THREE.CylinderGeometry(0.005, 0.005, 0.17, 5), Math.cos(a) * 0.058, 0.15, Math.sin(a) * 0.058));
  }
  frame.push(place(new THREE.CylinderGeometry(0.045, 0.065, 0.035, 16), 0, 0.245, 0)); // top cap
  frame.push(place(new THREE.ConeGeometry(0.035, 0.04, 12), 0, 0.28, 0));
  const handle = new THREE.TorusGeometry(0.07, 0.004, 5, 18, Math.PI);
  frame.push(place(handle, 0, 0.27, 0));
  const body = mesh(merge(frame), M.metalRed);
  g.add(body);
  const globe = mesh(new THREE.SphereGeometry(0.055, 16, 12), M.glass, { cast: false });
  globe.scale.set(1, 1.35, 1);
  globe.position.y = 0.15;
  g.add(globe);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.045, 8), M.flame.clone());
  flame.position.y = 0.145;
  flame.visible = false;
  g.add(flame);
  return { group: g, flame, globe };
}

export function buildRadio(M) {
  const g = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(0.3, 0.17, 0.11), M.metalOlive);
  body.position.y = 0.085;
  g.add(body);
  const grille = new THREE.Mesh(new THREE.CircleGeometry(0.055, 20), M.metalBlack);
  grille.position.set(-0.07, 0.09, 0.0555);
  g.add(grille);
  const dial = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.035), M.ceramic);
  dial.position.set(0.075, 0.115, 0.0556);
  g.add(dial);
  const knobs = merge([place(new THREE.CylinderGeometry(0.012, 0.012, 0.015, 10), 0.05, 0.05, 0.06, Math.PI / 2), place(new THREE.CylinderGeometry(0.012, 0.012, 0.015, 10), 0.1, 0.05, 0.06, Math.PI / 2)]);
  g.add(mesh(knobs, M.plastic, { cast: false }));
  const antenna = mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.42, 5), M.metal, { cast: false });
  antenna.position.set(0.13, 0.36, -0.03);
  antenna.rotation.z = -0.35;
  g.add(antenna);
  const handle = mesh(new THREE.TorusGeometry(0.09, 0.008, 6, 16, Math.PI), M.leather, { cast: false });
  handle.position.y = 0.17;
  g.add(handle);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.05, 0.02) }));
  led.position.set(0.12, 0.14, 0.056);
  g.add(led);
  return { group: g, led, needle: dial };
}

export function buildCompass(M) {
  const g = new THREE.Group();
  const body = mesh(new THREE.CylinderGeometry(0.035, 0.037, 0.016, 24), M.brass);
  body.position.y = 0.008;
  g.add(body);
  const faceCanvas = document.createElement('canvas');
  faceCanvas.width = faceCanvas.height = 128;
  const c = faceCanvas.getContext('2d');
  c.fillStyle = '#efe6cf'; c.beginPath(); c.arc(64, 64, 62, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#3a3226'; c.lineWidth = 2;
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const l = i % 9 === 0 ? 12 : 6;
    c.beginPath(); c.moveTo(64 + Math.sin(a) * 58, 64 - Math.cos(a) * 58); c.lineTo(64 + Math.sin(a) * (58 - l), 64 - Math.cos(a) * (58 - l)); c.stroke();
  }
  c.fillStyle = '#3a3226'; c.font = 'bold 16px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('N', 64, 22); c.fillText('S', 64, 106); c.fillText('E', 106, 64); c.fillText('W', 22, 64);
  const tex = new THREE.CanvasTexture(faceCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.031, 24), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  face.rotation.x = -Math.PI / 2;
  face.position.y = 0.0165;
  g.add(face);
  const needle = new THREE.Group();
  const nGeo = new THREE.BufferGeometry();
  nGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.026, 0.004, 0, 0, -0.004, 0, 0, 0, 0, 0.026, -0.004, 0, 0, 0.004, 0, 0], 3));
  nGeo.setAttribute('color', new THREE.Float32BufferAttribute([0.8, 0.1, 0.05, 0.8, 0.1, 0.05, 0.8, 0.1, 0.05, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9], 3));
  nGeo.computeVertexNormals();
  const nm = new THREE.Mesh(nGeo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.4 }));
  needle.add(nm);
  needle.position.y = 0.019;
  g.add(needle);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.033, 24), M.glass);
  glass.rotation.x = -Math.PI / 2;
  glass.position.y = 0.021;
  g.add(glass);
  const lid = mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.006, 24), M.brass, { cast: false });
  lid.position.set(0, 0.03, -0.068);
  lid.rotation.x = -1.25;
  g.add(lid);
  return { group: g, needle };
}

export function buildCamera(M) {
  const g = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(0.14, 0.085, 0.06), M.metalBlack);
  body.position.y = 0.0425;
  g.add(body);
  const top = mesh(new THREE.BoxGeometry(0.06, 0.02, 0.045), M.metalBlack);
  top.position.set(-0.01, 0.095, 0);
  g.add(top);
  const lens = mesh(new THREE.CylinderGeometry(0.03, 0.033, 0.06, 20), M.plastic);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0.0, 0.045, 0.055);
  g.add(lens);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.024, 20), new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.05, metalness: 0.6 }));
  glass.position.set(0, 0.045, 0.0855);
  g.add(glass);
  const strap = mesh(new THREE.TorusGeometry(0.07, 0.006, 4, 14, Math.PI), M.leather, { cast: false });
  strap.position.set(0, 0.09, -0.01);
  g.add(strap);
  const flash = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.004), M.ceramic);
  flash.position.set(0.045, 0.075, 0.031);
  g.add(flash);
  return { group: g };
}

export function buildFlashlight(M) {
  const g = new THREE.Group();
  const body = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.17, 14), M.metalBlack);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const head = mesh(new THREE.CylinderGeometry(0.028, 0.019, 0.05, 16), M.metalBlack);
  head.rotation.x = Math.PI / 2;
  head.position.z = 0.105;
  g.add(head);
  const lensMat = M.bulb.clone();
  lensMat.color.setRGB(0.25, 0.25, 0.22);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.025, 16), lensMat);
  lens.position.z = 0.131;
  g.add(lens);
  g.position.y = 0.028;
  const wrap = new THREE.Group();
  wrap.add(g);
  return { group: wrap, lens, lensMat };
}

export function buildMug(M) {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(0.042 + t * 0.002, t * 0.095)); }
  pts.push(new THREE.Vector2(0.038, 0.095));
  for (let i = 8; i >= 0; i--) { const t = i / 8; pts.push(new THREE.Vector2(0.036, 0.008 + t * 0.085)); }
  const cup = mesh(new THREE.LatheGeometry(pts, 20), M.enamel);
  g.add(cup);
  const bottom = mesh(new THREE.CircleGeometry(0.042, 20), M.enamel, { cast: false });
  bottom.rotation.x = Math.PI / 2;
  g.add(bottom);
  const handle = mesh(new THREE.TorusGeometry(0.024, 0.006, 6, 12, Math.PI * 1.2), M.enamel, { cast: false });
  handle.rotation.z = -Math.PI * 0.6;
  handle.position.set(0.05, 0.05, 0);
  g.add(handle);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), new THREE.MeshStandardMaterial({ color: 0x24140a, roughness: 0.1 }));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.07;
  g.add(coffee);
  return { group: g, coffee };
}

export function buildNotebook(M) {
  const g = new THREE.Group();
  const cover = mesh(new THREE.BoxGeometry(0.15, 0.022, 0.21), M.leather);
  cover.position.y = 0.011;
  g.add(cover);
  const pages = mesh(new THREE.BoxGeometry(0.142, 0.018, 0.202), M.paper, { cast: false });
  pages.position.set(0.003, 0.011, 0);
  g.add(pages);
  const band = mesh(new THREE.BoxGeometry(0.006, 0.024, 0.212), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 }), { cast: false });
  band.position.set(0.05, 0.011, 0);
  g.add(band);
  return { group: g };
}

export function buildMapSheet(texture) {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(0.62, 0.46, 12, 8);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, Math.abs(Math.sin(x * 15)) * 0.004 + (Math.abs(x) > 0.27 ? (Math.abs(x) - 0.27) * 0.25 : 0) + Math.sin(y * 9) * 0.002);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.92, side: THREE.DoubleSide });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.003;
  m.receiveShadow = true;
  g.add(m);
  return { group: g, sheet: m };
}

export function buildBackpack(M) {
  const g = new THREE.Group();
  const body = new THREE.SphereGeometry(0.2, 16, 12);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    x *= 1.05; y = y * 1.55 + 0.03; z *= 0.75;
    if (z < -0.08) z = -0.08 - (z + 0.08) * 0.2;
    x += Math.sin(y * 30) * 0.004;
    p.setXYZ(i, x, y, z);
  }
  body.computeVertexNormals();
  const m = mesh(body, M.olive);
  m.position.y = 0.3;
  g.add(m);
  const pocket = mesh(new THREE.SphereGeometry(0.12, 12, 8), M.olive);
  pocket.scale.set(1.2, 0.9, 0.55);
  pocket.position.set(0, 0.2, 0.13);
  g.add(pocket);
  const flap = mesh(new THREE.SphereGeometry(0.19, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), M.olive);
  flap.scale.set(1.08, 0.5, 0.8);
  flap.position.y = 0.56;
  g.add(flap);
  const straps = merge([
    place(new THREE.BoxGeometry(0.04, 0.5, 0.012), -0.09, 0.32, -0.16, 0.1),
    place(new THREE.BoxGeometry(0.04, 0.5, 0.012), 0.09, 0.32, -0.16, 0.1),
    place(new THREE.BoxGeometry(0.03, 0.28, 0.01), 0.0, 0.42, 0.2, -0.3),
  ]);
  g.add(mesh(straps, M.leather, { cast: false }));
  const roll = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.38, 12), M.blueTarp);
  roll.rotation.z = Math.PI / 2;
  roll.position.set(0, 0.66, -0.02);
  g.add(roll);
  return { group: g };
}

export function buildBinoculars(M) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    const tube = mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.12, 14), M.metalBlack);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(sx * 0.034, 0.026, 0);
    g.add(tube);
  }
  const bridge = mesh(new THREE.BoxGeometry(0.05, 0.015, 0.05), M.metalBlack);
  bridge.position.y = 0.03;
  g.add(bridge);
  return { group: g };
}

export function buildBarrel(M, lying = false) {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(0.29, 0.29, 0.88, 22, 6, false);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const ring = Math.abs(Math.abs(y) - 0.15) < 0.03 || Math.abs(Math.abs(y) - 0.44) < 0.01 ? 1.025 : 1;
    p.setX(i, p.getX(i) * ring);
    p.setZ(i, p.getZ(i) * ring);
  }
  geo.computeVertexNormals();
  const m = mesh(geo, M.metalDrum);
  m.position.y = 0.44;
  if (lying) { m.rotation.z = Math.PI / 2; m.position.y = 0.29; }
  g.add(m);
  return g;
}

export function buildJerryCan(M) {
  const g = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(0.17, 0.46, 0.34), M.metalRed);
  body.position.y = 0.23;
  g.add(body);
  const handle = mesh(new THREE.BoxGeometry(0.03, 0.06, 0.2), M.metalRed);
  handle.position.set(0, 0.49, -0.03);
  g.add(handle);
  const spout = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 8), M.metalBlack);
  spout.position.set(0, 0.48, 0.12);
  g.add(spout);
  return g;
}

export function buildRopeCoil(M, R = 0.2, turns = 7) {
  const pts = [];
  for (let i = 0; i <= turns * 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const t = i / (turns * 24);
    const rr = R * (0.6 + 0.4 * ((i / 24) % 1.0 === 0 ? 1 : 1)) - Math.floor(i / 24) * 0.012;
    pts.push(new THREE.Vector3(Math.cos(a) * rr, 0.015 + t * 0.06 + Math.sin(a * 3) * 0.004, Math.sin(a) * rr));
  }
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 40, 0.014, 5, false);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 60, uv.getY(i));
  const g = new THREE.Group();
  g.add(mesh(geo, M.rope));
  return g;
}

export function buildCot(M) {
  const g = new THREE.Group();
  const frame = [];
  for (const sz of [-1, 1]) frame.push(place(new THREE.CylinderGeometry(0.016, 0.016, 1.9, 8), 0, 0.42, sz * 0.33, 0, 0, Math.PI / 2));
  for (const sx of [-0.85, 0, 0.85]) {
    frame.push(place(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 6), sx, 0.22, 0.17, 0.6));
    frame.push(place(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 6), sx, 0.22, -0.17, -0.6));
  }
  g.add(mesh(merge(frame), M.metalOlive));
  const bed = new THREE.PlaneGeometry(1.9, 0.68, 12, 4);
  const p = bed.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, -0.03 * (1 - (y * y) / 0.12) * (1 - (x * x) / 0.95)); }
  bed.computeVertexNormals();
  g.add(mesh(place(bed, 0, 0.43, 0, -Math.PI / 2), M.canvasStatic));
  // folded blanket + pillow
  const blanket = mesh(new THREE.BoxGeometry(0.6, 0.07, 0.6), M.cloth);
  blanket.position.set(0.55, 0.47, 0);
  blanket.rotation.y = 0.08;
  g.add(blanket);
  const pillow = mesh(new THREE.SphereGeometry(0.15, 12, 8), M.canvasStatic);
  pillow.scale.set(1.2, 0.4, 1.5);
  pillow.position.set(-0.75, 0.47, 0);
  g.add(pillow);
  return g;
}

export function buildFirePit(M, seed = 9) {
  const g = new THREE.Group();
  const r = rng(seed);
  const stones = [];
  const ico = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    const s = ico.clone();
    const p = s.attributes.position;
    for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * (1 + (r() - 0.5) * 0.3), p.getY(k) * (1 + (r() - 0.5) * 0.3), p.getZ(k));
    s.scale(0.16 + r() * 0.05, 0.11 + r() * 0.04, 0.14 + r() * 0.04);
    s.computeVertexNormals();
    place(s, Math.cos(a) * 0.62, 0.05, Math.sin(a) * 0.62, 0, r() * 6, 0);
    const col = new Float32Array(s.attributes.position.count * 3);
    const k = 0.5 + r() * 0.3;
    for (let q = 0; q < col.length; q += 3) { col[q] = k; col[q + 1] = k * 0.97; col[q + 2] = k * 0.95; }
    s.setAttribute('color', new THREE.BufferAttribute(col, 3));
    stones.push(s);
  }
  g.add(mesh(merge(stones), M.stone));
  const logs = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r();
    logs.push(place(woodCylinder(0.05, 0.04, 0.7, { seed: i, radial: 7 }), Math.cos(a) * 0.12, 0.12, Math.sin(a) * 0.12, Math.PI / 2 - 0.5, a, 0));
  }
  g.add(mesh(merge(logs), M.woodCharred));
  const embers = new THREE.Mesh(new THREE.CircleGeometry(0.32, 16), M.ember);
  embers.rotation.x = -Math.PI / 2;
  embers.position.y = 0.02;
  g.add(embers);
  return { group: g, embers };
}

export function buildSign(M, text, seed = 21) {
  const g = new THREE.Group();
  const post = mesh(woodCylinder(0.05, 0.045, 1.5, { seed, radial: 7 }), M.woodDark);
  post.position.y = 0.75;
  g.add(post);
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#9a7d5c'; ctx.fillRect(0, 0, 512, 160);
  for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(60,40,25,${0.05 + Math.random() * 0.08})`; ctx.fillRect(0, Math.random() * 160, 512, 1 + Math.random() * 2); }
  ctx.fillStyle = 'rgba(245,238,220,0.92)';
  ctx.font = 'bold 44px Georgia';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lines = text.split('\n');
  lines.forEach((l, i) => ctx.fillText(l, 256, 80 + (i - (lines.length - 1) / 2) * 52));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const boardMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.03), [M.woodDark, M.woodDark, M.woodDark, M.woodDark, boardMat, M.woodDark]);
  board.position.set(0, 1.32, 0.05);
  board.rotation.z = 0.04;
  board.castShadow = true;
  board.receiveShadow = true;
  g.add(board);
  return g;
}
