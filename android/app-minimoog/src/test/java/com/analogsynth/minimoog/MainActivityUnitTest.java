package com.analogsynth.minimoog;

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
 * Unit tests for Moog Minimoog Model D MainActivity.
 *
 * Verifies WebView configuration for the Minimoog synthesizer,
 * including AudioWorklet support required by the Moog ladder filter.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33)
public class MainActivityUnitTest {

    @Test
    public void synthUrl_pointsToMinimoogHtml() {
        assertEquals(
                "SYNTH_URL must load the Minimoog plugin HTML",
                "https://appassets.androidplatform.net/assets/plugins/Minimoog/Minimoog.html",
                MainActivity.SYNTH_URL);
    }

    @Test
    public void assetBaseUrl_usesSecureOrigin() {
        assertTrue(
                "Asset base URL must use HTTPS for Moog ladder filter AudioWorklet",
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
                    assertTrue("JavaScript must be enabled for Minimoog synthesis engine",
                            activity.getWebView().getSettings().getJavaScriptEnabled()));
        }
    }

    @Test
    public void webView_hasDomStorageEnabled() {
        try (ActivityScenario<MainActivity> scenario =
                     ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity ->
                    assertTrue("DOM storage must be enabled for preset persistence",
                            activity.getWebView().getSettings().getDomStorageEnabled()));
        }
    }

    @Test
    public void webView_mediaPlaybackDoesNotRequireUserGesture() {
        try (ActivityScenario<MainActivity> scenario =
                     ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity ->
                    assertTrue("Media must auto-play for Minimoog keyboard input",
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
    public void synthUrl_containsMinimoogPluginPath() {
        assertTrue("URL must reference the Minimoog plugin directory",
                MainActivity.SYNTH_URL.contains("/plugins/Minimoog/"));
    }

    @Test
    public void synthUrl_endsWithHtmlFile() {
        assertTrue("URL must point to the Minimoog HTML entry file",
                MainActivity.SYNTH_URL.endsWith("Minimoog.html"));
    }

    @Test
    public void packageName_isMinimoogSpecific() {
        assertEquals("Package must be scoped to Minimoog app",
                "com.analogsynth.minimoog",
                MainActivity.class.getPackage().getName());
    }
}
