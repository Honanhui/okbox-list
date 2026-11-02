import crypto from 'node:crypto';
import {TianyiQrSession} from './tianyi-qr.mjs';
import {officialResponse,validateDirectory} from './tianyi-response.mjs';
export async function checkTianyiWeb(secret,fetcher=fetch){
 if(!secret?.cookie)return {state:'invalid',networkRequested:false,requiresLogin:true,message:'未保存天翼Cookie，请扫码登录或手动填写Cookie'};
 const session=new TianyiQrSession(fetcher);session.browserId=secret.browser_id||session.browserId;session.headers={'Browser-Id':session.browserId,Referer:'https://cloud.189.cn/web/main/'};
 for(const part of secret.cookie.split(';')){if(part.includes('='))await session.jar.setCookie(part.trim()+'; Path=/; Secure','https://cloud.189.cn');}
 try{const data=officialResponse((await session.request('https://cloud.189.cn/api/open/file/listFiles.action?folderId=-11&pageNum=1&pageSize=1')).text,'天翼登录校验');validateDirectory(data);}catch(error){return {state:'invalid',networkRequested:true,message:error.message};}
 let accountName='';try{const data=officialResponse((await session.request('https://cloud.189.cn/api/open/user/getUserInfoForPortal.action')).text,'天翼账号信息');const user=data.data||data;accountName=String(user.nickName||user.nickname||user.displayName||user.userName||'').trim().slice(0,80);if(/^\+?\d{7,}$/.test(accountName))accountName=accountName.slice(0,3)+'****'+accountName.slice(-4);}catch{return {state:'valid',networkRequested:true,message:'登录有效；官方账号昵称暂未读取成功'};}
 return {state:'valid',networkRequested:true,accountName,message:accountName?'登录有效 · 账号：'+accountName:'登录有效；官方未返回账号昵称'};
}
export function createTianyiQrAuth({fetcher=fetch,save,sessionFactory=()=>new TianyiQrSession(fetcher)}){
 const sessions=new Map();
 return async(body,owner)=>{if(body.action==='auth-start'&&body.provider==='tianyi'){
  for(const [id,e]of sessions)if(Date.now()>e.session.expires||e.owner===owner){e.session.cancel();sessions.delete(id);}if(sessions.size>=32)throw Error('扫码会话较多，请稍后再试');
  const session=sessionFactory(),qr=await session.start(),id='tianyi-web:'+crypto.randomUUID();sessions.set(id,{session,owner,name:String(body.name||''),pending:null,result:null});return {sessionId:id,state:'waiting',qrImage:qr.qrImage,expiresAt:qr.expiresAt,pollAfter:3000,message:'请使用天翼云盘App扫码确认'};
 }
 if(!String(body.sessionId||'').startsWith('tianyi-web:'))return;
 const e=sessions.get(body.sessionId);if(!e||e.owner!==owner)throw Error('扫码会话不存在或已过期');if(body.action==='auth-cancel'){e.session.cancel();sessions.delete(body.sessionId);return {state:'cancelled'};}
 if(body.action!=='auth-poll')return;if(e.result)return e.result;if(e.pending)return e.pending;
 e.pending=(async()=>{try{const result=await e.session.poll();if(result.state!=='complete')return {...result,pollAfter:3000};const cookie=await e.session.jar.getCookieString('https://cloud.189.cn/');if(!cookie)throw Error('官方未返回登录Cookie');e.result=await save({cookie,browser_id:e.session.browserId},e.name);e.session.cancel();return e.result;}catch(error){if(error.transient||['TimeoutError','AbortError'].includes(error.name))return {state:'waiting',pollAfter:5000,message:'官方请求暂时超时，会话保留，请稍候'};return {state:'failed',message:error.message};}finally{e.pending=null;}})();return e.pending;
 };
}
