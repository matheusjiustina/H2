import * as THREE from 'three';
import { floorTexture, soilTexture, glowTexture } from './textures.js';

/** Shared materials (created lazily once). Sharing keeps GPU state changes low. */
let M = null;

export function materials() {
  if (M) return M;
  M = {
    slab: new THREE.MeshStandardMaterial({ color: '#15181d', roughness: 0.7, metalness: 0.35 }),
    floor: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: floorTexture(),
      roughness: 0.62,
      metalness: 0.25,
    }),
    bed: new THREE.MeshStandardMaterial({ color: '#242a32', roughness: 0.42, metalness: 0.72 }),
    rim: new THREE.MeshStandardMaterial({ color: '#59616d', roughness: 0.3, metalness: 0.9 }),
    soil: new THREE.MeshStandardMaterial({ color: '#ffffff', map: soilTexture(), roughness: 0.95, metalness: 0 }),
    metal: new THREE.MeshStandardMaterial({ color: '#8b939e', roughness: 0.32, metalness: 0.85 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: '#2b3038', roughness: 0.45, metalness: 0.7 }),
    pipe: new THREE.MeshStandardMaterial({ color: '#3c434d', roughness: 0.28, metalness: 0.8 }),
    copper: new THREE.MeshStandardMaterial({ color: '#b87a4b', roughness: 0.3, metalness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({
      color: '#a9d4ff',
      roughness: 0.05,
      metalness: 0.1,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
    foliage: new THREE.MeshStandardMaterial({ color: '#27493a', roughness: 0.75, flatShading: true }),
    foliage2: new THREE.MeshStandardMaterial({ color: '#35604a', roughness: 0.7, flatShading: true }),
    led: new THREE.MeshBasicMaterial({ color: '#8ff5dc' }),
    ledWarm: new THREE.MeshBasicMaterial({ color: '#ffc27a' }),
    ledRed: new THREE.MeshBasicMaterial({ color: '#ff5566' }),
    ledDim: new THREE.MeshBasicMaterial({ color: '#2b5f57' }),
    lightPanel: new THREE.MeshBasicMaterial({ color: '#dff3ff' }),
    glow: (color, opacity = 1) =>
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
  };
  return M;
}

export function glowSprite(color, size = 1, opacity = 1) {
  const s = new THREE.Sprite(materials().glow(color, opacity));
  s.scale.setScalar(size);
  s.renderOrder = 10;
  return s;
}
