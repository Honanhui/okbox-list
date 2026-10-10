# Cat Node 运行模块

本目录实现 Cat Node 订阅加载、独立仓库执行、站点读取及统一账号同步。

- cat-node-loader.mjs：下载、校验并启动兼容 Cat 程序。
- cat-node-client.mjs：将站点调用转换为 Cat HTTP 协议。
- cat-source-policy.mjs：过滤原配置中心与网盘配置页。
- cat-account-sync.mjs、cat-credential-hook.mjs、cat-instrument.mjs：向已适配爬虫同步账号。
- cloud-host.mjs、cloud/：Java 网盘授权服务及通信。
- media-probe.mjs、player-page.mjs：媒体探测与播放辅助。

当前入口不支持直接运行 Android JAR/DEX 或普通 TVBox JSON。账号保存不代表对应订阅的播放驱动已适配，详见项目 README。
