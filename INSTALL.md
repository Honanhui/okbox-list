# 两种安装方式

版本：0.1，镜像：honamhui/okbox-list:0.1。

## Docker 启动

### 前后端集成版

镜像已经集成 Web 管理页面、后台 API、Cat Node 爬虫和网盘登录服务，部署时只需要启动一个容器。

#### 使用 Docker Compose（推荐）

新建 `docker-compose.yml`，写入以下内容：

```yaml
services:
  okbox-list:
    image: honamhui/okbox-list:0.1
    container_name: okbox-list
    restart: unless-stopped
    ports:
      - "9978:9978"
    environment:
      TZ: Asia/Shanghai
      HOST: "::"
      PORT: "9978"
      CONFIG_PATH: /data/config.json
    volumes:
      - okbox_list_data:/data

volumes:
  okbox_list_data:
    name: okbox-list-data
```

然后启动服务：

```bash
docker compose up -d
```

也可以直接下载项目提供的完整配置文件，不需要下载整个项目，也不需要准备 `.env`：

```bash
# 下载配置文件
curl -fL -o docker-compose.yml https://raw.githubusercontent.com/Honanhui/okbox-list/main/docker-compose.yml

# 启动服务（本机没有镜像时 Docker 会自动拉取）
docker compose up -d

# 查看日志
docker compose logs -f
```

启动后访问后台或在 OKBOX 填写：`http://服务器IP:9978`。

下载的完整配置中已有默认值，`.env` 仅用于可选的端口、镜像和管理令牌设置，不是部署必需文件。

更新服务：

```bash
docker compose pull
docker compose up -d
```

停止使用 `docker compose down`。账号及订阅保存在 `okbox-list-data` 数据卷中，更新时保留该卷，不要使用 `docker compose down -v`。

**发布状态：以上远程下载与自动拉取，需要先把配置文件上传到 GitHub，并把 `honamhui/okbox-list:0.1` 发布到 Docker Hub。本次已准备文件，尚未实际完成线上发布。**

## 方式二：一键安装与管理脚本

与 alist-tvbox 相同：执行一个入口，打开交互菜单。

```bash
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/Honanhui/okbox-list/main/okbox-list.sh)"
```

菜单：

```text
========== OKBOX-LIST 0.1 ==========
1. 安装服务
2. 更新服务
3. 配置与健康检查
4. 查看日志
5. 启动服务
6. 重启服务
7. 停止服务
0. 退出
```

安装时填写外部端口和数据卷名称，回车采用默认值。脚本拉取同一个预构建镜像，创建单个容器，不产生 Compose 分组。再次执行同一个命令可以更新和管理。

配置检查会检查 Docker、容器状态、网络、/data 挂载、端口和后台健康接口，不显示个人令牌。

更新复用原数据与端口；启动失败会尝试恢复旧容器。Compose 创建的容器请通过方式一更新，避免两套管理方式互相覆盖。

## 当前发布状态

以上是正式面向用户的两种安装方式，不需要用户下载源码或自行编译。

GitHub 脚本与 Docker Hub 镜像尚未由本次工作发布，远程命令需等文件和镜像上传后才能生效。现在可运行本地 okbox-list.sh 打开相同菜单；本机已加载镜像时，可用 sudo bash okbox-list.sh install --local-image 测试安装。

两种方式均要求已经安装 Docker；不会修改防火墙或删除用户数据。旧部署使用 ./data 时，应继续使用原挂载，不直接换到空命名卷。

