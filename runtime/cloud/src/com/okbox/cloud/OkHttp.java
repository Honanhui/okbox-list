package com.okbox.cloud;
import okhttp3.*;
import java.util.Map;
import java.util.concurrent.TimeUnit;
final class OkHttp {
 static OkHttpClient client(int ms){return new OkHttpClient.Builder().connectTimeout(ms,TimeUnit.MILLISECONDS).readTimeout(ms,TimeUnit.MILLISECONDS).callTimeout(ms,TimeUnit.MILLISECONDS).build();}
 static Call newCall(String url,Map<String,String> headers,RequestBody body){Request.Builder b=new Request.Builder().url(url);headers.forEach(b::header);return client(15000).newCall(b.post(body).build());}
}
