import test from 'node:test';import assert from 'node:assert/strict';import {ucCatCredentials} from '../runtime/uc-tv-credentials.mjs';
test('TV authorization augments native UC credentials without replacing web login',async()=>{
 const result=await ucCatCredentials(async p=>p==='uc'?{cookie:'web-fixture',token:'old-token'}:{token:'tv-fixture',refresh_token:'refresh-fixture'});
 assert.equal(result.cookie,'web-fixture');assert.equal(result.token,'tv-fixture');assert.equal(result.refreshtoken,'refresh-fixture');
 assert.deepEqual(await ucCatCredentials(async p=>p==='uc'?{cookie:'web-fixture'}:{}),{cookie:'web-fixture'});
});
