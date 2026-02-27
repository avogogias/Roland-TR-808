/**
 * BBDChorusProcessor.js
 * Bucket-Brigade Device (BBD) chorus emulation for the Roland Juno-106.
 * Two modes:
 *   mode=1 : Single BBD, ~15 ms delay, triangle LFO
 *   mode=2 : Dual BBD, ~8 ms each, slight detuning between channels
 *
 * AudioParams: mode (1 or 2), rate (LFO Hz, 0.1–10), depth (0–1)
 */
class BBDChorusProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'mode',  defaultValue: 1,   minValue: 0,   maxValue: 2,  automationRate: 'k-rate' },
      { name: 'rate',  defaultValue: 0.5, minValue: 0.1, maxValue: 10, automationRate: 'k-rate' },
      { name: 'depth', defaultValue: 0.6, minValue: 0,   maxValue: 1,  automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    const maxDelayMs = 30;
    this._bufSize = Math.ceil(sampleRate * maxDelayMs / 1000) + 1;
    this._buf1 = new Float32Array(this._bufSize);
    this._buf2 = new Float32Array(this._bufSize);
    this._writePos = 0;
    this._lfoPhase1 = 0;
    this._lfoPhase2 = Math.PI; // second BBD offset by 180°
  }

  _readInterp(buf, writePos, delaySamples) {
    const ri = writePos - delaySamples;
    const i0 = ((Math.floor(ri) % this._bufSize) + this._bufSize) % this._bufSize;
    const i1 = (i0 + 1) % this._bufSize;
    const frac = ri - Math.floor(ri);
    return buf[i0] * (1 - frac) + buf[i1] * frac;
  }

  process(inputs, outputs, parameters) {
    const input  = inputs[0][0];
    const outL   = outputs[0][0];
    const outR   = outputs[0].length > 1 ? outputs[0][1] : outputs[0][0];
    if (!input) return true;

    const mode  = Math.round(parameters.mode[0]);
    const rate  = parameters.rate[0];
    const depth = parameters.depth[0];

    const SR = sampleRate;
    const baseDelayMs1 = 15.0;
    const baseDelayMs2 = 8.0;
    const swingMs1 = 6 * depth;   // ± swing around base delay
    const swingMs2 = 4 * depth;

    const lfoInc = (2 * Math.PI * rate) / SR;

    for (let i = 0; i < input.length; i++) {
      const x = input[i];

      // Store input
      this._buf1[this._writePos] = x;
      this._buf2[this._writePos] = x;

      if (mode === 0) {
        // Bypass — dry signal
        outL[i] = x;
        if (outR !== outL) outR[i] = x;
      } else if (mode === 1) {
        // Single BBD
        const lfoVal = Math.sin(this._lfoPhase1);
        const delMs  = baseDelayMs1 + lfoVal * swingMs1;
        const delSmp = delMs * SR / 1000;
        const wet = this._readInterp(this._buf1, this._writePos, delSmp);
        const out = x * 0.5 + wet * 0.5;
        outL[i] = out;
        if (outR !== outL) outR[i] = out;
        this._lfoPhase1 = (this._lfoPhase1 + lfoInc) % (2 * Math.PI);
      } else {
        // Dual BBD (stereo)
        const lfo1 = Math.sin(this._lfoPhase1);
        const lfo2 = Math.sin(this._lfoPhase2);
        const delMs1 = baseDelayMs2 + lfo1 * swingMs2;
        const delMs2 = baseDelayMs2 + lfo2 * swingMs2;
        const wet1 = this._readInterp(this._buf1, this._writePos, delMs1 * SR / 1000);
        const wet2 = this._readInterp(this._buf2, this._writePos, delMs2 * SR / 1000);
        outL[i] = x * 0.5 + wet1 * 0.5;
        if (outR !== outL) outR[i] = x * 0.5 + wet2 * 0.5;
        else outL[i] = (outL[i] + x * 0.5 + wet2 * 0.5) * 0.5;
        this._lfoPhase1 = (this._lfoPhase1 + lfoInc) % (2 * Math.PI);
        this._lfoPhase2 = (this._lfoPhase2 + lfoInc) % (2 * Math.PI);
      }

      this._writePos = (this._writePos + 1) % this._bufSize;
    }
    return true;
  }
}

registerProcessor('bbd-chorus', BBDChorusProcessor);
