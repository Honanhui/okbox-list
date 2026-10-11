// Public previews only. No forum login, paid downloads, or original-site IDs.
const origin='https://www.dj92cc.net';
const headers={'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',referer:origin+'/'};
const classes=[{type_id:'1',type_name:'串烧舞曲'},{type_id:'2',type_name:'中文单曲'},{type_id:'3',type_name:'外文单曲'}];
const cache=new Map();
export function isDj92Site(site){return site.runtime==='cat-node' && /\/spider\/musicailunhui\/3$/.test(site.api);}
function clean(text){return String(text||'').replace(/<[^>]*>/g,'').replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(parseInt(n.replace(/^x/i,''),/^x/i.test(n)?16:10))).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').trim();}
export function parseDj92List(html){const records=new Map();for(const match of html.matchAll(/<a\b[^>]*href=["'](?:https:\/\/www\.dj92cc\.net)?\/dance\/play\/id\/(\d+)\.html["'][^>]*>([\s\S]*?)<\/a>/gi)){const name=clean(match[2]);if(name)records.set(match[1],{vod_id:'okbox-dj92:'+match[1],vod_name:name,vod_pic:'',vod_remarks:'公开试听'});}return [...records.values()].slice(0,100);}
export async function dj92Request(request,fetcher){
 async function html(path){const entry=cache.get(path);if(entry&&entry.expires>Date.now())return entry.value;const response=await fetcher(origin+path,{headers,signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('轮回试听站 HTTP '+response.status);const value=await response.text();if(cache.size>=64)cache.delete(cache.keys().next().value);cache.set(path,{value,expires:Date.now()+60000});return value;}
 const action=request.action||'home',page=Math.max(1,Math.min(100,Number(request.page)||1));
 if(action==='home')return {class:classes,filters:{},list:parseDj92List(await html('/dance/lists/id/1/1.html'))};
 if(action==='category'){const id=String(request.categoryId||'1');if(!classes.some(x=>x.type_id===id))throw new Error('轮回分类已更新，请重新打开视频源');const list=parseDj92List(await html('/dance/lists/id/'+id+'/'+page+'.html'));return {page,pagecount:list.length?page+1:page,list};}
 if(action==='search'){if(page>1)return {page,pagecount:1,list:[]};return {page:1,pagecount:1,list:parseDj92List(await html('/index.php/dance/so/key?key='+encodeURIComponent(request.keyword||'')))};}
 const id=/^okbox-dj92:(\d+)$/.exec(String(request.id||''))?.[1];if(!id)throw new Error('轮回入口已更新，请从新列表重新选择曲目');
 const content=await html('/dance/play/id/'+id+'.html');
 const path=/\bdanceFilePath\s*=\s*['"](m4a\/\d+)['"]/.exec(content)?.[1];
 if(!path)throw new Error('轮回未提供公开试听地址');
 if(action==='player')return {parse:0,url:'https://mp4db.dj92cc.net/'+path+'.m4a',header:headers,format:'audio/mp4'};
 if(action==='detail'){const name=clean(/<meta\b[^>]*property=['"]og:title['"][^>]*content=['"]([^'"]+)['"]/i.exec(content)?.[1]);const pic=/<meta\b[^>]*property=['"]og:image['"][^>]*content=['"]([^'"]+)['"]/i.exec(content)?.[1]||'';return {list:[{vod_id:'okbox-dj92:'+id,vod_name:name||'轮回试听',vod_pic:pic,vod_content:'本站公开试听版本。',vod_play_from:'轮回试听',vod_play_url:'试听$okbox-dj92:'+id}]};}
 throw new Error('轮回不支持此操作');
}
