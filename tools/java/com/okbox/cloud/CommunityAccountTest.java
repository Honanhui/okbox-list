package com.okbox.cloud;
import org.json.*;
public final class CommunityAccountTest {
 public static void main(String[] args) throws Exception {
  if(!CloudAccountValidator.communityUsername("<a class='username' href='?my.htm'>小明 &amp; 测试</a><a href='?user-22.htm'>其他作者</a>").equals("小明 & 测试"))throw new AssertionError("Profile username parsing");
  if(!CloudAccountValidator.communityUsername("<input name='username' value='我的账号'><a href='?my.htm'>个人中心</a>").equals("我的账号"))throw new AssertionError("Username form parsing");
  if(!CloudAccountValidator.communityUsername("<a href='?user-22.htm'>帖子作者</a>").isEmpty())throw new AssertionError("Post author is not signed-in user");
  if(!CloudAccountValidator.communityUsername("<a href='?my-profile.htm'>基本资料</a>").isEmpty())throw new AssertionError("Menu is not username");
  if(!CloudAccountValidator.communityUsername("<div class='sidebar-user-section-username position-relative'><img src='avatar.png'><div>1234567</div></div><a href='?my-profile.htm'>基本资料</a>").equals("1234567"))throw new AssertionError("Sidebar account parsing");
  JSONArray providers=CloudAccountStore.catalog().getJSONArray("providers");boolean found=false;
  for(int i=0;i<providers.length();i++){JSONObject p=providers.getJSONObject(i);if(!p.getString("id").equals("pan123community"))continue;found=true;if(!p.getString("name").equals("123社区")||!p.getJSONArray("fields").getJSONObject(0).getBoolean("secret"))throw new AssertionError("Missing secret Cookie entry");}
  if(!found)throw new AssertionError("Missing provider");
  JSONObject result=CloudAccountStore.save("","pan123community","synthetic community",new JSONObject().put("cookie","bbs_sid=synthetic-community-secret"));
  if(result.toString().contains("synthetic-community-secret"))throw new AssertionError("Summary exposed Cookie");
  if(!CloudAccountStore.firstSecretForProvider("pan123community").getString("cookie").equals("bbs_sid=synthetic-community-secret"))throw new AssertionError("Cookie unavailable inside worker");
  if(CloudAccountStore.firstSecretForProvider("pan123").length()!=0)throw new AssertionError("Community and drive accounts mixed");
  System.out.println("PASS: community Cookie provider, secret storage and drive separation");
 }
}
