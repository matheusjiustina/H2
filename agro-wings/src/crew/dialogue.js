// The badeco's rare remarks (Badeco 2.0): short lines in the voice of a
// Brazilian ag-aviation ground hand, shown as a small caption — never more
// than one every few minutes, mostly silent. A spontaneous remark needs a
// long quiet interval and a low chance; a few events (the aircraft he is
// servicing, a job finished, the weather) may prompt a fitting one, still
// rarely. Never in menus, never with the player far away, never over a
// warning; no audio, no timers running in between (checked from the game
// tick only while playing near the crew).
import { t } from '../i18n/index.js';

const MIN_GAP = 6 * 60; // s between any two remarks
const SPONT_GAP = 9 * 60; // s of quiet before a spontaneous one is possible
const SPONT_P = 0.2; // chance per check (one check a minute after that)
const EVENT_P = 0.35; // chance an event gets a remark (gaps permitting)

const GENERAL = () => [
  t('Busy around here today.'), t('This harvest is keeping us busy!'), t('Another working day on the farm.'),
  t('The sky is beautiful today.'), t("I've seen a lot of machines come through this yard."), t("The boss doesn't let these planes sit idle!"),
  t('This hangar is going to get too small.'), t("There's work everywhere you look."),
];
const BY_TYPE = {
  ipanema: () => [t('Man, this Ipanema is a fighter.')], e201: () => [t('Man, this Ipanema is a fighter.')], e203: () => [t('Man, this Ipanema is a fighter.')],
  at502: () => [t('Look at the size of this Air Tractor!')], at802: () => [t('Look at the size of this Air Tractor!')], at401: () => [t('This radial has a beautiful rumble.')],
  pa36: () => [t('This Brave is a beautiful machine, you know.')], m18: () => [t('This radial has a beautiful rumble.')], agcat: () => [t('This radial has a beautiful rumble.')],
  thrush: () => [t('Look at the size of this Thrush!')], at802f: () => [t('A Fire Boss in the yard — that is something to see.')],
};

export class CrewDialogue {
  constructor(game) {
    this.game = game;
    this.quiet = 0; // s since the last remark
    this.check = 60;
    this.last = '';
    this.count = 0;
  }

  // Called from the game tick (cheap: a few comparisons).
  update(dt, near) {
    this.quiet += dt;
    if (!near || this.quiet < SPONT_GAP) return;
    this.check -= dt;
    if (this.check > 0) return;
    this.check = 60;
    if (Math.random() < SPONT_P) this._say(GENERAL());
  }

  // Event prompt: 'service' (with the aircraft type id), 'jobDone', 'clear'.
  event(kind, typeId = null) {
    if (this.quiet < MIN_GAP || Math.random() > EVENT_P) return false;
    const list = kind === 'service' && BY_TYPE[typeId] ? BY_TYPE[typeId]() : kind === 'jobDone' ? [t('This harvest is keeping us busy!'), t("The boss doesn't let these planes sit idle!")] : kind === 'clear' ? [t('The sky is beautiful today.')] : GENERAL();
    return this._say(list);
  }

  _say(list) {
    const g = this.game;
    if (!g.playing || g.screens?.open || g.warnings?.().length) return false;
    const pick = list.filter((s) => s !== this.last);
    const line = (pick.length ? pick : list)[Math.floor(Math.random() * (pick.length || list.length))];
    this.last = line;
    this.quiet = 0;
    this.count++;
    g.hud?.say?.(t('Badeco'), line);
    return true;
  }
}
