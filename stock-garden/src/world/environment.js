import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { materials, glowSprite } from './materials.js';
import { tickerBoardTexture, panelScreenTexture, glowTexture } from './textures.js';
import { STOCKS } from '../config/stocks.js';
import { bakeStatic } from './bake.js';

/**
 * The diorama: a floating slab with a small futuristic greenhouse farm on it.
 * Everything here is pure ambience — nothing is interactive.
 */
export function createEnvironment() {
  const M = materials();
  const root = new THREE.Group();
  const updaters = [];

  const W = 10.9;
  const D = 7.7;

  /* ---------------------------------------------------------- platform */
  const slab = new THREE.Mesh(new RoundedBoxGeometry(W, 0.8, D, 4, 0.16), M.slab);
  slab.position.y = -0.4;
  slab.receiveShadow = true;
  root.add(slab);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.34, D - 0.34), M.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.002;
  floor.receiveShadow = true;
  root.add(floor);

  // LED trim running around the slab
  const trimMat = new THREE.MeshBasicMaterial({ color: '#3fb7a0' });
  const trimF = new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, 0.025, 0.02), trimMat);
  trimF.position.set(0, -0.12, D / 2 + 0.002);
  root.add(trimF);
  const trimR = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.025, D - 0.5), trimMat);
  trimR.position.set(W / 2 + 0.002, -0.12, 0);
  root.add(trimR);
  const trimL = trimR.clone();
  trimL.position.x = -W / 2 - 0.002;
  root.add(trimL);

  // Soft ambient pool of light under the floating slab.
  const under = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 2.2, D * 2.2),
    new THREE.MeshBasicMaterial({
      map: glowTexture(),
      color: '#1d6f7a',
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  under.rotation.x = -Math.PI / 2;
  under.position.y = -1.6;
  root.add(under);

  /* ------------------------------------------------------------ pipes */
  const pipeR = 0.045;
  const pipePath = [
    new THREE.Vector3(-4.35, 0.32, -2.95),
    new THREE.Vector3(-4.35, 0.07, -2.45),
    new THREE.Vector3(3.5, 0.07, -2.45),
  ];
  const pipePath2 = [
    new THREE.Vector3(-3.55, 0.07, -2.45),
    new THREE.Vector3(-3.55, 0.07, 0),
    new THREE.Vector3(3.35, 0.07, 0),
    new THREE.Vector3(3.6, 0.07, 0.35),
    new THREE.Vector3(3.6, 0.07, 1.15),
    new THREE.Vector3(3.85, 0.07, 1.4),
  ];
  const makePipe = (pts) => {
    const curve = new THREE.CurvePath();
    for (let i = 0; i < pts.length - 1; i++) curve.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 24, pipeR, 8, false), M.pipe);
    tube.castShadow = true;
    tube.receiveShadow = true;
    root.add(tube);
    // clamps
    const len = curve.getLength();
    for (let d = 0.6; d < len; d += 1.4) {
      const p = curve.getPointAt(d / len);
      const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.14), M.darkMetal);
      clamp.position.set(p.x, 0.025, p.z);
      root.add(clamp);
    }
    return curve;
  };
  const curves = [makePipe(pipePath), makePipe(pipePath2)];
  // Short feeder stubs from the pipes into each bed.
  for (const x of [-2.2, 0, 2.2]) {
    for (const [z0, z1] of [
      [-2.45, -2.0],
      [0, -0.28],
      [0, 0.28],
    ]) {
      const len = Math.abs(z1 - z0);
      const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, len, 6), M.pipe);
      stub.rotation.x = Math.PI / 2;
      stub.position.set(x + 0.45, 0.07, (z0 + z1) / 2);
      root.add(stub);
    }
  }
  // Glowing flow pulses travelling through the pipes (irrigation).
  const flowMat = new THREE.MeshBasicMaterial({ color: '#8cf0ff', transparent: true, opacity: 0.9 });
  const flowGeo = new THREE.SphereGeometry(0.03, 8, 6);
  const flows = [];
  curves.forEach((curve, ci) => {
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(flowGeo, flowMat);
      m.userData = { dynamic: true, pts: curve.getSpacedPoints(240), off: i / 4 + ci * 0.1, speed: 0.07 + ci * 0.02 };
      const g = glowSprite('#7fe7ff', 0.28, 0.6);
      m.add(g);
      root.add(m);
      flows.push(m);
    }
  });
  updaters.push((dt, t) => {
    for (const f of flows) {
      const { pts } = f.userData;
      const u = (t * f.userData.speed + f.userData.off) % 1;
      f.position.copy(pts[Math.floor(u * (pts.length - 1))]);
      f.position.y += pipeR + 0.012;
    }
  });

  /* -------------------------------------------- irrigation panel + tank */
  const cab = new THREE.Group();
  cab.position.set(-4.35, 0, -3.3);
  root.add(cab);
  const cabBody = new THREE.Mesh(new RoundedBoxGeometry(1.0, 1.15, 0.5, 3, 0.05), M.darkMetal);
  cabBody.position.y = 0.575;
  cabBody.castShadow = true;
  cabBody.receiveShadow = true;
  cab.add(cabBody);
  const screenTex = panelScreenTexture();
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.42), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.set(0, 0.72, 0.252);
  cab.add(screen);
  const ledGeo = new THREE.SphereGeometry(0.022, 8, 6);
  const cabLeds = [M.led, M.ledWarm, M.ledRed].map((mat, i) => {
    const l = new THREE.Mesh(ledGeo, mat.clone());
    l.userData.dynamic = true;
    l.position.set(-0.22 + i * 0.11, 0.35, 0.255);
    cab.add(l);
    return l;
  });
  const valve = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 6, 20), M.copper);
  valve.position.set(0.3, 0.33, 0.27);
  cab.add(valve);
  updaters.push((dt, t) => {
    screenTex.offset.x = (t * 0.05) % 1;
    cabLeds.forEach((l, i) => (l.visible = Math.sin(t * (1.3 + i * 0.7) + i) > -0.3));
  });

  const tank = new THREE.Group();
  tank.position.set(-3.3, 0, -3.35);
  root.add(tank);
  const tankGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 28, 1, true), M.glass);
  tankGlass.position.y = 0.55;
  tank.add(tankGlass);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.62, 28),
    new THREE.MeshStandardMaterial({ color: '#2aa7c9', emissive: '#0e5a70', emissiveIntensity: 0.6, transparent: true, opacity: 0.7, roughness: 0.1 }),
  );
  water.position.y = 0.41;
  water.userData.dynamic = true;
  tank.add(water);
  for (const y of [0.1, 1.0]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 28), M.metal);
    cap.position.y = y;
    cap.castShadow = true;
    tank.add(cap);
  }
  // rising bubbles
  const bubbleGeo = new THREE.SphereGeometry(0.018, 6, 4);
  const bubbleMat = new THREE.MeshBasicMaterial({ color: '#bff6ff', transparent: true, opacity: 0.6 });
  const bubbles = Array.from({ length: 5 }, (_, i) => {
    const b = new THREE.Mesh(bubbleGeo, bubbleMat);
    b.userData = { dynamic: true, off: i / 5, x: (Math.random() - 0.5) * 0.3, z: (Math.random() - 0.5) * 0.3 };
    tank.add(b);
    return b;
  });
  updaters.push((dt, t) => {
    bubbles.forEach((b) => {
      const u = (t * 0.25 + b.userData.off) % 1;
      b.position.set(b.userData.x + Math.sin(t * 3 + b.userData.off * 9) * 0.02, 0.15 + u * 0.55, b.userData.z);
    });
    water.scale.y = 1 + Math.sin(t * 0.8) * 0.01;
  });

  /* ---------------------------------------------------- ticker board */
  const board = new THREE.Group();
  board.position.set(0.6, 0, -3.55);
  root.add(board);
  for (const x of [-1.75, 1.75]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.55, 8), M.metal);
    post.position.set(x, 0.78, 0);
    post.castShadow = true;
    board.add(post);
  }
  const frame = new THREE.Mesh(new RoundedBoxGeometry(3.7, 0.5, 0.1, 2, 0.04), M.darkMetal);
  frame.position.y = 1.34;
  frame.castShadow = true;
  board.add(frame);
  const tickTex = tickerBoardTexture(STOCKS);
  tickTex.repeat.set(0.62, 1);
  const tick = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 0.34), new THREE.MeshBasicMaterial({ map: tickTex, toneMapped: false, color: '#b9c4cf' }));
  tick.position.set(0, 1.34, 0.052);
  board.add(tick);
  updaters.push((dt) => {
    tickTex.offset.x = (tickTex.offset.x + dt * 0.035) % 1;
  });

  /* ------------------------------------------- greenhouse frame + lights */
  const frameMat = M.metal;
  const beamY = 2.75;
  for (const x of [-3.45, 3.45]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, beamY, 0.08), frameMat);
    post.position.set(x, beamY / 2, -2.75);
    post.castShadow = true;
    root.add(post);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.22), M.darkMetal);
    foot.position.set(x, 0.025, -2.75);
    root.add(foot);
  }
  const cross = new THREE.Mesh(new THREE.BoxGeometry(6.98, 0.08, 0.08), frameMat);
  cross.position.set(0, beamY, -2.75);
  cross.castShadow = true;
  root.add(cross);
  // Grow-light fixtures on short arms leaning toward the beds.
  for (const x of [-2.2, 0, 2.2]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.8), frameMat);
    arm.position.set(x, beamY - 0.02, -2.4);
    root.add(arm);
    const lamp = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.06, 0.2, 2, 0.02), M.darkMetal);
    lamp.position.set(x, beamY - 0.08, -2.0);
    lamp.rotation.x = 0.35;
    lamp.castShadow = true;
    root.add(lamp);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.12), new THREE.MeshBasicMaterial({ color: '#ffe6c4' }));
    panel.rotation.x = Math.PI / 2 + 0.35;
    panel.position.set(x, beamY - 0.115, -1.99);
    root.add(panel);
    const lg = glowSprite('#ffd9a8', 1.0, 0.18);
    lg.position.set(x, beamY - 0.2, -1.95);
    root.add(lg);
  }

  /* ----------------------------------------------------- seed crates */
  const crates = new THREE.Group();
  crates.position.set(-4.45, 0, 1.55);
  crates.rotation.y = 0.25;
  root.add(crates);
  const crateGeo = new RoundedBoxGeometry(0.72, 0.36, 0.52, 2, 0.04);
  const crateMat = new THREE.MeshStandardMaterial({ color: '#343b45', metalness: 0.6, roughness: 0.4 });
  [
    [0, 0.18, 0, 0],
    [0.08, 0.54, 0.02, -0.12],
    [0.1, 0.18, 0.62, 0.1],
  ].forEach(([x, y, z, r]) => {
    const c = new THREE.Mesh(crateGeo, crateMat);
    c.position.set(x, y, z);
    c.rotation.y = r;
    c.castShadow = true;
    c.receiveShadow = true;
    crates.add(c);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.018, 0.01), M.ledDim);
    stripe.position.set(0, 0, 0.262);
    c.add(stripe);
  });
  // Seed capsules peeking out of the top crate, one per stock colour.
  const capGeo = new THREE.CapsuleGeometry(0.045, 0.07, 4, 10);
  STOCKS.forEach((s, i) => {
    const cap = new THREE.Mesh(capGeo, new THREE.MeshStandardMaterial({ color: s.color, metalness: 0.6, roughness: 0.3, emissive: s.color, emissiveIntensity: 0.15 }));
    cap.position.set(-0.2 + (i % 3) * 0.2 + 0.08, 0.77, -0.08 + Math.floor(i / 3) * 0.16);
    cap.rotation.set(0.3 * (i % 2 ? 1 : -1), 0, 0.2 * (i - 2.5));
    cap.castShadow = true;
    crates.add(cap);
  });

  // Futuristic hoe leaning on the crates.
  const tool = new THREE.Group();
  tool.position.set(-3.85, 0, 2.35);
  tool.rotation.set(0.0, 0.6, -0.35);
  root.add(tool);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.2, 6), M.metal);
  handle.position.y = 0.6;
  handle.castShadow = true;
  tool.add(handle);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.2, 8), M.darkMetal);
  grip.position.y = 1.05;
  tool.add(grip);
  const head = new THREE.Mesh(new RoundedBoxGeometry(0.28, 0.05, 0.1, 2, 0.015), M.darkMetal);
  head.position.y = 0.04;
  head.castShadow = true;
  tool.add(head);
  const toolLed = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.012, 0.012), M.led);
  toolLed.position.set(0, 0.04, 0.052);
  tool.add(toolLed);

  /* ------------------------------------------------------ vent unit */
  const vent = new THREE.Group();
  vent.position.set(4.55, 0, -3.35);
  vent.rotation.y = -0.4;
  root.add(vent);
  const ventBody = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.9, 0.55, 3, 0.06), M.darkMetal);
  ventBody.position.y = 0.45;
  ventBody.castShadow = true;
  vent.add(ventBody);
  const grill = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 32), M.metal);
  grill.position.set(0, 0.47, 0.28);
  vent.add(grill);
  const fan = new THREE.Group();
  fan.position.set(0, 0.47, 0.27);
  fan.userData.dynamic = true;
  vent.add(fan);
  for (let i = 0; i < 5; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.01), M.pipe);
    blade.position.y = 0.13;
    const piv = new THREE.Group();
    piv.rotation.z = (i / 5) * Math.PI * 2;
    blade.rotation.y = 0.4;
    piv.add(blade);
    fan.add(piv);
  }
  updaters.push((dt) => (fan.rotation.z -= dt * 2.4));

  /* --------------------------------------------------- drone + pad */
  const pad = new THREE.Group();
  pad.position.set(4.35, 0, -1.45);
  root.add(pad);
  const padDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.52, 0.05, 32), M.darkMetal);
  padDisc.position.y = 0.025;
  padDisc.receiveShadow = true;
  pad.add(padDisc);
  const padRing = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.01, 6, 48), M.ledWarm);
  padRing.rotation.x = Math.PI / 2;
  padRing.position.y = 0.055;
  pad.add(padRing);
  const drone = new THREE.Group();
  drone.position.y = 0.12;
  drone.rotation.y = 0.5;
  pad.add(drone);
  const dBody = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.1, 0.24, 2, 0.04), new THREE.MeshStandardMaterial({ color: '#dfe4ea', metalness: 0.5, roughness: 0.3 }));
  dBody.castShadow = true;
  drone.add(dBody);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), M.led);
  eye.userData.dynamic = true;
  eye.position.set(0.17, 0, 0);
  drone.add(eye);
  const rotorGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.01, 18);
  const rotorMat = new THREE.MeshStandardMaterial({ color: '#1b1f25', transparent: true, opacity: 0.75, metalness: 0.4 });
  const droneLed = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), M.ledRed.clone());
  droneLed.position.set(-0.17, 0.03, 0);
  droneLed.userData.dynamic = true;
  drone.add(droneLed);
  for (const [x, z] of [
    [0.2, 0.18],
    [0.2, -0.18],
    [-0.2, 0.18],
    [-0.2, -0.18],
  ]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(x, z) * 1.1, 0.02, 0.03), M.darkMetal);
    arm.position.set(x / 2, 0, z / 2);
    arm.rotation.y = -Math.atan2(z, x);
    drone.add(arm);
    const rotor = new THREE.Mesh(rotorGeo, rotorMat);
    rotor.position.set(x, 0.03, z);
    rotor.castShadow = true;
    drone.add(rotor);
  }
  updaters.push((dt, t) => {
    droneLed.visible = t % 1.6 < 0.12;
    eye.scale.setScalar(0.85 + 0.15 * Math.sin(t * 2));
  });

  /* ------------------------------------------- decorative plants */
  const bush = (x, z, s = 1, mat = M.foliage) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.17 * s, 0.26 * s, 16), M.darkMetal);
    pot.position.y = 0.13 * s;
    pot.castShadow = true;
    g.add(pot);
    const leaves = [
      [0, 0.42, 0, 0.24],
      [0.12, 0.34, 0.06, 0.17],
      [-0.1, 0.36, -0.05, 0.18],
    ];
    leaves.forEach(([lx, ly, lz, r], i) => {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 0), i ? M.foliage2 : mat);
      b.position.set(lx * s, ly * s, lz * s);
      b.rotation.set(i, i * 2, 0);
      b.castShadow = true;
      g.add(b);
    });
    root.add(g);
  };
  bush(-5.05, -1.4, 1.1);
  bush(-4.95, 3.15, 0.9);
  bush(4.95, 3.2, 1.0);
  bush(2.55, -3.45, 0.8);
  // Tiny grass tufts
  const tuftGeo = new THREE.ConeGeometry(0.03, 0.2, 4);
  [
    [-4.9, 0.2],
    [-4.75, 0.4],
    [4.9, 0.5],
    [-1.1, 3.4],
    [1.2, 3.45],
    [3.05, 3.35],
  ].forEach(([x, z]) => {
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(tuftGeo, M.foliage2);
      t.position.set(x + (Math.random() - 0.5) * 0.18, 0.1, z + (Math.random() - 0.5) * 0.18);
      t.rotation.set((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5);
      root.add(t);
    }
  });

  /* --------------------------------------------------- floor lights */
  const dotGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.012, 10);
  const dotMat = new THREE.MeshBasicMaterial({ color: '#ffc27a' });
  const dots = [];
  for (let i = 0; i < 9; i++) dots.push([-4.0 + i * 1.0, 3.25]);
  for (let i = 0; i < 5; i++) dots.push([-4.8, -2.2 + i * 1.0]);
  dots.forEach(([x, z]) => {
    const d = new THREE.Mesh(dotGeo, dotMat);
    d.position.set(x, 0.008, z);
    root.add(d);
  });
  const warm = new THREE.Color('#ffc27a');
  updaters.push((dt, t) => dotMat.color.copy(warm).multiplyScalar(0.7 + 0.3 * Math.sin(t * 0.9)));

  // Small props don't need to cast shadows.
  root.traverse((o) => {
    if (o.isMesh && o.geometry.boundingSphere == null) o.geometry.computeBoundingSphere();
    if (o.isMesh && o.geometry.boundingSphere.radius < 0.09) o.castShadow = false;
  });
  bakeStatic(root);

  return {
    group: root,
    update(dt, t) {
      for (const fn of updaters) fn(dt, t);
    },
  };
}
