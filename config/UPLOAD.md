# GitHub 上传说明

目标仓库：Honanhui/okbox-list。

1. 解压源码包。GitHub 新建 okbox-list 仓库，不必预先生成 README。
2. 打开仓库，选择 uploading an existing file / Add file → Upload files。
3. 上传解压后 okbox-list-0.1 目录内的全部文件和文件夹；不要只上传 ZIP，也不要把外层目录嵌套进仓库。
4. 确认仓库首页能直接看到 README.md、Dockerfile、docker-compose.yml、server.js。
5. 浏览器上传隐藏文件不方便时，可用 Git：

```powershell
cd "解压路径\okbox-list-0.1"
git init -b main
git add .
git commit -m "Release OKBOX-LIST 0.1"
git remote add origin https://github.com/Honanhui/okbox-list.git
git push -u origin main
```

第一次推送时按 Git Credential Manager 提示登录 GitHub。若仓库已有内容，请先克隆仓库并复制这些文件，再提交，不要强制覆盖远程历史。

本包包含源码、部署文件及后台截图，不包含 Docker 镜像 tar、个人数据、订阅脚本。上传 GitHub 源码不会自动上传 Docker Hub 镜像。部署方式见 README.md。
