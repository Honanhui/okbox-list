# 本次更新（版本仍为 0.1）

- 首页、分类、搜索和详情不再先等待网盘凭据同步，播放仍保留同步。
- Cat 内部海报代理地址经 Docker 公共接口转发，避免手机访问容器的 127.0.0.1。
- 订阅下载错误区分 DNS、超时、证书及连接重置。
- OKBOX 海报加载队列优化属于客户端更新，不包含在此 Docker 源码包。

上传到 Honanhui/okbox-list 时，把目录内文件放到仓库根目录。
源码上传不会自动更新 Docker Hub 上的同名镜像。需自行构建并推送：

```bash
docker build -t honamhui/okbox-list:0.1 .
docker push honamhui/okbox-list:0.1
```

服务器更新：
```bash
sudo docker compose pull
sudo docker compose up -d --force-recreate
```

如果服务器 bridge 网络无法 IPv6 出站，可保留现有 host 网络配置与 NODE_OPTIONS。
没有包含个人账号、服务器数据、订阅脚本或 Docker 镜像 tar。
