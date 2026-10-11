// A bounded HTTP adapter for the protocol exposed by HHJX's playback page.
// Never evaluate third-party JavaScript or turn unknown parse pages into media.
export async function resolvePlayerPage(value, fetcher, headers) {
 const page = new URL(value.url || value.streamUrl);
 if (page.hostname !== 'hhjx.hhplayer.com') {
  throw Object.assign(new Error('该播放结果需要网页解析，尚未适配此解析服务'), {statusCode:501});
 }
 const response=await fetcher(page.href,{headers,redirect:'follow',signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Object.assign(new Error(`播放解析页 HTTP ${response.status}`),{statusCode:502});
 const html=await response.text();
 if(html.length>1024*1024)throw Object.assign(new Error('播放解析页过大'),{statusCode:502});
 const match=html.match(/window\.__HHJX_BOOTSTRAP__\s*=\s*(\{[^<]+\});\s*<\/script>/);
 if(!match)throw Object.assign(new Error('播放解析页协议已变化，未取得初始化参数'),{statusCode:502});
 const boot=JSON.parse(match[1]);
 if(!boot.url||!boot.t||!boot.key)throw Object.assign(new Error('播放解析页参数不完整'),{statusCode:502});
 const request={url:boot.url,t:boot.t,key:boot.key,client_fallback:false};
 if(boot.act===99)request.act=99;
 const parsed=await fetcher(new URL('/api/parse',page).href,{method:'POST',headers:{...headers,'content-type':'application/json',referer:page.href},body:JSON.stringify(request),signal:AbortSignal.timeout(20000)});
 if(!parsed.ok)throw Object.assign(new Error(`媒体解析接口 HTTP ${parsed.status}`),{statusCode:502});
 const data=await parsed.json();
 if(data.code!==200||!data.url||data.ext==='youku')throw Object.assign(new Error('解析服务未返回可直接播放的媒体地址'),{statusCode:502});
 const media=new URL(data.url,page);
 if(!['http:','https:'].includes(media.protocol))throw Object.assign(new Error('解析服务返回无效媒体协议'),{statusCode:502});
 return {...value,parse:0,jx:0,url:media.href,header:{...headers,referer:page.href},mediaTransform:'hhjx-ts'};
}

export async function streamTsMedia(upstream,res) {
 const iterator=upstream.body[Symbol.asyncIterator]();
 let prefix=Buffer.alloc(0),done=false;
 while(prefix.length<4472&&!done){const next=await iterator.next();done=!!next.done;if(next.value)prefix=Buffer.concat([prefix,Buffer.from(next.value)]);}
 let offset=-1;
 for(let i=0;i<Math.min(prefix.length-376,4096);i++)if(prefix[i]===71&&prefix[i+188]===71&&prefix[i+376]===71){offset=i;break;}
 const headers={'content-type':offset>=0?'video/mp2t':upstream.headers.get('content-type')||'application/octet-stream'};
 res.writeHead(upstream.status,headers);res.write(prefix.subarray(Math.max(0,offset)));
 while(!done){const next=await iterator.next();done=!!next.done;if(next.value)res.write(next.value);}
 res.end();
}
