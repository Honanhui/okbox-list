// Only source-owned setup pages are hidden; ordinary media/search sites remain.
const setupKeys=new Set(['nodejs_baseset','nodejs_mypan']);
export function isCatSetupSite(site){return site.runtime==='cat-node' && setupKeys.has(String(site.rawKey||site.key||'').split(':').pop());}
