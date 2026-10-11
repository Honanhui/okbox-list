// Rewrite only known record fields; never alter episode or playback parameters.
export function rewriteCatPosters(value, site, expose) {
 const rewrite = record => {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
  const copy = {...record};
  for (const field of ['vod_pic','pic','cover']) {
   const raw = copy[field]; if (typeof raw !== 'string' || !raw) continue;
   try {
    const url = new URL(raw, site.runtimeBase+'/');
    const local = ['127.0.0.1','localhost','0.0.0.0','[::1]'].includes(url.hostname);
    const origin = new URL(site.runtimeBase).origin;
    if (!local && url.origin !== origin && !raw.startsWith('/')) continue;
    const prefix = new URL(site.runtimeBase).pathname.replace(/\/$/,'');
    const target = url.origin === origin && url.pathname.startsWith(prefix+'/') ? url.href :
      site.runtimeBase + url.pathname + url.search;
    copy[field] = expose(target);
   } catch {}
  }
  return copy;
 };
 if (Array.isArray(value)) return value.map(rewrite);
 if (!value || typeof value !== 'object') return value;
 const result={...value};
 for (const field of ['list','vod_list','data']) {
  if(Array.isArray(result[field])) result[field]=result[field].map(rewrite);
  else if(result[field] && typeof result[field]==='object') result[field]=rewriteCatPosters(result[field],site,expose);
 }
 return result;
}
