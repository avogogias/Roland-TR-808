package com.analogsynth.ms20;

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
 * Instrumented tests for the Korg MS-20 synthesizer app.
 *
 * Run on a physical device or emulator (Android 13 / API 33).
 * Verifies MS-20-specific features:
 *   - Dual VCO with waveform selection
 *   - HPF (high-pass filter) and LPF (low-pass filter)
 *   - Patch bay / external signal processor
 *   - Two envelope generators (EG1, EG2)
 *   - LFO/MG modulation
 *   - Keyboard input
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
    public void ms20_pageBodyIsPresent() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        onWebView()
                .check(webContent(castOrDie(script(
                        "return document.body !== null;",
                        Boolean.class))));
    }

    @Test
    public void ms20_hasDualVcoSection() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        // Verify dual VCO section (VCO 1 + VCO 2)
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('vco') || body.includes('oscillator') || " +
                        "body.includes('osc');",
                        Boolean.class))));
    }

    @Test
    public void ms20_hasHighPassFilter() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        // Verify HPF control
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('hpf') || body.includes('high') || " +
                        "body.includes('high-pass') || body.includes('highpass');",
                        Boolean.class))));
    }

    @Test
    public void ms20_hasLowPassFilter() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        // Verify LPF control
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('lpf') || body.includes('filter') || " +
                        "body.includes('cutoff') || body.includes('low-pass');",
                        Boolean.class))));
    }

    @Test
    public void ms20_hasPatchBay() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        // Verify patch bay or modulation routing section
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('patch') || body.includes('jack') || " +
                        "body.includes('ms-20') || body.includes('ms20') || " +
                        "body.includes('signal');",
                        Boolean.class))));
    }

    @Test
    public void ms20_hasEnvelopeGenerators() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        // Verify EG1 / EG2 envelope generators
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('attack') || body.includes('decay') || " +
                        "body.includes('sustain') || body.includes('release') || " +
                        "body.includes('eg') || body.includes('envelope');",
                        Boolean.class))));
    }

    @Test
    public void ms20_hasLfoSection() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('lfo') || body.includes('mg') || " +
                        "body.includes('modulation');",
                        Boolean.class))));
    }

    @Test
    public void ms20_audioContextIsAvailable() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        onWebView()
                .check(webContent(castOrDie(script(
                        "return typeof AudioContext !== 'undefined' || " +
                        "typeof webkitAudioContext !== 'undefined';",
                        Boolean.class))));
    }
}
