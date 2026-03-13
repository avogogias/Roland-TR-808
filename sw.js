/**
 * sw.js — Service Worker for Analogue Synthesizer Simulations PWA
 *
 * Strategy:
 *   • On install : pre-cache every static asset (HTML, JS, CSS, SVG)
 *   • On activate: delete stale caches from previous versions
 *   • On fetch   : cache-first for all same-origin requests
 *                  (audio is synthesised on-device — no network needed after first load)
 *
 * Update flow:
 *   Bump CACHE_VERSION when you deploy new files.
 *   The old cache is deleted on the next SW activation.
 */

const CACHE_VERSION = 'synth-lab-v2';

/** Every static file the app needs to run fully offline. */
const PRECACHE_ASSETS = [
  // Launcher
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',

  // Shared styles
  './styles/main.css',

  // Core audio engine + utilities
  './core/AudioEngine.js',
  './core/MidiController.js',
  './core/Sequencer.js',
  './core/utils.js',

  // UI components
  './components/Knob.js',
  './components/PadButton.js',
  './components/Slider.js',

  // AudioWorklet processors
  './worklets/BBDChorusProcessor.js',
  './worklets/KorgFilterProcessor.js',
  './worklets/MoogLadderProcessor.js',
  './worklets/NoiseProcessor.js',
  './worklets/VocoderProcessor.js',

  // ── Spectral Vocoder ─────────────────────────────────────────────
  './plugins/Vocoder/Vocoder.html',
  './plugins/Vocoder/Vocoder.js',
  './plugins/Vocoder/Vocoder.css',

  // ── Roland TR-808 ─────────────────────────────────────────────────
  './plugins/TR808/TR808.html',
  './plugins/TR808/TR808.js',
  './plugins/TR808/TR808.css',
  './plugins/TR808/voices/BassDrum.js',
  './plugins/TR808/voices/Clap.js',
  './plugins/TR808/voices/Clave.js',
  './plugins/TR808/voices/Cowbell.js',
  './plugins/TR808/voices/Cymbal.js',
  './plugins/TR808/voices/HiHat.js',
  './plugins/TR808/voices/SnareDrum.js',
  './plugins/TR808/voices/Tom.js',

  // ── Roland TR-909 ─────────────────────────────────────────────────
  './plugins/TR909/TR909.html',
  './plugins/TR909/TR909.js',
  './plugins/TR909/TR909.css',
  './plugins/TR909/voices/BassDrum909.js',
  './plugins/TR909/voices/HiHat909.js',
  './plugins/TR909/voices/SnareDrum909.js',
  './plugins/TR909/voices/Tom909.js',

  // ── Moog Minimoog Model D ─────────────────────────────────────────
  './plugins/Minimoog/Minimoog.html',
  './plugins/Minimoog/Minimoog.js',
  './plugins/Minimoog/Minimoog.css',

  // ── Roland Juno-106 ───────────────────────────────────────────────
  './plugins/Juno106/Juno106.html',
  './plugins/Juno106/Juno106.js',
  './plugins/Juno106/Juno106.css',

  // ── Korg MS-20 ────────────────────────────────────────────────────
  './plugins/MS20/MS20.html',
  './plugins/MS20/MS20.js',
  './plugins/MS20/MS20.css',

  // ── Korg MS-10 ────────────────────────────────────────────────────
  './plugins/MS10/MS10.html',
  './plugins/MS10/MS10.js',
  './plugins/MS10/MS10.css',

  // ── Fender Rhodes Stage 73 ────────────────────────────────────────
  './plugins/FenderRhodes/FenderRhodes.html',
  './plugins/FenderRhodes/FenderRhodes.js',
  './plugins/FenderRhodes/FenderRhodes.css',
];

// ─── Install: pre-cache all assets ────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())   // activate immediately, don't wait for old SW to exit
  );
});

// ─── Activate: remove stale caches ────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())  // take control of open pages immediately
  );
});

// ─── Fetch: cache-first strategy ──────────────────────────────────────────────
self.addEventListener('fetch', event => {
  // Only handle same-origin GET requests (ignore cross-origin, e.g. mic / MIDI APIs)
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      // Not in cache — fetch from network and add to cache for next time
      return fetch(event.request).then(response => {
        // Only cache valid responses
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(event.request, toCache));
        return response;
      }).catch(() => {
        // Offline and not cached — return a minimal offline page for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});
