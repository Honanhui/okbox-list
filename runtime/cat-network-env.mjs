// Pass only explicitly configured network settings, never the server's whole env.
export function catNetworkEnv(source=process.env,fileProxy=''){
 const result={};
 const unified=source.OUTBOUND_PROXY||source.TVBOX_PROXY||fileProxy;
 for(const key of ['HTTP_PROXY','HTTPS_PROXY']){
  const value=unified||source[key.toLowerCase()]||source[key];if(!value)continue;
  try{const url=new URL(value);if(['http:','https:'].includes(url.protocol)&&!/[\r\n]/.test(value))result[key]=value;}catch{}
 }
 if(!Object.keys(result).length)return result;
 const exclusions=[source.no_proxy??source.NO_PROXY??'','localhost','127.0.0.1','::1'].filter(Boolean).join(',');
 result.NO_PROXY=exclusions;result.no_proxy=exclusions;
 result.NODE_USE_ENV_PROXY=source.NODE_USE_ENV_PROXY==='0'?'0':'1';
 return result;
}
