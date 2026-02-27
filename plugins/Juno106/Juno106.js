/**
 * Juno106.js — Roland Juno-106 6-voice polyphonic synthesizer.
 *
 * Signal path (per voice):
 *   DCO (saw + pulse) + Sub + Noise  →  Mixer
 *   →  4-pole LPF (BiquadFilter × 2, 12dB each = 24dB total)
 *   →  VCA  →  BBD Chorus  →  Master out
 *
 * Voice management: 6-voice pool, oldest-stolen when all voices active.
 * BBD Chorus: mode 0 (off), 1 (single BBD), 2 (dual BBD stereo).
 */
import AudioEngine    from '../../core/AudioEngine.js';
import MidiController from '../../core/MidiController.js';
import Slider         from '../../components/Slider.js';
import { noteToHz, scheduleADSR, scheduleRelease, QWERTY_NOTE_MAP } from '../../core/utils.js';

const NUM_VOICES = 6;

export default class Juno106 {
  constructor(rootEl) {
    this._root = rootEl;
    this._workletReady = false;
    this._ctx = null;

    this._params = {
      // DCO
      dcoRange: 8,      // 16/8/4/2 ft
      dcoPulse: true,   // pulse waveform active
      dcoPW: 0.5,       // pulse width 0-1 (duty cycle)
      dcoPWMsrc: 'lfo', // 'lfo' | 'manual'
      dcoSaw: true,     // saw waveform active
      dcoSub: 0,        // 0=off, 1=-1oct square, 2=-2oct square
      dcoNoise: 0,      // noise level 0-1
      // HPF
      hpf: 0,           // 0/1/2 switch
      // VCF
      vcfCutoff: 0.7,   // normalised 0-1 (maps to 20-18000Hz exp)
      vcfRes: 0,        // 0-1
      vcfEnvAmt: 0,     // -1 to +1
      vcfLFOamt: 0,
      vcfKeyFollow: 0,  // 0-1
      // VCF Env
      vcfA: 0.005, vcfD: 0.3, vcfS: 0.6, vcfR: 0.2,
      // VCA
      vcaA: 0.005, vcaD: 0.3, vcaS: 0.8, vcaR: 0.3,
      vcaMode: 'env',   // 'env' | 'gate'
      // LFO
      lfoRate: 0.5,     // 0-1 normalised
      lfoDelay: 0,
      lfoWave: 'triangle',
      // Chorus
      chorus: 0,        // 0=off, 1, 2
    };

    this._voices      = [];    // active voice records
    this._voiceOrder  = [];    // oldest first for stealing
    this._chorus      = null;  // AudioWorkletNode
    this._midiId      = null;

    // LFO shared across voices
    this._lfo = null;
    this._lfoGain = null;
  }

  // ── Audio init ────────────────────────────────────────────────────

  async _initAudio() {
    if (this._workletReady) return;
    AudioEngine.resume();
    this._ctx = AudioEngine.getContext();
    await this._ctx.audioWorklet.addModule('../../worklets/BBDChorusProcessor.js');
    this._workletReady = true;

    // Build shared LFO
    this._lfo = this._ctx.createOscillator();
    this._lfo.type = 'triangle';
    this._lfo.frequency.value = 0.5;
    this._lfoGain = this._ctx.createGain();
    this._lfoGain.gain.value = 0;
    this._lfo.connect(this._lfoGain);
    this._lfo.start();

    // Build BBD Chorus
    this._chorus = new AudioWorkletNode(this._ctx, 'bbd-chorus', { numberOfOutputs: 1 });
    this._chorus.parameters.get('mode').value  = 0;
    this._chorus.parameters.get('rate').value  = 0.5;
    this._chorus.parameters.get('depth').value = 0.6;
    this._chorus.connect(AudioEngine.getMasterOutput());
  }

  // ── Voice pool ────────────────────────────────────────────────────

  async noteOn(midiNote, velocity = 1) {
    await this._initAudio();

    // Release any existing instance of same note (re-trigger)
    this.noteOff(midiNote);

    // Voice steal if all 6 slots used
    if (this._voices.length >= NUM_VOICES) {
      this.noteOff(this._voiceOrder[0].note);
    }

    const voice = this._buildVoice(midiNote, velocity);
    this._voices.push(voice);
    this._voiceOrder.push(voice);
  }

  noteOff(midiNote) {
    const idx = this._voices.findIndex(v => v.note === midiNote);
    if (idx === -1) return;
    const voice = this._voices[idx];
    this._voices.splice(idx, 1);
    this._voiceOrder = this._voiceOrder.filter(v => v !== voice);

    const ctx = this._ctx;
    const p   = this._params;
    const now = ctx.currentTime;
    scheduleRelease(voice.vca.gain, now, p.vcaR);
    const stop = now + p.vcaR + 0.2;
    voice.oscs.forEach(o => { try { o.stop(stop); } catch(e){} });
  }

  allNotesOff() {
    [...this._voices.map(v => v.note)].forEach(n => this.noteOff(n));
  }

  _buildVoice(midiNote, velocity) {
    const ctx  = this._ctx;
    const p    = this._params;
    const now  = ctx.currentTime;
    const freq = noteToHz(midiNote) * (p.dcoRange / 8);

    const oscs = [];

    // ── DCO Sawtooth ───────────────────────────────────────────────────
    const sawGain = ctx.createGain();
    sawGain.gain.value = p.dcoSaw ? 0.5 : 0;
    if (p.dcoSaw) {
      const saw = ctx.createOscillator();
      saw.type = 'sawtooth'; saw.frequency.value = freq;
      saw.connect(sawGain); saw.start(now); oscs.push(saw);
    }

    // ── DCO Pulse ─────────────────────────────────────────────────────
    const pulseGain = ctx.createGain();
    pulseGain.gain.value = p.dcoPulse ? 0.5 : 0;
    const pulse = ctx.createOscillator();
    // Web Audio API doesn't have pulse width directly; simulate with
    // two sawtooth waves phase-shifted by PW (Gibbs-approximation)
    pulse.type = 'sawtooth'; pulse.frequency.value = freq;
    const pulse2 = ctx.createOscillator();
    pulse2.type = 'sawtooth'; pulse2.frequency.value = freq;
    const invertGain = ctx.createGain(); invertGain.gain.value = -1;
    const pulseDetuneConst = p.dcoPW * 100; // crude PWM via detune
    pulse2.detune.value = pulseDetuneConst;
    pulse.connect(pulseGain); pulse2.connect(invertGain); invertGain.connect(pulseGain);
    pulse.start(now); pulse2.start(now);
    oscs.push(pulse, pulse2);

    // ── Sub oscillator ────────────────────────────────────────────────
    const subGain = ctx.createGain();
    subGain.gain.value = p.dcoSub > 0 ? 0.3 : 0;
    if (p.dcoSub > 0) {
      const sub = ctx.createOscillator();
      sub.type = 'square';
      sub.frequency.value = freq * (p.dcoSub === 2 ? 0.25 : 0.5);
      sub.connect(subGain); sub.start(now); oscs.push(sub);
    }

    // ── Noise ─────────────────────────────────────────────────────────
    const noiseGain = ctx.createGain(); noiseGain.gain.value = p.dcoNoise * 0.3;
    const nBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = nBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = nBuf; noiseSrc.loop = true;
    noiseSrc.connect(noiseGain); noiseSrc.start(now); oscs.push(noiseSrc);

    // ── Mixer ─────────────────────────────────────────────────────────
    const mixer = ctx.createGain(); mixer.gain.value = 0.25;
    [sawGain, pulseGain, subGain, noiseGain].forEach(g => g.connect(mixer));

    // ── HPF ────────────────────────────────────────────────────────────
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = [20, 240, 800][p.hpf] || 20;
    hpf.Q.value = 0.7;

    // ── VCF — two cascaded 12dB LPF (total 24 dB/oct) ─────────────────
    const freqHz = 20 * Math.pow(900, p.vcfCutoff); // 20–18000 Hz
    const keyFreqAdd = freq * p.vcfKeyFollow;
    const vcfFreq = Math.min(freqHz + keyFreqAdd, 18000);

    const vcf1 = ctx.createBiquadFilter();
    vcf1.type = 'lowpass'; vcf1.frequency.value = vcfFreq; vcf1.Q.value = p.vcfRes * 8;
    const vcf2 = ctx.createBiquadFilter();
    vcf2.type = 'lowpass'; vcf2.frequency.value = vcfFreq; vcf2.Q.value = p.vcfRes * 8;

    // VCF envelope
    const vcfEnvGain = ctx.createGain();
    vcfEnvGain.gain.setValueAtTime(0, now);

    // Apply ADSR to vcf frequency via a ConstantSourceNode trick
    const vcfEnvAmt = p.vcfEnvAmt * vcfFreq * 3;
    if (vcfEnvAmt > 0) {
      vcf1.frequency.setValueAtTime(vcfFreq + vcfEnvAmt, now);
      vcf1.frequency.exponentialRampToValueAtTime(
        Math.max(vcfFreq, 20), now + p.vcfA + p.vcfD);
      vcf2.frequency.setValueAtTime(vcfFreq + vcfEnvAmt, now);
      vcf2.frequency.exponentialRampToValueAtTime(
        Math.max(vcfFreq, 20), now + p.vcfA + p.vcfD);
    }

    // LFO → VCF
    if (p.vcfLFOamt > 0 && this._lfoGain) {
      const lfoVCF = ctx.createGain();
      lfoVCF.gain.value = p.vcfLFOamt * 2000;
      this._lfoGain.connect(lfoVCF);
      lfoVCF.connect(vcf1.frequency); lfoVCF.connect(vcf2.frequency);
    }

    // ── VCA ────────────────────────────────────────────────────────────
    const vca = ctx.createGain(); vca.gain.setValueAtTime(0, now);
    scheduleADSR(vca.gain, ctx, p.vcaA, p.vcaD, p.vcaS, p.vcaR, now, velocity * 0.7);

    // Routing
    mixer.connect(hpf); hpf.connect(vcf1); vcf1.connect(vcf2);
    vcf2.connect(vca);  vca.connect(this._chorus);

    return { note: midiNote, oscs, vca, vcf1, vcf2 };
  }

  // ── UI ────────────────────────────────────────────────────────────

  buildUI() {
    const root = this._root;
    root.innerHTML = '';
    root.className = 'juno106';

    const hdr = el('div', 'juno-header');
    hdr.innerHTML = `
      <div class="juno-logo">
        <span class="juno-brand">ROLAND</span>
        <span class="juno-model">JUNO-106</span>
        <span class="juno-subtitle">Programmable Polyphonic Synthesizer</span>
      </div>`;
    root.appendChild(hdr);

    const panel = el('div', 'juno-panel');
    panel.appendChild(this._buildDCO());
    panel.appendChild(this._buildHPF());
    panel.appendChild(this._buildVCF());
    panel.appendChild(this._buildVCA());
    panel.appendChild(this._buildLFO());
    panel.appendChild(this._buildChorus());
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
    const sec = el('div', 'juno-section');
    const ttl = el('div', 'juno-section-title'); ttl.textContent = title;
    sec.appendChild(ttl);
    const body = el('div', 'juno-section-body');
    sec.appendChild(body);
    return { sec, body };
  }

  _slider(container, label, param, min, max, defaultVal, vertical = true, onInit = null) {
    const wrap = el('div', 'juno-slider-wrap');
    const lbl = el('div', 'juno-slider-label'); lbl.textContent = label;
    wrap.appendChild(lbl);
    new Slider({
      container: wrap, min, max, value: defaultVal, defaultValue: defaultVal,
      orientation: vertical ? 'vertical' : 'horizontal',
      width: 18, height: 64, color: '#4488ff',
      onChange: v => {
        this._params[param] = v;
        if (onInit) onInit(v);
      },
    });
    container.appendChild(wrap);
  }

  _toggleBtn(container, label, param, onToggle) {
    const btn = el('button', 'juno-toggle-btn');
    btn.textContent = label;
    btn.classList.toggle('active', !!this._params[param]);
    btn.addEventListener('click', () => {
      this._params[param] = !this._params[param];
      btn.classList.toggle('active', !!this._params[param]);
      if (onToggle) onToggle(this._params[param]);
    });
    container.appendChild(btn);
  }

  _buildDCO() {
    const { sec, body } = this._buildSection('DCO');
    body.style.display = 'flex'; body.style.gap = '8px'; body.style.alignItems = 'flex-end';

    // Range selector
    const rangeWrap = el('div', 'juno-range-wrap');
    const rangeLbl = el('div', 'juno-ctrl-label'); rangeLbl.textContent = 'RANGE';
    rangeWrap.appendChild(rangeLbl);
    [16, 8, 4, 2].forEach(ft => {
      const btn = el('button', 'juno-range-btn');
      btn.textContent = `${ft}′`;
      btn.classList.toggle('active', this._params.dcoRange === ft);
      btn.addEventListener('click', () => {
        this._params.dcoRange = ft;
        rangeWrap.querySelectorAll('.juno-range-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      rangeWrap.appendChild(btn);
    });
    body.appendChild(rangeWrap);

    this._slider(body, 'LFO', 'dcoPW', 0, 1, 0.5);
    this._slider(body, 'PWM', 'dcoPW', 0, 1, 0.5);
    this._toggleBtn(body, 'PULSE', 'dcoPulse');
    this._toggleBtn(body, 'SAW',   'dcoSaw');

    // Sub
    const subWrap = el('div', 'juno-sub-wrap');
    const subLbl = el('div', 'juno-ctrl-label'); subLbl.textContent = 'SUB';
    subWrap.appendChild(subLbl);
    [0,1,2].forEach(v => {
      const btn = el('button', 'juno-sub-btn');
      btn.textContent = v === 0 ? 'OFF' : v === 1 ? '-1' : '-2';
      btn.classList.toggle('active', this._params.dcoSub === v);
      btn.addEventListener('click', () => {
        this._params.dcoSub = v;
        subWrap.querySelectorAll('.juno-sub-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      subWrap.appendChild(btn);
    });
    body.appendChild(subWrap);

    this._slider(body, 'NOISE', 'dcoNoise', 0, 1, 0);
    return sec;
  }

  _buildHPF() {
    const { sec, body } = this._buildSection('HPF');
    body.style.display = 'flex'; body.style.gap = '4px'; body.style.alignItems = 'flex-end';
    const wrap = el('div', 'juno-hpf-wrap');
    const lbl = el('div', 'juno-ctrl-label'); lbl.textContent = 'FREQ';
    wrap.appendChild(lbl);
    [0,1,2].forEach(v => {
      const btn = el('button', 'juno-hpf-btn');
      btn.textContent = v;
      btn.classList.toggle('active', this._params.hpf === v);
      btn.addEventListener('click', () => {
        this._params.hpf = v;
        wrap.querySelectorAll('.juno-hpf-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      wrap.appendChild(btn);
    });
    body.appendChild(wrap);
    return sec;
  }

  _buildVCF() {
    const { sec, body } = this._buildSection('VCF');
    body.style.display = 'flex'; body.style.gap = '8px'; body.style.alignItems = 'flex-end';
    this._slider(body, 'FREQ',    'vcfCutoff', 0, 1, 0.7);
    this._slider(body, 'RES',     'vcfRes',    0, 1, 0);
    this._slider(body, 'ENV',     'vcfEnvAmt', 0, 1, 0);
    this._slider(body, 'LFO',     'vcfLFOamt', 0, 1, 0);
    this._slider(body, 'KEY',     'vcfKeyFollow', 0, 1, 0);
    // Env
    const envWrap = el('div', 'juno-env-wrap');
    const lbl = el('div', 'juno-ctrl-label'); lbl.textContent = 'ENV';
    envWrap.appendChild(lbl);
    const envBody = el('div', 'juno-env-body');
    this._slider(envBody, 'A', 'vcfA', 0.001, 5, 0.005);
    this._slider(envBody, 'D', 'vcfD', 0.001, 5, 0.3);
    this._slider(envBody, 'S', 'vcfS', 0, 1, 0.6);
    this._slider(envBody, 'R', 'vcfR', 0.001, 5, 0.2);
    envWrap.appendChild(envBody);
    body.appendChild(envWrap);
    return sec;
  }

  _buildVCA() {
    const { sec, body } = this._buildSection('VCA');
    body.style.display = 'flex'; body.style.gap = '8px'; body.style.alignItems = 'flex-end';

    // Mode
    const modeWrap = el('div', 'juno-mode-wrap');
    const mLbl = el('div', 'juno-ctrl-label'); mLbl.textContent = 'MODE';
    modeWrap.appendChild(mLbl);
    ['ENV', 'GATE'].forEach(m => {
      const btn = el('button', 'juno-mode-btn');
      btn.textContent = m;
      btn.classList.toggle('active', this._params.vcaMode === m.toLowerCase());
      btn.addEventListener('click', () => {
        this._params.vcaMode = m.toLowerCase();
        modeWrap.querySelectorAll('.juno-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      modeWrap.appendChild(btn);
    });
    body.appendChild(modeWrap);

    const envWrap = el('div', 'juno-env-wrap');
    const eLbl = el('div', 'juno-ctrl-label'); eLbl.textContent = 'ADSR';
    envWrap.appendChild(eLbl);
    const envBody = el('div', 'juno-env-body');
    this._slider(envBody, 'A', 'vcaA', 0.001, 5, 0.005);
    this._slider(envBody, 'D', 'vcaD', 0.001, 5, 0.3);
    this._slider(envBody, 'S', 'vcaS', 0, 1, 0.8);
    this._slider(envBody, 'R', 'vcaR', 0.001, 5, 0.3);
    envWrap.appendChild(envBody);
    body.appendChild(envWrap);
    return sec;
  }

  _buildLFO() {
    const { sec, body } = this._buildSection('LFO');
    body.style.display = 'flex'; body.style.gap = '8px'; body.style.alignItems = 'flex-end';
    this._slider(body, 'RATE', 'lfoRate', 0, 1, 0.5, true, v => {
      if (this._lfo) this._lfo.frequency.value = 0.05 * Math.pow(200, v);
    });
    this._slider(body, 'DELAY', 'lfoDelay', 0, 5, 0);
    return sec;
  }

  _buildChorus() {
    const { sec, body } = this._buildSection('CHORUS');
    body.style.display = 'flex'; body.style.gap = '6px'; body.style.alignItems = 'flex-end';
    const lbl = el('div', 'juno-ctrl-label'); lbl.textContent = 'MODE';
    body.appendChild(lbl);
    ['OFF', 'I', 'II'].forEach((m, i) => {
      const btn = el('button', 'juno-chorus-btn');
      btn.textContent = m;
      btn.classList.toggle('active', this._params.chorus === i);
      btn.addEventListener('click', async () => {
        await this._initAudio();
        this._params.chorus = i;
        body.querySelectorAll('.juno-chorus-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (this._chorus) {
          this._chorus.parameters.get('mode').value = i;
        }
      });
      body.appendChild(btn);
    });
    return sec;
  }

  _buildKeyboard() {
    const wrap = el('div', 'juno-keyboard');
    const kb = el('div', 'juno-kb-inner');
    const notes = Array.from({length: 37}, (_, i) => 48 + i); // 3 octaves
    const isBlack = n => [1,3,6,8,10].includes(n % 12);
    notes.filter(n => !isBlack(n)).forEach(note => {
      const key = el('div', 'juno-key juno-key-white');
      this._bindKey(key, note); kb.appendChild(key);
    });
    notes.filter(n => isBlack(n)).forEach(note => {
      const key = el('div', 'juno-key juno-key-black');
      this._bindKey(key, note); kb.appendChild(key);
    });
    wrap.appendChild(kb);
    const s = el('div', 'juno-midi-status');
    s.textContent = 'QWERTY A–K plays C3–C4  |  Up to 6 simultaneous notes  |  Connect MIDI keyboard';
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
