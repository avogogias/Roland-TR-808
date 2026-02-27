/**
 * PadButton.js — Step-sequencer pad button.
 * Supports: on/off toggle, accent (right-click), active step highlight.
 *
 * Usage:
 *   const pad = new PadButton({ container: el, step: 0, instrument: 'BD',
 *     onChange: ({step, instrument, active, accent}) => { ... } });
 *   pad.setActive(true);     // highlight as current playing step
 *   pad.setEnabled(true);    // turn on this step
 */
export default class PadButton {
  constructor({ container, step = 0, instrument = '', onChange }) {
    this.step = step;
    this.instrument = instrument;
    this._enabled = false;
    this._accent = false;
    this._active = false;
    this.onChange = onChange || (() => {});

    this._build(container);
  }

  _build(container) {
    this.el = document.createElement('button');
    this.el.className = 'pad-btn';
    this.el.setAttribute('data-step', this.step);
    this.el.setAttribute('data-instrument', this.instrument);
    this.el.setAttribute('title', `Step ${this.step + 1}`);

    this.el.addEventListener('click', e => {
      e.preventDefault();
      this._enabled = !this._enabled;
      if (!this._enabled) this._accent = false;
      this._update();
      this.onChange({ step: this.step, instrument: this.instrument,
        active: this._enabled, accent: this._accent });
    });

    this.el.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (this._enabled) {
        this._accent = !this._accent;
        this._update();
        this.onChange({ step: this.step, instrument: this.instrument,
          active: this._enabled, accent: this._accent });
      }
    });

    container.appendChild(this.el);
    this._update();
  }

  _update() {
    this.el.classList.toggle('enabled', this._enabled);
    this.el.classList.toggle('accent', this._accent);
    this.el.classList.toggle('playing', this._active);
  }

  setEnabled(v, accent = false) {
    this._enabled = v;
    this._accent = accent;
    this._update();
  }

  setActive(v) {
    this._active = v;
    this._update();
  }

  get enabled() { return this._enabled; }
  get accent() { return this._accent; }
}
