/**
 * MS10.js — Korg MS-10 synthesizer simulation.
 *
 * Simplified single-VCO, single-filter variant of the MS-20.
 * Signal path: VCO + Noise  →  LPF (KorgFilterProcessor)  →  VCA  →  out
 */
import AudioEngine    from '../../core/AudioEngine.js';
import MidiController from '../../core/MidiController.js';
import Knob           from '../../components/Knob.js';
import { noteToHz, scheduleADSR, scheduleRelease, QWERTY_NOTE_MAP } from '../../core/utils.js';

export default class MS10 {
  constructor(rootEl) {
    this._root = rootEl;
    this._workletReady = false;
    this._ctx = null;

    this._params = {
      vcoWave: 'sawtooth', vcoOct: 0,
      mixNoise: 0,
      // VCF
      lpfCutoff: 1000, lpfPeak: 0, lpfEGamt: 0.5,
      lpfKeyTrack: 0, lpfLFOamt: 0,
      // ADSR
      egA: 0.01, egD: 0.3, egS: 0.7, egR: 0.2,
      // LFO
      lfoRate: 3, lfoWave: 'sine',
      lfoVCOamt: 0, lfoVCFamt: 0,
      // VCA
      vcaMode: 'eg',
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
    const freq = noteToHz(midiNote) * Math.pow(2, p.vcoOct);
    const dest = AudioEngine.getMasterOutput();

    // ── VCO ───────────────────────────────────────────────────────────
    const vco = ctx.createOscillator();
    vco.type = p.vcoWave;
    vco.frequency.value = freq;

    // ── Noise ─────────────────────────────────────────────────────────
    const nLen = ctx.sampleRate * 2;
    const nBuf = ctx.createBuffer(1, nLen, ctx.sampleRate);
    const nd = nBuf.getChannelData(0);
    for (let i = 0; i < nLen; i++) nd[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = nBuf; noise.loop = true;

    const vcoGain   = ctx.createGain(); vcoGain.gain.value = 0.8;
    const noiseGain = ctx.createGain(); noiseGain.gain.value = p.mixNoise;
    const mixer     = ctx.createGain(); mixer.gain.value = 0.3;
    vco.connect(vcoGain); noise.connect(noiseGain);
    vcoGain.connect(mixer); noiseGain.connect(mixer);

    // ── LPF ───────────────────────────────────────────────────────────
    const lpf = new AudioWorkletNode(ctx, 'korg-filter');
    const cutoffP = lpf.parameters.get('cutoff');
    const peakP   = lpf.parameters.get('peak');

    const baseCutoff = p.lpfCutoff + freq * p.lpfKeyTrack * 4;
    const peakCutoff = baseCutoff * (1 + p.lpfEGamt * 6);
    cutoffP.setValueAtTime(peakCutoff, now);
    cutoffP.exponentialRampToValueAtTime(Math.max(baseCutoff, 20), now + p.egA + p.egD);
    peakP.setValueAtTime(p.lpfPeak * 3.8, now);

    // ── VCA ───────────────────────────────────────────────────────────
    const vca = ctx.createGain();
    vca.gain.setValueAtTime(0, now);
    scheduleADSR(vca.gain, ctx, p.egA, p.egD, p.egS, p.egR, now, velocity * p.masterVol);

    // ── LFO ───────────────────────────────────────────────────────────
    const lfo = ctx.createOscillator();
    lfo.type = p.lfoWave;
    lfo.frequency.value = p.lfoRate;

    const lfoVCO = ctx.createGain(); lfoVCO.gain.value = p.lfoVCOamt * 100;
    const lfoVCF = ctx.createGain(); lfoVCF.gain.value = p.lfoVCFamt * 600;
    lfo.connect(lfoVCO); lfo.connect(lfoVCF);
    lfoVCO.connect(vco.detune);
    lfoVCF.connect(cutoffP);

    // Routing
    mixer.connect(lpf);
    lpf.connect(vca);
    vca.connect(dest);

    vco.start(now); noise.start(now); lfo.start(now);

    this._activeNotes.set(midiNote, { vco, noise, lfo, vca, lpf });
  }

  noteOff(midiNote) {
    const n = this._activeNotes.get(midiNote);
    if (!n) return;
    this._activeNotes.delete(midiNote);
    const ctx = this._ctx;
    const p   = this._params;
    const now = ctx.currentTime;
    scheduleRelease(n.vca.gain, now, p.egR);
    const stop = now + p.egR + 0.1;
    n.vco.stop(stop); n.noise.stop(stop); n.lfo.stop(stop);
  }

  allNotesOff() {
    [...this._activeNotes.keys()].forEach(k => this.noteOff(k));
  }

  buildUI() {
    const root = this._root;
    root.innerHTML = '';
    root.className = 'ms10';

    const hdr = el('div', 'ms10-header');
    hdr.innerHTML = `
      <div class="ms10-logo">
        <span class="ms10-brand">KORG</span>
        <span class="ms10-model">MS-10</span>
        <span class="ms10-subtitle">Monophonic Synthesizer</span>
      </div>`;
    root.appendChild(hdr);

    const panel = el('div', 'ms10-panel');
    panel.appendChild(this._buildVCOSection());
    panel.appendChild(this._buildVCFSection());
    panel.appendChild(this._buildEGSection());
    panel.appendChild(this._buildLFOSection());
    panel.appendChild(this._buildVCASection());
    root.appendChild(panel);

    root.appendChild(this._buildKeyboard());

    MidiController.init();
    this._midiId = MidiController.addListener(msg => {
      if (msg.type === 'noteon')  this.noteOn(msg.note, msg.velocity);
      if (msg.type === 'noteoff') this.noteOff(msg.note);
    });
    this._bindQwerty();
  }

  _buildSection(title) {
    const sec = el('div', 'ms10-section');
    const ttl = el('div', 'ms10-section-title'); ttl.textContent = title;
    sec.appendChild(ttl);
    const body = el('div', 'ms10-section-body');
    sec.appendChild(body);
    return { sec, body };
  }

  _knob(container, label, param, min, max, defaultVal, curve = 'linear') {
    const wrap = el('div', 'ms10-knob');
    new Knob({
      container: wrap, min, max, value: defaultVal, defaultValue: defaultVal,
      size: 42, label, curve, color: '#cccc00',
      onChange: v => { this._params[param] = v; },
    });
    container.appendChild(wrap);
  }

  _waveBtn(container, label, param, value) {
    const btn = el('button', 'ms10-wave-btn');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      this._params[param] = value;
      container.querySelectorAll('.ms10-wave-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    if (this._params[param] === value) btn.classList.add('active');
    container.appendChild(btn);
  }

  _buildVCOSection() {
    const { sec, body } = this._buildSection('VCO');
    const waveRow = el('div', 'ms10-wave-row');
    ['sawtooth','square','triangle'].forEach(w => {
      this._waveBtn(waveRow, w === 'sawtooth' ? 'SAW' : w === 'square' ? 'SQ' : 'TRI', 'vcoWave', w);
    });
    body.appendChild(waveRow);
    this._knob(body, 'FREQ', 'vcoOct', -2, 2, 0);
    this._knob(body, 'LFO AMT', 'lfoVCOamt', 0, 1, 0);
    return sec;
  }

  _buildVCFSection() {
    const { sec, body } = this._buildSection('VCF (LPF)');
    this._knob(body, 'CUTOFF', 'lpfCutoff', 20, 18000, 1000, 'exp');
    this._knob(body, 'PEAK', 'lpfPeak', 0, 1, 0);
    this._knob(body, 'EG AMT', 'lpfEGamt', 0, 1, 0.5);
    this._knob(body, 'KEY TRK', 'lpfKeyTrack', 0, 1, 0);
    this._knob(body, 'LFO AMT', 'lfoVCFamt', 0, 1, 0);
    return sec;
  }

  _buildEGSection() {
    const { sec, body } = this._buildSection('ADSR ENVELOPE');
    this._knob(body, 'ATTACK', 'egA', 0.001, 5, 0.01, 'exp');
    this._knob(body, 'DECAY', 'egD', 0.001, 5, 0.3, 'exp');
    this._knob(body, 'SUSTAIN', 'egS', 0, 1, 0.7);
    this._knob(body, 'RELEASE', 'egR', 0.001, 5, 0.2, 'exp');
    return sec;
  }

  _buildLFOSection() {
    const { sec, body } = this._buildSection('LFO');
    const waveRow = el('div', 'ms10-wave-row');
    ['sine','square','triangle'].forEach(w => {
      this._waveBtn(waveRow, w === 'sine' ? 'SIN' : w === 'square' ? 'SQ' : 'TRI', 'lfoWave', w);
    });
    body.appendChild(waveRow);
    this._knob(body, 'RATE', 'lfoRate', 0.05, 30, 3, 'exp');
    return sec;
  }

  _buildVCASection() {
    const { sec, body } = this._buildSection('VCA');
    this._knob(body, 'VOLUME', 'masterVol', 0, 1, 0.7);
    this._knob(body, 'NOISE', 'mixNoise', 0, 1, 0);
    return sec;
  }

  _buildKeyboard() {
    const wrap = el('div', 'ms10-keyboard');
    const kb = el('div', 'ms10-kb-inner');
    const notes = Array.from({length: 25}, (_, i) => 48 + i);
    const isBlack = n => [1,3,6,8,10].includes(n % 12);
    notes.filter(n => !isBlack(n)).forEach(note => {
      const key = el('div', 'ms10-key ms10-key-white');
      this._bindKey(key, note); kb.appendChild(key);
    });
    notes.filter(n => isBlack(n)).forEach(note => {
      const key = el('div', 'ms10-key ms10-key-black');
      this._bindKey(key, note); kb.appendChild(key);
    });
    wrap.appendChild(kb);
    const s = el('div', 'ms10-midi-status');
    s.textContent = 'QWERTY A–K plays C3–C4  |  Connect MIDI keyboard for full range';
    wrap.appendChild(s);
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
      if (e.repeat || e.target.tagName === 'INPUT') return;
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
