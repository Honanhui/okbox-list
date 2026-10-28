import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const start=source.indexOf('async function bridgeTvboxSpider('),end=source.indexOf('\nasync function bridgeSpider(',start);
assert.ok(start>0&&end>start);
function fixture(overrides={}){
 const events=[];let release;const pending=new Promise(resolve=>release=resolve);
 const context={isDockerExecutableTvboxSite:()=>true,isDj92Site:()=>false,aliShare:()=>false,createError:(status,message)=>Object.assign(Error(message),{status}),pendingAccountSync:pending,syncCatAccounts:async base=>events.push(['sync',base]),catNodeRequest:async(site,request)=>{events.push(['request',request.action]);return{list:[]}},remoteFetch(){},tvboxResult:x=>x,rewriteCatPosters:x=>x,publicBaseUrl:()=>'',mediaToken:()=>'',...overrides};
 return{events,release,run:vm.runInNewContext(source.slice(start,end)+';bridgeTvboxSpider',context)};
}
test('Native catalogue actions wait for account updates and sync before requesting protected content',async()=>{
 for(const action of ['home','category','search','detail']){
  const f=fixture();const promise=f.run({}, {action,id:'synthetic'}, {key:'native',runtimeBase:'http://127.0.0.1:9988/r/synthetic'});
  await Promise.resolve();assert.deepEqual(f.events,[]);f.release();await promise;
  assert.deepEqual(f.events,[['sync','http://127.0.0.1:9988/r/synthetic'],['request',action]]);
 }
});
test('Credential sync failure cannot fall through to an unauthorized catalogue request',async()=>{
 const f=fixture({syncCatAccounts:async()=>{throw Error('fixture sync failure')}});f.release();await assert.rejects(f.run({}, {action:'detail'}, {}),/sync failure/);assert.deepEqual(f.events,[]);
});
test('Server-owned Ali detail, public DJ and the existing player route retain their own authorization paths',async()=>{
 const f=fixture({aliShare:()=>true,aliPlayback:{detail:async()=>({list:['ali']})}});assert.equal((await f.run({}, {action:'detail',id:'share'},{})).list[0],'ali');assert.deepEqual(f.events,[]);
 const d=fixture({isDj92Site:()=>true,dj92Request:async()=>({list:['public']})});assert.equal((await d.run({}, {action:'home'},{})).list[0],'public');assert.deepEqual(d.events,[]);
 const p=fixture({bridgeTvboxRuntimePlayer:async()=>({player:true})});assert.equal((await p.run({}, {action:'player'},{})).player,true);assert.deepEqual(p.events,[]);
});
