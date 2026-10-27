import {assertMediaTarget} from './media-forward.mjs';
import {setTimeout as delay} from 'node:timers/promises';

const redirects=new Set([301,302,303,307,308]);
function previewOrigin(url){
 return url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443')&&
  /^[a-z0-9-]+-video-preview\.aliyundrive\.net$/i.test(url.hostname);
}
function authorizedTarget(url){
 return url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443')&&
  url.hostname==='pdsapi.aliyundrive.com'&&url.pathname.startsWith('/v2/file/live_transcode_for_get/');
}

// Ali preview segments can redirect to an authenticated API instead of a CDN.
// Resolve each hop ourselves so the account header never follows a redirect to
// another origin/path, and is never part of the client playback response.
export function createAliPreviewFetch({fetcher,authorization,wait=(ms,signal)=>delay(ms,undefined,{signal}),now=Date.now}){
 const cooling=new Map();
 const pendingResponse=seconds=>Response.json({code:'VideoPreviewWaitAndRetry',message:'阿里转码分片正在生成，请稍后重试'},{status:503,headers:{'retry-after':String(seconds)}});
 return async function fetchPreview(value,options={}){
  let target=new URL(value);
  if(!previewOrigin(target)||!['GET','HEAD'].includes((options.method||'GET').toUpperCase()))return fetcher(value,options);
  options.signal?.throwIfAborted();
  const cacheKey=target.href,until=cooling.get(cacheKey);
  if(until>now())return pendingResponse(Math.max(1,Math.ceil((until-now())/1000)));
  cooling.delete(cacheKey);
  const baseHeaders=new Headers(options.headers);
  for(const key of ['authorization','proxy-authorization','cookie'])baseHeaders.delete(key);
  let accountHeader,pending=0;
  for(let hop=0;hop<6;hop++){
   options.signal?.throwIfAborted();
   assertMediaTarget(target.href);
   if(target.protocol!=='https:'||target.username||target.password)throw Error('阿里媒体跳转地址无效');
   const headers=new Headers(baseHeaders);
   if(authorizedTarget(target)){
    accountHeader??=await authorization();
    if(typeof accountHeader!=='string'||!/^Bearer [A-Za-z0-9._~+\/-]+=*$/.test(accountHeader))throw Error('阿里媒体授权格式无效');
    headers.set('authorization',accountHeader);
   }
   const response=await fetcher(target.href,{...options,headers,redirect:'manual'});
   const location=response.headers.get('location');
   if(response.status===202&&authorizedTarget(target)){
    // A successful account check can still leave a segment being generated.
    // Only the explicit provider hint permits a short, bounded wait.
    const chunks=[];let size=0;
    for await(const chunk of response.body||[]){size+=chunk.length;if(size>4096)throw Error('阿里转码状态响应过大');chunks.push(chunk);}
    const body=Buffer.concat(chunks),retry=response.headers.get('retry-after');let hint;
    try{hint=JSON.parse(body.toString());}catch{}
    const seconds=retry===null?3:/^\d+$/.test(retry)?Number(retry):Math.ceil((Date.parse(retry)-Date.now())/1000);
    if(hint?.code==='VideoPreviewWaitAndRetry'&&pending<3&&Number.isFinite(seconds)&&seconds>=0&&seconds<=10&&hop<5){
     pending++;await wait(Math.max(1,seconds)*1000,options.signal);continue;
    }
    if(hint?.code==='VideoPreviewWaitAndRetry'){
     const cooldown=Math.max(30,Number.isFinite(seconds)&&seconds>0?seconds:3);
     for(const [key,expires]of cooling)if(expires<=now())cooling.delete(key);
     if(cooling.size>=256)cooling.delete(cooling.keys().next().value);
     cooling.set(cacheKey,now()+cooldown*1000);
     return pendingResponse(cooldown);
    }
    return new Response(body,{status:202,headers:response.headers});
   }
   // Authentication failures and rate limits are terminal, without retries.
   if(!redirects.has(response.status)||!location)return response;
   await response.body?.cancel();
   target=new URL(location,target);
  }
  throw Error('阿里媒体跳转次数过多');
 };
}
