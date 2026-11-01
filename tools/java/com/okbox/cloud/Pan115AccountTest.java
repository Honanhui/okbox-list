package com.okbox.cloud;
import org.json.JSONObject;
public final class Pan115AccountTest {
 public static void main(String[] args) {
  String name=CloudAccountValidator.parse115Identity(new JSONObject("{\"state\":true,\"data\":{\"user_id\":123,\"user_name\":\"测试账号\"}}"));
  if(!name.equals("115登录有效，账号：测试账号"))throw new AssertionError("Missing name");
  for(String json:new String[]{"{\"state\":false,\"data\":{\"user_id\":123}}","{\"state\":true,\"data\":{\"user_name\":\"假名称\"}}"}) {
   try {CloudAccountValidator.parse115Identity(new JSONObject(json));throw new AssertionError("Invalid login accepted");}catch(IllegalStateException expected){}
  }
  if(!CloudAccountValidator.parse115Identity(new JSONObject("{\"state\":true,\"data\":{\"user_id\":123}}" )).contains("未返回账号名称"))throw new AssertionError("Missing fallback");
  System.out.println("PASS: 115 account identity and invalid-cookie handling");
 }
}
