import {fileURLToPath} from 'node:url';
export function instrumentCat(source){
 const pattern=/([A-Za-z_$][\w$]*)\.get\(["']\/website\/api\/credentials["'],async\(\)=>[A-Za-z_$][\w$]*\(\1\)\)/g;
 const matches=[...source.matchAll(pattern)];if(matches.length!==1)return {source,enabled:false};
 const thunder=source.match(/(?:var |,)([A-Za-z_$][\w$]*)=\{id:"thunder",name:/)?.[1];
 const hook=JSON.stringify(fileURLToPath(new URL('./cat-credential-hook.mjs',import.meta.url)));
 let result=source.replace(pattern,(whole,app)=>app+'.post("/__okbox/credential",async request=>(await import('+hook+')).applyCatCredential({db:'+app+'.db,thunderConfig:'+(thunder||'null')+'},request.body)), '+whole);
 // Restore the issuing OAuth client before native token checks after a restart.
 if(thunder){const check=new RegExp('function ([A-Za-z_$][\\w$]*)\\(e\\)\\{return e\\?\\.authVersion==='+thunder+'\\.authVersion');result=result.replace(check,(_,name)=>'function '+name+'(e){if(e?.authClientId&&e?.accessToken&&e?.refreshToken){'+thunder+'.clientId=e.authClientId;'+thunder+'.clientSecret=undefined;'+thunder+'.refreshSecret=undefined;}return e?.authVersion==='+thunder+'.authVersion');}
 // Never let an old cached 123 token survive account replacement or deletion.
 result=result.replace('async loginToken(){if(this.token&&Ui0(this.token))return this.token;','async loginToken(){this.token="";');
 result=result.replace('async isConfigured(){let t=await this.account();return!!(t.account&&t.password)}','async isConfigured(){const bucket=await this.credentials.getConfigBucket("pan123");return!!((bucket.account&&bucket.password)||bucket.auth)}');
 return {source:result,enabled:true};
}
