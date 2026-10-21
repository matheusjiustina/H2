// Secondary-farm contracts: requests from the neighbouring farms, read and
// accepted at the hangar office computer. Each one is flown from its own
// farm's strip (the local service truck loads the aircraft there) and has
// operating conditions: some are morning-only (fungicide before the heat and
// the afternoon wind), most are postponed in rain or thick mist. Conditions
// only decide when a request can be accepted; the flying itself is never
// penalised by the weather.
import { t } from '../i18n/index.js';

export const FARM_CONTRACTS = [
  {
    id: 'sr-soy', farm: 'santarita',
    get title() { return t('Soybean fungicide — Talhão SR-01'); },
    client: 'Fazenda Santa Rita',
    get from() { return t('Sr. Antônio, farm manager'); },
    get message() { return t('Good morning! Rust is showing up in the big soybean block next to our strip. We need the fungicide on early, while the air is calm and before the heat — mornings only, please. The truck is fuelled and the calda ready at our pad.'); },
    get brief() { return t('The big flat soybean talhão north of the Santa Rita strip: long east–west passes over 84 ha. Easy ground, long work: plan the loads.'); },
    get difficulty() { return t('Large field'); },
    level: 1, fields: ['SR-01'],
    payPerHa: 300, bonus: 6500,
    recommended: { fuel: 160, liquid: 600 },
    window: { times: ['dawn', 'morning'], noRain: true },
    get tip() { return t('A 640 m red-earth strip, wide and level: the easiest of the three farms.'); },
  },
  {
    id: 'sr-cotton', farm: 'santarita',
    get title() { return t('Cotton — Talhão SR-02'); },
    client: 'Fazenda Santa Rita',
    get from() { return t('Dona Lúcia, owner'); },
    get message() { return t('We have a long, narrow cotton talhão south of the strip that needs its spray this week. Any time of day is fine, but not in the rain — it would wash off.'); },
    get brief() { return t('A long, narrow cotton talhão south of the Santa Rita strip: few, very long passes.'); },
    get difficulty() { return t('Large field'); },
    level: 1, fields: ['SR-02'],
    payPerHa: 360, bonus: 4000,
    recommended: { fuel: 150, liquid: 520 },
    window: { noRain: true },
    get tip() { return t('Few passes but long ones: keep the line all the way to the end of the talhão.'); },
  },
  {
    id: 'vr-corn', farm: 'valedorio',
    get title() { return t('Corn — Talhão VR-01'); },
    client: 'Fazenda Vale do Rio',
    get from() { return t('Seu Jorge, agronomist'); },
    get message() { return t('The corn on the swell south of our strip needs its application. The valley gets the afternoon showers, so we postpone in rain. Watch the strip: it is grass, short, and climbs to the east — land uphill.'); },
    get brief() { return t('Tall corn over a swell south of the Vale do Rio strip: the land rises about 12 m under the passes.'); },
    get difficulty() { return t('Rolling fields'); },
    level: 2, fields: ['VR-01'],
    payPerHa: 420, bonus: 5200,
    recommended: { fuel: 150, liquid: 500 },
    window: { noRain: true },
    get tip() { return t('480 m mown-grass strip with a 1 % up-slope eastbound: land towards the east, take off towards the west.'); },
  },
  {
    id: 'vr-soy', farm: 'valedorio',
    get title() { return t('Soybean — Talhão VR-02'); },
    client: 'Fazenda Vale do Rio',
    get from() { return t('Seu Jorge, agronomist'); },
    get message() { return t('Second request: the soybean talhão north of the strip, before the next front comes in. Not in the rain, and not with the evening sun in your eyes over the valley — before sunset, please.'); },
    get brief() { return t('A soybean talhão on the gentle slope north of the Vale do Rio strip.'); },
    get difficulty() { return t('Rolling fields'); },
    level: 2, fields: ['VR-02'],
    payPerHa: 380, bonus: 4200,
    recommended: { fuel: 150, liquid: 540 },
    window: { times: ['dawn', 'morning', 'noon', 'golden'], noRain: true },
    get tip() { return t('The passes end close to the shed and the service area: pull up early at the west end.'); },
  },
  {
    id: 'sa-corn', farm: 'serraazul',
    get title() { return t('Corn — Talhão SA-01'); },
    client: 'Sítio Serra Azul',
    get from() { return t('Zé Carlos, owner'); },
    get message() { return t('Our corn in the valley floor east of the strip needs spraying. Up here the wind picks up after midday, so mornings only. If the mist is sitting in the valley, we wait for it to lift.'); },
    get brief() { return t('Corn in the valley east of the Serra Azul strip, hills to the north. A short, narrow gravel strip: the hardest field operation of the three farms.'); },
    get difficulty() { return t('Hilly fields'); },
    level: 3, fields: ['SA-01'],
    payPerHa: 520, bonus: 7500,
    recommended: { fuel: 150, liquid: 440 },
    window: { times: ['dawn', 'morning'], noRain: true, noMist: true },
    get tip() { return t('430 m × 15 m gravel strip: take off light (partial loads) and keep the speed up on final.'); },
  },
  {
    id: 'sa-soy', farm: 'serraazul',
    get title() { return t('Soybean — Talhões SA-02A + SA-02B'); },
    client: 'Sítio Serra Azul',
    get from() { return t('Zé Carlos, owner'); },
    get message() { return t('The soybean on the hill north-east of us — two small, stepped talhões on the slope. Any time before sunset, not in rain or mist: the hill disappears in the cloud.'); },
    get brief() { return t('Two stepped soybean talhões on a hillside: about 18 m of relief, short passes and turns over rising ground.'); },
    get difficulty() { return t('Hilly fields'); },
    level: 3, fields: ['SA-02A', 'SA-02B'],
    payPerHa: 560, bonus: 6800,
    recommended: { fuel: 150, liquid: 420 },
    window: { times: ['dawn', 'morning', 'noon', 'golden'], noRain: true, noMist: true },
    get tip() { return t('Turn downhill, not into the slope.'); },
  },
];

// Can the request be flown now (time of day / weather)? { ok, reason }
export function contractWindow(c, timeId, weatherId) {
  const w = c.window || {};
  if (w.noRain && weatherId === 'rain') return { ok: false, reason: t('Postponed: rain') };
  if (w.noMist && weatherId === 'mist') return { ok: false, reason: t('Postponed: mist in the valley') };
  if (w.times && !w.times.includes(timeId)) {
    return { ok: false, reason: w.times.length <= 2 ? t('Morning only') : t('Before sunset only') };
  }
  return { ok: true, reason: '' };
}

// Short label of the operating conditions.
export function windowLabel(c) {
  const w = c.window || {}, out = [];
  if (w.times) out.push(w.times.length <= 2 ? t('mornings only') : t('before sunset'));
  if (w.noRain) out.push(t('not in rain'));
  if (w.noMist) out.push(t('not in mist'));
  return out.join(' · ');
}

// Who the neighbouring farms are (office computer, map).
export const FARM_INFO = {
  santarita: {
    get blurb() { return t('Big flat chapada farm in the far west: wide rectangular soybean and cotton talhões, long passes. Dry, steady weather.'); },
    get strip() { return t('640 × 22 m red earth, level'); },
    get weather() { return t('Dry; calm mornings'); },
  },
  valedorio: {
    get blurb() { return t('River-valley farm in the south-east: corn and soybean on rolling swells, green and humid, afternoon showers.'); },
    get strip() { return t('480 × 18 m mown grass, 1 % up-slope eastbound'); },
    get weather() { return t('Humid; afternoon showers'); },
  },
  serraazul: {
    get blurb() { return t('Small hill farm in the south-west: corn in the valley floor and soybean on stepped hillside talhões. Morning mist sits in the valley.'); },
    get strip() { return t('430 × 15 m gravel, hills to the north'); },
    get weather() { return t('Morning mist; wind after midday'); },
  },
};
