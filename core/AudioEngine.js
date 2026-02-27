/**
 * AudioEngine.js
 * Singleton Web Audio context with master compressor and output chain.
 * Must call AudioEngine.resume() on first user gesture.
 */
const AudioEngine = (() => {
  let ctx = null;
  let masterGain = null;
  let masterOut = null;

  function _build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -6;
    comp.knee.value = 6;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    masterGain.connect(comp);
    comp.connect(ctx.destination);
    masterOut = masterGain;
  }

  return {
    /** Call once on first user gesture. */
    resume() {
      if (!ctx) _build();
      if (ctx.state === 'suspended') ctx.resume();
    },
    getContext() {
      if (!ctx) _build();
      return ctx;
    },
    /** Connect nodes to this to reach the speakers. */
    getMasterOutput() {
      if (!ctx) _build();
      return masterOut;
    },
    setMasterVolume(v) {
      if (masterGain) masterGain.gain.setTargetAtTime(v, ctx.currentTime, 0.01);
    },
  };
})();

export default AudioEngine;
