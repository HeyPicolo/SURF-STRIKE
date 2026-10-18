// Áudio 100% sintetizado com WebAudio (sem arquivos de som de terceiros).
import type { WeaponId } from '../../../shared/config/weapons';

export class Sfx {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfx!: GainNode;
  private noiseBuf!: AudioBuffer;
  private wind: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  volume = 0.7;
  sfxVolume = 0.9;

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      this.ctx = new AC();
    } catch { return; }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    comp.connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxVolume;
    this.sfx.connect(comp);
    const len = ctx.sampleRate * 1.5;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolumes(master: number, sfx: number) {
    this.volume = master; this.sfxVolume = sfx;
    if (this.ctx) { this.master.gain.value = master; this.sfx.gain.value = sfx; }
  }

  private out(pan = 0, gain = 1): AudioNode | null {
    if (!this.ctx) return null;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    if (pan !== 0 && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p); p.connect(this.sfx);
    } else g.connect(this.sfx);
    return g;
  }

  private noise(dest: AudioNode, t0: number, dur: number, f0: number, f1: number, q: number, vol: number, type: BiquadFilterType = 'bandpass') {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.05);
  }

  private tone(dest: AudioNode, t0: number, dur: number, f0: number, f1: number, vol: number, type: OscillatorType = 'sine') {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  shot(w: WeaponId, pan = 0, gain = 1) {
    const d = this.out(pan, gain); if (!d) return;
    const t = this.ctx!.currentTime;
    switch (w) {
      case 'pistol': this.noise(d, t, 0.12, 3200, 700, 0.8, 0.9); this.tone(d, t, 0.08, 220, 70, 0.6, 'triangle'); break;
      case 'rifle': this.noise(d, t, 0.16, 2400, 400, 0.7, 1.0); this.tone(d, t, 0.12, 160, 50, 0.8, 'triangle'); break;
      case 'smg': this.noise(d, t, 0.09, 3600, 900, 0.9, 0.75); this.tone(d, t, 0.06, 260, 90, 0.4, 'square'); break;
      case 'shotgun': this.noise(d, t, 0.32, 1600, 160, 0.6, 1.2); this.tone(d, t, 0.22, 110, 38, 1.0, 'triangle'); break;
      case 'taser': this.noise(d, t, 0.35, 5000, 2500, 3, 0.6); this.tone(d, t, 0.32, 1200, 900, 0.25, 'sawtooth'); this.tone(d, t, 0.3, 60, 55, 0.4, 'square'); break;
      case 'sniper': this.noise(d, t, 0.55, 2000, 120, 0.5, 1.3); this.tone(d, t, 0.3, 90, 30, 1.0, 'sawtooth'); this.noise(d, t + 0.05, 0.6, 600, 200, 0.4, 0.3, 'lowpass'); break;
    }
  }

  reload() {
    const d = this.out(0, 0.6); if (!d) return;
    const t = this.ctx!.currentTime;
    this.noise(d, t, 0.05, 2500, 2000, 4, 0.6); this.tone(d, t + 0.02, 0.04, 900, 600, 0.3, 'square');
    this.noise(d, t + 0.45, 0.06, 1800, 1500, 4, 0.7); this.tone(d, t + 0.5, 0.05, 700, 500, 0.3, 'square');
  }
  empty() { const d = this.out(0, 0.5); if (!d) return; this.tone(d, this.ctx!.currentTime, 0.04, 1400, 1200, 0.3, 'square'); }
  switchWeapon() { const d = this.out(0, 0.4); if (!d) return; this.noise(d, this.ctx!.currentTime, 0.07, 3000, 1500, 3, 0.4); }

  knife(hit: 'player' | 'world' | 'none', heavy: boolean, pan = 0, gain = 1) {
    const d = this.out(pan, gain * 0.8); if (!d) return;
    const t = this.ctx!.currentTime;
    // whoosh
    this.noise(d, t, heavy ? 0.28 : 0.16, heavy ? 900 : 1600, heavy ? 3000 : 5000, 1.4, 0.55);
    if (hit === 'player') { this.noise(d, t + 0.04, 0.12, 700, 250, 1, 0.9, 'lowpass'); this.tone(d, t + 0.04, 0.1, 160, 70, 0.5); }
    else if (hit === 'world') { this.tone(d, t + 0.03, 0.12, 2600, 2200, 0.25, 'triangle'); this.noise(d, t + 0.03, 0.06, 4000, 3000, 3, 0.4); }
  }
  slide(phase: 'start' | 'cancel' | 'end') {
    const d = this.out(0, 0.45); if (!d) return;
    const t = this.ctx!.currentTime;
    if (phase === 'start') this.noise(d, t, 0.55, 500, 180, 0.7, 0.7, 'lowpass');
    else if (phase === 'cancel') { this.noise(d, t, 0.08, 1200, 600, 1, 0.5); this.tone(d, t, 0.06, 300, 520, 0.2, 'triangle'); }
  }

  pickup() {
    const d = this.out(0, 0.5); if (!d) return;
    const t = this.ctx!.currentTime;
    this.tone(d, t, 0.12, 660, 660, 0.35, 'triangle'); this.tone(d, t + 0.07, 0.18, 990, 990, 0.35, 'triangle');
  }
  hitmarker(head: boolean) {
    const d = this.out(0, 0.55); if (!d) return;
    const t = this.ctx!.currentTime;
    if (head) { this.tone(d, t, 0.18, 1900, 1700, 0.4, 'sine'); this.tone(d, t, 0.12, 2800, 2600, 0.2, 'sine'); }
    else this.tone(d, t, 0.06, 1200, 900, 0.3, 'square');
  }
  kill() {
    const d = this.out(0, 0.6); if (!d) return;
    const t = this.ctx!.currentTime;
    [0, 0.06, 0.12].forEach((dt, i) => this.tone(d, t + dt, 0.14, 520 * (1 + i * 0.26), 520 * (1 + i * 0.26), 0.3, 'triangle'));
  }
  hurt() { const d = this.out(0, 0.6); if (!d) return; const t = this.ctx!.currentTime; this.noise(d, t, 0.12, 500, 200, 1, 0.8, 'lowpass'); this.tone(d, t, 0.1, 140, 80, 0.5); }
  ability(cls: string) {
    const d = this.out(0, 0.7); if (!d) return;
    const t = this.ctx!.currentTime;
    if (cls === 'runner') { this.noise(d, t, 0.4, 600, 4000, 1.2, 0.8); this.tone(d, t, 0.3, 200, 800, 0.3, 'sawtooth'); }
    else if (cls === 'jumper') { this.tone(d, t, 0.35, 1600, 200, 0.4, 'sine'); this.tone(d, t + 0.05, 0.3, 2400, 300, 0.2, 'triangle'); }
    else if (cls === 'predator') { this.tone(d, t, 0.8, 70, 55, 0.7, 'sawtooth'); this.tone(d, t + 0.25, 0.6, 70, 55, 0.6, 'sawtooth'); }
    else { this.noise(d, t, 0.6, 300, 120, 0.8, 1.0, 'lowpass'); this.tone(d, t, 0.5, 90, 45, 0.9, 'sawtooth'); }
  }
  explosion(pan = 0, gain = 1, kind = 'he') {
    const d = this.out(pan, gain); if (!d) return;
    const t = this.ctx!.currentTime;
    if (kind === 'smoke') { this.noise(d, t, 1.2, 1200, 300, 0.4, 0.6, 'lowpass'); return; }
    if (kind === 'impulse') { this.tone(d, t, 0.35, 120, 900, 0.6, 'sine'); this.noise(d, t, 0.3, 4000, 800, 1, 0.5); return; }
    this.noise(d, t, 0.9, 900, 60, 0.5, 1.4, 'lowpass'); this.tone(d, t, 0.6, 80, 28, 1.2, 'sine');
  }
  jump() { const d = this.out(0, 0.15); if (!d) return; this.noise(d, this.ctx!.currentTime, 0.06, 800, 400, 1, 0.3, 'lowpass'); }
  land(speed: number) { const d = this.out(0, Math.min(0.6, speed / 1200)); if (!d) return; const t = this.ctx!.currentTime; this.noise(d, t, 0.12, 300, 80, 0.8, 1, 'lowpass'); this.tone(d, t, 0.1, 90, 50, 0.6); }
  teleport() { const d = this.out(0, 0.5); if (!d) return; const t = this.ctx!.currentTime; this.tone(d, t, 0.3, 300, 1800, 0.3, 'sine'); this.noise(d, t, 0.3, 5000, 1000, 2, 0.3); }
  jumppad() { const d = this.out(0, 0.5); if (!d) return; const t = this.ctx!.currentTime; this.tone(d, t, 0.25, 180, 720, 0.5, 'square'); }
  beep(high = false) { const d = this.out(0, 0.5); if (!d) return; this.tone(d, this.ctx!.currentTime, high ? 0.35 : 0.15, high ? 1320 : 880, high ? 1320 : 880, 0.35, 'square'); }
  victory() {
    const d = this.out(0, 0.6); if (!d) return; const t = this.ctx!.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => this.tone(d, t + i * 0.12, 0.4, f, f, 0.3, 'triangle'));
  }
  defeat() {
    const d = this.out(0, 0.6); if (!d) return; const t = this.ctx!.currentTime;
    [440, 392, 330, 262].forEach((f, i) => this.tone(d, t + i * 0.16, 0.45, f, f * 0.98, 0.3, 'triangle'));
  }
  uiClick() { const d = this.out(0, 0.3); if (!d) return; this.tone(d, this.ctx!.currentTime, 0.05, 1000, 800, 0.2, 'triangle'); }

  /** Continuous wind proportional to speed (surf feel). */
  setWind(speed: number) {
    if (!this.ctx) return;
    if (!this.wind) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.Q.value = 0.6; filter.frequency.value = 400;
      const gain = ctx.createGain(); gain.gain.value = 0;
      src.connect(filter); filter.connect(gain); gain.connect(this.sfx);
      src.start();
      this.wind = { src, gain, filter };
    }
    const k = Math.max(0, Math.min(1, (speed - 350) / 2200));
    this.wind.gain.gain.setTargetAtTime(k * 0.35, this.ctx.currentTime, 0.15);
    this.wind.filter.frequency.setTargetAtTime(300 + k * 1600, this.ctx.currentTime, 0.2);
  }
}
