# 0.2 更新说明

后台版本、镜像标签、Compose 和安装脚本统一为 0.2。
保留分类目录修复、源初始化、海报代理和错误诊断修复。
轮回新增 Node 适配器，接入 dj92cc.net 的公开试听；并非原 dj92.cc 站点恢复。Windows 完整流程验证通过；Docker 列表和分类读取通过，但搜索返回源站 HTTP 403，仍有网络或源站限制。
其余失效源未全部恢复，详见 CAT-REMAINING-20261011.md。
镜像在本地构建，尚未推送 Docker Hub；源码包尚未上传 GitHub。

阿里扫码恢复 Android Bridge 的官方优先、OpenList 备用顺序；Docker 实测 1176ms 返回二维码，未进行真实扫码授权。
