/**
 * Cymbal.js — Roland TR-808 Cymbal voice.
 *
 * Six square-wave oscillators at frequencies with irrational ratios
 * (avoiding harmonic locking), passed through a narrow high-pass filter
 * to retain only the "sizzle" content. Long amplitude envelope.
 */
export default class Cymbal808 {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.destination = destination;

    // Frequencies empirically derived from 808 circuit analysis
    this._freqs = [205.3, 369.0, 492.0, 615.4, 812.0, 1020.0].map(f => f * 4.8);

    this.tune  = 0.5;   // 0-1
    this.decay = 0.5;   // 0-1 → 200ms – 2s
    this.level = 0.6;

    this._buildBank();
  }

  _buildBank() {
    const ctx = this.ctx;
    const mixer = ctx.createGain();
    mixer.gain.value = 0.25;

    this._oscs = this._freqs.map(f => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f;
      osc.connect(mixer);
      osc.start();
      return osc;
    });

    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 6200;
    hpf.Q.value = 0.5;

    mixer.connect(hpf);
    this._hpfOut = hpf;
  }

  updateTune() {
    const mul = 0.7 + this.tune * 0.7;
    this._freqs.forEach((f, i) => {
      this._oscs[i].frequency.value = f * mul;
    });
  }

  trigger(time = this.ctx.currentTime) {
    const ctx = this.ctx;

    this.updateTune();

    const decayTime = 0.2 + this.decay * 1.8;

    const env = ctx.createGain();
    env.gain.setValueAtTime(this.level, time);
    env.gain.exponentialRampToValueAtTime(0.0001, time + decayTime);

    this._hpfOut.connect(env);
    env.connect(this.destination);

    setTimeout(() => {
      try { this._hpfOut.disconnect(env); } catch(e) {}
    }, (time - ctx.currentTime + decayTime + 0.05) * 1000);
  }
}
