/**
 * tests/components/padButton.test.js
 * Unit tests for components/PadButton.js — step-sequencer pad state machine.
 *
 * PadButton creates a <button> element in the constructor; we install a minimal
 * DOM stub before importing so this works in Node.js.
 *
 * Run:  node --test tests/components/padButton.test.js
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom } from '../helpers/minimalDom.js';
installMinimalDom();

const { default: PadButton } = await import('../../components/PadButton.js');

function makePad(opts = {}) {
  const container = global.document.createElement('div');
  const events = [];
  const pad = new PadButton({
    container,
    step: opts.step ?? 0,
    instrument: opts.instrument ?? 'BD',
    onChange: (e) => events.push({ ...e }),
    ...opts,
  });
  return { pad, events, container };
}

// ─── Initial state ────────────────────────────────────────────────────────────

describe('PadButton initial state', () => {
  it('enabled is false by default', () => {
    const { pad } = makePad();
    assert.strictEqual(pad.enabled, false);
  });

  it('accent is false by default', () => {
    const { pad } = makePad();
    assert.strictEqual(pad.accent, false);
  });

  it('the underlying element does not have class "enabled"', () => {
    const { pad } = makePad();
    assert.ok(!pad.el._classes.has('enabled'));
  });
});

// ─── Left-click toggles enabled ───────────────────────────────────────────────

describe('PadButton left-click (toggle enabled)', () => {
  it('first click → enabled becomes true', () => {
    const { pad } = makePad();
    pad.el.dispatchEvent('click');
    assert.strictEqual(pad.enabled, true);
  });

  it('second click → enabled becomes false', () => {
    const { pad } = makePad();
    pad.el.dispatchEvent('click');
    pad.el.dispatchEvent('click');
    assert.strictEqual(pad.enabled, false);
  });

  it('enabling adds the "enabled" CSS class', () => {
    const { pad } = makePad();
    pad.el.dispatchEvent('click');
    assert.ok(pad.el._classes.has('enabled'));
  });

  it('disabling removes the "enabled" CSS class', () => {
    const { pad } = makePad();
    pad.el.dispatchEvent('click'); // enable
    pad.el.dispatchEvent('click'); // disable
    assert.ok(!pad.el._classes.has('enabled'));
  });

  it('click fires the onChange callback', () => {
    const { pad, events } = makePad({ step: 3, instrument: 'SD' });
    pad.el.dispatchEvent('click');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].step, 3);
    assert.strictEqual(events[0].instrument, 'SD');
    assert.strictEqual(events[0].active, true);
  });
});

// ─── Disabling clears accent ──────────────────────────────────────────────────

describe('PadButton: disabling clears accent', () => {
  it('accent is forced to false when pad is disabled via click', () => {
    const { pad } = makePad();
    pad.el.dispatchEvent('click');                // enable
    pad.el.dispatchEvent('contextmenu');          // set accent
    assert.strictEqual(pad.accent, true);

    pad.el.dispatchEvent('click');                // disable
    assert.strictEqual(pad.enabled, false);
    assert.strictEqual(pad.accent, false);
  });

  it('"accent" CSS class is removed when pad is disabled', () => {
    const { pad } = makePad();
    pad.el.dispatchEvent('click');
    pad.el.dispatchEvent('contextmenu');
    assert.ok(pad.el._classes.has('accent'));

    pad.el.dispatchEvent('click'); // disable
    assert.ok(!pad.el._classes.has('accent'));
  });
});

// ─── Right-click toggles accent ───────────────────────────────────────────────

describe('PadButton right-click (toggle accent)', () => {
  it('right-click on a disabled pad has no effect', () => {
    const { pad } = makePad();
    pad.el.dispatchEvent('contextmenu');
    assert.strictEqual(pad.accent, false);
  });

  it('right-click on an enabled pad sets accent to true', () => {
    const { pad } = makePad();
    pad.el.dispatchEvent('click');        // enable
    pad.el.dispatchEvent('contextmenu'); // accent on
    assert.strictEqual(pad.accent, true);
  });

  it('second right-click toggles accent back to false', () => {
    const { pad } = makePad();
    pad.el.dispatchEvent('click');
    pad.el.dispatchEvent('contextmenu');
    pad.el.dispatchEvent('contextmenu');
    assert.strictEqual(pad.accent, false);
  });

  it('accent adds the "accent" CSS class', () => {
    const { pad } = makePad();
    pad.el.dispatchEvent('click');
    pad.el.dispatchEvent('contextmenu');
    assert.ok(pad.el._classes.has('accent'));
  });

  it('right-click fires onChange with correct accent flag', () => {
    const { pad, events } = makePad({ step: 7 });
    pad.el.dispatchEvent('click');        // enable
    pad.el.dispatchEvent('contextmenu'); // accent on
    const accentEvent = events[events.length - 1];
    assert.strictEqual(accentEvent.accent, true);
    assert.strictEqual(accentEvent.active, true);
  });
});

// ─── setEnabled API ───────────────────────────────────────────────────────────

describe('PadButton.setEnabled', () => {
  it('setEnabled(true) enables the pad', () => {
    const { pad } = makePad();
    pad.setEnabled(true);
    assert.strictEqual(pad.enabled, true);
  });

  it('setEnabled(false) disables the pad', () => {
    const { pad } = makePad();
    pad.setEnabled(true);
    pad.setEnabled(false);
    assert.strictEqual(pad.enabled, false);
  });

  it('setEnabled(true, true) sets both enabled and accent', () => {
    const { pad } = makePad();
    pad.setEnabled(true, true);
    assert.strictEqual(pad.enabled, true);
    assert.strictEqual(pad.accent, true);
  });

  it('setEnabled(false) clears accent even if accent was true', () => {
    const { pad } = makePad();
    pad.setEnabled(true, true); // enabled + accent
    pad.setEnabled(false);
    assert.strictEqual(pad.accent, false);
  });
});

// ─── setActive / playing highlight ───────────────────────────────────────────

describe('PadButton.setActive', () => {
  it('setActive(true) adds "playing" CSS class', () => {
    const { pad } = makePad();
    pad.setActive(true);
    assert.ok(pad.el._classes.has('playing'));
  });

  it('setActive(false) removes "playing" CSS class', () => {
    const { pad } = makePad();
    pad.setActive(true);
    pad.setActive(false);
    assert.ok(!pad.el._classes.has('playing'));
  });

  it('setActive does not change enabled or accent state', () => {
    const { pad } = makePad();
    pad.setActive(true);
    assert.strictEqual(pad.enabled, false);
    assert.strictEqual(pad.accent, false);
  });
});

// ─── DOM attribute checks ─────────────────────────────────────────────────────

describe('PadButton DOM attributes', () => {
  it('element has data-step attribute set to step index', () => {
    const { pad } = makePad({ step: 5 });
    assert.strictEqual(pad.el._attrs['data-step'], 5);
  });

  it('element has data-instrument attribute set to instrument key', () => {
    const { pad } = makePad({ instrument: 'CH' });
    assert.strictEqual(pad.el._attrs['data-instrument'], 'CH');
  });

  it('element has a title attribute for accessibility', () => {
    const { pad } = makePad({ step: 0 });
    assert.ok(pad.el._attrs['title'], 'expected a title attribute for accessibility');
  });
});
