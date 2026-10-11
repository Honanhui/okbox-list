import fs from 'node:fs';
import {spawn} from 'node:child_process';
fs.mkdirSync('/data',{recursive:true});
if(process.getuid?.()===0){fs.chownSync('/data',1000,1000);process.setgid(1000);process.setuid(1000);}
process.env.CAT_NODE_URL='http://127.0.0.1:9988';
process.env.CAT_DATA_DIR='/data/cat-runtime';
const children=new Set();let stopping=false;
function signal(child,value){try{process.kill(-child.pid,value);}catch{try{child.kill(value);}catch{}}}
function shutdown(code){if(stopping)return;stopping=true;for(const child of children)signal(child,'SIGTERM');const timer=setTimeout(()=>{for(const child of children)signal(child,'SIGKILL');process.exit(code);},10000);if(!children.size){clearTimeout(timer);process.exit(code);}const check=()=>{if(!children.size){clearTimeout(timer);process.exit(code);}};for(const child of children)child.once('exit',check);}
function launch(file,env){const child=spawn(process.execPath,[file],{env:{...process.env,...env},stdio:'inherit',detached:true});children.add(child);child.on('error',()=>shutdown(1));child.on('exit',()=>{signal(child,'SIGTERM');children.delete(child);if(!stopping)shutdown(1);});return child;}
for(const value of ['SIGTERM','SIGINT'])process.on(value,()=>shutdown(0));
launch('/app/runtime/cat-node-loader.mjs',{PORT:'9988',HOST:'127.0.0.1'});
let ready=false;
for(let attempt=0;attempt<100&&!stopping;attempt++){try{ready=(await fetch('http://127.0.0.1:9988/health',{signal:AbortSignal.timeout(1000)})).ok;}catch{}if(ready)break;await new Promise(resolve=>setTimeout(resolve,100));}
if(!ready)shutdown(1);else if(!stopping)launch('/app/server.js',{});
