# GitHub 私有订阅与 Token 操作教程（tvbox-list 0.3）

## 先弄清楚三个东西

- 私有仓库：只允许你授权的人读取爬虫文件。
- GitHub Token：服务器读取这个私有仓库的钥匙，不是网盘 Token，也不是 GitHub 登录密码。
- github://：tvbox-list 的订阅地址写法；服务器把它转换成 GitHub 官方 HTTPS API 请求。

这一功能只负责读取订阅，不会自动把 Android JAR 或依赖 CatVodOpen 手机宿主的插件改造成 Docker 爬虫。仓库里必须放适配当前 Node 运行环境的构建产物。

## 一、准备自己的私有仓库

1. 登录 https://github.com ，点击右上角“+” → New repository。
2. Owner 选择 Honanhui。
3. Repository name 例如填 okbox-catvod-private。
4. Visibility 选择 Private。
5. 点击 Create repository。
6. 把我们自创爬虫的源码和构建工作流上传到这个仓库。如果是网页上传，先解压源码 ZIP，再上传里面的文件；不能只上传一个 ZIP。
7. 按项目原有工作流构建，确认 Code 页面实际存在 dist/index.js 和 dist/index.js.md5。校验文件必须是该 JS 的32位MD5。若产物只在 Actions 的 artifact 压缩包中，还需按项目工作流把 dist 发布到仓库分支。
8. 确认存放产物的分支名称，例如 main；它不一定与其他仓库相同。此协议不负责启动 Actions 构建。

已有 Honanhui/okbox-catvod 公开仓库不必立刻改私有，以免影响旧订阅。可以先在新私有仓库验证，迁移后再决定旧仓库的处理。

## 二、生成只读 Fine-grained Token

1. 右上角头像 → Settings（个人设置，不是仓库 Settings）。
2. 左侧最下面 Developer settings。
3. Personal access tokens → Fine-grained tokens。
4. 点击 Generate new token，按提示验证账号。
5. Token name 填 okbox-list-read。
6. Expiration 选择有效期，例如90天，并记下到期日期。
7. Resource owner 选择 Honanhui。若仓库属于组织，应选对应组织，可能需要管理员审批。
8. Repository access 选择 Only select repositories。
9. Select repositories 只选择 okbox-catvod-private。以后增加第二个私有仓库，可回来编辑此Token的仓库范围。
10. Permissions → Repository permissions（部分页面显示 Add permissions）：添加 Contents，设置 Read-only。
11. Metadata 若自动显示 Read-only，保留默认即可。Account permissions 不需要额外开启；不需要管理仓库、删除仓库或写入权限。
12. 点击 Generate token。
13. 立即复制并保存完整Token，通常以 github_pat_ 开头。不要只复制页面中间的部分字符。Token页面之后不会再次显示完整值；遗失时重新生成即可。

这是给Docker读取订阅的只读Token。它不能上传源码或代替Actions构建权限。GitHub Actions应使用项目自身的GITHUB_TOKEN和适当的工作流权限，不要把此Token写进源码。

官方操作说明：https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens

## 三、拼出订阅地址

假设仓库 Honanhui/okbox-catvod-private，文件 dist/index.js.md5，分支 main：

```text
github://你的完整Token@github.com/Honanhui/okbox-catvod-private/dist/index.js.md5?ref=main
```

把“你的完整Token”替换为真实值，不要加引号、空格或尖括号。

- 不写 ?ref=main：读取仓库默认分支。
- 产物在 master：改成 ?ref=master。
- 产物在 dist 分支且位于仓库根目录：地址应为 .../okbox-catvod-private/index.js.md5?ref=dist。
- 如果实际文件位于 cat/dist：应写 .../仓库名/cat/dist/index.js.md5。
- 分支名有斜杠，例如 release/v1：写 ?ref=release%2Fv1。
- 支持直接指向 .js；推荐使用 .js.md5，更新时可校验配套JS。

只支持 github.com，暂不包含 gitee:// 或 GitHub 企业自建地址。

## 四、在服务器添加

1. 更新本次Docker镜像并重建容器。
2. 打开 http://192.168.1.8:9978/。
3. 我的订阅源 → 输入名称，例如“自创私有源”。
4. 粘贴完整 github:// 订阅地址 → 添加订阅。
5. 等抓取完成后切换到此订阅，在OKBOX使用原来的服务器地址即可。手机端无需填写GitHub Token。
6. 页面和日志显示 github://***@github.com/... 属于正常隐藏。已有订阅只修改名称并保存时，会保留服务器中的原Token；要更换Token，重新粘贴完整新地址。

Token随订阅配置保存在服务器持久化数据中，备份 /data 时应一并保护。不要把真实订阅地址发到聊天、截图、README或公开仓库。

## 五、后续更新源码

更新私有仓库源码 → 完成原项目构建并发布新JS和对应MD5到指定分支 → 后台重新抓取或等待自动刷新。不需要每次重新生成Token；更换仓库、权限或Token到期时才需要调整。

## 六、常见错误

| 提示 | 排查方法 |
|---|---|
| 401 / Token无效或过期 | 检查复制是否完整、是否已撤销或到期；生成新Token并编辑完整订阅地址 |
| 403 / 访问被拒绝 | 检查Contents Read-only、组织审批和GitHub API限额 |
| 404 / 文件不存在或无权访问 | 私有仓库无权限也可能返回404；同时核对授权仓库、文件目录、文件名大小写和ref分支 |
| 校验失败 | 同时更新index.js和index.js.md5，确认二者来自同一次构建 |
| Cat程序启动失败或不兼容 | 下载认证可能已成功，但JS不符合当前Docker运行接口；需要独立适配，换Token无用 |
| 网络连接失败 | 检查服务器能否连接api.github.com；协议不提供网络加速 |

撤销Token：个人Settings → Developer settings → Fine-grained tokens → 找到该Token → Revoke/Delete。撤销后旧订阅无法继续下载；本地已缓存的代码不会因此自动删除。

## 本次验证范围

已通过认证请求头、默认/指定分支、MD5和JS配套路径、401/403/404错误、重定向不泄露Token、大小限制和日志隐藏测试。未使用你的真实私有仓库Token进行实测；部署后按上述流程添加验证。