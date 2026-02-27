# Task Prompt: Legacy Analogue Synthesizer Simulations

## Original Request

> A series of legacy analogue synthesizers simulations as artefacts with
> excellent sound quality and precise control over the different sound
> parameters to faithfully emulate the interface and character of the
> original machines.

## Instrument Selection (user-specified)

The following six instruments were chosen interactively:

| Instrument | Manufacturer | Year | Category |
|------------|-------------|------|----------|
| Roland TR-808 | Roland | 1980 | Drum machine |
| Roland TR-909 | Roland | 1983 | Drum machine |
| Moog Minimoog Model D | Moog Music | 1970 | Monophonic synthesizer |
| Roland Juno-106 | Roland | 1984 | Polyphonic synthesizer |
| Korg MS-20 | Korg | 1978 | Semi-modular synthesizer |
| Korg MS-10 | Korg | 1978 | Monophonic synthesizer |

## Platform (user-specified)

**Web (HTML/JS)** — browser-based, no installation, Web Audio API for
real-time synthesis.

## Key Requirements Extracted

1. **Excellent sound quality** — DSP-accurate emulation, not samples.
   Each voice/oscillator/filter modelled from circuit-level analysis.

2. **Precise parameter control** — every knob, switch, and slider present
   on the original hardware panel must be exposed in the simulation.

3. **Faithful interface** — colour palette, control layout, and visual
   character of each machine must be recognisable to anyone familiar with
   the original hardware.

4. **Series as artefacts** — each instrument is a self-contained,
   standalone HTML page that can be opened independently. A launcher
   `index.html` aggregates all six.

## Implicit Requirements (inferred)

- Zero external dependencies (no frameworks, no CDN libraries).
- MIDI keyboard support via Web MIDI API.
- QWERTY keyboard fallback for synthesizers.
- 16-step sequencer for the drum machines with swing and accent.
- Sample-accurate note scheduling (not `setTimeout`-based).
- Self-oscillating filters at maximum resonance.

## Out of Scope (not requested)

- Audio recording / export
- Pattern save/load to disk or cloud
- Effects chain beyond the Juno-106 built-in BBD chorus
- Generative or algorithmic composition features
- Mobile-optimised layout (desktop-first)
