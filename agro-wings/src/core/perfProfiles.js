// Graphics profiles of the Adaptive Performance System. Centralises every
// parameter that may change at run time; the world modules still read the
// same `quality` fields as before (src/config.js QUALITY), so no scene is
// duplicated and nothing is rebuilt.
//
//   ultra     ULTRA ORIGINAL — the very object QUALITY.high (same reference,
//             same numbers: the look of v73, tag ultra-original-v73). Chosen
//             manually it is never reduced, not even by the resolution
//             manager. Pixel ratio = min(devicePixelRatio, 2) × 1.5, as before.
//   alto      Ultra with only secondary costs trimmed: render scale 1.25
//             instead of 1.5 (the largest cost found in the phase-1 audit:
//             pixels), slightly shorter grass / forest-crown / rain ranges.
//             Shadows (4096), crop shadows, near vegetation and clouds are kept.
//   medio     QUALITY.medium unchanged (what the default player has seen).
//   economico QUALITY.low unchanged.
//   auto      not a profile: the controller picks one of the four above.
//
// resMin: lowest dynamic-resolution factor (applied on top of the profile's
// pixel ratio); ultra has none when manual. maxPixels: ceiling for the
// canvas area in device pixels (keeps very large / very dense screens
// safe); ultra has none (unchanged behaviour).
// The "alto" trims are predicted from pixel counts and ranges, NOT measured
// on a GPU yet (the build environment has none): they are tunable here.
import { QUALITY, SPRAY } from '../config.js';

export const PROFILE_ORDER = ['economico', 'medio', 'alto', 'ultra']; // worst → best
export const PROFILE_IDS = ['auto', ...PROFILE_ORDER];

const alto = Object.freeze({
  ...QUALITY.high,
  pixelRatio: 1.25,
  grassRadius: 68, grassDensity: 0.9,
  crownRadius: 470,
  rainDrops: 3200,
  clouds: 40,
});

export const PROFILES = Object.freeze({
  economico: Object.freeze({ id: 'economico', legacy: 'low', quality: QUALITY.low, particles: SPRAY.maxParticles.low, resMin: 0.6, maxPixels: 1.4e6, label: 'Economy' }),
  medio: Object.freeze({ id: 'medio', legacy: 'medium', quality: QUALITY.medium, particles: SPRAY.maxParticles.medium, resMin: 0.7, maxPixels: 2.8e6, label: 'Medium' }),
  alto: Object.freeze({ id: 'alto', legacy: 'high', quality: alto, particles: 5000, resMin: 0.85, maxPixels: 5.0e6, label: 'High' }),
  ultra: Object.freeze({ id: 'ultra', legacy: 'high', quality: QUALITY.high, particles: SPRAY.maxParticles.high, resMin: 0.85, maxPixels: Infinity, label: 'Ultra Original' }),
});

// Old settings / URLs used low / medium / high.
export const LEGACY_TO_PROFILE = Object.freeze({ low: 'economico', medium: 'medio', high: 'ultra' });

// Accepts a profile id, a legacy preset name, or 'auto'; null if unknown.
export function normalizeProfile(v) {
  if (v === 'auto' || PROFILES[v]) return v;
  return LEGACY_TO_PROFILE[v] ?? null;
}

// Dynamic resolution is allowed for every profile except a manually chosen
// Ultra Original; in automatic mode every rung (ultra included) may adapt.
export const allowsDynamicRes = (profileId, auto) => auto || profileId !== 'ultra';

// Canvas pixel ratio for a profile at a given dynamic-resolution factor.
// For ultra at factor 1 this is exactly the original expression.
export function pixelRatioFor(profile, scale, dpr, cssW, cssH) {
  let r = Math.min(dpr, 2) * profile.quality.pixelRatio * scale;
  const cap = profile.maxPixels;
  if (Number.isFinite(cap) && cssW > 0 && cssH > 0) r = Math.min(r, Math.sqrt(cap / (cssW * cssH)));
  return Math.max(0.5, r);
}
