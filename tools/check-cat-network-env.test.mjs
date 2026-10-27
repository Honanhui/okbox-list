import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {catNetworkEnv} from '../runtime/cat-network-env.mjs';

test('Cat network inheritance is opt-in, bounded and keeps local control traffic direct',async()=>{
 assert.deepEqual(catNetworkEnv({ADMIN_TOKEN:'private'}),{});
 assert.deepEqual(catNetworkEnv({HTTP_PROXY:'file:///private',HTTPS_PROXY:'http://bad\r\nheader'}),{});
 const env=catNetworkEnv({HTTP_PROXY:'http://127.0.0.1:1',NO_PROXY:'.example.test',ADMIN_TOKEN:'private'});
 assert.equal(env.ADMIN_TOKEN,undefined);assert.equal(env.NODE_USE_ENV_PROXY,'1');
 assert.ok(env.NO_PROXY.includes('.example.test'));assert.ok(env.NO_PROXY.includes('127.0.0.1'));
 assert.equal(catNetworkEnv({HTTPS_PROXY:'http://127.0.0.1:1',NODE_USE_ENV_PROXY:'0'}).NODE_USE_ENV_PROXY,'0');
 assert.equal(catNetworkEnv({OUTBOUND_PROXY:'http://127.0.0.1:2'}).HTTPS_PROXY,'http://127.0.0.1:2');
 assert.equal(catNetworkEnv({},'http://127.0.0.1:3').HTTP_PROXY,'http://127.0.0.1:3');
 let proxied=0,direct=0;
 const tunnels=new Set();
 const target=http.createServer((req,res)=>res.end('proxied'));
 await new Promise(r=>target.listen(0,'127.0.0.1',r));
 const proxy=http.createServer((req,res)=>{assert.equal(new URL(req.url).hostname,'cat-network-test.invalid');proxied++;res.end('proxied');});
 proxy.on('connect',(req,socket,head)=>{assert.equal(req.url,'cat-network-test.invalid:80');proxied++;const upstream=net.connect(target.address().port,'127.0.0.1',()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);});for(const s of [socket,upstream]){tunnels.add(s);s.on('close',()=>tunnels.delete(s));s.on('error',()=>{socket.destroy();upstream.destroy();});}});
 const local=http.createServer((req,res)=>{direct++;res.end('direct');});
 await new Promise(r=>proxy.listen(0,'127.0.0.1',r));await new Promise(r=>local.listen(0,'127.0.0.1',r));
 try{
  const code=`const a=await(await fetch('http://cat-network-test.invalid/')).text();const b=await(await fetch('http://127.0.0.1:${local.address().port}/')).text();if(a!=='proxied'||b!=='direct')process.exitCode=1;`;
  const child=spawn(process.execPath,['--input-type=module','-e',code],{env:{PATH:process.env.PATH,...catNetworkEnv({HTTP_PROXY:'http://127.0.0.1:'+proxy.address().port})},stdio:['ignore','ignore','pipe'],windowsHide:true});
  let stderr='';child.stderr.on('data',x=>stderr+=x);const timer=setTimeout(()=>child.kill(),15000);
  try{const exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});assert.equal(exit,0,stderr);}finally{clearTimeout(timer);}
  assert.equal(proxied,1);assert.equal(direct,1);
 }finally{for(const socket of tunnels)socket.destroy();await Promise.all([new Promise(r=>proxy.close(r)),new Promise(r=>local.close(r)),new Promise(r=>target.close(r))]);}
});
