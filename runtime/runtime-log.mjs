import fs from 'node:fs';
import path from 'node:path';
export function redact(value,key='') {
 if(/password|cookie|token|secret|authorization|qrImage|sessionId/i.test(key))return '[已隐藏]';
 if(value&&typeof value==='object')return Array.isArray(value)?value.map(v=>redact(v)):Object.fromEntries(Object.entries(value).map(([k,v])=>[k,redact(v,k)]));
 if(typeof value!=='string')return value;
 return value.replace(/("[^"\n]*(?:cookie|authorization|password|token|secret)[^"\n]*"\s*:\s*)"(?:\\.|[^"\\])*"/gi,'$1"[已隐藏]"').replace(/(?:^|\n)\s*(cookie|authorization)\s*:[^\r\n]*/gi,'$1: [已隐藏]').replace(/https?:\/\/[^\s"'<>]+/g,s=>{try{const u=new URL(s);u.username='';u.password='';u.search=u.search?'?[已隐藏参数]':'';u.hash='';return u.href;}catch{return '[地址]';}}).replace(/(cookie|authorization|password|token|secret)\s*[:=]\s*[^\s,;}]+/gi,'$1=[已隐藏]').slice(0,6000);
}
export function createRuntimeLog(dir,role='server',{maxBytes=5*1024*1024,archives=3}={}){
 fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,role+'.jsonl');let warned=false;
 return {write(entry){const item=redact({time:new Date().toISOString(),role,...entry});try{const line=JSON.stringify(item)+'\n';if(fs.existsSync(file)&&fs.statSync(file).size+Buffer.byteLength(line)>maxBytes){for(let i=archives;i>=1;i--){const dst=file+'.'+i,src=i===1?file:file+'.'+(i-1);if(fs.existsSync(dst))fs.unlinkSync(dst);if(fs.existsSync(src))fs.renameSync(src,dst);}}fs.appendFileSync(file,line,{mode:0o600});}catch(e){if(!warned){warned=true;console.error('日志写入失败:',e.code);}}return item;},read({since='',until='',level='',q='',limit=500}={}){let out=[];for(const name of fs.readdirSync(dir).filter(n=>/^(server|cat)\.jsonl(\.\d+)?$/.test(n))){for(const line of fs.readFileSync(path.join(dir,name),'utf8').split('\n')){try{const x=JSON.parse(line);if(since&&x.time<new Date(since).toISOString()||until&&x.time>new Date(until).toISOString()||level&&x.level!==level||q&&!JSON.stringify(x).includes(q))continue;out.push(x);}catch{}}}return out.sort((a,b)=>a.time.localeCompare(b.time)).slice(-Math.min(100000,Math.max(1,Number(limit)||500)));}};
}
