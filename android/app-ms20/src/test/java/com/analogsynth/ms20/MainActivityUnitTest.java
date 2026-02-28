package com.analogsynth.ms20;

import androidx.test.core.app.ActivityScenario;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * Unit tests for Korg MS-20 MainActivity.
 *
 * Verifies WebView configuration for the MS-20 semi-modular synthesizer,
 * including Korg transistor-ladder filter AudioWorklet support.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33)
public class MainActivityUnitTest {

    @Test
    public void synthUrl_pointsToMS20Html() {
        assertEquals(
                "SYNTH_URL must load the MS-20 plugin HTML",
                "https://appassets.androidplatform.net/assets/plugins/MS20/MS20.html",
                MainActivity.SYNTH_URL);
    }

    @Test
    public void assetBaseUrl_usesSecureOrigin() {
        assertTrue(
                "Asset base URL must use HTTPS for Korg filter AudioWorklet",
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
                    assertTrue("JavaScript must be enabled for MS-20 synthesis engine",
                            activity.getWebView().getSettings().getJavaScriptEnabled()));
        }
    }

    @Test
    public void webView_hasDomStorageEnabled() {
        try (ActivityScenario<MainActivity> scenario =
                     ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity ->
                    assertTrue("DOM storage must be enabled",
                            activity.getWebView().getSettings().getDomStorageEnabled()));
        }
    }

    @Test
    public void webView_mediaPlaybackDoesNotRequireUserGesture() {
        try (ActivityScenario<MainActivity> scenario =
                     ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity ->
                    assertTrue("Media must auto-play for MS-20 keyboard input",
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
    public void synthUrl_containsMS20PluginPath() {
        assertTrue("URL must reference the MS20 plugin directory",
                MainActivity.SYNTH_URL.contains("/plugins/MS20/"));
    }

    @Test
    public void synthUrl_endsWithHtmlFile() {
        assertTrue("URL must point to the MS-20 HTML entry file",
                MainActivity.SYNTH_URL.endsWith("MS20.html"));
    }

    @Test
    public void packageName_isMS20Specific() {
        assertEquals("Package must be scoped to MS-20 app",
                "com.analogsynth.ms20",
                MainActivity.class.getPackage().getName());
    }
}
