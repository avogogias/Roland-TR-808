/**
 * NoiseProcessor.js — AudioWorklet white-noise source.
 * Register: audioContext.audioWorklet.addModule('worklets/NoiseProcessor.js')
 * Use:      new AudioWorkletNode(ctx, 'noise-processor')
 */
class NoiseProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const out = outputs[0][0];
    for (let i = 0; i < out.length; i++) {
      out[i] = Math.random() * 2 - 1;
    }
    return true;
  }
}

registerProcessor('noise-processor', NoiseProcessor);
