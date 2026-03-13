/**
 * FenderRhodes.js — Fender Rhodes Mark I Stage 73 electric piano simulation.
 *
 * Sound model:
 *   The real Rhodes uses a small metal tine struck by a hammer; the tine's
 *   vibration is picked up magnetically.  The hallmark "ding → warm" timbre
 *   is accurately modelled with FM synthesis — the same technique used in the
 *   Yamaha DX7 "RHODES" preset.
 *
 * Per-voice signal chain:
 *   Modulator (sine, noteHz)
 *     → ModDepthGain  [peak → sustain-floor, exponential decay over modDecay]
 *     → Carrier.frequency  ← FM modulation input
 *
 *   Bell (sine, noteHz × 2)
 *     → BellGain       [peak → 0, faster decay → bellDecay]
 *
 *   Carrier (sine, noteHz)  ──┐
 *   Bell ──────────────────────┼→ VCA (ADSR) → tremoloDepthGain → Master
 *
 * Tremolo: shared LFO — all voices route through a single tremolo gain node.
 * Polyphony: 8 voices, oldest-note stealing.
 * MIDI + QWERTY keyboard.
 */

import AudioEngine    from '../../core/AudioEngine.js';
import MidiController from '../../core/MidiController.js';
import Knob           from '../../components/Knob.js';
import { noteToHz, scheduleADSR, scheduleRelease, QWERTY_NOTE_MAP }
  from '../../core/utils.js';

const MAX_VOICES = 8;

// Black-key semitone offsets within an octave (C=0)
const BLACK_SEMITONES = new Set([1, 3, 6, 8, 10]);

export default class FenderRhodes {
  constructor(rootEl) {
    this._root = rootEl;
    this._ctx  = null;
    this._audioReady = false;

    // ── Synth parameters ──────────────────────────────────────────────────
    this._params = {
      // Tone (FM)
      brightness:  1.0,   // FM peak-index scaler (0.3 – 2.0)
      modDecay:    2.0,   // seconds for mod-index to decay (0.3 – 5.0)
      bellLevel:   0.25,  // level of 2× harmonic bell tone (0 – 0.6)
      bellDecay:   0.4,   // seconds for bell to decay (0.05 – 1.5)
      // Envelope
      attack:      0.006, // VCA attack  (s)
      decay:       2.5,   // VCA decay   (s)
      sustain:     0.55,  // VCA sustain (0–1)
      release:     0.35,  // VCA release (s)
      // Tremolo
      tremoloRate:  4.5,  // LFO frequency (Hz)
      tremoloDepth: 0.0,  // LFO depth 0–0.6
      // Output
      volume:      0.7,
    };

    this._voices      = [];   // active voice records
    this._voiceOrder  = [];   // oldest-first for voice stealing

    // Shared tremolo nodes (created in _initAudio)
    this._tremoloLFO       = null;
    this._tremoloDepthGain = null;   // LFO → tremoloMod
    this._tremoloMod       = null;   // ConstantSource bias so gain stays ≥ 0
    this._tremoloOut       = null;   // master tremolo GainNode

    this._midiId = null;
  }

  // ── Audio initialisation ────────────────────────────────────────────────

  async _initAudio() {
    if (this._audioReady) return;
    AudioEngine.resume();
    this._ctx = AudioEngine.getContext();

    const ctx = this._ctx;

    // ── Shared tremolo ───────────────────────────────────────────────────
    // Signal path:
    //   LFO (sine) → tremoloDepthGain ─┐
    //                                   ├→ tremoloOut.gain  (≈ 1 ± depth)
    //   biasSource (constant 1.0) ──────┘
    //
    // tremoloOut is the final node all voices connect to before master.

    this._tremoloOut = ctx.createGain();
    this._tremoloOut.gain.value = 1.0;
    this._tremoloOut.connect(AudioEngine.getMasterOutput());

    // Bias: keeps tremolo centre at 1.0
    const bias = ctx.createConstantSource();
    bias.offset.value = 1.0;
    bias.connect(this._tremoloOut.gain);
    bias.start();

    // LFO
    this._tremoloLFO = ctx.createOscillator();
    this._tremoloLFO.type = 'sine';
    this._tremoloLFO.frequency.value = this._params.tremoloRate;
    this._tremoloLFO.start();

    this._tremoloDepthGain = ctx.createGain();
    this._tremoloDepthGain.gain.value = this._params.tremoloDepth;
    this._tremoloLFO.connect(this._tremoloDepthGain);
    this._tremoloDepthGain.connect(this._tremoloOut.gain);

    this._audioReady = true;
  }

  // ── Polyphony / note events ─────────────────────────────────────────────

  async noteOn(midiNote, velocity = 0.8) {
    await this._initAudio();

    // Re-trigger: release any existing instance of the same note first
    this.noteOff(midiNote);

    // Voice steal: remove oldest if pool is full
    if (this._voices.length >= MAX_VOICES) {
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

    const now  = this._ctx.currentTime;
    const rel  = this._params.release;
    scheduleRelease(voice.vca.gain, now, rel);

    const stop = now + rel + 0.15;
    voice.oscs.forEach(o => { try { o.stop(stop); } catch (_) {} });
  }

  allNotesOff() {
    [...this._voices.map(v => v.note)].forEach(n => this.noteOff(n));
  }

  // ── FM voice synthesis ──────────────────────────────────────────────────

  _buildVoice(midiNote, velocity) {
    const ctx  = this._ctx;
    const p    = this._params;
    const now  = ctx.currentTime;
    const freq = noteToHz(midiNote);
    const vel  = Math.max(0.01, Math.min(1, velocity));

    // ── Modulator (FM tine brightness) ────────────────────────────────────
    //
    // The modulator deviates the carrier frequency.  A high initial deviation
    // (peak) creates the bright "ding" attack; the deviation then decays
    // exponentially to a low sustain floor, giving the warm pure-sine body.

    const modulator = ctx.createOscillator();
    modulator.type = 'sine';
    modulator.frequency.value = freq; // 1 : 1 operator ratio (DX7 Rhodes)

    const modDepth = ctx.createGain();
    const modPeak  = freq * 8  * vel * p.brightness;  // Hz peak deviation
    const modFloor = freq * 0.3     * p.brightness;   // Hz sustain floor
    modDepth.gain.setValueAtTime(modPeak, now);
    modDepth.gain.exponentialRampToValueAtTime(
      Math.max(modFloor, 0.01), now + p.modDecay);

    modulator.connect(modDepth);

    // ── Carrier (fundamental sine) ────────────────────────────────────────
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = freq;
    // FM: modDepth output drives carrier frequency
    modDepth.connect(carrier.frequency);

    // ── Bell harmonic (2× sine, faster decay) ─────────────────────────────
    const bell = ctx.createOscillator();
    bell.type = 'sine';
    bell.frequency.value = freq * 2.0;

    const bellGain = ctx.createGain();
    const bellPeak = vel * p.bellLevel;
    bellGain.gain.setValueAtTime(bellPeak, now);
    bellGain.gain.exponentialRampToValueAtTime(
      0.0001, now + p.bellDecay);
    bell.connect(bellGain);

    // ── VCA (ADSR amplitude envelope) ─────────────────────────────────────
    const vca = ctx.createGain();
    vca.gain.setValueAtTime(0, now);
    scheduleADSR(vca.gain, ctx,
      p.attack, p.decay, p.sustain, p.release,
      now, vel * p.volume);

    // ── Routing ───────────────────────────────────────────────────────────
    //   carrier + bell → mixer gain → VCA → tremoloOut
    const mixer = ctx.createGain();
    mixer.gain.value = 0.5;
    carrier.connect(mixer);
    bellGain.connect(mixer);
    mixer.connect(vca);
    vca.connect(this._tremoloOut);

    // ── Start oscillators ─────────────────────────────────────────────────
    modulator.start(now);
    carrier.start(now);
    bell.start(now);

    return {
      note: midiNote,
      vca,
      oscs: [modulator, carrier, bell],
    };
  }

  // ── UI ──────────────────────────────────────────────────────────────────

  buildUI() {
    const root = this._root;
    root.innerHTML  = '';
    root.className  = 'fender-rhodes';

    // ── Header / nameboard ────────────────────────────────────────────────
    const hdr = el('div', 'fr-header');
    hdr.innerHTML = `
      <div class="fr-logo">
        <span class="fr-brand">Fender</span>
        <span class="fr-model">Rhodes</span>
        <span class="fr-subtitle">Stage 73 Electric Piano</span>
      </div>`;
    root.appendChild(hdr);

    // ── Control panel ─────────────────────────────────────────────────────
    const panel = el('div', 'fr-panel');
    panel.appendChild(this._buildToneSection());
    panel.appendChild(this._buildEnvelopeSection());
    panel.appendChild(this._buildTremoloSection());
    panel.appendChild(this._buildOutputSection());
    root.appendChild(panel);

    // ── Keyboard ──────────────────────────────────────────────────────────
    root.appendChild(this._buildKeyboard());

    // ── MIDI + QWERTY ──────────────────────────────────────────────────────
    MidiController.init();
    this._midiId = MidiController.addListener(msg => {
      if (msg.type === 'noteon')  this.noteOn(msg.note, msg.velocity);
      if (msg.type === 'noteoff') this.noteOff(msg.note);
    });
    this._bindQwerty();
  }

  // ── Panel section helpers ───────────────────────────────────────────────

  _buildSection(title) {
    const sec  = el('div', 'fr-section');
    const ttl  = el('div', 'fr-section-title');
    ttl.textContent = title;
    sec.appendChild(ttl);
    const body = el('div', 'fr-section-body');
    sec.appendChild(body);
    return { sec, body };
  }

  _knob(container, label, param, min, max, defaultVal, curve = 'linear', onLive) {
    const p    = this._params;
    const wrap = el('div', 'fr-knob');
    new Knob({
      container: wrap,
      min, max, value: defaultVal, defaultValue: defaultVal,
      size: 44, label, curve,
      color: '#d4882a',
      onChange: v => {
        p[param] = v;
        if (onLive) onLive(v);
      },
    });
    container.appendChild(wrap);
  }

  _buildToneSection() {
    const { sec, body } = this._buildSection('TONE');
    this._knob(body, 'BRIGHTNESS', 'brightness', 0.3, 2.0, 1.0);
    this._knob(body, 'MOD DECAY',  'modDecay',   0.3, 5.0, 2.0, 'exp');
    this._knob(body, 'BELL LEVEL', 'bellLevel',  0,   0.6, 0.25);
    this._knob(body, 'BELL DECAY', 'bellDecay',  0.05, 1.5, 0.4, 'exp');
    return sec;
  }

  _buildEnvelopeSection() {
    const { sec, body } = this._buildSection('ENVELOPE');
    this._knob(body, 'ATTACK',  'attack',  0.001, 3.0,  0.006, 'exp');
    this._knob(body, 'DECAY',   'decay',   0.1,   5.0,  2.5,   'exp');
    this._knob(body, 'SUSTAIN', 'sustain', 0,     1.0,  0.55);
    this._knob(body, 'RELEASE', 'release', 0.05,  3.0,  0.35,  'exp');
    return sec;
  }

  _buildTremoloSection() {
    const { sec, body } = this._buildSection('TREMOLO');
    this._knob(body, 'RATE', 'tremoloRate', 0.5, 10.0, 4.5, 'exp', v => {
      if (this._tremoloLFO) this._tremoloLFO.frequency.value = v;
    });
    this._knob(body, 'DEPTH', 'tremoloDepth', 0, 0.6, 0, 'linear', v => {
      if (this._tremoloDepthGain) this._tremoloDepthGain.gain.value = v;
    });
    return sec;
  }

  _buildOutputSection() {
    const { sec, body } = this._buildSection('OUTPUT');
    this._knob(body, 'VOLUME', 'volume', 0, 1, 0.7);
    return sec;
  }

  // ── Keyboard (C2–C7, 61 keys) ───────────────────────────────────────────

  _buildKeyboard() {
    const wrap   = el('div', 'fr-keyboard');
    const scroll = el('div', 'fr-kb-scroll');
    const kb     = el('div', 'fr-kb-inner');

    // MIDI range: C2 (36) to C7 (96) = 61 keys
    const firstNote = 36;
    const lastNote  = 96;
    const notes     = Array.from(
      { length: lastNote - firstNote + 1 },
      (_, i) => firstNote + i,
    );

    const WHITE_W   = 28;  // px per white key
    const WHITE_H   = 110;
    const BLACK_W   = 18;
    const BLACK_H   = 68;

    // Compute the pixel x-offset for each note within the white-key grid.
    // We need a running white-key count.
    const noteX = {};      // midiNote → left px (black keys only need this)
    let whiteCount = 0;

    notes.forEach(n => {
      const semi = n % 12;
      if (!BLACK_SEMITONES.has(semi)) {
        noteX[n] = whiteCount * WHITE_W;
        whiteCount++;
      }
    });

    // Position a black key between its two adjacent white neighbours.
    // For each black note, find the white key to its left (semi - 1) and use
    // that x + 0.6 × WHITE_W as the left edge of the black key.
    notes.forEach(n => {
      const semi = n % 12;
      if (BLACK_SEMITONES.has(semi)) {
        const leftWhite = n - 1;  // the white key immediately below
        noteX[n] = noteX[leftWhite] + WHITE_W - BLACK_W * 0.5;
      }
    });

    // Total keyboard width = number of white keys × WHITE_W
    kb.style.width  = `${whiteCount * WHITE_W}px`;
    kb.style.height = `${WHITE_H}px`;

    // White keys first (z-index 1 in CSS), then black keys on top (z-index 2)
    const whites = notes.filter(n => !BLACK_SEMITONES.has(n % 12));
    const blacks = notes.filter(n =>  BLACK_SEMITONES.has(n % 12));

    whites.forEach(note => {
      const key = el('div', 'fr-key-white');
      key.style.left   = `${noteX[note]}px`;
      key.style.width  = `${WHITE_W}px`;
      key.style.height = `${WHITE_H}px`;
      key.style.position = 'absolute';
      this._bindKeyEvents(key, note);
      kb.appendChild(key);
    });

    blacks.forEach(note => {
      const key = el('div', 'fr-key-black');
      key.style.left   = `${noteX[note]}px`;
      key.style.width  = `${BLACK_W}px`;
      key.style.height = `${BLACK_H}px`;
      this._bindKeyEvents(key, note);
      kb.appendChild(key);
    });

    scroll.appendChild(kb);
    wrap.appendChild(scroll);

    const status = el('div', 'fr-midi-status');
    status.textContent =
      'QWERTY: A=C3  |  8-voice polyphony  |  Connect MIDI keyboard for full 73-key range';
    wrap.appendChild(status);

    return wrap;
  }

  _bindKeyEvents(key, note) {
    key.addEventListener('mousedown',  e => { e.preventDefault(); this.noteOn(note, 0.8); });
    key.addEventListener('mouseup',    ()  => this.noteOff(note));
    key.addEventListener('mouseleave', ()  => this.noteOff(note));
    key.addEventListener('touchstart', e => {
      e.preventDefault();
      this.noteOn(note, 0.8);
    }, { passive: false });
    key.addEventListener('touchend', () => this.noteOff(note));
  }

  _bindQwerty() {
    const pressed = new Set();
    document.addEventListener('keydown', e => {
      if (e.repeat || e.target.tagName === 'INPUT') return;
      const note = QWERTY_NOTE_MAP[e.key.toLowerCase()];
      if (note === undefined || pressed.has(note)) return;
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
}

// ── DOM helper ────────────────────────────────────────────────────────────

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) cls.split(' ').forEach(c => e.classList.add(c));
  return e;
}
