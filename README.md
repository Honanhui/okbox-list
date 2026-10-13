# OKBOX-LIST

**版本：0.2 · 镜像标签：`honamhui/okbox-list:0.2`**

## 介绍

OKBOX-LIST 是供 OKBOX 使用的自部署订阅管理与 Cat Node 爬虫服务。后台管理、订阅执行和网盘账号服务放在同一个 Docker 容器内，部署后在 OKBOX 填写服务器地址即可连接。

用户手动添加 Cat Node 订阅，服务读取站点列表，由订阅中的 Node.js 爬虫完成首页、分类、搜索、详情和播放解析。项目不内置订阅，也不提供影视内容。

目前支持王二小的cat订阅源：http://wexfnw:wexfnw@cat.xn--4kq62z5rby2qupq9ub.top/index.js.md5

## 项目定位

- **订阅管理**：每份订阅独立抓取、缓存和保存，提供多仓切换，不合并不同订阅的站点。
- **爬虫运行**：运行符合当前 Cat Node 协议的 JavaScript 订阅，提供 OKBOX 使用的 Bridge 接口。
- **统一账号**：通过后台保存网盘账号，向已适配的订阅爬虫同步凭据。
- **客户端连接**：OKBOX 使用固定服务器地址访问当前仓库，可在客户端切换仓库。

只接受兼容的 Cat Node `.js`、`.js.md5` 订阅。普通 TVBox JSON、多仓 JSON、Android JAR/DEX 和依赖 Android 的原生库不能直接运行。扩展名相同也不代表协议兼容。

## 后台管理截图

### 订阅管理

![订阅管理](assets/readme/subscriptions.jpg)

### 账号管理

![账号管理](assets/readme/accounts.jpg)

### 添加账号

![添加账号](assets/readme/add-account.jpg)

截图来自本项目管理页面的新部署状态，不包含个人账号或订阅凭据。

## 主要功能

- 添加、行内编辑、删除订阅，显示抓取状态、失败原因和视频源数量。
- 独立多仓；后台和 OKBOX 可切换当前仓库，打开的后台页面自动读取最新状态。
- 后台管理与 Cat Node 在同一容器，外部只需开放 `9978`。
- 过滤 Cat 原网盘配置页与配置中心，保留普通视频站点和内容入口。
- 每种服务只保存一个主账号，重复保存会更新原账号。
- 二维码登录、账号登录和手动凭据备用入口，提供检查、启用、停用和删除。
- Cookie、密码和 Token 使用 AES-GCM 加密保存，后台显示凭据同步结果。
- HTTP Range 媒体代理、健康检查，默认监听 IPv4/IPv6。

## 订阅方式和网盘登录功能

### 添加订阅

1. 进入后台「订阅管理」。
2. 填写名称和兼容的 Cat Node 地址，例如 `https://example.com/index.js.md5`。
3. 点击「添加订阅」，等待抓取结果，选择要使用的仓库。
4. 在 OKBOX 媒体服务器设置中填写 `http://服务器地址:9978`。

默认配置刷新周期为 60 分钟，也可点击「重新抓取全部订阅」。后台生成并显示多仓入口，可直接复制。切换仓库不会合并站点。

Basic 认证地址中的凭据会转换为请求头；跨域跳转不会自动转发原站凭据。只添加可信订阅，因为其中的 JavaScript 会在容器内执行。

### 登录账号

进入「账号登录 → 添加账号」，选择服务类型。扫码确认后后台保存凭据，并尝试同步给已适配的 Cat 爬虫。手动 Cookie/Token 是备用方式。

| 服务 | 当前后台登录入口 |
| --- | --- |
| 阿里云盘 | OpenList 授权二维码优先，网页二维码备用；手动凭据 |
| 夸克、UC、115、123、百度 | 二维码；手动凭据 |
| 移动云盘、迅雷云盘、光鸭 | 二维码；手动凭据 |
| B 站 | 二维码；手动凭据 |
| 天翼云盘、PikPak | 保存账号密码；天翼由已适配 Cat 驱动登录，PikPak 尚无 Cat 同步接口 |

登录成功、同步成功和播放成功是三个不同步骤。各订阅驱动实现不同，不能保证任意订阅都能使用全部账号。后台显示同步失败、接口未适配或等待播放验证等状态。

**阿里云盘目前可扫码保存账号，但当前核验的 Cat 订阅缺少阿里播放驱动，尚未完成阿里播放接入。** 其他服务也需添加账号后实际验证。二维码接口可能受官方接口更新、验证码和网络环境影响。

适配版 OKBOX 可在播放遇到登录要求时请求服务器二维码；用户也可提前在后台登录。两种方式使用同一账号中心，客户端需包含相应登录交互功能。

## 运行要求

- Docker；使用 Compose 时需 Docker Compose 插件。
- 服务器能访问构建依赖、订阅源站和网盘授权接口。
- 开放 TCP `9978`，为 `/data` 配置持久化存储。
- 当前已核验构建平台为 `linux/amd64`；其他架构需自行构建验证。
- 无需 Android、模拟器或外部数据库。Node.js 22、Java 17、FFmpeg 由 Dockerfile 安装。

## WEB 地址

| 用途 | 地址 |
| --- | --- |
| 后台管理 | `http://服务器IP:9978/` |
| OKBOX 媒体服务器 | `http://服务器IP:9978` |
| 健康检查 | `http://服务器IP:9978/api/health` |
| IPv6 示例 | `http://[服务器IPv6地址]:9978/` |

域名需包含协议和端口，例如 `http://tvbox.example.com:9978`。配置 HTTPS 反向代理后可使用对应 HTTPS 地址。域名解析不会自动开放防火墙或配置端口转发。

## Docker 启动

### 前后端集成版

镜像已经集成 Web 管理页面、后台 API、Cat Node 爬虫和网盘登录服务，部署时只需要启动一个容器。

#### 使用 Docker Compose（推荐）

新建 `docker-compose.yml`，写入以下内容：

```yaml
services:
  okbox-list:
    image: honamhui/okbox-list:0.2
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

**发布状态：以上远程下载与自动拉取，需要先把配置文件上传到 GitHub，并把 `honamhui/okbox-list:0.2` 发布到 Docker Hub。本次已准备文件，尚未实际完成线上发布。**

## 方式二：一键安装与管理脚本

与 alist-tvbox 相同：执行一个入口，打开交互菜单。

```bash
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/Honanhui/okbox-list/main/okbox-list.sh)"
```

菜单：

```text
========== OKBOX-LIST 0.2 ==========
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

### 环境变量

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `HOST` | `::` | 外部监听地址 |
| `PORT` | `9978` | 管理和 Bridge 端口 |
| `CONFIG_PATH` | `/data/config.json` | 配置位置 |
| `TZ` | Compose 中为 `Asia/Shanghai` | 时区 |
| `ADMIN_TOKEN` | 空 | 可选管理令牌，后台请求管理接口时输入 |
| `NODE_IMAGE` | `node:22-alpine` | Compose 构建基础镜像 |

Cat 内部服务为 `127.0.0.1:9988`，无需对外开放。公网部署应配置访问保护与 HTTPS；管理令牌控制管理 API，不等同于全部播放接口的用户认证。

## 项目结构

```text
├── Dockerfile
├── docker-compose.yml         # 拉取镜像部署
├── compose.build.yml          # 源码构建覆盖
├── okbox-list.sh         # 独立容器安装与更新
├── server.js                  # 后台与 OKBOX 接口
├── public/                    # 管理页面
├── config/                    # 空白配置
├── runtime/                   # Cat 与网盘服务
│   └── cloud/                 # Java 授权模块及依赖
├── tools/                     # 容器入口与检查
└── assets/readme/             # 后台截图
```

不包含个人数据、账号密钥、第三方订阅脚本或 Android APK/HAP。更多部署原理和更新保护见 [DEPLOY.md](DEPLOY.md)。

## 参考与依赖

- [FlyCloudHelper](https://github.com/fbinba3955/FlyCloudHelper)：README 组织方式参考。
- [alist-tvbox](https://github.com/power721/alist-tvbox)、[OpenList](https://github.com/OpenListTeam/OpenList)：网盘授权与服务组织方式参考。
- Java 模块使用 org.json、OkHttp、Okio、ZXing，依赖许可保留各自声明。

参考文档结构或接口原理不代表拥有参考项目的全部功能。第三方订阅和依赖仍受各自许可约束。



