import {instrumentCat} from './cat-instrument.mjs';
import {catDownloadError} from './cat-download-errors.mjs';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import http from 'node:http';
import {spawn} from 'node:child_process';
const dir=process.env.CAT_DATA_DIR||'/cat-data',port=Number(process.env.PORT||9988),runtimes=new Map();let stopping=false,nextPort=10000;
await fs.mkdir(dir,{recursive:true});
function sourceUrl(value){const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||!/\.js(?:\.md5)?$/.test(url.pathname))throw new Error('只支持 Cat Node .js 或 .js.md5 订阅地址');return url;}
async function download(value,limit){
 const original=new URL(value),auth=original.username?'Basic '+Buffer.from(decodeURIComponent(original.username)+':'+decodeURIComponent(original.password)).toString('base64'):'';
 original.username='';original.password='';let target=original;
 for(let hop=0;hop<5;hop++){
 let response;try{response=await fetch(target,{headers:{'user-agent':'okhttp/4.12.0',...(auth&&target.origin===original.origin?{authorization:auth}:{})},redirect:'manual',signal:AbortSignal.timeout(20000)});}catch(error){throw new Error(catDownloadError(error));}
  if([301,302,303,307,308].includes(response.status)){const next=new URL(response.headers.get('location')||'',target);await response.body?.cancel();if(!['http:','https:'].includes(next.protocol)||next.username||next.password)throw new Error('订阅重定向无效');target=next;continue;}
  if(!response.ok)throw new Error('订阅下载 HTTP '+response.status);
  const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw new Error('订阅文件过大');chunks.push(chunk);}return Buffer.concat(chunks);
 }throw new Error('订阅重定向次数过多');
}
async function stop(runtime){const child=runtime.child;if(!child)return;runtime.child=null;await new Promise(resolve=>{const timer=setTimeout(()=>child.kill('SIGKILL'),3000);child.once('exit',()=>{clearTimeout(timer);resolve()});child.kill('SIGTERM');});}
function start(runtime){if(runtime.child||stopping)return;const child=spawn(process.execPath,[runtime.path+'/bridge-runtime/index.js'],{cwd:runtime.path,env:{PATH:process.env.PATH,HOME:runtime.path,NODE_ENV:'production',NODE_OPTIONS:process.env.NODE_OPTIONS||'',PORT:String(runtime.port),HOST:'127.0.0.1',NODE_PATH:runtime.path},stdio:'ignore'});runtime.child=child;runtime.initialized=new Map();child.on('error',()=>{});child.once('exit',()=>{if(runtime.child===child)runtime.child=null;});}
async function ready(runtime){const original=await fs.readFile(runtime.path+'/index.js','utf8');const patched=instrumentCat(original);await fs.mkdir(runtime.path+'/bridge-runtime',{recursive:true});await fs.writeFile(runtime.path+'/bridge-runtime/package.json',JSON.stringify({type:'commonjs'}));await fs.writeFile(runtime.path+'/bridge-runtime/index.js',patched.source,{mode:0o600});runtime.credentialHook=patched.enabled;start(runtime);const deadline=Date.now()+45000;while(Date.now()<deadline){try{const response=await fetch(`http://127.0.0.1:${runtime.port}/config`,{signal:AbortSignal.timeout(2000)});if(response.ok){const root=await response.json();if(Array.isArray(root.video?.sites))return root;}}catch{}if(!runtime.child)throw new Error('Cat 程序启动失败或不兼容');await new Promise(resolve=>setTimeout(resolve,250));}throw new Error('Cat 程序启动超时');}
async function catalog(value){const url=sourceUrl(value),id=crypto.createHash('sha256').update(url.href).digest('hex').slice(0,24);let runtime=runtimes.get(id);if(!runtime){runtime={id,path:dir+'/'+id,port:nextPort++};runtimes.set(id,runtime);}if(runtime.pending)return runtime.pending;
 runtime.pending=(async()=>{await fs.mkdir(runtime.path,{recursive:true});await fs.writeFile(runtime.path+'/source.json',JSON.stringify({url:url.href}),{mode:0o600});
  const scriptUrl=new URL(url);scriptUrl.pathname=scriptUrl.pathname.replace(/\.md5$/,'');let script,expected;
  if(url.pathname.endsWith('.md5')){expected=(await download(url,128)).toString().trim().toLowerCase();if(!/^[a-f0-9]{32}$/.test(expected))throw new Error('Cat 校验文件格式无效');}
  const current=await fs.readFile(runtime.path+'/index.js').catch(()=>null);
  if(!expected||!current||crypto.createHash('md5').update(current).digest('hex')!==expected){script=await download(scriptUrl,16*1024*1024);if(expected&&crypto.createHash('md5').update(script).digest('hex')!==expected)throw new Error('Cat 程序校验失败');if(!current||!current.equals(script)){await fs.writeFile(runtime.path+'/index.js.next',script);await fs.rename(runtime.path+'/index.js.next',runtime.path+'/index.js');await stop(runtime);}}
  const root=await ready(runtime);return {id,root};
 })().finally(()=>{runtime.pending=null});return runtime.pending;
}
async function restore(id){let runtime=runtimes.get(id);if(!runtime){const stored=JSON.parse(await fs.readFile(dir+'/'+id+'/source.json','utf8'));sourceUrl(stored.url);runtime={id,path:dir+'/'+id,port:nextPort++};runtimes.set(id,runtime);}if(!runtime.child)await ready(runtime);return runtime;}
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/health'){res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,runtimes:runtimes.size}));return;}
 if(url.pathname==='/catalog'&&req.method==='POST'){let body='';for await(const chunk of req){body+=chunk;if(body.length>16384)throw new Error('请求过大');}const result=await catalog(JSON.parse(body).url);res.setHeader('content-type','application/json');res.end(JSON.stringify(result));return;}
 const match=url.pathname.match(/^\/r\/([a-f0-9]{24})(\/.*)$/);if(!match){res.writeHead(404);res.end();return;}
 const runtime=await restore(match[1]);
 // Cat clients initialize each Spider before browsing. Keep this state tied
 // to the child process so a restart does not reuse old initialization.
 const spider=match[2].match(/^(\/spider\/[^/]+\/\d+)\/(home|category|search|detail|play)$/);
 if(spider){const prefix=spider[1];if(!runtime.initialized.has(prefix)){
  const pending=(async()=>{const reply=await fetch('http://127.0.0.1:'+runtime.port+prefix+'/init',{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000)});if(!reply.ok&&reply.status!==404){const failure=await reply.json().catch(()=>({}));throw new Error('Cat 初始化失败：'+String(failure.message||failure.error||reply.status).slice(0,180));}await reply.body?.cancel();})();
  runtime.initialized.set(prefix,pending);pending.catch(()=>runtime.initialized.delete(prefix));
 }await runtime.initialized.get(prefix);}
 const headers={...req.headers,host:`127.0.0.1:${runtime.port}`};delete headers.authorization;
 const upstream=http.request({hostname:'127.0.0.1',port:runtime.port,path:match[2]+url.search,method:req.method,headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res)});upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Cat 服务连接失败')});req.pipe(upstream);
 }catch(error){if(!res.headersSent)res.writeHead(502,{'content-type':'application/json'});res.end(JSON.stringify({error:catDownloadError(error)}));}});
server.listen(port,process.env.HOST||'127.0.0.1');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{stopping=true;server.close();await Promise.all([...runtimes.values()].map(stop));process.exit(0)});
