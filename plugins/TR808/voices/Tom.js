/**
 * Tom.js — Roland TR-808 Tom voices (Low, Mid, High + Conga variants).
 *
 * Each tom uses the same Bass Drum topology: a sine wave oscillator
 * with a rapid pitch sweep downward and a decaying amplitude envelope.
 * Different tones are achieved by setting different base frequencies.
 */
export default class Tom808 {
  /**
   * @param {AudioContext} ctx
   * @param {AudioNode} destination
   * @param {'LT'|'MT'|'HT'|'LC'|'MC'|'HC'} variant
   */
  constructor(ctx, destination, variant = 'LT') {
    this.ctx = ctx;
    this.destination = destination;
    this.variant = variant;

    // Base frequencies per variant
    const baseFreqs = {
      LT:  80,  MT: 120,  HT: 165,
      LC:  85,  MC: 130,  HC: 175,
    };
    this._baseFreq = baseFreqs[variant] ?? 100;

    this.tune  = 0.5;   // 0-1
    this.decay = 0.5;   // 0-1 → 50ms – 500ms
    this.level = 0.75;
  }

  trigger(time = this.ctx.currentTime) {
    const ctx = this.ctx;

    const decayTime = 0.05 + this.decay * 0.45;
    const freq = this._baseFreq * (0.7 + this.tune * 1.0);  // ±tune range
    const freqEnd = freq * 0.5;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, time + decayTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.level, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decayTime);

    osc.connect(gain);
    gain.connect(this.destination);

    osc.start(time);
    osc.stop(time + decayTime + 0.02);
  }
}
