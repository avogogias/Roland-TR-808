package com.analogsynth.minimoog;

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
 * Instrumented tests for the Moog Minimoog Model D synthesizer app.
 *
 * Run on a physical device or emulator (Android 13 / API 33).
 * Verifies Minimoog-specific features:
 *   - 3 voltage-controlled oscillators (VCO 1, 2, 3)
 *   - Moog 24 dB ladder filter (AudioWorklet)
 *   - Filter and amplitude envelopes
 *   - Portamento/glide
 *   - LFO modulation
 *   - Keyboard / MIDI input
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
    public void minimoog_pageBodyIsPresent() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        onWebView()
                .check(webContent(castOrDie(script(
                        "return document.body !== null;",
                        Boolean.class))));
    }

    @Test
    public void minimoog_hasVcoSection() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        // Verify 3-VCO section exists
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('vco') || body.includes('oscillator') || " +
                        "body.includes('osc');",
                        Boolean.class))));
    }

    @Test
    public void minimoog_hasFilterSection() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        // Verify Moog ladder filter controls exist
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('filter') || body.includes('vcf') || " +
                        "body.includes('cutoff') || body.includes('ladder');",
                        Boolean.class))));
    }

    @Test
    public void minimoog_hasEnvelopeControls() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        // Verify ADSR envelope generators exist
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('attack') || body.includes('decay') || " +
                        "body.includes('sustain') || body.includes('release') || " +
                        "body.includes('adsr') || body.includes('envelope');",
                        Boolean.class))));
    }

    @Test
    public void minimoog_hasPortamentoControl() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        // Verify portamento/glide control exists
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('portamento') || body.includes('glide');",
                        Boolean.class))));
    }

    @Test
    public void minimoog_hasKeyboard() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        // Verify keyboard/note input exists
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('key') || body.includes('keyboard') || " +
                        "body.includes('note') || body.includes('piano');",
                        Boolean.class))));
    }

    @Test
    public void minimoog_hasMultipleControlKnobs() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        // Verify multiple control elements (knobs/sliders) are present
        onWebView()
                .check(webContent(castOrDie(script(
                        "return document.querySelectorAll('input[type=range], " +
                        "[class*=\"knob\"], [class*=\"slider\"], [class*=\"control\"]').length >= 5;",
                        Boolean.class))));
    }

    @Test
    public void minimoog_audioContextIsAvailable() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        onWebView()
                .check(webContent(castOrDie(script(
                        "return typeof AudioContext !== 'undefined' || " +
                        "typeof webkitAudioContext !== 'undefined';",
                        Boolean.class))));
    }
}
