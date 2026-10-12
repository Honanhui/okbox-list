import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

// The deadline applies to connection/headers, not the duration of a movie.
// Closing/seeking on the player must also stop the old upstream download.
export async function fetchMediaUpstream(fetcher,url,options,res,headerTimeout=30000){
 const controller=new AbortController(),closed=()=>controller.abort();
 res.once('close',closed);
 const timer=setTimeout(()=>controller.abort(),headerTimeout);
 try{return await fetcher(url,{...options,signal:controller.signal});}
 catch(error){res.removeListener('close',closed);throw error;}
 finally{clearTimeout(timer);}
}
export async function forwardMediaBody(upstream,res){
 if(!upstream.body)return res.end();
 await pipeline(Readable.fromWeb(upstream.body),res);
}
