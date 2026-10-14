import http from 'node:http';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {writeRequestError} from '../runtime/http-error-response.mjs';
let normalErrors=0,partialErrors=0;
function json(res,status,value){res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));}
const server=http.createServer((req,res)=>{
  (async()=>{
    if(req.url==='/health')return json(res,200,{ok:true});
    if(req.url==='/failure')throw Error('normal failure');
    res.writeHead(200,{'content-type':'video/mp2t','content-length':1048576});
    if(req.url==='/upstream-cut'){
      await pipeline(Readable.from((async function*(){yield Buffer.alloc(1024);throw Error('upstream interrupted');})()),res);
    }else{
      await pipeline(Readable.from((async function*(){for(let i=0;i<1024;i++){yield Buffer.alloc(1024);await new Promise(r=>setTimeout(r,2));}})()),res);
    }
  })().catch(e=>{if(res.headersSent)partialErrors++;else normalErrors++;writeRequestError(res,500,e.message,json);});
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
try{
  for(let i=0;i<4;i++){
    await new Promise((resolve,reject)=>{const req=http.get(base+'/media',r=>r.once('data',()=>{r.destroy();resolve();}));req.on('error',reject);});
  }
  await new Promise(resolve=>{const req=http.get(base+'/upstream-cut',r=>{r.resume();r.on('error',resolve);r.on('close',resolve);});req.on('error',resolve);});
  await new Promise(r=>setTimeout(r,50));
  assert(partialErrors>=5);
  assert.equal((await(await fetch(base+'/health')).json()).ok,true);
  const failure=await fetch(base+'/failure');assert.equal(failure.status,500);assert.equal((await failure.json()).message,'normal failure');assert.equal(normalErrors,1);
  console.log('PASS: seek/engine disconnects and upstream interruption cannot double-send headers; health remains available; normal errors retain JSON');
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
