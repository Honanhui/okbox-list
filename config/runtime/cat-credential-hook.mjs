// Runtime-local credential adapter; no arbitrary database paths or full DB imports.
export async function applyCatCredential(context,body){
 const provider=String(body?.provider||''),secret=body?.secret||{};
 if(!['pan123','guangya','mobile139','thunder','aliyun'].includes(provider))throw Error('不支持的账号类型');
 const clear=!Object.keys(secret).length,store=context.db;
 const set=async(path,value)=>store.set(path,value,{notify:false});
 if(provider==='pan123'){
  const token=String(secret.token||secret.access_token||'').replace(/^Bearer /i,'').trim();
  if(!clear&&!token&&!(secret.username&&secret.password))throw Error('123账号没有Token或账号密码');
  await set('/pan/pan123/account',secret.username||'');await set('/pan/pan123/password',secret.password||'');await set('/pan/pan123/auth',token);
 }else if(provider==='guangya'){
  let value=secret.token;if(typeof value==='string'&&value.trim().startsWith('{'))value=JSON.parse(value);
  const token=typeof value==='object'?value:{access_token:secret.access_token||value,refresh_token:secret.refresh_token||'',token_type:secret.token_type||'Bearer',sub:secret.sub||''};
  if(!clear&&!token.access_token)throw Error('光鸭账号缺少访问令牌');
  await set('/pan/guangya/token',clear?'':JSON.stringify(token));
 }else if(provider==='mobile139'){
  const data=secret.loginData||{},account=secret.account||data.account||'',token=secret.auth_token||data.token||data.authToken||'',domain=secret.userDomainId||data.userDomainId||data.user_domain_id||'';
  if(!clear&&(!account||!token||!domain))throw Error('移动扫码授权缺少新驱动所需的账号、Token或用户域ID，请重新登录');
  const session={account,phone:account,token,userDomainId:domain,headers:{Authorization:'Basic '+Buffer.from('mobile:'+account+':'+token).toString('base64'),'x-yun-uni':domain},loginData:data,savedAt:Date.now()};
  await set('/pan/new139/session',clear?'':JSON.stringify(session));
 }else if(provider==='thunder'){
  const client=secret.oauth_client_id||secret.client_id,access=secret.access_token||'',refresh=secret.refresh_token||'';
  if(!clear&&(!client||!access||!refresh||!secret.device_id))throw Error('迅雷授权缺少客户端、设备ID或完整Token，请重新扫码');
  const cfg=context.thunderConfig;
  if(!clear&&!cfg)throw Error('当前Cat版本没有匹配的迅雷驱动');
  if(!clear){cfg.clientId=client;cfg.clientSecret=undefined;cfg.refreshSecret=undefined;}
  const token={accessToken:access,refreshToken:refresh,tokenType:secret.token_type||'Bearer',deviceId:secret.device_id,userId:secret.user_id||secret.sub||'',captchaToken:secret.captcha_token||'',expireTime:secret.expires_at||Date.now()+Number(secret.expires_in||7200)*1000,authVersion:cfg?.authVersion,authPackage:cfg?.packageName,authClientId:client};
  await set('/pan/thunder/config',clear?'':JSON.stringify(token));
 }else{
  // Ali is owned by Docker; a Cat without an Ali driver must report that boundary.
  await set('/pan/aliyun/refreshToken',clear?'':secret.refreshToken||secret.refresh_token||'');
  await set('/pan/aliyun/accessToken',clear?'':secret.access_token||'');
  await store.notifyChange?.();return {code:0,state:clear?'cleared':'stored',provider,message:'阿里凭据已由Docker管理；当前Cat目录未提供阿里驱动'};
 }
 await store.notifyChange?.();return {code:0,state:clear?'cleared':'synced',provider};
}
