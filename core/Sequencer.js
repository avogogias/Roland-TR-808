/**
 * Sequencer.js
 * Sample-accurate step sequencer using the Web Audio API clock.
 * Uses the "double-buffer lookahead" scheduling pattern to achieve tight timing.
 */
export default class Sequencer {
  constructor(audioEngine) {
    this._ae = audioEngine;
    this._bpm = 120;
    this._steps = 16;
    this._swing = 0;          // 0-1 (0 = no swing, 0.5 = full swing)
    this._currentStep = 0;
    this._nextStepTime = 0;
    this._running = false;
    this._timerID = null;

    this._scheduleAheadTime = 0.1;  // seconds to look ahead
    this._lookaheadInterval = 25;   // ms between scheduler calls

    this._listeners = [];
  }

  /** Register a callback: fn({step, time}) */
  onStep(fn) { this._listeners.push(fn); }
  offStep(fn) { this._listeners = this._listeners.filter(l => l !== fn); }

  get bpm() { return this._bpm; }
  set bpm(v) { this._bpm = Math.max(20, Math.min(400, v)); }

  get steps() { return this._steps; }
  set steps(v) { this._steps = v; }

  get swing() { return this._swing; }
  set swing(v) { this._swing = clamp(v, 0, 0.5); }

  get currentStep() { return this._currentStep; }

  start() {
    if (this._running) return;
    const ctx = this._ae.getContext();
    this._ae.resume();
    this._running = true;
    this._currentStep = 0;
    this._nextStepTime = ctx.currentTime + 0.05;
    this._timerID = setInterval(() => this._schedule(), this._lookaheadInterval);
  }

  stop() {
    this._running = false;
    clearInterval(this._timerID);
    this._timerID = null;
    this._currentStep = 0;
    this._listeners.forEach(fn => fn({ step: -1, time: 0 })); // reset signal
  }

  _stepDuration() {
    return (60 / this._bpm) / 4; // 16th note
  }

  _schedule() {
    const ctx = this._ae.getContext();
    while (this._nextStepTime < ctx.currentTime + this._scheduleAheadTime) {
      const step = this._currentStep;
      let t = this._nextStepTime;

      // Apply swing: delay even 16th notes
      if (this._swing > 0 && step % 2 === 1) {
        t += this._stepDuration() * this._swing;
      }

      this._listeners.forEach(fn => fn({ step, time: t }));

      this._nextStepTime += this._stepDuration();
      this._currentStep = (this._currentStep + 1) % this._steps;
    }
  }
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
