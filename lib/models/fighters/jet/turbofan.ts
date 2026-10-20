// Turbofan voice: compressor whine, jet roar and afterburner rumble, driven by rpm and afterburner 0..1.
import type { Sound, Voice } from '../../../core/sound';

export class Turbofan implements Voice {
  private ctx: AudioContext | null = null;
  private n: { whine: OscillatorNode; whineG: GainNode; whineF: BiquadFilterNode; roarF: BiquadFilterNode; roarG: GainNode; rumbleG: GainNode } | null = null;

  build(c: AudioContext, out: AudioNode, snd: Sound) {
    this.ctx = c;
    const whine = c.createOscillator(); whine.type = 'sawtooth'; whine.frequency.value = 80;
    const whineF = c.createBiquadFilter(); whineF.type = 'bandpass'; whineF.frequency.value = 900; whineF.Q.value = 6;
    const whineG = c.createGain(); whineG.gain.value = 0;
    whine.connect(whineF).connect(whineG).connect(out); whine.start();
    const roar = snd.noise(); const roarF = c.createBiquadFilter(); roarF.type = 'bandpass'; roarF.frequency.value = 500; roarF.Q.value = 0.7;
    const roarG = c.createGain(); roarG.gain.value = 0;
    roar.connect(roarF).connect(roarG).connect(out); roar.start();
    const rum = snd.noise(3); const rumF = c.createBiquadFilter(); rumF.type = 'lowpass'; rumF.frequency.value = 160;
    const rumbleG = c.createGain(); rumbleG.gain.value = 0;
    rum.connect(rumF).connect(rumbleG).connect(out); rum.start();
    this.n = { whine, whineG, whineF, roarF, roarG, rumbleG };
  }

  /** rpm 0..1, ab 0..1 */
  set(rpm: number, ab: number) {
    if (!this.ctx || !this.n) return;
    const t = this.ctx.currentTime, e = this.n;
    e.whine.frequency.setTargetAtTime(70 + rpm * 520, t, 0.1);
    e.whineF.frequency.setTargetAtTime(600 + rpm * 2600, t, 0.1);
    e.whineG.gain.setTargetAtTime(rpm * 0.035, t, 0.1);
    e.roarF.frequency.setTargetAtTime(300 + rpm * 900 - ab * 250, t, 0.15);
    e.roarG.gain.setTargetAtTime(rpm * rpm * 0.16 + ab * 0.12, t, 0.15);
    e.rumbleG.gain.setTargetAtTime(rpm * 0.06 + ab * 0.5, t, 0.2);
  }

  dispose() { this.n = null; this.ctx = null; }
}
