package com.okbox.cloud;



import org.json.JSONObject;

import java.util.Locale;

/** Loopback-only legacy credential views; Cat account sync uses its own verified hooks. */
public final class CloudGateway {

    private CloudGateway() {
    }

    /** Compatible with TVFan Cloud-drive.txt. Only the local Spider may call it. */
    public static JSONObject tvFanConfig() throws Exception {
        JSONObject result = new JSONObject();
        put(result, "token", "aliyun", "refreshToken", "refresh_token");
        put(result, "quarkCookie", "quark", "cookie");
        put(result, "ucCookie", "uc", "cookie");
        put(result, "bdCk", "baidu", "cookie");
        return result;
    }

    /** Compatible with common tokenm.json consumers. Only the local Spider may call it. */
    public static JSONObject tokenConfig() throws Exception {
        JSONObject result = tvFanConfig();
        put(result, "open_token", "aliyun", "openToken", "open_token");
        put(result, "quark_cookie", "quark", "cookie");
        put(result, "uc_cookie", "uc", "cookie");
        put(result, "pan115_cookie", "pan115", "cookie");
        put(result, "pan115_delete_code", "pan115", "delete_code", "deleteCode");
        put(result, "baidu_cookie", "baidu", "cookie");
        put(result, "pan123_username", "pan123", "username");
        put(result, "pan123_password", "pan123", "password");
        put(result, "pan123_token", "pan123", "token", "access_token");
        put(result, "pan123_authorization", "pan123", "authorization");
        put(result, "pan123_loginuuid", "pan123", "loginuuid");
        put(result, "pan189_username", "tianyi", "username");
        put(result, "pan189_password", "tianyi", "password");
        put(result, "yd_auth", "mobile139", "token");
        put(result, "bili_cookie", "bilibili", "cookie");
        put(result, "thunder_username", "thunder", "username");
        put(result, "thunder_password", "thunder", "password");
        put(result, "thunder_captchatoken", "thunder", "captcha_token", "captchaToken", "token");
        put(result, "pikpak_username", "pikpak", "username");
        put(result, "pikpak_password", "pikpak", "password");
        if (result.has("pan123_username") || result.has("pan123_token")) result.put("pan123_flags", "4kz");
        if (result.has("pan189_username")) result.put("pan189_flags", "4kz");
        if (result.has("yd_auth")) {
            String token = result.optString("yd_auth");
            if (!token.toLowerCase(Locale.ROOT).startsWith("basic ")) result.put("yd_auth", "Basic " + token);
            result.put("yd_thread_limit", 4).put("yd_flags", "auto|4kz").put("yd_danmu", true);
        }
        return result;
    }

    public static String credential(String provider) throws Exception {
        JSONObject secret = CloudTokenService.ensureFresh(provider);
        return switch (provider) {
            case "aliyun" -> first(secret, "refreshToken", "refresh_token", "token");
            case "quark", "uc", "pan115", "baidu", "guangya", "bilibili" -> first(secret, "cookie", "token");
            case "mobile139" -> first(secret, "token", "accessToken", "access_token");
            default -> first(secret, "token", "accessToken", "access_token", "cookie");
        };
    }

    public static JSONObject status() throws Exception {
        return new JSONObject()
                .put("mode", "bridge")
                .put("revision", 5)
                .put("credentialTransport", "loopback-only")
                .put("accountCount", CloudAccountStore.summaries().length())
                .put("providers", CloudAccountStore.catalog().getJSONArray("providers"))
                .put("accounts", "/api/cloud/accounts");
    }

    private static void put(JSONObject target, String output, String provider, String... fields) throws Exception {
        String value = first(CloudTokenService.ensureFresh(provider), fields);
        if (!value.isEmpty()) target.put(output, value);
    }

    private static String first(JSONObject object, String... names) {
        for (String name : names) {
            String value = object.optString(name).trim();
            if (!value.isEmpty()) return value;
        }
        return "";
    }

}
