# Plan: Legacy Analogue Synthesizer Simulation Plugins

## Context

The Roland-TR-808 repository is currently an empty project (single README.md). The goal is to build a
series of six web-based analogue synthesizer simulations as self-contained "plugin" modules using vanilla
HTML/CSS/JavaScript and the Web Audio API. Each simulation must faithfully emulate both the sonic character
and the hardware interface of the original machine — sounds are synthesised from scratch (no samples),
and every original panel control is exposed.

**Target instruments:** Roland TR-808, Roland TR-909, Moog Minimoog Model D, Roland Juno-106,
Korg MS-20, Korg MS-10.

---

## File Structure

```
/
├── index.html                        # Launcher: cards for all 6 synths
├── styles/
│   └── main.css                      # Global resets, fonts, card grid
├── core/
│   ├── AudioEngine.js                # Singleton AudioContext + master compressor
│   ├── Sequencer.js                  # Sample-accurate 16/32-step clock (AudioContext time)
│   ├── MidiController.js             # Web MIDI API — note-on/off, pitch bend, CC
│   └── utils.js                      # noteToHz(), paramScale(), ADSR helper
├── components/
│   ├── Knob.js                       # SVG rotary encoder (drag + scroll, linear/exp curve)
│   ├── Slider.js                     # Vertical/horizontal fader
│   └── PadButton.js                  # Step-sequencer pad (on/off + accent)
├── worklets/
│   ├── MoogLadderProcessor.js        # AudioWorklet: 4-pole 24 dB/oct Moog ladder (Huovilainen)
│   ├── KorgFilterProcessor.js        # AudioWorklet: Korg Sallen-Key LPF (aggressive clip)
│   ├── BBDChorusProcessor.js         # AudioWorklet: 2× BBD delay lines for Juno chorus
│   └── NoiseProcessor.js             # AudioWorklet: white/coloured noise source
├── plugins/
│   ├── TR808/
│   │   ├── TR808.js                  # Main class — pattern storage, sequencer integration
│   │   ├── voices/
│   │   │   ├── BassDrum.js           # Sine osc + pitch env (150 → 50 Hz) + amp env
│   │   │   ├── SnareDrum.js          # 2× sine osc + noise HPF, two envelopes
│   │   │   ├── HiHat.js              # 6× square osc bank, HPF 7 kHz, CH/OH gating
│   │   │   ├── Tom.js                # BD topology at 100/200/300 Hz (LT/MT/HT + LC/MC/HC)
│   │   │   ├── Clap.js               # 4× noise bursts offset [0, 8, 17, 34] ms
│   │   │   ├── Clave.js              # Short narrow-band click
│   │   │   ├── Cowbell.js            # 2× square osc (540 Hz + 800 Hz) → BPF
│   │   │   └── Cymbal.js             # 6× square osc → narrow HPF 6 kHz, long decay
│   │   ├── TR808.html
│   │   └── TR808.css                 # Black/grey panel, amber labels, 16-step grid
│   ├── TR909/
│   │   ├── TR909.js
│   │   ├── voices/
│   │   │   ├── BassDrum909.js        # Click transient + pitch-swept sine (punchier)
│   │   │   ├── SnareDrum909.js       # Oscillator + noise with 909-style HPF
│   │   │   ├── HiHat909.js           # White noise → resonant BPF (digital character)
│   │   │   └── Tom909.js             # Tunable pitch + decay
│   │   ├── TR909.html
│   │   └── TR909.css                 # White/grey panel, blue/red labels
│   ├── Minimoog/
│   │   ├── Minimoog.js               # Mono synth — glide, 3 VCOs, ladder filter
│   │   ├── Minimoog.html
│   │   └── Minimoog.css              # Cream/walnut panel, three-section layout
│   ├── Juno106/
│   │   ├── Juno106.js                # 6-voice polyphony + voice stealing + BBD chorus
│   │   ├── Juno106.html
│   │   └── Juno106.css               # Dark grey panel, horizontal sliders
│   ├── MS20/
│   │   ├── MS20.js                   # Mono, dual VCO, HPF+LPF, patch bay visual
│   │   ├── MS20.html
│   │   └── MS20.css                  # Dark panel, yellow labels, patch bay section
│   └── MS10/
│       ├── MS10.js                   # Mono, single VCO, single LPF, simplified MS-20
│       ├── MS10.html
│       └── MS10.css
```

---

## Core Infrastructure

### `core/AudioEngine.js`
- Singleton `AudioContext` (resumed on first user gesture)
- `DynamicsCompressorNode` → `audioContext.destination`
- Public: `getContext()`, `getMasterOutput()`

### `core/Sequencer.js`
- Uses `audioContext.currentTime` for scheduling (not `setInterval` directly)
- Double-buffer lookahead scheduler (scheduleAheadTime = 100 ms, lookahead = 25 ms)
- Supports 16 or 32 steps, tempo 40–300 BPM, swing (0–100 %)
- `onStep(callback)` — fires per step with `{step, time}` for note scheduling

### `core/MidiController.js`
- Web MIDI API — requests access on init
- Routes `noteon`/`noteoff`/`pitchbend`/`cc` to registered listeners
- Each plugin registers/deregisters its own listener

### `core/utils.js`
- `noteToHz(midiNote)` → frequency
- `linToExp(value, min, max)` → exponential scaling
- `adsr(param, ctx, a, d, s, r, now)` → schedules ADSR automation on an AudioParam

---

## Synthesizer Implementations

### 1. Roland TR-808 (`plugins/TR808/`)

**Key voices and node graphs:**

| Voice | Node graph |
|-------|-----------|
| Bass Drum | `OscillatorNode(sine)` → pitch env automation → `GainNode` (amp env) → out |
| Snare | `2× OscillatorNode(sine)` + `NoiseNode` → `BiquadFilter(HPF 1kHz)` → mixed `GainNode` → out |
| Hi-Hat CH/OH | `6× OscillatorNode(square)` → `GainNode` mixer → `BiquadFilter(HPF 7kHz)` → `GainNode` env → out |
| Cowbell | `2× OscillatorNode(square, 540/800Hz)` → `BiquadFilter(BPF)` → env → out |
| Cymbal | `6× OscillatorNode(square)` → `BiquadFilter(HPF 6kHz)` → long env → out |
| Clap | `4× BufferSourceNode(noise)` scheduled +[0,8,17,34]ms → `BiquadFilter(HPF)` → env → out |
| Toms | BD topology, frequencies 100/200/300 Hz |
| Clave/Rimshot | Short noise burst → narrow BPF |

Oscillators for hi-hat/cymbal banks are started once and kept running (gated via `GainNode`) to avoid
per-trigger allocation overhead.

**Parameters per voice:** Tune, Decay, Level (Snare also: Tone, Snappy).

**UI:** Black/grey panel, amber-orange labels. Left column: instrument level/parameter knobs. Right
section: 16-step grid (2 rows of 8 with A/B bank toggle). Transport bar: Tempo, Shuffle, Start/Stop.

---

### 2. Roland TR-909 (`plugins/TR909/`)

Same 16-step sequencer architecture as TR-808. Key sonic differences:

- **Bass Drum**: Add a click `OscillatorNode(square)` with very fast decay (~5 ms) mixed with the pitch-swept sine for the "punch" transient.
- **Snare**: Different HPF cutoff and noise envelope shape (faster attack, brighter).
- **Hi-hats**: White noise through resonant `BiquadFilter(BPF)` rather than metallic oscillator bank.

**Parameters:** BD (Tune, Attack, Decay, Level), SD (Tune, Tone, Snappy, Level).

---

### 3. Moog Minimoog (`plugins/Minimoog/`)

**Node graph:**
```
VCO1 (OscillatorNode) ──┐
VCO2 (OscillatorNode) ──┼──► GainNode (mixer) ──► MoogLadderProcessor ──► GainNode (VCA env) ──► out
VCO3 (OscillatorNode) ──┤                                ▲
NoiseNode ──────────────┘                      filter env (AudioParam automation)
```

**`worklets/MoogLadderProcessor.js`** — Huovilainen model:
- 4 one-pole stages with `tanh` saturation feedback loop
- `cutoff` and `resonance` AudioParams
- Self-oscillates cleanly at resonance ≈ 4.0

**Parameters:**
- VCO 1/2/3: Waveform (saw/square/triangle), Octave (32′/16′/8′/4′/2′), Fine tune (±7 st)
- Mixer: Level per oscillator + noise
- Filter: Cutoff, Emphasis (resonance), EG Amount, Keyboard track (0/⅓/⅔/full)
- Filter EG: Attack, Decay (the original has no Sustain/Release on filter)
- Loudness EG: Attack, Decay, Sustain
- LFO: Rate → oscillator pitch (modulation wheel controls depth)
- Glide: Rate
- Master Volume

**UI:** Cream panel, dark walnut (CSS gradient) side cheeks. Three labelled sections (oscillators /
mixer / contour + filter / output). Large round knobs.

---

### 4. Roland Juno-106 (`plugins/Juno106/`)

**Node graph (per voice × 6):**
```
DCO saw (OscillatorNode) ──┐
DCO pulse (OscillatorNode) ┼──► GainNode (mixer) ──► Juno4PoleFilter ──► GainNode (VCA) ──┐
Sub osc (OscillatorNode) ──┤                                ▲                              │
NoiseNode ─────────────────┘                      filter env automation              BBDChorus
                                                                                          │
                                                                                         out
```

**Voice management:** 6-voice pool; round-robin allocation; voice-stealing steals oldest released note.

**`worklets/BBDChorusProcessor.js`:**
- Two modes: Chorus I (single BBD ~15 ms delay, LFO-modulated) and Chorus II (two BBDs, ~8 ms each)
- Adds the characteristic Juno warmth/shimmer

**Parameters:** DCO (Range, Pulse on/off, Saw on/off, PWM source/amount, Sub level, Noise level),
HPF switch (0/1/2), VCF (Cutoff, Resonance, Env amount, LFO amount, Key follow), VCF Env (A/D/S/R),
VCA (ADSR / Gate), LFO (Rate, Delay), Chorus (Off / I / II).

**UI:** Dark charcoal panel, white labels. Horizontal sliders (not knobs) faithful to original. On-screen
mini keyboard (2 octaves, QWERTY mapped).

---

### 5. Korg MS-20 (`plugins/MS20/`)

**Node graph:**
```
VCO1 (OscillatorNode) ──┐
VCO2 (OscillatorNode) ──┴──► GainNode (mixer) ──► BiquadFilter (HPF, peaking self-osc)
                                                              │
                                                   KorgFilterProcessor (LPF AudioWorklet)
                                                              │
                                                   GainNode (VCA env 2) ──► out
```

**`worklets/KorgFilterProcessor.js`** — Sallen-Key lowpass with transistor saturation:
- More aggressive clipping than Moog ladder
- `cutoff` and `peak` (resonance) AudioParams; can self-oscillate
- HPF is modelled as a `BiquadFilter(highpass)` with a feedback network

**Parameters:**
- VCO1: Frequency (2 Hz–20 kHz), Scale (2′–32′), Waveform (saw/square/pulse), PW
- VCO2: Same + Ring mod on/off, VCO1 cross-mod from VCO2
- Mixer: VCO1, VCO2, Noise/Ext levels
- HPF: Cutoff, Peak
- LPF: Cutoff, Peak
- EG1 (ASR → HPF / pitch): Attack, Sustain level, Release
- EG2 (ADSR → LPF / VCA): Attack, Decay, Sustain, Release
- LFO: Frequency, waveform, VCO/VCF amount
- Patch bay: Visual SVG panel (non-functional decorative representation)

**UI:** Near-black panel, yellow labels, two clearly separated filter sections, patch bay area.

---

### 6. Korg MS-10 (`plugins/MS10/`)

Simplified subset of MS-20. Reuses `KorgFilterProcessor`.

**Node graph:**
```
VCO (OscillatorNode) ──► GainNode (+ noise) ──► KorgFilterProcessor (LPF) ──► GainNode (VCA env) ──► out
```

**Parameters:** VCO (Frequency, Scale, Waveform, LFO mod amount), VCF (Cutoff, Peak, EG amount, Key track,
LFO amount), EG (A/D/S/R), LFO (Frequency, waveform), VCA (EG/Gate, Master volume).

---

## Implementation Order

1. `core/` infrastructure + `components/Knob.js`, `Slider.js`
2. `worklets/NoiseProcessor.js`
3. **Roland TR-808** (validates full drum machine + sequencer pattern)
4. **Roland TR-909** (reuses TR-808 sequencer, new voices only)
5. `worklets/MoogLadderProcessor.js` → **Moog Minimoog**
6. `worklets/KorgFilterProcessor.js` → **Korg MS-20**
7. **Korg MS-10** (rapid, reuses MS-20 worklet)
8. `worklets/BBDChorusProcessor.js` → **Roland Juno-106**
9. `index.html` launcher + `styles/main.css`

---

## Key Web Audio API Constraints & Workarounds

| Constraint | Workaround |
|---|---|
| `BiquadFilterNode` unstable at high Q | Custom `AudioWorkletProcessor` for all critical filters |
| No built-in noise source | Pre-filled `AudioBuffer` (white noise), looped `BufferSourceNode` |
| Autoplay policy | Defer `AudioContext.resume()` to first user click |
| Hi-hat oscillator churn | Start 6 oscillators once; gate with `GainNode` per trigger |
| Sample-accurate timing | Schedule via `audioContext.currentTime` + lookahead, never `setTimeout` alone |
| Voice stealing (Juno) | Oldest-note-released strategy; re-use node graph, update frequency |

---

## Verification

1. Load `index.html` in Chrome ≥ 100 or Firefox ≥ 100
2. **TR-808 / TR-909**: Press Play at 120 BPM; enable all 16 steps on BD row; verify deep kick on every beat. Adjust Tune and Decay knobs; confirm audible change.
3. **Minimoog**: QWERTY A–K plays C–C scale. Sweep Cutoff knob from 0 to max while holding a note; confirm classic filter sweep. Set Emphasis to max; confirm self-oscillation.
4. **Juno-106**: Hold 6 simultaneous notes; confirm polyphony. Toggle Chorus I/II; confirm shimmer effect.
5. **MS-20 / MS-10**: Set HPF Peak to max; confirm HPF self-oscillation. Set LPF Peak to max; confirm LPF self-oscillation.
6. **MIDI**: Connect a MIDI keyboard; confirm note-on/off, velocity, and pitch bend route to active synth.
