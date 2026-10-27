import crypto from 'node:crypto';
// Only fields whose setters were verified in this Cat build are forwarded.
// Never guess token formats for Ali, 123, Thunder or Mobile Cloud.
const rules=[
 ['quark','cookie','/website/api/credential/quark/cookie'],
 ['uc','cookie','/website/api/credential/uc/cookie'],
 ['uc','token','/website/api/credential/uc/token'],
 ['uc','refreshtoken','/website/api/credential/uc/refreshtoken'],
 ['baidu','cookie','/website/api/credential/baidu/cookie'],
 ['pan115','cookie','/website/api/pan115/cookie'],
 ['bilibili','cookie','/website/api/bili/cookie'],
 ['tianyi','__account','/website/api/pan189/account'],
];
export function createCatAccountSync({baseUrl,credentials,fetcher}){
 const digests=new Map(),states=new Map();let pending,nativeProbe,nativeInstance;
 async function sync(){
  nativeProbe??=(async()=>{try{const response=await fetcher(new URL('__okbox/capabilities',baseUrl),{signal:AbortSignal.timeout(3000)});return response.ok&&(await response.json()).credentialMode==='tvbox-list';}catch{nativeProbe=undefined;return false;}})();const native=await nativeProbe;
  if(native){let nativeProviders=['quark','uc','baidu','aliyun'];try{const response=await fetcher(new URL('__okbox/capabilities',baseUrl),{signal:AbortSignal.timeout(3000)});if(!response.ok)throw Error();const capability=await response.json(),current=capability.instanceId;if(Array.isArray(capability.providers)&&capability.providers.includes('tianyi'))nativeProviders.push('tianyi');if(current!==nativeInstance){digests.clear();nativeInstance=current;}}catch{return ['quark','uc','baidu','aliyun'].map(provider=>({provider,state:'error'}));}const results=[];for(const provider of nativeProviders){try{const secret=await credentials(provider)||{},key='native/'+provider,digest=crypto.createHash('sha256').update(JSON.stringify(secret)).digest('hex');if(digests.get(key)===digest){results.push(states.get(key));continue;}const response=await fetcher(new URL('__okbox/credential',baseUrl),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({provider,secret}),signal:AbortSignal.timeout(8000)}),result=await response.json();if(!response.ok||result.code!==0)throw Error('同步失败');const state={provider,field:'credential',state:result.state};digests.set(key,digest);states.set(key,state);results.push(state);}catch{results.push({provider,field:'credential',state:'error'});}}return results;}
  const secrets=new Map();await Promise.all([...new Set([...rules.map(r=>r[0]),...ownedProviders])].map(async id=>secrets.set(id,await credentials(id))));
  const results=await Promise.all(rules.map(async([provider,field,path])=>{
   const secret=secrets.get(provider)||{},value=field==='__account'?(secret.username&&secret.password?JSON.stringify({account:secret.username,password:secret.password}):''):String(secret[field]|| (field==='refreshtoken'?secret.refresh_token||'':'')).trim();
   const digest=crypto.createHash('sha256').update(value).digest('hex');if(digests.get(path)===digest)return states.get(path);
   try{
    const response=await fetcher(new URL(path.replace(/^\//,''),baseUrl),{method:value?'PUT':'DELETE',headers:{'content-type':'application/json'},body:value?(field==='__account'?value:JSON.stringify({value})):undefined,signal:AbortSignal.timeout(8000)});
    if([404,405].includes(response.status)){const status={provider,field,state:'unsupported'};states.set(path,status);digests.set(path,digest);return status;}
    if(!response.ok)return {provider,state:'error'};
    const result=await response.json();if(Number(result.code||0)!==0)return {provider,state:'error'};
    const status={provider,field,state:value?'synced':'cleared'};states.set(path,status);digests.set(path,digest);return status;
   }catch{return {provider,state:'error'};}
  }));
  for(const provider of ownedProviders){const secret=secrets.get(provider)||{},path='/__okbox/credential/'+provider;const digest=crypto.createHash('sha256').update(JSON.stringify(secret)).digest('hex');if(digests.get(path)===digest){results.push(states.get(path));continue;}try{const response=await fetcher(new URL('__okbox/credential',baseUrl),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({provider,secret}),signal:AbortSignal.timeout(15000)});const result=await response.json().catch(()=>({}));const state=[404,405].includes(response.status)?'unsupported':!response.ok||result.code!==0?'error':result.state;const status={provider,field:'credential',state,message:state==='error'?'凭据格式不匹配或同步失败':result.message};results.push(status);if(state!=='error'){digests.set(path,digest);states.set(path,status);}}catch{results.push({provider,field:'credential',state:'error'});}}
  return results.filter(Boolean);
 }
 return ()=>{if(!pending)pending=sync().finally(()=>{pending=null;});return pending;};
}

const ownedProviders=['pan123','guangya','thunder','mobile139','aliyun'];
export const catSyncProviders=[...new Set([...rules.map(r=>r[0]),...ownedProviders])];
