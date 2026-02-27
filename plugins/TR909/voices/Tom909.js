/**
 * Tom909.js — Roland TR-909 Tom voice.
 * Similar to 808 toms but with a slightly different character —
 * mixed sine + triangle oscillator for a less pure, punchier tone.
 */
export default class Tom909 {
  constructor(ctx, destination, variant = 'LT') {
    this.ctx = ctx;
    this.destination = destination;
    this.variant = variant;

    const baseFreqs = { LT: 85, MT: 130, HT: 180 };
    this._baseFreq = baseFreqs[variant] ?? 100;

    this.tune  = 0.5;
    this.decay = 0.5;
    this.level = 0.8;
  }

  trigger(time = this.ctx.currentTime) {
    const ctx = this.ctx;

    const decayTime = 0.06 + this.decay * 0.4;
    const freq = this._baseFreq * (0.7 + this.tune);
    const freqEnd = freq * 0.45;

    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, time);
    osc1.frequency.exponentialRampToValueAtTime(freqEnd, time + decayTime);

    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 1.2, time);
    osc2.frequency.exponentialRampToValueAtTime(freqEnd * 1.1, time + decayTime * 0.7);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.level, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decayTime);

    osc1.connect(gain); osc2.connect(gain);
    gain.connect(this.destination);

    const stop = time + decayTime + 0.02;
    osc1.start(time); osc1.stop(stop);
    osc2.start(time); osc2.stop(stop);
  }
}
