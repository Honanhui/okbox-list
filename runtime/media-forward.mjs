import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

export function assertMediaTarget(value){
 const url=new URL(value);let path;try{path=decodeURIComponent(url.pathname);}catch{throw Error('媒体路径编码无效');}
 if(/^\/cloud\/(?:credential(?:\/|$)|tokenm(?:\/|$)|config(?:\/|$))/.test(path)||/^\/__okbox\/credential(?:\/|$)/.test(path)||/^\/website\/api\/credential(?:\/|$)/.test(path))throw Error('内部凭据接口不能作为媒体地址');
}

// The deadline applies to connection/headers, not the duration of a movie.
// Closing/seeking on the player must also stop the old upstream download.
export async function fetchMediaUpstream(fetcher,url,options,res,headerTimeout=30000){
 assertMediaTarget(url);
 const controller=new AbortController(),closed=()=>controller.abort();
 res.once('close',closed);
 const timer=setTimeout(()=>controller.abort(),headerTimeout);
 try{const response=await fetcher(url,{...options,signal:controller.signal});assertMediaTarget(response.url||url);return response;}
 catch(error){res.removeListener('close',closed);throw error;}
 finally{clearTimeout(timer);}
}
export async function forwardMediaBody(upstream,res){
 if(!upstream.body)return res.end();
 await pipeline(Readable.fromWeb(upstream.body),res);
}
