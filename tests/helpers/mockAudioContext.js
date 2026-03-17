/**
 * tests/helpers/mockAudioContext.js
 * Lightweight mock AudioContext for testing voice modules and envelope scheduling
 * in Node.js without a real browser audio graph.
 *
 * Covers enough of the Web Audio API to let voice constructors and trigger()
 * calls execute without throwing.  No actual DSP is performed.
 *
 * Usage:
 *   import { MockAudioContext } from './mockAudioContext.js';
 *   const ctx = new MockAudioContext();
 *   const voice = new BassDrum(ctx, ctx.createGain());
 *   voice.trigger(ctx.currentTime);
 */

class MockAudioParam {
  constructor(defaultValue = 0) {
    this.value = defaultValue;
    this._calls = [];
  }
  setValueAtTime(v, t)                    { this._calls.push(['setValueAtTime', v, t]); this.value = v; }
  linearRampToValueAtTime(v, t)           { this._calls.push(['linearRampToValueAtTime', v, t]); }
  exponentialRampToValueAtTime(v, t)      { this._calls.push(['exponentialRampToValueAtTime', v, t]); }
  setTargetAtTime(v, t, tc)               { this._calls.push(['setTargetAtTime', v, t, tc]); }
  cancelScheduledValues(t)                { this._calls.push(['cancelScheduledValues', t]); }
  cancelAndHoldAtTime(t)                  { this._calls.push(['cancelAndHoldAtTime', t]); }
}

class MockAudioNode {
  constructor(ctx) {
    this._ctx = ctx;
    this._connections = [];
  }
  connect(dest)    { this._connections.push(dest); return dest; }
  disconnect()     { this._connections = []; }
  start(t)         {}
  stop(t)          {}
}

class MockGainNode extends MockAudioNode {
  constructor(ctx) {
    super(ctx);
    this.gain = new MockAudioParam(1);
  }
}

class MockOscillatorNode extends MockAudioNode {
  constructor(ctx) {
    super(ctx);
    this.type = 'sine';
    this.frequency = new MockAudioParam(440);
    this.detune = new MockAudioParam(0);
    this._started = false;
    this._stopped = false;
  }
  start(t) { this._started = true; }
  stop(t)  { this._stopped = true; }
}

class MockBiquadFilterNode extends MockAudioNode {
  constructor(ctx) {
    super(ctx);
    this.type = 'lowpass';
    this.frequency = new MockAudioParam(350);
    this.detune = new MockAudioParam(0);
    this.Q = new MockAudioParam(1);
    this.gain = new MockAudioParam(0);
  }
}

class MockWaveShaperNode extends MockAudioNode {
  constructor(ctx) {
    super(ctx);
    this.curve = null;
    this.oversample = 'none';
  }
}

class MockBufferSourceNode extends MockAudioNode {
  constructor(ctx) {
    super(ctx);
    this.buffer = null;
    this.loop = false;
    this.playbackRate = new MockAudioParam(1);
    this._started = false;
  }
  start(t) { this._started = true; }
  stop(t)  {}
}

class MockDynamicsCompressorNode extends MockAudioNode {
  constructor(ctx) {
    super(ctx);
    this.threshold = new MockAudioParam(-24);
    this.knee = new MockAudioParam(30);
    this.ratio = new MockAudioParam(12);
    this.attack = new MockAudioParam(0.003);
    this.release = new MockAudioParam(0.25);
  }
}

class MockAudioBuffer {
  constructor(channels, length, sampleRate) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this._data = Array.from({ length: channels }, () => new Float32Array(length));
  }
  getChannelData(channel) { return this._data[channel]; }
}

export class MockAudioContext {
  constructor(sampleRate = 44100) {
    this.sampleRate = sampleRate;
    this.currentTime = 0;
    this.state = 'running';
    this.destination = new MockAudioNode(this);
    this._nodes = [];
  }

  // Advance the mock clock
  advanceTime(seconds) { this.currentTime += seconds; }

  createGain()                { const n = new MockGainNode(this);             this._nodes.push(n); return n; }
  createOscillator()          { const n = new MockOscillatorNode(this);       this._nodes.push(n); return n; }
  createBiquadFilter()        { const n = new MockBiquadFilterNode(this);     this._nodes.push(n); return n; }
  createWaveShaper()          { const n = new MockWaveShaperNode(this);       this._nodes.push(n); return n; }
  createBufferSource()        { const n = new MockBufferSourceNode(this);     this._nodes.push(n); return n; }
  createDynamicsCompressor()  { const n = new MockDynamicsCompressorNode(this); this._nodes.push(n); return n; }

  createBuffer(channels, length, sampleRate) {
    return new MockAudioBuffer(channels, length, sampleRate);
  }

  createPeriodicWave(real, imag) {
    return { real, imag };
  }

  resume()  { this.state = 'running';   return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close()   { this.state = 'closed';    return Promise.resolve(); }
}
