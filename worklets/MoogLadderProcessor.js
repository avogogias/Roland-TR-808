/**
 * MoogLadderProcessor.js
 * Huovilainen improved Moog ladder filter — 4-pole 24 dB/oct lowpass.
 * AudioParams: cutoff (Hz, 20–20000), resonance (0–4, self-oscillates ~3.8+)
 *
 * Register: audioContext.audioWorklet.addModule('worklets/MoogLadderProcessor.js')
 * Use:      new AudioWorkletNode(ctx, 'moog-ladder', { numberOfOutputs: 1 })
 *           parameterDescriptors provide 'cutoff' and 'resonance' AudioParams
 */
class MoogLadderProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'cutoff',    defaultValue: 1000, minValue: 20,  maxValue: 20000, automationRate: 'a-rate' },
      { name: 'resonance', defaultValue: 0,    minValue: 0,   maxValue: 4,     automationRate: 'a-rate' },
    ];
  }

  constructor() {
    super();
    // 4 one-pole stages + thermal noise
    this._y1 = this._y2 = this._y3 = this._y4 = 0;
    this._oldX = 0;
    this._oldY1 = this._oldY2 = this._oldY3 = this._oldY4 = 0;
  }

  // Fast tanh approximation
  _tanh(x) {
    if (x > 3)  return 1;
    if (x < -3) return -1;
    const x2 = x * x;
    return x * (27 + x2) / (27 + 9 * x2);
  }

  process(inputs, outputs, parameters) {
    const input  = inputs[0][0];
    const output = outputs[0][0];
    if (!input) return true;

    const cutoffs    = parameters.cutoff;
    const resonances = parameters.resonance;

    const SR = sampleRate;
    const len = output.length;

    let y1 = this._y1, y2 = this._y2, y3 = this._y3, y4 = this._y4;
    let oldX = this._oldX, oldY1 = this._oldY1, oldY2 = this._oldY2,
        oldY3 = this._oldY3, oldY4 = this._oldY4;

    for (let i = 0; i < len; i++) {
      const cutoff    = cutoffs.length > 1    ? cutoffs[i]    : cutoffs[0];
      const resonance = resonances.length > 1 ? resonances[i] : resonances[0];

      // Normalised cutoff frequency (0–1)
      const f  = (2 * cutoff) / SR;
      const fc = Math.min(f, 0.999);

      // Feedback with resonance (4× because 4-pole)
      const fb = resonance * (1.0 - 0.15 * fc * fc);

      const x = input[i] - fb * y4;

      // Huovilainen nonlinear stages
      y1 = y1 + fc * (this._tanh(x  * 0.5) - this._tanh(y1 * 0.5));
      y2 = y2 + fc * (this._tanh(y1 * 0.5) - this._tanh(y2 * 0.5));
      y3 = y3 + fc * (this._tanh(y2 * 0.5) - this._tanh(y3 * 0.5));
      y4 = y4 + fc * (this._tanh(y3 * 0.5) - this._tanh(y4 * 0.5));

      output[i] = y4;
    }

    this._y1 = y1; this._y2 = y2; this._y3 = y3; this._y4 = y4;
    this._oldX = oldX; this._oldY1 = oldY1; this._oldY2 = oldY2;
    this._oldY3 = oldY3; this._oldY4 = oldY4;

    return true;
  }
}

registerProcessor('moog-ladder', MoogLadderProcessor);
