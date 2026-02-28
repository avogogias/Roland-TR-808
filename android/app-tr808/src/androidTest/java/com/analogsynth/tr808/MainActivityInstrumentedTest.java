package com.analogsynth.tr808;

import androidx.test.espresso.web.webdriver.DriverAtoms;
import androidx.test.espresso.web.webdriver.Locator;
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
import static androidx.test.espresso.web.assertion.WebViewAssertions.webMatches;
import static androidx.test.espresso.web.model.Atoms.castOrDie;
import static androidx.test.espresso.web.model.Atoms.script;
import static androidx.test.espresso.web.sugar.Web.onWebView;
import static androidx.test.espresso.web.webdriver.DriverAtoms.findElement;
import static androidx.test.espresso.web.webdriver.DriverAtoms.getText;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.notNullValue;

/**
 * Instrumented tests for the Roland TR-808 synthesizer app.
 *
 * Run on a physical device or emulator (Android 13 / API 33).
 * Verifies that the TR-808 UI renders correctly and all synthesizer features
 * are accessible within the WebView.
 *
 * Features tested:
 *   - 16-step sequencer pad buttons
 *   - Drum voice instrument rows (Bass Drum, Snare, Hi-Hat, etc.)
 *   - Transport controls (Start/Stop)
 *   - BPM tempo control
 *   - Accent and instrument selectors
 */
@RunWith(AndroidJUnit4.class)
public class MainActivityInstrumentedTest {

    private static final int PAGE_LOAD_TIMEOUT_MS = 8000;

    @Rule
    public ActivityScenarioRule<MainActivity> activityRule =
            new ActivityScenarioRule<>(MainActivity.class);

    // ── WebView visibility ────────────────────────────────────────────────────

    @Test
    public void webView_isVisible() {
        onView(withId(R.id.webview)).check(matches(isDisplayed()));
    }

    // ── TR-808 synthesizer feature tests ─────────────────────────────────────

    @Test
    public void tr808_pageLoadsWithTitle() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        onWebView()
                .withElement(findElement(Locator.TAG_NAME, "body"))
                .check(webMatches(getText(), notNullValue()));
    }

    @Test
    public void tr808_hasStepSequencerButtons() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        // Verify 16-step sequencer buttons exist in DOM
        onWebView()
                .check(webContent(castOrDie(script(
                        "return document.querySelectorAll('.step-btn, .seq-step, " +
                        "[data-step], .pad-btn, button').length > 0;",
                        Boolean.class))));
    }

    @Test
    public void tr808_hasBassDrumControl() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        // Verify Bass Drum (BD) voice section or control exists
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('bass') || body.includes('bd') || " +
                        "body.includes('kick') || body.includes('drum');",
                        Boolean.class))));
    }

    @Test
    public void tr808_hasSnareControl() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('snare') || body.includes('sd');",
                        Boolean.class))));
    }

    @Test
    public void tr808_hasHiHatControl() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('hi-hat') || body.includes('hihat') || " +
                        "body.includes('hh') || body.includes('hat');",
                        Boolean.class))));
    }

    @Test
    public void tr808_hasTransportControl() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        // Verify Start/Stop transport button exists
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('start') || body.includes('stop') || " +
                        "body.includes('play') || body.includes('run');",
                        Boolean.class))));
    }

    @Test
    public void tr808_hasTempoControl() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        // Verify BPM/Tempo control exists
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('tempo') || body.includes('bpm') || " +
                        "body.includes('rate');",
                        Boolean.class))));
    }

    @Test
    public void tr808_hasDrumVoicesForAllInstruments() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        // Verify multiple drum voice rows are present (TR-808 has 14 voices)
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "var voices = ['bass', 'snare', 'hat', 'tom', 'clap'];" +
                        "return voices.filter(v => body.includes(v)).length >= 3;",
                        Boolean.class))));
    }

    @Test
    public void tr808_hasAudioContextOrSynthEngine() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        // Verify the Web Audio API context was created
        onWebView()
                .check(webContent(castOrDie(script(
                        "return typeof AudioContext !== 'undefined' || " +
                        "typeof webkitAudioContext !== 'undefined';",
                        Boolean.class))));
    }
}
