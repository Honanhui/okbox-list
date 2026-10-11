package com.okbox.cloud;
import org.json.JSONObject;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.security.SecureRandom;

final class FilePreferences {
 static final FilePreferences INSTANCE = new FilePreferences();
 static final Path DIR=Paths.get(System.getenv().getOrDefault("CLOUD_DATA_DIR","/data/cloud"));
 static final Path FILE=DIR.resolve("accounts.json");
 private JSONObject values;
 private synchronized JSONObject data() {
  if(values==null) try { Files.createDirectories(DIR); values=Files.exists(FILE)?new JSONObject(Files.readString(FILE)):new JSONObject(); }
  catch(Exception e){throw new IllegalStateException("无法读取账号存储",e);}
  return values;
 }
 synchronized String getString(String key,String fallback){return data().optString(key,fallback);}
 synchronized boolean getBoolean(String key,boolean fallback){return data().optBoolean(key,fallback);}
 Editor edit(){return new Editor();}
 final class Editor {
  final JSONObject changes=new JSONObject();
  Editor putString(String k,String v){changes.put(k,v);return this;}
  Editor putBoolean(String k,boolean v){changes.put(k,v);return this;}
  boolean commit(){synchronized(FilePreferences.this){try{
   JSONObject next=new JSONObject(data().toString());for(String k:changes.keySet())next.put(k,changes.get(k));
   atomic(FILE,next.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));values=next;return true;
  }catch(Exception e){return false;}}}
 }
 static void secure(Path p) throws Exception {try {Files.setPosixFilePermissions(p,PosixFilePermissions.fromString("rw-------"));}catch(UnsupportedOperationException ignored){}}
 static void atomic(Path p,byte[] bytes) throws Exception {
  Files.createDirectories(p.getParent());Path tmp=Files.createTempFile(p.getParent(),".save-",".tmp");
  try {secure(tmp);Files.write(tmp,bytes);try{Files.move(tmp,p,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);}catch(AtomicMoveNotSupportedException e){Files.move(tmp,p,StandardCopyOption.REPLACE_EXISTING);}secure(p);}finally{Files.deleteIfExists(tmp);}
 }
 static synchronized SecretKey key() throws Exception {
  Files.createDirectories(DIR);Path p=DIR.resolve("master.key");
  if(!Files.exists(p)){byte[] bytes=new byte[32];new SecureRandom().nextBytes(bytes);atomic(p,bytes);}
  byte[] bytes=Files.readAllBytes(p);if(bytes.length!=32)throw new IllegalStateException("账号加密密钥损坏");
  return new SecretKeySpec(bytes,"AES");
 }
}
