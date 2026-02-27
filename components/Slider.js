/**
 * Slider.js — Vertical or horizontal fader component.
 *
 * Usage:
 *   const slider = new Slider({
 *     container: el,
 *     min: 0, max: 1, value: 0.5,
 *     orientation: 'vertical' | 'horizontal',
 *     label: 'Volume',
 *     onChange: v => { ... },
 *   });
 */
export default class Slider {
  constructor({ container, min = 0, max = 1, value, defaultValue,
    orientation = 'vertical', label = '', width = 24, height = 80,
    color = '#ff8800', onChange }) {
    this.min = min;
    this.max = max;
    this._value = value ?? (min + max) / 2;
    this.defaultValue = defaultValue ?? this._value;
    this.orientation = orientation;
    this.width = width;
    this.height = height;
    this.color = color;
    this.onChange = onChange || (() => {});

    this._dragging = false;
    this._startPos = null;
    this._startVal = null;

    this._build(container, label);
    this._render();
  }

  _build(container, label) {
    this.el = document.createElement('div');
    this.el.className = 'slider-wrap';
    this.el.style.display = 'flex';
    this.el.style.flexDirection = this.orientation === 'vertical' ? 'column' : 'row';
    this.el.style.alignItems = 'center';
    this.el.style.gap = '4px';

    const track = document.createElement('div');
    track.className = 'slider-track';
    track.style.position = 'relative';
    track.style.width = this.orientation === 'vertical' ? `${this.width}px` : `${this.height}px`;
    track.style.height = this.orientation === 'vertical' ? `${this.height}px` : `${this.width}px`;
    track.style.background = '#222';
    track.style.borderRadius = '4px';
    track.style.border = '1px solid #444';
    track.style.cursor = this.orientation === 'vertical' ? 'ns-resize' : 'ew-resize';
    track.style.userSelect = 'none';
    track.style.touchAction = 'none';

    const fill = document.createElement('div');
    fill.className = 'slider-fill';
    fill.style.position = 'absolute';
    fill.style.background = this.color;
    fill.style.borderRadius = '3px';
    fill.style.transition = 'none';
    this._fill = fill;

    const thumb = document.createElement('div');
    thumb.className = 'slider-thumb';
    thumb.style.position = 'absolute';
    thumb.style.width = this.orientation === 'vertical' ? `${this.width - 4}px` : '12px';
    thumb.style.height = this.orientation === 'vertical' ? '12px' : `${this.width - 4}px`;
    thumb.style.background = '#ddd';
    thumb.style.borderRadius = '3px';
    thumb.style.border = '1px solid #888';
    thumb.style.boxShadow = '0 1px 3px rgba(0,0,0,0.5)';
    thumb.style.left = this.orientation === 'vertical' ? '2px' : undefined;
    thumb.style.top = this.orientation === 'horizontal' ? '2px' : undefined;
    this._thumb = thumb;
    this._track = track;

    track.appendChild(fill);
    track.appendChild(thumb);

    if (label) {
      const lbl = document.createElement('div');
      lbl.className = 'slider-label';
      lbl.textContent = label;
      if (this.orientation === 'vertical') {
        this.el.appendChild(track);
        this.el.appendChild(lbl);
      } else {
        this.el.appendChild(lbl);
        this.el.appendChild(track);
      }
    } else {
      this.el.appendChild(track);
    }

    container.appendChild(this.el);

    track.addEventListener('mousedown', e => this._onMouseDown(e));
    track.addEventListener('touchstart', e => this._onTouchStart(e), { passive: false });
    track.addEventListener('wheel', e => this._onWheel(e), { passive: false });
    track.addEventListener('dblclick', () => this.setValue(this.defaultValue));
    window.addEventListener('mousemove', e => this._onMouseMove(e));
    window.addEventListener('mouseup', () => { this._dragging = false; });
    window.addEventListener('touchmove', e => this._onTouchMove(e), { passive: false });
    window.addEventListener('touchend', () => { this._dragging = false; });
  }

  _normalise(v) {
    return (v - this.min) / (this.max - this.min);
  }
  _denormalise(n) {
    return this.min + Math.max(0, Math.min(1, n)) * (this.max - this.min);
  }

  _render() {
    const n = this._normalise(this._value);
    const trackSize = this.orientation === 'vertical' ? this.height : this.height; // reuse height as length
    const thumbSize = 12;
    if (this.orientation === 'vertical') {
      const pos = (1 - n) * (this.height - thumbSize);
      this._thumb.style.top = `${pos}px`;
      this._fill.style.bottom = '0';
      this._fill.style.left = '2px';
      this._fill.style.right = '2px';
      this._fill.style.height = `${n * this.height}px`;
    } else {
      const pos = n * (this.height - thumbSize);
      this._thumb.style.left = `${pos}px`;
      this._fill.style.left = '0';
      this._fill.style.top = '2px';
      this._fill.style.bottom = '2px';
      this._fill.style.width = `${n * this.height}px`;
    }
  }

  setValue(v) {
    this._value = Math.max(this.min, Math.min(this.max, v));
    this._render();
    this.onChange(this._value);
  }

  get value() { return this._value; }

  _posToValue(e) {
    const rect = this._track.getBoundingClientRect();
    if (this.orientation === 'vertical') {
      const n = 1 - (e.clientY - rect.top) / rect.height;
      return this._denormalise(n);
    } else {
      const n = (e.clientX - rect.left) / rect.width;
      return this._denormalise(n);
    }
  }

  _onMouseDown(e) {
    e.preventDefault();
    this._dragging = true;
    this._startPos = this.orientation === 'vertical' ? e.clientY : e.clientX;
    this._startVal = this._normalise(this._value);
    this.setValue(this._posToValue(e));
  }

  _onTouchStart(e) {
    e.preventDefault();
    this._dragging = true;
    this._startPos = this.orientation === 'vertical' ? e.touches[0].clientY : e.touches[0].clientX;
    this._startVal = this._normalise(this._value);
  }

  _onMouseMove(e) {
    if (!this._dragging) return;
    this.setValue(this._posToValue(e));
  }

  _onTouchMove(e) {
    if (!this._dragging) return;
    e.preventDefault();
    const fake = { clientY: e.touches[0].clientY, clientX: e.touches[0].clientX };
    this.setValue(this._posToValue(fake));
  }

  _onWheel(e) {
    e.preventDefault();
    const step = (this.max - this.min) / 100;
    this.setValue(this._value + (e.deltaY < 0 ? step : -step));
  }
}
