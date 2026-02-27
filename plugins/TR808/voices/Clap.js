/**
 * Clap.js — Roland TR-808 Hand Clap voice.
 *
 * Four short bursts of white noise with slight timing offsets
 * create the characteristic spread "clap" texture with a short reverb feel.
 * Delays: 0, 8, 17, 34 ms — each burst 5–12 ms long.
 */
export default class Clap808 {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.destination = destination;

    this.level = 0.8;

    this._noiseBuffer = null;
    this._buildNoiseBuffer();
  }

  _buildNoiseBuffer() {
    const len = Math.floor(this.ctx.sampleRate * 0.15);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._noiseBuffer = buf;
  }

  _burst(time, duration, gainLevel) {
    const ctx = this.ctx;

    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer;

    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 1000;
    hpf.Q.value = 0.5;

    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = 1200;
    bpf.Q.value = 0.8;

    const g = ctx.createGain();
    g.gain.setValueAtTime(gainLevel, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    src.connect(hpf);
    hpf.connect(bpf);
    bpf.connect(g);
    g.connect(this.destination);

    src.start(time);
    src.stop(time + duration + 0.005);
  }

  trigger(time = this.ctx.currentTime) {
    const offsets  = [0, 0.008, 0.017, 0.034];
    const durations = [0.006, 0.007, 0.009, 0.06];
    const gains    = [1.0, 0.9, 0.85, 0.7];

    offsets.forEach((dt, i) => {
      this._burst(time + dt, durations[i], this.level * gains[i]);
    });
  }
}
