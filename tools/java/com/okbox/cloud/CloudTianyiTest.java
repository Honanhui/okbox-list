package com.okbox.cloud;

import okhttp3.*;
import org.json.JSONObject;
import javax.crypto.Cipher;
import java.security.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Synthetic protocol fixtures only; never sends an account or SMS to a network. */
public final class CloudTianyiTest {
    static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
    interface Checked { void run() throws Exception; }
    static void rejects(Checked action) throws Exception { try { action.run(); } catch (Exception expected) { return; } throw new AssertionError("Expected rejection"); }
    static String decrypt(KeyPair keys, String text) throws Exception {
        Cipher c = Cipher.getInstance("RSA/ECB/PKCS1Padding");c.init(Cipher.DECRYPT_MODE,keys.getPrivate());
        return new String(c.doFinal(HexFormat.of().parseHex(text.substring(5))),StandardCharsets.UTF_8);
    }
    public static void main(String[] args) throws Exception {
        check(CloudTianyi.smsReason(new JSONObject().put("msg", "短信服务暂不可用")).contains("短信服务暂不可用"), "Preserve official SMS explanation");
        check(CloudTianyi.smsReason(new JSONObject()).contains("未提供具体错误说明"), "Do not invent a meaning for undocumented codes");
        String safe = CloudTianyi.smsReason(new JSONObject().put("msg", "手机号13800138000 token=fixture-secret https://example.test/?token=secret"));
        check(!safe.contains("13800138000")&&!safe.contains("fixture-secret")&&!safe.contains("https://"), "Provider explanation must not expose sensitive values");
        KeyPairGenerator generator=KeyPairGenerator.getInstance("RSA");generator.initialize(1024);KeyPair keys=generator.generateKeyPair();
        JSONObject secret=new JSONObject().put("username","fixture-user").put("password","fixture-password");
        String id=CloudAccountStore.save("","tianyi","fixture",secret).getJSONArray("accounts").getJSONObject(0).getString("id");
        JSONObject missingCookie=CloudAccountValidator.validate(id);
        check(missingCookie.optString("state").equals("invalid")&&missingCookie.optString("message").contains("未保存登录Cookie"),"Checking missing cookie must not start password login");
        check(!missingCookie.has("verificationType"),"Check must not create an SMS challenge");
        int[] sent={0},submits={0}; boolean[] directoryOk={true},external={false};CloudTianyi.Session[] holder={null};
        OkHttpClient mock=new OkHttpClient.Builder().addInterceptor(chain->{
            Request request=chain.request();HttpUrl u=request.url();check(CloudTianyi.official(u),"Credentials must stay on official HTTPS origins");
            String path=u.encodedPath(),text="{}",location=null;int status=200;
            try {
                if(path.endsWith("encryptConf.do"))text=new JSONObject().put("data",new JSONObject().put("pubKey",java.util.Base64.getEncoder().encodeToString(keys.getPublic().getEncoded()))).toString();
                else if(path.endsWith("loginUrl.action")){status=302;location="https://open.e.189.cn/login?lt=fixture&reqId=fixture";}
                else if(path.equals("/login"))text="login";
                else if(path.endsWith("appConf.do"))text="{\"data\":{\"returnUrl\":\"https://cloud.189.cn/done\",\"paramId\":\"fixture\"}}";
                else if(path.endsWith("loginSubmit.do")){
                    FormBody b=(FormBody)request.body();Map<String,String> values=new HashMap<>();for(int i=0;i<b.size();i++)values.put(b.name(i),b.value(i));
                    check(decrypt(keys,values.get("userName")).equals("fixture-user"),"Username encryption");
                    check(decrypt(keys,values.get("password")).equals("fixture-password"),"Password encryption");
                    text=external[0]?"{\"result\":0,\"toUrl\":\"https://evil.example/done\"}":"{\"result\":-133,\"mobile\":\"fixture-private-mobile\",\"isSystem\":0}";
                } else if(path.endsWith("sendSmsCodeForSecondAuth.do")){sent[0]++;text=sent[0]==1?"{\"result\":20102}":"{\"result\":0}";}
                else if(path.endsWith("submitForSecondAuth.do")){
                    submits[0]++;FormBody b=(FormBody)request.body();String code="";for(int i=0;i<b.size();i++)if(b.name(i).equals("epd"))code=decrypt(keys,b.value(i));
                    text=code.equals("123456")?"{\"result\":0,\"toUrl\":\"https://cloud.189.cn/done\"}":"{\"result\":51177}";
                } else if(path.equals("/done")){
                    holder[0].saveFromResponse(u,List.of(Cookie.parse(u,"session=fixture-secret; Path=/; Secure; HttpOnly")));
                    text="ok";
                } else if(path.endsWith("listFiles.action"))text=directoryOk[0]?"{\"res_code\":0,\"fileListAO\":{}}":"{\"res_code\":-1}";
                else throw new AssertionError("Unexpected endpoint");
            }catch(Exception error){throw new java.io.IOException("Fixture failure",error);}
            Response.Builder response=new Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(status).message("fixture").body(ResponseBody.create(MediaType.parse("application/json"),text));
            if(location!=null)response.header("Location",location);return response.build();
        }).build();
        CloudTianyi.Session s=new CloudTianyi.Session(secret,mock);holder[0]=s;
        JSONObject first=CloudTianyi.begin(id,s);check(first.optString("verificationType").equals("tianyi-sms"),"Device verification is pending");check(sent[0]==0,"No automatic SMS");
        check(!first.toString().contains("fixture-private-mobile")&&!first.toString().contains("fixture-password"),"Summary must be redacted");
        rejects(()->CloudTianyi.submit(id,"123456"));check(submits[0]==0,"Require explicit SMS request first");
        JSONObject failed=CloudTianyi.send(id);check(!failed.optBoolean("sent")&&failed.optInt("code")==20102&&s.sentAt==0,"First SMS rejection is not success");
        check(CloudTianyi.send(id).optInt("retryAfter")>0,"Failure retains visible cooldown");check(sent[0]==1,"No automatic SMS retry");
        s.lastSmsAttemptAt=System.currentTimeMillis()-61_000;
        check(CloudTianyi.send(id).optBoolean("sent"),"Explicit second attempt can succeed with the same verification session");check(sent[0]==2,"Only the explicit manual resend invokes provider");
        rejects(()->CloudTianyi.submit(id,"000000"));check(CloudAccountStore.firstSecretForProvider("tianyi").optString("cookie").isEmpty(),"Wrong code cannot save session");
        directoryOk[0]=false;rejects(()->CloudTianyi.submit(id,"123456"));check(CloudAccountStore.firstSecretForProvider("tianyi").optString("cookie").isEmpty(),"Failed directory check cannot save session");
        directoryOk[0]=true;JSONObject done=CloudTianyi.submit(id,"123456");check(done.optString("state").equals("valid"),"Verified login");check(!done.toString().contains("fixture-secret"),"Never return cookie to browser");
        check(CloudAccountStore.firstSecretForProvider("tianyi").getString("cookie").contains("fixture-secret"),"Cookie stays in server vault");
        rejects(()->CloudTianyi.send(id));
        external[0]=true;holder[0]=new CloudTianyi.Session(secret,mock);rejects(()->CloudTianyi.begin(id,holder[0]));
        CloudAccountStore.save(id,"tianyi","fixture",new JSONObject().put("password","changed"));check(CloudAccountStore.firstSecretForProvider("tianyi").optString("cookie").isEmpty(),"Changed password clears old session");
        external[0]=false;CloudAccountStore.save(id,"tianyi","fixture",secret);holder[0]=new CloudTianyi.Session(secret,mock);CloudTianyi.begin(id,holder[0]);
        java.lang.reflect.Field expiry=CloudTianyi.Session.class.getDeclaredField("expires");expiry.setAccessible(true);expiry.setLong(holder[0],0L);
        rejects(()->CloudTianyi.send(id));check(sent[0]==2,"Expired session cannot send SMS");
        holder[0]=new CloudTianyi.Session(secret,mock);CloudTianyi.begin(id,holder[0]);CloudAccountStore.setDisabled(id,true);
        rejects(()->CloudTianyi.send(id));check(sent[0]==2,"Disabled account cannot send SMS");
        check(!CloudTianyi.official(HttpUrl.parse("https://cloud.189.cn.evil.example/")),"Reject forged official host");
        check(!CloudTianyi.official(HttpUrl.parse("http://cloud.189.cn/")),"Require HTTPS");
        System.out.println("PASS: Tianyi password/SMS protocol, no automatic SMS, cooldown, wrong-code rejection, directory validation, encrypted server session, account change and redirect isolation");
    }
}
