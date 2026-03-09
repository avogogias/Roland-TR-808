/**
 * Vocoder.js — Phase-vocoder synthesizer module.
 *
 * Signal path:
 *   Microphone → DC HPF → Analysis BPF bank (N bands)
 *                              ↓
 *                    Envelope followers (AudioWorklet, separate attack/release)
 *                              ↓ (drives VCA.gain at audio rate)
 *   Carrier OSC/Noise → Synthesis BPF bank (N bands) → VCAs → Output mix
 *                                                                    ↓
 *                                              Sibilance HPF path ───┤
 *                                                                    ↓
 *                                                     Wet gain + Dry gain
 *                                                                    ↓
 *                                                           Master volume → out
 *
 * Features:
 *   • 8 / 16 / 32 analysis + synthesis bands (log-spaced 80 Hz – 10 kHz)
 *   • Carrier: Buzz (detuned saws), Sawtooth, Square, Triangle, Noise
 *   • Formant shift  ±12 semitones (shifts synthesis bank frequencies)
 *   • Independent attack / release envelope follower (per-band AudioWorklet)
 *   • Filter Q (bandwidth) control
 *   • Sibilance enhancement (unvoiced fricative boost via HPF path)
 *   • Dry / wet mix  •  Microphone gain  •  Master volume
 *   • VU meter (canvas-based, audio-rate from AnalyserNode)
 *   • MIDI note-on/off + pitch-bend  •  QWERTY keyboard  •  On-screen piano
 *   • Presets: Robot, Choir, Radio, Whisper, Alien
 *   • Carrier hold / latch toggle for hands-free performance
 */

import AudioEngine    from '../../core/AudioEngine.js';
import MidiController from '../../core/MidiController.js';
import Knob           from '../../components/Knob.js';
import { noteToHz, QWERTY_NOTE_MAP } from '../../core/utils.js';

// ─── DOM helper ──────────────────────────────────────────────────────────────
function el(tag, cls = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

// ─── Band frequency table ─────────────────────────────────────────────────────
/** Logarithmically spaced center frequencies from minF to maxF. */
function bandFrequencies(numBands, minF = 80, maxF = 10000) {
  const freqs = [];
  for (let i = 0; i < numBands; i++) {
    freqs.push(minF * Math.pow(maxF / minF, i / (numBands - 1)));
  }
  return freqs;
}

// ─── Note name helper ─────────────────────────────────────────────────────────
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function noteName(midi) {
  return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}

// ─── Presets ──────────────────────────────────────────────────────────────────
const PRESETS = {
  robot: {
    carrierType: 'buzz',     numBands: 16, filterQ: 3.0,
    formantShift: 0,         attack: 0.003, release: 0.06,
    sibilance: 0.15,         dryWet: 1.0,  micGain: 4.0,
    carrierDetune: 7,        carrierOct: 0,
  },
  choir: {
    carrierType: 'buzz',     numBands: 32, filterQ: 1.8,
    formantShift: 0,         attack: 0.015, release: 0.2,
    sibilance: 0.3,          dryWet: 1.0,  micGain: 5.0,
    carrierDetune: 14,       carrierOct: 0,
  },
  radio: {
    carrierType: 'sawtooth', numBands: 8,  filterQ: 5.0,
    formantShift: 0,         attack: 0.002, release: 0.035,
    sibilance: 0.5,          dryWet: 0.95, micGain: 4.0,
    carrierDetune: 0,        carrierOct: 0,
  },
  whisper: {
    carrierType: 'noise',    numBands: 16, filterQ: 2.5,
    formantShift: 0,         attack: 0.005, release: 0.12,
    sibilance: 0.8,          dryWet: 1.0,  micGain: 6.0,
    carrierDetune: 0,        carrierOct: 0,
  },
  alien: {
    carrierType: 'square',   numBands: 32, filterQ: 5.5,
    formantShift: 7,         attack: 0.001, release: 0.12,
    sibilance: 0.55,         dryWet: 1.0,  micGain: 4.0,
    carrierDetune: 0,        carrierOct: 1,
  },
};

// ─── Main class ───────────────────────────────────────────────────────────────
export default class Vocoder {
  constructor(rootEl) {
    this._root = rootEl;
    this._ctx  = null;
    this._workletReady = false;
    this._micStream    = null;
    this._micActive    = false;
    this._midiId       = null;

    // ── Synthesis parameters ─────────────────────────────────────────────
    this._params = {
      // Carrier
      carrierType:   'buzz',  // buzz | sawtooth | square | triangle | noise
      carrierNote:   60,      // MIDI note (C4)
      carrierOct:    0,       // octave transpose (-2 … +2)
      carrierDetune: 7,       // cents (buzz spread)
      // Vocoder
      numBands:      16,      // 8 | 16 | 32
      filterQ:       2.5,     // BPF bandwidth quality factor
      formantShift:  0,       // semitones, shifts synthesis bank
      sibilance:     0.2,     // 0-1  HPF high-freq boost
      // Envelope follower
      attack:        0.005,   // seconds
      release:       0.08,    // seconds
      // Levels
      micGain:       4.0,     // pre-analysis microphone gain
      dryWet:        1.0,     // 0 = dry voice, 1 = full vocoder
      masterVol:     0.75,
    };

    // ── Audio graph node references (populated by _buildVocoderGraph) ────
    this._micSource     = null;
    this._micGainNode   = null;
    this._analyserNode  = null;
    this._envFollower   = null;  // AudioWorkletNode (N in, N out)
    this._analysisBP    = [];    // BiquadFilterNode[] — analysis bank
    this._synthBP       = [];    // BiquadFilterNode[] — synthesis bank
    this._synthVCA      = [];    // GainNode[]         — driven by envelope
    this._carrierOscs   = [];    // OscillatorNode[]
    this._carrierNoise  = null;  // AudioBufferSourceNode
    this._carrierMix    = null;  // GainNode — sums carrier sources
    this._carrierGate   = null;  // GainNode — key-gated amplitude
    this._outputMix     = null;  // GainNode — sums synthesis bands
    this._sibilanceHPF  = null;  // BiquadFilterNode — fricative enhancer
    this._sibilanceGain = null;  // GainNode
    this._dryGain       = null;  // GainNode
    this._wetGain       = null;  // GainNode
    this._masterGain    = null;  // GainNode

    // ── Performance state ────────────────────────────────────────────────
    this._activeNote   = null;   // currently pressed MIDI note
    this._holdMode     = false;  // latch carrier on note-off
    this._pitchBend    = 0;      // semitones (-2 … +2)

    // ── UI state ─────────────────────────────────────────────────────────
    this._vuAnimId     = null;
    this._onKeyDown    = null;
    this._onKeyUp      = null;
    this._knobRefs     = {};     // param → Knob instance (for preset refresh)
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Audio initialisation
  // ══════════════════════════════════════════════════════════════════════════

  async _initAudio() {
    if (this._workletReady) return;
    AudioEngine.resume();
    this._ctx = AudioEngine.getContext();
    await this._ctx.audioWorklet.addModule('../../worklets/VocoderProcessor.js');
    this._workletReady = true;
  }

  async _initMic() {
    if (this._micActive) return;
    try {
      this._micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl:  false,
          channelCount:     1,
        },
      });
      this._micSource = this._ctx.createMediaStreamSource(this._micStream);
      this._micActive = true;
      // Wire mic into the already-built graph
      this._micSource.connect(this._micGainNode);
      this._updateMicUI(true);
    } catch (err) {
      console.warn('Microphone access denied:', err);
      this._updateMicUI(false, 'MIC DENIED');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Vocoder audio graph
  // ══════════════════════════════════════════════════════════════════════════

  _buildVocoderGraph() {
    this._teardownVocoderGraph();

    const ctx   = this._ctx;
    const p     = this._params;
    const N     = p.numBands;
    const dest  = AudioEngine.getMasterOutput();
    const freqs = bandFrequencies(N);

    // ── Microphone input chain ───────────────────────────────────────────
    this._micGainNode = ctx.createGain();
    this._micGainNode.gain.value = p.micGain;

    // DC-blocking / sub-rumble removal (below ~60 Hz)
    const dcHPF = ctx.createBiquadFilter();
    dcHPF.type = 'highpass';
    dcHPF.frequency.value = 60;
    dcHPF.Q.value = 0.5;

    // AnalyserNode must be in the audio-pull graph to receive data.
    // Chain: micGain → analyser → dcHPF → [analysis filters & dry path]
    this._analyserNode = ctx.createAnalyser();
    this._analyserNode.fftSize = 512;
    this._analyserNode.smoothingTimeConstant = 0.6;

    this._micGainNode.connect(this._analyserNode);
    this._analyserNode.connect(dcHPF);

    if (this._micSource) {
      this._micSource.connect(this._micGainNode);
    }

    // ── Envelope-follower AudioWorklet (N inputs → N outputs) ───────────
    this._envFollower = new AudioWorkletNode(ctx, 'vocoder-envelope', {
      numberOfInputs:     N,
      numberOfOutputs:    N,
      outputChannelCount: new Array(N).fill(1),
    });
    this._envFollower.parameters.get('attack').value  = p.attack;
    this._envFollower.parameters.get('release').value = p.release;
    // envGain: compensate for signal splitting across N bands + mic level
    this._envFollower.parameters.get('envGain').value = p.micGain * (N / 4);

    // ── Analysis BPF bank ────────────────────────────────────────────────
    this._analysisBP = freqs.map((f, i) => {
      const bp = ctx.createBiquadFilter();
      bp.type            = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value         = p.filterQ;
      // dcHPF fans out to all analysis filters
      dcHPF.connect(bp);
      // Each analysis filter → input i of the envelope worklet
      bp.connect(this._envFollower, 0, i);
      return bp;
    });

    // ── Carrier signal chain ─────────────────────────────────────────────
    this._carrierMix = ctx.createGain();
    this._carrierMix.gain.value = 1.0;

    this._carrierGate = ctx.createGain();
    this._carrierGate.gain.value = 0.0; // gated by noteOn/noteOff

    this._carrierMix.connect(this._carrierGate);
    this._buildCarrierOscillators();

    // ── Synthesis BPF bank + VCAs ────────────────────────────────────────
    this._outputMix = ctx.createGain();
    // Normalise output level for varying band counts
    this._outputMix.gain.value = 1.0 / Math.sqrt(N);

    const formantRatio = Math.pow(2, p.formantShift / 12);

    this._synthBP  = [];
    this._synthVCA = [];
    freqs.forEach((f, i) => {
      const bp = ctx.createBiquadFilter();
      bp.type            = 'bandpass';
      bp.frequency.value = f * formantRatio;
      bp.Q.value         = p.filterQ;

      // VCA: base gain = 0, driven additively by envelope output
      const vca = ctx.createGain();
      vca.gain.value = 0.0;

      this._carrierGate.connect(bp);
      bp.connect(vca);
      vca.connect(this._outputMix);

      // Connect output i of envelope worklet → VCA[i].gain AudioParam
      this._envFollower.connect(vca.gain, i);

      this._synthBP.push(bp);
      this._synthVCA.push(vca);
    });

    // ── Sibilance path (unvoiced fricative enhancer) ─────────────────────
    // A separate HPF path on the carrier, blended in to preserve /s/ /sh/ etc.
    this._sibilanceHPF = ctx.createBiquadFilter();
    this._sibilanceHPF.type = 'highpass';
    this._sibilanceHPF.frequency.value = 4500;
    this._sibilanceHPF.Q.value = 0.7;

    this._sibilanceGain = ctx.createGain();
    this._sibilanceGain.gain.value = p.sibilance;

    this._carrierGate.connect(this._sibilanceHPF);
    this._sibilanceHPF.connect(this._sibilanceGain);
    this._sibilanceGain.connect(this._outputMix);

    // ── Master output stage ──────────────────────────────────────────────
    this._masterGain = ctx.createGain();
    this._masterGain.gain.value = p.masterVol;

    this._dryGain = ctx.createGain();
    this._dryGain.gain.value = 1.0 - p.dryWet;

    this._wetGain = ctx.createGain();
    this._wetGain.gain.value = p.dryWet;

    // Dry: raw mic signal (post micGain, post analyser)
    dcHPF.connect(this._dryGain);

    this._outputMix.connect(this._wetGain);
    this._dryGain.connect(this._masterGain);
    this._wetGain.connect(this._masterGain);
    this._masterGain.connect(dest);
  }

  _teardownVocoderGraph() {
    // Stop carrier oscillators / noise
    this._carrierOscs.forEach(osc => { try { osc.stop(); } catch (_) {} });
    this._carrierOscs = [];
    if (this._carrierNoise) {
      try { this._carrierNoise.stop(); } catch (_) {}
      this._carrierNoise = null;
    }

    // Disconnect all nodes (GC handles memory, disconnect breaks the pull graph)
    const nodes = [
      this._micGainNode,  this._analyserNode,  this._envFollower,
      this._carrierMix,   this._carrierGate,   this._outputMix,
      this._sibilanceHPF, this._sibilanceGain, this._masterGain,
      this._dryGain,      this._wetGain,
      ...this._analysisBP, ...this._synthBP, ...this._synthVCA,
    ];
    nodes.forEach(n => { try { n?.disconnect(); } catch (_) {} });

    this._analysisBP    = [];
    this._synthBP       = [];
    this._synthVCA      = [];
    this._envFollower   = null;
    this._carrierGate   = null;
    this._carrierMix    = null;
    this._outputMix     = null;
    this._masterGain    = null;
  }

  // ── Carrier oscillator construction ──────────────────────────────────────
  _buildCarrierOscillators() {
    const ctx  = this._ctx;
    const p    = this._params;
    const freq = noteToHz(p.carrierNote) * Math.pow(2, p.carrierOct);

    // Clean up any existing sources
    this._carrierOscs.forEach(o => { try { o.stop(); } catch (_) {} });
    this._carrierOscs = [];
    if (this._carrierNoise) {
      try { this._carrierNoise.stop(); } catch (_) {}
      this._carrierNoise = null;
    }

    if (p.carrierType === 'noise') {
      // White-noise carrier (good for whispered-voice vocoding)
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d   = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop   = true;
      src.connect(this._carrierMix);
      src.start();
      this._carrierNoise = src;

    } else if (p.carrierType === 'buzz') {
      // Buzz: 5 detuned sawtooth oscillators for a rich, choir-like carrier.
      // Spread: root + ±spread + ±(spread*2) in cents
      const spread = Math.max(1, p.carrierDetune);
      const config = [
        { detune: 0,           gain: 0.45 },
        { detune:  spread,     gain: 0.22 },
        { detune: -spread,     gain: 0.22 },
        { detune:  spread * 2, gain: 0.11 },
        { detune: -spread * 2, gain: 0.11 },
      ];
      config.forEach(({ detune, gain: g }) => {
        const osc = ctx.createOscillator();
        osc.type           = 'sawtooth';
        osc.frequency.value = freq;
        osc.detune.value   = detune;
        const gn = ctx.createGain();
        gn.gain.value = g;
        osc.connect(gn);
        gn.connect(this._carrierMix);
        osc.start();
        this._carrierOscs.push(osc);
      });

    } else {
      // Single waveform carrier (sawtooth | square | triangle)
      const osc = ctx.createOscillator();
      osc.type           = p.carrierType;
      osc.frequency.value = freq;
      osc.detune.value   = p.carrierDetune;
      osc.connect(this._carrierMix);
      osc.start();
      this._carrierOscs.push(osc);
    }
  }

  // ── Update carrier pitch smoothly ─────────────────────────────────────────
  _setCarrierFrequency(midiNote) {
    if (!this._ctx) return;
    const freq = noteToHz(midiNote) * Math.pow(2, this._params.carrierOct);
    this._carrierOscs.forEach(osc => {
      osc.frequency.setTargetAtTime(freq, this._ctx.currentTime, 0.008);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Note / voice handling
  // ══════════════════════════════════════════════════════════════════════════

  async noteOn(midiNote, velocity = 1) {
    await this._initAudio();
    if (!this._workletReady) return;
    if (!this._outputMix) this._buildVocoderGraph();

    this._activeNote = midiNote;
    this._params.carrierNote = midiNote;
    this._setCarrierFrequency(midiNote);

    // Open carrier gate with a short attack to avoid clicks
    const now = this._ctx.currentTime;
    this._carrierGate.gain.cancelScheduledValues(now);
    this._carrierGate.gain.setTargetAtTime(velocity * 0.9, now, 0.005);

    // Update on-screen keyboard highlight
    this._highlightKey(midiNote, true);
    this._updateNoteDisplay(midiNote);
  }

  noteOff(midiNote) {
    if (midiNote !== this._activeNote) return;
    if (this._holdMode) return; // latch — ignore note-off

    this._activeNote = null;

    // Close carrier gate
    if (this._carrierGate) {
      const now = this._ctx.currentTime;
      this._carrierGate.gain.cancelScheduledValues(now);
      this._carrierGate.gain.setTargetAtTime(0.0, now, 0.04);
    }
    this._highlightKey(midiNote, false);
  }

  allNotesOff() {
    if (!this._ctx || !this._carrierGate) return;
    this._activeNote = null;
    const now = this._ctx.currentTime;
    this._carrierGate.gain.cancelScheduledValues(now);
    this._carrierGate.gain.setTargetAtTime(0.0, now, 0.03);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Live parameter updates (no graph rebuild needed)
  // ══════════════════════════════════════════════════════════════════════════

  _updateLiveParam(param, value) {
    if (!this._ctx) return;
    const p   = this._params;
    const now = this._ctx.currentTime;

    switch (param) {
      case 'filterQ':
        this._analysisBP.forEach(f => { f.Q.setTargetAtTime(value, now, 0.01); });
        this._synthBP.forEach(f    => { f.Q.setTargetAtTime(value, now, 0.01); });
        break;

      case 'formantShift': {
        const ratio = Math.pow(2, value / 12);
        const base  = bandFrequencies(p.numBands);
        this._synthBP.forEach((f, i) => {
          f.frequency.setTargetAtTime(base[i] * ratio, now, 0.02);
        });
        break;
      }

      case 'attack':
        if (this._envFollower)
          this._envFollower.parameters.get('attack').value = value;
        break;

      case 'release':
        if (this._envFollower)
          this._envFollower.parameters.get('release').value = value;
        break;

      case 'micGain':
        if (this._micGainNode)
          this._micGainNode.gain.setTargetAtTime(value, now, 0.01);
        if (this._envFollower)
          this._envFollower.parameters.get('envGain').value = value * (p.numBands / 4);
        break;

      case 'sibilance':
        if (this._sibilanceGain)
          this._sibilanceGain.gain.setTargetAtTime(value, now, 0.01);
        break;

      case 'dryWet':
        if (this._dryGain) this._dryGain.gain.setTargetAtTime(1 - value, now, 0.01);
        if (this._wetGain) this._wetGain.gain.setTargetAtTime(value,     now, 0.01);
        break;

      case 'masterVol':
        if (this._masterGain)
          this._masterGain.gain.setTargetAtTime(value, now, 0.01);
        break;

      case 'carrierOct':
        if (this._activeNote !== null)
          this._setCarrierFrequency(this._activeNote);
        break;

      case 'carrierDetune':
        // For buzz mode, rebuild oscillators to recompute spread
        if (p.carrierType === 'buzz' && this._carrierMix) {
          this._buildCarrierOscillators();
        } else {
          this._carrierOscs.forEach(osc => {
            osc.detune.setTargetAtTime(value, now, 0.01);
          });
        }
        break;

      case 'numBands':
      case 'carrierType':
        // Require full graph rebuild
        if (this._outputMix) {
          const wasActive = this._activeNote;
          this._buildVocoderGraph();
          // If a note was active, reopen the carrier gate
          if (wasActive !== null) {
            this._carrierGate.gain.setTargetAtTime(0.9, this._ctx.currentTime, 0.005);
            this._setCarrierFrequency(wasActive);
          }
        }
        break;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Presets
  // ══════════════════════════════════════════════════════════════════════════

  _applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    Object.assign(this._params, preset);

    // Rebuild graph for the new settings (band count may have changed)
    if (this._outputMix) this._buildVocoderGraph();

    // Refresh knob displays
    this._refreshKnobs();
    this._refreshSelects();
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  MIDI + keyboard
  // ══════════════════════════════════════════════════════════════════════════

  _registerMidi() {
    this._midiId = MidiController.addListener(msg => {
      if (msg.type === 'noteon')    this.noteOn(msg.note, msg.velocity);
      if (msg.type === 'noteoff')   this.noteOff(msg.note);
      if (msg.type === 'pitchbend') this._pitchBend = msg.value * 2;
      if (msg.type === 'cc' && msg.cc === 123) this.allNotesOff();
    });
  }

  _unregisterMidi() {
    if (this._midiId !== null) {
      MidiController.removeListener(this._midiId);
      this._midiId = null;
    }
  }

  _bindQwerty() {
    document.addEventListener('keydown', this._onKeyDown = e => {
      if (e.repeat || e.metaKey || e.ctrlKey) return;
      const note = QWERTY_NOTE_MAP[e.key];
      if (note !== undefined) this.noteOn(note);
    });
    document.addEventListener('keyup', this._onKeyUp = e => {
      const note = QWERTY_NOTE_MAP[e.key];
      if (note !== undefined) this.noteOff(note);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  VU meter
  // ══════════════════════════════════════════════════════════════════════════

  _startVuMeter(canvas) {
    const ctx2d = canvas.getContext('2d');
    const data  = new Uint8Array(this._analyserNode?.frequencyBinCount || 128);
    const W = canvas.width;
    const H = canvas.height;

    const draw = () => {
      this._vuAnimId = requestAnimationFrame(draw);
      if (!this._analyserNode) return;

      this._analyserNode.getByteTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i++) {
        const v = Math.abs(data[i] / 128.0 - 1.0);
        if (v > peak) peak = v;
      }

      // Background
      ctx2d.fillStyle = '#0a0a0a';
      ctx2d.fillRect(0, 0, W, H);

      // LED segments
      const SEG = 24;
      const gap = 2;
      const sw  = (W - gap * (SEG - 1)) / SEG;

      for (let i = 0; i < SEG; i++) {
        const threshold = i / SEG;
        const lit = peak > threshold;
        let color;
        if (i < 16)      color = lit ? '#00e050' : '#0a2010';
        else if (i < 20) color = lit ? '#e0c000' : '#1a1800';
        else              color = lit ? '#e02010' : '#200800';

        ctx2d.fillStyle = color;
        ctx2d.fillRect(i * (sw + gap), 0, sw, H);
      }
    };
    draw();
  }

  _stopVuMeter() {
    if (this._vuAnimId !== null) {
      cancelAnimationFrame(this._vuAnimId);
      this._vuAnimId = null;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  UI helpers
  // ══════════════════════════════════════════════════════════════════════════

  _updateMicUI(active, message) {
    const status = this._root.querySelector('.vc-mic-status');
    const btn    = this._root.querySelector('.vc-mic-btn');
    if (status) {
      status.textContent = message ?? (active ? '● LIVE' : '○ OFFLINE');
      status.style.color = active ? '#00e050' : (message ? '#e04020' : '#888');
    }
    if (btn) {
      btn.textContent = active ? 'DISCONNECT' : 'CONNECT MIC';
      btn.classList.toggle('active', active);
    }
  }

  _highlightKey(midiNote, on) {
    const k = this._root.querySelector(`.vc-key[data-note="${midiNote}"]`);
    if (k) k.classList.toggle('pressed', on);
  }

  _updateNoteDisplay(midiNote) {
    const disp = this._root.querySelector('.vc-note-display');
    if (disp) disp.textContent = noteName(midiNote);
  }

  /** Push current _params values back into all registered Knob instances. */
  _refreshKnobs() {
    Object.entries(this._knobRefs).forEach(([param, knob]) => {
      if (knob && typeof knob.setValue === 'function') {
        knob.setValue(this._params[param]);
      }
    });
  }

  /** Sync <select> elements to current params. */
  _refreshSelects() {
    const p = this._params;
    const typeSel = this._root.querySelector('[data-param="carrierType"]');
    const bandSel = this._root.querySelector('[data-param="numBands"]');
    if (typeSel) typeSel.value = p.carrierType;
    if (bandSel) bandSel.value = String(p.numBands);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  UI build
  // ══════════════════════════════════════════════════════════════════════════

  buildUI() {
    const root = this._root;
    root.innerHTML = '';
    root.className = 'vocoder';

    // Header
    const hdr = el('div', 'vc-header');
    hdr.innerHTML = `
      <div class="vc-logo">
        <span class="vc-brand">SPECTRAL</span>
        <span class="vc-model">VOCODER</span>
        <span class="vc-subtitle">Phase Vocoder Synthesizer Module</span>
      </div>
      <div class="vc-header-right">
        <div class="vc-note-row">
          <span class="vc-note-label">CARRIER</span>
          <span class="vc-note-display">—</span>
        </div>
      </div>`;
    root.appendChild(hdr);

    const panel = el('div', 'vc-panel');
    panel.appendChild(this._buildModSection());
    panel.appendChild(this._buildCarrierSection());
    panel.appendChild(this._buildVocoderSection());
    panel.appendChild(this._buildEnvSection());
    panel.appendChild(this._buildOutputSection());
    panel.appendChild(this._buildPresetsSection());
    root.appendChild(panel);

    root.appendChild(this._buildKeyboard());

    MidiController.init();
    this._registerMidi();
    this._bindQwerty();
  }

  // ── Section scaffold ──────────────────────────────────────────────────────
  _buildSection(title) {
    const sec  = el('div', 'vc-section');
    const ttl  = el('div', 'vc-section-title');
    ttl.textContent = title;
    sec.appendChild(ttl);
    const body = el('div', 'vc-section-body');
    sec.appendChild(body);
    return { sec, body };
  }

  // ── Knob factory ──────────────────────────────────────────────────────────
  _knob(container, label, param, min, max, curve = 'linear') {
    const p    = this._params;
    const wrap = el('div', 'vc-knob-wrap');
    const knob = new Knob({
      container: wrap, min, max,
      value: p[param], defaultValue: p[param],
      size: 44, label, curve, color: '#8855dd',
      onChange: v => {
        p[param] = v;
        this._updateLiveParam(param, v);
      },
    });
    this._knobRefs[param] = knob;
    container.appendChild(wrap);
    return wrap;
  }

  // ── Select factory ────────────────────────────────────────────────────────
  _select(container, label, param, options) {
    const p    = this._params;
    const wrap = el('div', 'vc-select-wrap');
    const lbl  = el('div', 'vc-ctrl-label');
    lbl.textContent = label;
    const sel  = el('select', 'vc-select');
    sel.dataset.param = param;
    options.forEach(({ value, text }) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = text;
      opt.selected = String(p[param]) === String(value);
      sel.appendChild(opt);
    });
    sel.addEventListener('change', () => {
      const raw = sel.value;
      p[param] = isNaN(Number(raw)) ? raw : Number(raw);
      this._updateLiveParam(param, p[param]);
    });
    wrap.appendChild(lbl);
    wrap.appendChild(sel);
    container.appendChild(wrap);
    return sel;
  }

  // ── MODULATOR section ─────────────────────────────────────────────────────
  _buildModSection() {
    const { sec, body } = this._buildSection('MODULATOR');

    // VU meter
    const vuWrap = el('div', 'vc-vu-wrap');
    const canvas = el('canvas', 'vc-vu-canvas');
    canvas.width  = 240;
    canvas.height = 18;
    vuWrap.appendChild(canvas);
    body.appendChild(vuWrap);

    // Mic connect button + status
    const micRow = el('div', 'vc-mic-row');
    const status = el('span', 'vc-mic-status');
    status.textContent = '○ OFFLINE';
    status.style.color = '#888';
    const btn = el('button', 'vc-mic-btn');
    btn.textContent = 'CONNECT MIC';
    btn.addEventListener('click', async () => {
      await this._initAudio();
      if (!this._outputMix) this._buildVocoderGraph();
      await this._initMic();
      if (this._micActive && this._analyserNode) this._startVuMeter(canvas);
    });
    micRow.appendChild(status);
    micRow.appendChild(btn);
    body.appendChild(micRow);

    // Mic gain knob
    this._knob(body, 'MIC GAIN', 'micGain', 0.5, 16, 'exp');

    return sec;
  }

  // ── CARRIER section ───────────────────────────────────────────────────────
  _buildCarrierSection() {
    const { sec, body } = this._buildSection('CARRIER');

    this._select(body, 'WAVE', 'carrierType', [
      { value: 'buzz',     text: 'Buzz'   },
      { value: 'sawtooth', text: 'Saw'    },
      { value: 'square',   text: 'Square' },
      { value: 'triangle', text: 'Tri'    },
      { value: 'noise',    text: 'Noise'  },
    ]);

    this._knob(body, 'OCTAVE',  'carrierOct',    -2, 2);
    this._knob(body, 'DETUNE',  'carrierDetune',  0, 50);

    // Hold toggle
    const holdRow = el('div', 'vc-hold-row');
    const holdBtn = el('button', 'vc-hold-btn');
    holdBtn.textContent = 'HOLD OFF';
    holdBtn.addEventListener('click', () => {
      this._holdMode = !this._holdMode;
      holdBtn.textContent = this._holdMode ? 'HOLD ON' : 'HOLD OFF';
      holdBtn.classList.toggle('active', this._holdMode);
    });
    holdRow.appendChild(holdBtn);
    body.appendChild(holdRow);

    return sec;
  }

  // ── VOCODER section ───────────────────────────────────────────────────────
  _buildVocoderSection() {
    const { sec, body } = this._buildSection('VOCODER');

    this._select(body, 'BANDS', 'numBands', [
      { value: 8,  text: ' 8 bands' },
      { value: 16, text: '16 bands' },
      { value: 32, text: '32 bands' },
    ]);

    this._knob(body, 'FILTER Q',  'filterQ',      1, 12, 'exp');
    this._knob(body, 'FORMANT',   'formantShift', -12, 12);
    this._knob(body, 'SIBILANCE', 'sibilance',    0, 1);

    return sec;
  }

  // ── ENVELOPE section ──────────────────────────────────────────────────────
  _buildEnvSection() {
    const { sec, body } = this._buildSection('ENVELOPE');
    this._knob(body, 'ATTACK',  'attack',  0.0005, 0.5, 'exp');
    this._knob(body, 'RELEASE', 'release', 0.005,  2.0, 'exp');
    return sec;
  }

  // ── OUTPUT section ────────────────────────────────────────────────────────
  _buildOutputSection() {
    const { sec, body } = this._buildSection('OUTPUT');
    this._knob(body, 'DRY / WET', 'dryWet',    0, 1);
    this._knob(body, 'VOLUME',    'masterVol', 0, 1);
    return sec;
  }

  // ── PRESETS section ───────────────────────────────────────────────────────
  _buildPresetsSection() {
    const { sec, body } = this._buildSection('PRESETS');
    Object.keys(PRESETS).forEach(name => {
      const btn = el('button', 'vc-preset-btn');
      btn.textContent = name.toUpperCase();
      btn.addEventListener('click', () => {
        this._applyPreset(name);
        // Flash active state
        sec.querySelectorAll('.vc-preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      body.appendChild(btn);
    });
    return sec;
  }

  // ── On-screen keyboard ────────────────────────────────────────────────────
  _buildKeyboard() {
    const kb = el('div', 'vc-keyboard');

    const hint = el('div', 'vc-kb-hint');
    hint.textContent = 'KEYBOARD  ·  MIDI / QWERTY  (A – ; = C3 – E4)';
    kb.appendChild(hint);

    const keys = el('div', 'vc-keys');

    // Two octaves, C3–E4
    const layout = [
      { note: 48, key: 'a', black: false }, { note: 49, key: 'w', black: true },
      { note: 50, key: 's', black: false }, { note: 51, key: 'e', black: true },
      { note: 52, key: 'd', black: false },
      { note: 53, key: 'f', black: false }, { note: 54, key: 't', black: true },
      { note: 55, key: 'g', black: false }, { note: 56, key: 'y', black: true },
      { note: 57, key: 'h', black: false }, { note: 58, key: 'u', black: true },
      { note: 59, key: 'j', black: false },
      { note: 60, key: 'k', black: false }, { note: 61, key: 'o', black: true },
      { note: 62, key: 'l', black: false }, { note: 63, key: 'p', black: true },
      { note: 64, key: ';', black: false },
    ];

    layout.forEach(({ note, key, black }) => {
      const k = el('div', `vc-key ${black ? 'vc-key--black' : 'vc-key--white'}`);
      k.dataset.note = note;

      if (!black) {
        const lbl = el('span', 'vc-key-label');
        lbl.textContent = key.toUpperCase();
        k.appendChild(lbl);
      }

      k.addEventListener('pointerdown', evt => {
        evt.preventDefault();
        k.setPointerCapture(evt.pointerId);
        k.classList.add('pressed');
        this.noteOn(note);
      });
      k.addEventListener('pointerup',    () => { k.classList.remove('pressed'); this.noteOff(note); });
      k.addEventListener('pointercancel',() => { k.classList.remove('pressed'); this.noteOff(note); });

      keys.appendChild(k);
    });

    kb.appendChild(keys);
    return kb;
  }
}
