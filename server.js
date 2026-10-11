import {isCatSetupSite} from './runtime/cat-source-policy.mjs';
import {rewriteCatPosters} from './runtime/cat-posters.mjs';
import http from "node:http";
import https from "node:https";
import dns from "node:dns/promises";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import tls from "node:tls";

import {probeMedia} from './runtime/media-probe.mjs';
import {resolvePlayerPage,streamTsMedia} from './runtime/player-page.mjs';

import {catNodeEnabled,catNodeCatalog,catNodeRequest,isCatNodeSubscription,nodeCrawlerStatus} from './runtime/cat-node-client.mjs';
import {createCatAccountSync,catSyncProviders} from './runtime/cat-account-sync.mjs';
import { fileURLToPath } from "node:url";
import { CloudHost } from "./runtime/cloud-host.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 9978);
const HOST = process.env.HOST || "::";
const CONFIG_PATH = path.resolve(process.env.CONFIG_PATH || path.join(ROOT, "data", "config.json"));
const CATALOG_CACHE_PATH = path.join(path.dirname(CONFIG_PATH), "catalog-cache.json");
const cloudHost = new CloudHost(path.join(path.dirname(CONFIG_PATH), "cloud"));
const catAccountSyncs=new Map(),catSyncStates=new Map();
async function syncCatAccounts(runtimeBase){
 if(!catNodeEnabled())return [];
 const bases=runtimeBase?[runtimeBase]:[...new Set(tvboxSites.map(site=>site.runtimeBase).filter(Boolean))];
 const results=[];for(const base of bases){if(!catAccountSyncs.has(base))catAccountSyncs.set(base,createCatAccountSync({baseUrl:base+'/',credentials:provider=>cloudHost.call({action:'credentials',provider}),fetcher:(...args)=>remoteFetch(...args)}));const state=await catAccountSyncs.get(base)();catSyncStates.set(base,state);results.push(...state);}return results;
}

function catAccountStatus(account){
 if(!catSyncProviders.includes(account.provider))return {state:'unsupported',message:'当前 Cat 凭据接口尚未接通'};
 const activeBases=new Set(activeTvboxSites().map(site=>site.runtimeBase).filter(Boolean));
 const states=[...catSyncStates.entries()].filter(([base])=>activeBases.has(base)).flatMap(([,states])=>states).filter(x=>x.provider===account.provider);
 if(!states.length)return {state:'pending',message:'等待订阅爬虫启动并同步'};
 if(states.some(x=>x.state==='error'))return {state:'error',message:'爬虫凭据同步失败，请重试'};
 if(states.some(x=>x.state==='stored'))return {state:'stored',message:'凭据已交给Docker；当前Cat没有对应播放驱动'};
 if(states.some(x=>x.state==='synced'))return {state:'synced',message:'已同步到订阅爬虫，播放待验证'};
 if(states.some(x=>x.state==='unsupported'))return {state:'unsupported',message:'该订阅未提供对应凭据接口'};
 return {state:'missing',message:account.disabled?'已停用并清除爬虫凭据':'尚无可同步凭据'};
}
function withCatAccountStatus(result){return {...result,accounts:(result.accounts||[]).map(account=>({...account,catSync:catAccountStatus(account)}))};}

const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || "").trim();
const VERSION = "0.1";
const TVBOX_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const TVBOX_ACCEPT = "application/json, text/plain, */*";
const TVBOX_HEADERS = { accept: TVBOX_ACCEPT, "accept-language": "zh-CN,zh;q=0.9", "user-agent": TVBOX_USER_AGENT };
const startedAt = Date.now();
const logs = [];
const mediaTokens = new Map();
const mediaPlaylistEntries = new Set();
let tvboxSites = [];
let sourceCatalogErrors = [];
let configStatuses = [];
const configMetadata = new Map();
const catalogCache = new Map();

// Remember hosts for which Docker's configured resolver failed. A source
// import often makes several requests to the same host; repeating the failed
// resolver path for each request made imports needlessly slow.
const publicDnsCache = new Map();
const PUBLIC_DNS_CACHE_MS = Math.max(60_000, Number(process.env.TVBOX_DNS_CACHE_MS || 10 * 60_000));
let refreshTimer;
let catalogRefreshJob;
let outboundProxy = "";
let outboundProxySource = "";

let config = {
  settings: { playMode: "proxy", defaultSiteId: "" },
  configUrls: [],
  refreshMinutes: 60,
  sites: []
};

function log(message, details = {}) {
  const item = { time: new Date().toISOString(), message, ...details };
  logs.push(item);
  if (logs.length > 300) logs.shift();
  console.log(`[${item.time}] ${message}`, Object.keys(details).length ? details : "");
}

function proxyStatus() {
  if (!outboundProxy) return { enabled: false, source: "none", protocol: "" };
  try {
    return { enabled: true, source: outboundProxySource, protocol: new URL(outboundProxy).protocol.replace(":", "") };
  } catch {
    return { enabled: true, source: outboundProxySource, protocol: "unknown" };
  }
}

function noProxyMatches(target) {
  const values = String(process.env.NO_PROXY || process.env.no_proxy || "")
    .split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!values.length) return false;
  const hostname = target.hostname.toLowerCase();
  const hostPort = `${hostname}:${target.port || (target.protocol === "https:" ? "443" : "80")}`;
  return values.some((item) => item === "*" || item === hostname || item === hostPort ||
    (item.startsWith(".") && hostname.endsWith(item)) || (item.startsWith("*.") && hostname.endsWith(item.slice(1))));
}

function requestHeaders(value) {
  const result = {};
  if (value instanceof Headers) {
    for (const [name, item] of value.entries()) result[name] = item;
  } else {
    for (const [name, item] of Object.entries(value || {})) result[name.toLowerCase()] = String(item);
  }
  return result;
}

function proxyHeaders(proxy, targetHeaders) {
  const headers = { ...targetHeaders };
  if (proxy.username || proxy.password) {
    const credentials = Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString("base64");
    headers["proxy-authorization"] = `Basic ${credentials}`;
  }
  return headers;
}

function nodeResponse(response, finalUrl) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(response.headers || {})) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : String(value));
  }
  return {
    status: response.statusCode || 502,
    statusText: response.statusMessage || "",
    ok: (response.statusCode || 500) >= 200 && (response.statusCode || 500) < 300,
    url: finalUrl,
    headers,
    body: response,
    text: () => new Promise((resolve, reject) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve(body));
      response.on("error", reject);
    })
  };
}

function requestBody(options) {
  if (options.body === undefined || options.body === null) return undefined;
  if (typeof options.body === "string" || Buffer.isBuffer(options.body) || options.body instanceof Uint8Array) return options.body;
  return String(options.body);
}

function proxyRequestOnce(target, options, proxy) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = requestHeaders(options.headers);
  headers.host = headers.host || target.host;
  const body = requestBody(options);
  const client = proxy.protocol === "https:" ? https : http;
  const signal = options.signal;
  return new Promise((resolve, reject) => {
    const requestOptions = {
      protocol: proxy.protocol,
      hostname: proxy.hostname,
      port: proxy.port || (proxy.protocol === "https:" ? 443 : 80),
      method,
      path: target.toString(),
      headers: proxyHeaders(proxy, headers),
      agent: false
    };
    const request = client.request(requestOptions, (response) => resolve(nodeResponse(response, target.toString())));
    const cleanup = () => signal?.removeEventListener?.("abort", abort);
    const abort = () => request.destroy(createError(504, "上游请求已取消"));
    request.once("error", (error) => { cleanup(); reject(error); });
    request.once("response", cleanup);
    if (signal) {
      if (signal.aborted) return abort();
      signal.addEventListener("abort", abort, { once: true });
    }
    if (body !== undefined) request.write(body);
    request.end();
  });
}

function proxyHttpsRequestOnce(target, options, proxy) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = requestHeaders(options.headers);
  headers.host = headers.host || target.host;
  const body = requestBody(options);
  const client = proxy.protocol === "https:" ? https : http;
  const signal = options.signal;
  return new Promise((resolve, reject) => {
    const connectOptions = {
      protocol: proxy.protocol,
      hostname: proxy.hostname,
      port: proxy.port || (proxy.protocol === "https:" ? 443 : 80),
      method: "CONNECT",
      path: target.host,
      headers: proxyHeaders(proxy, { host: target.host }),
      agent: false
    };
    const connectRequest = client.request(connectOptions);
    let settled = false;
    const abort = () => connectRequest.destroy(createError(504, "上游请求已取消"));
    const cleanup = () => signal?.removeEventListener?.("abort", abort);
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    connectRequest.once("error", fail);
    connectRequest.once("connect", (response, socket) => {
      if (response.statusCode !== 200) {
        socket.destroy();
        return fail(createError(502, `HTTP 代理 CONNECT 返回 ${response.statusCode}`));
      }
      const secureSocket = tls.connect({ socket, servername: target.hostname });
      secureSocket.once("error", fail);
      secureSocket.once("secureConnect", () => {
        const requestOptions = {
          protocol: "https:",
          hostname: target.hostname,
          port: target.port || 443,
          method,
          path: `${target.pathname || "/"}${target.search || ""}`,
          headers,
          agent: false,
          createConnection: () => secureSocket
        };
        const request = https.request(requestOptions, (result) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(nodeResponse(result, target.toString()));
        });
        request.once("error", fail);
        if (signal?.aborted) return request.destroy(createError(504, "上游请求已取消"));
        if (body !== undefined) request.write(body);
        request.end();
      });
    });
    if (signal) {
      if (signal.aborted) return abort();
      signal.addEventListener("abort", abort, { once: true });
    }
    connectRequest.end();
  });
}

async function proxyFetch(url, options = {}) {
  const target = new URL(url);
  const proxy = new URL(outboundProxy);
  if (!/^https?:$/.test(proxy.protocol)) throw createError(502, `暂不支持 ${proxy.protocol} 出站代理，请使用 HTTP/HTTPS 代理`);
  const response = target.protocol === "https:"
    ? await proxyHttpsRequestOnce(target, options, proxy)
    : await proxyRequestOnce(target, options, proxy);
  const redirect = String(options.redirect || "follow").toLowerCase();
  const location = response.headers.get("location");
  if (redirect === "follow" && location && [301, 302, 303, 307, 308].includes(response.status) && Number(options._redirectCount || 0) < 5) {
    const next = { ...options, _redirectCount: Number(options._redirectCount || 0) + 1 };
    if ([301, 302, 303].includes(response.status) && !["GET", "HEAD"].includes(String(options.method || "GET").toUpperCase())) {
      next.method = "GET";
      delete next.body;
      const nextHeaders = requestHeaders(next.headers);
      delete nextHeaders["content-length"];
      delete nextHeaders["content-type"];
      next.headers = nextHeaders;
    }
    response.body?.resume?.();
    return proxyFetch(new URL(location, target).toString(), next);
  }
  return response;
}

async function loadOutboundProxy() {
  const envProxy = String(process.env.OUTBOUND_PROXY || process.env.TVBOX_PROXY || "").trim();
  if (envProxy) {
    outboundProxy = envProxy;
    outboundProxySource = "environment";
  } else {
    try {
      const proxyPath = process.env.PROXY_FILE || path.join(path.dirname(CONFIG_PATH), "proxy.txt");
      const value = (await fs.readFile(proxyPath, "utf8")).split(/\r?\n/).map((line) => line.trim()).find((line) => line && !line.startsWith("#"));
      outboundProxy = value || "";
      outboundProxySource = value ? proxyPath : "none";
    } catch {
      outboundProxy = "";
      outboundProxySource = "none";
    }
  }
  if (outboundProxy) {
    try {
      const parsed = new URL(outboundProxy);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error(`不支持 ${parsed.protocol}`);
      log("出站代理已启用", { source: outboundProxySource, protocol: parsed.protocol });
    } catch (error) {
      log("出站代理配置无效", { source: outboundProxySource, message: error.message });
      outboundProxy = "";
      outboundProxySource = "none";
    }
  }
}

async function remoteFetch(url, options = {}) {
  const target = new URL(url);
  if (!outboundProxy || noProxyMatches(target)) {
    const cached = publicDnsCache.get(target.hostname.toLowerCase());
    if (cached && cached.expiresAt > Date.now()) {
      try {
        return await dnsFallbackFetch(target, options, undefined, cached.address, true);
      } catch {
        // CDN records can rotate. Clear a failed cached route and use the
        // ordinary resolver path as a safe recovery route.
        publicDnsCache.delete(target.hostname.toLowerCase());
      }
    }
    try {
      return await fetch(url, options);
    } catch (error) {
      const code = error?.cause?.code || error?.code;
      if (!["ENOTFOUND", "EAI_AGAIN", "EAI_FAIL", "ENETUNREACH"].includes(code)) throw error;
      return dnsFallbackFetch(target, options, error);
    }
  }
  return proxyFetch(target.toString(), options);
}

async function resolvePublicIpv4(hostname) {
  const servers = [process.env.TVBOX_DNS, "223.5.5.5", "119.29.29.29", "1.1.1.1", "8.8.8.8"].filter(Boolean);
  let lastError;
  for (const server of servers) {
    try {
      const resolver = new dns.Resolver();
      resolver.setServers([server]);
      const addresses = await resolver.resolve4(hostname);
      if (addresses?.length) return addresses[0];
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("公网 DNS 无法解析 " + hostname);
}

function rememberPublicIpv4(hostname, address) {
  if (hostname && address) {
    publicDnsCache.set(String(hostname).toLowerCase(), { address, expiresAt: Date.now() + PUBLIC_DNS_CACHE_MS });
  }
}

function directIpRequest(target, options, address) {
  const client = target.protocol === "https:" ? https : http;
  const headers = requestHeaders(options.headers);
  headers.host = headers.host || target.host;
  const body = requestBody(options);
  return new Promise((resolve, reject) => {
    const requestOptions = {
      protocol: target.protocol,
      hostname: address,
      port: target.port || (target.protocol === "https:" ? 443 : 80),
      path: (target.pathname || "/") + (target.search || ""),
      method: String(options.method || "GET").toUpperCase(),
      headers,
      agent: false
    };
    if (target.protocol === "https:") requestOptions.servername = target.hostname;
    const request = client.request(requestOptions, (response) => resolve(nodeResponse(response, target.toString())));
    const abort = () => request.destroy(createError(504, "上游请求已取消"));
    request.once("error", reject);
    if (options.signal) {
      if (options.signal.aborted) return abort();
      options.signal.addEventListener("abort", abort, { once: true });
    }
    if (body !== undefined) request.write(body);
    request.end();
  });
}

async function dnsFallbackFetch(target, options, originalError, preferredAddress = "", cached = false) {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(target.hostname)) throw originalError;
  let current = target;
  let currentOptions = { ...options };
  for (let count = 0; count <= 5; count++) {
    let address = current.hostname.toLowerCase() === target.hostname.toLowerCase() ? preferredAddress : "";
    if (!address) {
      const remembered = publicDnsCache.get(current.hostname.toLowerCase());
      address = remembered && remembered.expiresAt > Date.now() ? remembered.address : "";
    }
    if (!address) {
      try {
        address = await resolvePublicIpv4(current.hostname);
        rememberPublicIpv4(current.hostname, address);
      } catch (error) {
        throw createError(502, "DNS 解析失败：" + current.hostname + "（默认 DNS 和公网 DNS 均失败：" + error.message + "）");
      }
    }
    if (!cached || current.hostname.toLowerCase() !== target.hostname.toLowerCase()) {
      log("使用公网 DNS 回退访问上游", { host: current.hostname, address });
    }
    const response = await directIpRequest(current, currentOptions, address);
    const location = response.headers.get("location");
    if (String(currentOptions.redirect || "follow").toLowerCase() !== "follow" ||
        !location || ![301, 302, 303, 307, 308].includes(response.status) || count === 5) return response;
    const next = new URL(location, current);
    if ([301, 302, 303].includes(response.status) && !["GET", "HEAD"].includes(String(currentOptions.method || "GET").toUpperCase())) {
      currentOptions = { ...currentOptions, method: "GET" };
      delete currentOptions.body;
    }
    response.body?.resume?.();
    current = next;
    preferredAddress = "";
    cached = false;
  }
  throw originalError;
}

function json(res, status, value, headers = {}) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    ...headers
  });
  res.end(body);
}

function text(res, status, value, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": contentType, "content-length": Buffer.byteLength(value) });
  res.end(value);
}

function errorResponse(res, error) {
  const status = Number(error?.statusCode || 500);
  const message = error instanceof Error ? error.message : String(error);
  log("request failed", { status, message });
  // Android Bridge documents `error`; the management page also consumes
  // `message`, so expose both names for compatible diagnostics.
  json(res, status, { code: status, error: message, message });
}

function createError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 2 * 1024 * 1024) throw createError(413, "请求体过大");
  }
  if (!body.trim()) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw createError(400, "JSON 格式错误");
  }
}

function normalizeConfig(value) {
  const configUrls = Array.isArray(value?.configUrls) ? value.configUrls.map((item, index) => {
    const sourceUrl = typeof item === "string" ? item.trim() : String(item?.url || "").trim();
    if (!/^https?:\/\/[^\s]+$/i.test(sourceUrl)) throw createError(400, "订阅地址无效，请填写 HTTP/HTTPS 地址");
    const id = String(typeof item === "string" ? index : item?.id ?? index);
    let defaultName = id;
    try { defaultName = new URL(sourceUrl).hostname || id; } catch {}
    return {
      id,
      name: String(typeof item === "string" ? defaultName : item?.name || defaultName).trim() || defaultName,
      url: sourceUrl,
      enabled: typeof item === "string" ? true : item?.enabled !== false
    };
  }) : [];
  const playMode = ["redirect", "proxy"].includes(value?.settings?.playMode) ? value.settings.playMode : "proxy";
  const defaultSiteId = String(value?.settings?.defaultSiteId || "");
  const refreshMinutes = Math.min(1440, Math.max(5, Number(value?.refreshMinutes || 60)));
  // `sites` remains an empty internal compatibility slot for the old /vod
  // handlers. New configurations never accept or expose AList site records.
  const activeId = configUrls.some(item => item.id === String(value?.activeId)) ? String(value.activeId) : (configUrls[0]?.id || "");
  return { settings: { playMode, defaultSiteId }, configUrls, refreshMinutes, sites: [], activeId, revision: Number(value?.revision || 0) };
}

function activeTvboxSites() {
  return tvboxSites.filter(site => site.configId === config.activeId && !isCatSetupSite(site));
}

function subscriptionCatalog() {
  return {
    activeId: config.activeId || "", revision: config.revision || 0,
    bridge: bridgeHealth(),
    sources: config.configUrls.map(item => {
      const status = configStatuses.find(status => status.id === item.id);
      return { ...item, active: item.id === config.activeId, state: ({ok:"ready",refreshing:"fetching"})[status?.state] || status?.state || "pending",
        siteCount: tvboxSites.filter(site => site.configId === item.id && !isCatSetupSite(site)).length,
        error: ["error", "stale"].includes(status?.state) ? status.message : "" };
    })
  };
}

function bridgeHealth() {
  const status = configStatuses.find(item => item.id === config.activeId);
  const count = activeTvboxSites().length;
  return { state: count ? "ready" : status?.state === "refreshing" ? "loading" : "error",
    message: count ? "配置已加载" : status?.message || "请添加订阅源", sources: count,
    url: config.configUrls.find(item => item.id === config.activeId)?.url || "" };
}

async function subscriptionAction(body) {
  const id = String(body.id || "");
  if (body.action === "select") {
    const target = config.configUrls.find(item => item.id === id && item.enabled);
    if (!target) throw createError(404, "订阅源不存在或已停用");
    if (!tvboxSites.some(site => site.configId === id)) throw createError(409, "订阅尚未抓取成功，请等待抓取完成后切换");
    await saveConfig({ ...config, activeId: id, revision: (config.revision || 0) + 1 });
    return { ...subscriptionCatalog(), accepted: true };
  }
  if (body.action === "save") {
    if(!isCatNodeSubscription(String(body.url||'')))throw createError(400,'只支持 Cat Node .js 或 .js.md5 订阅，不支持 JSON 订阅');
    const nextId = id || crypto.randomUUID();
    const entries = config.configUrls.filter(item => item.id !== nextId);
    entries.push({ id: nextId, name: String(body.name || ""), url: String(body.url || ""), enabled: true });
    await saveAndRefresh({ ...config, configUrls: entries }, nextId);
    return { ...subscriptionCatalog(), accepted: true };
  }
  if (body.action === "delete") {
    if (!config.configUrls.some(item => item.id === id)) throw createError(404, "订阅源不存在");
    const entries = config.configUrls.filter(item => item.id !== id);
    cancelCatalogRefresh(id, "订阅已删除");
    await saveConfig({ ...config, configUrls: entries, revision: (config.revision || 0) + 1 });
    tvboxSites = tvboxSites.filter(site => site.configId !== id);
    catalogCache.delete(id);
    configMetadata.delete(id);
    configStatuses = configStatuses.filter(status => status.id !== id);
    await saveCatalogCache();
    return { ...subscriptionCatalog(), accepted: true };
  }
  if (body.action === "reload") {
    startCatalogRefresh();
    return { ...subscriptionCatalog(), accepted: true };
  }
  throw createError(400, "未知订阅操作");
}

function publicConfig() {
  return {
    version: VERSION,
    activeId: config.activeId, revision: config.revision,
    settings: config.settings,
    configUrls: config.configUrls,
    refreshMinutes: config.refreshMinutes,
    sources: tvboxSites.filter(site=>!isCatSetupSite(site)).map((site) => bridgeSource(site)),
    sourceErrors: sourceCatalogErrors,
    configStatuses,
    network: { proxy: proxyStatus() }
  };
}

async function saveConfig(next) {
  if((next.configUrls||[]).some(item=>!isCatNodeSubscription(typeof item==='string'?item:item.url)))throw createError(400,'只支持 Cat Node .js 或 .js.md5 订阅，不支持 JSON 订阅');
  config = normalizeConfig(next);
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  log("TVBox configuration saved", { configUrls: config.configUrls.length });
}

async function saveAndRefresh(next, refreshId = "") {
  await saveConfig(next);
  scheduleCatalogRefresh();
  startCatalogRefresh(refreshId);
  return publicConfig();
}

function isRefreshAbort(error, signal) {
  return Boolean(signal?.aborted) || error?.name === "AbortError" || error?.cause?.name === "AbortError";
}

function markRefreshCancelled(onlyId, message = "已取消抓取") {
  for (const status of configStatuses) {
    if (onlyId && status.id !== onlyId) continue;
    if (status.state === "refreshing") {
      status.state = "cancelled";
      status.message = message;
      status.cancelledAt = new Date().toISOString();
    }
  }
}

function cancelCatalogRefresh(onlyId = "", message = "已取消抓取") {
  if (!catalogRefreshJob) return false;
  // A full refresh includes every row, so an edit to any row cancels it.
  if (onlyId && catalogRefreshJob.onlyId && catalogRefreshJob.onlyId !== onlyId) return false;
  catalogRefreshJob.controller.abort();
  markRefreshCancelled(catalogRefreshJob.onlyId || onlyId, message);
  return true;
}

function startCatalogRefresh(onlyId = "") {
  cancelCatalogRefresh("", "被新的订阅操作取消");
  const controller = new AbortController();
  const job = { onlyId, controller, startedAt: Date.now() };
  catalogRefreshJob = job;
  // Management requests must return immediately. A broken URL is handled by
  // the background job and must never lock the add/edit form.
  void refreshTvboxCatalog(onlyId, controller.signal)
    .catch((error) => {
      if (!isRefreshAbort(error, controller.signal)) log("后台订阅刷新失败", { id: onlyId || "all", message: error.message });
    })
    .finally(() => { if (catalogRefreshJob === job) catalogRefreshJob = undefined; });
}

async function loadConfig() {
  try {
    config = normalizeConfig(JSON.parse(await fs.readFile(CONFIG_PATH, "utf8")));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await saveConfig({ settings: { playMode: "proxy", defaultSiteId: "" }, configUrls: [], refreshMinutes: 60 });
  }
  const entries=config.configUrls.filter(item=>isCatNodeSubscription(item.url));
  if(entries.length!==config.configUrls.length)await saveConfig({...config,configUrls:entries,activeId:entries.some(item=>item.id===config.activeId)?config.activeId:(entries[0]?.id||''),revision:(config.revision||0)+1});
}

async function loadCatalogCache() {
  try {
    const value = JSON.parse(await fs.readFile(CATALOG_CACHE_PATH, "utf8"));
    for (const [id, item] of Object.entries(value || {})) {
      if (isCatNodeSubscription(item?.url) && Array.isArray(item.sites)) catalogCache.set(String(id), {...item, sites:item.sites.filter(site=>site.runtime==='cat-node' && site.runtimeBase)});
    }
  } catch (error) {
    if (error?.code !== "ENOENT") log("解析缓存读取失败", { message: error.message });
  }
}

async function saveCatalogCache() {
  const value = Object.fromEntries(catalogCache.entries());
  await fs.mkdir(path.dirname(CATALOG_CACHE_PATH), { recursive: true });
  await fs.writeFile(CATALOG_CACHE_PATH, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function restoreCatalogCache() {
  const restored = [];
  const statuses = [];
  for (const item of config.configUrls) {
    const cached = catalogCache.get(item.id);
    if (item.enabled && cached?.url === item.url && cached.sites?.length) {
      restored.push(...cached.sites.map((site) => ({ ...site, configName: item.name })));
      configMetadata.set(item.id, cached.metadata || { parses: [], lives: [], rules: [] });
      statuses.push({ id: item.id, name: item.name, url: item.url, enabled: true, state: "stale", message: `使用上次成功缓存（${cached.sites.length} 个源），正在刷新`, sourceCount: cached.sites.length, cachedAt: cached.savedAt || null, fetchedAt: null });
    } else {
      statuses.push({ id: item.id, name: item.name, url: item.url, enabled: item.enabled, state: item.enabled ? "refreshing" : "disabled", message: item.enabled ? "正在抓取…" : "已停用", sourceCount: 0, fetchedAt: null });
    }
  }
  tvboxSites = restored;
  configStatuses = statuses;
}

function requireAdmin(req) {
  if (!ADMIN_TOKEN) return;
  const supplied = String(req.headers["x-admin-token"] || "").trim();
  if (supplied !== ADMIN_TOKEN) throw createError(401, "需要管理令牌");
}

function publicBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const forwarded = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwarded || "http";
  return `${protocol}://${req.headers.host || `localhost:${PORT}`}`;
}

function isDockerExecutableTvboxSite(site){return site.runtime==='cat-node' && catNodeEnabled();}

async function fetchConfigUrl(configUrl, signal) {
 if(!isCatNodeSubscription(configUrl))throw createError(400,'只支持 Cat Node .js 或 .js.md5 订阅，不支持 JSON 订阅');
 if(!catNodeEnabled())throw createError(503,'Cat Node 服务未启用');
 return {sites:await catNodeCatalog(remoteFetch,signal,configUrl),metadata:{parses:[],lives:[],rules:[]},status:200,finalUrl:configUrl,contentType:'application/javascript'};
}

async function refreshTvboxCatalog(onlyId = "", signal) {
  const next = [];
  const errors = onlyId ? sourceCatalogErrors.filter((item) => item.id !== onlyId) : [];
  if (!onlyId) configMetadata.clear();
  else configMetadata.delete(onlyId);
  const previousStatuses = new Map(configStatuses.map((item) => [item.id, item]));
  const statuses = config.configUrls.map((configItem) => {
    const previous = previousStatuses.get(configItem.id);
    if (onlyId && configItem.id !== onlyId && previous) return previous;
    return {
    id: configItem.id,
    name: configItem.name,
    url: configItem.url,
    enabled: configItem.enabled,
    state: configItem.enabled ? "refreshing" : "disabled",
    message: configItem.enabled ? "正在抓取…" : "已停用",
    sourceCount: 0,
    fetchedAt: null
    };
  });
  if (onlyId) next.push(...tvboxSites.filter((site) => site.configId !== onlyId));
  configStatuses = statuses;
  const targets = onlyId ? config.configUrls.filter((item) => item.id === onlyId) : config.configUrls;
  for (const configItem of targets) {
    const status = statuses.find((item) => item.id === configItem.id);
    if (!configItem.enabled) continue;
    try {
      const result = await fetchConfigUrl(configItem.url, signal);
      if(signal?.aborted) return publicConfig();
      const sites = result.sites;
      configMetadata.set(configItem.id, result.metadata || { parses: [], lives: [], rules: [] });
      const mappedSites = [];
      for (const site of sites) {
        // Do not merge or deduplicate sources from different configuration
        // addresses. Prefixing the key keeps each source independently
        // addressable by Bridge even when two configs use the same raw key.
        const rawKey = site.key || "site";
        const key = `${configItem.id}:${rawKey}`;
        mappedSites.push({
          ...site,
          key,
          rawKey,
          configId: configItem.id,
          configName: configItem.name
        });
      }
      next.push(...mappedSites);
      const previousSites=tvboxSites.filter(site=>site.configId===configItem.id);
      tvboxSites=[...tvboxSites.filter(site=>site.configId!==configItem.id && config.configUrls.some(item=>item.id===site.configId && item.enabled)),...mappedSites];
      if(previousSites.length && config.activeId===configItem.id && JSON.stringify(previousSites)!==JSON.stringify(mappedSites)) {
        await saveConfig({...config,revision:(config.revision||0)+1});
      }
      catalogCache.set(configItem.id, { url: configItem.url, sites: mappedSites, metadata: result.metadata || { parses: [], lives: [], rules: [] }, savedAt: new Date().toISOString() });
      status.state = "ok";
      status.message = `抓取成功，解析 ${sites.length} 个源`;
      status.sourceCount = sites.length;
      status.httpStatus = result.status;
      status.finalUrl = result.finalUrl;
      status.contentType = result.contentType;
      status.fetchedAt = new Date().toISOString();
      log("TVBox 配置已刷新", { id: configItem.id, url: configItem.url, sources: sites.length });
    } catch (error) {
      if (isRefreshAbort(error, signal)) {
        status.state = "cancelled";
        status.message = "已取消抓取";
        status.cancelledAt = new Date().toISOString();
        log("TVBox 配置抓取已取消", { id: configItem.id, url: configItem.url });
        // Do not publish the partially assembled catalogue.  Keeping the
        // previous successful data means cancelling a slow or mistyped URL
        // cannot make unrelated subscriptions disappear from OKBOX.
        return publicConfig();
      }
      const message = error.message || "抓取失败";
      const cached = catalogCache.get(configItem.id);
      status.state = "error";
      status.message = message;
      status.fetchedAt = new Date().toISOString();
      if (cached?.url === configItem.url && cached.sites?.length) {
        const cachedSites = cached.sites.map((site) => ({ ...site, configName: configItem.name }));
        next.push(...cachedSites);
        configMetadata.set(configItem.id, cached.metadata || { parses: [], lives: [], rules: [] });
        status.state = "stale";
        status.message = `抓取失败，沿用上次成功缓存（${cachedSites.length} 个源）：${message}`;
        status.sourceCount = cachedSites.length;
        status.cachedAt = cached.savedAt || null;
      }
      errors.push({ id: configItem.id, name: configItem.name, url: configItem.url, message });
      log("TVBox 配置刷新失败", { id: configItem.id, url: configItem.url, message });
    }
  }
  if(signal?.aborted)return publicConfig();
  tvboxSites = next;
  sourceCatalogErrors = errors;
  configStatuses = statuses;
  await saveCatalogCache().catch((error) => log("解析缓存保存失败", { message: error.message }));
  return publicConfig();
}

function scheduleCatalogRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  // Check subscription freshness, not video pages. Never cancel an in-flight
  // user operation just because an automatic timer fired.
  refreshTimer = setInterval(() => {
    if(catalogRefreshJob)return;
    const now=Date.now();
    const due=config.configUrls.find(item=>item.enabled && now-(Date.parse(configStatuses.find(s=>s.id===item.id)?.fetchedAt)||0)>=
      Math.min(config.refreshMinutes,5)*60000);
    if(due)startCatalogRefresh(due.id);
  },60000);
}

function tvboxSite(key) {
  const site = tvboxSites.find((item) => item.key === String(key || ""));
  if (!site || isCatSetupSite(site)) throw createError(404, "TVBox 源不存在或配置尚未刷新");
  return site;
}

function tvboxResult(value) {
  if (!value || typeof value !== "object") throw createError(502, "TVBox 源返回了无效数据");
  if (value.code === undefined && value.list === undefined && value.vod_list === undefined && value.data === undefined && value.class === undefined) {
    return { code: 1, msg: "", page: 1, pagecount: 1, limit: 100, total: 0, list: [] };
  }
  return value;
}

function normalizeHttpHeaders(value) {
  if (value && typeof value === "object") return value;
  const textValue = String(value || "").trim();
  if (!textValue) return {};
  try {
    const parsed = JSON.parse(textValue);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {}
  return Object.fromEntries(textValue.split(/[&|\n]/).map((item) => item.trim()).filter(Boolean).map((item) => {
    const index = item.indexOf("=");
    return index > 0 ? [item.slice(0, index).trim(), item.slice(index + 1).trim()] : [item, ""];
  }));
}

function bridgeSource(site) {
  return {
    key: site.key || site.id,
    name: site.name,
    type: Number(site.type || 3),
    searchable: site.searchable ? 1 : 0,
    quickSearch: site.searchable ? 1 : 0,
    filterable: site.filterable ? 1 : 0,
    runtime: site.runtime || "unknown",
    nodeCrawler: nodeCrawlerStatus(site),
    catAdapter: site.runtime==='cat-node',
    dockerExecutable: isDockerExecutableTvboxSite(site),
    configId: site.configId || "",
    sourceUrl: site.sourceUrl || "",
    rawKey: site.rawKey || site.key || site.id || ""
  };
}

function mediaToken(entry) {
  const token = crypto.randomBytes(18).toString("base64url");
  mediaTokens.set(token, { ...entry, expiresAt: Date.now() + 30 * 60 * 1000 });
  return token;
}

function getMediaToken(token) {
  const entry = mediaTokens.get(String(token || ""));
  if (!entry || entry.expiresAt <= Date.now()) {
    mediaTokens.delete(String(token || ""));
    throw createError(404, "播放地址已过期，请重新打开视频");
  }
  entry.expiresAt = Date.now() + 30 * 60 * 1000;
  return entry;
}

async function bridgeTvboxRuntimePlayer(req,request,site){
 await syncCatAccounts(site.runtimeBase);
 let value=await catNodeRequest(site,request,remoteFetch);
 if(Number(value?.parse)||Number(value?.jx))value=await resolvePlayerPage(value,remoteFetch,normalizeHttpHeaders(value.header||value.headers));
 const url=String(value?.url||value?.streamUrl||'').trim();if(!/^https?:\/\//i.test(url))throw createError(502,'Cat Node 没有返回 HTTP 播放地址');
 const token=mediaToken({url,siteId:site.key,resourcePath:url,headers:normalizeHttpHeaders(value.header||value.headers),transform:value.mediaTransform});
 const {mediaTransform,...result}=value;return {...result,parse:0,jx:0,url:'',streamUrl:publicBaseUrl(req)+'/api/media?token='+encodeURIComponent(token)};
}

async function bridgeTvboxSpider(req,request,site){
 if(!isDockerExecutableTvboxSite(site))throw createError(501,`源“${site.name}”尚未匹配 Cat Node 适配器`);
 if(request.action==='player')return bridgeTvboxRuntimePlayer(req,request,site);
 // Browsing does not require credentials. Account changes sync through the
 // management API, and playback still waits for synchronization above.
 const value=await catNodeRequest(site,request,remoteFetch);
 return tvboxResult(rewriteCatPosters(value,site,url=>publicBaseUrl(req)+'/api/media?token='+
   encodeURIComponent(mediaToken({url,siteId:site.key,headers:{}}))));
}

async function bridgeSpider(req, request) {
  const action = String(request.action || "").trim();
  const remoteSite = tvboxSites.find((item) => item.key === String(request.siteKey || "").trim());
  if (remoteSite && !isCatSetupSite(remoteSite)) return bridgeTvboxSpider(req, request, remoteSite);
  throw createError(400, `不支持的 Bridge 操作：${action || "空操作"}`);
}

async function proxyMediaToken(req, res, token) {
  const entry = getMediaToken(token);
  const headers = { ...(entry.headers || {}) };
  // An open-ended request from byte zero can be served as a full 200 response.
  // The source's PNG prefix must be removed before demuxers sniff the stream.
  if (req.headers.range && !entry.url.toLowerCase().includes('.m3u8') && !(['hhjx-ts','hls-ts'].includes(entry.transform) && /^bytes=0-$/i.test(req.headers.range))) headers.range = req.headers.range;
  // Source-provided request headers are part of its playback contract.
  // Replacing its UA with the client's UA can return an anti-bot page.
  // Otherwise keep the HTTP client's stable default, independent of player UA.
  const cachedPlaylist = req.method === 'GET' && entry.playlist;
  const upstream = cachedPlaylist ? new Response(cachedPlaylist.source,{headers:{'content-type':'application/vnd.apple.mpegurl'}}) : await remoteFetch(entry.url, { method: req.method, headers, redirect: "follow", signal: AbortSignal.timeout(30000) });
  const contentType = String(upstream.headers.get("content-type") || "").toLowerCase();
  const playlist = contentType.includes("mpegurl") || entry.url.toLowerCase().includes(".m3u8");
  if (req.method === "GET" && playlist && upstream.body) {
    const source = await upstream.text();
    const base = cachedPlaylist?.base || upstream.url || entry.url;
    if(upstream.ok && source.trimStart().startsWith('#EXTM3U') && source.length<=2*1024*1024 && /#EXT-X-(?:ENDLIST|PLAYLIST-TYPE:VOD)/.test(source)) {
      for(const item of mediaPlaylistEntries) if(item.expiresAt<=Date.now()){delete item.playlist;mediaPlaylistEntries.delete(item);}
      if(!mediaPlaylistEntries.has(entry) && mediaPlaylistEntries.size>=16){const oldest=mediaPlaylistEntries.values().next().value;delete oldest.playlist;mediaPlaylistEntries.delete(oldest);}
      entry.playlist={source,base};mediaPlaylistEntries.add(entry);
    }
    const proxyChild = (value) => {
      const candidate = String(value || "").trim();
      if (!candidate) return candidate;
      try {
        const child = new URL(candidate, base).toString();
        const childToken = mediaToken({ url: child, siteId: entry.siteId, resourcePath: entry.resourcePath, headers: entry.headers || {}, transform:entry.transform || 'hls-ts' });
        return `/api/media?token=${encodeURIComponent(childToken)}`;
      } catch {
        return candidate;
      }
    };
    const output = source.split(/\r?\n/).map((line) => {
      const value = line.trim();
      if (!value) return line;
      // HLS uses URI attributes for AES keys, init maps and alternate media.
      // They may be relative paths, so rewriting only non-comment segment
      // lines causes an encrypted playlist to load but fail at decryption.
      if (value.startsWith("#")) {
        return line.replace(/URI=(['"])(.*?)\1/g, (_match, quote, target) => `URI=${quote}${proxyChild(target)}${quote}`);
      }
      return proxyChild(value);
    }).join("\n");
    return text(res, upstream.ok ? 200 : upstream.status, output, "application/vnd.apple.mpegurl; charset=utf-8");
  }
  if(req.method === "GET" && upstream.status===200 && ['hhjx-ts','hls-ts'].includes(entry.transform) && upstream.body) return streamTsMedia(upstream,res);
  const outputHeaders = {};
  for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"]) {
    const value = upstream.headers.get(name);
    if (value) outputHeaders[name] = value;
  }
  res.writeHead(upstream.status, outputHeaders);
  if (req.method === "HEAD" || !upstream.body) return res.end();
  for await (const chunk of upstream.body) res.write(chunk);
  res.end();
}

function subscriptionConfig(req, requestedId) {
  // Keep every subscription address independent. `/sub/{id}` is the
  // server-owned subscription generated for exactly one remote config URL.
  const ids = config.configUrls.map((item) => item.id);
  const selectedId = !requestedId ? config.activeId : requestedId === "0" && !ids.includes("0") ? ids[0] : requestedId;
  if (selectedId === "all") throw createError(400, "请使用多仓入口选择独立订阅，不支持合并全部仓库");
  const activeSites = tvboxSites.filter((site) => !isCatSetupSite(site) && site.configId === selectedId);
  const metadata = configMetadata.get(selectedId) || { parses: [], lives: [], rules: [] };
  const base = publicBaseUrl(req);
  const sites = activeSites.map((site) => ({
    key: site.key,
    name: site.name,
    // The generated subscription is served by Bridge, so clients should
    // call our HTTP endpoint instead of downloading the original Spider.
    type: 1,
    api: `${base}/vod?site=${encodeURIComponent(site.key)}`,
    // OKBOX uses this flag to exclude incompatible cached sites.
    dockerExecutable: isDockerExecutableTvboxSite(site),
    searchable: isDockerExecutableTvboxSite(site) && site.searchable ? 1 : 0,
    quickSearch: isDockerExecutableTvboxSite(site) && site.searchable ? 1 : 0,
    filterable: site.filterable ? 1 : 0
  }));
  return {
    spider: "",
    wallpaper: "",
    sites,
    // Keep live channels, parsers and rules from the selected TVBox config
    // visible to clients. The source list itself remains Bridge-generated and
    // is never merged with another subscription.
    parses: metadata.parses || [],
    lives: metadata.lives || [],
    rules: metadata.rules || [],
    ext: { configId: selectedId || "", sites: activeSites.map((site) => ({ id: site.key, name: site.name })) }
  };
}

async function tvboxVodResponse(req, url) {
  const site = tvboxSite(url.searchParams.get("site"));
  if (!isDockerExecutableTvboxSite(site)) {
    throw createError(409, `源“${site.name}”不是当前可执行的 Cat Node 站点，请刷新订阅`);
  }
  const ids = String(url.searchParams.get("ids") || "").trim();
  const keyword = String(url.searchParams.get("wd") || "").trim();
  const categoryId = String(url.searchParams.get("t") || "").trim();
  const request = { siteKey: site.key, page: Math.max(1, Number(url.searchParams.get("pg") || 1)) };
  const play = String(url.searchParams.get("play") || "").trim();
  if (play) { request.action = "player"; request.id = play; request.flag = String(url.searchParams.get("flag") || ""); }
  else if (ids) { request.action = "detail"; request.id = ids; }
  else if (keyword) { request.action = "search"; request.keyword = keyword; }
  else if (categoryId) { request.action = "category"; request.categoryId = categoryId; }
  else request.action = "home";
  return bridgeTvboxSpider(req, request, site);
}

// TVBoxOS changes a failed title to another source by searching the exact
// title, loading its detail, then restoring the matching episode. Keep that
// decision in Docker so OKBOX has one portable path for every supported
// runtime instead of duplicating source-specific fallback rules in the app.
function fallbackTitle(value) {
  return String(value || "").toLowerCase()
    .replace(/[\s·：:《》「」【】\[\]（）()<>]/g, "").trim();
}

function fallbackRecords(value) {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value.list)) return value.list;
  if (Array.isArray(value.vod_list)) return value.vod_list;
  if (Array.isArray(value.data)) return value.data;
  if (Array.isArray(value.result)) return value.result;
  if (value.data && typeof value.data === "object") return fallbackRecords(value.data);
  if (value.result && typeof value.result === "object") return fallbackRecords(value.result);
  if (value.vod && typeof value.vod === "object") return [value.vod];
  if (value.vod_id !== undefined || value.id !== undefined || value.vod_name || value.name || value.title) return [value];
  return [];
}

function fallbackVodTitle(vod) {
  return String(vod?.vod_name || vod?.name || vod?.title || "").trim();
}

function fallbackVodId(vod) {
  return String(vod?.vod_id ?? vod?.id ?? "").trim();
}

function fallbackEpisodes(vod) {
  const flags = String(vod?.vod_play_from || vod?.play_from || "").split("$$$");
  const groups = String(vod?.vod_play_url || vod?.playUrl || "").split("$$$");
  const episodes = [];
  groups.forEach((group, groupIndex) => {
    if (!String(group || "").trim()) return;
    const defaultFlag = "线路 " + String(groupIndex + 1);
    const flag = String(flags[groupIndex] || defaultFlag).trim() || defaultFlag;
    String(group).split("#").forEach((record, episodeIndex) => {
      const text = String(record || "").trim();
      if (!text) return;
      const marker = text.indexOf("$");
      const name = (marker >= 0 ? text.slice(0, marker) : String(episodeIndex + 1)).trim() || String(episodeIndex + 1);
      const id = (marker >= 0 ? text.slice(marker + 1) : text).trim();
      if (id) episodes.push({ name, id, flag, groupIndex, episodeIndex });
    });
  });
  return episodes;
}

function fallbackEpisodeNumber(value) {
  const match = String(value || "").replace(/第\s*/g, "").match(/(\d{1,4})\s*(?:集|话|期|\b)/i);
  return match ? Number(match[1]) : Number.NaN;
}

function selectFallbackEpisode(vod, desired = {}) {
  const episodes = fallbackEpisodes(vod);
  if (!episodes.length) return undefined;
  const name = fallbackTitle(desired.name || "");
  const exact = name ? episodes.find((episode) => fallbackTitle(episode.name) === name) : undefined;
  if (exact) return exact;
  const desiredNumber = fallbackEpisodeNumber(desired.name);
  if (Number.isFinite(desiredNumber)) {
    const numbered = episodes.find((episode) => fallbackEpisodeNumber(episode.name) === desiredNumber);
    if (numbered) return numbered;
  }
  const index = Number(desired.index);
  if (Number.isInteger(index) && index >= 0) {
    const sameGroup = episodes.find((episode) => episode.groupIndex === Number(desired.groupIndex || 0) && episode.episodeIndex === index);
    if (sameGroup) return sameGroup;
    const sameIndex = episodes.find((episode) => episode.episodeIndex === index);
    if (sameIndex) return sameIndex;
  }
  return episodes[0];
}

async function tvboxPlaybackFallback(req, request) {
  const title = String(request.title || "").trim();
  const normalizedTitle = fallbackTitle(title);
  if (!normalizedTitle) throw createError(400, "自动换源需要视频标题");
  const originSiteKey = String(request.originSiteKey || "").trim();
  const episode = request.episode && typeof request.episode === "object" ? request.episode : {};
  // A bounded sequential search keeps a failing upstream from turning a tap
  // into dozens of concurrent Spider executions. Successful portable sources
  // are tried in subscription order, using TVBoxOS's exact-title rule.
  const candidates = tvboxSites.filter((site) => site.key !== originSiteKey &&
    isDockerExecutableTvboxSite(site) && site.searchable).slice(0, 24);
  const attempts = [];
  for (const site of candidates) {
    try {
      const searched = await bridgeTvboxSpider(req, { action: "search", siteKey: site.key, keyword: title, page: 1, quick: false }, site);
      const match = fallbackRecords(searched).find((vod) => fallbackTitle(fallbackVodTitle(vod)) === normalizedTitle);
      if (!match) {
        attempts.push({ source: site.name, state: "not-found" });
        continue;
      }
      const id = fallbackVodId(match);
      if (!id) {
        attempts.push({ source: site.name, state: "missing-detail" });
        continue;
      }
      const detailed = await bridgeTvboxSpider(req, { action: "detail", siteKey: site.key, id }, site);
      const vod = fallbackRecords(detailed)[0] || match;
      const selected = selectFallbackEpisode(vod, episode);
      if (!selected) {
        attempts.push({ source: site.name, state: "missing-episode" });
        continue;
      }
      const player = await bridgeTvboxSpider(req, { action: "player", siteKey: site.key, id: selected.id, flag: selected.flag }, site);
      const streamUrl = String(player?.streamUrl || playerUrlFromResult(player) || "").trim();
      if (!/^https?:\/\//i.test(streamUrl)) {
        attempts.push({ source: site.name, state: "no-play-url" });
        continue;
      }
      log("TVBox 自动换源成功", { title, origin: originSiteKey, target: site.key, episode: selected.name });
      return { ok: true, title, source: { key: site.key, name: site.name }, episode: selected, player, attempts };
    } catch (error) {
      attempts.push({ source: site.name, state: "failed", message: String(error?.message || "播放失败").slice(0, 120) });
    }
  }
  throw createError(502, "未找到可播放的替代源：" + title);
}

async function serveStatic(req, res, pathname) {
  const relative = pathname === "/admin" || pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  if (relative.includes("..")) throw createError(404, "Not found");
  const filePath = path.join(ROOT, "public", relative);
  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
    // The management page is served from the same container image as the
    // service. Avoid stale app.js after a Docker recreate, otherwise the
    // newly added cancel action may remain invisible in the browser.
    res.writeHead(200, { "content-type": types[ext] || "application/octet-stream", "content-length": content.length, "cache-control": "no-store" });
    res.end(content);
  } catch {
    throw createError(404, "Not found");
  }
}

async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;
  if (pathname.startsWith("/cloud/")) {
    if (!["127.0.0.1","::1","::ffff:127.0.0.1"].includes(req.socket.remoteAddress)) throw createError(403,"凭据接口仅限服务端内部使用");
    if (pathname === "/cloud/config") return json(res,200,await cloudHost.call({action:"gateway-config"}));
    if (pathname === "/cloud/tokenm") return json(res,200,await cloudHost.call({action:"gateway-token"}));
    if (pathname.startsWith("/cloud/credential/")) {const value=await cloudHost.call({action:"gateway-credential",provider:pathname.slice(18)});res.writeHead(200,{"content-type":"text/plain; charset=utf-8","cache-control":"no-store"});return res.end(String(value||""));}
    throw createError(404,"接口不存在");
  }
  if (pathname === "/health" || pathname === "/api/health") {
    return json(res, 200, {
      ok: true,
      ...bridgeHealth(),
      service: "tvbox-lite",
      version: VERSION,
      sources: activeTvboxSites().length,
      proxy: proxyStatus(),
      catNode: {enabled:catNodeEnabled()},
      uptimeMs: Date.now() - startedAt
    });
  }
  // OKBOX calls the Bridge protocol without the admin token.  Only the
  // management APIs are protected; source browsing and playback remain LAN
  // service APIs so the client can use them directly.
  const publicApi = pathname === "/api/subscriptions" || pathname === "/api/sources" || pathname === "/api/spider" || pathname === "/api/fallback" || pathname === "/api/media" || pathname === "/api/media/info";
  if (pathname.startsWith("/api/") && !publicApi) requireAdmin(req);
  if(pathname==='/api/crawlers/status' && req.method==='GET')return json(res,200,{subscriptions:configStatuses,sites:tvboxSites.filter(site=>!isCatSetupSite(site)).map(site=>({key:site.key,name:site.name,api:site.api,configId:site.configId,...nodeCrawlerStatus(site)}))});

  if (pathname === "/api/cloud/accounts" && req.method === "GET") return json(res, 200, withCatAccountStatus(await cloudHost.call({action:"catalog"})));
  if (pathname === "/api/cloud/gateway" && req.method === "GET") return json(res,200,await cloudHost.call({action:"gateway-status"}));
  if (pathname === "/api/cloud/accounts" && req.method === "POST") {
    const body = await readJsonBody(req);
    const allowed = new Set(["save","delete","enable","disable","login","validate","auth-start","auth-poll","auth-cancel"]);
    if (!allowed.has(body.action)) throw createError(400, "未知网盘账号操作");
    const result=await cloudHost.call(body);
    if(catNodeEnabled() && (['save','delete','enable','disable','login','validate'].includes(body.action)||body.action==='auth-poll'&&result.state==='complete'))await syncCatAccounts();
    return json(res, 200, result.accounts?withCatAccountStatus(result):result);
  }
  if (pathname === "/api/cloud/inspect" && req.method === "POST") return json(res, 200, await cloudHost.call({...await readJsonBody(req),action:"inspect"}));

  if (pathname === "/api/subscriptions" && req.method === "GET") return json(res, 200, subscriptionCatalog());
  if (pathname === "/api/subscriptions" && req.method === "POST") {
    const body = await readJsonBody(req);
    if (body.action !== "select") requireAdmin(req);
    return json(res, 200, await subscriptionAction(body));
  }

  if (req.method === "GET" && pathname === "/api/sources") {
    const sites = activeTvboxSites().map(bridgeSource);
    return json(res, 200, { sites, errors: sourceCatalogErrors });
  }
  if (req.method === "POST" && pathname === "/api/spider") {
    const request = await readJsonBody(req);
    return json(res, 200, await bridgeSpider(req, request));
  }
  if (req.method === "POST" && pathname === "/api/fallback") {
    const request = await readJsonBody(req);
    return json(res, 200, await tvboxPlaybackFallback(req, request));
  }
  if ((req.method === "GET" || req.method === "HEAD") && pathname === "/api/media") {
    return proxyMediaToken(req, res, url.searchParams.get("token"));
  }
  if (req.method === "GET" && pathname === "/api/media/info") {
    const entry = getMediaToken(url.searchParams.get("token"));
    const value = `${entry.url} ${entry.resourcePath || ""}`.toLowerCase();
    const kind = value.includes(".m3u8") ? "hls" : value.includes(".mkv") || value.includes(".webm") ? "mkv" : value.includes(".mp4") || value.includes(".mov") ? "mp4" : "direct";
    const probeEntry=kind==='hls'||entry.transform==='hhjx-ts'?{url:`http://127.0.0.1:${PORT}/api/media?token=${encodeURIComponent(url.searchParams.get('token'))}`,headers:{}}:entry;
    return json(res, 200, await probeMedia(probeEntry,kind));
  }

  if (req.method === "GET" && pathname === "/api/state") return json(res, 200, publicConfig());
  if (req.method === "GET" && pathname === "/api/logs") return json(res, 200, logs.slice(-100));
  if (req.method === "PUT" && pathname.startsWith("/api/config-url/")) {
    const id = decodeURIComponent(pathname.slice("/api/config-url/".length)).trim();
    if (!id) throw createError(400, "配置地址 ID 不能为空");
    const body = await readJsonBody(req);
    const existing = config.configUrls.find((item) => item.id === id);
    const nextItem = {
      id,
      name: String(body.name || existing?.name || "").trim(),
      url: String(body.url || "").trim(),
      enabled: body.enabled !== false
    };
    if (!nextItem.url) throw createError(400, "配置地址不能为空");
    const nextUrls = config.configUrls.some((item) => item.id === id)
      ? config.configUrls.map((item) => item.id === id ? nextItem : item)
      : [...config.configUrls, nextItem];
    return json(res, 200, await saveAndRefresh({ ...config, configUrls: nextUrls }, id));
  }
  if (req.method === "DELETE" && pathname.startsWith("/api/config-url/")) {
    const id = decodeURIComponent(pathname.slice("/api/config-url/".length)).trim();
    if (!config.configUrls.some((item) => item.id === id)) throw createError(404, "配置地址不存在");
    const nextUrls = config.configUrls.filter((item) => item.id !== id);
    cancelCatalogRefresh(id, "订阅已删除，停止抓取");
    catalogCache.delete(id);
    await saveCatalogCache().catch(() => {});
    return json(res, 200, await saveAndRefresh({ ...config, configUrls: nextUrls, revision: (config.revision || 0) + 1 }, id));
  }
  if (req.method === "POST" && pathname.startsWith("/api/config-url/") && pathname.endsWith("/cancel")) {
    const id = decodeURIComponent(pathname.slice("/api/config-url/".length, -"/cancel".length)).trim();
    if (!config.configUrls.some((item) => item.id === id)) throw createError(404, "配置地址不存在");
    const cancelled = cancelCatalogRefresh(id);
    if (!cancelled) markRefreshCancelled(id);
    return json(res, 200, { ...publicConfig(), cancelled: true });
  }
  if (req.method === "PUT" && pathname === "/api/config") {
    const body = await readJsonBody(req);
    return json(res, 200, await saveAndRefresh({ ...config, settings: body.settings || config.settings, configUrls: body.configUrls || config.configUrls, refreshMinutes: body.refreshMinutes || config.refreshMinutes }));
  }
  if (req.method === "POST" && pathname === "/api/refresh") {
    startCatalogRefresh();
    return json(res, 200, publicConfig());
  }
  if (req.method === "POST" && pathname === "/api/reload") {
    await loadConfig();
    startCatalogRefresh();
    return json(res, 200, publicConfig());
  }
  if (req.method === "GET" && (pathname === "/sub" || pathname.startsWith("/sub/"))) {
    if(pathname === "/sub/okbox.json") return json(res,200,{format:"okbox-bridge-warehouse/v3",name:"OKBOX",bridge:publicBaseUrl(req),...subscriptionCatalog(),urls:config.configUrls.map(item=>({id:item.id,name:item.name,url:`${publicBaseUrl(req)}/sub/${encodeURIComponent(item.id)}.json`}))});
    const requestedId = pathname.split("/")[2] || "";
    return json(res, 200, subscriptionConfig(req, requestedId.replace(/\.json$/,"")));
  }
  if (req.method === "GET" && pathname === "/vod") {
    if (url.searchParams.has("site") && tvboxSites.some((site) => site.key === url.searchParams.get("site"))) {
      return json(res, 200, await tvboxVodResponse(req, url));
    }
    throw createError(404,"请选择有效影视源");
  }
  if (req.method === "GET" && (pathname === "/" || pathname === "/admin" || pathname.startsWith("/assets/"))) return serveStatic(req, res, pathname);
  throw createError(404, "Not found");
}

await loadConfig();
await loadCatalogCache();
await loadOutboundProxy();
restoreCatalogCache();
startCatalogRefresh();
scheduleCatalogRefresh();
const server = http.createServer((req, res) => {
  handler(req, res).catch((error) => errorResponse(res, error));
});
process.on("SIGTERM", () => { cloudHost.close(); server.close(() => process.exit(0)); });
process.on("SIGINT", () => { cloudHost.close(); server.close(() => process.exit(0)); });
server.listen(PORT, HOST, () => log("tvbox-lite started", { host: HOST, port: PORT, config: CONFIG_PATH }));
