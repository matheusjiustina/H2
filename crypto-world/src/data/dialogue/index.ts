import type { Conversation } from '../../gameplay/types';
import { CITY_DIALOGUE } from './city';
import { HILLS_COAST_DIALOGUE, HILLS_COAST_EXTRA } from './hills_coast';
import { EAST_DIALOGUE } from './east';
import { OBJECT_DIALOGUE } from './objects';

export { OBJECT_SPEAKERS } from './objects';

/** Every conversation in the game, for NPCs and talking objects alike. */
export const CONVERSATIONS: Conversation[] = [...CITY_DIALOGUE, ...HILLS_COAST_DIALOGUE, ...HILLS_COAST_EXTRA, ...EAST_DIALOGUE, ...OBJECT_DIALOGUE];
