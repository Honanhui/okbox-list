import {isCatSetupSite} from './cat-source-policy.mjs';
const base=(process.env.CAT_NODE_URL||'').replace(/\/+$/,'');
export function catNodeEnabled(){return Boolean(base);}
export function isCatNodeSubscription(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&/\.js(?:\.md5)?$/.test(url.pathname);}catch{return false;}}
export function catMediaUrl(value,runtimeBase=base){
 if(!value||!runtimeBase)return value;if(!/^https?:\/\//i.test(value))return runtimeBase+'/'+value.replace(/^\//,'');let url;try{url=new URL(value);}catch{return value;}
 if(['127.0.0.1','localhost','0.0.0.0'].includes(url.hostname))return runtimeBase+url.pathname+url.search;
 return url.href;
}
export async function catNodeCatalog(fetcher,signal,subscriptionUrl){
 if(!isCatNodeSubscription(subscriptionUrl))throw new Error('只支持 Cat Node .js 或 .js.md5 订阅，不支持 JSON 订阅');
 const response=await fetcher(base+'/catalog',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:subscriptionUrl}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(100000)]):AbortSignal.timeout(100000)});
 const result=await response.json();if(!response.ok)throw new Error(result.error||'Cat 订阅抓取失败');
 const root=result.root,runtimeBase=base+'/r/'+result.id;if(!/^[a-f0-9]{24}$/.test(result.id)||!Array.isArray(root.video?.sites))throw new Error('Cat Node 目录格式无效');
 return root.video.sites.filter(site=>!isCatSetupSite({...site,runtime:'cat-node'})).map(site=>{const url=new URL(site.api,'http://localhost');if(!/^\/spider\/[^/]+\/\d+\/?$/.test(url.pathname))throw new Error('Cat Node 站点路径无效');return {...site,api:runtimeBase+url.pathname,runtimeBase,runtime:'cat-node',timeout:25,sourceUrl:subscriptionUrl};});
}
export function nodeCrawlerStatus(site){return {adapter:site.catKey||site.runtime,kind:'video',state:site.runtime==='cat-node'?'implemented':'pending',verified:false};}
export async function catNodeRequest(site,request,fetcher){
 const endpoint=new URL(site.api);if(!base||endpoint.origin!==new URL(base).origin)throw new Error('Cat Node 服务地址不匹配');
 const action=request.action==='player'?'play':request.action||'home';if(!['init','home','category','search','detail','play','verification','verify'].includes(action))throw new Error('Cat Node 操作无效');
 endpoint.pathname=endpoint.pathname.replace(/\/$/,'')+'/'+action;
 const body={id:request.action==='category'?request.categoryId:request.id,page:request.page||1,wd:request.keyword||'',quick:request.quick!==false,flag:request.flag||'',filters:request.extend||{},extend:request.extend||{},...(['verification','verify'].includes(action)?{code:request.code}: {})};
 const response=await fetcher(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{throw Object.assign(new Error(`Cat Node “${site.name}”${action}返回非完整JSON：HTTP ${response.status}，响应 ${Buffer.byteLength(raw)} 字节`),{statusCode:502});}if(!response.ok)throw Object.assign(new Error(`Cat Node “${site.name}”${action}失败：${String(data.message||data.error||response.status).slice(0,180)}`),{statusCode:response.status===429?429:502,retryAfterSeconds:data.retryAfterSeconds});
 return action==='play'?{...data,url:catMediaUrl(data.url||data.streamUrl||'',site.runtimeBase)}:data;
}
