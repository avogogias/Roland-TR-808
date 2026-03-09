/**
 * VocoderProcessor.js — Multi-band peak-detecting envelope follower AudioWorklet.
 *
 * Accepts up to MAX_BANDS mono inputs, one per analysis band.
 * Each input is full-wave rectified internally, then smoothed with separate
 * attack and release exponential coefficients — producing an audio-rate
 * envelope signal on the matching output channel.
 *
 * The outputs are connected directly to GainNode.gain AudioParams in the
 * synthesis filter bank, providing sample-accurate amplitude modulation.
 *
 * Parameters (all k-rate):
 *   attack   — envelope attack  time constant (seconds)  [0.0001 – 0.5]
 *   release  — envelope release time constant (seconds)  [0.001  – 2.0]
 *   envGain  — post-envelope amplification scalar        [0      – 64]
 */

const MAX_BANDS = 32;

class VocoderEnvelopeProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'attack',
        defaultValue: 0.005,
        minValue: 0.0001,
        maxValue: 0.5,
        automationRate: 'k-rate',
      },
      {
        name: 'release',
        defaultValue: 0.08,
        minValue: 0.001,
        maxValue: 2.0,
        automationRate: 'k-rate',
      },
      {
        name: 'envGain',
        defaultValue: 10.0,
        minValue: 0.0,
        maxValue: 64.0,
        automationRate: 'k-rate',
      },
    ];
  }

  constructor() {
    super();
    // One floating-point envelope state per band — persists between process() calls
    this._env = new Float32Array(MAX_BANDS);
  }

  process(inputs, outputs, parameters) {
    const attack   = parameters.attack[0];
    const release  = parameters.release[0];
    const envGain  = parameters.envGain[0];

    // Pre-compute exponential coefficients from time constants:
    //   coeff = exp(-1 / (sampleRate × timeConst))
    // At coeff → 1 the envelope barely moves; at coeff → 0 it follows instantly.
    const aCoeff = Math.exp(-1.0 / (sampleRate * Math.max(attack,  0.0001)));
    const rCoeff = Math.exp(-1.0 / (sampleRate * Math.max(release, 0.001)));

    for (let b = 0; b < inputs.length && b < MAX_BANDS; b++) {
      const inp = inputs[b][0];   // mono input channel for band b
      const out = outputs[b][0];  // mono output channel for band b
      if (!inp || !out) continue;

      let env = this._env[b];

      for (let i = 0; i < inp.length; i++) {
        // Full-wave rectification (branchless abs)
        const absIn = inp[i] < 0.0 ? -inp[i] : inp[i];

        // Peak-detecting envelope:
        //   if signal exceeds envelope → attack phase
        //   otherwise                  → release phase
        env = (absIn >= env)
          ? aCoeff * env + (1.0 - aCoeff) * absIn   // attack
          : rCoeff * env;                            // release

        // Write amplified envelope to output — this drives the VCA GainNode.gain
        out[i] = env * envGain;
      }

      this._env[b] = env; // persist state for next block
    }

    return true; // keep processor alive
  }
}

registerProcessor('vocoder-envelope', VocoderEnvelopeProcessor);
