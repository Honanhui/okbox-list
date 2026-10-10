package com.okbox.cloud;
import org.json.JSONObject;
import java.util.Map;
final class Result extends JSONObject {
 static Result empty(){return new Result();}
 static Result error(String message){Result r=new Result();r.put("error",message);return r;}
 void setParse(int v){put("parse",v);}
 void setUrl(String v){put("url",v);}
 void setHeader(Map<String,String> v){put("header",new JSONObject(v));}
}
