// Every literal text passed to t() in the sources has a Portuguese entry.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import PT_UI from '../src/i18n/pt-ui.js';
import PT_GAME from '../src/i18n/pt-game.js';
import PT_JOBS from '../src/i18n/pt-jobs.js';
import PT_CREW from '../src/i18n/pt-crew.js';
import PT_FARMS from '../src/i18n/pt-farms.js';

const PT = { ...PT_UI, ...PT_GAME, ...PT_JOBS, ...PT_CREW, ...PT_FARMS };

export function literalKeys(dir = 'src') {
  const keys = new Set();
  const walk = (d) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) { if (!p.includes('i18n')) walk(p); continue; }
      if (!p.endsWith('.js')) continue;
      const src = fs.readFileSync(p, 'utf8');
      // t('...') with single quotes (escaped quotes allowed), not template literals.
      for (const m of src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) keys.add(m[1].replace(/\\'/g, "'"));
    }
  };
  walk(dir);
  return keys;
}

test('every t() text has a Portuguese translation', () => {
  const missing = [...literalKeys()].filter((k) => !(k in PT));
  if (process.env.LIST_MISSING) fs.writeFileSync(process.env.LIST_MISSING, JSON.stringify(missing, null, 1));
  assert.deepEqual(missing, []);
});
