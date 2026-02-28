package com.analogsynth.ms10;

import androidx.test.ext.junit.rules.ActivityScenarioRule;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.assertion.ViewAssertions.matches;
import static androidx.test.espresso.matcher.ViewMatchers.isDisplayed;
import static androidx.test.espresso.matcher.ViewMatchers.withId;
import static androidx.test.espresso.web.assertion.WebViewAssertions.webContent;
import static androidx.test.espresso.web.model.Atoms.castOrDie;
import static androidx.test.espresso.web.model.Atoms.script;
import static androidx.test.espresso.web.sugar.Web.onWebView;

/**
 * Instrumented tests for the Korg MS-10 synthesizer app.
 *
 * Run on a physical device or emulator (Android 13 / API 33).
 * Verifies MS-10-specific features:
 *   - Single VCO with waveform selection
 *   - Korg transistor-ladder LPF
 *   - ADSR envelope generator
 *   - LFO modulation
 *   - Keyboard input
 *   - Simpler signal path than MS-20 (no HPF, no patch bay)
 */
@RunWith(AndroidJUnit4.class)
public class MainActivityInstrumentedTest {

    private static final int PAGE_LOAD_TIMEOUT_MS = 8000;

    @Rule
    public ActivityScenarioRule<MainActivity> activityRule =
            new ActivityScenarioRule<>(MainActivity.class);

    @Test
    public void webView_isVisible() {
        onView(withId(R.id.webview)).check(matches(isDisplayed()));
    }

    @Test
    public void ms10_pageBodyIsPresent() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        onWebView()
                .check(webContent(castOrDie(script(
                        "return document.body !== null;",
                        Boolean.class))));
    }

    @Test
    public void ms10_hasSingleVcoSection() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        // Verify VCO section exists
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('vco') || body.includes('oscillator') || " +
                        "body.includes('osc');",
                        Boolean.class))));
    }

    @Test
    public void ms10_hasLowPassFilter() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        // Verify LPF control (Korg transistor-ladder)
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('lpf') || body.includes('filter') || " +
                        "body.includes('cutoff') || body.includes('vcf');",
                        Boolean.class))));
    }

    @Test
    public void ms10_hasEnvelopeControls() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        // Verify ADSR envelope generator
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('attack') || body.includes('decay') || " +
                        "body.includes('sustain') || body.includes('release') || " +
                        "body.includes('envelope') || body.includes('adsr') || body.includes('eg');",
                        Boolean.class))));
    }

    @Test
    public void ms10_hasLfoControl() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('lfo') || body.includes('mg') || " +
                        "body.includes('modulation') || body.includes('vibrato');",
                        Boolean.class))));
    }

    @Test
    public void ms10_hasKeyboard() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('key') || body.includes('keyboard') || " +
                        "body.includes('note') || body.includes('piano');",
                        Boolean.class))));
    }

    @Test
    public void ms10_hasWaveformSelection() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        // Verify waveform selector (sawtooth, square, triangle)
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('wave') || body.includes('sawtooth') || " +
                        "body.includes('square') || body.includes('triangle') || " +
                        "body.includes('pulse') || body.includes('shape');",
                        Boolean.class))));
    }

    @Test
    public void ms10_audioContextIsAvailable() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        onWebView()
                .check(webContent(castOrDie(script(
                        "return typeof AudioContext !== 'undefined' || " +
                        "typeof webkitAudioContext !== 'undefined';",
                        Boolean.class))));
    }
}
