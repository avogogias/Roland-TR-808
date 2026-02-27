# Contributing

See [CONSTITUTION.md](CONSTITUTION.md) for the full set of design principles
and architectural rules. Below is the practical quick-start.

## Running locally

```bash
# Any static HTTP server works — ES modules and AudioWorklet require one.
npx serve .
# or
python3 -m http.server 8080
```

Open `http://localhost:3000` (or 8080) and navigate to `index.html`.

## Adding a voice to an existing drum machine

1. Create `plugins/<Machine>/voices/<VoiceName>.js` following the pattern
   of an existing voice in the same machine.
2. Import it in `<Machine>.js` and add it to `this._voices`.
3. Add knob definitions to `_knobDefs()`.
4. Add the instrument row in `buildUI()`.
5. Update the instrument table in `README.md`.

## Adding a new synthesizer plugin

Follow the checklist in `CONSTITUTION.md § 6`. A new plugin requires:

```
plugins/<Name>/
  <Name>.js      # synth class with buildUI(), noteOn(), noteOff()
  <Name>.html    # standalone page
  <Name>.css     # scoped styles (all selectors prefixed with .<name>)
```

Plus a card in `index.html` and an entry in `README.md`.

## AudioWorklet processors

Custom processors live in `worklets/`. They must:

- Declare `static get parameterDescriptors()` for every automatable parameter.
- Guard all output samples against NaN and ±∞.
- Self-oscillate cleanly at maximum resonance (no instability, no clicks).
- Be registered via `registerProcessor('<id>', <Class>)`.

Load them before first use:

```js
await audioContext.audioWorklet.addModule('../../worklets/MyProcessor.js');
const node = new AudioWorkletNode(audioContext, 'my-processor');
```

## Commit style

```
TR808: fix hi-hat oscillator bank frequency ratios
Minimoog: add keyboard tracking to filter cutoff
core: guard AudioContext resume against repeated calls
docs: update PLAN.md filter section
```

Scope prefixes: `TR808`, `TR909`, `Minimoog`, `Juno106`, `MS20`, `MS10`,
`core`, `components`, `worklets`, `docs`.
