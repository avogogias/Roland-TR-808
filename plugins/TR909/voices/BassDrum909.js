/**
 * BassDrum909.js — Roland TR-909 Bass Drum voice.
 *
 * Punchier than the 808 BD: a loud "click" transient from a short square
 * oscillator burst followed by a pitch-swept sine wave body.
 * Extra "attack" knob controls the click intensity.
 */
export default class BassDrum909 {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.destination = destination;

    this.tune   = 0.5;
    this.attack = 0.5;   // 0-1 → click transient intensity
    this.decay  = 0.5;
    this.level  = 0.9;
  }

  trigger(time = this.ctx.currentTime) {
    const ctx = this.ctx;

    const decayTime  = 0.08 + this.decay * 0.7;
    const pitchStart = 70 + this.tune * 140;
    const pitchEnd   = 35 + this.tune * 40;

    // ── Body oscillator ───────────────────────────────────────────────
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitchStart, time);
    osc.frequency.exponentialRampToValueAtTime(pitchEnd, time + decayTime * 0.5);

    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(this.level, time);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, time + decayTime);

    // ── Punch click (short square wave) ──────────────────────────────
    const click = ctx.createOscillator();
    click.type = 'square';
    click.frequency.value = pitchStart * 1.5;

    const clickGain = ctx.createGain();
    const clickAmt = 0.1 + this.attack * 1.2;
    clickGain.gain.setValueAtTime(this.level * clickAmt, time);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.008);

    // ── Distortion (waveshaper) for extra grit ────────────────────────
    const ws = ctx.createWaveShaper();
    ws.curve = this._distCurve(6);
    ws.oversample = '2x';

    // Routing
    osc.connect(bodyGain);
    bodyGain.connect(ws);
    ws.connect(this.destination);

    click.connect(clickGain);
    clickGain.connect(this.destination);

    const stop = time + decayTime + 0.05;
    osc.start(time);   osc.stop(stop);
    click.start(time); click.stop(time + 0.015);
  }

  _distCurve(amount) {
    const n = 256;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }
}
