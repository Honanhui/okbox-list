import {spawn} from 'node:child_process';
import readline from 'node:readline';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export class CloudHost {
 constructor(dataDir,logger=()=>{}){this.dataDir=dataDir;this.pending=new Map();this.logger=logger;}
 start(){
  if(this.child)return;
  const root=path.join(import.meta.dirname,'cloud');
  const cp=[path.join(root,'classes'),path.join(root,'lib','*')].join(path.delimiter);
  const child=spawn(process.env.JAVA_BIN||'java',['-Djava.awt.headless=true','-Dfile.encoding=UTF-8','-cp',cp,'com.okbox.cloud.Worker'],{env:{...process.env,CLOUD_DATA_DIR:this.dataDir},stdio:['pipe','pipe','pipe']});
  this.child=child;
  readline.createInterface({input:child.stdout}).on('line',line=>{
   let reply;try{reply=JSON.parse(line);}catch{return;}
   const pending=this.pending.get(reply.id);if(!pending)return;
   this.pending.delete(reply.id);clearTimeout(pending.timer);
   if(reply.error)pending.reject(Object.assign(new Error(reply.error),{statusCode:400}));else pending.resolve(reply.result);
  });
  // Never print provider HTTP bodies or tokens from the worker.
  child.stderr.resume();
  const failed=()=>{if(this.child!==child)return;this.child=null;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Object.assign(new Error('网盘服务中断，请重试'),{statusCode:503}));}this.pending.clear();};
  child.on('error',error=>{this.logger('网盘Worker启动失败',{status:503,code:error.code});failed();});child.on('exit',(code,signal)=>{this.logger('网盘Worker退出',{code,signal});failed();});
 }
 call(body){
  this.start();const rpcId=randomUUID();
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.pending.delete(rpcId);reject(Object.assign(new Error('网盘服务请求超时，请重试'),{statusCode:504}));this.child?.kill();},60000);
   this.pending.set(rpcId,{resolve,reject,timer});
   this.child.stdin.write(JSON.stringify({...body,rpcId})+'\n',error=>{if(error){clearTimeout(timer);this.pending.delete(rpcId);reject(error);}});
  });
 }
 close(){this.child?.kill();}
}

