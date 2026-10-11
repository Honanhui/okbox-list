// Report useful network causes without exposing URLs, passwords or headers.
export function catDownloadError(error) {
  const codes = [error?.code, error?.cause?.code,
    ...(error?.cause?.errors || []).map(item => item?.code)].filter(Boolean);
  if (['TimeoutError', 'AbortError'].includes(error?.name) ||
      codes.some(code => ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'].includes(code))) {
    return '订阅下载超时（20 秒），请检查服务器到订阅站点的网络';
  }
  if (codes.some(code => ['ENOTFOUND', 'EAI_AGAIN'].includes(code))) return '订阅域名 DNS 解析失败，请检查服务器或 Docker 的 DNS';
  if (codes.some(code => ['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(code))) return '订阅 HTTPS 证书验证失败，请检查系统时间、证书和代理';
  if (codes.includes('ECONNREFUSED')) return '订阅服务器拒绝连接，请检查地址、端口或代理';
  if (codes.some(code => ['ECONNRESET', 'UND_ERR_SOCKET'].includes(code))) return '订阅连接被中断，请检查网络或代理后重新抓取';
  if (codes.includes('ERR_INVALID_URL')) return '订阅地址格式无效';
  if (/fetch failed|Invalid URL/i.test(error?.message || '')) return '订阅网络请求失败，请检查 Docker 内部网络、DNS 和代理';
  return String(error?.message || 'Cat 订阅抓取失败').replace(/https?:\/\/[^\s]+/g, '[订阅地址]');
}
