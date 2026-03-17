/**
 * tests/helpers/minimalDom.js
 * Minimal DOM stubs for running component tests in Node.js.
 *
 * Provides just enough of document / window to let Knob.js and
 * PadButton.js construct without throwing, without running any real
 * rendering or layout code.
 */

function makeElement(tag) {
  const el = {
    _tag: tag,
    _attrs: {},
    _children: [],
    _classes: new Set(),
    _listeners: {},
    className: '',
    textContent: '',
    style: {},

    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k] ?? null; },
    appendChild(child) { this._children.push(child); return child; },

    addEventListener(type, fn, opts) {
      if (!this._listeners[type]) this._listeners[type] = [];
      this._listeners[type].push(fn);
    },
    removeEventListener() {},

    // Simulate a DOM event dispatch (for click, contextmenu, etc.)
    dispatchEvent(type, eventProps = {}) {
      const fns = this._listeners[type] || [];
      const event = { type, preventDefault: () => {}, ...eventProps };
      fns.forEach(fn => fn(event));
    },

    classList: null, // set below after construction
  };

  el.classList = {
    _el: el,
    add(cls) { el._classes.add(cls); },
    remove(cls) { el._classes.delete(cls); },
    toggle(cls, force) {
      if (force === undefined ? !el._classes.has(cls) : force) {
        el._classes.add(cls);
      } else {
        el._classes.delete(cls);
      }
    },
    contains(cls) { return el._classes.has(cls); },
  };

  return el;
}

function makeSvgElement(tag) {
  const el = makeElement(tag);
  el._ns = 'svg';
  return el;
}

export function installMinimalDom() {
  global.document = {
    createElement: (tag) => makeElement(tag),
    createElementNS: (_ns, tag) => makeSvgElement(tag),
  };

  global.window = {
    _listeners: {},
    addEventListener(type, fn) {
      if (!this._listeners[type]) this._listeners[type] = [];
      this._listeners[type].push(fn);
    },
    removeEventListener() {},
  };
}
