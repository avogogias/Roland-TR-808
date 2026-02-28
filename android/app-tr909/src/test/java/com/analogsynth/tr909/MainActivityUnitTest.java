package com.analogsynth.tr909;

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
 * Unit tests for Roland TR-909 MainActivity.
 *
 * Verifies WebView configuration and URL for the TR-909 drum machine,
 * ensuring AudioWorklet-based synthesis works correctly.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33)
public class MainActivityUnitTest {

    @Test
    public void synthUrl_pointsToTR909Html() {
        assertEquals(
                "SYNTH_URL must load the TR-909 plugin HTML",
                "https://appassets.androidplatform.net/assets/plugins/TR909/TR909.html",
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

    @Test
    public void webView_hasJavaScriptEnabled() {
        try (ActivityScenario<MainActivity> scenario =
                     ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity ->
                    assertTrue("JavaScript must be enabled for TR-909 synthesis engine",
                            activity.getWebView().getSettings().getJavaScriptEnabled()));
        }
    }

    @Test
    public void webView_hasDomStorageEnabled() {
        try (ActivityScenario<MainActivity> scenario =
                     ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity ->
                    assertTrue("DOM storage required for TR-909 pattern persistence",
                            activity.getWebView().getSettings().getDomStorageEnabled()));
        }
    }

    @Test
    public void webView_mediaPlaybackDoesNotRequireUserGesture() {
        try (ActivityScenario<MainActivity> scenario =
                     ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity ->
                    assertTrue("Media must auto-play for TR-909 sequencer",
                            !activity.getWebView().getSettings().getMediaPlaybackRequiresUserGesture()));
        }
    }

    @Test
    public void webView_fileAccessDisabled() {
        try (ActivityScenario<MainActivity> scenario =
                     ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity ->
                    assertTrue("File access must be disabled",
                            !activity.getWebView().getSettings().getAllowFileAccess()));
        }
    }

    @Test
    public void webView_contentAccessDisabled() {
        try (ActivityScenario<MainActivity> scenario =
                     ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity ->
                    assertTrue("Content access must be disabled for security",
                            !activity.getWebView().getSettings().getAllowContentAccess()));
        }
    }

    @Test
    public void synthUrl_containsTR909PluginPath() {
        assertTrue("URL must reference the TR-909 plugin directory",
                MainActivity.SYNTH_URL.contains("/plugins/TR909/"));
    }

    @Test
    public void synthUrl_endsWithHtmlFile() {
        assertTrue("URL must point to the TR-909 HTML entry file",
                MainActivity.SYNTH_URL.endsWith("TR909.html"));
    }

    @Test
    public void packageName_isTR909Specific() {
        assertEquals("Package must be scoped to TR-909 app",
                "com.analogsynth.tr909",
                MainActivity.class.getPackage().getName());
    }
}
