package com.okbox.cloud;
final class Base64 {
 static final int DEFAULT=0, NO_WRAP=2;
 static String encodeToString(byte[] b,int flags){return java.util.Base64.getEncoder().encodeToString(b);}
 static byte[] decode(String s,int flags){return java.util.Base64.getDecoder().decode(s.replaceAll("\\s",""));}
 static byte[] decode(byte[] b,int flags){return decode(new String(b,java.nio.charset.StandardCharsets.US_ASCII),flags);}
}
