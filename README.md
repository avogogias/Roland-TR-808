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

## Running in a Browser

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

## Android Apps (Android 13)

Each synthesizer is available as a **self-contained Android APK** targeting
Android 13 (API 33). No internet connection is required — all assets are
bundled inside the APK and served from a secure virtual HTTPS origin so that
AudioWorklet and ES modules work correctly in the on-device WebView.

### APK Modules

| Gradle module | App Name | Package | Synth |
|---------------|----------|---------|-------|
| `:app-tr808` | Roland TR-808 | `com.analogsynth.tr808` | Drum machine |
| `:app-tr909` | Roland TR-909 | `com.analogsynth.tr909` | Drum machine |
| `:app-minimoog` | Moog Minimoog | `com.analogsynth.minimoog` | Mono synth |
| `:app-juno106` | Roland Juno-106 | `com.analogsynth.juno106` | Poly synth |
| `:app-ms20` | Korg MS-20 | `com.analogsynth.ms20` | Semi-modular |
| `:app-ms10` | Korg MS-10 | `com.analogsynth.ms10` | Mono synth |

### Requirements

- Android 8.0 (API 26) or later
- Android 13 (API 33) recommended for best performance
- Hardware audio output (speaker or headphones)
- Landscape orientation (the apps lock to landscape)

### Building the APKs

You need Android SDK installed. Set `ANDROID_HOME` or create
`android/local.properties` with your SDK path:

```
sdk.dir=/path/to/your/Android/Sdk
```

Then build from the `android/` directory:

```bash
cd android

# Build a specific synth
./gradlew :app-tr808:assembleRelease

# Build all six at once
./gradlew assembleRelease
```

Built APKs are placed in each module's
`build/outputs/apk/release/` directory, e.g.
`android/app-tr808/build/outputs/apk/release/app-tr808-release.apk`.

### Installing on an Android Phone

#### Method 1 — ADB (recommended for developers)

1. Enable **Developer Options** on your phone:
   - Go to **Settings → About phone**
   - Tap **Build number** seven times until you see "You are now a developer"

2. Enable **USB debugging**:
   - Go to **Settings → Developer Options**
   - Enable **USB debugging**

3. Connect your phone via USB and install with `adb`:

   ```bash
   # Install the TR-808 APK
   adb install android/app-tr808/build/outputs/apk/release/app-tr808-release.apk

   # Install the TR-909 APK
   adb install android/app-tr909/build/outputs/apk/release/app-tr909-release.apk

   # Install the Minimoog APK
   adb install android/app-minimoog/build/outputs/apk/release/app-minimoog-release.apk

   # Install the Juno-106 APK
   adb install android/app-juno106/build/outputs/apk/release/app-juno106-release.apk

   # Install the MS-20 APK
   adb install android/app-ms20/build/outputs/apk/release/app-ms20-release.apk

   # Install the MS-10 APK
   adb install android/app-ms10/build/outputs/apk/release/app-ms10-release.apk
   ```

#### Method 2 — Sideloading (transfer APK file to phone)

1. **Transfer the APK** to your phone via USB file transfer, Google Drive,
   email, Bluetooth, or any other method.

2. **Allow installation from unknown sources**:
   - Android 8+: Go to **Settings → Apps → Special app access →
     Install unknown apps**
   - Select the app you will use to open the APK (e.g. your file manager
     or Chrome) and enable **Allow from this source**

3. **Open the APK file** on your phone using a file manager and tap
   **Install** when prompted.

4. If Google Play Protect shows a warning, tap **Install anyway** — the
   APKs are signed with a standard debug key and contain no network code.

5. Launch the app from your home screen or app drawer. The synthesizer
   opens immediately in full-screen landscape mode.

> **Tip:** The synths are designed for landscape orientation and use the
> full screen width. Rotate your phone sideways for the best experience.

### Running Tests

#### Unit tests (Robolectric — no device required)

```bash
cd android

# All modules at once
./gradlew test

# Per synthesizer
./gradlew :app-tr808:test
./gradlew :app-tr909:test
./gradlew :app-minimoog:test
./gradlew :app-juno106:test
./gradlew :app-ms20:test
./gradlew :app-ms10:test
```

Unit tests (Robolectric, `@Config(sdk = 33)`) verify:
- Correct entry-point URL for each synthesizer's HTML
- HTTPS asset origin (required for AudioWorklet)
- WebView settings: JavaScript enabled, DOM storage, media auto-play,
  file access disabled
- Package name isolation per synthesizer

#### Instrumented tests (requires connected Android device or emulator)

```bash
cd android

./gradlew :app-tr808:connectedAndroidTest
./gradlew :app-tr909:connectedAndroidTest
./gradlew :app-minimoog:connectedAndroidTest
./gradlew :app-juno106:connectedAndroidTest
./gradlew :app-ms20:connectedAndroidTest
./gradlew :app-ms10:connectedAndroidTest
```

Instrumented tests (Espresso WebView) verify that:
- The WebView loads and renders the correct synthesizer page
- Synthesizer-specific UI sections are present in the DOM (VCO, filter,
  envelope, chorus, step sequencer, etc.)
- `AudioContext` is available for Web Audio synthesis

### Android Project Structure

```
android/
├── build.gradle          # Root: Android Gradle Plugin 8.3.2
├── settings.gradle       # Includes :app and all 6 synth modules
├── app/                  # Original combined launcher (all 6 synths)
├── app-tr808/            # Roland TR-808 standalone APK
│   ├── build.gradle      #   targetSdk 33, applicationId com.analogsynth.tr808
│   └── src/
│       ├── main/         #   MainActivity, resources, adaptive icon
│       ├── test/         #   Robolectric unit tests
│       └── androidTest/  #   Espresso instrumented tests
├── app-tr909/            # Roland TR-909 standalone APK
├── app-minimoog/         # Moog Minimoog standalone APK
├── app-juno106/          # Roland Juno-106 standalone APK
├── app-ms20/             # Korg MS-20 standalone APK
└── app-ms10/             # Korg MS-10 standalone APK
```

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
android/       Self-contained APK per synthesizer (Android 13 / API 33)
```

## Browser requirements

Chrome 66+ or Firefox 76+ (AudioWorklet support required).
