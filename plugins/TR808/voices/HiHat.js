/**
 * HiHat.js — Roland TR-808 Closed and Open Hi-Hat voices.
 *
 * Six square-wave oscillators at irrational frequency ratios produce
 * the characteristic metallic TR-808 hi-hat sound. The oscillator bank
 * is kept running permanently and gated via GainNodes to avoid
 * per-trigger allocation overhead.
 *
 * Closed Hi-Hat (CH) triggers cut off any ringing Open Hi-Hat (OH).
 */
export default class HiHat808 {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.destination = destination;

    // 808 hi-hat oscillator frequencies (Hz) — empirically derived
    this._freqs = [205.3, 369.0, 492.0, 615.4, 812.0, 1020.0];

    this.decayCH = 0.5;  // 0-1 → 30ms – 200ms
    this.decayOH = 0.5;  // 0-1 → 200ms – 800ms
    this.levelCH = 0.75;
    this.levelOH = 0.75;
    this.tuneCH  = 0.5;
    this.tuneOH  = 0.5;

    this._ohGain = null;   // so CH can cancel OH
    this._ohStopTime = 0;

    this._buildBank();
  }

  _buildBank() {
    const ctx = this.ctx;

    // Mix all six oscillators
    const mixer = ctx.createGain();
    mixer.gain.value = 0.3;

    this._freqs.forEach(f => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f;
      osc.connect(mixer);
      osc.start();
    });

    // High-pass filter (remove low-frequency content)
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 6800;
    hpf.Q.value = 0.7;

    mixer.connect(hpf);

    this._hpfOut = hpf; // connect individual env gains to this
  }

  triggerCH(time = this.ctx.currentTime) {
    const ctx = this.ctx;

    // Cancel any open hi-hat
    if (this._ohGain) {
      this._ohGain.gain.cancelScheduledValues(time);
      this._ohGain.gain.setValueAtTime(0, time);
    }

    const decayTime = 0.01 + this.decayCH * 0.15;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.levelCH, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decayTime);

    this._hpfOut.connect(gain);
    gain.connect(this.destination);

    // Disconnect after envelope
    setTimeout(() => { try { this._hpfOut.disconnect(gain); } catch(e){} },
      (time - ctx.currentTime + decayTime + 0.05) * 1000);
  }

  triggerOH(time = this.ctx.currentTime) {
    const ctx = this.ctx;

    const decayTime = 0.15 + this.decayOH * 0.65;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.levelOH, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decayTime);

    this._ohGain = gain;
    this._ohStopTime = time + decayTime;

    this._hpfOut.connect(gain);
    gain.connect(this.destination);

    setTimeout(() => { try { this._hpfOut.disconnect(gain); } catch(e){} },
      (time - ctx.currentTime + decayTime + 0.05) * 1000);
  }
}
