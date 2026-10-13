import { drawScreen, ScreenKind } from '../render/ScreenContent';
import type { Doc, SecretDef } from '../data/docs';

const ICONS = {
  journal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/><path d="M9 8h6"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="#f0b04a"><path d="M12 2 20 20 12 15.5 4 20z"/></svg>',
  here: '<svg viewBox="0 0 24 24" fill="none" stroke="#fbf6ec" stroke-width="2.6" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** Inline code spans: `like this`. */
export function richText(s: string): string {
  return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
}

export interface DialogueView {
  speaker: string;
  subtitle?: string;
  kind: 'npc' | 'player' | 'object';
  text: string;
  choices: { text: string; index: number }[];
}

/**
 * All screen-space interface: title, HUD, dialogue, documents, journal, settings and toasts.
 * Pure DOM — updated only on change, never re-rendered every frame.
 */
export class UI {
  readonly root = el('div', 'ui');
  // Title.
  private title = el('div', 'title');
  private loadingBar = el('i');
  // HUD.
  private hud = el('div', 'hud off');
  private tracker = el('div', 'tracker empty');
  private trackerArrow = el('div', 'arrow', ICONS.arrow);
  private trackerTitle = el('div', 'm-title');
  private trackerObj = el('div', 'm-obj');
  private trackerDist = el('div', 'm-dist');
  private prompt = el('div', 'prompt');
  private toasts = el('div', 'toasts');
  private banner = el('div', 'region-banner');
  private clockEl = el('div', 'clock');
  private perfEl = el('div', 'perf hidden');
  // Dialogue.
  private dlg = el('div', 'dialogue');
  private dlgName = el('div', 'name');
  private dlgText = el('div', 'text');
  private dlgChoices = el('div', 'choices');
  private dlgFoot = el('div', 'foot');
  private typing = 0;
  private fullText = '';
  private typeTimer = 0;
  private selChoice = 0;
  private currentChoices: { text: string; index: number }[] = [];
  // Modal.
  private modal = el('div', 'modal hidden');
  private fade = el('div', 'fade-screen');
  private credits = el('div', 'credits hidden');
  modalKind: 'none' | 'doc' | 'screen' | 'journal' | 'settings' | 'secret' = 'none';
  private screenCanvas: HTMLCanvasElement | null = null;
  private screenKind: ScreenKind | null = null;
  private screenT = 0;

  // Callbacks wired by the game.
  onPlay: () => void = () => {};
  onNewGame: () => void = () => {};
  onOpenSettings: () => void = () => {};
  onOpenJournal: () => void = () => {};
  onDialogueAdvance: () => void = () => {};
  onDialogueChoice: (i: number) => void = () => {};
  onDialogueSkip: () => void = () => {};
  onModalClosed: (kind: string) => void = () => {};

  constructor(parent: HTMLElement) {
    parent.appendChild(this.root);
    this.buildTitle();
    this.buildHud();
    this.buildDialogue();
    this.root.append(this.modal, this.fade, this.credits, this.perfEl);
    this.modal.addEventListener('pointerdown', (e) => {
      if (e.target === this.modal) this.closeModal();
    });
  }

  // ------------------------------------------------------------------ Title
  private buildTitle(): void {
    const t = this.title;
    t.innerHTML = `
      <div class="title-logo">
        <h1>CRYPTO <span>WORLD</span></h1>
        <h2>THE LIVING CHAIN</h2>
        <div class="chain"><i></i><i></i><i></i><i></i><i></i></div>
      </div>
      <div class="title-menu"></div>
      <div class="loading"></div>
      <div class="title-foot">A tiny planet of blockchain culture · WASD to move · Shift to run · E to interact · drag to look<br/>All markets, prices and transactions in this world are simulated.</div>`;
    t.querySelector('.loading')!.appendChild(this.loadingBar);
    this.root.appendChild(t);
  }

  setLoading(p: number): void {
    this.loadingBar.style.width = `${Math.round(p * 100)}%`;
    if (p >= 1) setTimeout(() => this.title.querySelector('.loading')?.classList.add('hidden'), 400);
  }

  showTitleMenu(hasSave: boolean): void {
    const menu = this.title.querySelector('.title-menu')!;
    menu.innerHTML = '';
    const play = el('button', 'btn primary', hasSave ? 'CONTINUE' : 'PLAY');
    play.onclick = () => this.onPlay();
    menu.appendChild(play);
    if (hasSave) {
      const nw = el('button', 'btn', 'NEW GAME');
      nw.onclick = () => {
        if (confirm('Start a new game? Your current progress will be replaced.')) this.onNewGame();
      };
      menu.appendChild(nw);
    }
    const st = el('button', 'btn ghost', 'SETTINGS');
    st.onclick = () => this.onOpenSettings();
    menu.appendChild(st);
    setTimeout(() => (play as HTMLButtonElement).focus(), 50);
  }

  hideTitle(): void {
    this.title.classList.add('fade');
    setTimeout(() => this.title.classList.add('hidden'), 1300);
  }

  get titleVisible(): boolean {
    return !this.title.classList.contains('hidden') && !this.title.classList.contains('fade');
  }

  // ------------------------------------------------------------------ HUD
  private buildHud(): void {
    const tx = el('div');
    tx.append(this.trackerTitle, this.trackerObj, this.trackerDist);
    this.tracker.append(this.trackerArrow, tx);
    const btns = el('div', 'hud-buttons');
    const j = el('button', 'icon-btn', ICONS.journal);
    j.title = 'Journal (J / Tab)';
    j.onclick = () => this.onOpenJournal();
    const s = el('button', 'icon-btn', ICONS.settings);
    s.title = 'Settings (Esc)';
    s.onclick = () => this.onOpenSettings();
    btns.append(j, s);
    this.hud.append(this.tracker, btns, this.prompt, this.toasts, this.banner, this.clockEl);
    this.root.appendChild(this.hud);
  }

  showHud(on: boolean): void {
    this.hud.classList.toggle('off', !on);
  }

  private lastTracker = '';
  setTracker(info: { mission: string; objective: string; dist: number | null; angle: number | null; here: boolean } | null): void {
    if (!info) {
      this.tracker.classList.add('empty');
      this.lastTracker = '';
      return;
    }
    this.tracker.classList.remove('empty');
    const key = `${info.mission}|${info.objective}`;
    if (key !== this.lastTracker) {
      this.trackerTitle.textContent = info.mission;
      this.trackerObj.textContent = info.objective;
      this.lastTracker = key;
    }
    const d = info.dist === null ? '' : info.here ? 'You are here' : info.dist < 1000 ? `${Math.round(info.dist)} m away` : '';
    if (this.trackerDist.textContent !== d) this.trackerDist.textContent = d;
    const here = info.here || info.angle === null;
    this.trackerArrow.classList.toggle('here', here);
    if (here) {
      if (!this.trackerArrow.dataset.here) {
        this.trackerArrow.innerHTML = ICONS.here;
        this.trackerArrow.dataset.here = '1';
      }
    } else {
      if (this.trackerArrow.dataset.here) {
        this.trackerArrow.innerHTML = ICONS.arrow;
        delete this.trackerArrow.dataset.here;
      }
      (this.trackerArrow.firstElementChild as HTMLElement).style.transform = `rotate(${info.angle}rad)`;
    }
  }

  private lastPrompt = '';
  setPrompt(text: string | null, key = 'E'): void {
    const k = text ? `${key}|${text}` : '';
    if (k === this.lastPrompt) return;
    this.lastPrompt = k;
    if (!text) {
      this.prompt.classList.remove('show');
      return;
    }
    this.prompt.innerHTML = `<span class="key">${esc(key)}</span>${esc(text)}`;
    this.prompt.classList.add('show');
  }

  private toastQueue: [string, string, string, boolean, number][] = [];

  /** Shows a notification card; at most two are on screen, the rest wait their turn. */
  toast(kicker: string, title: string, body = '', big = false, ms = 3800): void {
    if (this.toasts.children.length >= 2) {
      this.toastQueue.push([kicker, title, body, big, ms]);
      // Keep the backlog short: older routine notices give way to newer ones.
      while (this.toastQueue.length > 4) {
        const i = this.toastQueue.findIndex((q) => !q[3]);
        this.toastQueue.splice(i < 0 ? 0 : i, 1);
      }
      return;
    }
    const t = el('div', `toast${big ? ' big' : ''}`, `<small>${esc(kicker)}</small><b>${esc(title)}</b>${body ? `<p>${esc(body)}</p>` : ''}`);
    this.toasts.appendChild(t);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => {
        t.remove();
        const next = this.toastQueue.shift();
        if (next) this.toast(...next);
      }, 450);
    }, ms);
  }

  regionBanner(name: string, sub: string): void {
    this.banner.innerHTML = `<b>${esc(name)}</b><span>${esc(sub)}</span>`;
    this.banner.classList.add('show');
    clearTimeout((this.banner as any)._t);
    (this.banner as any)._t = setTimeout(() => this.banner.classList.remove('show'), 3200);
  }

  setClock(text: string): void {
    if (this.clockEl.textContent !== text) this.clockEl.textContent = text;
  }

  setPerf(text: string | null): void {
    this.perfEl.classList.toggle('hidden', text === null);
    if (text !== null) this.perfEl.textContent = text;
  }

  setFade(on: boolean): void {
    this.fade.classList.toggle('on', on);
  }

  // ------------------------------------------------------------------ Dialogue
  private buildDialogue(): void {
    this.dlg.append(this.dlgName, this.dlgText, this.dlgChoices, this.dlgFoot);
    this.dlg.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.choice, button')) return;
      this.onDialogueAdvance();
    });
    this.root.appendChild(this.dlg);
  }

  get dialogueOpen(): boolean {
    return this.dlg.classList.contains('show');
  }

  get typingDone(): boolean {
    return this.typing >= this.fullText.length;
  }

  showDialogue(v: DialogueView): void {
    this.dlg.classList.add('show');
    this.dlg.classList.toggle('player', v.kind === 'player');
    this.dlg.classList.toggle('object', v.kind === 'object');
    this.dlgName.innerHTML = `${esc(v.speaker)}${v.subtitle ? `<small>${esc(v.subtitle)}</small>` : ''}`;
    this.fullText = v.text;
    this.typing = 0;
    this.currentChoices = v.choices;
    this.selChoice = 0;
    this.dlgChoices.innerHTML = '';
    this.dlgChoices.classList.add('hidden');
    this.renderTyping();
    this.dlgFoot.innerHTML = '';
    const skip = el('button', '', 'Skip ⏭');
    skip.onclick = () => this.onDialogueSkip();
    const next = el('span', 'next', v.choices.length ? 'Choose a reply' : 'E / Space ▸');
    this.dlgFoot.append(skip, next);
  }

  /** Finishes the typewriter instantly (first press of E while text is still appearing). */
  completeTyping(): void {
    this.typing = this.fullText.length;
    this.renderTyping();
  }

  private renderTyping(): void {
    const shown = this.fullText.slice(0, Math.floor(this.typing));
    // Avoid half-open code spans while typing.
    const ticks = (shown.match(/`/g) || []).length;
    this.dlgText.innerHTML = richText(ticks % 2 ? shown + '`' : shown);
    if (this.typing >= this.fullText.length && this.currentChoices.length && this.dlgChoices.classList.contains('hidden')) {
      this.dlgChoices.classList.remove('hidden');
      this.currentChoices.forEach((c, i) => {
        const b = el('button', `choice${i === this.selChoice ? ' sel' : ''}`, `<span class="key">${i + 1}</span>${richText(c.text)}`);
        b.onclick = () => this.onDialogueChoice(c.index);
        this.dlgChoices.appendChild(b);
      });
    }
  }

  moveChoice(delta: number): void {
    if (!this.currentChoices.length) return;
    this.selChoice = (this.selChoice + delta + this.currentChoices.length) % this.currentChoices.length;
    [...this.dlgChoices.children].forEach((c, i) => c.classList.toggle('sel', i === this.selChoice));
  }

  get selectedChoice(): number | null {
    return this.currentChoices.length ? this.currentChoices[this.selChoice].index : null;
  }

  choiceByNumber(n: number): number | null {
    return this.currentChoices[n - 1]?.index ?? null;
  }

  get hasChoices(): boolean {
    return this.currentChoices.length > 0;
  }

  hideDialogue(): void {
    this.dlg.classList.remove('show');
  }

  update(dt: number, textSpeed = 55): void {
    if (this.dialogueOpen && this.typing < this.fullText.length) {
      this.typing = Math.min(this.fullText.length, this.typing + dt * textSpeed);
      this.typeTimer += dt;
      this.renderTyping();
    }
    if (this.modalKind === 'screen' && this.screenCanvas && this.screenKind) {
      this.screenT += dt;
      const ctx = this.screenCanvas.getContext('2d')!;
      drawScreen(this.screenKind, ctx, 0, 0, this.screenCanvas.width, this.screenCanvas.height, this.screenT);
    }
  }

  // ------------------------------------------------------------------ Modals
  private openModal(card: HTMLElement, kind: UI['modalKind']): void {
    this.modal.innerHTML = '';
    this.modal.appendChild(card);
    this.modal.classList.remove('hidden');
    requestAnimationFrame(() => this.modal.classList.add('show'));
    this.modalKind = kind;
  }

  closeModal(): void {
    if (this.modalKind === 'none') return;
    const k = this.modalKind;
    this.modal.classList.remove('show');
    this.modalKind = 'none';
    this.screenCanvas = null;
    setTimeout(() => {
      if (this.modalKind === 'none') this.modal.classList.add('hidden');
    }, 260);
    this.onModalClosed(k);
  }

  private card(cls: string, kicker: string, title: string): HTMLElement {
    const c = el('div', `card ${cls}`);
    c.innerHTML = `${kicker ? `<div class="kicker">${esc(kicker)}</div>` : ''}<h3>${esc(title)}</h3>`;
    const x = el('button', 'icon-btn close', ICONS.close);
    x.onclick = () => this.closeModal();
    c.appendChild(x);
    return c;
  }

  private actions(c: HTMLElement, hint = 'E / Esc to close'): void {
    const a = el('div', 'actions', `<span class="hint">${esc(hint)}</span>`);
    const ok = el('button', 'btn small primary', 'Close');
    ok.onclick = () => this.closeModal();
    a.appendChild(ok);
    c.appendChild(a);
  }

  openDoc(doc: Doc, kicker = ''): void {
    const c = this.card(doc.style ?? '', kicker, doc.title);
    for (const p of doc.body) c.appendChild(el('p', '', richText(p)));
    this.actions(c);
    this.openModal(c, 'doc');
  }

  openSecret(def: SecretDef, found: number, total: number): void {
    const c = this.card('secret', `Discovery ${found} / ${total}`, def.title);
    for (const p of def.body) c.appendChild(el('p', '', richText(p)));
    this.actions(c);
    this.openModal(c, 'secret');
  }

  openScreen(kind: ScreenKind, title: string): void {
    const c = this.card('terminal', 'Simulated display', title);
    const cv = el('canvas', 'screen');
    cv.width = 640;
    cv.height = 400;
    c.appendChild(cv);
    c.appendChild(el('p', 'sim-note', 'All data on this screen is simulated for the game world — not live market information.'));
    this.actions(c);
    this.screenCanvas = cv;
    this.screenKind = kind;
    this.screenT = 0;
    this.openModal(c, 'screen');
  }

  /** Generic modal with arbitrary content (journal, settings). */
  openCustom(kind: 'journal' | 'settings', build: (card: HTMLElement) => void, cls = ''): HTMLElement {
    const c = el('div', `card ${cls}`);
    build(c);
    const x = el('button', 'icon-btn close', ICONS.close);
    x.onclick = () => this.closeModal();
    c.appendChild(x);
    this.openModal(c, kind);
    return c;
  }

  showCredits(lines: string[], onDone: () => void): void {
    this.credits.innerHTML = `<div><h1>THE LIVING CHAIN</h1>${lines.map((l) => `<p>${esc(l)}</p>`).join('')}<div style="margin-top:22px"></div></div>`;
    const b = el('button', 'btn primary', 'KEEP EXPLORING');
    b.onclick = () => {
      this.credits.classList.remove('show');
      setTimeout(() => this.credits.classList.add('hidden'), 1500);
      onDone();
    };
    this.credits.firstElementChild!.appendChild(b);
    this.credits.classList.remove('hidden');
    requestAnimationFrame(() => this.credits.classList.add('show'));
  }

  get creditsOpen(): boolean {
    return !this.credits.classList.contains('hidden');
  }
}

export { el, esc };
