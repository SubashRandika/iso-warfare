// Turbofan voice, synthesised from what a real jet engine sounds like, driven by rpm and afterburner 0..1:
//   roar      broadband jet-mixing noise (pink), low-passed lower at idle and opening up with thrust, slowly breathing
//   tearing   the hissing mid band that grows at high power
//   fan tone  the blade-passing tone of the fan, one per engine, slightly detuned so several engines beat
//   buzz-saw  the rasp of supersonic fan tips near full power (a tone at shaft rate, rich in harmonics)
//   whine     the core's high whine, loudest while spooling up, then masked by the roar
//   light-off a muffled thump as the fuel lights during start
//   reheat    afterburner: a deep low rumble plus crackle (sparse random pops)
// plus what the airframe adds: runway rumble on the ground roll, wind in flight, the tyre chirp at touchdown.
// Bigger engines (size > 1) turn slower: their tones sit lower. Everything goes through a short outdoor reverb.
// From the cockpit (cabin) the airframe and the helmet take the top off and most of the reverb, and the air
// conditioning hisses.
import type { Sound, Voice } from '../../../core/sound';

type N = {
  roarF: BiquadFilterNode; roarF2: BiquadFilterNode; roarG: GainNode; wob: GainNode;
  tearF: BiquadFilterNode; tearG: GainNode;
  fans: { o: OscillatorNode; f: BiquadFilterNode; g: GainNode; k: number }[];
  buzz: OscillatorNode; buzzF: BiquadFilterNode; buzzG: GainNode;
  whines: { o: OscillatorNode; g: GainNode; k: number }[];
  abG: GainNode; crackG: GainNode; abRoarG: GainNode;
  rumbleG: GainNode; windF: BiquadFilterNode; windG: GainNode;
  cabF: BiquadFilterNode; cabG: GainNode; wet: GainNode; ecsG: GainNode;
};

/** pink noise (Paul Kellet's filter), looped */
function pink(c: AudioContext, seconds: number) {
  const b = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate), d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
  }
  const s = c.createBufferSource(); s.buffer = b; s.loop = true; return s;
}
/** brown noise for deep rumble */
function brown(c: AudioContext, seconds: number) {
  const b = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  const s = c.createBufferSource(); s.buffer = b; s.loop = true; return s;
}
/** afterburner crackle: sparse pops of random size, each a few milliseconds long */
function crackle(c: AudioContext, seconds: number) {
  const b = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate), d = b.getChannelData(0), decay = Math.exp(-1 / (c.sampleRate * 0.0025));
  let env = 0, sign = 1;
  for (let i = 0; i < d.length; i++) {
    if (Math.random() < 0.0011) { env = 0.3 + Math.random() * 0.7; sign = -sign; }
    env *= decay; d[i] = sign * env * (0.6 + 0.4 * Math.random());
  }
  const s = c.createBufferSource(); s.buffer = b; s.loop = true; return s;
}
/** an outdoor impulse response: a short pre-delay, a few ground reflections, then a soft, dark decay */
function outdoors(c: AudioContext, seconds: number) {
  const n = Math.floor(c.sampleRate * seconds), b = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch); let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / c.sampleRate; if (t < 0.025) continue;
      lp += 0.25 * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * Math.exp(-(t - 0.025) / 0.45) * 0.6;
    }
    for (const [t, a] of [[0.04, 0.5], [0.075, 0.3], [0.11, 0.18]]) d[Math.floor((t + ch * 0.004) * c.sampleRate)] += a;
  }
  return b;
}

export class Turbofan implements Voice {
  private ctx: AudioContext | null = null;
  private snd: Sound | null = null;
  private n: N | null = null;
  private lastRpm = 0;

  /** `engines` sets how many fan tones beat together; `size` ≈ the airframe's size relative to a fighter */
  constructor(private engines = 2, private size = 1) {}

  build(c: AudioContext, out: AudioNode, snd: Sound) {
    this.ctx = c; this.snd = snd;
    const bus = c.createGain(), rev = c.createConvolver(), wet = c.createGain();
    rev.buffer = outdoors(c, 1.6); wet.gain.value = 0.25;
    const cabF = c.createBiquadFilter(), cabG = c.createGain(); cabF.type = 'lowpass'; cabF.frequency.value = 18000; cabF.Q.value = 0.5;
    bus.connect(cabF).connect(cabG).connect(out); cabG.connect(rev).connect(wet).connect(out);
    const noise = pink(c, 5), deep = brown(c, 4), pops = crackle(c, 3);
    noise.start(); deep.start(); pops.start();
    const gain = (v = 0) => { const g = c.createGain(); g.gain.value = v; return g; };
    const filt = (type: BiquadFilterType, f: number, q = 0.7) => { const x = c.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; };

    // roar: two low-passes in series for a steeper, more distant-sounding top end; a low shelf for body
    const roarF = filt('lowpass', 300, 0.5), roarF2 = filt('lowpass', 600, 0.5), body = filt('lowshelf', 180); body.gain.value = 6;
    const roarG = gain();
    noise.connect(roarF).connect(roarF2).connect(body).connect(roarG).connect(bus);
    // breathing: two slow, unrelated LFOs add a little movement to the roar's level
    const wob = gain();
    for (const f of [0.31, 0.77]) { const o = c.createOscillator(); o.frequency.value = f; o.connect(wob); o.start(); }
    wob.connect(roarG.gain);
    const tearF = filt('bandpass', 1400, 0.9), tearG = gain();
    noise.connect(tearF).connect(tearG).connect(bus);

    // fan tones: one per engine (up to four), detuned a fraction of a percent so they beat
    const nf = Math.min(4, Math.max(1, this.engines));
    const fans = Array.from({ length: nf }, (_, i) => {
      const o = c.createOscillator(); o.type = 'triangle';
      const f = filt('bandpass', 2000, 9), g = gain();
      o.connect(f).connect(g).connect(bus); o.start();
      return { o, f, g, k: 1 + (i - (nf - 1) / 2) * 0.0045 };
    });
    const buzz = c.createOscillator(); buzz.type = 'sawtooth';
    const buzzHp = filt('highpass', 260, 0.7), buzzF = filt('bandpass', 900, 1.2), buzzG = gain();
    buzz.connect(buzzHp).connect(buzzF).connect(buzzG).connect(bus); buzz.start();
    const whines = [1, 1.0035].map(k => { const o = c.createOscillator(); o.type = 'sine'; const g = gain(); o.connect(g).connect(bus); o.start(); return { o, g, k }; });

    // reheat: deep rumble, an extra low roar, crackle
    const abF = filt('lowpass', 170, 0.8), abG = gain();
    deep.connect(abF).connect(abG).connect(bus);
    const abRoarF = filt('lowpass', 450, 0.6), abRoarG = gain();
    noise.connect(abRoarF).connect(abRoarG).connect(bus);
    const crackF = filt('highpass', 650, 0.7), crackG = gain();
    pops.connect(crackF).connect(crackG).connect(bus);

    // airframe: runway rumble and wind
    const rumF = filt('bandpass', 85, 0.8), rumbleG = gain();
    deep.connect(rumF).connect(rumbleG).connect(bus);
    const windF = filt('bandpass', 700, 0.6), windG = gain();
    noise.connect(windF).connect(windG).connect(bus);

    // cockpit air conditioning: a soft high hiss, heard only from the seat
    const ecsF = filt('bandpass', 2600, 0.6), ecsG = gain();
    noise.connect(ecsF).connect(ecsG).connect(out);

    this.n = { roarF, roarF2, roarG, wob, tearF, tearG, fans, buzz, buzzF, buzzG, whines, abG, crackG, abRoarG, rumbleG, windF, windG, cabF, cabG, wet, ecsG };
  }

  /** rpm 0..1, ab 0..1 */
  set(rpm: number, ab: number) {
    if (!this.ctx || !this.n) return;
    const t = this.ctx.currentTime, e = this.n, r = rpm, sz = Math.sqrt(this.size), at = (p: AudioParam, v: number, tc = 0.12) => p.setTargetAtTime(v, t, tc);
    // light-off: a muffled thump as the spool passes about a fifth of full speed on the way up
    if (this.lastRpm < 0.2 && r >= 0.2 && this.snd) this.snd.burst(0.7, 0.22 * Math.min(1.6, sz), { freq: 110, type: 'lowpass', q: 0.7, attack: 0.04 });
    this.lastRpm = r;
    at(e.roarF.frequency, (240 + 1500 * r ** 1.4) / Math.pow(this.size, 0.25));
    at(e.roarF2.frequency, (480 + 2600 * r ** 1.4) / Math.pow(this.size, 0.25));
    at(e.roarG.gain, 0.015 + 0.3 * r ** 1.8 + 0.1 * ab, 0.18);
    at(e.wob.gain, 0.035 * r, 0.3);
    at(e.tearF.frequency, 1100 + 900 * r);
    at(e.tearG.gain, 0.07 * r ** 2.6, 0.18);
    const bpf = (800 + 1900 * r) / sz;
    for (const f of e.fans) { at(f.o.frequency, bpf * f.k); at(f.f.frequency, bpf * f.k); at(f.g.gain, 0.03 * r ** 0.8 * (1 - 0.35 * r) / Math.sqrt(e.fans.length)); }
    at(e.buzz.frequency, (28 + 72 * r) / sz); at(e.buzzF.frequency, (500 + 900 * r) / sz);
    at(e.buzzG.gain, 0.05 * Math.max(0, r - 0.7) ** 1.2);
    for (const w of e.whines) { at(w.o.frequency, (1300 + 4600 * r) / sz * w.k, 0.2); at(w.g.gain, 0.012 * Math.min(1, r * 4) * (1 - 0.6 * r)); }
    at(e.abG.gain, 0.55 * ab, 0.25); at(e.abRoarG.gain, 0.18 * ab, 0.25); at(e.crackG.gain, 0.22 * ab, 0.25);
  }

  /** ground: 0..1 rolling speed on the runway; air: 0..1 airspeed in flight */
  flight(ground: number, air: number) {
    if (!this.ctx || !this.n) return;
    const t = this.ctx.currentTime, e = this.n;
    e.rumbleG.gain.setTargetAtTime(0.3 * ground, t, 0.15);
    e.windF.frequency.setTargetAtTime(500 + 1100 * air, t, 0.3);
    e.windG.gain.setTargetAtTime(0.09 * air * air, t, 0.3);
  }

  /** heard from the cockpit (k = 1) or from outside (0); `power` 0..1 runs the air conditioning */
  cabin(k: number, power = 0) {
    if (!this.ctx || !this.n) return;
    const t = this.ctx.currentTime, e = this.n;
    e.cabF.frequency.setTargetAtTime(18000 * Math.pow(1100 / 18000, k), t, 0.08);
    e.cabG.gain.setTargetAtTime(1 - 0.35 * k, t, 0.08);
    e.wet.gain.setTargetAtTime(0.25 * (1 - 0.85 * k), t, 0.08);
    e.ecsG.gain.setTargetAtTime(0.018 * k * power, t, 0.3);
  }

  /** the tyres touching the runway: two quick chirps and a thump */
  touchdown() {
    const s = this.snd; if (!s) return;
    s.burst(0.28, 0.12, { freq: 2300, q: 3.5 }); s.burst(0.22, 0.08, { freq: 1900, q: 3.5, at: 0.09 }); s.thunk(0.02);
  }

  dispose() { this.n = null; this.ctx = null; this.snd = null; }
}
