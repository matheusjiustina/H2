import { PlantRig } from './common.js';
import { buildNVDA } from './nvda.js';
import { buildAAPL } from './aapl.js';
import { buildTSLA } from './tsla.js';
import { buildAMZN } from './amzn.js';
import { buildGOOGL } from './googl.js';
import { buildPONS } from './pons.js';
import { STOCK_MAP } from '../config/stocks.js';

const BUILDERS = {
  NVDA: buildNVDA,
  AAPL: buildAAPL,
  TSLA: buildTSLA,
  AMZN: buildAMZN,
  GOOGL: buildGOOGL,
  PONS: buildPONS,
};

export function createPlant(stockId, seed) {
  const rig = new PlantRig(STOCK_MAP[stockId], seed);
  BUILDERS[stockId](rig);
  return rig;
}
