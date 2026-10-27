import assert from 'node:assert/strict';
import {createCatAccountSync} from '../runtime/cat-account-sync.mjs';
let instanceId='first',secrets={aliyun:{refresh_token:'synthetic'}},calls=[];
const sync=createCatAccountSync({baseUrl:'http://127.0.0.1:9988/',credentials:async p=>secrets[p]||{},fetcher:async(url,options)=>{if(new URL(url).pathname.endsWith('capabilities'))return Response.json({credentialMode:'tvbox-list',instanceId});const body=JSON.parse(options.body);calls.push(body);return Response.json({code:0,state:Object.keys(body.secret).length?'synced':'cleared'});}});
await sync();assert.equal(calls.length,4);assert.equal(calls.find(x=>x.provider==='aliyun').secret.refresh_token,'synthetic');await sync();assert.equal(calls.length,4);
instanceId='restarted';await sync();assert.equal(calls.length,8);secrets={};await sync();assert.equal(calls.length,9);assert.deepEqual(calls.at(-1).secret,{});
console.log('PASS: native Node credentials, deduplication, restart resync and deletion');

const requested=[],forwarded=[];
const tianyiSync=createCatAccountSync({baseUrl:'http://127.0.0.1:9988/',credentials:async provider=>{requested.push(provider);return provider==='tianyi'?{username:'synthetic-account',password:'synthetic-password'}:{};},fetcher:async(url,options)=>{if(new URL(url).pathname.endsWith('capabilities'))return Response.json({credentialMode:'tvbox-list',instanceId:'with-tianyi',providers:['quark','uc','baidu','aliyun','tianyi','unknown-provider']});forwarded.push(JSON.parse(options.body));return Response.json({code:0,state:'synced'});}});
await tianyiSync();assert.equal(forwarded.length,5);assert.equal(requested.includes('unknown-provider'),false);assert.deepEqual(forwarded.find(x=>x.provider==='tianyi').secret,{username:'synthetic-account',password:'synthetic-password'});await tianyiSync();assert.equal(forwarded.length,5);
console.log('PASS: Tianyi opt-in capability, unknown-provider rejection and deduplication');
