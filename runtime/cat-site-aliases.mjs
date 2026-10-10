// Explicit source-class mappings. A match replaces execution with the Cat
// implementation; it does not claim the original publisher code is identical.
const aliases={
 csp_woggguard:'wogg',csp_wogg:'wogg',
 csp_libvioguard:'libvio',csp_libvio:'libvio',
 csp_wexmuouggguard:'muou',csp_wexhubanguard:'huban',
 csp_wexpan123ziyuanguard:'pan123ziyuan',csp_wexhanxiaoquanguard:'hanxiaoquan',
 csp_wexwencaiguard:'wencai',csp_wexikanbotguard:'ikanbot',
 csp_wexnewhuyaguard:'huya',csp_wexnewdouyuguard:'douyu',csp_wexnewbililiveguard:'bililive',
 csp_wexbiliysguard:'biliys',csp_appgzguard:'guazi',
 csp_biliguard:'bilibili',csp_bili:'bilibili',
};
export function catAlias(site){return aliases[String(site.api||'').toLowerCase()]||'';}
export function mapCatSite(site,catalog){
 const key=catAlias(site);if(!key)return site;
 // Bili family has different category configurations. Preserve separately
 // declared educational/concert modules when the runtime provides them.
 const originalKey=String(site.key||'').toLowerCase();
 const biliKey=/^(?:biliych|mtv)$/.test(originalKey)?'biliych':/^(?:少儿教育|小学课堂|初中课堂|高中教育)$/.test(originalKey)?site.key:key;
 const target=catalog.find(item=>item.key==='nodejs_'+biliKey);
 return target?{...site,originalApi:site.api,api:target.api,runtime:'cat-node',catKey:target.key}:site;
}
