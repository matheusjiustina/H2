import type { SettingsData } from "../core/Settings";

export interface DialogOption {
  label: string;
  action: () => void;
  disabled?: boolean;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", html = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * DOM overlay: minimal HUD, prompts, toasts, subtitles, dialogs and menus.
 * The terminal itself lives on the 3D monitor, not here.
 */
export class UI {
  readonly root: HTMLDivElement;
  private crosshair = el("div", "crosshair");
  private prompt = el("div", "prompt");
  private hud = el("div", "hud");
  private objective = el("div", "objective");
  private toasts = el("div", "toasts");
  private subtitle = el("div", "subtitle");
  private dialog = el("div", "dialog");
  private panel = el("div", "panel-wrap");
  private fade = el("div", "fade");
  private fps = el("div", "fps");
  private hint = el("div", "center-hint");
  private touch = el("div", "touch");
  dialogOptions: DialogOption[] = [];
  panelOpen: string | null = null;
  private subUntil = 0;
  private hudCache = "";
  onPanelClose: (() => void) | null = null;
  touchMode = false;
  touchStick = { x: 0, y: 0 };
  touchLook = { dx: 0, dy: 0 };
  onTouchButton: ((code: string, down: boolean) => void) | null = null;

  constructor(root: HTMLDivElement) {
    this.root = root;
    this.objective.addEventListener("click", () => this.onObjectiveToggle?.());
    root.append(this.crosshair, this.prompt, this.hud, this.objective, this.toasts, this.subtitle, this.dialog, this.hint, this.fps, this.touch, this.fade, this.panel);
    this.dialog.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button[data-i]") as HTMLButtonElement | null;
      if (b) this.chooseDialog(Number(b.dataset.i));
    });
  }

  // ------------------------------------------------------------- HUD

  setPrompt(text: string | null, hint?: string | null, key = "E") {
    if (!text) {
      this.prompt.classList.remove("on");
      return;
    }
    const html = `<span class="key">${esc(key)}</span><span class="ptext">${esc(text)}</span>${hint ? `<span class="phint">${esc(hint)}</span>` : ""}`;
    if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
    this.prompt.classList.add("on");
  }

  setCrosshair(mode: "dot" | "hidden" | "active") {
    this.crosshair.className = `crosshair ${mode}`;
  }

  setHud(parts: { credits: number; rep: number; title: string; clock: string; night: number; session: string | null; sessionLow: boolean; cash: string; show: boolean }) {
    const key = JSON.stringify(parts);
    if (key === this.hudCache) return;
    this.hudCache = key;
    this.hud.classList.toggle("on", parts.show);
    this.hud.innerHTML = `<span class="hud-clock">${esc(parts.clock)} <em>Night ${parts.night}</em></span><span class="hud-sep"></span><span class="hud-cr">◆ ${parts.credits} CR</span><span class="hud-sep"></span><span>REP ${parts.rep} <em>${esc(parts.title)}</em></span><span class="hud-sep"></span><span class="hud-cash">${esc(parts.cash)}</span>${parts.session ? `<span class="hud-sep"></span><span class="${parts.sessionLow ? "low" : ""}">${esc(parts.session)}</span>` : ""}`;
  }

  /** Tap/click on the objective line (hide / show). */
  onObjectiveToggle: (() => void) | null = null;
  private objKey = "";

  /** Current objective only; `collapsed` leaves a small pill so it can be brought back. */
  setObjective(text: string | null, hint: string | null = null, collapsed = false) {
    const key = `${text}|${hint}|${collapsed}`;
    if (key === this.objKey) return;
    this.objKey = key;
    if (!text) {
      this.objective.classList.remove("on");
      return;
    }
    this.objective.classList.toggle("collapsed", collapsed);
    this.objective.innerHTML = collapsed
      ? `<span class="obj-dot"></span><span class="obj-hint">Objective • O</span>`
      : `<span class="obj-dot"></span><span>${esc(text)}</span>${hint ? `<span class="obj-hint">${esc(hint)}</span>` : ""}`;
    this.objective.classList.add("on");
  }

  toast(text: string, kind: "info" | "good" | "bad" | "rep" = "info") {
    const t = el("div", `toast ${kind}`, esc(text));
    this.toasts.prepend(t);
    while (this.toasts.children.length > 4) this.toasts.lastElementChild?.remove();
    setTimeout(() => t.classList.add("out"), 3600);
    setTimeout(() => t.remove(), 4200);
  }

  showSubtitle(name: string, color: string, text: string, now: number, dur = 4.5) {
    this.subtitle.innerHTML = `<b style="color:${color}">${esc(name)}</b> ${esc(text)}`;
    this.subtitle.classList.add("on");
    this.subUntil = now + dur;
  }

  centerHint(text: string | null) {
    if (!text) {
      this.hint.classList.remove("on");
      return;
    }
    this.hint.innerHTML = text;
    this.hint.classList.add("on");
  }

  setFps(v: number | null) {
    this.fps.style.display = v === null ? "none" : "block";
    if (v !== null) this.fps.textContent = `${v.toFixed(0)} fps`;
  }

  tick(now: number) {
    if (this.subUntil && now > this.subUntil) {
      this.subtitle.classList.remove("on");
      this.subUntil = 0;
    }
  }

  fadeTo(opacity: number, ms = 600) {
    this.fade.style.transition = `opacity ${ms}ms ease`;
    this.fade.style.opacity = String(opacity);
    this.fade.style.pointerEvents = opacity > 0.5 ? "auto" : "none";
  }

  // ------------------------------------------------------------- dialog

  showDialog(name: string, color: string, text: string, options: DialogOption[]) {
    this.dialogOptions = options;
    this.dialog.innerHTML = `<div class="dlg-name" style="color:${color}">${esc(name)}</div><div class="dlg-text">${esc(text)}</div><div class="dlg-opts">${options
      .map((o, i) => `<button data-i="${i}" ${o.disabled ? "disabled" : ""}><span class="key">${i + 1}</span>${esc(o.label)}</button>`)
      .join("")}</div>`;
    this.dialog.classList.add("on");
  }

  updateDialogText(text: string) {
    const t = this.dialog.querySelector(".dlg-text");
    if (t) t.textContent = text;
  }

  hideDialog() {
    this.dialog.classList.remove("on");
    this.dialogOptions = [];
  }

  get dialogOpen() {
    return this.dialog.classList.contains("on");
  }

  chooseDialog(i: number) {
    const o = this.dialogOptions[i];
    if (o && !o.disabled) o.action();
  }

  // ------------------------------------------------------------- panels

  openPanel(id: string, html: string, onBind?: (root: HTMLElement) => void) {
    this.panelOpen = id;
    this.panel.innerHTML = `<div class="panel ${id}">${html}</div>`;
    this.panel.classList.add("on");
    onBind?.(this.panel);
  }

  closePanel() {
    if (!this.panelOpen) return;
    this.panelOpen = null;
    this.panel.classList.remove("on");
    this.panel.innerHTML = "";
    this.onPanelClose?.();
  }

  settingsHtml(s: SettingsData): string {
    const range = (id: string, label: string, min: number, max: number, step: number, v: number) =>
      `<label class="row"><span>${label}</span><input type="range" data-set="${id}" min="${min}" max="${max}" step="${step}" value="${v}"><output>${v}</output></label>`;
    const check = (id: string, label: string, v: boolean) => `<label class="row"><span>${label}</span><input type="checkbox" data-set="${id}" ${v ? "checked" : ""}></label>`;
    return `
      ${range("sensitivity", "Mouse sensitivity", 0.2, 3, 0.05, s.sensitivity)}
      ${check("invertY", "Invert Y", s.invertY)}
      ${check("headBob", "Head bob", s.headBob)}
      ${range("fov", "Field of view", 60, 90, 1, s.fov)}
      ${range("renderScale", "Render resolution", 0.5, 1, 0.05, s.renderScale)}
      <label class="row"><span>Shadows</span><select data-set="shadows">${["off", "low", "high"].map((o) => `<option ${o === s.shadows ? "selected" : ""}>${o}</option>`).join("")}</select></label>
      ${range("volume", "Master volume", 0, 1, 0.05, s.volume)}
      ${range("ambience", "Ambience (rain, AC, fans)", 0, 1, 0.05, s.ambience)}
      ${range("effects", "Effects (keys, printer, props)", 0, 1, 0.05, s.effects)}
      ${range("voices", "Voices", 0, 1, 0.05, s.voices)}
      ${check("showFps", "Show FPS", s.showFps)}`;
  }

  bindSettings(root: HTMLElement, onChange: (k: keyof SettingsData, v: unknown) => void) {
    root.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-set]").forEach((inp) => {
      const k = inp.dataset.set as keyof SettingsData;
      const handler = () => {
        let v: unknown;
        if (inp instanceof HTMLInputElement && inp.type === "checkbox") v = inp.checked;
        else if (inp instanceof HTMLInputElement && inp.type === "range") {
          v = Number(inp.value);
          const out = inp.parentElement?.querySelector("output");
          if (out) out.textContent = String(v);
        } else v = inp.value;
        onChange(k, v);
      };
      inp.addEventListener("input", handler);
      inp.addEventListener("change", handler);
    });
  }

  // ------------------------------------------------------------- touch

  enableTouch() {
    this.touchMode = true;
    this.root.classList.add("touch-on");
    this.touch.innerHTML = `
      <div class="stick"><div class="knob"></div></div>
      <div class="look-zone"></div>
      <div class="tbtns">
        <button data-code="KeyE">E</button>
        <button data-code="Mouse0">USE</button>
        <button data-code="KeyQ">DROP</button>
        <button data-code="Mouse2">LOOK</button>
        <button data-code="Escape">☰</button>
      </div>`;
    const stick = this.touch.querySelector(".stick") as HTMLDivElement;
    const knob = this.touch.querySelector(".knob") as HTMLDivElement;
    let sid: number | null = null;
    let cx = 0;
    let cy = 0;
    stick.addEventListener("pointerdown", (e) => {
      sid = e.pointerId;
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      stick.setPointerCapture(e.pointerId);
    });
    stick.addEventListener("pointermove", (e) => {
      if (e.pointerId !== sid) return;
      const dx = Math.max(-50, Math.min(50, e.clientX - cx));
      const dy = Math.max(-50, Math.min(50, e.clientY - cy));
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.touchStick.x = dx / 50;
      this.touchStick.y = dy / 50;
    });
    const end = () => {
      sid = null;
      knob.style.transform = "";
      this.touchStick.x = this.touchStick.y = 0;
    };
    stick.addEventListener("pointerup", end);
    stick.addEventListener("pointercancel", end);
    const look = this.touch.querySelector(".look-zone") as HTMLDivElement;
    let lid: number | null = null;
    let lx = 0;
    let ly = 0;
    look.addEventListener("pointerdown", (e) => {
      lid = e.pointerId;
      lx = e.clientX;
      ly = e.clientY;
      look.setPointerCapture(e.pointerId);
    });
    look.addEventListener("pointermove", (e) => {
      if (e.pointerId !== lid) return;
      this.touchLook.dx += (e.clientX - lx) * 1.6;
      this.touchLook.dy += (e.clientY - ly) * 1.6;
      lx = e.clientX;
      ly = e.clientY;
    });
    look.addEventListener("pointerup", () => (lid = null));
    this.touch.querySelectorAll<HTMLButtonElement>("button[data-code]").forEach((b) => {
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.onTouchButton?.(b.dataset.code!, true);
      });
      b.addEventListener("pointerup", (e) => {
        e.preventDefault();
        this.onTouchButton?.(b.dataset.code!, false);
      });
    });
  }

  setTouchVisible(mode: "walk" | "terminal" | "none") {
    this.touch.style.display = this.touchMode && mode !== "none" ? "block" : "none";
    this.touch.classList.toggle("terminal-only", mode === "terminal");
    const esc = this.touch.querySelector<HTMLButtonElement>("button[data-code=Escape]");
    if (esc) esc.textContent = mode === "terminal" ? "STAND UP" : "☰";
  }
}
