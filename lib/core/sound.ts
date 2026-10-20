// Synthesised sound shared by every model: short cues (buttons, actuators, clicks, shots) plus continuous
// "voices" a model plugs in (a turbofan, a diesel, a turbine). Audio starts only after a user gesture; every call
// is safe to make before that (it does nothing).

/** A continuous sound a model owns. build() runs once the audio context exists. */
export interface Voice { build(ctx: AudioContext, out: AudioNode, sound: Sound): void; dispose?(): void }

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices: Voice[] = [];
  enabled = true;

  get audio() { return this.ctx; }
  get out() { return this.master; }

  /** Call from a pointer or key handler. */
  wake() {
    if (!this.enabled) return;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain(); this.master.gain.value = 0.55; this.master.connect(this.ctx.destination);
        this.voices.forEach(v => v.build(this.ctx!, this.master!, this));
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch { this.ctx = null; }
  }

  /** Register a continuous voice (built now if audio is already running). */
  use<T extends Voice>(v: T): T {
    this.voices.push(v);
    if (this.ctx && this.master) v.build(this.ctx, this.master, this);
    return v;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.05);
    if (on) this.wake();
  }

  /** looping brown-ish noise source (not started) */
  noise(seconds = 2) {
    const c = this.ctx!, b = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.6 + last * 3; }
    const s = c.createBufferSource(); s.buffer = b; s.loop = true; return s;
  }

  tone(f: number, dur: number, peak = 0.08, o: { type?: OscillatorType; to?: number; at?: number } = {}) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, t = c.currentTime + (o.at ?? 0);
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type ?? 'sine'; osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!); osc.start(t); osc.stop(t + dur + 0.05);
  }
  /** filtered noise hit: gunshots, impacts, hydraulics venting */
  burst(dur: number, peak: number, o: { freq?: number; q?: number; type?: BiquadFilterType; at?: number; attack?: number } = {}) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, t = c.currentTime + (o.at ?? 0);
    const src = this.noise(Math.max(0.3, dur + 0.1)), f = c.createBiquadFilter(), g = c.createGain();
    f.type = o.type ?? 'bandpass'; f.frequency.value = o.freq ?? 1200; f.Q.value = o.q ?? 0.8;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + (o.attack ?? 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!); src.start(t); src.stop(t + dur + 0.05);
  }
  button() { this.tone(1400, 0.05, 0.05, { type: 'square' }); }
  /** a small metallic click (latches, levers, safeties) */
  click(at = 0, pitch = 1) { this.tone(2600 * pitch, 0.025, 0.06, { type: 'square', at }); this.tone(900 * pitch, 0.04, 0.04, { type: 'triangle', at }); }
  thunk(at = 0) { this.tone(110, 0.16, 0.22, { type: 'triangle', to: 55, at }); }
  /** electric actuator run: a rising/falling whir for `dur` seconds */
  motor(dur: number, up = true) {
    if (!this.ctx || !this.enabled) return;
    this.tone(up ? 180 : 260, dur, 0.035, { type: 'sawtooth', to: up ? 260 : 180 });
    this.thunk(dur);
  }
  chime(on: boolean) { this.tone(on ? 880 : 660, 0.12, 0.05); this.tone(on ? 1320 : 440, 0.16, 0.04, { at: 0.08 }); }

  dispose() {
    this.voices.forEach(v => { try { v.dispose?.(); } catch { /* ignore */ } });
    this.voices = [];
    try { void this.ctx?.close(); } catch { /* ignore */ }
    this.ctx = null; this.master = null;
  }
}
