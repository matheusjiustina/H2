// Farm activity: a tractor with a disc harrow working the fallow field T-08,
// lane by lane with headland U-turns, raising dust. Its pose is an analytic
// function of time (deterministic, nothing accumulates), so updates can be
// throttled with distance: every frame when near, a few times a second at
// mid range, not at all (hidden) beyond 2 km.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { tractor, discHarrow, wheelGeometry, wheelSet } from './vehicles.js';
import { FIELDS } from './layout.js';

class Collector {
  constructor() { this.parts = new Map(); }
  addRaw(g, mat) {
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
  }
  build(group, shadow = true) {
    for (const [mat, list] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(list), mat);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
}

const SPEED = 2.6; // m/s (~9.5 km/h, harrowing)
// Lanes 12 m apart (works in lands, skipping between passes) so the
// headland turn has a realistic 6 m radius.
const LANE = 12;
const TURN_R = LANE / 2;

export function createFarmLife(scene, M, terrain) {
  const field = FIELDS.find((f) => f.name === 'T-08') || FIELDS.find((f) => f.crop === 'fallow');
  const root = new THREE.Group();
  root.name = 'workingTractor';
  const C = new Collector();
  const lay = tractor(C, M, 0, 0, 0, 0, { dynamic: true });
  discHarrow(C, M, 0, 0, -4.1, 0);
  C.build(root);
  for (const ch of root.children) ch.castShadow = ch.material === M.tractorRed || ch.material === M.steel;
  const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.1 });
  const front = lay.wheels.find((w) => w.steer), rear = lay.wheels.find((w) => !w.steer);
  const setWheels = wheelSet(root, lay.wheels, wheelGeometry(front.R, front.W), wheelGeometry(rear.R, rear.W), wheelMat);
  scene.add(root);

  // Route: lanes along X from x0+8 to x1-8, stepping in Z; ping-pong over the lanes.
  const x0 = field.x0 + 8, x1 = field.x1 - 8;
  const nLanes = Math.floor((field.z1 - field.z0 - 16) / LANE);
  const L = x1 - x0, T = Math.PI * TURN_R;
  const cycle = 2 * (nLanes - 1) * (L + T);
  function pose(t, out) {
    let s = (t * SPEED) % cycle;
    const seg = L + T;
    let k = Math.floor(s / seg); // 0 .. 2(n-1)-1
    const u = s - k * seg;
    const up = k < nLanes - 1; // lane index increasing
    const lane = up ? k : 2 * (nLanes - 1) - k;
    const next = up ? lane + 1 : lane - 1;
    const east = lane % 2 === 0;
    const zL = field.z0 + 8 + lane * LANE, zN = field.z0 + 8 + next * LANE;
    if (u < L) {
      out.x = east ? x0 + u : x1 - u;
      out.z = zL;
      out.yaw = east ? Math.PI / 2 : -Math.PI / 2;
      out.steer = 0;
      out.turning = false;
    } else {
      // Headland U-turn (half circle) onto the next lane.
      const a = (u - L) / TURN_R;
      const dirZ = Math.sign(zN - zL);
      const cx = east ? x1 : x0, cz = (zL + zN) / 2;
      const sx = east ? 1 : -1;
      out.x = cx + sx * Math.sin(a) * TURN_R;
      out.z = cz - dirZ * Math.cos(a) * TURN_R;
      out.yaw = Math.atan2(sx * Math.cos(a), dirZ * Math.sin(a));
      out.steer = 0.5 * sx * dirZ * (east ? 1 : -1);
      out.turning = true;
    }
    return out;
  }
  const P = { x: 0, z: 0, yaw: 0, steer: 0, turning: false };
  const _e = new THREE.Euler();
  let acc = 0, dustT = 0;
  return {
    root,
    update(dt, time, camera, dust) {
      const d = Math.hypot(camera.position.x - (x0 + x1) / 2, camera.position.z - (field.z0 + field.z1) / 2) - L / 2;
      root.visible = d < 2000;
      if (!root.visible) return;
      // Distance-throttled pose updates.
      acc += dt;
      const every = d < 500 ? 0 : d < 1200 ? 0.12 : 0.4;
      if (acc < every) return;
      const step = acc; acc = 0;
      pose(time, P);
      const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
      const hF = terrain.heightAt(P.x + fx * 1.5, P.z + fz * 1.5), hR = terrain.heightAt(P.x - fx * 1.5, P.z - fz * 1.5);
      root.position.set(P.x, (hF + hR) / 2, P.z);
      _e.set(-Math.atan2(hF - hR, 3), P.yaw, 0, 'YXZ');
      root.quaternion.setFromEuler(_e);
      setWheels((time * SPEED) / 0.5, P.steer);
      // Dust behind the discs when close enough to see it.
      if (dust && d < 600 && !P.turning) {
        dustT -= step;
        while (dustT <= 0) {
          dustT += 0.09;
          const bx = P.x - fx * 5.2 + fz * (Math.random() - 0.5) * 3.2, bz = P.z - fz * 5.2 - fx * (Math.random() - 0.5) * 3.2;
          dust.spawn(bx, terrain.heightAt(bx, bz) + 0.3, bz, -fx * 0.6, 0.35 + Math.random() * 0.4, -fz * 0.6,
            { life: 3 + Math.random() * 2, size: 1.8, grow: 2.4, alpha: 0.22, drag: 0.8, gravity: -0.05, color: [0.55, 0.27, 0.15] });
        }
      }
    },
    pose: (t) => pose(t, { x: 0, z: 0, yaw: 0, steer: 0, turning: false }),
  };
}
