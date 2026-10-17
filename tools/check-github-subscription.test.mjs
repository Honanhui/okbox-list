import {test} from 'node:test';
import assert from 'node:assert/strict';
import {githubSubscription,downloadGithub,maskGithubSecrets} from '../runtime/github-subscription.mjs';
import {isCatNodeSubscription} from '../runtime/cat-node-client.mjs';
import {redact} from '../runtime/runtime-log.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
const address='github://github_pat_TEST_ONLY@github.com/Honanhui/private-cat/dist/index.js.md5?ref=release%2Fv1';
test('management config accepts and preserves private protocol',()=>{
 const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const start=source.indexOf('function normalizeConfig('),end=source.indexOf('\nfunction ',start+1);
 const context={isCatNodeSubscription,URL,createError:(_code,message)=>Error(message)};vm.createContext(context);
 vm.runInContext(source.slice(start,end),context);
 const result=context.normalizeConfig({configUrls:[{id:'fixture',url:address}]});
 assert.equal(result.configUrls[0].url,address);
 assert.throws(()=>context.normalizeConfig({configUrls:['github://***@github.com/a/b/file.js']}));
});
test('private repository, branch, checksum and companion script use authenticated raw API',async()=>{
 const calls=[];const fake=async(url,options)=>{calls.push({url:new URL(url),options});return new Response(new URL(url).pathname.endsWith('.md5')?'a'.repeat(32):'module.exports={};');};
 assert.equal(isCatNodeSubscription(address),true);
 assert.equal((await downloadGithub(address,128,fake)).length,32);
 const js=new URL(address);js.pathname=js.pathname.replace(/\.md5$/,'');await downloadGithub(js,1024,fake);
 assert.equal(calls[0].url.searchParams.get('ref'),'release/v1');
 assert.equal(calls[1].url.pathname,'/repos/Honanhui/private-cat/contents/dist/index.js');
 for(const call of calls){assert.equal(call.options.headers.Authorization,'Bearer github_pat_TEST_ONLY');assert.ok(!call.url.href.includes('TEST_ONLY'));}
});
test('default branch, validation and secret masking',()=>{
 assert.equal(githubSubscription(address.split('?')[0]).api.search,'');
 assert.equal(isCatNodeSubscription(address.replace('github.com','evil.example')),false);
 assert.equal(isCatNodeSubscription(address.replace('.js.md5','.json')),false);
 assert.ok(!maskGithubSecrets(address).includes('TEST_ONLY'));
 assert.ok(!JSON.stringify(redact({url:address,message:'failed '+address})).includes('TEST_ONLY'));
});
test('redirect never forwards token to raw host and rejects other hosts',async()=>{
 let count=0;await downloadGithub(address,128,async(url,options)=>{if(!count++)return new Response(null,{status:302,headers:{location:'https://raw.githubusercontent.com/owner/repo/main/index.js.md5'}});assert.equal(options.headers.Authorization,undefined);return new Response('a'.repeat(32));});
 await assert.rejects(downloadGithub(address,128,async()=>new Response(null,{status:302,headers:{location:'https://evil.example/x'}})),/重定向无效/);
});
test('errors explain permissions without exposing token; size is bounded',async()=>{
 for(const status of [401,403,404])await assert.rejects(downloadGithub(address,128,async()=>new Response('',{status})),error=>!error.message.includes('TEST_ONLY')&&/GitHub/.test(error.message));
 await assert.rejects(downloadGithub(address,2,async()=>new Response('oversize')),/过大/);
});
test('interrupted response body reports received bytes without credential details',async()=>{
 const body={async *[Symbol.asyncIterator](){yield Buffer.from('partial');throw Error('sensitive transport message');}};
 await assert.rejects(downloadGithub(address.replace('.md5',''),1024,async()=>({ok:true,status:200,body})),error=>/90秒上限，已接收7字节/.test(error.message)&&!error.message.includes('sensitive'));
});
