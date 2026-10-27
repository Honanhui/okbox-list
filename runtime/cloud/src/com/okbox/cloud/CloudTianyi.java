package com.okbox.cloud;

import org.json.JSONObject;
import okhttp3.*;
import javax.crypto.Cipher;
import java.security.KeyFactory;
import java.security.spec.X509EncodedKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Official password/second-factor flow. Pending verification stays in memory. */
public final class CloudTianyi {
    private static final String CLOUD = "https://cloud.189.cn", AUTH = "https://open.e.189.cn";
    private static final Map<String, Session> pending = new HashMap<>();
    private CloudTianyi() {}

    static final class Session implements CookieJar {
        final long expires = System.currentTimeMillis() + 300_000;
        final List<Cookie> cookies = new ArrayList<>();
        final JSONObject secret;
        final OkHttpClient client;
        JSONObject config, challenge;
        String lt, reqId, publicKey;
        long sentAt;
        int attempts;
        Session(JSONObject value) {
            this(value, OkHttp.client(12_000));
        }
        Session(JSONObject value, OkHttpClient transport) {
            secret = value;
            client = transport.newBuilder().cookieJar(this).followRedirects(false).followSslRedirects(false).build();
        }
        public void saveFromResponse(HttpUrl url, List<Cookie> values) {
            for (Cookie value : values) {
                // Official responses must never introduce a cookie for another service.
                if (!value.domain().equals("189.cn") && !value.domain().endsWith(".189.cn")) continue;
                cookies.removeIf(old -> old.name().equals(value.name()) && old.domain().equals(value.domain()) && old.path().equals(value.path()));
                cookies.add(value);
            }
        }
        public List<Cookie> loadForRequest(HttpUrl url) {
            List<Cookie> result = new ArrayList<>();
            if (!official(url)) return result;
            for (Cookie value : cookies) if (value.matches(url) && value.expiresAt() > System.currentTimeMillis()) result.add(value);
            return result;
        }
    }

    static boolean official(HttpUrl url) {
        return url != null && url.isHttps() && url.username().isEmpty() && url.password().isEmpty()
                && url.port() == 443 && (url.host().equals("cloud.189.cn") || url.host().equals("open.e.189.cn"));
    }

    private static Response request(Session s, String value, FormBody body) throws Exception {
        HttpUrl url = HttpUrl.parse(value);
        if (!official(url)) throw new IllegalStateException("天翼回跳地址不属于官方站点");
        Request.Builder builder = new Request.Builder().url(url).header("User-Agent", "Mozilla/5.0").header("Accept", "application/json;charset=UTF-8")
                .header("Referer", url.host().equals("open.e.189.cn") ? AUTH + "/" : CLOUD + "/");
        if (s.lt != null) builder.header("lt", s.lt).header("reqId", s.reqId);
        if (body != null) builder.post(body);
        return s.client.newCall(builder.build()).execute();
    }

    private static JSONObject post(Session s, String path, String... fields) throws Exception {
        FormBody.Builder body = new FormBody.Builder();
        for (int i = 0; i < fields.length; i += 2) body.add(fields[i], fields[i + 1]);
        try (Response response = request(s, AUTH + path, body.build())) {
            if (!response.isSuccessful() || response.body() == null) throw new IllegalStateException("天翼登录接口失败（HTTP " + response.code() + "）");
            return new JSONObject(response.body().string());
        }
    }

    private static String encrypt(Session s, String text) throws Exception {
        String pem = s.publicKey.replace("-----BEGIN PUBLIC KEY-----", "").replace("-----END PUBLIC KEY-----", "").replaceAll("\\s", "");
        Cipher cipher = Cipher.getInstance("RSA/ECB/PKCS1Padding");
        cipher.init(Cipher.ENCRYPT_MODE, KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(java.util.Base64.getDecoder().decode(pem))));
        return "{NRP}" + HexFormat.of().formatHex(cipher.doFinal(text.getBytes(StandardCharsets.UTF_8)));
    }

    private static JSONObject account(String id) throws Exception {
        JSONObject account = CloudAccountStore.account(id);
        if (!"tianyi".equals(account.optString("provider")) || account.optBoolean("disabled")) throw new IllegalArgumentException("天翼账号不存在或已停用");
        return account.getJSONObject("secret");
    }

    private static Session current(String id) throws Exception {
        Session s = pending.get(id);
        JSONObject now = account(id);
        if (s == null || s.expires <= System.currentTimeMillis()
                || !now.optString("username").equals(s.secret.optString("username"))
                || !now.optString("password").equals(s.secret.optString("password"))) {
            pending.remove(id);
            throw new IllegalStateException("天翼验证会话已过期，请重新登录");
        }
        return s;
    }

    private static JSONObject waiting(String id) throws Exception {
        return CloudAccountStore.setVerification(id, "天翼需要短信身份验证，请点击发送验证码后填写", "")
                .put("verificationType", "tianyi-sms");
    }

    public static synchronized JSONObject validate(String id) throws Exception {
        JSONObject secret = account(id);
        if (secret.optString("cookie").isBlank()) return login(id);
        try (Response response = OkHttp.client(12_000).newBuilder().followRedirects(false).followSslRedirects(false).build().newCall(new Request.Builder()
                .url(CLOUD + "/api/open/file/listFiles.action?folderId=-11&pageNum=1&pageSize=1")
                .header("Cookie", secret.getString("cookie")).header("Referer", CLOUD + "/").header("Accept", "application/json;charset=UTF-8").header("User-Agent", "Mozilla/5.0").build()).execute()) {
            JSONObject data = new JSONObject(response.body().string());
            if (!response.isSuccessful() || data.optInt("res_code", -1) != 0 || !data.has("fileListAO"))
                throw new IllegalStateException("天翼登录会话已失效，请重新登录完成验证");
        }
        return CloudAccountStore.setValidation(id, "valid", "天翼官方目录校验通过");
    }

    public static synchronized JSONObject login(String id) throws Exception {
        pending.entrySet().removeIf(e -> e.getValue().expires <= System.currentTimeMillis());
        if (pending.containsKey(id)) { current(id); return waiting(id); }
        Session s = new Session(account(id));
        return begin(id, s);
    }

    static JSONObject begin(String id, Session s) throws Exception {
        if (s.secret.optString("username").isBlank() || s.secret.optString("password").isBlank()) throw new IllegalArgumentException("请填写天翼账号密码");
        s.publicKey = post(s, "/api/logbox/config/encryptConf.do?appId=cloud").getJSONObject("data").getString("pubKey");
        String url = CLOUD + "/api/portal/loginUrl.action?redirectURL=" + java.net.URLEncoder.encode(CLOUD + "/web/redirect.html?returnURL=/main.action", StandardCharsets.UTF_8);
        for (int hop = 0; hop < 6; hop++) {
            try (Response response = request(s, url, null)) {
                HttpUrl landed = response.request().url();
                if (landed.host().equals("open.e.189.cn") && landed.queryParameter("lt") != null) {
                    s.lt = landed.queryParameter("lt"); s.reqId = landed.queryParameter("reqId"); break;
                }
                String location = response.header("Location");
                if (location == null) break;
                HttpUrl next = landed.resolve(location);
                if (!official(next)) throw new IllegalStateException("天翼登录入口回跳异常");
                url = next.toString();
            }
        }
        if (s.lt == null || s.reqId == null) throw new IllegalStateException("天翼登录参数获取失败");
        s.config = post(s, "/api/logbox/oauth2/appConf.do", "version", "2.0", "appKey", "cloud").getJSONObject("data");
        JSONObject result = post(s, "/api/logbox/oauth2/loginSubmit.do", "appKey", "cloud", "version", "2.0", "accountType", "01",
                "mailSuffix", "@189.cn", "validateCode", "", "returnUrl", s.config.getString("returnUrl"), "paramId", s.config.getString("paramId"),
                "captchaToken", "", "dynamicCheck", "FALSE", "clientType", "1", "cb_SaveName", "0", "isOauth2", "false",
                "userName", encrypt(s, s.secret.getString("username")), "password", encrypt(s, s.secret.getString("password")));
        if (result.optInt("result", -1) == -133) {
            s.challenge = result; pending.put(id, s); return waiting(id);
        }
        return finish(id, s, result);
    }

    public static synchronized JSONObject send(String id) throws Exception {
        Session s = current(id);
        if (s.sentAt > 0 && System.currentTimeMillis() - s.sentAt < 60_000) throw new IllegalStateException("请等待60秒后再发送验证码");
        s.sentAt = System.currentTimeMillis();
        JSONObject result = post(s, "/api/logbox/oauth2/sendSmsCodeForSecondAuth.do", "mobile", s.challenge.getString("mobile"), "appKey", "cloud");
        if (result.optInt("result", -1) != 0) throw new IllegalStateException("天翼短信发送未通过（代码 " + result.optInt("result", -1) + "），请稍后重试或使用官网验证");
        return new JSONObject().put("state", "verify").put("message", "短信已发送，请填写验证码").put("retryAfter", 60);
    }

    public static synchronized JSONObject submit(String id, String code) throws Exception {
        Session s = current(id);
        if (!code.matches("[0-9]{4,8}") || s.sentAt == 0) throw new IllegalArgumentException("请先发送并填写短信验证码");
        if (++s.attempts > 5) { pending.remove(id); throw new IllegalStateException("验证码尝试次数过多，请重新登录"); }
        JSONObject result = post(s, "/api/logbox/oauth2/submitForSecondAuth.do", "mobile", s.challenge.getString("mobile"), "appKey", "cloud",
                "userName", "true".equals(s.challenge.optString("romaSecondAuth")) ? s.secret.getString("username") : encrypt(s, s.secret.getString("username")),
                "epd", encrypt(s, code), "accountType", s.config.optString("accountType", "01"),
                "returnUrl", java.net.URLEncoder.encode(s.config.getString("returnUrl"), StandardCharsets.UTF_8),
                "isOauth2", s.config.optString("isOauth2", "false"), "cb_SaveName", "0", "state", s.config.optString("state"), "paramId", s.config.getString("paramId"));
        return finish(id, s, result);
    }

    private static JSONObject finish(String id, Session s, JSONObject result) throws Exception {
        if (result.optInt("result", -1) != 0 || result.optString("toUrl").isBlank()) throw new IllegalStateException("天翼登录未通过（代码 " + result.optInt("result", -1) + "），尚未保存登录会话");
        String url = result.getString("toUrl");
        boolean completed = false;
        for (int hop = 0; hop < 6; hop++) {
            try (Response response = request(s, url, null)) {
                if (!response.isRedirect()) { if (!response.isSuccessful()) throw new IllegalStateException("天翼登录回跳失败"); completed = true; break; }
                HttpUrl next = response.request().url().resolve(response.header("Location", ""));
                if (!official(next)) throw new IllegalStateException("天翼登录回跳异常");
                url = next.toString();
            }
        }
        if (!completed) throw new IllegalStateException("天翼登录回跳次数过多");
        try (Response response = request(s, CLOUD + "/api/open/file/listFiles.action?folderId=-11&pageNum=1&pageSize=1", null)) {
            JSONObject check = new JSONObject(response.body().string());
            if (!response.isSuccessful() || check.optInt("res_code", -1) != 0 || !check.has("fileListAO")) throw new IllegalStateException("天翼目录登录校验未通过，尚未保存会话");
        }
        StringJoiner cookie = new StringJoiner("; ");
        for (Cookie value : s.loadForRequest(HttpUrl.parse(CLOUD + "/"))) cookie.add(value.name() + "=" + value.value());
        if (cookie.length() == 0) throw new IllegalStateException("天翼未返回有效登录会话");
        CloudAccountStore.mergeProviderSecret("tianyi", new JSONObject().put("cookie", cookie.toString()));
        pending.remove(id);
        return CloudAccountStore.setValidation(id, "valid", "天翼官方登录及目录校验通过");
    }
}
