export function githubSubscription(value){
 const u=new URL(value);
 if(u.protocol!=='github:'||u.hostname!=='github.com'||u.port||u.password||!u.username||u.hash)throw Error('GitHub订阅格式应为 github://Token@github.com/账号/仓库/文件.js.md5');
 const parts=u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
 if(parts.length<3||parts.some(p=>!p||p==='.'||p==='..'||p.includes('/')||p.includes('\\'))||! /\.js(?:\.md5)?$/.test(parts.at(-1)))throw Error('GitHub订阅必须指向仓库内的.js或.js.md5文件');
 if([...u.searchParams.keys()].some(k=>k!=='ref'))throw Error('GitHub订阅仅支持ref分支参数');
 const token=decodeURIComponent(u.username);if(/[\s\r\n]/.test(token)||token==='***')throw Error('请填写有效的GitHub访问Token');
 const [owner,repo,...file]=parts;
 const api=new URL('https://api.github.com/repos/'+[owner,repo].map(encodeURIComponent).join('/')+'/contents/'+file.map(encodeURIComponent).join('/'));
 if(u.searchParams.has('ref'))api.searchParams.set('ref',u.searchParams.get('ref'));
 return {api,token};
}
export function maskGithubSecrets(value){return String(value).replace(/github:\/\/[^\s/@]+@github\.com/gi,'github://***@github.com');}
export async function downloadGithub(value,limit,fetcher=fetch){
 const {api,token}=githubSubscription(value);
 let target=api;
 for(let hop=0;hop<5;hop++){
  let r;try{r=await fetcher(target,{headers:{Accept:'application/vnd.github.raw+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'OKBOX-List',...(target.origin===api.origin?{Authorization:'Bearer '+token}:{})},redirect:'manual',signal:AbortSignal.timeout(20000)});}catch{throw Error('GitHub订阅连接失败，请检查服务器网络');}
  if([301,302,303,307,308].includes(r.status)){const next=new URL(r.headers.get('location')||'',target);await r.body?.cancel();if(next.protocol!=='https:'||next.username||next.password||!['api.github.com','raw.githubusercontent.com'].includes(next.hostname))throw Error('GitHub订阅重定向无效');target=next;continue;}
  if(!r.ok){await r.body?.cancel();throw Error(({401:'GitHub Token无效或已过期',403:'GitHub访问被拒绝：请检查Contents只读权限、组织审批或API限额',404:'GitHub文件不存在或Token无权访问：请检查仓库、路径及ref分支'})[r.status]||'GitHub订阅下载失败（HTTP '+r.status+'）');}
  const chunks=[];let size=0;for await(const chunk of r.body){size+=chunk.length;if(size>limit){throw Error('GitHub订阅文件过大');}chunks.push(chunk);}return Buffer.concat(chunks);
 }
 throw Error('GitHub订阅重定向次数过多');
}
