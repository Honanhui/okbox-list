package com.okbox.cloud;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
public final class Worker {
 public static void main(String[] args)throws Exception{
  BufferedReader input=new BufferedReader(new InputStreamReader(System.in,StandardCharsets.UTF_8));
  PrintWriter output=new PrintWriter(new OutputStreamWriter(System.out,StandardCharsets.UTF_8),true);
  String line;while((line=input.readLine())!=null){JSONObject reply=new JSONObject();try{
   JSONObject req=new JSONObject(line);reply.put("id",req.get("rpcId"));reply.put("result",dispatch(req));
  }catch(Exception e){reply.put("error",e.getMessage()==null?"无法处理网盘请求":e.getMessage());}
  output.println(reply.toString());}
 }
 static Object dispatch(JSONObject r)throws Exception{
  String action=r.optString("action"),id=r.optString("id"),p=r.optString("provider");
  switch(action){
   case "catalog":return CloudAccountStore.catalog();
   case "save":return CloudAccountStore.save(id,p,r.optString("name"),r.optJSONObject("values")==null?new JSONObject():r.getJSONObject("values"),r);
   case "delete":return CloudAccountStore.remove(id);
   case "enable":return CloudAccountStore.setDisabled(id,false);
   case "disable":return CloudAccountStore.setDisabled(id,true);
   case "login":return CloudAccountValidator.login(id);
   case "validate":return CloudAccountValidator.validate(id);
   case "auth-start":return CloudAuthService.start(p,r.optString("name"));
   case "auth-poll":return CloudAuthService.poll(r.optString("sessionId"));
   case "auth-cancel":return CloudAuthService.cancel(r.optString("sessionId"));
   case "inspect":return CloudShare.inspect(r.optString("url"));
   case "credentials":return CloudTokenService.ensureFresh(p);
   case "ali-playback-persist":CloudAccountStore.mergeProviderSecret("aliyun",r.getJSONObject("values"));return new JSONObject().put("ok",true);
   case "gateway-status":return CloudGateway.status();
   case "gateway-config":return CloudGateway.tvFanConfig();
   case "gateway-token":return CloudGateway.tokenConfig();
   case "gateway-credential":return CloudGateway.credential(p);
   default:throw new IllegalArgumentException("未知网盘操作");
  }
 }
}
