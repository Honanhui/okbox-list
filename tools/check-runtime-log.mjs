import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {createRuntimeLog,redact} from '../runtime/runtime-log.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'okbox-log-test-'));
try{
 const log=createRuntimeLog(dir,'server',{maxBytes:500,archives:2});
 log.write({message:'request',cookie:'private-cookie',password:'private-pass',url:'https://user:private-pass@example.com/media?sign=private-sign'});
 let text=fs.readFileSync(path.join(dir,'server.jsonl'),'utf8');assert(!text.includes('private-'));
 assert(!redact('reply: {"cookie":"private-json", "access_token":"private-access"}').includes('private-'));
 assert(!redact('Authorization: Bearer private-bearer').includes('private-'));
 for(let i=0;i<20;i++)log.write({message:'fixture '+i,level:i%2?'error':'info',requestId:String(i)});
 assert(fs.readdirSync(dir).length<=3);
 const restored=createRuntimeLog(dir);assert(restored.read().length>0);assert(restored.read({level:'error'}).every(x=>x.level==='error'));
 assert(restored.read({q:'fixture 19'}).some(x=>x.requestId==='19'));
 console.log('PASS: persistent restart read, bounded rotation, filters and credential redaction');
}finally{if(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'okbox-log-test-'))fs.rmSync(dir,{recursive:true,force:true});}
