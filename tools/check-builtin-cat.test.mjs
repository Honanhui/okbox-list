import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import{serveBuiltinCat}from '../runtime/builtin-cat.mjs';
test('Built-in Cat is loopback-only, optional, and serves the exact compiled bytes and matching hash',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'builtin-cat-'));const dir=path.join(root,'builtin','wanger');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'index.js'),'fixture-code');
 const run=async(address,url,method='GET')=>{const result={};await serveBuiltinCat({method,socket:{remoteAddress:address}},{writeHead:(status,headers)=>Object.assign(result,{status,headers}),end:body=>result.body=body},url,root);return result;};
 assert.equal((await run('192.168.1.2','/builtin/wanger/index.js')).status,403);assert.equal((await run('127.0.0.1','/builtin/../../secret')).status,404);assert.equal((await run('127.0.0.1','/builtin/wanger/index.js','POST')).status,405);
 assert.equal((await run('127.0.0.1','/builtin/wanger/index.js')).body.toString(),'fixture-code');assert.equal((await run('127.0.0.1','/builtin/wanger/index.js.md5')).body.toString(),crypto.createHash('md5').update('fixture-code').digest('hex'));
 await fs.unlink(path.join(dir,'index.js'));assert.equal((await run('127.0.0.1','/builtin/wanger/index.js')).status,404);await fs.rmdir(dir);await fs.rmdir(path.dirname(dir));await fs.rmdir(root);
});
