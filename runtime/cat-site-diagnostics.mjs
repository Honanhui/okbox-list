// Narrow patches for verified Cat implementations. Do not change site URLs,
// login state, signing parameters, or TLS validation.
export function patchCatSiteDiagnostics(source) {
 const changes=[];
 const forum='return Pr(n.data||"",{baseURI:$C(t)})';
 if(!source.includes('盘迷论坛需要有板块权限的论坛账号') && source.includes('var Gm="https://pan1.me"') && source.split(forum).length===2){
  source=source.replace(forum,'if(String(n.data||"").includes("您所在的用户组无权访问该板块"))throw new Error("盘迷论坛需要有板块权限的论坛账号；123网盘登录不能替代论坛登录");'+forum);
  changes.push('panmi-permission');
 }
 const live='let s=n.body||{},c=u20(s.page||s.pg||1),l=t.parsed.groups.map';
 if(!source.includes('点播直播尚未配置直播列表') && source.includes('key:"livetovod"') && source.split(live).length===2){
  source=source.replace(live,'if(!t.parsed.groups.length&&t.parsed.errors.some(x=>String(x).includes("直播 DIY 未配置")))throw new Error("点播直播尚未配置直播列表；这不是影视爬虫故障");'+live);
  changes.push('live-list-missing');
 }
 return {source,changes};
}
