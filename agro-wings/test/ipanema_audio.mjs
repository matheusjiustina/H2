// Ipanema engine sound lab: renders the layered engine (src/audio/ipanemaEngine.js)
// offline in Chromium for the test situations A–J, driven by a copy of the
// flight model's piston-engine dynamics (cranking 1.3 s toward 260 rpm, then
// rpm → idle + throttle·(max − idle) + 4·airspeed with a 0.7 s lag), writes
// WAV files and checks for clicks, silence when off, the start state sequence,
// no lingering one-shots and no node growth.
//   node test/ipanema_audio.mjs [outDir]
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] ?? path.join(root, 'test', 'out-audio');
mkdirSync(out, { recursive: true });
const SR = 22050;

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.route('http://lab/**', (r) => {
  const p = new URL(r.request().url()).pathname;
  if (p === '/') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><script type="module">import * as M from "/ipanemaEngine.js"; window.M = M; window.ok = true;</script>' });
  return r.fulfill({ contentType: 'text/javascript', body: readFileSync(path.join(root, 'src/audio', p.slice(1))) });
});
await page.goto('http://lab/');
await page.waitForFunction(() => window.ok);

// Scenario timelines: each returns per-step controls at time t.
const scen = {
  // A off → B start → C idle → D throttle up → E high power → F throttle down
  // → I shutdown, heard outside at 30 m (A–F, H, I) or from the cockpit (G).
  ground: `(t) => ({
    start: t >= 2 && t < 2.6, stop: t >= 31 && t < 31.1,
    throttle: t < 11 ? 0 : t < 14 ? (t - 11) / 3 : t < 21 ? 1 : t < 24 ? 1 - (t - 21) / 3 : 0,
    airspeed: 0, src: [0, 0, 0], vel: [0, 0, 0],
  })`,
  // H: full-power flyby at 50 m/s, 40 m abeam of a ground listener.
  flyby: `(t) => ({ start: false, stop: false, running: true, throttle: 1, airspeed: 50,
    src: [-400 + 50 * t, 10, -40], vel: [50, 0, 0] })`,
};

async function render(name, { dur, inside = false, timeline, switchAt = null }) {
  const res = await page.evaluate(async ({ dur, inside, timeline, SR, switchAt }) => {
    const ctx = new OfflineAudioContext(2, Math.ceil(dur * SR), SR);
    const nb = (sec, color) => {
      const n = Math.floor(SR * sec), b = ctx.createBuffer(1, n, SR), d = b.getChannelData(0);
      let last = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        if (color === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
        else if (color === 'pink') { last = 0.97 * last + 0.03 * w; d[i] = (last * 4 + w * 0.3) * 0.6; }
        else d[i] = w;
      }
      return b;
    };
    const master = ctx.createGain();
    master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    const eng = new window.M.IpanemaEngineSound(ctx, master, { white: nb(2, 'white'), pink: nb(2, 'pink'), brown: nb(3, 'brown') });
    const nodes0 = eng.nodes.length + eng.sources.length;
    const ctl = eval(timeline);
    // Flight-model copy (src/flight/flightModel.js _engine, piston branch).
    const fm = { engine: 'off', rpm: 0, throttle: 0, crankTime: 0, vel: { x: 0, y: 0, z: 0 } };
    const A = { idleRpm: 650, maxRpm: 2700 };
    const dt = 1 / 30, log = [];
    let maxShots = 0;
    const step = (i) => {
      const t = i * dt;
      const c = ctl(t);
      if (c.running && fm.engine === 'off') { fm.engine = 'running'; fm.rpm = A.maxRpm * 0.95; }
      if (c.start && fm.engine === 'off') { fm.engine = 'cranking'; fm.crankTime = 0; }
      if (c.stop && fm.engine !== 'off') fm.engine = 'off';
      fm.throttle = c.throttle;
      if (fm.engine === 'cranking') {
        fm.crankTime += dt; fm.rpm += (260 - fm.rpm) * Math.min(1, dt * 3);
        if (fm.crankTime > 1.3) fm.engine = 'running';
      } else if (fm.engine === 'running') {
        const tg = Math.min(A.idleRpm + fm.throttle * (A.maxRpm - A.idleRpm) + c.airspeed * 4, A.maxRpm + 120);
        fm.rpm += (tg - fm.rpm) * Math.min(1, dt / 0.7);
      } else fm.rpm += (Math.min(c.airspeed * 10, 900) - fm.rpm) * Math.min(1, dt * 0.9);
      fm.vel = { x: c.vel[0], y: c.vel[1], z: c.vel[2] };
      const listener = { x: 0, y: 0, z: 0 };
      const st = window.M.ipanemaAudioState({ fm, acPos: { x: c.src[0], y: c.src[1], z: c.src[2] }, camPos: inside ? { x: c.src[0], y: c.src[1], z: c.src[2] } : listener,
        camInv: inside ? null : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], inside, dt });
      if (!inside && c.src[0] === 0 && c.src[2] === 0) { st.rel = [30, 0, 0]; st.dist = 30; }
      const active = switchAt == null || t < switchAt;
      eng.update(dt, st, active);
      maxShots = Math.max(maxShots, eng.oneShots.size);
      if (i % 3 === 0 || eng.state !== log.at(-1)?.[1]) log.push([+t.toFixed(2), eng.state, Math.round(fm.rpm), fm.engine]);
    };
    // Control steps at 30 Hz, run while the offline render is suspended.
    step(0);
    for (let i = 1; i * dt < dur - dt; i++) ctx.suspend(i * dt).then(() => { step(i); ctx.resume(); });
    const buf = await ctx.startRendering();
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    const i16 = new Int16Array(L.length);
    let peak = 0, maxStep = 0;
    for (let i = 0; i < L.length; i++) {
      const m = (L[i] + R[i]) / 2;
      peak = Math.max(peak, Math.abs(m));
      if (i) maxStep = Math.max(maxStep, Math.abs(m - (L[i - 1] + R[i - 1]) / 2));
      i16[i] = Math.max(-32767, Math.min(32767, Math.round(m * 32767)));
    }
    let bin = '';
    const u8 = new Uint8Array(i16.buffer);
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    const nodes1 = eng.nodes.length + eng.sources.length;
    eng.dispose();
    return { b64: btoa(bin), log, peak, maxStep, nodes0, nodes1, maxShots, shotsLeft: eng.oneShots.size };
  }, { dur, inside, timeline, SR, switchAt });
  const pcm = Buffer.from(res.b64, 'base64');
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12);
  hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22); hdr.writeUInt32LE(SR, 24);
  hdr.writeUInt32LE(SR * 2, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
  writeFileSync(path.join(out, `${name}.wav`), Buffer.concat([hdr, pcm]));
  writeFileSync(path.join(out, `${name}.log.json`), JSON.stringify(res.log));
  return res;
}

const results = {
  ground_ext: await render('ground_ext', { dur: 36, timeline: scen.ground }),
  ground_cockpit: await render('ground_cockpit', { dur: 36, inside: true, timeline: scen.ground }),
  flyby: await render('flyby', { dur: 16, timeline: scen.flyby }),
  // J: another aircraft selected while running at power: must go silent.
  switch: await render('switch', { dur: 20, timeline: scen.ground, switchAt: 16 }),
};
await browser.close();

let fail = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fail++; };
for (const [k, r] of Object.entries(results)) {
  console.log(`${k}: peak ${r.peak.toFixed(3)} maxStep ${r.maxStep.toFixed(3)} nodes ${r.nodes0}->${r.nodes1} maxOneShots ${r.maxShots}`);
  check(r.peak < 0.99, `${k}: no clipping`);
  check(r.nodes0 === r.nodes1, `${k}: no node growth`);
  check(r.maxShots <= 24, `${k}: one-shots bounded`);
}
// RMS of a stretch of a rendered file (16-bit mono PCM after the header).
const rmsAt = (name, t0, t1) => {
  const b = readFileSync(path.join(out, `${name}.wav`)), i0 = Math.floor(t0 * SR), i1 = Math.floor(t1 * SR);
  let s = 0;
  for (let i = i0; i < i1; i++) { const v = b.readInt16LE(44 + i * 2) / 32768; s += v * v; }
  return Math.sqrt(s / (i1 - i0));
};
const rOff = rmsAt('ground_ext', 0.2, 1.9), rIdle = rmsAt('ground_ext', 7, 10.5), rFull = rmsAt('ground_ext', 16, 20.5);
const rCkIdle = rmsAt('ground_cockpit', 7, 10.5), rTail = rmsAt('ground_ext', 34.5, 35.8), rSw = rmsAt('switch', 16.6, 19.8);
console.log(`rms off ${rOff.toFixed(5)} idle ${rIdle.toFixed(4)} full ${rFull.toFixed(4)} cockpit idle ${rCkIdle.toFixed(4)} after shutdown ${rTail.toFixed(5)} after switch ${rSw.toFixed(5)}`);
check(rOff < 1e-4, 'A: silent while off');
check(rFull > rIdle * 2, 'E vs C: full power clearly louder than idle');
check(rTail < 1e-3, 'I: nothing lingers after shutdown');
check(rSw < 1e-4, 'J: silent after switching aircraft');
const seq = [...new Set(results.ground_ext.log.map((l) => l[1]))];
console.log('state sequence:', seq.join(' → '));
check(['off', 'start_requested', 'starter_active', 'catch', 'idle_stabilization', 'running', 'shutdown'].every((s, i) => seq[i] === s), 'start/shutdown sequence in order');
check(results.ground_ext.log.at(-1)[1] === 'off', 'ends OFF after shutdown');
process.exit(fail ? 1 : 0);
