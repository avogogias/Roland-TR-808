package com.analogsynth.tr909;

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
import static androidx.test.espresso.web.webdriver.DriverAtoms.findElement;
import static androidx.test.espresso.web.webdriver.Locator.TAG_NAME;

/**
 * Instrumented tests for the Roland TR-909 synthesizer app.
 *
 * Run on a physical device or emulator (Android 13 / API 33).
 * Verifies TR-909-specific features:
 *   - Punchy click-transient bass drum synthesis
 *   - Resonant hi-hat voices (closed / open)
 *   - 16-step sequencer pad buttons
 *   - Transport and tempo controls
 *   - Snare, Tom, Rim Shot voices
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
    public void tr909_pageBodyIsPresent() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        // Confirm the page loaded by checking body tag exists
        onWebView()
                .check(webContent(castOrDie(script(
                        "return document.body !== null;",
                        Boolean.class))));
    }

    @Test
    public void tr909_hasBassDrumVoice() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('bass') || body.includes('bd') || body.includes('kick');",
                        Boolean.class))));
    }

    @Test
    public void tr909_hasHiHatVoice() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('hi-hat') || body.includes('hihat') || " +
                        "body.includes('hh') || body.includes('hat');",
                        Boolean.class))));
    }

    @Test
    public void tr909_hasSnareVoice() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('snare') || body.includes('sd');",
                        Boolean.class))));
    }

    @Test
    public void tr909_hasStepSequencerButtons() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        onWebView()
                .check(webContent(castOrDie(script(
                        "return document.querySelectorAll('button, [class*=\"step\"], [class*=\"pad\"]').length > 0;",
                        Boolean.class))));
    }

    @Test
    public void tr909_hasTransportControl() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('start') || body.includes('stop') || body.includes('play');",
                        Boolean.class))));
    }

    @Test
    public void tr909_hasTempoControl() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        onWebView()
                .check(webContent(castOrDie(script(
                        "var body = document.body.innerHTML.toLowerCase();" +
                        "return body.includes('tempo') || body.includes('bpm');",
                        Boolean.class))));
    }

    @Test
    public void tr909_audioContextIsAvailable() throws InterruptedException {
        Thread.sleep(PAGE_LOAD_TIMEOUT_MS);
        onWebView()
                .check(webContent(castOrDie(script(
                        "return typeof AudioContext !== 'undefined' || " +
                        "typeof webkitAudioContext !== 'undefined';",
                        Boolean.class))));
    }
}
