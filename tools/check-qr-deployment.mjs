import assert from 'node:assert/strict';
import {CloudHost} from '../runtime/cloud-host.mjs';
const host=new CloudHost('/tmp/qr-smoke');
try{for(const provider of ['aliyun','thunder','mobile139','guangya','pan123']){try{const r=await host.call({action:'auth-start',provider,name:'部署核验'});console.log(JSON.stringify({provider,state:r.state,qrPresent:!!r.qrImage,sessionPresent:!!r.sessionId}));assert.equal((await host.call({action:'auth-cancel',sessionId:r.sessionId})).state,'cancelled');await assert.rejects(()=>host.call({action:'auth-poll',sessionId:r.sessionId}),/不存在|失效/);}catch(e){console.log(JSON.stringify({provider,error:e.message}));}}}finally{host.close();}
