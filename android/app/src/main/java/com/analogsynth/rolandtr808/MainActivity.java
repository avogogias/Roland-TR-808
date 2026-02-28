package com.analogsynth.rolandtr808;

import android.annotation.SuppressLint;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.annotation.RequiresApi;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;

/**
 * Full-screen WebView host for the analogue synthesizer simulations.
 *
 * Audio architecture note:
 * Assets are served via WebViewAssetLoader under the virtual HTTPS origin
 *   https://appassets.androidplatform.net/assets/
 * This is mandatory: Web Audio API AudioWorklet requires a secure context
 * (https:// or localhost). Serving from file:// would silently block worklet
 * loading, breaking all audio synthesis.
 *
 * All six instruments (TR-808, TR-909, Minimoog, Juno-106, MS-20, MS-10)
 * are bundled inside the APK via the Gradle sourceSets.assets configuration
 * in app/build.gradle — no internet access is required at runtime.
 */
public class MainActivity extends AppCompatActivity {

    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        enableImmersiveMode();

        webView = findViewById(R.id.webview);

        // Map all app assets to https://appassets.androidplatform.net/assets/
        // so that AudioWorklet, ES modules, and same-origin checks all pass.
        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .setDomain("appassets.androidplatform.net")
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        // Allow audio to start without a user gesture (needed for sequencer autoplay)
        settings.setMediaPlaybackRequiresUserGesture(false);
        // Disable file:// access — everything is served through the asset loader
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(
                    WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                // Grant audio and other requested permissions automatically
                request.grant(request.getResources());
            }
        });

        // Enable remote debugging via chrome://inspect (debug builds only)
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");
    }

    /** Handle the hardware Back button: navigate WebView history before exiting. */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onPause() {
        super.onPause();
        webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
        enableImmersiveMode();
    }

    private void enableImmersiveMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            enableImmersiveModeApi30();
        } else {
            enableImmersiveModeCompat();
        }
    }

    @RequiresApi(api = Build.VERSION_CODES.R)
    private void enableImmersiveModeApi30() {
        WindowInsetsController controller = getWindow().getInsetsController();
        if (controller != null) {
            controller.hide(WindowInsets.Type.systemBars());
            controller.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }
    }

    @SuppressWarnings("deprecation")
    private void enableImmersiveModeCompat() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }
}
