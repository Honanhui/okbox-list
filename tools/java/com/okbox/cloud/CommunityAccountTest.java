package com.okbox.cloud;
import org.json.*;
public final class CommunityAccountTest {
 public static void main(String[] args) throws Exception {
  JSONArray providers=CloudAccountStore.catalog().getJSONArray("providers");boolean found=false;
  for(int i=0;i<providers.length();i++){JSONObject p=providers.getJSONObject(i);if(!p.getString("id").equals("pan123community"))continue;found=true;if(!p.getString("name").equals("配置123社区Cookie")||!p.getJSONArray("fields").getJSONObject(0).getBoolean("secret"))throw new AssertionError("Missing secret Cookie entry");}
  if(!found)throw new AssertionError("Missing provider");
  JSONObject result=CloudAccountStore.save("","pan123community","synthetic community",new JSONObject().put("cookie","bbs_sid=synthetic-community-secret"));
  if(result.toString().contains("synthetic-community-secret"))throw new AssertionError("Summary exposed Cookie");
  if(!CloudAccountStore.firstSecretForProvider("pan123community").getString("cookie").equals("bbs_sid=synthetic-community-secret"))throw new AssertionError("Cookie unavailable inside worker");
  if(CloudAccountStore.firstSecretForProvider("pan123").length()!=0)throw new AssertionError("Community and drive accounts mixed");
  System.out.println("PASS: community Cookie provider, secret storage and drive separation");
 }
}
