/**
 * Sound hooks. Every satisfying moment already calls sfx.play('<cue>'),
 * but no audio ships in this version. To add sound later:
 *
 *   sfx.register('harvest', '/sfx/harvest.mp3');
 *   sfx.enable();
 *
 * Cues used by the game:
 *   uiOpen, uiTap, uiClose, plant, seedImpact, stageUp, ready,
 *   poke, harvest, tokenRise, vault
 */
class SfxService {
  constructor() {
    this.enabled = false;
    this.cues = new Map();
    this.ctx = null;
    this.buffers = new Map();
  }

  register(name, url, { volume = 1 } = {}) {
    this.cues.set(name, { url, volume });
  }

  async enable() {
    this.enabled = true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = this.ctx || new AC();
    await Promise.all(
      [...this.cues].map(async ([name, cue]) => {
        try {
          const res = await fetch(cue.url);
          this.buffers.set(name, await this.ctx.decodeAudioData(await res.arrayBuffer()));
        } catch {
          /* missing file: cue stays silent */
        }
      }),
    );
  }

  disable() {
    this.enabled = false;
  }

  play(name, { rate = 1, volume = 1 } = {}) {
    if (!this.enabled || !this.ctx) return;
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    gain.gain.value = volume * (this.cues.get(name)?.volume ?? 1);
    src.connect(gain).connect(this.ctx.destination);
    src.start();
  }
}

export const sfx = new SfxService();
