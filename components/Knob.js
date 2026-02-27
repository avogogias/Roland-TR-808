/**
 * Knob.js — SVG rotary encoder component.
 *
 * Usage:
 *   const knob = new Knob({
 *     container: document.getElementById('myKnob'),
 *     min: 0, max: 1, value: 0.5,
 *     size: 48,
 *     label: 'Cutoff',
 *     curve: 'linear' | 'exp',
 *     onChange: v => synth.setCutoff(v),
 *   });
 *   knob.setValue(0.8); // programmatic update
 */
export default class Knob {
  constructor({ container, min = 0, max = 1, value, defaultValue,
    size = 48, label = '', curve = 'linear', onChange, color = '#ff8800' }) {
    this.min = min;
    this.max = max;
    this._value = value ?? (min + max) / 2;
    this.defaultValue = defaultValue ?? this._value;
    this.size = size;
    this.curve = curve;
    this.onChange = onChange || (() => {});
    this.color = color;

    this._startY = null;
    this._startVal = null;
    this._dragging = false;

    this._build(container, label);
    this._render();
  }

  _build(container, label) {
    this.el = document.createElement('div');
    this.el.className = 'knob-wrap';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', this.size);
    svg.setAttribute('height', this.size);
    svg.style.cursor = 'ns-resize';
    svg.style.userSelect = 'none';
    svg.style.touchAction = 'none';

    // Background circle
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bg.setAttribute('cx', this.size / 2);
    bg.setAttribute('cy', this.size / 2);
    bg.setAttribute('r', this.size / 2 - 2);
    bg.setAttribute('fill', '#1a1a1a');
    bg.setAttribute('stroke', '#444');
    bg.setAttribute('stroke-width', '1.5');

    // Arc track (grey background arc)
    const R = this.size / 2 - 6;
    const cx = this.size / 2;
    const cy = this.size / 2;
    const startAngle = 135; // degrees, going clockwise
    const endAngle = 405;

    this._R = R;
    this._cx = cx;
    this._cy = cy;

    const trackArc = this._makeArc(cx, cy, R, startAngle, endAngle);
    trackArc.setAttribute('stroke', '#333');
    trackArc.setAttribute('stroke-width', '3');
    trackArc.setAttribute('fill', 'none');
    trackArc.setAttribute('stroke-linecap', 'round');

    // Value arc (colored)
    this._valueArc = this._makeArc(cx, cy, R, startAngle, endAngle);
    this._valueArc.setAttribute('stroke', this.color);
    this._valueArc.setAttribute('stroke-width', '3');
    this._valueArc.setAttribute('fill', 'none');
    this._valueArc.setAttribute('stroke-linecap', 'round');

    // Indicator dot
    this._indicator = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    this._indicator.setAttribute('r', '3');
    this._indicator.setAttribute('fill', '#fff');

    svg.appendChild(bg);
    svg.appendChild(trackArc);
    svg.appendChild(this._valueArc);
    svg.appendChild(this._indicator);

    if (label) {
      const lbl = document.createElement('div');
      lbl.className = 'knob-label';
      lbl.textContent = label;
      this.el.appendChild(svg);
      this.el.appendChild(lbl);
    } else {
      this.el.appendChild(svg);
    }

    container.appendChild(this.el);
    this._svg = svg;

    // Events
    svg.addEventListener('mousedown', e => this._onMouseDown(e));
    svg.addEventListener('touchstart', e => this._onTouchStart(e), { passive: false });
    svg.addEventListener('wheel', e => this._onWheel(e), { passive: false });
    svg.addEventListener('dblclick', () => this.setValue(this.defaultValue));
    window.addEventListener('mousemove', e => this._onMouseMove(e));
    window.addEventListener('mouseup', () => this._onMouseUp());
    window.addEventListener('touchmove', e => this._onTouchMove(e), { passive: false });
    window.addEventListener('touchend', () => this._onMouseUp());
  }

  _makeArc(cx, cy, r, startDeg, endDeg) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', this._arcPath(cx, cy, r, startDeg, endDeg));
    return path;
  }

  _arcPath(cx, cy, r, startDeg, endDeg) {
    const s = this._polar(cx, cy, r, startDeg);
    const e = this._polar(cx, cy, r, endDeg);
    const large = (endDeg - startDeg) > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  _polar(cx, cy, r, deg) {
    const rad = (deg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  _normalise(v) {
    if (this.curve === 'exp') {
      return Math.log(v / this.min) / Math.log(this.max / this.min);
    }
    return (v - this.min) / (this.max - this.min);
  }

  _denormalise(n) {
    n = Math.max(0, Math.min(1, n));
    if (this.curve === 'exp') {
      return this.min * Math.pow(this.max / this.min, n);
    }
    return this.min + n * (this.max - this.min);
  }

  _render() {
    const n = this._normalise(this._value);
    const startAngle = 135;
    const totalArc = 270;
    const endAngle = startAngle + n * totalArc;

    // Update value arc
    if (n <= 0) {
      this._valueArc.setAttribute('d', '');
    } else {
      this._valueArc.setAttribute('d', this._arcPath(this._cx, this._cy, this._R, startAngle, endAngle));
    }

    // Update indicator
    const indicatorAngle = startAngle + n * totalArc;
    const iR = this._R - 3;
    const ip = this._polar(this._cx, this._cy, iR, indicatorAngle);
    this._indicator.setAttribute('cx', ip.x);
    this._indicator.setAttribute('cy', ip.y);
  }

  setValue(v) {
    this._value = Math.max(this.min, Math.min(this.max, v));
    this._render();
    this.onChange(this._value);
  }

  get value() { return this._value; }

  _onMouseDown(e) {
    e.preventDefault();
    this._dragging = true;
    this._startY = e.clientY;
    this._startVal = this._normalise(this._value);
  }

  _onTouchStart(e) {
    e.preventDefault();
    this._dragging = true;
    this._startY = e.touches[0].clientY;
    this._startVal = this._normalise(this._value);
  }

  _onMouseMove(e) {
    if (!this._dragging) return;
    const dy = this._startY - e.clientY;
    const sensitivity = e.shiftKey ? 0.002 : 0.01;
    const n = Math.max(0, Math.min(1, this._startVal + dy * sensitivity));
    this.setValue(this._denormalise(n));
  }

  _onTouchMove(e) {
    if (!this._dragging) return;
    e.preventDefault();
    const dy = this._startY - e.touches[0].clientY;
    const n = Math.max(0, Math.min(1, this._startVal + dy * 0.01));
    this.setValue(this._denormalise(n));
  }

  _onMouseUp() { this._dragging = false; }

  _onWheel(e) {
    e.preventDefault();
    const step = (this.max - this.min) / 200;
    this.setValue(this._value + (e.deltaY < 0 ? step : -step));
  }
}
