/**
 * SnareDrum.js — Roland TR-808 Snare Drum voice.
 *
 * Two tuned sine oscillators (the "tone" body) mixed with white noise
 * through a high-pass filter (the "snappy" component).
 */
export default class SnareDrum808 {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.destination = destination;

    this.tone   = 0.5;   // 0-1 → body pitch
    this.snappy = 0.5;   // 0-1 → noise level
    this.decay  = 0.5;   // 0-1 → 100ms – 500ms
    this.level  = 0.8;

    this._noiseBuffer = null;
    this._buildNoiseBuffer();
  }

  _buildNoiseBuffer() {
    const len = Math.floor(this.ctx.sampleRate * 2);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._noiseBuffer = buf;
  }

  trigger(time = this.ctx.currentTime) {
    const ctx = this.ctx;

    const decayTime = 0.08 + this.decay * 0.3;
    const noiseDecay = 0.05 + this.decay * 0.2;

    // Tone body: two sine oscillators
    const freq1 = 100 + this.tone * 100; // 100–200 Hz
    const freq2 = freq1 * 1.5;           // ~150–300 Hz

    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq1, time);
    osc1.frequency.exponentialRampToValueAtTime(freq1 * 0.6, time + decayTime);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq2, time);
    osc2.frequency.exponentialRampToValueAtTime(freq2 * 0.5, time + decayTime);

    const toneGain = ctx.createGain();
    toneGain.gain.setValueAtTime(this.level * 0.6, time);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, time + decayTime);

    // Noise (snappy)
    const noise = ctx.createBufferSource();
    noise.buffer = this._noiseBuffer;
    noise.loop = true;

    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 1800;
    hpf.Q.value = 0.5;

    const snappyGain = ctx.createGain();
    snappyGain.gain.setValueAtTime(this.level * this.snappy * 0.8, time);
    snappyGain.gain.exponentialRampToValueAtTime(0.0001, time + noiseDecay);

    // Routing
    osc1.connect(toneGain);
    osc2.connect(toneGain);
    toneGain.connect(this.destination);

    noise.connect(hpf);
    hpf.connect(snappyGain);
    snappyGain.connect(this.destination);

    const stop = time + decayTime + 0.02;
    osc1.start(time); osc1.stop(stop);
    osc2.start(time); osc2.stop(stop);
    noise.start(time); noise.stop(time + noiseDecay + 0.02);
  }
}
