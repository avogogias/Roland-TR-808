/**
 * MidiController.js
 * Web MIDI API integration. Routes MIDI messages to registered plugin listeners.
 *
 * Usage:
 *   MidiController.init();
 *   const id = MidiController.addListener(({ type, note, velocity, channel, value }) => { ... });
 *   MidiController.removeListener(id);
 */
const MidiController = (() => {
  let _access = null;
  let _listeners = {};
  let _nextId = 1;
  let _channel = null; // null = all channels

  async function init() {
    if (!navigator.requestMIDIAccess) {
      console.warn('Web MIDI API not supported in this browser.');
      return false;
    }
    try {
      _access = await navigator.requestMIDIAccess();
      _access.inputs.forEach(input => {
        input.onmidimessage = _onMessage;
      });
      _access.onstatechange = e => {
        if (e.port.type === 'input') {
          if (e.port.state === 'connected') {
            e.port.onmidimessage = _onMessage;
          }
        }
      };
      return true;
    } catch (err) {
      console.warn('MIDI access denied:', err);
      return false;
    }
  }

  function _onMessage(event) {
    const [status, data1, data2] = event.data;
    const type = status & 0xf0;
    const ch = status & 0x0f;

    if (_channel !== null && ch !== _channel) return;

    let msg = null;
    switch (type) {
      case 0x90: // note on
        msg = data2 > 0
          ? { type: 'noteon',  note: data1, velocity: data2 / 127, channel: ch }
          : { type: 'noteoff', note: data1, velocity: 0,           channel: ch };
        break;
      case 0x80: // note off
        msg = { type: 'noteoff', note: data1, velocity: data2 / 127, channel: ch };
        break;
      case 0xe0: // pitch bend
        msg = { type: 'pitchbend', value: ((data2 << 7 | data1) - 8192) / 8192, channel: ch };
        break;
      case 0xb0: // CC
        msg = { type: 'cc', cc: data1, value: data2 / 127, channel: ch };
        break;
      default:
        return;
    }
    Object.values(_listeners).forEach(fn => fn(msg));
  }

  return {
    init,
    /** Add a listener. Returns an ID for later removal. */
    addListener(fn) {
      const id = _nextId++;
      _listeners[id] = fn;
      return id;
    },
    removeListener(id) {
      delete _listeners[id];
    },
    /** Set to a specific MIDI channel (0-15), or null for all. */
    setChannel(ch) { _channel = ch; },
  };
})();

export default MidiController;
