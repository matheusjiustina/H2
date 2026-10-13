import { LayoutBuilder } from '../layout/LayoutBuilder';
import { definePlanet } from '../layout/planet';
import { layoutCity } from './city';
import { layoutHills } from './hills';
import { layoutCoast } from './coast';
import { layoutMining } from './mining';
import { layoutHeights } from './heights';
import { layoutWilds } from './wilds';

/** Builds the complete authored layout of the planet. */
export function buildLayout(): LayoutBuilder {
  const L = new LayoutBuilder();
  definePlanet(L);
  layoutCity(L);
  layoutHills(L);
  layoutCoast(L);
  layoutMining(L);
  layoutHeights(L);
  layoutWilds(L);
  return L;
}
