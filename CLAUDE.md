# CLAUDE.md — AI Assistant Guide for Analogue Synthesizer Simulations

This document is the primary reference for AI assistants contributing to this
repository. Read it fully before making any changes.

---

## Project Overview

This is a collection of eight vintage analogue and early digital synthesizer /
drum-machine emulations built with **vanilla JavaScript and Web Audio API**.
All sounds are synthesised in real-time — no audio samples are used or permitted.

**Instruments:**

| Plugin | Description |
|---|---|
| `plugins/TR808/` | Roland TR-808 — 14-voice drum machine, 16-step sequencer |
| `plugins/TR909/` | Roland TR-909 — 9-voice drum machine, 16-step sequencer |
| `plugins/Minimoog/` | Moog Minimoog Model D — 3 VCO monophonic synth, Moog ladder filter |
| `plugins/Juno106/` | Roland Juno-106 — 6-voice polyphonic synth, BBD chorus |
| `plugins/MS20/` | Korg MS-20 — semi-modular mono synth, dual filters, patch bay |
| `plugins/MS10/` | Korg MS-10 — simplified MS-20 (single VCO, single filter) |
| `plugins/FenderRhodes/` | Fender Rhodes Stage 73 — FM synthesis tine model |
| `plugins/Vocoder/` | Spectral Vocoder — 8/16/32-band phase-vocoder |

---

## Repository Structure

```
Roland-TR-808/
├── index.html               # Launcher page — 8 synth cards linking to each plugin
├── manifest.json            # PWA manifest (Synth Lab)
├── sw.js                    # Service Worker — precache + cache-first strategy
├── styles/
│   └── main.css             # Global resets + launcher card grid
├── core/
│   ├── AudioEngine.js       # Singleton AudioContext, master compressor, output routing
│   ├── Sequencer.js         # 16/32-step sample-accurate scheduler (double-buffer lookahead)
│   ├── MidiController.js    # Web MIDI API wrapper with listener routing
│   └── utils.js             # Musical utilities: noteToHz, ADSR scheduling, noise buffer
├── components/
│   ├── Knob.js              # SVG rotary encoder with drag/scroll/fine/reset
│   ├── Slider.js            # Vertical/horizontal fader
│   └── PadButton.js        # Step sequencer pad (on/off + accent states)
├── worklets/
│   ├── MoogLadderProcessor.js  # 4-pole Moog filter (Huovilainen model, tanh saturation)
│   ├── KorgFilterProcessor.js  # Sallen-Key Korg transistor ladder LPF
│   ├── BBDChorusProcessor.js   # Bucket-Brigade delay chorus for Juno-106
│   ├── NoiseProcessor.js       # White noise AudioWorkletProcessor
│   └── VocoderProcessor.js     # 32-band phase-vocoder processor
├── plugins/
│   ├── TR808/
│   │   ├── TR808.js         # Main drum machine class + UI
│   │   ├── TR808.html       # Standalone page
│   │   ├── TR808.css        # Panel styling (black/grey)
│   │   └── voices/          # 14 voice modules (BassDrum, SnareDrum, HiHat, Tom, …)
│   ├── TR909/ …             # Same structure as TR808 (9 voices)
│   ├── Minimoog/            # Minimoog.js + html + css
│   ├── Juno106/             # Juno106.js + html + css
│   ├── MS20/                # MS20.js + html + css
│   ├── MS10/                # MS10.js + html + css
│   ├── FenderRhodes/        # FenderRhodes.js + html + css
│   └── Vocoder/             # Vocoder.js + html + css
├── icons/
│   └── icon.svg
└── .github/
    ├── CONSTITUTION.md      # Binding design principles — read this
    ├── CONTRIBUTING.md      # Practical quick-start
    └── workflows/
        └── build-apk.yml    # CI: builds Android APK via Gradle on every push
```

---

## Technology Stack and Constraints

These rules are **non-negotiable** (see `.github/CONSTITUTION.md`):

| Constraint | Rule |
|---|---|
| Language | Vanilla HTML / CSS / JavaScript — no frameworks, no bundlers |
| Audio | Web Audio API + `AudioWorklet` only — no samples, no Web Workers for DSP |
| Dependencies | **Zero** runtime npm dependencies |
| Modules | ES Modules (`type="module"`) throughout |
| Build step | None — the repo serves directly from a static HTTP server |
| Browser target | Chrome 66+, Firefox 76+ (AudioWorklet support required) |

Never add `package.json` runtime dependencies, import maps pointing to CDNs, or
any bundler configuration. Every import must resolve to a local file in the repo.

---

## Development Workflow

### Running locally

ES Modules and AudioWorklet require a real HTTP server (file:// will not work):

```bash
npx serve .          # serves on http://localhost:3000
# or
python3 -m http.server 8080
```

Open `index.html` in Chrome 66+ or Firefox 76+.

### Android APK build

The CI workflow (`.github/workflows/build-apk.yml`) builds a WebView-based APK
automatically on every push to `main`, `master`, or `claude/**` branches.
It uses JDK 17 and Gradle. Do not modify `android/` unless specifically
targeting the Android build.

### Testing

There is no automated test suite. Verification is manual:

1. Load `index.html` and open each instrument card.
2. TR-808/909: Start the sequencer at 120 BPM, confirm bass drum fires.
3. Minimoog/MS-20: Sweep filter cutoff; confirm self-oscillation at max resonance.
4. Juno-106: Hold 6 simultaneous notes, confirm polyphony and chorus.
5. MIDI: Connect an external device; verify note-on/off, velocity, pitch bend.

---

## Core Architecture

### `core/AudioEngine.js`

Singleton. Exports `getAudioContext()` and `getMasterGain()`.

- Lazily creates the `AudioContext` on first user gesture.
- Output chain: instrument gain → master `GainNode` (0.85) → `DynamicsCompressorNode` → `destination`.
- Call `getAudioContext().resume()` in every user-interaction handler that triggers audio.

### `core/Sequencer.js`

Double-buffer lookahead scheduler:

- Interval: 25 ms (`setInterval`)
- Lookahead: 100 ms (`AudioContext.currentTime + 0.1`)
- Supports 16 or 32 steps, 20–400 BPM, 0–50 % swing.
- Callback receives `(stepIndex, time)` where `time` is an `AudioContext` timestamp for sample-accurate scheduling.

### `core/MidiController.js`

Wraps the Web MIDI API. Provides `addListener(type, callback)` where `type` is
one of: `noteon`, `noteoff`, `pitchbend`, `cc`. Handles port hot-plug.

### `core/utils.js`

Key exports:

| Function | Purpose |
|---|---|
| `noteToHz(midi)` | MIDI note number → frequency in Hz |
| `noteNameToMidi(name)` | `"C4"` → `60` |
| `linToExp(v, min, max)` | Linear 0–1 → exponential range |
| `clamp(v, lo, hi)` | Clamps a value |
| `scheduleADSR(gain, a, d, s, r, time, duration)` | Schedules full ADSR on a `GainNode.gain` |
| `scheduleRelease(gain, r, time)` | Schedules release only |
| `schedulePercEnv(gain, peak, decay, time)` | Schedules percussive decay envelope |
| `createNoiseBuffer(ctx)` | Returns a mono white-noise `AudioBuffer` |
| `QWERTY_NOTE_MAP` | Maps keyboard keys `A`–`K` to MIDI note numbers (C3–C4) |

---

## UI Components

### `components/Knob.js`

Renders as an inline SVG rotary encoder.

```js
import Knob from '../../components/Knob.js';
const knob = new Knob({
  label: 'Cutoff',
  min: 20, max: 20000, value: 800,
  curve: 'exp',           // 'lin' or 'exp'
  onchange: (v) => filter.frequency.value = v
});
parentEl.appendChild(knob.el);
```

**Interaction:** drag up to increase, scroll wheel, Shift+drag for ×0.2 fine
sensitivity, double-click to reset to default.

### `components/Slider.js`

```js
import Slider from '../../components/Slider.js';
const s = new Slider({ orient: 'vertical', min: 0, max: 1, value: 0.7,
  onchange: v => voice.level = v });
```

**Interaction:** click-to-position, drag, scroll wheel, double-click to reset.

### `components/PadButton.js`

```js
import PadButton from '../../components/PadButton.js';
const pad = new PadButton({ step: i, onchange: (on, accent) => … });
```

Left-click toggles on/off. Right-click toggles accent. The sequencer
highlights the currently playing step via `pad.setPlaying(true/false)`.

---

## AudioWorklet Processors

Custom processors live in `worklets/`. Rules (from `CONSTITUTION.md`):

- Use `AudioWorkletProcessor`, not `BiquadFilterNode`, for any circuit with
  **nonlinear behaviour** (Moog ladder, Korg transistor ladder, self-oscillation).
- Declare `static get parameterDescriptors()` for every automatable parameter.
- Guard **all** output samples against NaN and ±∞:
  ```js
  output[i] = Math.max(-1, Math.min(1, isFinite(v) ? v : 0));
  ```
- Must self-oscillate cleanly at maximum resonance — no instability, no clicks.
- Register with `registerProcessor('kebab-case-id', ClassName)`.

**Loading a worklet before first use:**

```js
const ctx = getAudioContext();
await ctx.audioWorklet.addModule('../../worklets/MoogLadderProcessor.js');
const filter = new AudioWorkletNode(ctx, 'moog-ladder');
```

Processor IDs in this repo: `moog-ladder`, `korg-filter`, `bbd-chorus`,
`noise-source`, `vocoder-processor`.

---

## Adding a New Drum Voice

1. Create `plugins/<Machine>/voices/<VoiceName>.js` — follow an existing voice
   as a pattern (e.g. `BassDrum.js`).
2. Import it in `<Machine>.js` and register it in `this._voices`.
3. Add knob definitions to `_knobDefs()`.
4. Add the instrument row in `buildUI()`.
5. Update the instrument table in `README.md`.

---

## Adding a New Synthesizer Plugin

A new plugin is in scope only if it meets all three criteria in
`CONSTITUTION.md § 6` (real hardware, public circuit description, sufficiently
different architecture). If those are met:

Required files:

```
plugins/<Name>/
  <Name>.js       # class with buildUI(), noteOn(note, velocity), noteOff(note)
  <Name>.html     # standalone page — imports <Name>.js as a module
  <Name>.css      # scoped styles — all selectors prefixed with .<name>-
```

Also required:

- A card added to `index.html`
- An entry in the `README.md` instrument table
- A section in `PLAN.md` covering the node graph and parameter list

---

## Code Conventions

### Naming

| Thing | Convention | Example |
|---|---|---|
| Classes | `PascalCase` matching hardware | `BassDrum808`, `Juno106` |
| JS files (classes) | `PascalCase.js` | `Minimoog.js` |
| JS files (utilities) | `camelCase.js` | `utils.js` |
| CSS classes | `kebab-case` prefixed by instrument | `tr808-panel`, `juno-slider` |
| AudioWorklet IDs | `kebab-case` | `moog-ladder`, `bbd-chorus` |

### No over-engineering

- Do not create base classes unless **three or more** voices share identical
  behaviour.
- Parameters are plain object properties (`voice.decay = 0.5`), not
  getters/setters, unless live `AudioNode` automation requires it.
- Do not add abstractions that serve only one instrument.

### Imports

- ES Modules throughout. Every plugin is self-contained.
- No cross-plugin imports — the only exception is TR-909 importing
  `Clap.js` and `Clave.js` from `plugins/TR808/voices/` (electrically
  identical circuits).
- Shared code belongs only in `core/` or `components/`.

### CSS scoping

- All selectors in `<Name>.css` must be prefixed with `.<name>-` or
  be nested under a parent `.<name>-panel` selector.
- Do not use `overflow: hidden` on the top-level panel element
  (plugin pages must scroll on narrow screens).

### Accessibility

- All interactive controls must have a `title` attribute or `aria-label`.
- Colour is never the sole indicator of state (pad buttons use colour
  **and** a CSS outline for the currently-playing step).

---

## Audio Design Patterns

### Scheduling

- **Always** use `AudioContext.currentTime` for note and envelope timing.
- **Never** use `setTimeout` or `setInterval` to schedule individual note events.
- Pass the `time` argument from the sequencer callback directly to
  `AudioParam.setValueAtTime`, `linearRampToValueAtTime`, etc.

### Voice management

- **Drum machines**: create one voice instance per instrument; gate it with a
  gain envelope on each trigger.
- **Polyphonic synths** (Juno-106): use a fixed voice pool with round-robin
  allocation.
- **Persistent oscillators** (hi-hats, cymbals): keep oscillators running
  continuously and gate with `GainNode`.

### Filter design

- Use `BiquadFilterNode` only for linear, stable filters (e.g. a pre-filter EQ).
- Use a custom `AudioWorkletProcessor` for any filter with resonance
  self-oscillation or nonlinear saturation.
- Moog ladder: tanh saturation (Huovilainen model) — `MoogLadderProcessor`.
- Korg ladder: hard-clip saturation (more aggressive) — `KorgFilterProcessor`.

### Headroom

- Master bus: `GainNode` (0.85) → `DynamicsCompressorNode`.
- Tune individual voice gains so a full pattern at maximum accent does not
  clip the master bus.

---

## Commit Style

```
TR808: fix hi-hat oscillator bank frequency ratios
Minimoog: add keyboard tracking to filter cutoff
core: guard AudioContext resume against repeated calls
worklets: fix NaN propagation in MoogLadderProcessor at max resonance
docs: update PLAN.md filter section
```

Scope prefixes: `TR808`, `TR909`, `Minimoog`, `Juno106`, `MS20`, `MS10`,
`FenderRhodes`, `Vocoder`, `core`, `components`, `worklets`, `docs`.

Breaking changes to `core/` or `components/` API must update all affected
plugins in the **same commit**.

---

## What Not To Do

- **No audio samples.** Not even as a fallback. All sound is DSP only.
- **No npm packages.** Zero runtime dependencies is a core constraint.
- **No bundlers or build steps.** The repo must serve from a static file server as-is.
- **No frameworks.** No React, Vue, Svelte, Web Components abstractions, etc.
- **No `setTimeout` for audio timing.** Use `AudioContext.currentTime`.
- **No cross-plugin imports** (except the documented TR-808 → TR-909 exception).
- **No `overflow: hidden`** on top-level panel elements.
- **No features outside scope:** no DAW, no sample player, no chord/scale
  helpers, no MIDI sequencer beyond the 16-step drum pattern already present.
- **Do not add parameters the original hardware did not have** (e.g. a sustain
  stage on an envelope that the hardware omitted).
