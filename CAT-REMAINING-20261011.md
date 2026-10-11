# 剩余入口复核（2026-10-11）

最新 Cat MD5：0e89531f459dc4bb6f6abbbbf7392493。隔离 Docker 实测，无个人账号，不能等同于服务器实际网络及播放验证。

## 已处理

- 保留 class 分类目录、初始化生命周期及子爬虫 NODE_OPTIONS 继承沿用上一版修复。
- 盘迷：公共页面实际返回用户组无权访问板块，新增准确权限提示，不再误显示空资源。论坛身份与 123 网盘身份不同，没有替用户登录或发帖。
- 点播直播：需要 Cat 直播 DIY 列表，未配置时新增明确提示。Docker 当前尚无对应直播列表配置入口，不能宣称功能已接通。
- 多多/虎斑本地最新测试返回内容；瓜子体育本次返回 20 条。不是所有 502 都代表适配失效。

## 尚未恢复

- 文采、花子：源站拒绝请求 403，未绕过访问限制。
- 伊影：源内固定 HTTPS 地址证书过期，未关闭 TLS 校验。
- 柿子：源内服务器拒绝连接。
- 闪电：最新源站 HTTP 500。
- 星芽、小猫、枫叶：TLS 建连中断，需要服务器网络侧复现及源站有效地址。
- 小薇：源端会话接口返回服务器内部错误。
- 小马听书：请求超时。
- 酷听：四个分类均为空，官网访问出现 403，尚未恢复解析或播放。
- 轮回：www.dj92.cc DNS 不存在，dj92.cc 证书过期；www.dj92cc.net 可访问但路径和解析协议不同，不能直接替换旧域名。

|源|首页 HTTP|首页条数|首类条数|原始错误|
|---|---:|---:|---:|---|
|虎斑┃4K|200|208|72||
|盘迷┃4K|200|0|0||
|闪电┃4K|500|0|未请求|Request failed with status code 500|
|文采┃秒播|500|0|未请求|文采请求失败 403|
|多多┃4K|200|208|72||
|伊影┃秒播|500|0|未请求|certificate has expired|
|短漫┃小马|200|0|18||
|短剧┃星芽|500|0|未请求|Client network socket disconnected before secure TLS connection was established|
|柿子┃秒播|500|0|未请求|connect ECONNREFUSED 198.16.32.131:12345|
|短剧┃小薇|200|0|0|WeiGuan session empty: {"code":500,"msg":"服务器内部错误","data":null}|
|短剧┃小猫|500|0|未请求|Client network socket disconnected before secure TLS connection was established|
|花子┃动漫|200|0|0|Request failed with status code 403|
|轮回┃舞曲|200|0|0|getaddrinfo ENOTFOUND www.dj92.cc|
|枫叶┃秒播|500|0|未请求|Client network socket disconnected before secure TLS connection was established|
|酷听┃音乐|200|0|0||
|点播┃直播|200|0|0||
|瓜子┃体育|200|0|20||
|小马┃听书|200|0|0|The operation was aborted due to timeout|
