# Analogue Synthesizer Simulations

A series of six legacy analogue synthesizer simulations built with vanilla
JavaScript and the Web Audio API. All sounds are synthesised in real time —
no audio samples used. Each plugin faithfully emulates the panel layout and
sonic character of the original hardware.

## Instruments

| Machine | Type | Key feature |
|---------|------|-------------|
| **Roland TR-808** | Drum machine | 16-step sequencer, 14 synthesised drum voices |
| **Roland TR-909** | Drum machine | Punchy click transient, resonant hi-hats |
| **Moog Minimoog Model D** | Monophonic synth | 3 VCOs, Moog ladder filter (AudioWorklet) |
| **Roland Juno-106** | 6-voice poly synth | DCO, 24 dB LPF, BBD Chorus I/II |
| **Korg MS-20** | Semi-modular mono | Dual VCO, HPF + LPF (Korg transistor), patch bay |
| **Korg MS-10** | Monophonic synth | Single VCO, Korg LPF, ADSR |

## Running

Serve from any static HTTP server (required for ES modules + AudioWorklet):

```bash
npx serve .
# then open http://localhost:3000
```

Or with Python:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

Open `index.html` for the instrument launcher.

## Controls

- **Knobs**: drag up/down, scroll wheel, Shift+drag for fine control, double-click to reset
- **Sliders**: drag, scroll wheel, double-click to reset
- **Drum pads**: left-click to toggle on/off, right-click to toggle accent
- **Keyboard**: QWERTY A–K = C3–C4, or connect a MIDI keyboard

## Architecture

```
core/          AudioEngine, Sequencer, MidiController, utils
components/    Knob, Slider, PadButton (reusable UI)
worklets/      MoogLadderProcessor, KorgFilterProcessor, BBDChorusProcessor, NoiseProcessor
plugins/       TR808, TR909, Minimoog, Juno106, MS20, MS10
```

## Browser requirements

Chrome 66+ or Firefox 76+ (AudioWorklet support required).
