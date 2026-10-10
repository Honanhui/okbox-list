import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {applyCatCredential} from '../runtime/cat-credential-hook.mjs';
import {instrumentCat} from '../runtime/cat-instrument.mjs';
const entries=new Map([['/settings/theme','keep'],['/cache/video','keep']]);let notifications=0;
const thunderConfig={clientId:'original',authVersion:'native',packageName:'native.app',clientSecret:'original'};
const context={db:{set:async(k,v)=>entries.set(k,v),notifyChange:async()=>notifications++},thunderConfig};
await applyCatCredential(context,{provider:'pan123',secret:{token:'synthetic-jwt'}});assert.equal(entries.get('/pan/pan123/auth'),'synthetic-jwt');
await applyCatCredential(context,{provider:'guangya',secret:{access_token:'synthetic-access',refresh_token:'synthetic-refresh'}});assert.equal(JSON.parse(entries.get('/pan/guangya/token')).token_type,'Bearer');
await applyCatCredential(context,{provider:'mobile139',secret:{account:'synthetic-user',auth_token:'synthetic-token',userDomainId:'synthetic-domain'}});const mobile=JSON.parse(entries.get('/pan/new139/session'));assert.equal(mobile.headers['x-yun-uni'],'synthetic-domain');assert.equal(Buffer.from(mobile.headers.Authorization.slice(6),'base64').toString(),'mobile:synthetic-user:synthetic-token');
await assert.rejects(()=>applyCatCredential(context,{provider:'mobile139',secret:{account:'synthetic-user',auth_token:'synthetic-token'}}),/用户域ID/);
await applyCatCredential(context,{provider:'thunder',secret:{access_token:'synthetic-access',refresh_token:'synthetic-refresh',oauth_client_id:'actual-client',device_id:'actual-device'}});assert.equal(thunderConfig.clientId,'actual-client');assert.equal(thunderConfig.clientSecret,undefined);assert.equal(JSON.parse(entries.get('/pan/thunder/config')).authClientId,'actual-client');
assert.equal((await applyCatCredential(context,{provider:'aliyun',secret:{refreshToken:'synthetic-refresh'}})).state,'stored');
for(const provider of ['pan123','guangya','mobile139','thunder','aliyun'])assert.equal((await applyCatCredential(context,{provider,secret:{}})).state,'cleared');
assert.equal(entries.get('/settings/theme'),'keep');assert.equal(entries.get('/cache/video'),'keep');assert.equal(entries.get('/pan/pan123/auth'),'');assert.equal(entries.get('/pan/new139/session'),'');
await assert.rejects(()=>applyCatCredential(context,{provider:'arbitrary',secret:{}}),/不支持/);
const known=await fs.readFile(new URL('../../.analysis/cat-structure-20261008/index.js',import.meta.url),'utf8').catch(()=>null);if(known){const patched=instrumentCat(known);assert.equal(patched.enabled,true);assert.ok(patched.source.includes('/__okbox/credential'));assert.ok(patched.source.includes('this.token=""'));assert.ok(patched.source.includes('bucket.auth'));}
assert.equal(instrumentCat('console.log("ordinary source")').enabled,false);
console.log('PASS: five provider formats, strict Mobile domain, Thunder client binding, deletion, unrelated data retained, known/unknown Cat instrumentation');
