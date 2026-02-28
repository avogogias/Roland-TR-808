package com.analogsynth.tr808;

import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.test.core.app.ActivityScenario;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * Unit tests for Roland TR-808 MainActivity.
 *
 * Verifies that the WebView is correctly configured to host the TR-808
 * drum machine synthesizer with all required settings for AudioWorklet,
 * ES module loading, and immersive full-screen playback.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33)
public class MainActivityUnitTest {

    // ── URL / asset configuration ─────────────────────────────────────────────

    @Test
    public void synthUrl_pointsToTR808Html() {
        assertEquals(
                "SYNTH_URL must load the TR-808 plugin HTML",
                "https://appassets.androidplatform.net/assets/plugins/TR808/TR808.html",
                MainActivity.SYNTH_URL);
    }

    @Test
    public void assetBaseUrl_usesSecureOrigin() {
        assertTrue(
                "Asset base URL must use HTTPS for AudioWorklet to function",
                MainActivity.ASSET_BASE_URL.startsWith("https://"));
    }

    @Test
    public void assetBaseUrl_usesExpectedDomain() {
        assertTrue(
                "Asset base URL must use the WebViewAssetLoader virtual domain",
                MainActivity.ASSET_BASE_URL.contains("appassets.androidplatform.net"));
    }

    // ── Activity lifecycle ────────────────────────────────────────────────────

    @Test
    public void activity_createsSuccessfully() {
        try (ActivityScenario<MainActivity> scenario =
                     ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> assertNotNull(
                    "MainActivity must not be null after creation", activity));
        }
    }

    @Test
    public void webView_isNotNullAfterCreate() {
        try (ActivityScenario<MainActivity> scenario =
                     ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity ->
                    assertNotNull("WebView must be initialized in onCreate",
                            activity.getWebView()));
        }
    }

    // ── WebView settings — required for TR-808 AudioWorklet synthesis ─────────

    @Test
    public void webView_hasJavaScriptEnabled() {
        try (ActivityScenario<MainActivity> scenario =
                     ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                WebView wv = activity.getWebView();
                assertTrue("JavaScript must be enabled for TR-808 synthesis engine",
                        wv.getSettings().getJavaScriptEnabled());
            });
        }
    }

    @Test
    public void webView_hasDomStorageEnabled() {
        try (ActivityScenario<MainActivity> scenario =
                     ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                WebView wv = activity.getWebView();
                assertTrue("DOM storage required for TR-808 pattern persistence",
                        wv.getSettings().getDomStorageEnabled());
            });
        }
    }

    @Test
    public void webView_mediaPlaybackDoesNotRequireUserGesture() {
        try (ActivityScenario<MainActivity> scenario =
                     ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                WebView wv = activity.getWebView();
                // False = audio starts automatically when sequencer runs
                assertTrue("Media must auto-play for TR-808 sequencer to work without gesture",
                        !wv.getSettings().getMediaPlaybackRequiresUserGesture());
            });
        }
    }

    @Test
    public void webView_fileAccessDisabled() {
        try (ActivityScenario<MainActivity> scenario =
                     ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                WebSettings settings = activity.getWebView().getSettings();
                assertTrue("File access must be disabled; assets served via WebViewAssetLoader",
                        !settings.getAllowFileAccess());
            });
        }
    }

    @Test
    public void webView_contentAccessDisabled() {
        try (ActivityScenario<MainActivity> scenario =
                     ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                WebSettings settings = activity.getWebView().getSettings();
                assertTrue("Content access must be disabled for security",
                        !settings.getAllowContentAccess());
            });
        }
    }

    // ── TR-808 feature coverage assertions ───────────────────────────────────

    @Test
    public void synthUrl_containsPluginPath() {
        assertTrue("URL must reference the plugins directory",
                MainActivity.SYNTH_URL.contains("/plugins/TR808/"));
    }

    @Test
    public void synthUrl_endsWithHtmlFile() {
        assertTrue("URL must point to the TR-808 HTML entry file",
                MainActivity.SYNTH_URL.endsWith("TR808.html"));
    }

    @Test
    public void packageName_isTR808Specific() {
        assertEquals("Package must be scoped to TR-808 app",
                "com.analogsynth.tr808",
                MainActivity.class.getPackage().getName());
    }
}
