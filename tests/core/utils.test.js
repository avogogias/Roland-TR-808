/**
 * tests/core/utils.test.js
 * Unit tests for core/utils.js — all pure functions, no DOM or AudioContext needed.
 *
 * Run:  node --test tests/core/utils.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  noteToHz,
  noteNameToMidi,
  linToExp,
  clamp,
  scheduleADSR,
  scheduleRelease,
  schedulePercEnv,
  createNoiseBuffer,
  QWERTY_NOTE_MAP,
} from '../../core/utils.js';

// ─── noteToHz ────────────────────────────────────────────────────────────────

describe('noteToHz', () => {
  it('MIDI 69 (A4) → 440 Hz', () => {
    assert.strictEqual(noteToHz(69), 440);
  });

  it('MIDI 57 (A3) → 220 Hz', () => {
    assert.strictEqual(noteToHz(57), 220);
  });

  it('MIDI 81 (A5) → 880 Hz', () => {
    assert.strictEqual(noteToHz(81), 880);
  });

  it('MIDI 60 (Middle C) ≈ 261.63 Hz', () => {
    assert.ok(Math.abs(noteToHz(60) - 261.6255653) < 0.001);
  });

  it('MIDI 0 is a valid (very low) positive frequency', () => {
    const hz = noteToHz(0);
    assert.ok(hz > 0, `expected positive frequency, got ${hz}`);
    assert.ok(hz < 20, `expected sub-audio range, got ${hz}`);
  });

  it('MIDI 127 is a valid (very high) frequency', () => {
    const hz = noteToHz(127);
    assert.ok(hz > 10000, `expected high frequency, got ${hz}`);
    assert.ok(hz < 15000, `expected to be below 15 kHz, got ${hz}`);
  });

  it('each semitone up multiplies frequency by 2^(1/12)', () => {
    const ratio = noteToHz(70) / noteToHz(69);
    assert.ok(Math.abs(ratio - Math.pow(2, 1 / 12)) < 0.000001);
  });

  it('one octave up doubles the frequency', () => {
    assert.ok(Math.abs(noteToHz(81) / noteToHz(69) - 2) < 0.000001);
  });
});

// ─── noteNameToMidi ──────────────────────────────────────────────────────────

describe('noteNameToMidi', () => {
  it('C4 → 60', () => {
    assert.strictEqual(noteNameToMidi('C', 4), 60);
  });

  it('A4 → 69', () => {
    assert.strictEqual(noteNameToMidi('A', 4), 69);
  });

  it('C#4 → 61', () => {
    assert.strictEqual(noteNameToMidi('C#', 4), 61);
  });

  it('Db4 → 61 (enharmonic with C#4)', () => {
    assert.strictEqual(noteNameToMidi('Db', 4), 61);
  });

  it('Bb4 → 70', () => {
    assert.strictEqual(noteNameToMidi('Bb', 4), 70);
  });

  it('A#4 → 70 (enharmonic with Bb4)', () => {
    assert.strictEqual(noteNameToMidi('A#', 4), 70);
  });

  it('C0 → 12', () => {
    assert.strictEqual(noteNameToMidi('C', 0), 12);
  });

  it('invalid note name falls back to 0 offset (C)', () => {
    // map[undefined] ?? 0 → 0, so result is same as noteNameToMidi('C', octave)
    const result = noteNameToMidi('Z', 4);
    assert.strictEqual(result, noteNameToMidi('C', 4));
  });
});

// ─── linToExp ────────────────────────────────────────────────────────────────

describe('linToExp', () => {
  it('value=0 returns min', () => {
    assert.strictEqual(linToExp(0, 100, 10000), 100);
  });

  it('value=1 returns max', () => {
    assert.strictEqual(linToExp(1, 100, 10000), 10000);
  });

  it('value=0.5 returns geometric mean of min and max', () => {
    const geomMean = Math.sqrt(100 * 10000); // 1000
    assert.ok(Math.abs(linToExp(0.5, 100, 10000) - geomMean) < 0.0001);
  });

  it('is monotonically increasing for min < max', () => {
    const prev = linToExp(0.3, 20, 20000);
    const next = linToExp(0.6, 20, 20000);
    assert.ok(next > prev);
  });

  it('works for min=1, max=2 (small range)', () => {
    assert.ok(Math.abs(linToExp(0, 1, 2) - 1) < 0.0001);
    assert.ok(Math.abs(linToExp(1, 1, 2) - 2) < 0.0001);
  });
});

// ─── clamp ───────────────────────────────────────────────────────────────────

describe('clamp', () => {
  it('value within range is returned unchanged', () => {
    assert.strictEqual(clamp(0.5, 0, 1), 0.5);
  });

  it('value below min is clamped to min', () => {
    assert.strictEqual(clamp(-5, 0, 10), 0);
  });

  it('value above max is clamped to max', () => {
    assert.strictEqual(clamp(15, 0, 10), 10);
  });

  it('value equal to min is returned as-is', () => {
    assert.strictEqual(clamp(0, 0, 10), 0);
  });

  it('value equal to max is returned as-is', () => {
    assert.strictEqual(clamp(10, 0, 10), 10);
  });

  it('works with negative ranges', () => {
    assert.strictEqual(clamp(-100, -50, -10), -50);
    assert.strictEqual(clamp(0, -50, -10), -10);
    assert.strictEqual(clamp(-30, -50, -10), -30);
  });
});

// ─── QWERTY_NOTE_MAP ─────────────────────────────────────────────────────────

describe('QWERTY_NOTE_MAP', () => {
  it('key "a" maps to MIDI 48 (C3)', () => {
    assert.strictEqual(QWERTY_NOTE_MAP['a'], 48);
  });

  it('key "k" maps to MIDI 60 (C4, one octave above "a")', () => {
    assert.strictEqual(QWERTY_NOTE_MAP['k'], 60);
  });

  it('all mapped values are valid MIDI note numbers (0–127)', () => {
    for (const [key, midi] of Object.entries(QWERTY_NOTE_MAP)) {
      assert.ok(midi >= 0 && midi <= 127, `key "${key}" has out-of-range MIDI ${midi}`);
    }
  });

  it('contains at least 13 keys (one octave + one semitone)', () => {
    assert.ok(Object.keys(QWERTY_NOTE_MAP).length >= 13);
  });

  it('all MIDI values are unique (no duplicate note assignments)', () => {
    const values = Object.values(QWERTY_NOTE_MAP);
    const unique = new Set(values);
    assert.strictEqual(unique.size, values.length);
  });
});

// ─── createNoiseBuffer ───────────────────────────────────────────────────────

describe('createNoiseBuffer', () => {
  // Minimal mock AudioContext — just needs sampleRate + createBuffer
  function makeMockCtx(sr = 44100) {
    return {
      sampleRate: sr,
      createBuffer(channels, length, rate) {
        const channelData = Array.from({ length: channels }, () => new Float32Array(length));
        return {
          numberOfChannels: channels,
          length,
          sampleRate: rate,
          getChannelData: (i) => channelData[i],
        };
      },
    };
  }

  it('returns a mono buffer', () => {
    const ctx = makeMockCtx();
    const buf = createNoiseBuffer(ctx);
    assert.strictEqual(buf.numberOfChannels, 1);
  });

  it('buffer length equals sampleRate × 2 (default 2s)', () => {
    const sr = 44100;
    const ctx = makeMockCtx(sr);
    const buf = createNoiseBuffer(ctx);
    assert.strictEqual(buf.length, sr * 2);
  });

  it('honours the seconds parameter', () => {
    const sr = 44100;
    const ctx = makeMockCtx(sr);
    const buf = createNoiseBuffer(ctx, 0.5);
    assert.strictEqual(buf.length, sr * 0.5);
  });

  it('all samples are in the range [-1, 1]', () => {
    const ctx = makeMockCtx();
    const buf = createNoiseBuffer(ctx);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      assert.ok(data[i] >= -1 && data[i] <= 1, `sample[${i}] = ${data[i]} out of range`);
    }
  });

  it('samples are not all the same value (basic randomness check)', () => {
    const ctx = makeMockCtx();
    const buf = createNoiseBuffer(ctx);
    const data = buf.getChannelData(0);
    const first = data[0];
    const allSame = Array.from(data).every(v => v === first);
    assert.ok(!allSame, 'all noise samples are identical — randomness broken');
  });
});

// ─── scheduleADSR ────────────────────────────────────────────────────────────

describe('scheduleADSR', () => {
  function makeParam() {
    const calls = [];
    return {
      calls,
      cancelScheduledValues: (t) => calls.push(['cancelScheduledValues', t]),
      setValueAtTime: (v, t) => calls.push(['setValueAtTime', v, t]),
      linearRampToValueAtTime: (v, t) => calls.push(['linearRampToValueAtTime', v, t]),
      value: 0,
    };
  }

  it('returns the sustain start time (now + a + d)', () => {
    const param = makeParam();
    const now = 1.0;
    const result = scheduleADSR(param, null, 0.01, 0.1, 0.7, 0.5, now);
    assert.ok(Math.abs(result - (now + 0.01 + 0.1)) < 0.0001);
  });

  it('first call is cancelScheduledValues at now', () => {
    const param = makeParam();
    scheduleADSR(param, null, 0.01, 0.1, 0.7, 0.5, 2.0);
    assert.deepStrictEqual(param.calls[0], ['cancelScheduledValues', 2.0]);
  });

  it('sets initial value to 0 at now', () => {
    const param = makeParam();
    scheduleADSR(param, null, 0.01, 0.1, 0.7, 0.5, 2.0);
    assert.deepStrictEqual(param.calls[1], ['setValueAtTime', 0, 2.0]);
  });

  it('ramps to peakLevel at now + attack', () => {
    const param = makeParam();
    scheduleADSR(param, null, 0.01, 0.1, 0.7, 0.5, 2.0, 0.9);
    const ramp = param.calls.find(c => c[0] === 'linearRampToValueAtTime' && Math.abs(c[1] - 0.9) < 0.0001);
    assert.ok(ramp, 'peak ramp not found');
    assert.ok(Math.abs(ramp[2] - (2.0 + 0.01)) < 0.0001);
  });

  it('ramps to sustain level (s × peak) at now + attack + decay', () => {
    const param = makeParam();
    scheduleADSR(param, null, 0.01, 0.1, 0.7, 0.5, 2.0, 1.0);
    const sustainRamp = param.calls.filter(c => c[0] === 'linearRampToValueAtTime');
    const decayRamp = sustainRamp[1]; // second ramp is decay→sustain
    assert.ok(Math.abs(decayRamp[1] - 0.7) < 0.0001, `sustain level should be 0.7, got ${decayRamp[1]}`);
    assert.ok(Math.abs(decayRamp[2] - (2.0 + 0.01 + 0.1)) < 0.0001);
  });
});

// ─── scheduleRelease ─────────────────────────────────────────────────────────

describe('scheduleRelease', () => {
  it('captures current value and ramps to near-zero', () => {
    const calls = [];
    const param = {
      value: 0.6,
      cancelScheduledValues: (t) => calls.push(['cancel', t]),
      setValueAtTime: (v, t) => calls.push(['set', v, t]),
      linearRampToValueAtTime: (v, t) => calls.push(['ramp', v, t]),
    };
    scheduleRelease(param, 5.0, 0.3);
    assert.deepStrictEqual(calls[0], ['cancel', 5.0]);
    assert.deepStrictEqual(calls[1], ['set', 0.6, 5.0]);
    // Final ramp target should be ~0 (0.00001) at now + r
    assert.ok(calls[2][1] < 0.001, `expected near-zero target, got ${calls[2][1]}`);
    assert.ok(Math.abs(calls[2][2] - 5.3) < 0.0001, `expected time 5.3, got ${calls[2][2]}`);
  });
});
