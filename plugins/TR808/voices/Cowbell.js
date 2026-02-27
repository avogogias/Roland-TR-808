/**
 * Cowbell.js — Roland TR-808 Cowbell voice.
 *
 * Two square-wave oscillators at 540 Hz and 800 Hz, summed and passed
 * through a bandpass filter. The characteristic "moo" tone.
 */
export default class Cowbell808 {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.destination = destination;

    this.tune  = 0.5;    // 0-1 → pitch multiplier 0.7×–1.4×
    this.decay = 0.5;    // 0-1 → 50ms – 800ms
    this.level = 0.7;
  }

  trigger(time = this.ctx.currentTime) {
    const ctx = this.ctx;

    const pitchMul = 0.7 + this.tune * 0.7;
    const decayTime = 0.05 + this.decay * 0.75;

    const f1 = 540 * pitchMul;
    const f2 = 800 * pitchMul;

    const osc1 = ctx.createOscillator();
    osc1.type = 'square';
    osc1.frequency.value = f1;

    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = f2;

    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = f1 * 1.2;
    bpf.Q.value = 1.2;

    const env = ctx.createGain();
    env.gain.setValueAtTime(this.level * 0.5, time);
    env.gain.exponentialRampToValueAtTime(this.level * 0.3, time + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, time + decayTime);

    osc1.connect(bpf);
    osc2.connect(bpf);
    bpf.connect(env);
    env.connect(this.destination);

    osc1.start(time); osc1.stop(time + decayTime + 0.02);
    osc2.start(time); osc2.stop(time + decayTime + 0.02);
  }
}
