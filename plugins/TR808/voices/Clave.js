/**
 * Clave.js — Roland TR-808 Clave / Rim Shot voice.
 *
 * Very short, bright attack: a narrow bandpass-filtered noise burst
 * mixed with a brief sine oscillator click.
 */
export default class Clave808 {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.destination = destination;
    this.level = 0.8;
    this._noiseBuffer = null;
    this._buildNoiseBuffer();
  }

  _buildNoiseBuffer() {
    const len = Math.floor(this.ctx.sampleRate * 0.1);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._noiseBuffer = buf;
  }

  trigger(time = this.ctx.currentTime) {
    const ctx = this.ctx;

    // Noise click
    const noise = ctx.createBufferSource();
    noise.buffer = this._noiseBuffer;

    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = 1600;
    bpf.Q.value = 4;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(this.level * 0.9, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.025);

    noise.connect(bpf);
    bpf.connect(noiseGain);
    noiseGain.connect(this.destination);

    // Sine "click" tone
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 1500;

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(this.level * 0.5, time);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.012);

    osc.connect(oscGain);
    oscGain.connect(this.destination);

    noise.start(time); noise.stop(time + 0.035);
    osc.start(time);   osc.stop(time + 0.02);
  }
}
