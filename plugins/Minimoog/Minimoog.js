/**
 * Minimoog.js — Moog Minimoog Model D synthesizer simulation.
 *
 * Signal path:
 *   VCO1 + VCO2 + VCO3 + Noise  →  Mixer  →  MoogLadder (AudioWorklet)
 *   →  VCA (GainNode)  →  Master out
 *
 * MIDI note on/off, QWERTY keyboard, pitch bend, modulation wheel supported.
 */
import AudioEngine     from '../../core/AudioEngine.js';
import MidiController  from '../../core/MidiController.js';
import Knob            from '../../components/Knob.js';
import { noteToHz, scheduleADSR, scheduleRelease, QWERTY_NOTE_MAP } from '../../core/utils.js';

export default class Minimoog {
  constructor(rootEl) {
    this._root = rootEl;
    this._ctx  = null;   // initialised on first note
    this._workletReady = false;

    // ── Synth state ───────────────────────────────────────────────────
    this._params = {
      // VCOs
      vco1Wave: 'sawtooth', vco1Oct: 0,  vco1Semi: 0,
      vco2Wave: 'sawtooth', vco2Oct: 0,  vco2Semi: 7,  vco2Detune: 0,
      vco3Wave: 'sawtooth', vco3Oct: -1, vco3Semi: 0,  vco3Detune: 0,
      // Mixer
      mix1: 0.8, mix2: 0.6, mix3: 0.3, mixNoise: 0,
      // Filter
      cutoff: 800, resonance: 0, filterEGamt: 0.5, filterKeyTrack: 0,
      // Filter EG (no S/R on original)
      filterA: 0.01, filterD: 0.3,
      // Amp EG
      ampA: 0.005, ampD: 0.3, ampS: 0.8,
      // LFO
      lfoRate: 4, lfoAmt: 0,
      // Glide
      glide: 0,
      // Master
      masterVol: 0.7,
    };

    this._activeNotes = new Map(); // midiNote → { oscs, vcaGain, filterGain }
    this._lastNoteHz  = 440;
    this._pitchBend   = 0;        // semitones (-2 to +2)
    this._modWheel    = 0;

    this._midiId = null;
  }

  // ── Audio init ────────────────────────────────────────────────────

  async _initAudio() {
    if (this._workletReady) return;
    AudioEngine.resume();
    this._ctx = AudioEngine.getContext();
    await this._ctx.audioWorklet.addModule('../../worklets/MoogLadderProcessor.js');
    this._workletReady = true;
  }

  // ── Note on / off ─────────────────────────────────────────────────

  async noteOn(midiNote, velocity = 1) {
    await this._initAudio();
    this.noteOff(midiNote); // release any prior instance of same note

    const ctx  = this._ctx;
    const p    = this._params;
    const now  = ctx.currentTime;
    const freq = noteToHz(midiNote);
    const dest = AudioEngine.getMasterOutput();

    // ── VCOs ─────────────────────────────────────────────────────────
    const oct = n => Math.pow(2, n);

    const vco1 = ctx.createOscillator();
    vco1.type = p.vco1Wave;
    vco1.frequency.value = freq * oct(p.vco1Oct) * Math.pow(2, p.vco1Semi / 12);

    const vco2 = ctx.createOscillator();
    vco2.type = p.vco2Wave;
    vco2.frequency.value = freq * oct(p.vco2Oct) * Math.pow(2, p.vco2Semi / 12)
                           * Math.pow(2, p.vco2Detune / 1200);

    const vco3 = ctx.createOscillator();
    vco3.type = p.vco3Wave;
    vco3.frequency.value = freq * oct(p.vco3Oct) * Math.pow(2, p.vco3Semi / 12)
                           * Math.pow(2, p.vco3Detune / 1200);

    // ── Noise ─────────────────────────────────────────────────────────
    const noiseLen = ctx.sampleRate * 2;
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) nd[i] = Math.random() * 2 - 1;
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf; noiseSrc.loop = true;

    // ── Mixer ─────────────────────────────────────────────────────────
    const g1 = ctx.createGain(); g1.gain.value = p.mix1;
    const g2 = ctx.createGain(); g2.gain.value = p.mix2;
    const g3 = ctx.createGain(); g3.gain.value = p.mix3;
    const gN = ctx.createGain(); gN.gain.value = p.mixNoise;

    const mixer = ctx.createGain(); mixer.gain.value = 0.25;

    vco1.connect(g1); vco2.connect(g2); vco3.connect(g3); noiseSrc.connect(gN);
    [g1, g2, g3, gN].forEach(g => g.connect(mixer));

    // ── Moog Ladder Filter ────────────────────────────────────────────
    const filter = new AudioWorkletNode(ctx, 'moog-ladder');
    const cutoffParam    = filter.parameters.get('cutoff');
    const resonanceParam = filter.parameters.get('resonance');

    // Key tracking: add fraction of note frequency to base cutoff
    const baseCutoff = p.cutoff + freq * p.filterKeyTrack;
    // Filter EG
    const filterEGPeak = baseCutoff * (1 + p.filterEGamt * 8);
    cutoffParam.setValueAtTime(filterEGPeak, now);
    cutoffParam.exponentialRampToValueAtTime(
      Math.max(baseCutoff, 20), now + p.filterA + p.filterD);
    resonanceParam.setValueAtTime(p.resonance * 3.9, now);

    // ── VCA ────────────────────────────────────────────────────────────
    const vcaGain = ctx.createGain();
    vcaGain.gain.setValueAtTime(0, now);
    scheduleADSR(vcaGain.gain, ctx, p.ampA, p.ampD, p.ampS, 0, now,
      velocity * p.masterVol);

    mixer.connect(filter);
    filter.connect(vcaGain);
    vcaGain.connect(dest);

    // ── LFO pitch mod ──────────────────────────────────────────────────
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = p.lfoRate;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = p.lfoAmt * this._modWheel * 50; // cents
    lfo.connect(lfoGain);
    [vco1.detune, vco2.detune, vco3.detune].forEach(d => lfoGain.connect(d));

    // ── Glide (portamento) ─────────────────────────────────────────────
    if (p.glide > 0 && this._lastNoteHz !== freq) {
      const glideTime = p.glide * 1.5;
      [vco1, vco2, vco3].forEach((osc, i) => {
        const targetFreq = osc.frequency.value;
        const startFreq = this._lastNoteHz
          * oct([p.vco1Oct, p.vco2Oct, p.vco3Oct][i])
          * Math.pow(2, [p.vco1Semi, p.vco2Semi, p.vco3Semi][i] / 12);
        osc.frequency.setValueAtTime(startFreq, now);
        osc.frequency.exponentialRampToValueAtTime(targetFreq, now + glideTime);
      });
    }

    this._lastNoteHz = freq;

    // Start everything
    vco1.start(now); vco2.start(now); vco3.start(now);
    noiseSrc.start(now); lfo.start(now);

    this._activeNotes.set(midiNote, { vco1, vco2, vco3, noiseSrc, lfo, vcaGain, filter });
  }

  noteOff(midiNote) {
    const n = this._activeNotes.get(midiNote);
    if (!n) return;
    this._activeNotes.delete(midiNote);

    const ctx = this._ctx;
    const p   = this._params;
    const now = ctx.currentTime;
    const r   = 0.05 + p.ampD * 0.5; // approximate release from decay
    scheduleRelease(n.vcaGain.gain, now, r);

    const stop = now + r + 0.1;
    n.vco1.stop(stop); n.vco2.stop(stop); n.vco3.stop(stop);
    n.noiseSrc.stop(stop); n.lfo.stop(stop);
  }

  allNotesOff() {
    [...this._activeNotes.keys()].forEach(k => this.noteOff(k));
  }

  // ── MIDI / keyboard ───────────────────────────────────────────────

  _registerMidi() {
    this._midiId = MidiController.addListener(msg => {
      if (msg.type === 'noteon')    this.noteOn(msg.note, msg.velocity);
      if (msg.type === 'noteoff')   this.noteOff(msg.note);
      if (msg.type === 'pitchbend') this._pitchBend = msg.value * 2;
      if (msg.type === 'cc' && msg.cc === 1) this._modWheel = msg.value;
    });
  }

  _unregisterMidi() {
    if (this._midiId !== null) {
      MidiController.removeListener(this._midiId);
      this._midiId = null;
    }
  }

  // ── UI ────────────────────────────────────────────────────────────

  buildUI() {
    const root = this._root;
    root.innerHTML = '';
    root.className = 'minimoog';

    // Header
    const hdr = el('div', 'mm-header');
    hdr.innerHTML = `
      <div class="mm-logo">
        <span class="mm-brand">MOOG</span>
        <span class="mm-model">minimoog</span>
        <span class="mm-subtitle">Model D</span>
      </div>`;
    root.appendChild(hdr);

    // Main synth panel
    const panel = el('div', 'mm-panel');

    // ── Oscillator bank ───────────────────────────────────────────────
    panel.appendChild(this._buildOscBank());

    // ── Mixer ─────────────────────────────────────────────────────────
    panel.appendChild(this._buildMixer());

    // ── Filter ────────────────────────────────────────────────────────
    panel.appendChild(this._buildFilter());

    // ── Envelopes ─────────────────────────────────────────────────────
    panel.appendChild(this._buildEnvelopes());

    // ── Output ────────────────────────────────────────────────────────
    panel.appendChild(this._buildOutput());

    root.appendChild(panel);

    // ── Keyboard ──────────────────────────────────────────────────────
    root.appendChild(this._buildKeyboard());

    // ── Wire up MIDI + QWERTY ─────────────────────────────────────────
    MidiController.init();
    this._registerMidi();
    this._bindQwerty();
  }

  _buildSection(title) {
    const sec = el('div', 'mm-section');
    const ttl = el('div', 'mm-section-title'); ttl.textContent = title;
    sec.appendChild(ttl);
    const body = el('div', 'mm-section-body');
    sec.appendChild(body);
    return { sec, body };
  }

  _knob(container, label, param, min, max, defaultVal, curve = 'linear') {
    const p = this._params;
    const wrap = el('div', 'mm-knob');
    new Knob({
      container: wrap, min, max, value: defaultVal, defaultValue: defaultVal,
      size: 44, label, curve, color: '#cc6600',
      onChange: v => {
        p[param] = v;
        this._updateLiveParam(param, v);
      },
    });
    container.appendChild(wrap);
  }

  _waveSelect(container, label, param) {
    const p = this._params;
    const wrap = el('div', 'mm-wave-select');
    const lbl = el('div', 'mm-ctrl-label'); lbl.textContent = label;
    const sel = el('select', 'mm-select');
    ['sawtooth','square','triangle','sine'].forEach(w => {
      const opt = document.createElement('option');
      opt.value = w;
      opt.textContent = w === 'sawtooth' ? 'Saw' : w === 'square' ? 'Square' : w === 'triangle' ? 'Tri' : 'Sine';
      sel.appendChild(opt);
    });
    sel.value = p[param];
    sel.addEventListener('change', () => { p[param] = sel.value; });
    wrap.appendChild(lbl); wrap.appendChild(sel);
    container.appendChild(wrap);
  }

  _buildOscBank() {
    const { sec, body } = this._buildSection('OSCILLATOR BANK');
    body.style.display = 'flex'; body.style.gap = '16px';

    [1, 2, 3].forEach(i => {
      const oscPanel = el('div', 'mm-osc-panel');
      const title = el('div', 'mm-osc-title'); title.textContent = `VCO ${i}`;
      oscPanel.appendChild(title);

      this._waveSelect(oscPanel, 'WAVEFORM', `vco${i}Wave`);

      const knobRow = el('div', 'mm-knob-row');
      this._knob(knobRow, 'OCTAVE', `vco${i}Oct`, -2, 2, i === 3 ? -1 : 0);
      if (i > 1) this._knob(knobRow, 'DETUNE', `vco${i}Detune`, -50, 50, 0);
      if (i > 1) this._knob(knobRow, 'SEMI', `vco${i}Semi`, -7, 7, i === 2 ? 7 : 0);
      oscPanel.appendChild(knobRow);
      body.appendChild(oscPanel);
    });

    return sec;
  }

  _buildMixer() {
    const { sec, body } = this._buildSection('MIXER');
    body.style.display = 'flex'; body.style.gap = '8px'; body.style.alignItems = 'flex-end';

    const labels = ['VCO 1', 'VCO 2', 'VCO 3', 'NOISE'];
    const params = ['mix1', 'mix2', 'mix3', 'mixNoise'];
    const defs   = [0.8, 0.6, 0.3, 0];

    labels.forEach((lbl, i) => {
      this._knob(body, lbl, params[i], 0, 1, defs[i]);
    });

    return sec;
  }

  _buildFilter() {
    const { sec, body } = this._buildSection('FILTER');
    body.style.display = 'flex'; body.style.gap = '8px'; body.style.alignItems = 'flex-end';

    this._knob(body, 'CUTOFF', 'cutoff', 20, 18000, 800, 'exp');
    this._knob(body, 'EMPHASIS', 'resonance', 0, 1, 0);
    this._knob(body, 'EG AMT', 'filterEGamt', 0, 1, 0.5);
    this._knob(body, 'KEY TRK', 'filterKeyTrack', 0, 1, 0);

    // Filter EG
    const egTitle = el('div', 'mm-sub-label'); egTitle.textContent = 'FILTER EG';
    body.appendChild(egTitle);
    this._knob(body, 'ATTACK', 'filterA', 0.001, 5, 0.01, 'exp');
    this._knob(body, 'DECAY', 'filterD', 0.001, 5, 0.3, 'exp');

    return sec;
  }

  _buildEnvelopes() {
    const { sec, body } = this._buildSection('LOUDNESS CONTOUR');
    body.style.display = 'flex'; body.style.gap = '8px'; body.style.alignItems = 'flex-end';

    this._knob(body, 'ATTACK', 'ampA', 0.001, 5, 0.005, 'exp');
    this._knob(body, 'DECAY', 'ampD', 0.001, 5, 0.3, 'exp');
    this._knob(body, 'SUSTAIN', 'ampS', 0, 1, 0.8);

    // LFO
    const lfoTitle = el('div', 'mm-sub-label'); lfoTitle.textContent = 'LFO';
    body.appendChild(lfoTitle);
    this._knob(body, 'RATE', 'lfoRate', 0.1, 20, 4, 'exp');
    this._knob(body, 'AMOUNT', 'lfoAmt', 0, 1, 0);

    // Glide
    const glideTitle = el('div', 'mm-sub-label'); glideTitle.textContent = 'GLIDE';
    body.appendChild(glideTitle);
    this._knob(body, 'RATE', 'glide', 0, 2, 0);

    return sec;
  }

  _buildOutput() {
    const { sec, body } = this._buildSection('OUTPUT');
    body.style.display = 'flex'; body.style.gap = '8px'; body.style.alignItems = 'flex-end';
    this._knob(body, 'VOLUME', 'masterVol', 0, 1, 0.7);
    return sec;
  }

  _buildKeyboard() {
    const wrap = el('div', 'mm-keyboard');
    const notes = [
      // 2 octave piano keyboard starting at C3 (MIDI 48)
      ...Array.from({length: 25}, (_, i) => 48 + i),
    ];

    const isBlack = n => [1,3,6,8,10].includes(n % 12);

    // White keys first for natural z-ordering
    const whites = notes.filter(n => !isBlack(n));
    const blacks = notes.filter(n => isBlack(n));

    const kb = el('div', 'mm-kb-inner');

    whites.forEach(note => {
      const key = el('div', 'mm-key mm-key-white');
      key.dataset.note = note;
      this._bindKeyEvents(key, note);
      kb.appendChild(key);
    });

    blacks.forEach(note => {
      const key = el('div', 'mm-key mm-key-black');
      key.dataset.note = note;
      this._bindKeyEvents(key, note);
      kb.appendChild(key);
    });

    wrap.appendChild(kb);

    // MIDI status label
    const status = el('div', 'mm-midi-status');
    status.textContent = 'QWERTY: A=C3  |  Connect MIDI keyboard for full range';
    wrap.appendChild(status);

    return wrap;
  }

  _bindKeyEvents(key, note) {
    key.addEventListener('mousedown', e => { e.preventDefault(); this.noteOn(note, 0.8); });
    key.addEventListener('mouseup',   () => this.noteOff(note));
    key.addEventListener('mouseleave',() => this.noteOff(note));
    key.addEventListener('touchstart', e => { e.preventDefault(); this.noteOn(note, 0.8); }, { passive: false });
    key.addEventListener('touchend',  () => this.noteOff(note));
  }

  _bindQwerty() {
    const pressed = new Set();
    document.addEventListener('keydown', e => {
      if (e.repeat || e.target.tagName === 'INPUT') return;
      const note = QWERTY_NOTE_MAP[e.key.toLowerCase()];
      if (note === undefined) return;
      if (pressed.has(note)) return;
      pressed.add(note);
      this.noteOn(note, 0.8);
    });
    document.addEventListener('keyup', e => {
      const note = QWERTY_NOTE_MAP[e.key.toLowerCase()];
      if (note === undefined) return;
      pressed.delete(note);
      this.noteOff(note);
    });
  }

  _updateLiveParam(param, value) {
    // Update live voices
    const ctx = this._ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const n of this._activeNotes.values()) {
      if (param === 'resonance' && n.filter) {
        n.filter.parameters.get('resonance').setTargetAtTime(value * 3.9, now, 0.01);
      }
      if (param === 'cutoff' && n.filter) {
        n.filter.parameters.get('cutoff').setTargetAtTime(value, now, 0.01);
      }
      if (param === 'masterVol' && n.vcaGain) {
        // don't abruptly change live note gain
      }
    }
  }
}

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) cls.split(' ').forEach(c => e.classList.add(c));
  return e;
}
