package cn.xiaoxiaodouzi.storyverse;

import android.app.Activity;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 4107;
    private static final int EXPORT_FILE_REQUEST = 4108;
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private PendingExport pendingExport;

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(11, 13, 18));
        getWindow().setNavigationBarColor(Color.rgb(11, 13, 18));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(11, 13, 18));
        webView.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(webView);

        WebView.setWebContentsDebuggingEnabled(false);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setDatabaseEnabled(true);
        webView.getSettings().setAllowFileAccess(true);
        webView.getSettings().setAllowContentAccess(true);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(true);
        webView.getSettings().setBuiltInZoomControls(false);
        webView.getSettings().setDisplayZoomControls(false);
        webView.addJavascriptInterface(new NativeBridge(), "StoryVerseAndroid");
        webView.setWebViewClient(new StoryVerseWebClient());
        webView.setWebChromeClient(new StoryVerseChromeClient());

        if (savedInstanceState == null) webView.loadUrl("file:///android_asset/www/index.html");
        else webView.restoreState(savedInstanceState);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        webView.evaluateJavascript("Boolean(window.storyVerseHandleBack&&window.storyVerseHandleBack())", value -> {
            if (!"true".equals(value)) MainActivity.super.onBackPressed();
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST && fileCallback != null) {
            Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            fileCallback.onReceiveValue(result);
            fileCallback = null;
            return;
        }
        if (requestCode == EXPORT_FILE_REQUEST) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingExport != null) {
                try (OutputStream output = getContentResolver().openOutputStream(data.getData())) {
                    if (output == null) throw new IllegalStateException("无法打开保存位置");
                    output.write(pendingExport.bytes);
                    notifyWeb("文件已保存");
                } catch (Exception error) {
                    notifyWeb("保存失败，请重新选择位置");
                }
            }
            pendingExport = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private void notifyWeb(String message) {
        if (webView == null) return;
        webView.evaluateJavascript("window.toast&&window.toast(" + JSONObject.quote(message) + ")", null);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("StoryVerseAndroid");
            webView.destroy();
        }
        super.onDestroy();
    }

    private final class StoryVerseChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            try {
                startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
            } catch (Exception error) {
                fileCallback.onReceiveValue(null);
                fileCallback = null;
            }
            return true;
        }
    }

    private final class StoryVerseWebClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if ("file".equals(uri.getScheme()) && "android_asset".equals(uri.getHost())) return false;
            if ("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())) {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            }
            return true;
        }
    }

    private final class NativeBridge {
        private final ExecutorService executor = Executors.newCachedThreadPool();
        private final Handler mainHandler = new Handler(Looper.getMainLooper());

        @JavascriptInterface
        public String getVersion() {
            return BuildConfig.VERSION_NAME;
        }

        /** 使用 Android 系统文件选择器保存，不需要申请宽泛的存储权限。 */
        @JavascriptInterface
        public void saveExport(String fileName, String mimeType, String base64Content) {
            byte[] bytes;
            try { bytes = Base64.decode(base64Content, Base64.DEFAULT); }
            catch (Exception error) { mainHandler.post(() -> notifyWeb("导出内容无效")); return; }
            String safeName = safeExportName(fileName);
            mainHandler.post(() -> {
                pendingExport = new PendingExport(bytes);
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                        .addCategory(Intent.CATEGORY_OPENABLE)
                        .setType(mimeType)
                        .putExtra(Intent.EXTRA_TITLE, safeName);
                try { startActivityForResult(intent, EXPORT_FILE_REQUEST); }
                catch (Exception error) { pendingExport = null; notifyWeb("无法打开系统文件保存器"); }
            });
        }

        /** 将导出内容写入应用缓存，再通过临时只读 URI 调起系统分享面板。 */
        @JavascriptInterface
        public void shareExport(String fileName, String mimeType, String base64Content) {
            byte[] bytes;
            try { bytes = Base64.decode(base64Content, Base64.DEFAULT); }
            catch (Exception error) { mainHandler.post(() -> notifyWeb("导出内容无效")); return; }
            String safeName = safeExportName(fileName);
            executor.execute(() -> {
                try {
                    File directory = new File(getCacheDir(), "exports");
                    if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("无法创建导出缓存");
                    File file = new File(directory, safeName);
                    try (FileOutputStream output = new FileOutputStream(file)) { output.write(bytes); }
                    Uri uri = Uri.parse("content://" + getPackageName() + ".exports/" + Uri.encode(safeName));
                    mainHandler.post(() -> {
                        Intent share = new Intent(Intent.ACTION_SEND).setType(mimeType)
                                .putExtra(Intent.EXTRA_STREAM, uri)
                                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        try { startActivity(Intent.createChooser(share, "分享 StoryVerse 调试数据")); }
                        catch (Exception error) { notifyWeb("当前设备没有可用的分享应用"); }
                    });
                } catch (Exception error) { mainHandler.post(() -> notifyWeb("创建分享文件失败")); }
            });
        }

        @JavascriptInterface
        public void request(String id, String path, String body) {
            executor.execute(() -> {
                NativeResponse response;
                try {
                    response = ApiProxy.handle(path, new JSONObject(body));
                } catch (Exception error) {
                    response = NativeResponse.error(500, "连接 AI 时发生意外错误，应用仍可继续使用。");
                }
                NativeResponse result = response;
                mainHandler.post(() -> {
                    if (webView == null) return;
                    String script = "window.StoryVerseAndroidResponse(" + JSONObject.quote(id) + "," + result.status + "," + JSONObject.quote(result.body) + ")";
                    webView.evaluateJavascript(script, null);
                });
            });
        }
    }

    private static String safeExportName(String value) {
        String name = value == null ? "StoryVerse-debug.json" : value.replaceAll("[^a-zA-Z0-9._-]", "_");
        return name.isEmpty() ? "StoryVerse-debug.json" : name;
    }

    private static final class PendingExport {
        final byte[] bytes;
        PendingExport(byte[] bytes) { this.bytes = bytes; }
    }

    private static final class NativeResponse {
        final int status;
        final String body;
        NativeResponse(int status, JSONObject body) { this.status = status; this.body = body.toString(); }
        static NativeResponse error(int status, String message) {
            try { return new NativeResponse(status, new JSONObject().put("error", message)); }
            catch (JSONException impossible) { throw new IllegalStateException(impossible); }
        }
    }

    private static final class HttpResult {
        final int status;
        final String body;
        HttpResult(int status, String body) { this.status = status; this.body = body; }
    }

    private static final class ApiProxy {
        private static NativeResponse handle(String path, JSONObject data) throws Exception {
            if (!"/api/chat".equals(path) && !"/api/models".equals(path) && !"/api/test".equals(path))
                return NativeResponse.error(404, "请求地址不存在。");
            String baseUrl = trimSlash(data.optString("baseUrl").trim());
            String apiKey = data.optString("apiKey").trim();
            if (baseUrl.isEmpty() || apiKey.isEmpty()) return NativeResponse.error(400, "接口设置不完整，请检查地址和 API 密钥。");
            String[] endpoints = endpoints(baseUrl);
            if ("/api/chat".equals(path)) return chat(data, apiKey, endpoints[0]);
            return models(apiKey, endpoints[0], endpoints[1], "/api/test".equals(path));
        }

        private static NativeResponse chat(JSONObject data, String apiKey, String endpoint) throws Exception {
            String model = data.optString("model").trim();
            JSONArray messages = data.optJSONArray("messages");
            if (model.isEmpty() || messages == null) return NativeResponse.error(400, "智能体设置不完整，请检查模型名称。");
            JSONObject request = new JSONObject()
                    .put("model", model).put("messages", messages)
                    .put("temperature", data.optDouble("temperature", .85))
                    .put("max_tokens", data.optInt("maxTokens", 700));
            HttpResult result = http(endpoint, "POST", apiKey, request.toString(), 60_000);
            if (result.status >= 400) {
                if (result.status == 401 || result.status == 403) return NativeResponse.error(502, "连接 AI 失败，请检查 API 密钥是否正确。");
                if (result.status == 404) return NativeResponse.error(502, "没有找到接口或模型，请检查接口地址和模型名称。");
                if (result.status == 429) return NativeResponse.error(502, "请求过于频繁或额度不足，请稍后再试。");
                return NativeResponse.error(502, "AI 接口返回错误（" + result.status + "）。");
            }
            JSONObject payload = new JSONObject(result.body);
            JSONArray choices = payload.optJSONArray("choices");
            JSONObject choice = choices != null && choices.length() > 0 ? choices.optJSONObject(0) : null;
            JSONObject message = choice == null ? null : choice.optJSONObject("message");
            String content = message == null ? "" : message.optString("content").trim();
            if (content.isEmpty()) return NativeResponse.error(502, "当前模型没有返回内容，请稍后再试。");
            return new NativeResponse(200, new JSONObject().put("content", content));
        }

        private static NativeResponse models(String apiKey, String chatEndpoint, String modelsEndpoint, boolean test) throws Exception {
            HttpResult result = http(modelsEndpoint, "GET", apiKey, null, 30_000);
            if (result.status >= 400) {
                if (result.status == 401 || result.status == 403) return NativeResponse.error(502, "服务器已响应，但 API 密钥无效或没有访问权限。");
                if (test) {
                    String message = result.status == 404 ? "服务器可以访问，但没有提供 /models 模型列表。可以手动填写模型名称后再测试聊天。" :
                            result.status == 405 ? "服务器可以访问，但不允许读取模型列表。可以手动填写模型名称后再测试聊天。" :
                            result.status == 429 ? "服务器可以访问，但当前请求过于频繁或账户额度受限。" :
                                    "服务器可以访问，但模型接口返回 HTTP " + result.status + "。";
                    return new NativeResponse(200, new JSONObject().put("ok", true).put("level", "warning").put("message", message)
                            .put("endpoint", chatEndpoint).put("probeEndpoint", modelsEndpoint));
                }
                return NativeResponse.error(502, result.status == 404 ? "这个接口没有提供模型列表，请检查接口地址。" : "读取模型失败（" + result.status + "）。");
            }
            JSONObject payload = new JSONObject(result.body);
            JSONArray source = payload.optJSONArray("data");
            if (source == null) source = payload.optJSONArray("models");
            Set<String> unique = new HashSet<>();
            if (source != null) for (int i = 0; i < source.length(); i++) {
                Object item = source.opt(i);String value = "";
                if (item instanceof String) value = (String) item;
                else if (item instanceof JSONObject) value = ((JSONObject) item).optString("id", ((JSONObject) item).optString("name"));
                if (!value.isEmpty()) unique.add(value);
            }
            List<String> sorted = new ArrayList<>(unique);Collections.sort(sorted);
            JSONArray found = new JSONArray(sorted);
            if (test) return new NativeResponse(200, new JSONObject().put("ok", true).put("level", "success")
                    .put("message", "聊天地址已识别，密钥有效，读取到 " + sorted.size() + " 个模型。")
                    .put("endpoint", chatEndpoint).put("probeEndpoint", modelsEndpoint).put("models", found));
            return new NativeResponse(200, new JSONObject().put("models", found));
        }

        private static HttpResult http(String endpoint, String method, String apiKey, String body, int timeout) throws Exception {
            HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
            connection.setConnectTimeout(timeout);connection.setReadTimeout(timeout);
            connection.setRequestMethod(method);connection.setUseCaches(false);
            connection.setRequestProperty("Authorization", "Bearer " + apiKey);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Accept-Encoding", "identity");
            connection.setRequestProperty("User-Agent", "StoryVerse/" + BuildConfig.VERSION_NAME + " Android");
            if (body != null) {
                connection.setDoOutput(true);connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                try (OutputStream output = connection.getOutputStream()) { output.write(bytes); }
            }
            int status = connection.getResponseCode();
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            String response = stream == null ? "" : read(stream);
            connection.disconnect();return new HttpResult(status, response);
        }

        private static String read(InputStream stream) throws Exception {
            try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];int count;
                while ((count = input.read(buffer)) >= 0) output.write(buffer, 0, count);
                return output.toString(StandardCharsets.UTF_8.name());
            }
        }

        private static String[] endpoints(String base) {
            if (base.endsWith("/chat/completions")) return new String[]{base, base.substring(0, base.length() - 17) + "/models"};
            if (base.endsWith("/models")) {
                String root = base.substring(0, base.length() - 7);
                return new String[]{root + "/chat/completions", base};
            }
            return new String[]{base + "/chat/completions", base + "/models"};
        }

        private static String trimSlash(String value) { while (value.endsWith("/")) value = value.substring(0, value.length() - 1); return value; }
    }
}
