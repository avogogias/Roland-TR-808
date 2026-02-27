/**
 * TR909.js — Roland TR-909 drum machine.
 */
import AudioEngine  from '../../core/AudioEngine.js';
import Sequencer    from '../../core/Sequencer.js';
import Knob         from '../../components/Knob.js';
import PadButton    from '../../components/PadButton.js';
import Clap         from '../TR808/voices/Clap.js';   // Shared clap voice
import Clave        from '../TR808/voices/Clave.js';  // Shared rimshot

import BassDrum909  from './voices/BassDrum909.js';
import SnareDrum909 from './voices/SnareDrum909.js';
import HiHat909     from './voices/HiHat909.js';
import Tom909       from './voices/Tom909.js';

export default class TR909 {
  constructor(rootEl) {
    this._root = rootEl;
    this._seq  = new Sequencer(AudioEngine);

    const ctx  = AudioEngine.getContext();
    const dest = AudioEngine.getMasterOutput();

    this._bd  = new BassDrum909(ctx, dest);
    this._sd  = new SnareDrum909(ctx, dest);
    this._hh  = new HiHat909(ctx, dest);
    this._lt  = new Tom909(ctx, dest, 'LT');
    this._mt  = new Tom909(ctx, dest, 'MT');
    this._ht  = new Tom909(ctx, dest, 'HT');
    this._cp  = new Clap(ctx, dest);
    this._rs  = new Clave(ctx, dest);

    this._instrumentKeys = ['BD','SD','CH','OH','HT','MT','LT','CP','RS'];
    this._steps = 16;
    this._pattern = {};
    this._instrumentKeys.forEach(k => {
      this._pattern[k] = Array.from({length: this._steps}, () => ({ on: false, accent: false }));
    });

    this._seq.onStep(({ step, time }) => {
      if (step === -1) { this._highlightStep(-1); return; }
      if (this._pattern.BD[step].on) this._bd.trigger(time);
      if (this._pattern.SD[step].on) this._sd.trigger(time);
      if (this._pattern.CH[step].on) this._hh.triggerCH(time);
      if (this._pattern.OH[step].on) this._hh.triggerOH(time);
      if (this._pattern.HT[step].on) this._ht.trigger(time);
      if (this._pattern.MT[step].on) this._mt.trigger(time);
      if (this._pattern.LT[step].on) this._lt.trigger(time);
      if (this._pattern.CP[step].on) this._cp.trigger(time);
      if (this._pattern.RS[step].on) this._rs.trigger(time);
      this._highlightStep(step);
    });

    this._pads = {};
    this._lastStep = -1;
  }

  buildUI() {
    const root = this._root;
    root.innerHTML = '';
    root.className = 'tr909';

    const hdr = el('div', 'tr909-header');
    hdr.innerHTML = `
      <div class="tr909-logo">
        <span class="tr909-brand">ROLAND</span>
        <span class="tr909-model">TR-909</span>
        <span class="tr909-subtitle">Rhythm Composer</span>
      </div>`;
    root.appendChild(hdr);

    root.appendChild(this._buildTransport());

    const panel = el('div', 'tr909-panel');

    const labels = {
      BD:'Bass Drum', SD:'Snare', CH:'Clsd Hi-Hat', OH:'Open Hi-Hat',
      HT:'High Tom', MT:'Mid Tom', LT:'Low Tom', CP:'Clap', RS:'Rim Shot',
    };

    this._instrumentKeys.forEach((key, idx) => {
      const row = el('div', 'tr909-row');
      row.classList.add(idx % 2 === 0 ? 'row-even' : 'row-odd');

      const lbl = el('div', 'tr909-inst-label');
      lbl.textContent = labels[key];
      row.appendChild(lbl);

      row.appendChild(this._buildVoiceControls(key));

      const padsDiv = el('div', 'tr909-pads');
      this._pads[key] = [];
      for (let s = 0; s < this._steps; s++) {
        const pad = new PadButton({
          container: padsDiv, step: s, instrument: key,
          onChange: ({ step, active, accent }) => {
            this._pattern[key][step].on = active;
            this._pattern[key][step].accent = accent;
          },
        });
        if (s === 4 || s === 8 || s === 12) padsDiv.lastElementChild.style.marginLeft = '8px';
        this._pads[key].push(pad);
      }
      row.appendChild(padsDiv);
      panel.appendChild(row);
    });

    root.appendChild(panel);
    this._loadDemoPattern();
  }

  _buildTransport() {
    const wrap = el('div', 'tr909-transport');

    const tempoWrap = el('div', 'tr909-tempo-wrap');
    const tempoLbl = el('span', 'tr909-ctrl-label'); tempoLbl.textContent = 'TEMPO';
    const tempoInput = el('input', 'tr909-tempo-input');
    tempoInput.type = 'number'; tempoInput.min = '40'; tempoInput.max = '300'; tempoInput.value = '130';
    tempoInput.addEventListener('input', () => { this._seq.bpm = parseFloat(tempoInput.value) || 130; });
    tempoWrap.appendChild(tempoLbl); tempoWrap.appendChild(tempoInput);
    wrap.appendChild(tempoWrap);

    const startBtn = el('button', 'tr909-btn tr909-btn-start');
    startBtn.textContent = '▶ START';
    startBtn.addEventListener('click', () => {
      AudioEngine.resume(); this._seq.start();
      startBtn.classList.add('active'); stopBtn.classList.remove('active');
    });

    const stopBtn = el('button', 'tr909-btn tr909-btn-stop');
    stopBtn.textContent = '■ STOP';
    stopBtn.addEventListener('click', () => {
      this._seq.stop();
      stopBtn.classList.add('active'); startBtn.classList.remove('active');
      this._clearHighlights();
    });

    wrap.appendChild(startBtn); wrap.appendChild(stopBtn);
    return wrap;
  }

  _buildVoiceControls(key) {
    const wrap = el('div', 'tr909-voice-controls');
    const defs = this._knobDefs(key);
    const target = (key === 'CH' || key === 'OH') ? this._hh
                 : key === 'BD' ? this._bd
                 : key === 'SD' ? this._sd
                 : key === 'HT' ? this._ht : key === 'MT' ? this._mt : key === 'LT' ? this._lt
                 : key === 'CP' ? this._cp : this._rs;

    defs.forEach(({ param, label, min, max, defaultVal }) => {
      const kDiv = el('div', 'tr909-knob');
      new Knob({
        container: kDiv, min, max, value: defaultVal, defaultValue: defaultVal,
        size: 34, label, color: '#0077cc',
        onChange: val => { if (target && param in target) target[param] = val; },
      });
      wrap.appendChild(kDiv);
    });
    return wrap;
  }

  _knobDefs(key) {
    const map = {
      BD: [{param:'tune',label:'TUNE',min:0,max:1,defaultVal:0.5},{param:'attack',label:'ATTACK',min:0,max:1,defaultVal:0.5},{param:'decay',label:'DECAY',min:0,max:1,defaultVal:0.5},{param:'level',label:'LEVEL',min:0,max:1,defaultVal:0.9}],
      SD: [{param:'tune',label:'TUNE',min:0,max:1,defaultVal:0.5},{param:'tone',label:'TONE',min:0,max:1,defaultVal:0.5},{param:'snappy',label:'SNAPPY',min:0,max:1,defaultVal:0.6},{param:'level',label:'LEVEL',min:0,max:1,defaultVal:0.85}],
      CH: [{param:'decayCH',label:'DECAY',min:0,max:1,defaultVal:0.4},{param:'levelCH',label:'LEVEL',min:0,max:1,defaultVal:0.7}],
      OH: [{param:'decayOH',label:'DECAY',min:0,max:1,defaultVal:0.5},{param:'levelOH',label:'LEVEL',min:0,max:1,defaultVal:0.75}],
      HT: [{param:'tune',label:'TUNE',min:0,max:1,defaultVal:0.5},{param:'decay',label:'DECAY',min:0,max:1,defaultVal:0.5},{param:'level',label:'LEVEL',min:0,max:1,defaultVal:0.8}],
      MT: [{param:'tune',label:'TUNE',min:0,max:1,defaultVal:0.5},{param:'decay',label:'DECAY',min:0,max:1,defaultVal:0.5},{param:'level',label:'LEVEL',min:0,max:1,defaultVal:0.8}],
      LT: [{param:'tune',label:'TUNE',min:0,max:1,defaultVal:0.5},{param:'decay',label:'DECAY',min:0,max:1,defaultVal:0.5},{param:'level',label:'LEVEL',min:0,max:1,defaultVal:0.8}],
      CP: [{param:'level',label:'LEVEL',min:0,max:1,defaultVal:0.8}],
      RS: [{param:'level',label:'LEVEL',min:0,max:1,defaultVal:0.8}],
    };
    return map[key] || [{param:'level',label:'LEVEL',min:0,max:1,defaultVal:0.75}];
  }

  _highlightStep(step) {
    if (this._lastStep >= 0) {
      this._instrumentKeys.forEach(k => this._pads[k]?.[this._lastStep]?.setActive(false));
    }
    if (step >= 0) {
      this._instrumentKeys.forEach(k => this._pads[k]?.[step]?.setActive(true));
    }
    this._lastStep = step;
  }

  _clearHighlights() {
    this._instrumentKeys.forEach(k => (this._pads[k] || []).forEach(p => p.setActive(false)));
    this._lastStep = -1;
  }

  _loadDemoPattern() {
    const demo = {
      BD: [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,1,0,0],
      SD: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      CH: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
      HT: [0,0,0,1, 0,0,0,0, 0,0,0,1, 0,0,0,0],
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

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) cls.split(' ').forEach(c => e.classList.add(c));
  return e;
}
