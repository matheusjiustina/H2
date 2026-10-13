import { LayoutBuilder } from '../layout/LayoutBuilder';
import { definePlanet } from '../layout/planet';
import { layoutCity } from './city';

/** Builds the complete authored layout of the planet. */
export function buildLayout(): LayoutBuilder {
  const L = new LayoutBuilder();
  definePlanet(L);
  layoutCity(L);
  return L;
}
