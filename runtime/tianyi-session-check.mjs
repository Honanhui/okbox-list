import {createHash} from 'node:crypto';
// Cookie-based session creation can cause provider-side verification SMS.
// Checks must use an already issued API token, never acquire/refresh one here.
export async function checkTianyiSession(value,fetcher=fetch){
 const secret=typeof value==='string'?{cookie:value}:value||{},token=secret.access_token||secret.accessToken||'';
 if(!token)return secret.cookie?{state:'pending',networkRequested:false,message:'仅有网页Cookie，尚无独立会话令牌；在线校验未完成，已停止可能触发短信的会话请求。这不代表账号无效。'}:{state:'invalid',networkRequested:false,requiresLogin:true,message:'天翼未保存登录凭据，请手动登录；检查不会登录或发送验证码'};
 const timestamp=String(Date.now()),query='folderId=-11&pageNum=1&pageSize=1',signature=createHash('md5').update('AccessToken='+token+'&Timestamp='+timestamp+'&'+query).digest('hex');
 try{
  const response=await fetcher('https://api.cloud.189.cn/open/file/listFiles.action?'+query,{method:'GET',headers:{accesstoken:token,timestamp,signature,'sign-type':'1',Accept:'application/json;charset=UTF-8','User-Agent':'Mozilla/5.0'},redirect:'manual',signal:AbortSignal.timeout(12000)});
  if(response.status>=300&&response.status<400){await response.body?.cancel();return {state:'invalid',networkRequested:true,message:'天翼令牌校验出现登录跳转，已停止跟随；未自动登录'};}
  if(!response.ok){await response.body?.cancel();return {state:'invalid',networkRequested:true,message:'天翼令牌校验失败（HTTP '+response.status+'），未自动刷新或登录'};}
  let data;try{data=await response.json();}catch{return {state:'invalid',networkRequested:true,message:'天翼令牌接口没有返回JSON，未确认登录有效'};}
  if(Number(data.res_code)===0&&data.fileListAO&&typeof data.fileListAO==='object')return {state:'valid',networkRequested:true,message:'天翼官方只读令牌校验通过'};
  const code=String(data.res_code??data.errorCode??'unknown').replace(/[^A-Za-z0-9_-]/g,'').slice(0,40);
  return {state:'invalid',networkRequested:true,message:'天翼令牌未通过校验（code='+code+'），未自动刷新或登录'};
 }catch(error){return {state:'invalid',networkRequested:true,message:error.name==='TimeoutError'?'天翼令牌校验超时（12秒），未自动登录':'天翼令牌校验连接失败，未自动登录'};}
}