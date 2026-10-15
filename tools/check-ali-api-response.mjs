import assert from 'node:assert/strict';
import {readAliApiResponse} from '../runtime/ali-api-response.mjs';
let consumed=false,cancelled=false;
await assert.rejects(()=>readAliApiResponse({ok:false,status:429,body:{async cancel(){cancelled=true;}},async text(){consumed=true;}}),e=>e.statusCode===429 && /请稍后重试/.test(e.message));
assert.equal(cancelled,true);assert.equal(consumed,false);
await assert.rejects(()=>readAliApiResponse(new Response('private upstream content',{status:403})),e=>e.message==='阿里接口 HTTP 403');
const result=await readAliApiResponse(new Response('{"ok":true}'));
assert.equal(result.content,'{"ok":true}');
console.log('PASS Ali rate limit status and safe upstream errors');
