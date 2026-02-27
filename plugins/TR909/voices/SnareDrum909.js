/**
 * SnareDrum909.js — Roland TR-909 Snare Drum voice.
 *
 * Brighter, more digital-sounding snare. The noise component has a faster
 * attack and the tone oscillators are at a higher frequency range.
 * "Tone" sweeps pitch, "Snappy" controls the noise ratio.
 */
export default class SnareDrum909 {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.destination = destination;

    this.tune   = 0.5;
    this.tone   = 0.5;
    this.snappy = 0.6;
    this.decay  = 0.5;
    this.level  = 0.85;

    this._noiseBuffer = null;
    this._buildNoiseBuffer();
  }

  _buildNoiseBuffer() {
    const len = Math.floor(this.ctx.sampleRate * 2);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuffer = buf;
  }

  trigger(time = this.ctx.currentTime) {
    const ctx = this.ctx;

    const bodyDecay  = 0.05 + this.decay * 0.25;
    const noiseDecay = 0.06 + this.decay * 0.22;

    // Higher frequency oscillators than 808
    const freq = 150 + this.tune * 120;

    const osc1 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(freq, time);
    osc1.frequency.exponentialRampToValueAtTime(freq * 0.5, time + bodyDecay);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 1.6, time);
    osc2.frequency.exponentialRampToValueAtTime(freq * 0.7, time + bodyDecay * 0.8);

    const toneGain = ctx.createGain();
    toneGain.gain.setValueAtTime(this.level * this.tone * 0.7, time);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, time + bodyDecay);

    // Noise (more aggressive than 808)
    const noise = ctx.createBufferSource();
    noise.buffer = this._noiseBuffer;
    noise.loop = true;

    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 2500;
    hpf.Q.value = 1.2;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(this.level * this.snappy * 0.9, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + noiseDecay);

    osc1.connect(toneGain); osc2.connect(toneGain);
    toneGain.connect(this.destination);

    noise.connect(hpf); hpf.connect(noiseGain);
    noiseGain.connect(this.destination);

    const stop = time + Math.max(bodyDecay, noiseDecay) + 0.02;
    osc1.start(time); osc1.stop(stop);
    osc2.start(time); osc2.stop(stop);
    noise.start(time); noise.stop(time + noiseDecay + 0.02);
  }
}
