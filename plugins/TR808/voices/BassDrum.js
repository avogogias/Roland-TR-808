/**
 * BassDrum.js — Roland TR-808 Bass Drum voice.
 *
 * Circuit model: Bridged-T oscillator simulated as a sine wave oscillator
 * with a fast pitch-down sweep (150 Hz → ~50 Hz) and an amplitude envelope.
 * A "click" noise burst at the very start adds the initial transient.
 */
export default class BassDrum808 {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.destination = destination;

    // Parameters
    this.tune  = 0.5;   // 0-1 → pitch multiplier 0.5×–2×
    this.decay = 0.5;   // 0-1 → 100 ms – 1 s
    this.level = 0.85;

    // Persistent noise buffer for the click
    this._noiseBuffer = this._buildNoiseBuffer(0.05); // 50 ms
  }

  _buildNoiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  trigger(time = this.ctx.currentTime) {
    const ctx = this.ctx;

    const decayTime = 0.1 + this.decay * 0.9;           // 100ms – 1s
    const pitchStart = 50 + this.tune * 180;             // 50–230 Hz
    const pitchEnd   = 28 + this.tune * 40;              // 28–68 Hz

    // ── Oscillator (body) ──────────────────────────────────────────────
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitchStart, time);
    osc.frequency.exponentialRampToValueAtTime(pitchEnd, time + decayTime * 0.4);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(this.level, time);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, time + decayTime);

    // Slight second oscillator for extra body (one octave down, lower level)
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(pitchStart * 0.5, time);
    osc2.frequency.exponentialRampToValueAtTime(pitchEnd * 0.5, time + decayTime * 0.3);

    const osc2Gain = ctx.createGain();
    osc2Gain.gain.setValueAtTime(this.level * 0.4, time);
    osc2Gain.gain.exponentialRampToValueAtTime(0.0001, time + decayTime * 0.6);

    // ── Click transient ───────────────────────────────────────────────
    const click = ctx.createBufferSource();
    click.buffer = this._noiseBuffer;

    const clickFilter = ctx.createBiquadFilter();
    clickFilter.type = 'bandpass';
    clickFilter.frequency.value = 1200;
    clickFilter.Q.value = 0.5;

    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(this.level * 0.6, time);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.015);

    // ── Routing ───────────────────────────────────────────────────────
    osc.connect(oscGain);
    osc2.connect(osc2Gain);
    click.connect(clickFilter);
    clickFilter.connect(clickGain);

    oscGain.connect(this.destination);
    osc2Gain.connect(this.destination);
    clickGain.connect(this.destination);

    // ── Start / stop ──────────────────────────────────────────────────
    osc.start(time);
    osc2.start(time);
    click.start(time);

    const stop = time + decayTime + 0.05;
    osc.stop(stop);
    osc2.stop(stop);
    click.stop(time + 0.05);
  }
}
