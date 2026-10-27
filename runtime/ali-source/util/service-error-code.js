const allowed=new Set(['ShareLink.Forbidden','ShareLink.Cancelled','ShareLink.Expired','ShareLink.NotFound','ShareLinkNotFound','InvalidSharePwd','AccessTokenExpired','AccessTokenInvalid']);
export function publicServiceErrorCode(bytes){
 try{const value=JSON.parse(Buffer.isBuffer(bytes)?bytes.toString('utf8'):String(bytes));return allowed.has(value?.code)?value.code:undefined;}catch{return undefined;}
}
export function aliServiceError(error){
 const messages={
  'ShareLink.Forbidden':'阿里分享未开放访问或已被限制，无法播放此分享',
  'ShareLink.Cancelled':'阿里分享已取消，请使用有效分享',
  'ShareLink.Expired':'阿里分享已过期，请使用有效分享',
  'ShareLink.NotFound':'阿里分享不存在或已失效',
  ShareLinkNotFound:'阿里分享不存在或已失效',
  InvalidSharePwd:'阿里分享提取码不正确',
  AccessTokenExpired:'阿里授权已过期，请在TVBOX-LIST重新登录',
  AccessTokenInvalid:'阿里授权无效，请在TVBOX-LIST重新登录'
 };
 const message=messages[error?.serviceCode];if(!message)return error;
 return Object.assign(Error(message),{statusCode:error.statusCode,serviceCode:error.serviceCode});
}
