/**
 * tests/core/sequencer.test.js
 * Unit tests for core/Sequencer.js — timing math and state machine.
 *
 * The Sequencer depends on an audioEngine object that provides:
 *   .getContext() → { currentTime: number }
 *   .resume()     → void
 *
 * We supply a lightweight mock so no real AudioContext is required.
 *
 * Run:  node --test tests/core/sequencer.test.js
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import Sequencer from '../../core/Sequencer.js';

function makeMockEngine(currentTime = 0) {
  const engine = {
    _time: currentTime,
    resumed: false,
    getContext() { return { currentTime: engine._time }; },
    resume() { engine.resumed = true; },
  };
  return engine;
}

// ─── _stepDuration ───────────────────────────────────────────────────────────

describe('Sequencer._stepDuration', () => {
  it('120 BPM → 0.125 s per 16th note', () => {
    const seq = new Sequencer(makeMockEngine());
    seq.bpm = 120;
    assert.ok(Math.abs(seq._stepDuration() - 0.125) < 0.000001);
  });

  it('60 BPM → 0.25 s per 16th note', () => {
    const seq = new Sequencer(makeMockEngine());
    seq.bpm = 60;
    assert.ok(Math.abs(seq._stepDuration() - 0.25) < 0.000001);
  });

  it('240 BPM → 0.0625 s per 16th note', () => {
    const seq = new Sequencer(makeMockEngine());
    seq.bpm = 240;
    assert.ok(Math.abs(seq._stepDuration() - 0.0625) < 0.000001);
  });
});

// ─── BPM setter clamping ─────────────────────────────────────────────────────

describe('Sequencer bpm setter', () => {
  let seq;
  beforeEach(() => { seq = new Sequencer(makeMockEngine()); });

  it('sets BPM within valid range', () => {
    seq.bpm = 120;
    assert.strictEqual(seq.bpm, 120);
  });

  it('clamps to minimum 20 when set below', () => {
    seq.bpm = 5;
    assert.strictEqual(seq.bpm, 20);
  });

  it('clamps to maximum 400 when set above', () => {
    seq.bpm = 999;
    assert.strictEqual(seq.bpm, 400);
  });

  it('accepts boundary value 20', () => {
    seq.bpm = 20;
    assert.strictEqual(seq.bpm, 20);
  });

  it('accepts boundary value 400', () => {
    seq.bpm = 400;
    assert.strictEqual(seq.bpm, 400);
  });
});

// ─── swing setter clamping ───────────────────────────────────────────────────

describe('Sequencer swing setter', () => {
  let seq;
  beforeEach(() => { seq = new Sequencer(makeMockEngine()); });

  it('default swing is 0', () => {
    assert.strictEqual(seq.swing, 0);
  });

  it('sets valid swing value', () => {
    seq.swing = 0.33;
    assert.ok(Math.abs(seq.swing - 0.33) < 0.0001);
  });

  it('clamps swing below 0 to 0', () => {
    seq.swing = -0.5;
    assert.strictEqual(seq.swing, 0);
  });

  it('clamps swing above 0.5 to 0.5', () => {
    seq.swing = 0.9;
    assert.strictEqual(seq.swing, 0.5);
  });

  it('accepts boundary value 0.5', () => {
    seq.swing = 0.5;
    assert.strictEqual(seq.swing, 0.5);
  });
});

// ─── steps setter ────────────────────────────────────────────────────────────

describe('Sequencer steps setter', () => {
  it('default is 16 steps', () => {
    const seq = new Sequencer(makeMockEngine());
    assert.strictEqual(seq.steps, 16);
  });

  it('can be set to 32', () => {
    const seq = new Sequencer(makeMockEngine());
    seq.steps = 32;
    assert.strictEqual(seq.steps, 32);
  });
});

// ─── callback registration ───────────────────────────────────────────────────

describe('Sequencer onStep / offStep', () => {
  it('onStep registers a callback that can be deregistered with offStep', () => {
    const seq = new Sequencer(makeMockEngine());
    let callCount = 0;
    const fn = () => callCount++;
    seq.onStep(fn);
    assert.strictEqual(seq._listeners.length, 1);
    seq.offStep(fn);
    assert.strictEqual(seq._listeners.length, 0);
  });

  it('offStep removes only the specified listener', () => {
    const seq = new Sequencer(makeMockEngine());
    const fn1 = () => {};
    const fn2 = () => {};
    seq.onStep(fn1);
    seq.onStep(fn2);
    seq.offStep(fn1);
    assert.strictEqual(seq._listeners.length, 1);
    assert.ok(seq._listeners.includes(fn2));
  });
});

// ─── stop fires reset signal ─────────────────────────────────────────────────

describe('Sequencer.stop', () => {
  it('fires all listeners with {step: -1, time: 0}', () => {
    const seq = new Sequencer(makeMockEngine());
    const received = [];
    seq.onStep(msg => received.push(msg));
    seq.stop();
    assert.strictEqual(received.length, 1);
    assert.deepStrictEqual(received[0], { step: -1, time: 0 });
  });

  it('resets currentStep to 0 on stop', () => {
    const seq = new Sequencer(makeMockEngine());
    seq._currentStep = 10;
    seq.stop();
    assert.strictEqual(seq.currentStep, 0);
  });
});

// ─── _schedule step logic ────────────────────────────────────────────────────

describe('Sequencer._schedule step advancement', () => {
  it('wraps from step 15 back to 0 in 16-step mode', () => {
    const engine = makeMockEngine(0);
    const seq = new Sequencer(engine);
    seq.bpm = 120; // stepDuration = 0.125s
    seq._steps = 16;
    seq._currentStep = 15;
    seq._nextStepTime = 0;   // will be scheduled immediately
    engine._time = 0;        // currentTime = 0, lookahead = 0.1 → schedules one step

    // Advance time so exactly one step fires
    engine._time = -0.05;    // nextStepTime(0) < -0.05+0.1=0.05 → fires once
    const fired = [];
    seq.onStep(msg => fired.push(msg.step));
    seq._schedule();

    assert.ok(fired.includes(15), `expected step 15 to fire, got [${fired}]`);
    assert.strictEqual(seq._currentStep, 0, `expected wrap to 0, got ${seq._currentStep}`);
  });

  it('wraps from step 31 back to 0 in 32-step mode', () => {
    const engine = makeMockEngine(0);
    const seq = new Sequencer(engine);
    seq.bpm = 120;
    seq._steps = 32;
    seq._currentStep = 31;
    seq._nextStepTime = 0;
    engine._time = -0.05;

    seq._schedule();
    assert.strictEqual(seq._currentStep, 0);
  });

  it('swing delays odd-numbered steps', () => {
    const engine = makeMockEngine(-0.05);
    const seq = new Sequencer(engine);
    seq.bpm = 120;           // stepDuration = 0.125s
    seq.swing = 0.5;
    seq._currentStep = 1;   // odd step → should be delayed
    seq._nextStepTime = 0;

    const fired = [];
    seq.onStep(msg => fired.push({ step: msg.step, time: msg.time }));
    seq._schedule();

    assert.ok(fired.length >= 1);
    const oddFire = fired.find(f => f.step === 1);
    assert.ok(oddFire, 'step 1 should have fired');
    // With swing=0.5, time should be nextStepTime + stepDuration * 0.5
    const expectedDelay = 0 + 0.125 * 0.5;
    assert.ok(Math.abs(oddFire.time - expectedDelay) < 0.0001,
      `expected swing delay of ${expectedDelay}, got ${oddFire.time}`);
  });

  it('swing does NOT delay even-numbered steps', () => {
    const engine = makeMockEngine(-0.05);
    const seq = new Sequencer(engine);
    seq.bpm = 120;
    seq.swing = 0.5;
    seq._currentStep = 0;   // even step → no delay
    seq._nextStepTime = 0;

    const fired = [];
    seq.onStep(msg => fired.push({ step: msg.step, time: msg.time }));
    seq._schedule();

    const evenFire = fired.find(f => f.step === 0);
    assert.ok(evenFire);
    assert.ok(Math.abs(evenFire.time - 0) < 0.0001,
      `even step should have no swing delay, got time ${evenFire.time}`);
  });
});
