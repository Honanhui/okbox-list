import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
const folder=await fs.mkdtemp(path.join(os.tmpdir(),'okbox-legacy-cache-'));
const probe=http.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const entries=[{id:'old-json',url:'http://127.0.0.1:1/config.json',enabled:true},{id:'cat-url-old-http',url:'http://127.0.0.1:1/index.js.md5',enabled:true}];
await fs.writeFile(path.join(folder,'config.json'),JSON.stringify({configUrls:entries,activeId:'old-json'}));
await fs.writeFile(path.join(folder,'catalog-cache.json'),JSON.stringify(Object.fromEntries(entries.map(item=>[item.id,{url:item.url,sites:[{key:item.id+':legacy',name:'Legacy HTTP',configId:item.id,runtime:'http',api:'http://127.0.0.1:1/vod',type:1}]}]))));
const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',CONFIG_PATH:path.join(folder,'config.json'),CAT_NODE_URL:'',ADMIN_TOKEN:''},stdio:'ignore'});
try{
 let ready=false;for(let i=0;i<80;i++){try{ready=(await fetch(`http://127.0.0.1:${port}/health`)).ok;}catch{}if(ready)break;await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(ready);
 const base=`http://127.0.0.1:${port}`;
 const sources=await (await fetch(base+'/api/sources')).json();assert.equal(sources.sites.length,0);
 const warehouse=await (await fetch(base+'/sub/old-json.json')).json();assert.equal(warehouse.sites.length,0);
 assert.equal((await fetch(base+'/sub/all.json')).status,400);
 console.log('PASS: old JSON/HTTP caches cannot restore legacy sites; merged warehouse rejected; server stays available');
}finally{const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;await fs.rm(folder,{recursive:true,force:true});}
