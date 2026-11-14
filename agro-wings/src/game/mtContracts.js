// Mato Grosso Operations — the map's service orders (premium map 04): soy and
// corn on the big blocks by the BR-163 (the base's board), the pivots (the
// pivot strip), capim desiccation (the capim strip), the reserve edge (the
// reserve strip). One order per field; pay follows the work.
import { t } from '../i18n/index.js';
import { MT_FIELDS } from '../world/matogrosso.js';

const ha = (f) => (f.circle ? Math.PI * f.circle.r ** 2 : (f.x1 - f.x0) * (f.z1 - f.z0)) / 1e4;
const CROP_PT = { soy: 'Soja', corn: 'Milho', capim: 'Capim' };
const CLIENTS = { main: 'Fazenda Santa Fé', pivo: 'Fazenda Santa Fé · Pivôs', capim: 'Fazenda Santa Fé · Retiro do Capim', reserva: 'Fazenda Santa Fé · Reserva' };
const BRIEF = {
  soy: () => t('Fungicide on soybean in a big block by the BR-163: long straight passes, open approaches.'),
  corn: () => t('Insecticide on corn: tall canopy, keep the work height over the tassels.'),
  capim: () => t('Desiccation of the brachiaria before the soy is planted: even coverage, no gaps — what is missed grows back.'),
  pivot: () => t('A centre-pivot circle: the passes are chords of the disc, and the pivot arm stands 4 m high across every pass — hop over it, then back down to work height.'),
};
const order = (f) => {
  const c = f.extra.contract, site = f.extra.farm ?? 'main', A = ha(f), pivot = !!f.circle, kind = f.crop;
  const per = kind === 'capim' ? 180 : kind === 'corn' ? 260 : 230;
  return {
    id: c, level: pivot ? 2 : 1, fields: [f.name], farm: site === 'main' ? undefined : site,
    get title() { return pivot ? t('Pivot {0} — {1}', f.name, CROP_PT[kind]) : t('{0} — Talhão {1}', kind === 'capim' ? t('Desiccation') : CROP_PT[kind], f.name); },
    client: CLIENTS[site],
    get brief() { return pivot ? BRIEF.pivot() : BRIEF[kind](); },
    get difficulty() { return pivot ? t('Pivot arm') : A > 70 ? t('Big block') : t('Open field'); },
    payPerHa: per + (pivot ? 90 : 0), bonus: Math.round((1500 + A * 30 + (pivot ? 2500 : 0)) / 100) * 100,
    recommended: { fuel: Math.min(100, 50 + Math.round(A / 3)), liquid: Math.round((150 + A * 12) / 20) * 20 },
    get tip() { return pivot ? t('Fly the passes along the rows; the arm crosses them. Mind the centre tower.') : t('Plan the passes with the wind across them.'); },
  };
};
const withOrder = MT_FIELDS.filter((f) => f.extra.contract);
export const MT_CONTRACTS = withOrder.filter((f) => !f.extra.farm).map(order);

const FROM = {
  pivo: { get from() { return t('Seu Valdir, irrigation manager'); }, get message() { return t('The pivots need their spray before the end of the week. The arms are parked north–south — come in along the rows and jump them.'); } },
  capim: { get from() { return t('Dona Cida, farm manager'); }, get message() { return t('We plant soy on the capim next month: desiccate it now. The strip out there is short and climbs east — come light.'); } },
  reserva: { get from() { return t('Seu Antônio, agronomist'); }, get message() { return t('Fields along the reserve: the trees stand at the end of the passes. The strip by the BR is downhill eastbound.'); } },
};
export const MT_FARM_CONTRACTS = withOrder.filter((f) => f.extra.farm).map((f) => {
  const c = order(f);
  Object.defineProperties(c, Object.getOwnPropertyDescriptors(FROM[f.extra.farm]));
  c.farm = f.extra.farm;
  return c;
});

export const MT_FARM_INFO = {
  pivo: { get blurb() { return t('The pivot district in the north-east: three centre-pivot circles and the dam that feeds them.'); }, get strip() { return t('540 × 16 m red clay, 1.5 % up-slope eastbound'); }, get weather() { return t('Dry, hot'); } },
  capim: { get blurb() { return t('The back of the farm in the north-west: brachiaria waiting for desiccation, narrow crooked roads.'); }, get strip() { return t('470 × 14 m rough earth, 2.2 % up-slope eastbound'); }, get weather() { return t('Dry, hot'); } },
  reserva: { get blurb() { return t('By the BR-163 against the legal reserve: soy and corn with forest at the end of the passes.'); }, get strip() { return t('500 × 15 m earth, 1.2 % down-slope eastbound, cross slope'); }, get weather() { return t('Humid; showers'); } },
};
