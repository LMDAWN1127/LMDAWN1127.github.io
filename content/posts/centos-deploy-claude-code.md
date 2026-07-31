---
title: "CentOS 部署 Claude Code 全流程指南"
date: 2026-07-04T05:00:00+08:00
draft: false
author: "DAWN"
tags: ["Claude Code", "CentOS", "AI", "部署"]
categories: ["技术教程"]
description: "在 CentOS 上从零部署 Claude Code，涵盖 Node.js 安装、API Key 配置、常见问题排查。"
summary: "Claude Code 是 Anthropic 推出的 CLI 工具，可在终端直接与 Claude AI 交互完成编码任务。本文介绍 CentOS 部署全流程。"
showToc: true
TocOpen: true
cover:
  image: "/images/covers/centos-deploy-claude-code.png"
  alt: "CentOS 部署 Claude Code"
---

#### 1. 环境要求

- **操作系统**: CentOS 7/8/Stream 9
- **Node.js**: v18 或更高
- **内存**: 建议 2GB 以上
- **网络**: 需要访问 Anthropic API

#### 2. 安装 Node.js

```bash
# 安装 NodeSource 仓库
curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -

# 安装 Node.js
sudo yum install -y nodejs

# 检查
node -v
npm -v
```

> 如果 Node.js 版本过低，使用 nvm 管理版本：
> ```bash
> curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
> source ~/.bashrc
> nvm install 20
> nvm use 20
> ```

#### 3. 安装 Claude Code

```bash
# 全局安装
npm install -g @anthropic-ai/claude-code

# 检查
claude --version
```

> 遇到权限问题有两种解决方案：
> ```bash
> # 方案一：sudo
> sudo npm install -g @anthropic-ai/claude-code
>
> # 方案二：修改 npm 全局目录（推荐）
> mkdir -p ~/.npm-global
> npm config set prefix "~/.npm-global"
> echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
> source ~/.bashrc
> ```

#### 4. 配置 API Key

```bash
# 方式一：环境变量（推荐）
echo 'export ANTHROPIC_API_KEY="your-api-key-here"' >> ~/.bashrc
source ~/.bashrc

# 检查
echo $ANTHROPIC_API_KEY
```

> 方式二：直接运行 `claude`，首次启动时会提示输入 API Key。

#### 5. 基本使用

```bash
# 启动交互式会话
cd /path/to/your/project
claude

# 直接提问（非交互模式）
claude -p "写一个 Python 脚本，统计当前目录下所有文件的数量"

# 分析代码
cat main.py | claude -p "分析这段代码的潜在问题"

# 查看/修改配置
claude config

# 更新到最新版本
claude update
```

| 命令 | 说明 |
|------|------|
| `claude` | 启动交互式会话 |
| `claude -p "问题"` | 直接提问，非交互模式 |
| `claude config` | 查看/修改配置 |
| `claude update` | 更新到最新版本 |

#### 6. 网络问题排查

如果连接 Anthropic API 超时：

```bash
# 配置代理
export https_proxy="http://your-proxy:port"
export http_proxy="http://your-proxy:port"

# 测试连通性
curl -s https://api.anthropic.com/ | head -5
```

#### 7. 安全建议

```bash
# 不要硬编码 API Key，始终用环境变量
echo 'export ANTHROPIC_API_KEY="sk-ant-xxx"' >> ~/.bashrc  # ✅
# ANTHROPIC_API_KEY=sk-ant-xxx 写在代码里  # ❌

# 限制文件权限
chmod 600 ~/.bashrc

# 检查是否泄露
grep -r "ANTHROPIC_API_KEY" --include="*.py" --include="*.js" .
```
