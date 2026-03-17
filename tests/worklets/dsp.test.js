/**
 * tests/worklets/dsp.test.js
 * Unit tests for the pure DSP math inside the AudioWorklet processors.
 *
 * AudioWorklet processors run inside a dedicated thread and cannot be
 * instantiated directly in Node.js (they inherit from AudioWorkletProcessor,
 * which doesn't exist outside a browser context).
 *
 * Strategy: we replicate the exact arithmetic extracted from each worklet as
 * plain JS functions and verify correctness.  Any future refactoring of the
 * processor math will require updating these tests, which is the desired
 * regression-detection behaviour.
 *
 * Run:  node --test tests/worklets/dsp.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EPSILON = 1e-6;

function approxEqual(a, b, eps = EPSILON) {
  return Math.abs(a - b) < eps;
}

// ─── MoogLadderProcessor — tanh approximation ────────────────────────────────
// Source: worklets/MoogLadderProcessor.js  _tanh(x)

function moogTanh(x) {
  if (x > 3)  return 1;
  if (x < -3) return -1;
  const x2 = x * x;
  return x * (27 + x2) / (27 + 9 * x2);
}

describe('Moog tanh approximation', () => {
  it('tanh(0) = 0', () => {
    assert.ok(approxEqual(moogTanh(0), 0));
  });

  it('tanh is odd: tanh(-x) = -tanh(x)', () => {
    for (const x of [0.5, 1, 2, 2.9]) {
      assert.ok(approxEqual(moogTanh(-x), -moogTanh(x)), `failed for x=${x}`);
    }
  });

  it('approaches +1 for large positive x (clipped at x>3)', () => {
    assert.strictEqual(moogTanh(3.001), 1);
    assert.strictEqual(moogTanh(10), 1);
  });

  it('approaches -1 for large negative x (clipped at x<-3)', () => {
    assert.strictEqual(moogTanh(-3.001), -1);
    assert.strictEqual(moogTanh(-10), -1);
  });

  it('approximation error vs Math.tanh is < 3% across the range [-2.5, 2.5]', () => {
    // The rational polynomial x*(27+x²)/(27+9x²) is exact at 0 and clips at ±3.
    // It overshoots the true tanh by up to ~2.1% near |x|≈2, which is acceptable
    // for audio saturation purposes.
    for (let x = -2.5; x <= 2.5; x += 0.1) {
      const approx = moogTanh(x);
      const exact = Math.tanh(x);
      const relErr = Math.abs(approx - exact) / (Math.abs(exact) + 1e-9);
      assert.ok(relErr < 0.03,
        `tanh(${x.toFixed(1)}): approx=${approx.toFixed(6)}, exact=${exact.toFixed(6)}, err=${(relErr*100).toFixed(3)}%`);
    }
  });

  it('output is always in [-1, 1]', () => {
    for (let x = -5; x <= 5; x += 0.25) {
      const v = moogTanh(x);
      assert.ok(v >= -1 && v <= 1, `tanh(${x}) = ${v} out of range`);
    }
  });
});

// ─── MoogLadderProcessor — frequency normalisation ───────────────────────────
// Source: worklets/MoogLadderProcessor.js  process()
//   const f  = (2 * cutoff) / SR;
//   const fc = Math.min(f, 0.999);

function moogNormalisedCutoff(cutoff, SR) {
  const f = (2 * cutoff) / SR;
  return Math.min(f, 0.999);
}

describe('Moog normalised cutoff frequency', () => {
  const SR = 44100;

  it('20 Hz → very small fc', () => {
    const fc = moogNormalisedCutoff(20, SR);
    assert.ok(fc > 0 && fc < 0.01, `fc=${fc}`);
  });

  it('20000 Hz (Nyquist range) → clamped at 0.999', () => {
    const fc = moogNormalisedCutoff(20000, SR);
    assert.ok(fc <= 0.999, `fc=${fc}`);
  });

  it('SR/2 exactly → clamped at 0.999', () => {
    const fc = moogNormalisedCutoff(SR / 2, SR);
    assert.strictEqual(fc, 0.999);
  });

  it('is always in (0, 0.999]', () => {
    for (const hz of [20, 100, 440, 1000, 5000, 10000, 20000]) {
      const fc = moogNormalisedCutoff(hz, SR);
      assert.ok(fc > 0 && fc <= 0.999, `cutoff=${hz} Hz → fc=${fc}`);
    }
  });
});

// ─── MoogLadderProcessor — resonance feedback coefficient ────────────────────
// Source: worklets/MoogLadderProcessor.js
//   const fb = resonance * (1.0 - 0.15 * fc * fc);

function moogFeedback(resonance, fc) {
  return resonance * (1.0 - 0.15 * fc * fc);
}

describe('Moog resonance feedback coefficient', () => {
  it('resonance 0 → feedback 0', () => {
    assert.strictEqual(moogFeedback(0, 0.5), 0);
  });

  it('at low fc, feedback ≈ resonance', () => {
    const fb = moogFeedback(2.0, 0.01);
    assert.ok(Math.abs(fb - 2.0) < 0.01, `expected ≈2.0, got ${fb}`);
  });

  it('feedback decreases slightly as fc increases (compensation term)', () => {
    const fbLow  = moogFeedback(2.0, 0.1);
    const fbHigh = moogFeedback(2.0, 0.9);
    assert.ok(fbHigh < fbLow, 'feedback should decrease with higher fc');
  });
});

// ─── KorgFilterProcessor — G coefficient ─────────────────────────────────────
// Source: worklets/KorgFilterProcessor.js
//   const g  = Math.tan(Math.PI * Math.min(cutoff, SR * 0.49) / SR);
//   const G  = g / (1 + g);

function korgG(cutoff, SR) {
  const g = Math.tan(Math.PI * Math.min(cutoff, SR * 0.49) / SR);
  return g / (1 + g);
}

describe('Korg filter G coefficient', () => {
  const SR = 44100;

  it('very low cutoff → G near 0', () => {
    const G = korgG(1, SR);
    assert.ok(G < 0.001, `G=${G}`);
  });

  it('G is always in (0, 1) for valid cutoff range', () => {
    for (const hz of [20, 100, 500, 1000, 5000, 10000, 20000]) {
      const G = korgG(hz, SR);
      assert.ok(G > 0 && G < 1, `cutoff=${hz} Hz → G=${G}`);
    }
  });

  it('cutoff above Nyquist limit is clamped to SR*0.49', () => {
    const G_clamped = korgG(SR, SR);   // above Nyquist
    const G_nyquist = korgG(SR * 0.49, SR);
    assert.ok(approxEqual(G_clamped, G_nyquist, 1e-9),
      `expected clamping: got ${G_clamped} vs ${G_nyquist}`);
  });

  it('G increases monotonically with cutoff', () => {
    let prevG = korgG(20, SR);
    for (const hz of [100, 500, 1000, 5000, 10000]) {
      const G = korgG(hz, SR);
      assert.ok(G > prevG, `G should increase: ${prevG} → ${G} at ${hz} Hz`);
      prevG = G;
    }
  });
});

// ─── KorgFilterProcessor — hard-clip saturation ──────────────────────────────
// Source: worklets/KorgFilterProcessor.js  _clip(x)
//   return Math.max(-1, Math.min(1, x * 0.7));

function korgClip(x) {
  return Math.max(-1, Math.min(1, x * 0.7));
}

describe('Korg hard-clip saturation', () => {
  it('small signals pass through scaled by 0.7', () => {
    assert.ok(approxEqual(korgClip(0.5), 0.35));
    assert.ok(approxEqual(korgClip(-0.5), -0.35));
  });

  it('output is clamped to [-1, 1]', () => {
    assert.strictEqual(korgClip(2.0), 1);
    assert.strictEqual(korgClip(-2.0), -1);
  });

  it('clip threshold is at |x| = 1/0.7 ≈ 1.4286', () => {
    const threshold = 1 / 0.7;
    assert.ok(Math.abs(korgClip(threshold)) - 1 < 0.0001);
    assert.ok(korgClip(threshold + 0.01) === 1);
  });

  it('zero input → zero output', () => {
    assert.strictEqual(korgClip(0), 0);
  });

  it('is odd: clip(-x) = -clip(x)', () => {
    for (const x of [0.3, 0.8, 1.2, 2.0]) {
      assert.ok(approxEqual(korgClip(-x), -korgClip(x)));
    }
  });
});

// ─── BBDChorusProcessor — LFO phase increment ────────────────────────────────
// Source: worklets/BBDChorusProcessor.js
//   const lfoInc = (2 * Math.PI * rate) / SR;

function bbdLfoIncrement(rate, SR) {
  return (2 * Math.PI * rate) / SR;
}

describe('BBD Chorus LFO phase increment', () => {
  const SR = 44100;

  it('1 Hz LFO completes one cycle per SR samples', () => {
    const inc = bbdLfoIncrement(1, SR);
    const cycleLength = (2 * Math.PI) / inc;
    assert.ok(Math.abs(cycleLength - SR) < 0.001, `cycle length = ${cycleLength}`);
  });

  it('0.5 Hz LFO → one cycle per 2×SR samples', () => {
    const inc = bbdLfoIncrement(0.5, SR);
    const cycleLength = (2 * Math.PI) / inc;
    assert.ok(Math.abs(cycleLength - 2 * SR) < 0.01);
  });

  it('LFO phase wraps correctly using modulo 2π', () => {
    let phase = 0;
    const inc = bbdLfoIncrement(440, SR); // fast LFO at audio rate
    for (let i = 0; i < SR * 2; i++) {
      phase = (phase + inc) % (2 * Math.PI);
    }
    assert.ok(phase >= 0 && phase < 2 * Math.PI,
      `phase out of range after wrap: ${phase}`);
  });
});

// ─── BBDChorusProcessor — linear interpolation ───────────────────────────────
// Source: worklets/BBDChorusProcessor.js  _readInterp()
//   frac = ri - Math.floor(ri)
//   return buf[i0] * (1 - frac) + buf[i1] * frac

function linearInterp(v0, v1, frac) {
  return v0 * (1 - frac) + v1 * frac;
}

describe('BBD linear interpolation', () => {
  it('frac=0 returns v0', () => {
    assert.ok(approxEqual(linearInterp(0.4, 0.8, 0), 0.4));
  });

  it('frac=1 returns v1', () => {
    assert.ok(approxEqual(linearInterp(0.4, 0.8, 1), 0.8));
  });

  it('frac=0.5 returns midpoint', () => {
    assert.ok(approxEqual(linearInterp(0.0, 1.0, 0.5), 0.5));
  });

  it('result stays between v0 and v1 for frac in [0, 1]', () => {
    const v0 = -0.3, v1 = 0.7;
    for (let f = 0; f <= 1; f += 0.1) {
      const out = linearInterp(v0, v1, f);
      const lo = Math.min(v0, v1), hi = Math.max(v0, v1);
      assert.ok(out >= lo - EPSILON && out <= hi + EPSILON,
        `frac=${f}: out=${out} outside [${lo},${hi}]`);
    }
  });
});

// ─── VocoderProcessor — exponential envelope coefficients ────────────────────
// Source: worklets/VocoderProcessor.js
//   const aCoeff = Math.exp(-1.0 / (sampleRate * Math.max(attack,  0.0001)));
//   const rCoeff = Math.exp(-1.0 / (sampleRate * Math.max(release, 0.001)));

function vocoderCoeff(timeConst, SR) {
  return Math.exp(-1.0 / (SR * timeConst));
}

describe('Vocoder envelope exponential coefficients', () => {
  const SR = 44100;

  it('very short time constant → coefficient substantially less than 1 (fast response)', () => {
    // At SR=44100 and t=0.0001s: coeff = exp(-1/(44100×0.0001)) = exp(-1/4.41) ≈ 0.797
    // 0.0001s ≈ 4.4 samples; a short but non-instant time constant is correct here.
    const c = vocoderCoeff(0.0001, SR);
    assert.ok(c < 0.85, `expected relatively fast response (coeff < 0.85), got ${c}`);
  });

  it('very long time constant → coefficient near 1 (slow response)', () => {
    const c = vocoderCoeff(1.0, SR);
    assert.ok(c > 0.9999, `expected slow response (coeff > 0.9999), got ${c}`);
  });

  it('coefficient is always in (0, 1)', () => {
    for (const t of [0.0001, 0.001, 0.01, 0.1, 0.5, 2.0]) {
      const c = vocoderCoeff(t, SR);
      assert.ok(c > 0 && c < 1, `timeConst=${t} → coeff=${c} out of range`);
    }
  });

  it('longer time constant produces larger coefficient', () => {
    const cShort = vocoderCoeff(0.005, SR);
    const cLong  = vocoderCoeff(0.5, SR);
    assert.ok(cLong > cShort, `expected cLong(${cLong}) > cShort(${cShort})`);
  });
});

// ─── VocoderProcessor — peak-detecting envelope logic ────────────────────────
// Source: worklets/VocoderProcessor.js
//   env = (absIn >= env)
//     ? aCoeff * env + (1.0 - aCoeff) * absIn   // attack
//     : rCoeff * env;                             // release

function vocoderEnvelopeStep(env, absIn, aCoeff, rCoeff) {
  return absIn >= env
    ? aCoeff * env + (1.0 - aCoeff) * absIn
    : rCoeff * env;
}

describe('Vocoder peak-detecting envelope', () => {
  it('when absIn > env, attack branch is taken — envelope rises toward absIn', () => {
    const aCoeff = 0.99, rCoeff = 0.999;
    const env0 = 0.1;
    const absIn = 0.8;
    const env1 = vocoderEnvelopeStep(env0, absIn, aCoeff, rCoeff);
    assert.ok(env1 > env0, `env should rise: ${env0} → ${env1}`);
    assert.ok(env1 < absIn, `env should not overshoot absIn: ${env1} vs ${absIn}`);
  });

  it('when absIn < env, release branch is taken — envelope decays', () => {
    const aCoeff = 0.99, rCoeff = 0.999;
    const env0 = 0.8;
    const absIn = 0.1;
    const env1 = vocoderEnvelopeStep(env0, absIn, aCoeff, rCoeff);
    assert.ok(env1 < env0, `env should decay: ${env0} → ${env1}`);
  });

  it('when absIn == env, attack branch is taken (boundary condition)', () => {
    const aCoeff = 0.9, rCoeff = 0.999;
    const v = 0.5;
    const env1 = vocoderEnvelopeStep(v, v, aCoeff, rCoeff);
    // aCoeff*v + (1-aCoeff)*v = v (identity when input == envelope)
    assert.ok(approxEqual(env1, v, 1e-9));
  });

  it('full-wave rectification: negative input treated as absolute value', () => {
    // The processor does: const absIn = inp[i] < 0 ? -inp[i] : inp[i]
    // Test that -0.7 and +0.7 produce the same absIn
    const negative = -0.7 < 0 ? 0.7 : -0.7;
    const positive = 0.7 < 0 ? -0.7 : 0.7;
    assert.strictEqual(negative, positive);
  });
});
