import assert from 'node:assert/strict';
import {createCatAccountSync} from '../runtime/cat-account-sync.mjs';
let secret={quark:{cookie:'synthetic-test-cookie'}},calls=[];
const sync=createCatAccountSync({baseUrl:'http://cat-node:9988/config',credentials:async id=>secret[id]||{},fetcher:async(url,options)=>{calls.push({path:new URL(url).pathname,...options});return Response.json({code:0,state:options.method==='POST'?(Object.keys(JSON.parse(options.body).secret).length?'synced':'cleared'):undefined});}});
await sync();assert.equal(calls.filter(c=>c.method==='PUT').length,1);assert.equal(calls.find(c=>c.method==='PUT').path,'/website/api/credential/quark/cookie');
const count=calls.length;await sync();assert.equal(calls.length,count);
secret={};await sync();assert.equal(calls.at(-1).method,'DELETE');assert.equal(calls.at(-1).path,'/website/api/credential/quark/cookie');
assert(calls.every(c=>!new URL(c.path,'http://cat-node:9988').search));
console.log('Cat account sync: synthetic credential, deduplication and deletion passed');

secret={pan123:{username:'synthetic-account',password:'synthetic-password'},tianyi:{username:'synthetic-phone',password:'synthetic-pass'}};await sync();const pan123Call=calls.findLast(c=>c.path==='/__okbox/credential'&&JSON.parse(c.body).provider==='pan123');assert.equal(JSON.parse(pan123Call.body).secret.username,'synthetic-account');assert.equal(calls.some(c=>c.path==='/website/api/pan189/account'&&c.method==='PUT'),false);assert.ok(calls.some(c=>c.path==='/website/api/pan189/account'&&c.method==='DELETE')); 
console.log('PASS: 123 and Tianyi account field mapping');

const cached=await sync();assert.ok(cached.some(x=>x.provider==='pan123'&&x.state==='synced'));
const unsupported=createCatAccountSync({baseUrl:'http://cat-node:9988/',credentials:async()=>({cookie:'synthetic'}),fetcher:async()=>new Response('',{status:404})});assert.ok((await unsupported()).every(x=>x.state==='unsupported'));assert.ok((await unsupported()).every(x=>x.state==='unsupported'));console.log('PASS: cached sync status and unsupported endpoints remain visible');
