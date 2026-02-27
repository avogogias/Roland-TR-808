/**
 * MS20.js — Korg MS-20 semi-modular synthesizer simulation.
 *
 * Signal path:
 *   VCO1 + VCO2 + Noise  →  HPF (BiquadFilter)  →  LPF (KorgFilterProcessor)
 *   →  VCA  →  Master out
 *
 * EG1: ASR — controls HPF cutoff and VCO pitch modulation
 * EG2: ADSR — controls LPF cutoff and VCA
 */
import AudioEngine    from '../../core/AudioEngine.js';
import MidiController from '../../core/MidiController.js';
import Knob           from '../../components/Knob.js';
import { noteToHz, scheduleADSR, scheduleRelease, QWERTY_NOTE_MAP } from '../../core/utils.js';

export default class MS20 {
  constructor(rootEl) {
    this._root = rootEl;
    this._workletReady = false;
    this._ctx = null;

    this._params = {
      vco1Wave: 'sawtooth', vco1Freq: 440, vco1PW: 0.5,
      vco2Wave: 'sawtooth', vco2Freq: 440, vco2PW: 0.5, vco2Detune: 0,
      ringMod: false,
      crossMod: 0,   // VCO1 FM from VCO2
      mix1: 0.7, mix2: 0.5, mixNoise: 0,
      // HPF
      hpfCutoff: 80, hpfPeak: 0,
      // LPF
      lpfCutoff: 1200, lpfPeak: 0,
      lpfEGamt: 0.5, lpfKeyTrack: 0,
      // EG1 (ASR)
      eg1A: 0.01, eg1S: 0.7, eg1R: 0.1,
      // EG2 (ADSR)
      eg2A: 0.01, eg2D: 0.3, eg2S: 0.7, eg2R: 0.2,
      // LFO
      lfoRate: 3, lfoWave: 'sine', lfoVCO: 0, lfoVCF: 0,
      // VCA
      vcaMode: 'eg',   // 'eg' or 'gate'
      masterVol: 0.7,
    };

    this._activeNotes = new Map();
    this._midiId = null;
  }

  async _initAudio() {
    if (this._workletReady) return;
    AudioEngine.resume();
    this._ctx = AudioEngine.getContext();
    await this._ctx.audioWorklet.addModule('../../worklets/KorgFilterProcessor.js');
    this._workletReady = true;
  }

  async noteOn(midiNote, velocity = 1) {
    await this._initAudio();
    this.noteOff(midiNote);

    const ctx  = this._ctx;
    const p    = this._params;
    const now  = ctx.currentTime;
    const freq = noteToHz(midiNote);
    const dest = AudioEngine.getMasterOutput();

    // ── VCOs ──────────────────────────────────────────────────────────
    const vco1 = ctx.createOscillator();
    vco1.type = p.vco1Wave;
    vco1.frequency.value = freq;

    const vco2 = ctx.createOscillator();
    vco2.type = p.vco2Wave;
    vco2.frequency.value = freq * Math.pow(2, p.vco2Detune / 1200);

    // Cross-mod (FM): VCO2 modulates VCO1 frequency
    if (p.crossMod > 0) {
      const cmGain = ctx.createGain();
      cmGain.gain.value = p.crossMod * 200;
      vco2.connect(cmGain);
      cmGain.connect(vco1.frequency);
    }

    // ── Noise ─────────────────────────────────────────────────────────
    const nLen = ctx.sampleRate * 2;
    const nBuf = ctx.createBuffer(1, nLen, ctx.sampleRate);
    const nd = nBuf.getChannelData(0);
    for (let i = 0; i < nLen; i++) nd[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = nBuf; noise.loop = true;

    // ── Mixer ─────────────────────────────────────────────────────────
    const g1 = ctx.createGain(); g1.gain.value = p.mix1;
    const g2 = ctx.createGain(); g2.gain.value = p.mix2;
    const gN = ctx.createGain(); gN.gain.value = p.mixNoise;
    const mixer = ctx.createGain(); mixer.gain.value = 0.3;
    vco1.connect(g1); vco2.connect(g2); noise.connect(gN);
    [g1, g2, gN].forEach(g => g.connect(mixer));

    // ── HPF (BiquadFilter — Korg HPF character) ───────────────────────
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = p.hpfCutoff;
    hpf.Q.value = p.hpfPeak * 12 + 0.7071;

    // ── LPF (Korg custom worklet) ────────────────────────────────────
    const lpf = new AudioWorkletNode(ctx, 'korg-filter');
    const lpfCutoffP  = lpf.parameters.get('cutoff');
    const lpfPeakP    = lpf.parameters.get('peak');

    // EG2 → LPF
    const baseLPF = p.lpfCutoff + freq * p.lpfKeyTrack * 4;
    const peakLPF = baseLPF * (1 + p.lpfEGamt * 6);
    lpfCutoffP.setValueAtTime(peakLPF, now);
    lpfCutoffP.exponentialRampToValueAtTime(Math.max(baseLPF, 20), now + p.eg2A + p.eg2D);
    lpfPeakP.setValueAtTime(p.lpfPeak * 3.8, now);

    // ── EG1 → HPF ─────────────────────────────────────────────────────
    // Approximate using BiquadFilter frequency automation
    const hpfBase = p.hpfCutoff;
    hpf.frequency.setValueAtTime(hpfBase * (1 + p.eg1S * 2), now);
    hpf.frequency.setTargetAtTime(hpfBase, now + p.eg1A, 0.02);

    // ── VCA ────────────────────────────────────────────────────────────
    const vca = ctx.createGain();
    vca.gain.setValueAtTime(0, now);
    scheduleADSR(vca.gain, ctx, p.eg2A, p.eg2D, p.eg2S, p.eg2R, now,
      velocity * p.masterVol);

    // ── LFO ───────────────────────────────────────────────────────────
    const lfo = ctx.createOscillator();
    lfo.type = p.lfoWave;
    lfo.frequency.value = p.lfoRate;

    const lfoVCOGain = ctx.createGain(); lfoVCOGain.gain.value = p.lfoVCO * 100;
    const lfoVCFGain = ctx.createGain(); lfoVCFGain.gain.value = p.lfoVCF * 500;
    lfo.connect(lfoVCOGain); lfo.connect(lfoVCFGain);
    lfoVCOGain.connect(vco1.detune); lfoVCOGain.connect(vco2.detune);
    lfoVCFGain.connect(lpfCutoffP);

    // Routing
    mixer.connect(hpf);
    hpf.connect(lpf);
    lpf.connect(vca);
    vca.connect(dest);

    vco1.start(now); vco2.start(now); noise.start(now); lfo.start(now);

    this._activeNotes.set(midiNote, { vco1, vco2, noise, lfo, vca, lpf, hpf });
  }

  noteOff(midiNote) {
    const n = this._activeNotes.get(midiNote);
    if (!n) return;
    this._activeNotes.delete(midiNote);

    const ctx = this._ctx;
    const p   = this._params;
    const now = ctx.currentTime;
    scheduleRelease(n.vca.gain, now, p.eg2R);

    const stop = now + p.eg2R + 0.1;
    n.vco1.stop(stop); n.vco2.stop(stop); n.noise.stop(stop); n.lfo.stop(stop);

    // EG1 release on HPF
    n.hpf.frequency.setTargetAtTime(p.hpfCutoff, now, p.eg1R * 0.3);
  }

  allNotesOff() {
    [...this._activeNotes.keys()].forEach(k => this.noteOff(k));
  }

  buildUI() {
    const root = this._root;
    root.innerHTML = '';
    root.className = 'ms20';

    const hdr = el('div', 'ms20-header');
    hdr.innerHTML = `
      <div class="ms20-logo">
        <span class="ms20-brand">KORG</span>
        <span class="ms20-model">MS-20</span>
        <span class="ms20-subtitle">Semi-Modular Synthesizer</span>
      </div>`;
    root.appendChild(hdr);

    const panel = el('div', 'ms20-panel');

    panel.appendChild(this._buildVCOSection());
    panel.appendChild(this._buildMixerSection());
    panel.appendChild(this._buildHPFSection());
    panel.appendChild(this._buildLPFSection());
    panel.appendChild(this._buildEGSection());
    panel.appendChild(this._buildLFOSection());
    panel.appendChild(this._buildVCASection());

    root.appendChild(panel);

    // Patch bay visual
    root.appendChild(this._buildPatchBay());

    root.appendChild(this._buildKeyboard());

    MidiController.init();
    this._midiId = MidiController.addListener(msg => {
      if (msg.type === 'noteon')  this.noteOn(msg.note, msg.velocity);
      if (msg.type === 'noteoff') this.noteOff(msg.note);
    });
    this._bindQwerty();
  }

  _buildSection(title, cls = '') {
    const sec = el('div', `ms20-section ${cls}`);
    const ttl = el('div', 'ms20-section-title'); ttl.textContent = title;
    sec.appendChild(ttl);
    const body = el('div', 'ms20-section-body');
    sec.appendChild(body);
    return { sec, body };
  }

  _knob(container, label, param, min, max, defaultVal, curve = 'linear') {
    const wrap = el('div', 'ms20-knob');
    new Knob({
      container: wrap, min, max, value: defaultVal, defaultValue: defaultVal,
      size: 40, label, curve, color: '#cccc00',
      onChange: v => { this._params[param] = v; },
    });
    container.appendChild(wrap);
  }

  _waveBtn(container, label, param, value) {
    const btn = el('button', 'ms20-wave-btn');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      this._params[param] = value;
      container.querySelectorAll('.ms20-wave-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    if (this._params[param] === value) btn.classList.add('active');
    container.appendChild(btn);
  }

  _buildVCOSection() {
    const { sec, body } = this._buildSection('VCO');
    body.style.display = 'flex'; body.style.gap = '16px';

    [1, 2].forEach(i => {
      const panel = el('div', 'ms20-vco-panel');
      const title = el('div', 'ms20-sub-title'); title.textContent = `VCO ${i}`;
      panel.appendChild(title);

      const waveRow = el('div', 'ms20-wave-row');
      ['sawtooth','square','triangle'].forEach(w => {
        this._waveBtn(waveRow, w === 'sawtooth' ? 'SAW' : w === 'square' ? 'SQ' : 'TRI',
          `vco${i}Wave`, w);
      });
      panel.appendChild(waveRow);

      const kr = el('div', 'ms20-knob-row');
      this._knob(kr, 'FREQ', `vco${i}Freq`, 20, 8000, 440, 'exp');
      if (i === 2) this._knob(kr, 'DETUNE', 'vco2Detune', -100, 100, 0);
      if (i === 1) this._knob(kr, 'X-MOD', 'crossMod', 0, 1, 0);
      panel.appendChild(kr);
      body.appendChild(panel);
    });

    return sec;
  }

  _buildMixerSection() {
    const { sec, body } = this._buildSection('MIXER');
    body.style.display = 'flex'; body.style.gap = '8px'; body.style.alignItems = 'flex-end';
    this._knob(body, 'VCO 1', 'mix1', 0, 1, 0.7);
    this._knob(body, 'VCO 2', 'mix2', 0, 1, 0.5);
    this._knob(body, 'NOISE', 'mixNoise', 0, 1, 0);
    return sec;
  }

  _buildHPFSection() {
    const { sec, body } = this._buildSection('HIGH PASS FILTER');
    body.style.display = 'flex'; body.style.gap = '8px'; body.style.alignItems = 'flex-end';
    this._knob(body, 'CUTOFF', 'hpfCutoff', 20, 8000, 80, 'exp');
    this._knob(body, 'PEAK', 'hpfPeak', 0, 1, 0);
    return sec;
  }

  _buildLPFSection() {
    const { sec, body } = this._buildSection('LOW PASS FILTER');
    body.style.display = 'flex'; body.style.gap = '8px'; body.style.alignItems = 'flex-end';
    this._knob(body, 'CUTOFF', 'lpfCutoff', 20, 18000, 1200, 'exp');
    this._knob(body, 'PEAK', 'lpfPeak', 0, 1, 0);
    this._knob(body, 'EG AMT', 'lpfEGamt', 0, 1, 0.5);
    this._knob(body, 'KEY TRK', 'lpfKeyTrack', 0, 1, 0);
    return sec;
  }

  _buildEGSection() {
    const { sec, body } = this._buildSection('ENVELOPE GENERATORS');
    body.style.display = 'flex'; body.style.gap = '16px';

    const eg1 = el('div', 'ms20-eg-panel');
    const t1 = el('div', 'ms20-sub-title'); t1.textContent = 'EG 1 (HPF)';
    eg1.appendChild(t1);
    const r1 = el('div', 'ms20-knob-row');
    this._knob(r1, 'ATTACK', 'eg1A', 0.001, 5, 0.01, 'exp');
    this._knob(r1, 'SUSTAIN', 'eg1S', 0, 1, 0.7);
    this._knob(r1, 'RELEASE', 'eg1R', 0.001, 3, 0.1, 'exp');
    eg1.appendChild(r1); body.appendChild(eg1);

    const eg2 = el('div', 'ms20-eg-panel');
    const t2 = el('div', 'ms20-sub-title'); t2.textContent = 'EG 2 (LPF+VCA)';
    eg2.appendChild(t2);
    const r2 = el('div', 'ms20-knob-row');
    this._knob(r2, 'ATTACK', 'eg2A', 0.001, 5, 0.01, 'exp');
    this._knob(r2, 'DECAY', 'eg2D', 0.001, 5, 0.3, 'exp');
    this._knob(r2, 'SUSTAIN', 'eg2S', 0, 1, 0.7);
    this._knob(r2, 'RELEASE', 'eg2R', 0.001, 5, 0.2, 'exp');
    eg2.appendChild(r2); body.appendChild(eg2);

    return sec;
  }

  _buildLFOSection() {
    const { sec, body } = this._buildSection('LFO');
    body.style.display = 'flex'; body.style.gap = '8px'; body.style.alignItems = 'flex-end';

    const waveRow = el('div', 'ms20-wave-row');
    ['sine','square','triangle','sawtooth'].forEach(w => {
      this._waveBtn(waveRow, w === 'sawtooth' ? 'SAW' : w === 'square' ? 'SQ' : w === 'triangle' ? 'TRI' : 'SIN',
        'lfoWave', w);
    });
    body.appendChild(waveRow);
    this._knob(body, 'RATE', 'lfoRate', 0.05, 30, 3, 'exp');
    this._knob(body, '→VCO', 'lfoVCO', 0, 1, 0);
    this._knob(body, '→VCF', 'lfoVCF', 0, 1, 0);

    return sec;
  }

  _buildVCASection() {
    const { sec, body } = this._buildSection('VCA');
    body.style.display = 'flex'; body.style.gap = '8px'; body.style.alignItems = 'flex-end';
    this._knob(body, 'VOLUME', 'masterVol', 0, 1, 0.7);
    return sec;
  }

  _buildPatchBay() {
    const bay = el('div', 'ms20-patchbay');
    const ttl = el('div', 'ms20-section-title'); ttl.textContent = 'PATCH BAY';
    bay.appendChild(ttl);

    const hint = el('div', 'ms20-patch-hint');
    hint.textContent = 'Signal routing patch points — connect with virtual patch cables';
    bay.appendChild(hint);

    const points = [
      'VCO1 OUT', 'VCO2 OUT', 'NOISE', 'HPF IN', 'HPF OUT', 'LPF IN', 'LPF OUT',
      'EG1 OUT', 'EG2 OUT', 'LFO OUT', 'VCA IN', 'AUDIO OUT', 'EXT IN',
    ];

    const grid = el('div', 'ms20-patch-grid');
    points.forEach(name => {
      const pt = el('div', 'ms20-patch-point');
      const circle = el('div', 'ms20-patch-circle');
      const lbl    = el('div', 'ms20-patch-label'); lbl.textContent = name;
      pt.appendChild(circle); pt.appendChild(lbl);
      grid.appendChild(pt);
    });
    bay.appendChild(grid);
    return bay;
  }

  _buildKeyboard() {
    const wrap = el('div', 'ms20-keyboard');
    const kb = el('div', 'ms20-kb-inner');

    // 2-octave keyboard
    const notes = Array.from({length: 25}, (_, i) => 48 + i);
    const isBlack = n => [1,3,6,8,10].includes(n % 12);
    notes.filter(n => !isBlack(n)).forEach(note => {
      const key = el('div', 'ms20-key ms20-key-white');
      this._bindKey(key, note); kb.appendChild(key);
    });
    notes.filter(n => isBlack(n)).forEach(note => {
      const key = el('div', 'ms20-key ms20-key-black');
      this._bindKey(key, note); kb.appendChild(key);
    });

    wrap.appendChild(kb);
    const status = el('div', 'ms20-midi-status');
    status.textContent = 'QWERTY A–K plays C3–C4  |  Connect MIDI keyboard for full range';
    wrap.appendChild(status);
    return wrap;
  }

  _bindKey(key, note) {
    key.addEventListener('mousedown', e => { e.preventDefault(); this.noteOn(note, 0.8); });
    key.addEventListener('mouseup',   () => this.noteOff(note));
    key.addEventListener('mouseleave',() => this.noteOff(note));
    key.addEventListener('touchstart', e => { e.preventDefault(); this.noteOn(note, 0.8); }, { passive: false });
    key.addEventListener('touchend',  () => this.noteOff(note));
  }

  _bindQwerty() {
    const pressed = new Set();
    document.addEventListener('keydown', e => {
      if (e.repeat || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      const note = QWERTY_NOTE_MAP[e.key.toLowerCase()];
      if (note === undefined || pressed.has(note)) return;
      pressed.add(note); this.noteOn(note, 0.8);
    });
    document.addEventListener('keyup', e => {
      const note = QWERTY_NOTE_MAP[e.key.toLowerCase()];
      if (note === undefined) return;
      pressed.delete(note); this.noteOff(note);
    });
  }
}

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) cls.split(' ').forEach(c => e.classList.add(c));
  return e;
}
