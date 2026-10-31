import test from 'node:test';import assert from 'node:assert/strict';import{createCatAccountSync}from '../runtime/cat-account-sync.mjs';
test('Native 123 credentials require explicit capability and contain only existing token and login device ID',async()=>{
 let supported=true,instance='one',secret={token:'fixture-token',loginuuid:'fixture-id',username:'do-not-send',password:'do-not-send'},calls=[];
 const sync=createCatAccountSync({baseUrl:'http://127.0.0.1:9988/',credentials:async provider=>provider==='pan123'?secret:{},fetcher:async(url,opts={})=>{
  if(new URL(url).pathname==='/__okbox/capabilities')return Response.json({credentialMode:'tvbox-list',instanceId:instance,providers:supported?['pan123']:[]});
  const body=JSON.parse(opts.body);calls.push(body);return Response.json({code:0,state:Object.keys(body.secret).length?'synced':'cleared'});
 }});
 await sync();let entries=calls.filter(x=>x.provider==='pan123');assert.equal(entries.length,1);assert.deepEqual(entries[0].secret,{token:'fixture-token',loginuuid:'fixture-id'});
 await sync();assert.equal(calls.filter(x=>x.provider==='pan123').length,1);
 secret={};await sync();assert.deepEqual(calls.filter(x=>x.provider==='pan123').at(-1).secret,{});
 supported=false;instance='two';await sync();assert.equal(calls.filter(x=>x.provider==='pan123').length,2);
});
test('Community Cookie is capability gated, separate from drive token, and cleared on disable',async()=>{
 let cookie='bbs_sid=fixture';const sent=[];
 const sync=createCatAccountSync({baseUrl:'http://127.0.0.1:9988/',credentials:async p=>p==='pan123community'?{cookie,password:'never-send'}:{},fetcher:async(url,opts={})=>{
  if(new URL(url).pathname==='/__okbox/capabilities')return Response.json({credentialMode:'tvbox-list',instanceId:'one',providers:['pan123community']});
  const body=JSON.parse(opts.body);sent.push(body);return Response.json({code:0,state:Object.keys(body.secret).length?'synced':'cleared'});
 }});await sync();assert.deepEqual(sent.find(x=>x.provider==='pan123community').secret,{cookie});assert.ok(sent.filter(x=>x.provider!=='pan123community').every(x=>!x.secret.cookie));cookie='';await sync();assert.deepEqual(sent.filter(x=>x.provider==='pan123community').at(-1).secret,{});
});
