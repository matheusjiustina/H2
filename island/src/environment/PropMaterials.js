import * as THREE from 'three';
import { patchMaterial } from '../core/MaterialPatch.js';

// Worn paint: noise based chips revealing bare metal / wood, plus rust spots.
const WEAR_VERT = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace('varying vec3 vWPos;', 'varying vec3 vWPos;\nvarying vec3 vLocalPos;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalPos = position;');
};
const WEAR_FRAG = (shader) => {
  shader.fragmentShader = shader.fragmentShader
    .replace('varying vec3 vWPos;', 'varying vec3 vWPos;\nvarying vec3 vLocalPos;\nuniform vec3 uBare;\nuniform float uWear;\nuniform float uWearScale;\nuniform float uRust;\nuniform float uBareMetal;\nfloat _worn = 0.0; float _rust = 0.0;')
    .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 lp = vLocalPos * uWearScale;
  float n = (texture2D(uNoiseTex, lp.xy).g + texture2D(uNoiseTex, lp.yz + 0.3).g + texture2D(uNoiseTex, lp.zx + 0.6).g) / 3.0;
  float nf = (texture2D(uNoiseTex, lp.xy * 4.0).b + texture2D(uNoiseTex, lp.yz * 4.0).b + texture2D(uNoiseTex, lp.zx * 4.0).b) / 3.0;
  _worn = smoothstep(1.0 - uWear, 1.0 - uWear + 0.04, n * 0.8 + nf * 0.35);
  float rn = (texture2D(uNoiseTex, lp.xy * 1.7 + 0.2).r + texture2D(uNoiseTex, lp.zx * 1.7).r) * 0.5;
  _rust = smoothstep(0.62, 0.7, rn + nf * 0.2) * uRust;
  diffuseColor.rgb = mix(diffuseColor.rgb, uBare, _worn);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.14, 0.06) * (0.7 + nf * 0.6), _rust);
  diffuseColor.rgb *= 0.92 + nf * 0.16;
}`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.55, _worn);\nroughnessFactor = mix(roughnessFactor, 0.95, _rust);')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, uBareMetal, _worn);\nmetalnessFactor = mix(metalnessFactor, 0.0, _rust);');
};

export function wornPaint(color, { bare = 0x8a8a86, wear = 0.3, scale = 2.0, rust = 0.5, bareMetal = 1, roughness = 0.55, metalness = 0.2, viewmodel = false } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  patchMaterial(m, {
    wet: 0.8,
    depthHack: viewmodel,
    key: `wear${viewmodel ? 'v' : ''}`,
    uniforms: {
      uBare: { value: new THREE.Color(bare) },
      uWear: { value: wear },
      uWearScale: { value: scale },
      uRust: { value: rust },
      uBareMetal: { value: bareMetal },
    },
    vertex: WEAR_VERT,
    fragment: WEAR_FRAG,
  });
  return m;
}

export function createPropMaterials(textures) {
  const M = {};
  M.wood = new THREE.MeshStandardMaterial({ map: textures.wood, normalMap: textures.woodNormal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.82, vertexColors: true, color: new THREE.Color(0xfff2e0) });
  patchMaterial(M.wood, { wet: 1.0, key: 'wood' });
  M.woodDark = new THREE.MeshStandardMaterial({ map: textures.wood, normalMap: textures.woodNormal, roughness: 0.85, vertexColors: true, color: new THREE.Color(0.55, 0.45, 0.36) });
  patchMaterial(M.woodDark, { wet: 1.0, key: 'woodDark' });
  M.woodCharred = new THREE.MeshStandardMaterial({ map: textures.wood, roughness: 0.95, color: new THREE.Color(0.08, 0.07, 0.065), vertexColors: true });
  patchMaterial(M.woodCharred, { wet: 0.5, key: 'charred' });
  M.canvas = new THREE.MeshPhysicalMaterial({ map: textures.fabric, normalMap: textures.fabricNormal, normalScale: new THREE.Vector2(0.6, 0.6), color: new THREE.Color(0xe6d6b4), roughness: 0.96, sheen: 0.35, sheenRoughness: 0.8, sheenColor: new THREE.Color(0xf0e6cc), side: THREE.DoubleSide });
  patchMaterial(M.canvas, { wind: 'cloth', wet: 1.0, translucency: 0.9, noFlip: false, key: 'canvasTarp' });
  M.canvasStatic = new THREE.MeshPhysicalMaterial({ map: textures.fabric, normalMap: textures.fabricNormal, color: new THREE.Color(0xe0d0ae), roughness: 0.96, sheen: 0.35, sheenColor: new THREE.Color(0.9, 0.85, 0.7), side: THREE.DoubleSide });
  patchMaterial(M.canvasStatic, { wet: 1.0, key: 'canvas' });
  M.olive = new THREE.MeshPhysicalMaterial({ map: textures.fabric, normalMap: textures.fabricNormal, color: new THREE.Color(0.3, 0.33, 0.2), roughness: 0.9, sheen: 0.4, sheenColor: new THREE.Color(0.5, 0.55, 0.4) });
  patchMaterial(M.olive, { wet: 1.0, key: 'olive' });
  M.blueTarp = new THREE.MeshPhysicalMaterial({ map: textures.fabric, normalMap: textures.fabricNormal, color: new THREE.Color(0.16, 0.36, 0.5), roughness: 0.8, sheen: 0.2, side: THREE.DoubleSide });
  patchMaterial(M.blueTarp, { wind: 'cloth', wet: 1.0, key: 'blueTarp' });
  M.hammock = new THREE.MeshPhysicalMaterial({ map: textures.fabric, normalMap: textures.fabricNormal, color: new THREE.Color(0xb5643a), roughness: 0.95, sheen: 0.5, sheenColor: new THREE.Color(0xffc49a), side: THREE.DoubleSide });
  patchMaterial(M.hammock, { wet: 1.0, translucency: 0.35, key: 'hammock' });
  M.cloth = new THREE.MeshPhysicalMaterial({ map: textures.fabric, color: new THREE.Color(0.75, 0.32, 0.22), roughness: 0.95, sheen: 0.5, sheenColor: new THREE.Color(1, 0.7, 0.6), side: THREE.DoubleSide });
  patchMaterial(M.cloth, { wind: 'cloth', wet: 1.0, translucency: 0.3, key: 'clothRed' });
  M.rope = new THREE.MeshStandardMaterial({ map: textures.fabric, color: new THREE.Color(0.62, 0.5, 0.34), roughness: 0.95 });
  patchMaterial(M.rope, { wet: 1.0, key: 'rope' });
  M.metalDrum = wornPaint(0x2f5a4a, { wear: 0.35, rust: 0.9, scale: 1.2 });
  M.metalRed = wornPaint(0x8e2a1e, { wear: 0.28, rust: 0.6, scale: 3.0 });
  M.metalOlive = wornPaint(0x3e4a2c, { wear: 0.22, rust: 0.4, scale: 4.0 });
  M.metalBlack = wornPaint(0x161616, { wear: 0.18, rust: 0.1, scale: 6.0, bare: 0x9a9a95, roughness: 0.45 });
  M.metal = new THREE.MeshStandardMaterial({ color: 0x8c8c88, roughness: 0.4, metalness: 1 });
  patchMaterial(M.metal, { wet: 0.5, key: 'metal' });
  M.brass = new THREE.MeshStandardMaterial({ color: 0xc09048, roughness: 0.32, metalness: 1 });
  patchMaterial(M.brass, { wet: 0.4, key: 'brass' });
  M.plastic = new THREE.MeshStandardMaterial({ color: 0x1b1c1d, roughness: 0.42, metalness: 0 });
  patchMaterial(M.plastic, { wet: 0.4, key: 'plastic' });
  M.leather = new THREE.MeshStandardMaterial({ color: 0x4a2e1c, roughness: 0.62, metalness: 0 });
  patchMaterial(M.leather, { wet: 0.7, key: 'leather' });
  M.glass = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false });
  M.stone = new THREE.MeshStandardMaterial({ map: textures.rock, normalMap: textures.rockNormal, roughness: 0.9, vertexColors: true });
  patchMaterial(M.stone, { wet: 0.8, key: 'stone' });
  M.ceramic = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.25, metalness: 0 });
  patchMaterial(M.ceramic, { wet: 0.2, key: 'ceramic' });
  M.enamel = wornPaint(0x2f6f86, { bare: 0x1a1a1a, wear: 0.18, rust: 0.2, scale: 9, bareMetal: 0.3, roughness: 0.3, metalness: 0 });
  M.ember = new THREE.MeshStandardMaterial({ color: 0x1a0d08, emissive: 0xff5a1a, emissiveIntensity: 0, roughness: 1 });
  M.flame = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.0, 2.0, 0.7), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  M.bulb = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.95, 0.85) });
  M.paper = new THREE.MeshStandardMaterial({ color: 0xf0e6cf, roughness: 0.9, side: THREE.DoubleSide });
  patchMaterial(M.paper, { wet: 0.6, key: 'paper' });
  M.coconut = new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.85 });
  patchMaterial(M.coconut, { wet: 0.8, key: 'coconut' });
  M.shell = new THREE.MeshStandardMaterial({ color: 0xf1dccb, roughness: 0.35, metalness: 0 });
  patchMaterial(M.shell, { wet: 0.3, key: 'shell' });
  M.pebble = new THREE.MeshStandardMaterial({ map: textures.rock, roughness: 0.6, color: 0xb8b2a8 });
  patchMaterial(M.pebble, { wet: 0.9, key: 'pebble' });
  return M;
}
