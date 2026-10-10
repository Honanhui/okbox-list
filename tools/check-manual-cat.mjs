import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const folder=process.env.CAT_TEST_DIR||path.resolve('../.analysis/manual-cat-test-'+Date.now());await fs.mkdir(folder,{recursive:true});
const scripts=new Map(['one','two'].map(name=>[name,Buffer.from(`const http=require('http');http.createServer((q,s)=>{s.setHeader('content-type','application/json');s.end(JSON.stringify(q.url==='/config'?{video:{sites:[{key:'${name}',name:'${name}',api:'/spider/${name}/1'},{key:'nodejs_baseset',name:'配置中心',api:'/spider/nodejs_baseset/1'},{key:'nodejs_mypan',name:'我的网盘',api:'/spider/nodejs_mypan/1'}]}}:{list:[{vod_id:'${name}',vod_name:'${name}'}]}));}).listen(process.env.PORT,'127.0.0.1');`)]));
if(process.env.CAT_REAL_SCRIPT)scripts.set('real',await fs.readFile(process.env.CAT_REAL_SCRIPT));
let authSeen=0;const upstream=http.createServer((q,s)=>{if(q.headers.authorization!=='Basic '+Buffer.from('test:pass').toString('base64')){s.writeHead(401);s.end();return;}authSeen++;const name=q.url.split('/')[1].split('.')[0],script=scripts.get(name);if(!script){s.writeHead(404);s.end();return;}s.end(q.url.endsWith('.md5')?crypto.createHash('md5').update(script).digest('hex'):script);});
await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
const probe=http.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
let bridge;
const child=spawn(process.execPath,['runtime/cat-node-loader.mjs'],{env:{...process.env,PORT:String(port),CAT_DATA_DIR:folder},stdio:['ignore','pipe','pipe']});let logs='';child.stderr.on('data',x=>logs+=x);
const base='http://127.0.0.1:'+port;process.env.CAT_NODE_URL=base;
try{
 for(let i=0;i<80;i++){try{if((await fetch(base+'/health')).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 const {catNodeCatalog,catNodeRequest,isCatNodeSubscription}=await import('../runtime/cat-node-client.mjs');
 assert.equal(isCatNodeSubscription('https://arbitrary.example/custom.js.md5'),true);assert.equal(isCatNodeSubscription('https://arbitrary.example/config.json'),false);
 const url=name=>`http://test:pass@127.0.0.1:${upstream.address().port}/${name}.js.md5`;
 const one=await catNodeCatalog(fetch,null,url('one')),two=await catNodeCatalog(fetch,null,url('two'));assert.equal(one.length,1);assert.equal(two.length,1);assert.notEqual(one[0].runtimeBase,two[0].runtimeBase);
 assert.equal((await catNodeRequest(one[0],{action:'home'},fetch)).list[0].vod_id,'one');assert.equal((await catNodeRequest(two[0],{action:'home'},fetch)).list[0].vod_id,'two');
 await catNodeCatalog(fetch,null,url('one'));assert.equal((await catNodeRequest(two[0],{action:'home'},fetch)).list[0].vod_id,'two');
 await assert.rejects(()=>catNodeCatalog(fetch,null,'https://example.com/a.json'),/不支持 JSON/);assert.ok(authSeen>=5);assert.ok(!logs.includes('test:pass'));
 if(scripts.has('real')){const real=await catNodeCatalog(fetch,null,url('real'));assert.ok(real.length>0);for(const provider of ['pan123','guangya','mobile139','thunder','aliyun']){const reply=await fetch(real[0].runtimeBase+'/__okbox/credential',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({provider,secret:{}})});assert.equal(reply.status,200);assert.equal((await reply.json()).state,'cleared');}const site=real.find(x=>x.key==='libvio');if(site){const home=await catNodeRequest(site,{action:'home'},fetch);assert.ok(Array.isArray(home.list));}console.log('Real Cat programme catalogue:',real.length);}
 const bridgeProbe=http.createServer();await new Promise(resolve=>bridgeProbe.listen(0,'127.0.0.1',resolve));const bridgePort=bridgeProbe.address().port;await new Promise(resolve=>bridgeProbe.close(resolve));
 bridge=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(bridgePort),HOST:'127.0.0.1',CONFIG_PATH:folder+'/bridge/config.json',ADMIN_TOKEN:''},stdio:'ignore'});
 const bridgeBase='http://127.0.0.1:'+bridgePort;
 for(let i=0;i<80;i++){try{if((await fetch(bridgeBase+'/health')).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 const call=async(body)=>{const response=await fetch(bridgeBase+'/api/subscriptions',{method:body?'POST':'GET',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};};
 assert.equal((await (await fetch(bridgeBase+'/health')).json()).version,'0.1');assert.equal((await call()).data.sources.length,0);
 assert.equal((await call({action:'save',url:'http://example.com/config.json'})).status,400);
 for(const name of ['one','two']){assert.equal((await call({action:'save',id:name,name,url:url(name)})).status,200);for(let i=0;i<80;i++){const item=(await call()).data.sources.find(x=>x.id===name);if(item?.state==='ready')break;if(item?.error)throw Error(item.error);await new Promise(resolve=>setTimeout(resolve,100));}}
 for(const id of ['two','one']){assert.equal((await call({action:'select',id})).status,200);const sources=await (await fetch(bridgeBase+'/api/sources')).json();assert.equal(sources.sites.length,1);assert.equal(sources.sites[0].name,id);}
 console.log('PASS: arbitrary Cat URLs, Basic authentication, checksum, independent catalogues, switching, JSON rejection, empty installation, management API, version 0.1');
}finally{if(bridge){bridge.kill('SIGTERM');await new Promise(resolve=>bridge.once('exit',resolve));}child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));await new Promise(resolve=>upstream.close(resolve));}
