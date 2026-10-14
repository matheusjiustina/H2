import * as THREE from "three";
import type { Builder } from "./Builder";
import type { CollisionWorld } from "./Collision";
import { plane } from "./geometry";
import { L } from "./layout";

let blobTex: THREE.Texture | null = null;
let glowTex: THREE.Texture | null = null;

/** Soft rounded-rectangle falloff (alpha only), stretched to each footprint. */
function blobTexture(): THREE.Texture {
  if (blobTex) return blobTex;
  const N = 64;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = Math.abs((x + 0.5) / N - 0.5) * 2;
      const v = Math.abs((y + 0.5) / N - 0.5) * 2;
      // distance to an inner rounded box, softened toward the edge
      const dx = Math.max(0, u - 0.45);
      const dy = Math.max(0, v - 0.45);
      const d = Math.hypot(dx, dy) / 0.55;
      const a = Math.max(0, 1 - d);
      const i = (y * N + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
      data[i + 3] = Math.round(a * a * (3 - 2 * a) * 255);
    }
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  blobTex = t;
  return t;
}

/** Radial glow for screen light pooling on desks. */
export function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 40, 4, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.4)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

const blobMats = new Map<number, THREE.MeshBasicMaterial>();
/** Shared contact-shadow material per strength (shared → merged into one batch each). */
export function blobMat(opacity: number): THREE.MeshBasicMaterial {
  const k = Math.round(opacity * 100);
  let m = blobMats.get(k);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: "#000000", map: blobTexture(), transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    m.name = `blob-${k}`;
    blobMats.set(k, m);
  }
  return m;
}

let spill: THREE.MeshBasicMaterial | null = null;
/** Warm light washing down a surface from an LED strip above (additive vertical fade). */
export function spillMat(): THREE.MeshBasicMaterial {
  if (!spill) {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 64);
    spill = new THREE.MeshBasicMaterial({ color: "#d9893e", map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  }
  return spill;
}

let screenGlow: THREE.MeshBasicMaterial | null = null;
/** Cool light that monitors throw on the desk in front of them (additive, no light cost). */
export function screenGlowMat(): THREE.MeshBasicMaterial {
  if (!screenGlow) {
    screenGlow = new THREE.MeshBasicMaterial({ color: "#7d9cc4", map: glowTexture(), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  }
  return screenGlow;
}

/** A contact shadow on the floor. */
export function blob(b: Builder, x: number, y: number, z: number, w: number, d: number, opacity: number, parent?: THREE.Object3D) {
  return b.mesh(plane(w, d), blobMat(opacity), { pos: [x, y + 0.004, z], rot: [-Math.PI / 2, 0, 0], receive: false, cast: false, parent });
}

const SKIP = /^(front|door|stairRail|mezzRail|chain|wbTray|mezzSlab|stairs)/;
const WALLISH = /^(wall|partition|corr|serverWall|wcBlock|storeBlock)/;

/**
 * Contact shadows for everything that stands on a floor, derived from the
 * player collision boxes: furniture gets a soft footprint, wall bases a thin
 * band of fake ambient occlusion.
 */
export function dressContactShadows(b: Builder, collision: CollisionWorld) {
  for (const box of collision.boxes) {
    const tag = box.tag ?? "";
    if (SKIP.test(tag)) continue;
    const onGround = Math.abs(box.minY) < 0.05;
    const onMezz = Math.abs(box.minY - L.mezzY) < 0.05;
    if (!onGround && !onMezz) continue;
    if (box.maxY - box.minY < 0.25) continue;
    const w = box.maxX - box.minX;
    const d = box.maxZ - box.minZ;
    if (w * d > 40) continue;
    const y = onMezz ? L.mezzY + 0.02 : 0;
    const cx = (box.minX + box.maxX) / 2;
    const cz = (box.minZ + box.maxZ) / 2;
    if (WALLISH.test(tag)) {
      blob(b, cx, y, cz, w + 0.34, d + 0.34, 0.28);
    } else if (tag.startsWith("chair-")) {
      blob(b, cx, y, cz, 0.8, 0.8, 0.52);
    } else if (tag.startsWith("desk-")) {
      blob(b, cx, y, cz, w + 0.18, d + 0.18, 0.5);
    } else {
      blob(b, cx, y, cz, w + 0.22, d + 0.22, 0.46);
    }
  }
}
