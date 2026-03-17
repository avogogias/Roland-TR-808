/**
 * tests/core/midiController.test.js
 * Unit tests for core/MidiController.js — MIDI message parsing and listener routing.
 *
 * MidiController is a singleton with a closure-scoped _onMessage handler.
 * We exercise the parser by mocking navigator.requestMIDIAccess so that
 * init() wires _onMessage to a fake input port we control.
 *
 * Run:  node --test tests/core/midiController.test.js
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mock navigator.requestMIDIAccess before importing the module ─────────────
// Node.js has no navigator, so we inject a minimal fake that lets init() succeed
// and exposes the fake input so we can fire synthetic MIDI messages.
// In Node.js v22+ navigator is a read-only getter on globalThis, so we use
// Object.defineProperty to install our mock.

let fakeMidiInput;

Object.defineProperty(global, 'navigator', {
  configurable: true,
  writable: true,
  value: {
    async requestMIDIAccess() {
      fakeMidiInput = { onmidimessage: null };
      return {
        inputs: { forEach: (fn) => fn(fakeMidiInput) },
        onstatechange: null,
      };
    },
  },
});

// Now import the singleton — it will use our mocked navigator
const { default: MidiController } = await import('../../core/MidiController.js');

// Initialise once; subsequent calls are no-ops because _access is already set
// (the singleton guards internally — but we call init here to wire the fake input)
await MidiController.init();

// Helper: fire a raw MIDI event through the fake input port
function fireMidi(statusByte, data1 = 0, data2 = 0) {
  fakeMidiInput.onmidimessage({ data: [statusByte, data1, data2] });
}

// Helper: reset channel filter between tests
function resetChannel() {
  MidiController.setChannel(null);
}

// ─── Note On ─────────────────────────────────────────────────────────────────

describe('MidiController — Note On (0x90)', () => {
  beforeEach(resetChannel);

  it('velocity > 0 → type noteon with correct note and velocity', () => {
    const msgs = [];
    const id = MidiController.addListener(m => msgs.push(m));

    fireMidi(0x90, 60, 100); // channel 0, note 60, vel 100
    MidiController.removeListener(id);

    assert.strictEqual(msgs.length, 1);
    assert.strictEqual(msgs[0].type, 'noteon');
    assert.strictEqual(msgs[0].note, 60);
    assert.ok(Math.abs(msgs[0].velocity - 100 / 127) < 0.0001);
    assert.strictEqual(msgs[0].channel, 0);
  });

  it('velocity = 0 → type noteoff (running-status convention)', () => {
    const msgs = [];
    const id = MidiController.addListener(m => msgs.push(m));

    fireMidi(0x90, 60, 0);
    MidiController.removeListener(id);

    assert.strictEqual(msgs[0].type, 'noteoff');
    assert.strictEqual(msgs[0].note, 60);
    assert.strictEqual(msgs[0].velocity, 0);
  });

  it('maximum velocity 127 → 1.0', () => {
    const msgs = [];
    const id = MidiController.addListener(m => msgs.push(m));
    fireMidi(0x90, 69, 127);
    MidiController.removeListener(id);
    assert.ok(Math.abs(msgs[0].velocity - 1.0) < 0.0001);
  });
});

// ─── Note Off ────────────────────────────────────────────────────────────────

describe('MidiController — Note Off (0x80)', () => {
  beforeEach(resetChannel);

  it('explicit note-off carries note number and velocity', () => {
    const msgs = [];
    const id = MidiController.addListener(m => msgs.push(m));

    fireMidi(0x80, 48, 64);
    MidiController.removeListener(id);

    assert.strictEqual(msgs[0].type, 'noteoff');
    assert.strictEqual(msgs[0].note, 48);
    assert.ok(Math.abs(msgs[0].velocity - 64 / 127) < 0.0001);
  });
});

// ─── Pitch Bend ──────────────────────────────────────────────────────────────

describe('MidiController — Pitch Bend (0xE0)', () => {
  beforeEach(resetChannel);

  it('centre value (8192) → 0.0', () => {
    // 14-bit centre: LSB=0x00, MSB=0x40  →  0x00 | (0x40 << 7) = 8192
    const msgs = [];
    const id = MidiController.addListener(m => msgs.push(m));
    fireMidi(0xe0, 0x00, 0x40);
    MidiController.removeListener(id);

    assert.strictEqual(msgs[0].type, 'pitchbend');
    assert.ok(Math.abs(msgs[0].value - 0.0) < 0.001, `expected 0, got ${msgs[0].value}`);
  });

  it('minimum value (0) → -1.0', () => {
    const msgs = [];
    const id = MidiController.addListener(m => msgs.push(m));
    fireMidi(0xe0, 0x00, 0x00);
    MidiController.removeListener(id);
    assert.ok(Math.abs(msgs[0].value - (-1.0)) < 0.001, `expected -1, got ${msgs[0].value}`);
  });

  it('maximum value (16383) → ~+1.0', () => {
    const msgs = [];
    const id = MidiController.addListener(m => msgs.push(m));
    fireMidi(0xe0, 0x7f, 0x7f); // (0x7f << 7 | 0x7f) = 16383
    MidiController.removeListener(id);
    // (16383 - 8192) / 8192 ≈ 0.99988
    assert.ok(msgs[0].value > 0.99, `expected ~+1, got ${msgs[0].value}`);
  });
});

// ─── Control Change ──────────────────────────────────────────────────────────

describe('MidiController — Control Change (0xB0)', () => {
  beforeEach(resetChannel);

  it('CC with mid value is normalised to 0–1 range', () => {
    const msgs = [];
    const id = MidiController.addListener(m => msgs.push(m));
    fireMidi(0xb0, 74, 64); // CC 74 = filter cutoff, value 64
    MidiController.removeListener(id);

    assert.strictEqual(msgs[0].type, 'cc');
    assert.strictEqual(msgs[0].cc, 74);
    assert.ok(Math.abs(msgs[0].value - 64 / 127) < 0.0001);
  });

  it('CC value 0 → 0.0', () => {
    const msgs = [];
    const id = MidiController.addListener(m => msgs.push(m));
    fireMidi(0xb0, 7, 0);
    MidiController.removeListener(id);
    assert.ok(Math.abs(msgs[0].value - 0) < 0.0001);
  });

  it('CC value 127 → 1.0', () => {
    const msgs = [];
    const id = MidiController.addListener(m => msgs.push(m));
    fireMidi(0xb0, 7, 127);
    MidiController.removeListener(id);
    assert.ok(Math.abs(msgs[0].value - 1.0) < 0.0001);
  });
});

// ─── Unknown status bytes ─────────────────────────────────────────────────────

describe('MidiController — unknown status bytes', () => {
  it('SysEx (0xF0) and other unhandled messages are silently dropped', () => {
    const msgs = [];
    const id = MidiController.addListener(m => msgs.push(m));
    fireMidi(0xf0, 0x7e, 0x7f); // SysEx
    fireMidi(0xa0, 60, 80);      // Polyphonic aftertouch — not handled
    MidiController.removeListener(id);
    assert.strictEqual(msgs.length, 0, 'unhandled messages should not reach listeners');
  });
});

// ─── Channel filtering ───────────────────────────────────────────────────────

describe('MidiController.setChannel', () => {
  beforeEach(resetChannel);

  it('null (default) passes messages on any channel', () => {
    MidiController.setChannel(null);
    const msgs = [];
    const id = MidiController.addListener(m => msgs.push(m));

    fireMidi(0x90 | 0, 60, 100); // channel 0
    fireMidi(0x90 | 5, 60, 100); // channel 5
    MidiController.removeListener(id);

    assert.strictEqual(msgs.length, 2);
  });

  it('setChannel(2) passes only channel 2 messages', () => {
    MidiController.setChannel(2);
    const msgs = [];
    const id = MidiController.addListener(m => msgs.push(m));

    fireMidi(0x90 | 0, 60, 100); // channel 0 — should be dropped
    fireMidi(0x90 | 2, 60, 100); // channel 2 — should pass
    fireMidi(0x90 | 9, 60, 100); // channel 9 — should be dropped
    MidiController.removeListener(id);

    assert.strictEqual(msgs.length, 1);
    assert.strictEqual(msgs[0].channel, 2);
  });

  it('setChannel(0) passes only channel 0', () => {
    MidiController.setChannel(0);
    const msgs = [];
    const id = MidiController.addListener(m => msgs.push(m));

    fireMidi(0x90 | 0, 69, 80); // ch 0 → pass
    fireMidi(0x90 | 1, 69, 80); // ch 1 → drop
    MidiController.removeListener(id);

    assert.strictEqual(msgs.length, 1);
  });
});

// ─── Listener lifecycle ───────────────────────────────────────────────────────

describe('MidiController addListener / removeListener', () => {
  beforeEach(resetChannel);

  it('addListener returns a numeric ID', () => {
    const id = MidiController.addListener(() => {});
    assert.strictEqual(typeof id, 'number');
    MidiController.removeListener(id);
  });

  it('removeListener stops the callback from receiving future messages', () => {
    const msgs = [];
    const id = MidiController.addListener(m => msgs.push(m));
    fireMidi(0x90, 60, 80);       // should be received
    MidiController.removeListener(id);
    fireMidi(0x90, 60, 80);       // should NOT be received
    assert.strictEqual(msgs.length, 1);
  });

  it('multiple listeners each receive the same message independently', () => {
    const a = [], b = [];
    const idA = MidiController.addListener(m => a.push(m));
    const idB = MidiController.addListener(m => b.push(m));

    fireMidi(0x90, 72, 100);

    MidiController.removeListener(idA);
    MidiController.removeListener(idB);

    assert.strictEqual(a.length, 1);
    assert.strictEqual(b.length, 1);
    assert.deepStrictEqual(a[0].note, b[0].note);
  });

  it('each call to addListener returns a unique ID', () => {
    const id1 = MidiController.addListener(() => {});
    const id2 = MidiController.addListener(() => {});
    assert.notStrictEqual(id1, id2);
    MidiController.removeListener(id1);
    MidiController.removeListener(id2);
  });
});
