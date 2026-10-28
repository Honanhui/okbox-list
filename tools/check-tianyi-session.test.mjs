import {test} from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {checkTianyiSession} from '../runtime/tianyi-session-check.mjs';
test('Cookie-only checks send zero official requests and do not falsely pass',async()=>{
 let calls=0;for(const input of ['JSESSIONID=fixture; COOKIE_LOGIN_USER=fixture',{cookie:'JSESSIONID=fixture; COOKIE_LOGIN_USER=fixture'}]){
  const result=await checkTianyiSession(input,async()=>{calls++;throw Error('forbidden network');});assert.equal(result.state,'pending');assert.equal(result.networkRequested,false);assert.notEqual(result.requiresLogin,true);
 }assert.equal(calls,0);
});
test('existing token makes one signed request without Cookie or SSO',async()=>{
 let calls=0;const result=await checkTianyiSession({cookie:'must-not-send',access_token:'fixture-private-token'},async(url,options)=>{
  calls++;assert.equal(url,'https://api.cloud.189.cn/open/file/listFiles.action?folderId=-11&pageNum=1&pageSize=1');assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');assert.equal(options.headers.Cookie,undefined);assert.equal(options.body,undefined);
  assert.equal(options.headers.signature,createHash('md5').update('AccessToken=fixture-private-token&Timestamp='+options.headers.timestamp+'&folderId=-11&pageNum=1&pageSize=1').digest('hex'));
  return Response.json({res_code:0,fileListAO:{}});
 });assert.equal(calls,1);assert.equal(result.state,'valid');assert.ok(!JSON.stringify(result).includes('fixture-private-token'));
});
test('missing credentials, errors and redirects never perform fallback login',async()=>{
 const missing=await checkTianyiSession({},()=>{throw Error('no network');});assert.equal(missing.state,'invalid');assert.equal(missing.networkRequested,false);
 for(const fetcher of [async()=>new Response(null,{status:302}),async()=>{throw new DOMException('timeout','TimeoutError')},async()=>new Response('<html>'),async()=>Response.json({res_code:0})]){
  const result=await checkTianyiSession({access_token:'fixture'},fetcher);assert.equal(result.state,'invalid');assert.notEqual(result.requiresLogin,true);
 }
});