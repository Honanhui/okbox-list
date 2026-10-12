import {httpUrl,createRequest} from '../util/cat.js';
export const videoFile=/\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|ts|m3u8)$/i;
export const subtitleFile=/\.(srt|ass|ssa|vtt|sub)$/i;
export function identifyShare(text){
 const match=String(text).match(/https?:\/\/[^\s<>"，。]+/);if(!match)throw Error('请输入有效的网盘分享链接');const url=new URL(httpUrl(match[0]));let provider,id,folder='0';
 if(url.hostname==='pan.quark.cn'){provider='quark';id=url.pathname.match(/^\/s\/([\w-]+)/)?.[1];}
 else if(url.hostname==='drive.uc.cn'){provider='uc';id=url.pathname.match(/^\/s\/([\w-]+)/)?.[1];}
 else if(['www.aliyundrive.com','www.alipan.com','aliyundrive.com','alipan.com'].includes(url.hostname)){provider='aliyun';id=url.pathname.match(/^\/s\/([\w-]+)/)?.[1];folder=url.pathname.match(/\/folder\/([\w-]+)/)?.[1]||'root';}
 else if(url.hostname==='pan.baidu.com'){provider='baidu';id=url.pathname.match(/^\/s\/1([\w-]+)/)?.[1];folder='/';}
 if(!provider||!id)throw Error('当前支持夸克、阿里、UC、百度分享链接');
 const password=url.searchParams.get('pwd')||url.searchParams.get('passcode')||url.searchParams.get('password')||String(text).match(/(?:提取码|密码)\s*[:：]?\s*([a-zA-Z0-9]{4})/)?.[1]||'';
 return {provider,id,folder,password,url:url.origin+url.pathname+(password?'?pwd='+encodeURIComponent(password):'')};
}
export class CloudProtocolError extends Error{constructor(provider,code,message){super(`${provider}网盘接口 ${code}：${String(message||'请求失败').slice(0,100)}`);this.code=code;}}
