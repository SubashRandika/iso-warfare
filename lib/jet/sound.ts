// Synthesised sound: two turbofans (whine + roar + afterburner rumble) and small mechanical cues.
// Audio starts only after a user gesture; every call is safe to make before that (it does nothing).

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private eng: { whine: OscillatorNode; whineG: GainNode; whineF: BiquadFilterNode; roarF: BiquadFilterNode; roarG: GainNode; rumbleG: GainNode } | null = null;
  enabled = true;

  /** Call from a pointer or key handler. */
  wake() {
    if (!this.enabled) return;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain(); this.master.gain.value = 0.55; this.master.connect(this.ctx.destination);
        this.buildEngine();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch { this.ctx = null; }
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.05);
    if (on) this.wake();
  }

  private noise(seconds = 2) {
    const c = this.ctx!, b = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.6 + last * 3; }
    const s = c.createBufferSource(); s.buffer = b; s.loop = true; return s;
  }

  private buildEngine() {
    const c = this.ctx!, out = this.master!;
    const whine = c.createOscillator(); whine.type = 'sawtooth'; whine.frequency.value = 80;
    const whineF = c.createBiquadFilter(); whineF.type = 'bandpass'; whineF.frequency.value = 900; whineF.Q.value = 6;
    const whineG = c.createGain(); whineG.gain.value = 0;
    whine.connect(whineF).connect(whineG).connect(out); whine.start();
    const roar = this.noise(); const roarF = c.createBiquadFilter(); roarF.type = 'bandpass'; roarF.frequency.value = 500; roarF.Q.value = 0.7;
    const roarG = c.createGain(); roarG.gain.value = 0;
    roar.connect(roarF).connect(roarG).connect(out); roar.start();
    const rum = this.noise(3); const rumF = c.createBiquadFilter(); rumF.type = 'lowpass'; rumF.frequency.value = 160;
    const rumbleG = c.createGain(); rumbleG.gain.value = 0;
    rum.connect(rumF).connect(rumbleG).connect(out); rum.start();
    this.eng = { whine, whineG, whineF, roarF, roarG, rumbleG };
  }

  /** rpm 0..1, ab 0..1 */
  engine(rpm: number, ab: number) {
    if (!this.ctx || !this.eng) return;
    const t = this.ctx.currentTime, e = this.eng;
    e.whine.frequency.setTargetAtTime(70 + rpm * 520, t, 0.1);
    e.whineF.frequency.setTargetAtTime(600 + rpm * 2600, t, 0.1);
    e.whineG.gain.setTargetAtTime(rpm * 0.035, t, 0.1);
    e.roarF.frequency.setTargetAtTime(300 + rpm * 900 - ab * 250, t, 0.15);
    e.roarG.gain.setTargetAtTime(rpm * rpm * 0.16 + ab * 0.12, t, 0.15);
    e.rumbleG.gain.setTargetAtTime(rpm * 0.06 + ab * 0.5, t, 0.2);
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
  button() { this.tone(1400, 0.05, 0.05, { type: 'square' }); }
  thunk(at = 0) { this.tone(110, 0.16, 0.22, { type: 'triangle', to: 55, at }); }
  /** electric actuator run: a rising/falling whir for `dur` seconds */
  motor(dur: number, up = true) {
    if (!this.ctx || !this.enabled) return;
    this.tone(up ? 180 : 260, dur, 0.035, { type: 'sawtooth', to: up ? 260 : 180 });
    this.thunk(dur);
  }
  chime(on: boolean) { this.tone(on ? 880 : 660, 0.12, 0.05); this.tone(on ? 1320 : 440, 0.16, 0.04, { at: 0.08 }); }

  dispose() { try { void this.ctx?.close(); } catch { /* ignore */ } this.ctx = null; this.eng = null; }
}
