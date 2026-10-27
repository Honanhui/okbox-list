// Headers used to fetch the upstream media belong only in the server's token
// entry. Clients receive the proxy URL and playback metadata, never credentials.
export function mediaClientResult(value,streamUrl){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('播放响应格式无效');
 const metadata=Object.fromEntries(Object.entries(value).filter(([key])=>! /^(headers?|cookie|authorization|proxy-authorization|mediaTransform)$/i.test(key)));
 return {...metadata,parse:0,jx:0,url:'',streamUrl};
}
