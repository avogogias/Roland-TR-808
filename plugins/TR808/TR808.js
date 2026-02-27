/**
 * TR808.js — Roland TR-808 drum machine.
 * Integrates all drum voices with a 16-step sequencer and UI.
 */
import AudioEngine   from '../../core/AudioEngine.js';
import Sequencer     from '../../core/Sequencer.js';
import Knob          from '../../components/Knob.js';
import PadButton     from '../../components/PadButton.js';

import BassDrum  from './voices/BassDrum.js';
import SnareDrum from './voices/SnareDrum.js';
import HiHat     from './voices/HiHat.js';
import Tom       from './voices/Tom.js';
import Clap      from './voices/Clap.js';
import Clave     from './voices/Clave.js';
import Cowbell   from './voices/Cowbell.js';
import Cymbal    from './voices/Cymbal.js';

export default class TR808 {
  constructor(rootEl) {
    this._root = rootEl;
    this._seq  = new Sequencer(AudioEngine);

    const ctx  = AudioEngine.getContext();
    const dest = AudioEngine.getMasterOutput();

    // ── Voices ────────────────────────────────────────────────────────
    this._voices = {
      BD: new BassDrum(ctx, dest),
      SD: new SnareDrum(ctx, dest),
      CH: { triggerCH: t => this._hihat.triggerCH(t) },
      OH: { triggerOH: t => this._hihat.triggerOH(t) },
      LT: new Tom(ctx, dest, 'LT'),
      MT: new Tom(ctx, dest, 'MT'),
      HT: new Tom(ctx, dest, 'HT'),
      LC: new Tom(ctx, dest, 'LC'),
      MC: new Tom(ctx, dest, 'MC'),
      HC: new Tom(ctx, dest, 'HC'),
      CP: new Clap(ctx, dest),
      RS: new Clave(ctx, dest),
      CB: new Cowbell(ctx, dest),
      CY: new Cymbal(ctx, dest),
    };
    this._hihat = new HiHat(ctx, dest);
    this._voices.CH = { trigger: t => this._hihat.triggerCH(t) };
    this._voices.OH = { trigger: t => this._hihat.triggerOH(t) };

    // Normalise voice interface
    Object.values(this._voices).forEach(v => {
      if (!v.trigger) v.trigger = v.triggerCH || v.triggerOH || (() => {});
    });

    // ── Pattern: 14 instruments × 16 steps [active, accent] ──────────
    this._instrumentKeys = ['BD','SD','CH','OH','HT','MT','LT','HC','MC','LC','CY','CB','RS','CP'];
    this._steps = 16;
    this._pattern = {};
    this._instrumentKeys.forEach(k => {
      this._pattern[k] = Array.from({length: this._steps}, () => ({ on: false, accent: false }));
    });

    // ── Sequencer callback ────────────────────────────────────────────
    this._seq.onStep(({ step, time }) => {
      if (step === -1) { this._highlightStep(-1); return; }
      this._instrumentKeys.forEach(k => {
        const s = this._pattern[k][step];
        if (s.on) {
          const v = this._voices[k];
          if (v && v.trigger) v.trigger(time);
        }
      });
      this._highlightStep(step);
    });

    this._pads = {};  // instrument → PadButton[]
    this._lastStep = -1;
  }

  // ── UI ───────────────────────────────────────────────────────────────

  buildUI() {
    const root = this._root;
    root.innerHTML = '';
    root.className = 'tr808';

    // Header
    const hdr = el('div', 'tr808-header');
    hdr.innerHTML = `
      <div class="tr808-logo">
        <span class="tr808-brand">ROLAND</span>
        <span class="tr808-model">TR-808</span>
        <span class="tr808-subtitle">Rhythm Composer</span>
      </div>`;
    root.appendChild(hdr);

    // Transport bar
    const transport = el('div', 'tr808-transport');
    transport.appendChild(this._buildTransport());
    root.appendChild(transport);

    // Main panel
    const panel = el('div', 'tr808-panel');

    // Instrument rows
    const instrumentLabels = {
      BD:'Bass Drum', SD:'Snare Drum', CH:'Clsd Hi-Hat', OH:'Open Hi-Hat',
      HT:'High Tom', MT:'Mid Tom', LT:'Low Tom',
      HC:'High Conga', MC:'Mid Conga', LC:'Low Conga',
      CY:'Cymbal', CB:'Cowbell', RS:'Rim Shot', CP:'Hand Clap',
    };

    this._instrumentKeys.forEach((key, rowIdx) => {
      const row = el('div', 'tr808-row');
      row.classList.add(rowIdx % 2 === 0 ? 'row-even' : 'row-odd');

      // Label
      const lbl = el('div', 'tr808-inst-label');
      lbl.textContent = instrumentLabels[key];
      row.appendChild(lbl);

      // Knobs for this instrument
      row.appendChild(this._buildVoiceControls(key));

      // 16 step pads
      const padsDiv = el('div', 'tr808-pads');
      this._pads[key] = [];
      for (let s = 0; s < this._steps; s++) {
        const pad = new PadButton({
          container: padsDiv,
          step: s,
          instrument: key,
          onChange: ({ step, active, accent }) => {
            this._pattern[key][step].on = active;
            this._pattern[key][step].accent = accent;
          },
        });
        // Add beat-group visual separator
        if (s === 4 || s === 8 || s === 12) {
          padsDiv.lastElementChild.style.marginLeft = '8px';
        }
        this._pads[key].push(pad);
      }
      row.appendChild(padsDiv);
      panel.appendChild(row);
    });

    root.appendChild(panel);

    // Demo pattern (classic 808 house beat)
    this._loadDemoPattern();
  }

  _buildTransport() {
    const wrap = el('div', 'tr808-transport-inner');

    // Tempo
    const tempoWrap = el('div', 'tr808-tempo-wrap');
    const tempoLbl = el('span', 'tr808-ctrl-label'); tempoLbl.textContent = 'TEMPO';
    const tempoInput = el('input', 'tr808-tempo-input');
    tempoInput.type  = 'number';
    tempoInput.min   = '40';
    tempoInput.max   = '300';
    tempoInput.value = '120';
    tempoInput.addEventListener('input', () => {
      this._seq.bpm = parseFloat(tempoInput.value) || 120;
    });
    tempoWrap.appendChild(tempoLbl);
    tempoWrap.appendChild(tempoInput);
    wrap.appendChild(tempoWrap);

    // Swing
    const swingWrap = el('div', 'tr808-swing-wrap');
    const swingKnob = el('div', 'tr808-swing-knob');
    new Knob({
      container: swingKnob, min: 0, max: 0.5, value: 0, size: 36,
      label: 'SWING', color: '#ff8800',
      onChange: v => { this._seq.swing = v; },
    });
    swingWrap.appendChild(swingKnob);
    wrap.appendChild(swingWrap);

    // Start / Stop
    const startBtn = el('button', 'tr808-btn tr808-btn-start');
    startBtn.textContent = '▶ START';
    startBtn.addEventListener('click', () => {
      AudioEngine.resume();
      this._seq.start();
      startBtn.classList.add('active');
      stopBtn.classList.remove('active');
    });

    const stopBtn = el('button', 'tr808-btn tr808-btn-stop');
    stopBtn.textContent = '■ STOP';
    stopBtn.addEventListener('click', () => {
      this._seq.stop();
      stopBtn.classList.add('active');
      startBtn.classList.remove('active');
      this._clearHighlights();
    });

    wrap.appendChild(startBtn);
    wrap.appendChild(stopBtn);

    return wrap;
  }

  _buildVoiceControls(key) {
    const wrap = el('div', 'tr808-voice-controls');
    const v = this._voices[key];

    if (!v) return wrap;

    const knobDefs = this._knobDefs(key);

    knobDefs.forEach(({ param, label, min, max, defaultVal, curve }) => {
      const kDiv = el('div', 'tr808-knob');
      new Knob({
        container: kDiv,
        min, max,
        value: defaultVal,
        defaultValue: defaultVal,
        size: 36,
        label,
        curve: curve || 'linear',
        color: '#ff8800',
        onChange: val => { if (v[param] !== undefined) v[param] = val; },
      });
      wrap.appendChild(kDiv);
    });

    return wrap;
  }

  _knobDefs(key) {
    const MAP = {
      BD: [
        { param:'tune',  label:'TUNE',  min:0, max:1, defaultVal:0.5 },
        { param:'decay', label:'DECAY', min:0, max:1, defaultVal:0.5 },
        { param:'level', label:'LEVEL', min:0, max:1, defaultVal:0.85 },
      ],
      SD: [
        { param:'tone',   label:'TONE',   min:0, max:1, defaultVal:0.5 },
        { param:'snappy', label:'SNAPPY', min:0, max:1, defaultVal:0.5 },
        { param:'decay',  label:'DECAY',  min:0, max:1, defaultVal:0.5 },
        { param:'level',  label:'LEVEL',  min:0, max:1, defaultVal:0.8 },
      ],
      CH: [
        { param:'decayCH', label:'DECAY', min:0, max:1, defaultVal:0.5 },
        { param:'levelCH', label:'LEVEL', min:0, max:1, defaultVal:0.75 },
      ],
      OH: [
        { param:'decayOH', label:'DECAY', min:0, max:1, defaultVal:0.5 },
        { param:'levelOH', label:'LEVEL', min:0, max:1, defaultVal:0.75 },
      ],
      CY: [
        { param:'tune',  label:'TUNE',  min:0, max:1, defaultVal:0.5 },
        { param:'decay', label:'DECAY', min:0, max:1, defaultVal:0.5 },
        { param:'level', label:'LEVEL', min:0, max:1, defaultVal:0.6 },
      ],
      CB: [
        { param:'tune',  label:'TUNE',  min:0, max:1, defaultVal:0.5 },
        { param:'decay', label:'DECAY', min:0, max:1, defaultVal:0.5 },
        { param:'level', label:'LEVEL', min:0, max:1, defaultVal:0.7 },
      ],
      CP: [
        { param:'level', label:'LEVEL', min:0, max:1, defaultVal:0.8 },
      ],
      RS: [
        { param:'level', label:'LEVEL', min:0, max:1, defaultVal:0.8 },
      ],
    };

    // Toms + Congas share same knobs
    const tom = [
      { param:'tune',  label:'TUNE',  min:0, max:1, defaultVal:0.5 },
      { param:'decay', label:'DECAY', min:0, max:1, defaultVal:0.5 },
      { param:'level', label:'LEVEL', min:0, max:1, defaultVal:0.75 },
    ];
    ['HT','MT','LT','HC','MC','LC'].forEach(k => { MAP[k] = tom; });

    return MAP[key] || [{ param:'level', label:'LEVEL', min:0, max:1, defaultVal:0.75 }];
  }

  // Special: CH/OH knobs apply to the shared HiHat voice
  _buildVoiceControls(key) {
    const wrap = el('div', 'tr808-voice-controls');
    const knobDefs = this._knobDefs(key);
    const target = (key === 'CH' || key === 'OH') ? this._hihat : this._voices[key];

    knobDefs.forEach(({ param, label, min, max, defaultVal }) => {
      const kDiv = el('div', 'tr808-knob');
      new Knob({
        container: kDiv,
        min, max,
        value: defaultVal,
        defaultValue: defaultVal,
        size: 36,
        label,
        color: '#ff8800',
        onChange: val => {
          if (target && target[param] !== undefined) target[param] = val;
        },
      });
      wrap.appendChild(kDiv);
    });

    return wrap;
  }

  _highlightStep(step) {
    // Clear previous
    if (this._lastStep >= 0) {
      this._instrumentKeys.forEach(k => {
        if (this._pads[k] && this._pads[k][this._lastStep]) {
          this._pads[k][this._lastStep].setActive(false);
        }
      });
    }
    if (step >= 0) {
      this._instrumentKeys.forEach(k => {
        if (this._pads[k] && this._pads[k][step]) {
          this._pads[k][step].setActive(true);
        }
      });
    }
    this._lastStep = step;
  }

  _clearHighlights() {
    this._instrumentKeys.forEach(k => {
      (this._pads[k] || []).forEach(p => p.setActive(false));
    });
    this._lastStep = -1;
  }

  _loadDemoPattern() {
    // Classic house/hip-hop 808 pattern
    const demo = {
      BD: [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
      SD: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      CH: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
      OH: [0,0,0,1, 0,0,0,1, 0,0,0,1, 0,0,0,1],
    };
    Object.entries(demo).forEach(([key, steps]) => {
      steps.forEach((on, i) => {
        if (on && this._pads[key]) {
          this._pads[key][i].setEnabled(true);
          this._pattern[key][i].on = true;
        }
      });
    });
  }
}

// Helper
function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) cls.split(' ').forEach(c => e.classList.add(c));
  return e;
}
