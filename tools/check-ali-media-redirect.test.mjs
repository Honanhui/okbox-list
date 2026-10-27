import test from 'node:test';
import assert from 'node:assert/strict';
import {createAliPreviewFetch} from '../runtime/ali-media-redirect.mjs';

const cdn='https://cn-beijing-video-preview.aliyundrive.net/fixture/SD/media-1.ts?signature=fixture';
const api='https://pdsapi.aliyundrive.com/v2/file/live_transcode_for_get/fixture/SD/media-1.ts';
const fixtureAuthorization='Bearer fixture-access';
const redirect=location=>new Response(null,{status:302,headers:{location}});

test('Ali API authorization is scoped to the exact official redirect, never CDN hops',async()=>{
 const calls=[];let reads=0;
 const fetch=createAliPreviewFetch({authorization:async()=>{reads++;return fixtureAuthorization;},fetcher:async(url,options)=>{
  calls.push({url,options});
  if(calls.length===1)return redirect(api);
  if(calls.length===2)return redirect('https://media.example/fixture.ts');
  return new Response('fixture media');
 }});
 const signal=new AbortController().signal;
 const response=await fetch(cdn,{headers:{Range:'bytes=0-1023',Referer:'https://www.alipan.com/',Cookie:'fixture-cookie',Authorization:'Bearer old-fixture'},signal});
 assert.equal(await response.text(),'fixture media');assert.equal(reads,1);
 assert.equal(calls[0].options.headers.get('authorization'),null);
 assert.equal(calls[1].options.headers.get('authorization'),fixtureAuthorization);
 assert.equal(calls[2].options.headers.get('authorization'),null);
 for(const call of calls){assert.equal(call.options.redirect,'manual');assert.equal(call.options.headers.get('cookie'),null);assert.equal(call.options.headers.get('range'),'bytes=0-1023');assert.equal(call.options.signal,signal);}
});

test('Lookalike hosts, other API paths and ports never receive account authorization',async()=>{
 for(const destination of [api.replace('pdsapi.aliyundrive.com','pdsapi.aliyundrive.com.example'),api.replace('/v2/file/live_transcode_for_get/','/v2/account/'),api.replace('pdsapi.aliyundrive.com','pdsapi.aliyundrive.com:8443')]){
  let count=0,reads=0;
  const fetch=createAliPreviewFetch({authorization:async()=>{reads++;throw Error('must not read credentials');},fetcher:async(_url,options)=>{count++;assert.equal(options.headers.get('authorization'),null);return count===1?redirect(destination):new Response('fixture');}});
  await fetch(cdn);assert.equal(reads,0);
 }
 let calls=0;
 const fetch=createAliPreviewFetch({authorization:async()=>fixtureAuthorization,fetcher:async()=>{calls++;return redirect(api.replace('https:','http:'));}});
 await assert.rejects(fetch(cdn),/跳转地址无效/);assert.equal(calls,1);
});

test('Unauthorized/forbidden/rate-limited responses are returned without a second attempt',async()=>{
 for(const status of [401,403,429]){
  let count=0,reads=0;
  const fetch=createAliPreviewFetch({authorization:async()=>{reads++;return fixtureAuthorization;},fetcher:async()=>++count===1?redirect(api):new Response('fixture failure',{status})});
  assert.equal((await fetch(cdn)).status,status);assert.equal(count,2);assert.equal(reads,1);
 }
});

test('Only the official pending-transcode hint permits bounded waits, respecting Retry-After',async()=>{
 let calls=0;const waits=[];
 const fetch=createAliPreviewFetch({authorization:async()=>fixtureAuthorization,wait:async ms=>waits.push(ms),fetcher:async()=>{
  calls++;if(calls===1)return redirect(api);
  if(calls<4)return Response.json({code:'VideoPreviewWaitAndRetry'},{status:202,headers:{'retry-after':'2'}});
  return new Response('fixture transport stream');
 }});
 assert.equal(await (await fetch(cdn)).text(),'fixture transport stream');assert.deepEqual(waits,[2000,2000]);
 for(const [code,retry]of [['AnotherProviderState','1'],['VideoPreviewWaitAndRetry','60']]){
  let count=0;
  const noRetry=createAliPreviewFetch({authorization:async()=>fixtureAuthorization,wait:async()=>assert.fail('unexpected wait'),fetcher:async()=>++count===1?redirect(api):Response.json({code},{status:202,headers:{'retry-after':retry}})});
  const response=await noRetry(cdn);
  assert.equal(response.status,code==='VideoPreviewWaitAndRetry'?503:202);assert.equal(count,2);
  if(code==='VideoPreviewWaitAndRetry')assert.equal(response.headers.get('retry-after'),'60');
 }
 let count=0,waitCount=0;
 const bounded=createAliPreviewFetch({authorization:async()=>fixtureAuthorization,wait:async()=>waitCount++,fetcher:async()=>++count===1?redirect(api):Response.json({code:'VideoPreviewWaitAndRetry'},{status:202})});
 const result=await bounded(cdn);assert.equal(result.status,503);assert.equal((await result.json()).code,'VideoPreviewWaitAndRetry');assert.equal(waitCount,3);assert.equal(count,5);
});

test('Authorization is removed even when a redirect stays on the same host but leaves the media API path',async()=>{
 const seen=[];
 const fetch=createAliPreviewFetch({authorization:async()=>fixtureAuthorization,fetcher:async(url,options)=>{
  seen.push(options.headers.get('authorization'));
  if(seen.length===1)return redirect(api);
  if(seen.length===2)return redirect('https://pdsapi.aliyundrive.com/another/path');
  return new Response('fixture');
 }});
 await fetch(cdn);assert.deepEqual(seen,[null,fixtureAuthorization,null]);
});

test('Repeated player requests do not restart polling while a segment remains pending',async()=>{
 let clock=1000,calls=0,ready=false;
 const fetch=createAliPreviewFetch({now:()=>clock,wait:async()=>{},authorization:async()=>fixtureAuthorization,fetcher:async url=>{
  calls++;
  if(url===cdn)return redirect(api);
  return ready?new Response('video'):Response.json({code:'VideoPreviewWaitAndRetry'},{status:202});
 }});
 assert.equal((await fetch(cdn)).headers.get('retry-after'),'30');
 const initial=calls;
 clock+=1000;
 assert.equal((await fetch(cdn)).status,503);assert.equal(calls,initial);
 const controller=new AbortController();controller.abort();
 await assert.rejects(fetch(cdn,{signal:controller.signal}));assert.equal(calls,initial);
 clock+=30000;ready=true;
 assert.equal(await (await fetch(cdn)).text(),'video');assert.equal(calls,initial+2);
});

test('Unrelated media and direct API URLs cannot opt into the Ali account authorization',async()=>{
 for(const url of ['https://media.example/clip.m3u8',api,cdn.replace('aliyundrive.net','aliyundrive.net.example')]){
  const options={redirect:'follow',headers:{Range:'bytes=0-1'}};
  const fetch=createAliPreviewFetch({authorization:async()=>{throw Error('must not read credentials');},fetcher:async(target,actual)=>{assert.equal(target,url);assert.equal(actual,options);return new Response('fixture');}});
  await fetch(url,options);
 }
});

test('Redirect count is bounded, aborts and malformed authorization do not leak credentials',async()=>{
 let calls=0;const fetch=createAliPreviewFetch({authorization:async()=>fixtureAuthorization,fetcher:async()=>{calls++;return redirect(cdn);}});
 await assert.rejects(fetch(cdn),/跳转次数过多/);assert.equal(calls,6);
 const controller=new AbortController();controller.abort();
 await assert.rejects(fetch(cdn,{signal:controller.signal}));assert.equal(calls,6);
 let count=0;
 const invalid=createAliPreviewFetch({authorization:async()=>'Bearer fixture\r\nInjected: fixture',fetcher:async()=>{count++;return redirect(api);}});
 await assert.rejects(invalid(cdn),/^Error: 阿里媒体授权格式无效$/);assert.equal(count,1);
});
