// Fireboss Frontier — the map's fire missions (premium map expansion 03).
// Fire only: no crop contracts on this map. Each mission lights whole fire
// sectors of src/world/frontier.js; the Fire Boss scoops at a lake and drops
// on them until every spot is out. Types:
//   A  initial attack — one fire, a short scoop–drop loop;
//   B  fireline containment — a long front, several drops, repeated lake runs;
//   C  ridge fire — spots on the broken slopes of the Morro Queimado;
//   D  low visibility — the basin's smoke hides the ground;
//   E  multi-sector response — two zones in one sequence;
//   F  lake district — built round the scooping loop at Lagoa das Garças.
// flare: a fire not under control in time jumps — more spots are lit
// (`after` minutes from acceptance, while the first ones still burn).
import { t } from '../i18n/index.js';
import { sectorIds } from '../world/frontier.js';

export const FRONT_MISSIONS = [
  { id: 'ff-capim', type: 'A', spots: sectorIds('capim'), pay: 16000, bonusMin: 8, lake: 'Lagoa Grande',
    get title() { return t('Initial attack — Capim do Chapadão'); }, get brief() { return t('A grass fire just started 1.4 km east of the base. Scoop at Lagoa Grande and hit it before it becomes a line.'); } },
  { id: 'ff-norte', type: 'A', spots: sectorIds('norte'), pay: 15000, bonusMin: 8, lake: 'Lagoa Grande',
    get title() { return t('Initial attack — north of Lagoa Grande'); }, get brief() { return t('A small fire in the cerrado just past the lake: a short scoop and drop loop, if you are quick.'); } },
  { id: 'ff-chapadao', type: 'B', spots: sectorIds('chapadao'), flare: { after: 9, spots: sectorIds('flare-chapadao') }, pay: 42000, bonusMin: 18, lake: 'Lagoa Grande',
    get title() { return t('Fireline containment — Chapadão'); }, get brief() { return t('A 700 m fire front across the open plains. Lay the drops along the line, end to end; left too long, it jumps east.'); } },
  { id: 'ff-morro', type: 'C', spots: sectorIds('morro'), pay: 40000, bonusMin: 18, lake: 'Lagoa Grande',
    get title() { return t('Ridge fire — Morro Queimado'); }, get brief() { return t('Fire climbing the slopes of the north-east hills. Run in along the corridors, mind the rising ground after the drop.'); } },
  { id: 'ff-baixada', type: 'D', spots: sectorIds('baixada'), pay: 44000, bonusMin: 20, lake: 'Lagoa das Garças',
    get title() { return t('Low visibility — Baixada da Fumaça'); }, get brief() { return t('Three fires in the southern basin, where the smoke lies thick. Use the GPS to find the spots; keep your height until the target is in sight.'); } },
  { id: 'ff-multi', type: 'E', spots: sectorIds('brasa', 'norte'), flare: { after: 10, spots: sectorIds('flare-brasa') }, pay: 58000, bonusMin: 26, lake: 'Lagoa Grande',
    get title() { return t('Multi-sector response — Serra da Brasa and the north'); }, get brief() { return t('Two zones burning at once: the west ridge and the cerrado north of the lake. Plan the order; the ridge fire spreads if left.'); } },
  { id: 'ff-garcas', type: 'F', spots: sectorIds('garcas'), pay: 38000, bonusMin: 16, lake: 'Lagoa das Garças',
    get title() { return t('Lake district — Lagoa das Garças'); }, get brief() { return t('Fires on the shores of Lagoa das Garças: short scoop and drop circuits on the same lake.'); } },
];

export const MISSION_TYPES = {
  A: () => t('Initial attack'), B: () => t('Fireline containment'), C: () => t('Ridge fire'),
  D: () => t('Low visibility'), E: () => t('Multi-sector response'), F: () => t('Lake district'),
};
