import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
// Bundled validation code is optional, never served outside the container loopback.
export async function serveBuiltinCat(req,res,pathname,root){
 if(!pathname.startsWith('/builtin/'))return false;
 const end=(status,body='')=>{res.writeHead(status,{'cache-control':'no-store','content-type':'text/plain; charset=utf-8'});res.end(body);return true;};
 if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))return end(403);
 if(!['GET','HEAD'].includes(req.method))return end(405);
 if(!['/builtin/wanger/index.js','/builtin/wanger/index.js.md5'].includes(pathname))return end(404);
 let bytes;try{bytes=await fs.readFile(path.join(root,'builtin','wanger','index.js'));}catch(e){if(e.code==='ENOENT')return end(404,'本镜像没有附带本地验证订阅');throw e;}
 const body=pathname.endsWith('.md5')?Buffer.from(crypto.createHash('md5').update(bytes).digest('hex')):bytes;
 res.writeHead(200,{'cache-control':'no-store','content-type':pathname.endsWith('.md5')?'text/plain; charset=utf-8':'application/javascript; charset=utf-8','content-length':body.length});res.end(req.method==='HEAD'?undefined:body);return true;
}
