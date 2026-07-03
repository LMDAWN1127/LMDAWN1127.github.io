# Hugo 完整部署指南

## 文档信息
- **创建时间**: 2026-07-03
- **适用系统**: Ubuntu 22.04.5 LTS
- **Hugo 版本**: v0.163.3 (extended)
- **目标平台**: GitHub Pages

---

## 📋 目录

1. [环境准备](#1-环境准备)
2. [Hugo 安装](#2-hugo-安装)
3. [创建 Hugo 项目](#3-创建-hugo-项目)
4. [配置 Hugo](#4-配置-hugo)
5. [创建内容](#5-创建内容)
6. [本地测试](#6-本地测试)
7. [Git 配置](#7-git-配置)
8. [GitHub 仓库创建](#8-github-仓库创建)
9. [推送到 GitHub](#9-推送到-github)
10. [配置 GitHub Pages](#10-配置-github-pages)
11. [配置 GitHub Actions 自动部署](#11-配置-github-actions-自动部署)
12. [验证部署](#12-验证部署)
13. [日常维护](#13-日常维护)
14. [故障排除](#14-故障排除)
15. [博客使用指南](#15-博客使用指南)
16. [如何写博客](#16-如何写博客)
17. [附录](#17-附录)

---

## 1. 环境准备

### 1.1 系统要求

| 项目 | 要求 |
|------|------|
| 操作系统 | Ubuntu 20.04+ / CentOS 7+ / macOS / Windows |
| 内存 | 最低 512MB，推荐 1GB+ |
| 磁盘空间 | 最低 1GB，推荐 5GB+ |
| 网络 | 需要访问互联网 |

### 1.2 更新系统

```bash
# Ubuntu/Debian
sudo apt update
sudo apt upgrade -y

# CentOS/RHEL
sudo yum update -y
```

### 1.3 安装必要工具

```bash
# Ubuntu/Debian
sudo apt install -y git curl wget

# CentOS/RHEL
sudo yum install -y git curl wget
```

### 1.4 配置 Git

```bash
# 配置用户信息
git config --global user.name "你的用户名"
git config --global user.email "你的邮箱"

# 示例
git config --global user.name "LMDAWN1127"
git config --global user.email "3252408778@qq.com"

# 验证配置
git config --list
```

---

## 2. Hugo 安装

### 2.1 安装方式选择

| 方式 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| snap | 简单快捷，自动更新 | 需要 snap 支持 | ⭐⭐⭐⭐⭐ |
| apt/yum | 系统包管理 | 版本可能较旧 | ⭐⭐⭐ |
| 二进制文件 | 版本可控 | 需要手动更新 | ⭐⭐⭐⭐ |
| 源码编译 | 最新版本 | 复杂，耗时 | ⭐⭐ |

### 2.2 方式一：使用 snap 安装（推荐）

```bash
# 安装 snap（如果未安装）
sudo apt install -y snapd

# 安装 Hugo
sudo snap install hugo

# 验证安装
hugo version
```

### 2.3 方式二：使用 apt 安装

```bash
# 添加 Hugo 仓库
sudo apt install -y software-properties-common
sudo add-apt-repository -y ppa:sneshelo/hugo

# 更新包列表
sudo apt update

# 安装 Hugo
sudo apt install -y hugo

# 验证安装
hugo version
```

### 2.4 方式三：下载二进制文件安装

```bash
# 下载 Hugo（以 v0.163.3 为例）
wget https://github.com/gohugoio/hugo/releases/download/v0.163.3/hugo_extended_0.163.3_linux-amd64.tar.gz

# 解压
tar -xzf hugo_extended_0.163.3_linux-amd64.tar.gz

# 移动到系统目录
sudo mv hugo /usr/local/bin/

# 验证安装
hugo version

# 清理下载文件
rm hugo_extended_0.163.3_linux-amd64.tar.gz
```

### 2.5 验证 Hugo 安装

```bash
# 检查版本
hugo version

# 检查环境
hugo env

# 预期输出示例：
# hugo v0.163.3-4d22555aebf458d5d150500c9ac4bee5b24cf0d3+extended linux/amd64 BuildDate=2026-06-18T16:18:24Z
# GOOS="linux"
# GOARCH="amd64"
# GOVERSION="go1.26.4"
```

---

## 3. 创建 Hugo 项目

### 3.1 创建新站点

```bash
# 创建项目目录
mkdir -p /root/myblog

# 进入目录
cd /root/myblog

# 创建 Hugo 站点
hugo new site .

# 或者创建到指定目录
hugo new site myblog
```

### 3.2 项目目录结构

```
myblog/
├── archetypes/          # 文章模板
├── assets/              # 静态资源
├── content/             # 内容目录
├── data/                # 数据文件
├── i18n/                # 国际化文件
├── layouts/             # 布局模板
├── static/              # 静态文件
├── themes/              # 主题目录
├── hugo.toml            # 配置文件
└── public/              # 构建输出（自动生成）
```

### 3.3 安装主题

```bash
# 进入项目目录
cd /root/myblog

# 初始化 Git
git init

# 添加主题（以 PaperMod 为例）
git submodule add https://github.com/adityatelange/hugo-PaperMod.git themes/PaperMod

# 或者使用其他主题
# git submodule add https://github.com/theNewDynamic/gohugo-theme-ananke.git themes/ananke
```

### 3.4 常用主题推荐

| 主题 | 特点 | 适合场景 |
|------|------|----------|
| PaperMod | 简洁、快速、功能丰富 | 个人博客、技术博客 |
| Stack | 现代、响应式、多语言 | 个人博客、作品集 |
| Blowfish | 功能强大、高度可定制 | 企业网站、技术文档 |
| Hugo-Paper | 极简、快速 | 个人博客、笔记 |

---

## 4. 配置 Hugo

### 4.1 创建配置文件

```bash
# 进入项目目录
cd /root/myblog

# 创建配置文件
cat > hugo.toml << "EOF"
baseURL = "https://你的用户名.github.io/"
languageCode = "zh-cn"
title = "我的博客"
theme = "PaperMod"
EOF
```

### 4.2 完整配置示例

```toml
# 基本配置
baseURL = "https://LMDAWN1127.github.io/"
languageCode = "zh-cn"
title = "我的博客"
theme = "PaperMod"

# 语言配置（Hugo v0.158.0+ 使用 locale 替代 languageCode）
# locale = "zh-cn"

# 分页配置
paginate = 10

# 日期格式
dateFormat = "2006-01-02"

# 启用 Emoji
enableEmoji = true

# 启用 Git 信息
enableGitInfo = true

# 标记为非草稿
buildDrafts = false
buildFuture = false
buildExpired = false

# 作者信息
[params]
  author = "你的名字"
  description = "我的个人博客"
  keywords = ["博客", "技术", "Hugo"]
  defaultTheme = "auto"
  ShowShareButtons = true
  ShowReadingTime = true
  ShowPostNavLinks = true
  ShowBreadCrumbs = true
  ShowCodeCopyButtons = true
  ShowToc = true
  TocOpen = false

# 菜单配置
[[menu.main]]
  identifier = "首页"
  name = "首页"
  url = "/"
  weight = 1

[[menu.main]]
  identifier = "文章"
  name = "文章"
  url = "/posts/"
  weight = 2

[[menu.main]]
  identifier = "标签"
  name = "标签"
  url = "/tags/"
  weight = 3

[[menu.main]]
  identifier = "分类"
  name = "分类"
  url = "/categories/"
  weight = 4

# 社交链接
[[params.socialIcons]]
  name = "github"
  url = "https://github.com/你的用户名"

[[params.socialIcons]]
  name = "email"
  url = "mailto:你的邮箱"
```

### 4.3 配置说明

| 配置项 | 说明 | 示例值 |
|--------|------|--------|
| baseURL | 网站基础 URL | https://username.github.io/ |
| languageCode | 语言代码 | zh-cn |
| title | 网站标题 | 我的博客 |
| theme | 主题名称 | PaperMod |
| paginate | 每页文章数 | 10 |
| dateFormat | 日期格式 | 2006-01-02 |

---

## 5. 创建内容

### 5.1 创建文章

```bash
# 创建新文章
hugo new posts/my-first-post.md

# 创建关于页面
hugo new about.md

# 创建目录结构
hugo new posts/2024/my-article.md
```

### 5.2 文章模板

```markdown
+++
date = "2026-07-03T08:00:00Z"
draft = false
title = "我的第一篇文章"
description = "这是文章的描述"
tags = ["Hugo", "博客"]
categories = ["技术"]
author = "你的名字"
+++

# 文章标题

这是文章内容。

## 二级标题

正文内容...
```

### 5.3 文章前置参数

| 参数 | 说明 | 示例值 |
|------|------|--------|
| title | 文章标题 | 我的第一篇文章 |
| date | 发布日期 | 2026-07-03T08:00:00Z |
| draft | 是否为草稿 | false |
| description | 文章描述 | 这是文章的描述 |
| tags | 标签 | ["Hugo", "博客"] |
| categories | 分类 | ["技术"] |
| author | 作者 | 你的名字 |
| weight | 排序权重 | 1 |
| toc | 是否显示目录 | true |

### 5.4 创建静态页面

```bash
# 创建关于页面
cat > content/about.md << "EOF"
+++
title = "关于我"
date = "2026-07-03"
draft = false
+++

# 关于我

这是关于我的介绍...
EOF
```

---

## 6. 本地测试

### 6.1 启动开发服务器

```bash
# 进入项目目录
cd /root/myblog

# 启动开发服务器
hugo server

# 启动服务器并启用草稿
hugo server -D

# 指定端口和绑定地址
hugo server --bind 0.0.0.0 --port 1313

# 完整命令
hugo server --bind 0.0.0.0 --port 1313 --baseURL http://localhost:1313/
```

### 6.2 访问本地网站

```
本地访问: http://localhost:1313/
远程访问: http://服务器IP:1313/
```

### 6.3 构建网站

```bash
# 构建网站
hugo

# 构建并压缩
hugo --minify

# 构建到指定目录
hugo -d public

# 查看构建结果
ls -la public/
```

### 6.4 构建结果说明

```
public/
├── index.html           # 首页
├── 404.html             # 404 页面
├── posts/               # 文章页面
├── categories/          # 分类页面
├── tags/                # 标签页面
├── assets/              # 静态资源
├── sitemap.xml          # 站点地图
└── index.xml            # RSS 订阅
```

---

## 7. Git 配置

### 7.1 初始化 Git 仓库

```bash
# 进入项目目录
cd /root/myblog

# 初始化 Git
git init

# 配置用户信息（如果未全局配置）
git config user.name "你的用户名"
git config user.email "你的邮箱"
```

### 7.2 创建 .gitignore 文件

```bash
cat > .gitignore << "EOF"
# Hugo 构建输出
public/
resources/
.hugo_build.lock

# 系统文件
.DS_Store
Thumbs.db

# 编辑器文件
*.swp
*.swo
*~
.vscode/
.idea/

# 日志文件
*.log

# 临时文件
*.tmp
*.bak
EOF
```

### 7.3 首次提交

```bash
# 添加所有文件
git add -A

# 提交
git commit -m "Initial commit: Hugo site with PaperMod theme"

# 查看状态
git status

# 查看日志
git log --oneline
```

---

## 8. GitHub 仓库创建

### 8.1 创建 GitHub 仓库

1. 访问 https://github.com/new
2. 填写仓库信息：
   - **Repository name**: `你的用户名.github.io`（必须是这个格式）
   - **Description**: 我的 Hugo 博客
   - **Visibility**: Public
   - **Initialize this repository with**: 不要勾选任何选项
3. 点击 **Create repository**

### 8.2 仓库命名规则

| 仓库名 | 说明 | 访问地址 |
|--------|------|----------|
| username.github.io | 用户主页 | https://username.github.io/ |
| repo-name | 项目页面 | https://username.github.io/repo-name/ |

**注意**: 用户主页必须命名为 `username.github.io`

### 8.3 获取 GitHub Token

1. 访问 https://github.com/settings/tokens
2. 点击 **Generate new token** → **Generate new token (classic)**
3. 填写信息：
   - **Note**: Hugo 部署
   - **Expiration**: 选择过期时间
   - **Select scopes**: 勾选 `repo`（全部权限）
4. 点击 **Generate token**
5. **立即复制 Token**（只显示一次）

### 8.4 Token 安全提示

- Token 是敏感信息，不要泄露
- 不要将 Token 提交到 Git 仓库
- 定期更换 Token
- 使用环境变量存储 Token

---

## 9. 推送到 GitHub

### 9.1 配置远程仓库

```bash
# 进入项目目录
cd /root/myblog

# 添加远程仓库（使用 Token）
git remote add origin https://<TOKEN>@github.com/<用户名>/<仓库名>.git

# 示例
git remote add origin https://ghp_xxxxxxxxxxxx@github.com/LMDAWN1127/LMDAWN1127.github.io.git

# 验证远程仓库
git remote -v
```

### 9.2 推送到 main 分支

```bash
# 确保在 main 分支
git branch -M main

# 推送到远程
git push -u origin main

# 或者强制推送（如果远程有内容）
git push -u origin main --force
```

### 9.3 验证推送

```bash
# 检查远程分支
git branch -r

# 检查状态
git status

# 查看远程日志
git log --oneline origin/main
```

---

## 10. 配置 GitHub Pages

### 10.1 访问仓库设置

1. 访问 https://github.com/<用户名>/<仓库名>
2. 点击 **Settings**
3. 左侧菜单选择 **Pages**

### 10.2 配置部署源

**方式一：使用 GitHub Actions（推荐）**
- **Source**: GitHub Actions
- 无需其他配置

**方式二：使用分支部署**
- **Source**: Deploy from a branch
- **Branch**: 选择 `gh-pages`
- **目录**: `/ (root)`
- 点击 **Save**

### 10.3 配置自定义域名（可选）

1. 在 Pages 设置中填写 **Custom domain**
2. 勾选 **Enforce HTTPS**
3. 在域名服务商添加 CNAME 记录：
   ```
   CNAME  →  <用户名>.github.io
   ```

---

## 11. 配置 GitHub Actions 自动部署

### 11.1 创建工作流文件

```bash
# 进入项目目录
cd /root/myblog

# 创建工作流目录
mkdir -p .github/workflows

# 创建部署工作流
cat > .github/workflows/deploy.yml << "EOF"
name: Deploy Hugo Site

on:
  push:
    branches:
      - main

permissions:
  contents: write
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          submodules: true
          fetch-depth: 0

      - name: Setup Hugo
        uses: peaceiris/actions-hugo@v3
        with:
          hugo-version: 'latest'
          extended: true

      - name: Build
        run: hugo --minify

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./public
          publish_branch: gh-pages
          force_orphan: true
EOF
```

### 11.2 工作流说明

| 配置项 | 说明 |
|--------|------|
| on.push.branches | 触发条件：推送到 main 分支 |
| permissions | 权限配置：写入内容、页面、ID Token |
| actions/checkout | 检出代码，包含子模块 |
| peaceiris/actions-hugo | 安装 Hugo |
| hugo --minify | 构建网站 |
| peaceiris/actions-gh-pages | 部署到 gh-pages 分支 |

### 11.3 提交工作流

```bash
# 添加工作流文件
git add .github/workflows/deploy.yml

# 提交
git commit -m "Add GitHub Actions workflow for automatic deployment"

# 推送
git push origin main
```

### 11.4 查看部署状态

1. 访问 https://github.com/<用户名>/<仓库名>/actions
2. 查看工作流运行状态
3. 点击运行记录查看详细日志

---

## 12. 验证部署

### 12.1 检查 GitHub Actions 状态

```bash
# 使用 API 检查（需要 Token）
curl -s -H "Authorization: token <TOKEN>" \
  https://api.github.com/repos/<用户名>/<仓库名>/actions/runs | head -30

# 预期结果：
# "status": "completed"
# "conclusion": "success"
```

### 12.2 检查 GitHub Pages 状态

```bash
# 检查页面状态码
curl -s -o /dev/null -w "%{http_code}" https://<用户名>.github.io/

# 预期结果：200

# 检查页面内容
curl -s https://<用户名>.github.io/ | head -20
```

### 12.3 检查文章页面

```bash
# 检查文章页面
curl -s -o /dev/null -w "%{http_code}" https://<用户名>.github.io/posts/my-first-post/

# 预期结果：200
```

### 12.4 浏览器访问

- **首页**: https://<用户名>.github.io/
- **文章页面**: https://<用户名>.github.io/posts/my-first-post/
- **RSS 订阅**: https://<用户名>.github.io/index.xml

---

## 13. 日常维护

### 13.1 发布新文章

```bash
# 进入项目目录
cd /root/myblog

# 创建新文章
hugo new posts/new-article.md

# 编辑文章
vim content/posts/new-article.md

# 本地预览
hugo server -D

# 提交并推送
git add -A
git commit -m "Add new article: new-article.md"
git push origin main
```

### 13.2 更新主题

```bash
# 进入项目目录
cd /root/myblog

# 更新所有子模块
git submodule update --remote --merge

# 或者更新特定主题
cd themes/PaperMod
git pull origin main
cd /root/myblog

# 提交更新
git add themes/PaperMod
git commit -m "Update PaperMod theme"
git push origin main
```

### 13.3 修改配置

```bash
# 进入项目目录
cd /root/myblog

# 编辑配置文件
vim hugo.toml

# 本地测试
hugo server

# 提交更改
git add hugo.toml
git commit -m "Update site configuration"
git push origin main
```

### 13.4 备份项目

```bash
# 备份整个项目
cp -r /root/myblog /root/myblog-backup-$(date +%Y%m%d)

# 或者使用 Git
cd /root/myblog
git bundle create /root/myblog-backup.bundle --all
```

---

## 14. 故障排除

### 14.1 Hugo 命令找不到

**问题**: `hugo: command not found`

**解决方案**:
```bash
# 检查 Hugo 是否安装
which hugo

# 使用完整路径
/snap/hugo/26337/bin/hugo version

# 或者重新安装
sudo snap install hugo
```

### 14.2 构建失败

**问题**: Hugo 构建失败

**解决方案**:
```bash
# 检查配置文件语法
hugo config

# 检查主题是否存在
ls -la themes/

# 重新构建
hugo --minify --verbose
```

### 14.3 Git 推送失败

**问题**: `fatal: unable to access`

**解决方案**:
```bash
# 检查远程仓库配置
git remote -v

# 重新配置 Token
git remote set-url origin https://<NEW_TOKEN>@github.com/<用户名>/<仓库名>.git

# 测试连接
git fetch origin
```

### 14.4 GitHub Pages 返回 404

**问题**: 访问网站返回 404

**解决方案**:
```bash
# 检查 GitHub Pages 配置
curl -s -H "Authorization: token <TOKEN>" \
  https://api.github.com/repos/<用户名>/<仓库名>/pages

# 检查 GitHub Actions 状态
curl -s -H "Authorization: token <TOKEN>" \
  https://api.github.com/repos/<用户名>/<仓库名>/actions/runs

# 检查分支
git branch -a

# 重新触发部署
curl -X POST -H "Authorization: token <TOKEN>" \
  https://api.github.com/repos/<用户名>/<仓库名>/pages/builds
```

### 14.5 GitHub Actions 构建失败

**问题**: GitHub Actions 工作流失败

**解决方案**:
```bash
# 查看工作流日志
# 访问 https://github.com/<用户名>/<仓库名>/actions

# 检查工作流文件
cat .github/workflows/deploy.yml

# 更新工作流配置
# 确保权限配置正确
```

### 14.6 主题样式丢失

**问题**: 网站样式不正确

**解决方案**:
```bash
# 检查主题是否正确安装
ls -la themes/PaperMod/

# 重新添加主题
rm -rf themes/PaperMod
git submodule add https://github.com/adityatelange/hugo-PaperMod.git themes/PaperMod

# 清理缓存
rm -rf resources/
hugo --minify
```

### 14.7 Token 过期

**问题**: GitHub Token 过期

**解决方案**:
```bash
# 生成新的 Token
# 访问 https://github.com/settings/tokens

# 更新远程仓库配置
git remote set-url origin https://<NEW_TOKEN>@github.com/<用户名>/<仓库名>.git

# 测试连接
git fetch origin
```

---

## 15. 博客使用指南

### 15.1 访问博客

**在线访问**:
- 首页: https://<用户名>.github.io/
- 文章列表: https://<用户名>.github.io/posts/
- 标签: https://<用户名>.github.io/tags/
- 分类: https://<用户名>.github.io/categories/

**本地访问**:
```bash
# 启动本地服务器
cd /root/myblog
hugo server --bind 0.0.0.0 --port 1313

# 访问地址
http://localhost:1313/
http://服务器IP:1313/
```

### 15.2 浏览器功能

**主题切换**:
- 点击右上角的主题切换按钮
- 支持：浅色、深色、自动（跟随系统）

**搜索功能**:
- 点击搜索图标或按快捷键 `Ctrl + K`
- 输入关键词搜索文章

**目录导航**:
- 文章页面右侧显示目录
- 点击标题跳转到对应章节

**文章导航**:
- 文章底部显示上一篇/下一篇链接
- 首页显示文章列表

### 15.3 RSS 订阅

**RSS 地址**: https://<用户名>.github.io/index.xml

**订阅方式**:
- 使用 RSS 阅读器（如 Feedly、Inoreader）
- 浏览器插件（如 RSS Feed Reader）
- 邮件订阅服务

### 15.4 分享文章

**分享方式**:
- 点击文章底部的分享按钮
- 复制链接分享
- 使用社交媒体分享

**分享链接格式**:
```
https://<用户名>.github.io/posts/<文章名>/
```

### 15.5 评论功能

**启用评论**（需要额外配置）:

1. **Disqus**（最常用）:
   ```toml
   # 在 hugo.toml 中添加
   [params]
     comments = true
     disqusShortname = "你的disqus名称"
   ```

2. **Gitalk**（基于 GitHub Issues）:
   ```html
   <!-- 在 layouts/partials/comments.html 中添加 -->
   <div id="gitalk-container"></div>
   <link rel="stylesheet" href="https://unpkg.com/gitalk/dist/gitalk.css">
   <script src="https://unpkg.com/gitalk/dist/gitalk.min.js"></script>
   <script>
     var gitalk = new Gitalk({
       clientID: 'GitHub Client ID',
       clientSecret: 'GitHub Client Secret',
       repo: '你的仓库名',
       owner: '你的用户名',
       admin: ['你的用户名'],
       id: location.pathname,
       distractionFreeMode: false
     })
     gitalk.render('gitalk-container')
   </script>
   ```

3. **Utterances**（基于 GitHub Issues，最简单）:
   ```html
   <!-- 在 layouts/partials/comments.html 中添加 -->
   <script src="https://utteranc.es/client.js"
     repo="你的用户名/你的仓库"
     issue-term="pathname"
     theme="github-light"
     crossorigin="anonymous"
     async>
   </script>
   ```

### 15.6 统计功能

**启用访问统计**:

1. **Google Analytics**:
   ```toml
   # 在 hugo.toml 中添加
   [params]
     googleAnalytics = "G-XXXXXXXXXX"
   ```

2. **百度统计**:
   ```html
   <!-- 在 layouts/partials/head.html 中添加 -->
   <script>
     var _hmt = _hmt || [];
     (function() {
       var hm = document.createElement("script");
       hm.src = "https://hm.baidu.com/hm.js?你的统计ID";
       var s = document.getElementsByTagName("script")[0]; 
       s.parentNode.insertBefore(hm, s);
     })();
   </script>
   ```

### 15.7 SEO 优化

**基本 SEO 配置**:

```toml
# 在 hugo.toml 中添加
[params]
  description = "网站描述"
  keywords = ["关键词1", "关键词2", "关键词3"]
  author = "作者名"

# 站点地图配置
[sitemap]
  changefreq = "monthly"
  filename = "sitemap.xml"
  priority = 0.5

# robots.txt
[outputs]
  home = ["HTML", "RSS", "robots.txt"]
```

**文章 SEO 优化**:
```markdown
+++
title = "文章标题"
description = "文章描述（150字以内）"
tags = ["标签1", "标签2"]
categories = ["分类"]
keywords = ["关键词1", "关键词2"]
+++
```

---

## 16. 如何写博客

### 16.1 写作前准备

**确定主题**:
- 选择你擅长或感兴趣的领域
- 确定目标读者
- 规划文章系列

**收集素材**:
- 参考资料和文献
- 代码示例和截图
- 图片和图表

**规划结构**:
- 标题和副标题
- 引言和结论
- 主要内容和要点

### 16.2 创建新文章

**基本命令**:
```bash
# 创建文章
hugo new posts/<文章名>.md

# 示例
hugo new posts/hugo-tutorial.md

# 创建带日期的文章
hugo new posts/2024/hugo-tutorial.md
```

**文章命名规范**:
- 使用小写字母
- 使用连字符分隔单词
- 避免特殊字符
- 示例: `hugo-tutorial.md`, `python-basics.md`

### 16.3 文章结构模板

**基本结构**:
```markdown
+++
date = "2026-07-03T08:00:00Z"
draft = false
title = "文章标题"
description = "简短描述（150字以内）"
tags = ["标签1", "标签2"]
categories = ["分类"]
author = "作者名"
+++

# 文章标题

## 引言

简要介绍文章内容和目标。

## 第一部分

### 1.1 小节标题

详细内容...

### 1.2 小节标题

详细内容...

## 第二部分

### 2.1 小节标题

详细内容...

## 总结

总结文章要点。

## 参考资料

- [参考1](链接1)
- [参考2](链接2)
```

**技术文章结构**:
```markdown
+++
date = "2026-07-03T08:00:00Z"
draft = false
title = "Hugo 博客搭建教程"
description = "从零开始搭建 Hugo 博客并部署到 GitHub Pages"
tags = ["Hugo", "GitHub", "博客"]
categories = ["技术教程"]
+++

# Hugo 博客搭建教程

## 前言

本文将介绍如何从零开始搭建一个 Hugo 博客。

## 环境准备

### 系统要求

- 操作系统: Ubuntu 20.04+
- 内存: 1GB+
- 磁盘空间: 5GB+

### 安装 Hugo

```bash
sudo snap install hugo
```

## 创建项目

```bash
hugo new site myblog
cd myblog
git submodule add https://github.com/adityatelange/hugo-PaperMod.git themes/PaperMod
```

## 配置网站

编辑 `hugo.toml` 文件：

```toml
baseURL = "https://username.github.io/"
title = "我的博客"
theme = "PaperMod"
```

## 创建内容

```bash
hugo new posts/my-first-post.md
```

## 部署到 GitHub

```bash
git add -A
git commit -m "Initial commit"
git push origin main
```

## 总结

通过本文，你已经学会了如何搭建一个 Hugo 博客。

## 参考资料

- [Hugo 官方文档](https://gohugo.io/)
- [PaperMod 主题](https://github.com/adityatelange/hugo-PaperMod)
```

### 16.4 Markdown 语法指南

**标题**:
```markdown
# 一级标题
## 二级标题
### 三级标题
#### 四级标题
```

**文本格式**:
```markdown
**粗体文本**
*斜体文本*
***粗斜体文本***
~~删除线文本*
`行内代码`
```

**列表**:
```markdown
# 无序列表
- 项目1
- 项目2
- 项目3

# 有序列表
1. 第一步
2. 第二步
3. 第三步

# 任务列表
- [x] 已完成任务
- [ ] 未完成任务
```

**链接和图片**:
```markdown
# 链接
[链接文本](https://example.com)

# 图片
![图片描述](图片地址)

# 带标题的图片
![图片描述](图片地址 "图片标题")
```

**代码块**:
```markdown
# 行内代码
`code`

# 代码块
```python
def hello():
    print("Hello, World!")
```

# 带语言标识的代码块
```javascript
function hello() {
    console.log("Hello, World!");
}
```
```

**表格**:
```markdown
| 列1 | 列2 | 列3 |
|-----|-----|-----|
| 内容1 | 内容2 | 内容3 |
| 内容4 | 内容5 | 内容6 |
```

**引用**:
```markdown
> 这是一段引用文本。
>
> 这是引用的第二段。
```

**分隔线**:
```markdown
---
```

**数学公式**（需要支持）:
```markdown
# 行内公式
$E = mc^2$

# 块级公式
$$
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$
```

### 16.5 图片和媒体

**本地图片**:
```bash
# 创建图片目录
mkdir -p static/images

# 将图片放入目录
cp /path/to/image.jpg static/images/

# 在文章中引用
![图片描述](/images/image.jpg)
```

**外部图片**:
```markdown
![图片描述](https://example.com/image.jpg)
```

**图片优化**:
```bash
# 使用 Hugo 的图片处理
{{ $image := resources.Get "images/image.jpg" }}
{{ $image := $image.Resize "800x" }}
<img src="{{ $image.RelPermalink }}" alt="描述">
```

**添加图注**:
```html
<figure>
  <img src="/images/image.jpg" alt="描述">
  <figcaption>图1: 图片说明</figcaption>
</figure>
```

**视频嵌入**:
```html
# YouTube 视频
<iframe width="560" height="315" src="https://www.youtube.com/embed/视频ID" frameborder="0" allowfullscreen></iframe>

# Bilibili 视频
<iframe src="//player.bilibili.com/player.html?bvid=视频ID" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe>
```

### 16.6 分类和标签

**添加分类和标签**:
```markdown
+++
title = "文章标题"
tags = ["Hugo", "GitHub", "博客"]
categories = ["技术教程"]
+++
```

**分类和标签的区别**:
- **分类**: 文章的主要类别（如：技术、生活、学习）
- **标签**: 文章的关键词（如：Hugo、Python、教程）

**最佳实践**:
- 每篇文章 2-5 个标签
- 每篇文章 1-2 个分类
- 使用一致的命名规范
- 避免过于细分

**查看分类和标签页面**:
- 分类: https://<用户名>.github.io/categories/
- 标签: https://<用户名>.github.io/tags/

### 16.7 系列文章

**创建系列文章**:
```markdown
+++
title = "Hugo 教程（一）：基础入门"
description = "Hugo 系列教程第一篇"
tags = ["Hugo", "教程"]
categories = ["技术教程"]
series = ["Hugo 教程"]
weight = 1
+++
```

**系列文章配置**:
```toml
# 在 hugo.toml 中添加
[params]
  ShowSeries = true
  SeriesName = "系列文章"
```

**系列文章导航**:
- 在文章开头显示系列信息
- 显示系列中的其他文章
- 提供上一篇/下一篇链接

### 16.8 草稿和发布

**创建草稿**:
```markdown
+++
title = "草稿文章"
draft = true
+++
```

**本地预览草稿**:
```bash
# 启动服务器并显示草稿
hugo server -D

# 或者
hugo server --buildDrafts
```

**发布文章**:
```bash
# 修改草稿状态
# 将 draft: true 改为 draft: false

# 提交更改
git add content/posts/article.md
git commit -m "Publish article: article.md"
git push origin main
```

**定时发布**:
```markdown
+++
title = "定时发布文章"
date = "2026-07-10T08:00:00Z"
publishDate = "2026-07-10T08:00:00Z"
+++
```

### 16.9 写作技巧

**标题技巧**:
- 使用数字：「10个技巧...」
- 使用疑问：「如何...」
- 使用否定：「避免...」
- 保持简洁：60 字符以内

**开头技巧**:
- 提出问题
- 讲述故事
- 引用名言
- 列举数据

**内容技巧**:
- 使用小标题
- 添加列表
- 插入代码
- 添加图片
- 使用表格

**结尾技巧**:
- 总结要点
- 提出问题
- 鼓励互动
- 提供资源

**SEO 技巧**:
- 使用关键词
- 优化描述
- 添加标签
- 内部链接

### 16.10 写作工具推荐

**编辑器**:
- VS Code（推荐）
- Typora
- Obsidian
- Notion

**Markdown 工具**:
- Markdown Preview Enhanced（VS Code 插件）
- Markdown All in One（VS Code 插件）
- Paste Image（VS Code 插件）

**图片工具**:
- Snipaste（截图）
- TinyPNG（压缩）
- ImageOptim（优化）

**代码工具**:
- Carbon（代码截图）
- CodeSnap（VS Code 插件）

**图表工具**:
- Mermaid（流程图）
- PlantUML（UML 图）
- draw.io（通用图表）

### 16.11 文章模板

**技术教程模板**:
```markdown
+++
title = "技术教程标题"
description = "教程描述"
tags = ["标签1", "标签2"]
categories = ["技术教程"]
+++

# 技术教程标题

## 前言

介绍教程背景和目标。

## 环境准备

### 系统要求

- 要求1
- 要求2

### 安装步骤

```bash
命令1
命令2
```

## 基础知识

### 概念1

解释概念1。

### 概念2

解释概念2。

## 实战演练

### 步骤1

详细步骤。

### 步骤2

详细步骤。

## 常见问题

### 问题1

解答1。

### 问题2

解答2。

## 总结

总结要点。

## 参考资料

- [参考1](链接1)
- [参考2](链接2)
```

**问题解决模板**:
```markdown
+++
title = "问题解决：问题描述"
description = "解决方法"
tags = ["问题解决", "标签"]
categories = ["技术"]
+++

# 问题解决：问题描述

## 问题描述

详细描述问题。

## 问题分析

分析问题原因。

## 解决方案

### 方案1

详细步骤。

### 方案2

详细步骤。

## 验证结果

验证解决效果。

## 总结

总结经验教训。
```

**学习笔记模板**:
```markdown
+++
title = "学习笔记：主题"
description = "学习记录"
tags = ["学习", "笔记"]
categories = ["学习"]
+++

# 学习笔记：主题

## 学习目标

列出学习目标。

## 学习内容

### 要点1

详细内容。

### 要点2

详细内容。

## 实践练习

### 练习1

练习内容。

### 练习2

练习内容。

## 学习心得

分享学习感受。

## 参考资料

- [参考1](链接1)
```

### 16.12 发布流程

**完整发布流程**:
```bash
# 1. 创建文章
hugo new posts/new-article.md

# 2. 编辑文章
vim content/posts/new-article.md

# 3. 本地预览
hugo server -D

# 4. 检查无误后，修改 draft 为 false

# 5. 构建测试
hugo --minify

# 6. 提交更改
git add -A
git commit -m "Add new article: new-article.md"

# 7. 推送到 GitHub
git push origin main

# 8. 等待 GitHub Actions 自动部署

# 9. 验证发布成功
curl -s -o /dev/null -w "%{http_code}" https://<用户名>.github.io/posts/new-article/
```

**批量发布**:
```bash
# 创建多篇文章
hugo new posts/article1.md
hugo new posts/article2.md
hugo new posts/article3.md

# 编辑所有文章
vim content/posts/article1.md
vim content/posts/article2.md
vim content/posts/article3.md

# 提交所有更改
git add -A
git commit -m "Add multiple articles"

# 推送
git push origin main
```

### 16.13 文章管理

**查看文章列表**:
```bash
# 列出所有文章
ls -la content/posts/

# 按时间排序
ls -lt content/posts/

# 按大小排序
ls -lS content/posts/
```

**删除文章**:
```bash
# 删除文章文件
rm content/posts/article.md

# 提交删除
git add -A
git commit -m "Delete article: article.md"
git push origin main
```

**移动文章**:
```bash
# 移动文章到子目录
mkdir -p content/posts/2024
mv content/posts/article.md content/posts/2024/

# 提交移动
git add -A
git commit -m "Move article to 2024 directory"
git push origin main
```

**重命名文章**:
```bash
# 重命名文章
mv content/posts/old-name.md content/posts/new-name.md

# 提交重命名
git add -A
git commit -m "Rename article: old-name to new-name"
git push origin main
```

### 16.14 内容优化

**优化文章标题**:
- 使用关键词
- 保持简洁（60 字符以内）
- 吸引点击

**优化文章描述**:
- 150 字符以内
- 包含关键词
- 吸引阅读

**优化文章结构**:
- 使用小标题
- 添加列表
- 插入代码
- 添加图片

**优化文章链接**:
- 使用描述性链接
- 添加标题属性
- 避免「点击这里」

**优化图片**:
- 压缩图片大小
- 添加 alt 属性
- 使用描述性文件名

**优化代码**:
- 添加语言标识
- 添加注释
- 格式化代码

---

## 17. 附录

### 17.1 常用命令参考

| 命令 | 说明 |
|------|------|
| `hugo new site myblog` | 创建新站点 |
| `hugo new posts/article.md` | 创建新文章 |
| `hugo server` | 启动开发服务器 |
| `hugo server -D` | 启动服务器并显示草稿 |
| `hugo --minify` | 构建并压缩网站 |
| `hugo env` | 查看 Hugo 环境 |
| `hugo version` | 查看 Hugo 版本 |
| `git init` | 初始化 Git 仓库 |
| `git add -A` | 添加所有文件 |
| `git commit -m "message"` | 提交更改 |
| `git push origin main` | 推送到远程 |
| `git pull origin main` | 拉取远程更新 |
| `git submodule update --remote` | 更新子模块 |

### 17.2 目录结构说明

```
/root/myblog/                    # Hugo 项目根目录
├── archetypes/                  # 文章模板
│   └── default.md               # 默认模板
├── assets/                      # 静态资源（CSS、JS）
├── content/                     # 内容目录
│   ├── posts/                   # 文章目录
│   │   └── my-first-post.md    # 文章文件
│   └── about.md                 # 关于页面
├── data/                        # 数据文件
├── i18n/                        # 国际化文件
├── layouts/                     # 布局模板
├── static/                      # 静态文件
├── themes/                      # 主题目录
│   └── PaperMod/                # PaperMod 主题
├── .git/                        # Git 仓库
├── .github/workflows/           # GitHub Actions 工作流
│   └── deploy.yml               # 部署工作流
├── .gitignore                   # Git 忽略规则
├── .gitmodules                  # Git 子模块配置
├── hugo.toml                    # Hugo 配置文件
└── public/                      # 构建输出（自动生成）
```

### 17.3 配置文件示例

```toml
# 基本配置
baseURL = "https://LMDAWN1127.github.io/"
languageCode = "zh-cn"
title = "我的博客"
theme = "PaperMod"

# 分页
paginate = 10

# 日期格式
dateFormat = "2006-01-02"

# 启用功能
enableEmoji = true
enableGitInfo = true

# 构建选项
buildDrafts = false
buildFuture = false
buildExpired = false

# 主题参数
[params]
  author = "LMDAWN1127"
  description = "我的个人博客"
  defaultTheme = "auto"
  ShowShareButtons = true
  ShowReadingTime = true
  ShowPostNavLinks = true
  ShowBreadCrumbs = true
  ShowCodeCopyButtons = true
  ShowToc = true

# 菜单
[[menu.main]]
  identifier = "首页"
  name = "首页"
  url = "/"
  weight = 1

[[menu.main]]
  identifier = "文章"
  name = "文章"
  url = "/posts/"
  weight = 2
```

### 17.4 GitHub Actions 工作流示例

```yaml
name: Deploy Hugo Site

on:
  push:
    branches:
      - main

permissions:
  contents: write
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          submodules: true
          fetch-depth: 0

      - name: Setup Hugo
        uses: peaceiris/actions-hugo@v3
        with:
          hugo-version: 'latest'
          extended: true

      - name: Build
        run: hugo --minify

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./public
          publish_branch: gh-pages
          force_orphan: true
```

### 17.5 常见问题解答

**Q1: 如何更换主题？**
```bash
# 删除旧主题
rm -rf themes/old-theme

# 添加新主题
git submodule add https://github.com/new-theme.git themes/new-theme

# 更新配置
sed -i 's/theme = "old-theme"/theme = "new-theme"/' hugo.toml
```

**Q2: 如何添加自定义 CSS？**
```bash
# 创建自定义 CSS 文件
mkdir -p assets/css
cat > assets/css/custom.css << "EOF"
/* 自定义样式 */
body {
  font-family: 'Custom Font', sans-serif;
}
EOF

# 在配置中引用
# 编辑 layouts/partials/head.html 添加：
# <link rel="stylesheet" href="{{ "css/custom.css" | absURL }}">
```

**Q3: 如何添加 Google Analytics？**
```toml
# 在 hugo.toml 中添加
[params]
  googleAnalytics = "G-XXXXXXXXXX"
```

**Q4: 如何设置多语言？**
```toml
# 在 hugo.toml 中配置
[languages]
  [languages.en]
    title = "My Blog"
    weight = 1
  [languages.zh]
    title = "我的博客"
    weight = 2
```

**Q5: 如何优化网站性能？**
```bash
# 使用 Hugo 的资源管道
hugo --minify

# 启用图片处理
# 在配置中添加
[imaging]
  quality = 75
  resampleFilter = "Lanczos"
```

### 17.6 相关链接

- **Hugo 官方文档**: https://gohugo.io/documentation/
- **PaperMod 主题**: https://github.com/adityatelange/hugo-PaperMod
- **GitHub Pages 文档**: https://docs.github.com/en/pages
- **GitHub Actions 文档**: https://docs.github.com/en/actions
- **Markdown 语法**: https://www.markdownguide.org/basic-syntax/

### 17.7 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0 | 2026-07-03 | 初始版本 |
| 1.1 | 2026-07-03 | 添加博客使用指南和写作教程 |

---

## 📝 总结

本文档详细介绍了 Hugo 博客的完整部署流程和使用方法，包括：

1. **环境准备**: 系统更新、工具安装、Git 配置
2. **Hugo 安装**: 多种安装方式、版本验证
3. **项目创建**: 创建站点、安装主题、目录结构
4. **配置 Hugo**: 配置文件、参数说明、示例配置
5. **内容创建**: 创建文章、模板说明、静态页面
6. **本地测试**: 开发服务器、构建网站、预览效果
7. **Git 配置**: 初始化仓库、.gitignore、首次提交
8. **GitHub 仓库**: 创建仓库、命名规则、获取 Token
9. **推送到 GitHub**: 配置远程仓库、推送到 main 分支
10. **配置 GitHub Pages**: 设置部署源、自定义域名
11. **自动部署**: GitHub Actions 工作流、权限配置
12. **验证部署**: 检查状态、浏览器访问
13. **日常维护**: 发布文章、更新主题、备份项目
14. **故障排除**: 常见问题及解决方案
15. **博客使用指南**: 访问方式、功能介绍、评论配置
16. **如何写博客**: 写作技巧、Markdown 语法、文章模板
17. **附录**: 命令参考、配置示例、FAQ

按照本文档操作，你可以成功部署一个完整的 Hugo 博客到 GitHub Pages，并掌握博客的使用和写作技巧。

---

**文档完成时间**: 2026-07-03  
**文档版本**: 1.1  
**适用 Hugo 版本**: v0.163.3+  
**适用系统**: Ubuntu 22.04.5 LTS
