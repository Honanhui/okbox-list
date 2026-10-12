import crypto from 'node:crypto';

export const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
export function httpUrl(value,base){const url=new URL(value,base);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('无效的 HTTP 地址');return url.href;}
export function aesDecrypt(value,key){const d=crypto.createDecipheriv('aes-128-cbc',Buffer.from(key),Buffer.from(key));return Buffer.concat([d.update(Buffer.from(value,'base64')),d.final()]).toString('utf8');}
export function aesEncrypt(value,key){const d=crypto.createCipheriv('aes-128-cbc',Buffer.from(key),Buffer.from(key));return Buffer.concat([d.update(value,'utf8'),d.final()]).toString('base64');}
export function clean(value){return String(value??'').replace(/[$#]/g,' ').trim();}
export function encodeEpisode(value){return 'okbox:'+Buffer.from(JSON.stringify(value)).toString('base64url');}
export function decodeEpisode(value){if(!String(value).startsWith('okbox:'))throw new Error('无效的集数标识');return JSON.parse(Buffer.from(value.slice(6),'base64url').toString('utf8'));}
export function createRequest(){
 const cookies=new Map();
 return async function request(value,options={}){
  let target=httpUrl(value);const original=new URL(target).origin;
  for(let hop=0;hop<5;hop++){
   const url=new URL(target),jar=cookies.get(url.origin)||new Map();
   const headers={'user-agent':UA,...Object.fromEntries(Object.entries(options.headers||{}).map(([k,v])=>[k.toLowerCase(),v]))};
   if(jar.size){const merged=new Map(String(headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)];}));for(const[k,v]of jar)merged.set(k,v);headers.cookie=[...merged].map(([k,v])=>k+'='+v).join('; ');}
   if(url.origin!==original){delete headers.authorization;delete headers.cookie;}
   let response;try{response=await fetch(target,{...options,headers,redirect:'manual',signal:options.signal||AbortSignal.timeout(15000)});}catch(error){const code=error.cause?.code;if(['CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID','UNABLE_TO_VERIFY_LEAF_SIGNATURE','DEPTH_ZERO_SELF_SIGNED_CERT'].includes(code))throw new Error('源站 HTTPS 证书验证失败：'+code);throw error;}
   for(const raw of response.headers.getSetCookie()){const first=raw.split(';')[0],index=first.indexOf('=');if(index>0)jar.set(first.slice(0,index),first.slice(index+1));}cookies.set(url.origin,jar);
   if([301,302,303,307,308].includes(response.status)){target=httpUrl(response.headers.get('location'),target);await response.body?.cancel();continue;}
   const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>8*1024*1024)throw new Error('源站响应过大');chunks.push(chunk);}
   if(!response.ok)throw new Error('源站 HTTP '+response.status);
   return {content:Buffer.concat(chunks).toString('utf8'),url:response.url,headers:response.headers};
  }throw new Error('源站重定向次数过多');
 };
}
