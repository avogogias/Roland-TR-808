/**
 * HiHat909.js — Roland TR-909 Hi-Hat voices.
 *
 * The 909 hi-hats are generated from white noise through a resonant BPF,
 * giving them a brighter, more "digital" character compared to the 808's
 * oscillator-bank approach. CH cuts OH.
 */
export default class HiHat909 {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.destination = destination;

    this.decayCH = 0.4;
    this.decayOH = 0.5;
    this.levelCH = 0.7;
    this.levelOH = 0.75;

    this._noiseBuffer = null;
    this._ohGain = null;
    this._buildNoiseBuffer();
  }

  _buildNoiseBuffer() {
    const len = Math.floor(this.ctx.sampleRate * 2);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuffer = buf;
  }

  _makeHat(time, decayTime, level) {
    const ctx = this.ctx;

    const noise = ctx.createBufferSource();
    noise.buffer = this._noiseBuffer;
    noise.loop = true;

    // Resonant BPF shaping
    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = 8500;
    bpf.Q.value = 2.5;

    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 7000;
    hpf.Q.value = 0.5;

    const g = ctx.createGain();
    g.gain.setValueAtTime(level, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + decayTime);

    noise.connect(bpf);
    bpf.connect(hpf);
    hpf.connect(g);
    g.connect(this.destination);

    noise.start(time);
    noise.stop(time + decayTime + 0.01);

    return g;
  }

  triggerCH(time = this.ctx.currentTime) {
    // Kill any open hi-hat
    if (this._ohGain) {
      this._ohGain.gain.cancelScheduledValues(time);
      this._ohGain.gain.setValueAtTime(0, time);
    }
    const decayTime = 0.01 + this.decayCH * 0.12;
    this._makeHat(time, decayTime, this.levelCH);
  }

  triggerOH(time = this.ctx.currentTime) {
    const decayTime = 0.12 + this.decayOH * 0.55;
    this._ohGain = this._makeHat(time, decayTime, this.levelOH);
  }
}
