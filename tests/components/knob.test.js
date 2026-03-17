/**
 * tests/components/knob.test.js
 * Unit tests for components/Knob.js — normalisation / denormalisation math.
 *
 * The Knob constructor builds SVG DOM elements; we install a minimal DOM stub
 * before importing so the constructor doesn't throw in Node.js.
 *
 * Run:  node --test tests/components/knob.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom } from '../helpers/minimalDom.js';
installMinimalDom();

const { default: Knob } = await import('../../components/Knob.js');

// Convenience: create a Knob with a throwaway container
function makeKnob(opts) {
  const container = global.document.createElement('div');
  return new Knob({ container, ...opts });
}

// ─── Linear curve normalisation ───────────────────────────────────────────────

describe('Knob._normalise (linear)', () => {
  it('min → 0', () => {
    const k = makeKnob({ min: 0, max: 100, value: 50, curve: 'linear' });
    assert.ok(Math.abs(k._normalise(0) - 0) < 0.000001);
  });

  it('max → 1', () => {
    const k = makeKnob({ min: 0, max: 100, value: 50, curve: 'linear' });
    assert.ok(Math.abs(k._normalise(100) - 1) < 0.000001);
  });

  it('midpoint → 0.5', () => {
    const k = makeKnob({ min: 0, max: 100, value: 50, curve: 'linear' });
    assert.ok(Math.abs(k._normalise(50) - 0.5) < 0.000001);
  });

  it('quarter-way → 0.25', () => {
    const k = makeKnob({ min: 0, max: 200, value: 100, curve: 'linear' });
    assert.ok(Math.abs(k._normalise(50) - 0.25) < 0.000001);
  });
});

// ─── Linear curve denormalisation ────────────────────────────────────────────

describe('Knob._denormalise (linear)', () => {
  it('0 → min', () => {
    const k = makeKnob({ min: 20, max: 200, value: 100, curve: 'linear' });
    assert.ok(Math.abs(k._denormalise(0) - 20) < 0.000001);
  });

  it('1 → max', () => {
    const k = makeKnob({ min: 20, max: 200, value: 100, curve: 'linear' });
    assert.ok(Math.abs(k._denormalise(1) - 200) < 0.000001);
  });

  it('0.5 → midpoint', () => {
    const k = makeKnob({ min: 0, max: 100, value: 50, curve: 'linear' });
    assert.ok(Math.abs(k._denormalise(0.5) - 50) < 0.000001);
  });

  it('round-trip: denormalise(normalise(v)) ≈ v', () => {
    const k = makeKnob({ min: 50, max: 5000, value: 500, curve: 'linear' });
    for (const v of [50, 200, 1234, 5000]) {
      const roundTrip = k._denormalise(k._normalise(v));
      assert.ok(Math.abs(roundTrip - v) < 0.001, `round-trip failed for ${v}: got ${roundTrip}`);
    }
  });
});

// ─── Exponential curve normalisation ─────────────────────────────────────────

describe('Knob._normalise (exp)', () => {
  it('min → 0', () => {
    const k = makeKnob({ min: 20, max: 20000, value: 1000, curve: 'exp' });
    assert.ok(Math.abs(k._normalise(20) - 0) < 0.000001);
  });

  it('max → 1', () => {
    const k = makeKnob({ min: 20, max: 20000, value: 1000, curve: 'exp' });
    assert.ok(Math.abs(k._normalise(20000) - 1) < 0.000001);
  });

  it('geometric mean → 0.5', () => {
    const min = 20, max = 20000;
    const geomMean = Math.sqrt(min * max); // ≈ 632.45
    const k = makeKnob({ min, max, value: geomMean, curve: 'exp' });
    assert.ok(Math.abs(k._normalise(geomMean) - 0.5) < 0.000001);
  });
});

// ─── Exponential curve denormalisation ───────────────────────────────────────

describe('Knob._denormalise (exp)', () => {
  it('0 → min', () => {
    const k = makeKnob({ min: 20, max: 20000, value: 1000, curve: 'exp' });
    assert.ok(Math.abs(k._denormalise(0) - 20) < 0.001);
  });

  it('1 → max', () => {
    const k = makeKnob({ min: 20, max: 20000, value: 1000, curve: 'exp' });
    assert.ok(Math.abs(k._denormalise(1) - 20000) < 0.001);
  });

  it('0.5 → geometric mean', () => {
    const min = 20, max = 20000;
    const geomMean = Math.sqrt(min * max);
    const k = makeKnob({ min, max, value: geomMean, curve: 'exp' });
    assert.ok(Math.abs(k._denormalise(0.5) - geomMean) < 0.001);
  });

  it('round-trip: denormalise(normalise(v)) ≈ v', () => {
    const k = makeKnob({ min: 20, max: 20000, value: 1000, curve: 'exp' });
    for (const v of [20, 100, 1000, 10000, 20000]) {
      const roundTrip = k._denormalise(k._normalise(v));
      assert.ok(Math.abs(roundTrip - v) / v < 0.0001,
        `round-trip failed for ${v}: got ${roundTrip}`);
    }
  });
});

// ─── Out-of-range clamping in _denormalise ────────────────────────────────────

describe('Knob._denormalise out-of-range inputs', () => {
  it('normalised value < 0 is clamped to min', () => {
    const k = makeKnob({ min: 0, max: 100, value: 50, curve: 'linear' });
    assert.ok(Math.abs(k._denormalise(-0.5) - 0) < 0.000001);
  });

  it('normalised value > 1 is clamped to max', () => {
    const k = makeKnob({ min: 0, max: 100, value: 50, curve: 'linear' });
    assert.ok(Math.abs(k._denormalise(1.5) - 100) < 0.000001);
  });

  it('same clamping applies with exp curve', () => {
    const k = makeKnob({ min: 20, max: 20000, value: 1000, curve: 'exp' });
    assert.ok(Math.abs(k._denormalise(-1) - 20) < 0.001);
    assert.ok(Math.abs(k._denormalise(2) - 20000) < 0.001);
  });
});

// ─── setValue and default value reset ────────────────────────────────────────

describe('Knob.setValue', () => {
  it('sets the value', () => {
    const k = makeKnob({ min: 0, max: 1, value: 0.5, curve: 'linear' });
    k.setValue(0.8);
    assert.ok(Math.abs(k.value - 0.8) < 0.000001);
  });

  it('clamps values below min to min', () => {
    const k = makeKnob({ min: 0, max: 100, value: 50, curve: 'linear' });
    k.setValue(-10);
    assert.strictEqual(k.value, 0);
  });

  it('clamps values above max to max', () => {
    const k = makeKnob({ min: 0, max: 100, value: 50, curve: 'linear' });
    k.setValue(150);
    assert.strictEqual(k.value, 100);
  });

  it('fires the onChange callback with the clamped value', () => {
    const received = [];
    const k = makeKnob({ min: 0, max: 1, value: 0.5, curve: 'linear',
      onChange: v => received.push(v) });
    k.setValue(0.75);
    assert.strictEqual(received.length, 1);
    assert.ok(Math.abs(received[0] - 0.75) < 0.000001);
  });

  it('double-click event resets to defaultValue', () => {
    const k = makeKnob({ min: 0, max: 1, value: 0.5, defaultValue: 0.3, curve: 'linear' });
    k.setValue(0.9);
    // Simulate dblclick — the handler calls setValue(defaultValue)
    k._svg.dispatchEvent('dblclick');
    assert.ok(Math.abs(k.value - 0.3) < 0.000001);
  });
});

// ─── _polar geometry ─────────────────────────────────────────────────────────

describe('Knob._polar', () => {
  it('0° (top of knob) maps to (cx, cy - r)', () => {
    const k = makeKnob({ min: 0, max: 1, value: 0.5, curve: 'linear' });
    // deg=90 in _polar formula: rad = (90-90)*π/180 = 0 → cos=1, sin=0 → (cx+r, cy)
    const p = k._polar(24, 24, 18, 90);
    assert.ok(Math.abs(p.x - 42) < 0.001);
    assert.ok(Math.abs(p.y - 24) < 0.001);
  });

  it('returns finite numbers', () => {
    const k = makeKnob({ min: 0, max: 1, value: 0.5, curve: 'linear' });
    const p = k._polar(24, 24, 18, 135);
    assert.ok(isFinite(p.x) && isFinite(p.y));
  });
});
