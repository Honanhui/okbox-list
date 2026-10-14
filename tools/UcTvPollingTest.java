package com.okbox.cloud;
import org.json.JSONObject;
public class UcTvPollingTest {
 public static void main(String[] args) {
  JSONObject pending=CloudUcTv.response("/oauth/code",400,new JSONObject().put("error_info","用户未确认授权"));
  if(!pending.optBoolean("pending")||pending.optInt("status")==0)throw new AssertionError("waiting became authorized");
  for(String route:new String[]{"/file","/oauth/authorize"})expectError(route,"用户未确认授权");
  expectError("/oauth/code","Token已失效");
  JSONObject confirmed=new JSONObject().put("status",0).put("code","test-code");
  if(CloudUcTv.response("/oauth/code",200,confirmed)!=confirmed)throw new AssertionError("confirmed response altered");
  System.out.println("PASS: pending QR, confirmed QR and real authorization errors remain distinct");
 }
 static void expectError(String route,String message){try{CloudUcTv.response(route,400,new JSONObject().put("error_info",message));throw new AssertionError("authorization error ignored");}catch(IllegalStateException expected){if(!expected.getMessage().contains(message))throw new AssertionError("error detail lost");}}
}
