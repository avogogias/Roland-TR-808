# Project Constitution
## Analogue Synthesizer Simulations

This document defines the guiding principles, design philosophy, architectural
constraints, and quality standards for this project. All contributions —
human or AI-assisted — must honour these rules.

---

## 1. Core Principle: Authenticity Over Convenience

Every design decision must be evaluated against one question:

> *Does this serve the faithful emulation of the original hardware?*

- **Sounds are synthesised, never sampled.** Audio samples are forbidden,
  even as fallback. The entire point of this project is DSP emulation.
- **Parameters match the original panel.** If the hardware had no sustain
  knob on the filter envelope, the simulation must not add one, even if
  it would be more useful.
- **UI is visually faithful.** Colour palettes, control layout, and panel
  proportions must reference the original hardware aesthetic.

---

## 2. Technology Constraints

| Constraint | Rule |
|---|---|
| Runtime | Vanilla HTML/CSS/JavaScript — no frameworks, no bundlers |
| Audio | Web Audio API + AudioWorklet only (no samples, no Web Workers for DSP) |
| Dependencies | Zero runtime `npm` dependencies |
| Modules | ES Modules (`type="module"`) throughout |
| Browser target | Chrome 66+, Firefox 76+ (AudioWorklet support required) |
| Build step | None — the repo must serve directly from a static HTTP server |

The zero-dependency rule is deliberate. This project should be comprehensible
and auditable by anyone who reads JavaScript, without a build toolchain.

---

## 3. Audio Quality Standards

### Synthesis accuracy
- Filter implementations must use `AudioWorkletProcessor`, not raw `BiquadFilterNode`,
  wherever the original circuit has nonlinear behaviour (Moog ladder, Korg transistor
  ladder, self-oscillation).
- Envelope timing must be scheduled via `AudioContext.currentTime`; never via
  `setTimeout` or `setInterval` for note events.
- The step sequencer must use the double-buffer lookahead pattern (≥ 25 ms
  interval, ≥ 100 ms lookahead) for jitter-free timing.

### Headroom and clipping
- Master output chain: `GainNode` (0.85) → `DynamicsCompressorNode` → destination.
- Individual voice gains must be tuned so that a full TR-808/909 pattern at
  maximum accent does not clip the master bus.

### Self-oscillation
- All custom filter worklets must self-oscillate cleanly at maximum resonance —
  no instability or NaN propagation. Guard outputs with `Math.max(-1, Math.min(1, …))`
  or equivalent.

---

## 4. Code Organisation

### One plugin, one directory
Each instrument lives entirely under `plugins/<Name>/`:
```
plugins/TR808/
  TR808.js       # main class
  TR808.html     # standalone page
  TR808.css      # scoped styles
  voices/        # individual voice modules
```

Shared utilities live in `core/` and `components/`. No cross-plugin imports.
The TR-909 is the only exception: it may import `Clap.js` and `Clave.js`
from `plugins/TR808/voices/` as documented, because those circuits are
electrically identical in both machines.

### Naming
- Classes: `PascalCase` matching the instrument model (`BassDrum808`, `Juno106`)
- Files: `PascalCase` for classes, `camelCase` for utilities
- CSS classes: `kebab-case` namespaced by instrument (`tr808-`, `juno-`, `ms20-`)
- AudioWorklet processor IDs: `kebab-case` (`moog-ladder`, `korg-filter`, `bbd-chorus`)

### No over-engineering
- Do not add abstractions that serve only one instrument.
- Do not create a base class for voices unless three or more voices share
  identical behaviour with no meaningful differences.
- Parameters are plain object properties (`voice.decay = 0.5`), not getters/setters,
  unless live automation of a running `AudioNode` requires it.

---

## 5. UI Standards

### Interaction
- **Knob**: mouse drag (up = increase), scroll wheel, Shift+drag for ×0.2 sensitivity,
  double-click to reset to default.
- **Slider**: click-to-position, drag, scroll wheel, double-click to reset.
- **Pad button**: left-click toggle on/off; right-click toggle accent; active step
  highlighted by the sequencer.

### Accessibility
- All interactive controls must have a `title` attribute or `aria-label`.
- Colour is never the sole indicator of state (pad buttons use both colour
  and a CSS outline for the playing step).

### Responsive layout
- Each plugin page must be scrollable on screens narrower than its minimum width.
  Do not use `overflow: hidden` on the top-level panel element.

---

## 6. Adding a New Instrument

A new synthesizer plugin is in scope if it meets **all** of the following:

1. It is a production analogue or early digital hardware instrument (not a
   software emulation of another emulation).
2. A credible circuit-level description exists in the public domain that can
   inform an AudioWorklet implementation.
3. It differs sufficiently from existing plugins to warrant a new entry
   (i.e. not merely a different preset of an existing architecture).

New instruments must ship with:
- `plugins/<Name>/<Name>.js`, `<Name>.html`, `<Name>.css`
- A card added to `index.html`
- An entry in the README instrument table
- A section in `PLAN.md` covering the node graph and parameter list

---

## 7. Versioning and Commits

- Commits are scoped by instrument or layer: `TR808:`, `core:`, `worklets:`, `docs:`.
- Breaking changes to the shared `core/` or `components/` API require updating
  all affected plugins in the same commit.
- The `PLAN.md` must be updated to reflect any architectural change that diverges
  from the original plan.

---

## 8. What This Project Is Not

- Not a general-purpose DAW or plugin host.
- Not a sample player or wavetable synthesizer.
- Not a music-theory tool (no automatic chord generation, no scale helpers).
- Not a MIDI sequencer beyond the 16-step drum pattern sequencer already
  present in the TR-808 and TR-909.

Requests that fall outside this scope should be declined or tracked in a
separate repository.
