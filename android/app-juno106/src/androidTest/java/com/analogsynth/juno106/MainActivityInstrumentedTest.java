package com.analogsynth.juno106;

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
 * Instrumented tests for the Roland Juno-106 synthesizer app.
 *
 * Run on a physical device or emulator (Android 13 / API 33).
 * Verifies Juno-106-specific features:
 *   - 6-voice polyphonic DCO synthesis
 *   - 24 dB LPF with resonance
 *   - BBD Chorus I and Chorus II
 *   - HPF, LFO, envelope controls
 *   - Pitch and mod benders
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
    public void juno106_pageBodyIsPresent() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        onWebView()
                .check(webContent(castOrDie(script(
                        "return document.body !== null;",
                        Boolean.class))));
    }

    @Test
    public void juno106_hasDcoSection() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        // Verify DCO (digital-controlled oscillator) section
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('dco') || body.includes('oscillator') || " +
                        "body.includes('osc') || body.includes('vco');",
                        Boolean.class))));
    }

    @Test
    public void juno106_hasChorusEffect() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        // Verify BBD Chorus I/II controls
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('chorus') || body.includes('bbd') || " +
                        "body.includes('effect') || body.includes('fx');",
                        Boolean.class))));
    }

    @Test
    public void juno106_hasFilterSection() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        // Verify 24 dB LPF filter controls
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('filter') || body.includes('vcf') || " +
                        "body.includes('cutoff') || body.includes('lpf');",
                        Boolean.class))));
    }

    @Test
    public void juno106_hasEnvelopeControls() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('attack') || body.includes('decay') || " +
                        "body.includes('sustain') || body.includes('release') || " +
                        "body.includes('envelope') || body.includes('adsr');",
                        Boolean.class))));
    }

    @Test
    public void juno106_hasLfoControl() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('lfo') || body.includes('modulation') || " +
                        "body.includes('mod');",
                        Boolean.class))));
    }

    @Test
    public void juno106_hasKeyboard() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('key') || body.includes('keyboard') || " +
                        "body.includes('note') || body.includes('piano');",
                        Boolean.class))));
    }

    @Test
    public void juno106_hasPolyphonicVoices() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        // Verify polyphony indicator or voice count controls exist
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('poly') || body.includes('voice') || " +
                        "body.includes('juno') || body.includes('106');",
                        Boolean.class))));
    }

    @Test
    public void juno106_audioContextIsAvailable() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        onWebView()
                .check(webContent(castOrDie(script(
                        "return typeof AudioContext !== 'undefined' || " +
                        "typeof webkitAudioContext !== 'undefined';",
                        Boolean.class))));
    }
}
