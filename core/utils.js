/**
 * utils.js — Musical and DSP utility functions.
 */

/** Convert a MIDI note number (0-127) to Hz. A4 = MIDI 69 = 440 Hz. */
export function noteToHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Note name + octave to MIDI number. e.g. noteNameToMidi('C', 4) = 60 */
export function noteNameToMidi(name, octave) {
  const map = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
    'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  return 12 * (octave + 1) + (map[name] ?? 0);
}

/** Linear to exponential scaling — maps [0,1] onto [min,max] exponentially. */
export function linToExp(value, min, max) {
  return min * Math.pow(max / min, value);
}

/** Clamp a value between min and max. */
export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Schedule a full ADSR on an AudioParam.
 * @param {AudioParam} param
 * @param {AudioContext} ctx
 * @param {number} a - attack  (seconds)
 * @param {number} d - decay   (seconds)
 * @param {number} s - sustain (0-1 level)
 * @param {number} r - release (seconds)
 * @param {number} now - audioContext.currentTime at note-on
 * @param {number} [peakLevel=1]
 */
export function scheduleADSR(param, ctx, a, d, s, r, now, peakLevel = 1) {
  param.cancelScheduledValues(now);
  param.setValueAtTime(0, now);
  param.linearRampToValueAtTime(peakLevel, now + a);
  param.linearRampToValueAtTime(s * peakLevel, now + a + d);
  return now + a + d; // returns sustain start time
}

/**
 * Release phase — call on note-off.
 * @param {AudioParam} param
 * @param {number} r - release seconds
 * @param {number} now
 */
export function scheduleRelease(param, now, r) {
  const current = param.value;
  param.cancelScheduledValues(now);
  param.setValueAtTime(current, now);
  param.linearRampToValueAtTime(0.00001, now + r);
}

/**
 * Quick percussive envelope (no sustain/release).
 * attack → peak then exponential decay to near-zero.
 */
export function schedulePercEnv(param, ctx, attackTime, decayTime, now, peakLevel = 1) {
  param.cancelScheduledValues(now);
  param.setValueAtTime(0.0001, now);
  param.linearRampToValueAtTime(peakLevel, now + attackTime);
  param.exponentialRampToValueAtTime(0.0001, now + attackTime + decayTime);
}

/** Build a white-noise AudioBuffer (mono, 2 seconds). */
export function createNoiseBuffer(ctx, seconds = 2) {
  const length = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/** Map QWERTY keys (bottom two rows) to MIDI notes starting from C3. */
export const QWERTY_NOTE_MAP = {
  a: 48, w: 49, s: 50, e: 51, d: 52, f: 53,
  t: 54, g: 55, y: 56, h: 57, u: 58, j: 59,
  k: 60, o: 61, l: 62, p: 63, ';': 64,
};
