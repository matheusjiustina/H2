// Registration marks chosen by the player: Brazilian civil format only, one
// set of marks per aircraft, factory marks kept as the default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIRCRAFT_TYPES, normalizeReg, setRegistration, regTaken } from '../src/aircraft/types.js';

test('normalizeReg accepts PP/PR/PS/PT/PU + three letters only', () => {
  assert.equal(normalizeReg('pr-abc'), 'PR-ABC');
  assert.equal(normalizeReg('PTXYZ'), 'PT-XYZ');
  assert.equal(normalizeReg('pu agx'), 'PU-AGX');
  for (const bad of ['PX-ABC', 'PR-AB', 'PR-ABCD', 'PR-QAB', 'PR-SOS', 'PR-A1C', 'N-12345', '', null]) assert.equal(normalizeReg(bad), null, String(bad));
});

test('setRegistration: per aircraft, unique, reset to the factory marks', () => {
  const ty = AIRCRAFT_TYPES.r44;
  assert.equal(ty.reg, ty.reg0);
  assert.equal(setRegistration('r44', 'pt-hel'), 'PT-HEL');
  assert.equal(ty.reg, 'PT-HEL');
  assert.equal(AIRCRAFT_TYPES.ipanema.reg, AIRCRAFT_TYPES.ipanema.reg0, 'others untouched');
  // Another aircraft's marks are refused.
  assert.ok(regTaken('ipanema', 'PT-HEL'));
  assert.equal(setRegistration('ipanema', 'PT-HEL'), null);
  assert.equal(setRegistration('r44', 'PR-Q12'), null);
  assert.equal(ty.reg, 'PT-HEL', 'refused marks leave the current ones');
  assert.equal(setRegistration('r44', null), ty.reg0);
  assert.equal(ty.reg, ty.reg0);
});
