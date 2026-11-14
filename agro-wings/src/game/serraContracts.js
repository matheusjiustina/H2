// Serra das Bananeiras — the map's service orders, made from its banana
// plots (src/world/serra.js: a plot is a stack of bands following its
// hillside; one order covers the plot's bands). Orders at the base are
// taken on the board; the ones of the two farm strips are requests read at
// the office and flown from those strips. Pay follows the work: steeper,
// more broken plots pay more per hectare.
import { t } from '../i18n/index.js';
import { SERRA_PLOTS, serraNatural } from '../world/serra.js';

const plotInfo = (pl) => {
  let lo = 1e9, hi = -1e9;
  for (const r of pl.rects) for (let x = r.x0; x <= r.x1; x += 20) for (let z = r.z0; z <= r.z1; z += 20) { const h = serraNatural(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
  return { relief: hi - lo, names: pl.rects.map((_, k) => `${pl.name}${'ABCDE'[k]}`) };
};
const pay = (relief) => Math.round((480 + relief * 7) / 10) * 10;

const CLIENTS = ['Sítio Bananal', 'Sítio Boa Vista', 'Chácara do Vale', 'Sítio Pedra Lisa', 'Sítio Ribeirão', 'Sítio Baixadão', 'Sítio Poço Fundo', 'Sítio Dois Córregos', 'Sítio Alto da Serra', 'Sítio Espigão', 'Sítio Grota Funda'];
const order = (pl, i) => {
  const { relief, names } = plotInfo(pl);
  return {
    id: pl.contract, plot: pl.name,
    get title() { return t('Banana — Talhão {0}', pl.name); },
    client: CLIENTS[i % CLIENTS.length],
    get brief() { return t('A banana talhão of {0} ha in {1} bands laid along the hillside ({2} m of relief). Passes follow the contour: keep the work height over the canopy as the ground rises and falls.', pl.ha.toFixed(1), pl.rects.length, Math.round(relief)); },
    get difficulty() { return relief > 22 ? t('Steep hillside') : relief > 12 ? t('Hillside') : t('Valley floor'); },
    level: 2, fields: names,
    payPerHa: pay(relief), bonus: Math.round((1800 + pl.ha * 420 + relief * 60) / 100) * 100,
    recommended: { fuel: 100, liquid: Math.round((140 + pl.ha * 45) / 20) * 20 },
    get tip() { return t('Banana plants stand 3.4 m: the canopy is high. Mind the forest at the ends of the passes.'); },
  };
};
const plots = SERRA_PLOTS.filter((p) => p.contract).sort((a, b) => a.contract.localeCompare(b.contract));
export const SERRA_CONTRACTS = plots.filter((p) => p.site === 'main').map(order);

const FROM = {
  baixadao: { get from() { return t('Seu Dito, banana grower'); }, get message() { return t('Morning! The sigatoka is back in the plantation down here in the Baixadão. The strip is grass, short, with the forest on the far side — come in over the creek. Not in the rain, it washes off.'); } },
  pistadaserra: { get from() { return t('Dona Nair, owner'); }, get message() { return t('Up here on the serra the mist sits until mid-morning and the strip climbs to the east. The banana on the hillside needs its spray — only for pilots who like short strips.'); } },
};
export const SERRA_FARM_CONTRACTS = plots.filter((p) => p.site !== 'main').map((pl, i) => {
  const c = order(pl, i + 5);
  Object.defineProperties(c, Object.getOwnPropertyDescriptors(FROM[pl.site]));
  c.farm = pl.site;
  c.window = { noRain: true };
  return c;
});

export const SERRA_FARM_INFO = {
  baixadao: {
    get blurb() { return t('The remote lowland in the south-east: banana on the flat by the creek and on the first slopes, forest all round.'); },
    get strip() { return t('430 × 16 m grass and earth, level'); },
    get weather() { return t('Humid; showers'); },
  },
  pistadaserra: {
    get blurb() { return t('A hill strip in the south-west serra, rarely used: banana on the shoulders of the hills, forest on the tops.'); },
    get strip() { return t('380 × 14 m rough earth, 3 % up-slope eastbound'); },
    get weather() { return t('Morning mist'); },
  },
};
