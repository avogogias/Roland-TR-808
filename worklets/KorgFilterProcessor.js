/**
 * KorgFilterProcessor.js
 * Korg MS-series transistor ladder (Sallen-Key topology) lowpass filter.
 * More aggressive, clippier character than the Moog ladder.
 * Self-oscillates sharply at peak ≥ 3.5.
 *
 * AudioParams: cutoff (Hz), peak (resonance 0–4)
 */
class KorgFilterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'cutoff', defaultValue: 800,  minValue: 20,  maxValue: 20000, automationRate: 'a-rate' },
      { name: 'peak',   defaultValue: 0,    minValue: 0,   maxValue: 4,     automationRate: 'a-rate' },
    ];
  }

  constructor() {
    super();
    this._s1 = this._s2 = this._s3 = this._s4 = 0;
  }

  // Hard-clip saturation — more aggressive than Moog tanh
  _clip(x) {
    return Math.max(-1, Math.min(1, x * 0.7));
  }

  process(inputs, outputs, parameters) {
    const input  = inputs[0][0];
    const output = outputs[0][0];
    if (!input) return true;

    const cutoffs = parameters.cutoff;
    const peaks   = parameters.peak;
    const SR = sampleRate;
    let s1 = this._s1, s2 = this._s2, s3 = this._s3, s4 = this._s4;

    for (let i = 0; i < output.length; i++) {
      const cutoff = cutoffs.length > 1 ? cutoffs[i] : cutoffs[0];
      const peak   = peaks.length   > 1 ? peaks[i]   : peaks[0];

      const g  = Math.tan(Math.PI * Math.min(cutoff, SR * 0.49) / SR);
      const G  = g / (1 + g);
      const fb = peak * 4;

      const u = this._clip(input[i] - fb * s4);

      s1 = s1 + G * (this._clip(u)  - s1);
      s2 = s2 + G * (this._clip(s1) - s2);
      s3 = s3 + G * (this._clip(s2) - s3);
      s4 = s4 + G * (this._clip(s3) - s4);

      output[i] = s4;
    }

    this._s1 = s1; this._s2 = s2; this._s3 = s3; this._s4 = s4;
    return true;
  }
}

registerProcessor('korg-filter', KorgFilterProcessor);
