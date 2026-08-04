---
title: "CentOS に Claude Code をデプロイする完全ガイド"
date: 2026-07-04T05:00:00+08:00
draft: false
author: "DAWN"
tags: ["Claude Code", "CentOS", "AI", "デプロイ"]
categories: ["技術チュートリアル"]
description: "CentOS 上でゼロから Claude Code をデプロイし、Node.js のインストール、API Key の設定、よくある問題のトラブルシューティングまでカバーします。"
summary: "Claude Code は Anthropic が提供する CLI ツールで、ターミナルで直接 Claude AI と対話しながらコーディング作業を行えます。本記事では CentOS へのデプロイ手順を全工程にわたり紹介します。"
showToc: true
TocOpen: true
---

#### 1. 環境要件

- **OS**: CentOS 7/8/Stream 9
- **Node.js**: v18 以上
- **メモリ**: 2GB 以上を推奨
- **ネットワーク**: Anthropic API へのアクセスが必要

#### 2. Node.js のインストール

```bash
# 安装 NodeSource 仓库
curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -

# 安装 Node.js
sudo yum install -y nodejs

# 检查
node -v
npm -v
```

> Node.js のバージョンが低い場合は、nvm でバージョンを管理します：
> ```bash
> curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
> source ~/.bashrc
> nvm install 20
> nvm use 20
> ```

#### 3. Claude Code のインストール

```bash
# 全局安装
npm install -g @anthropic-ai/claude-code

# 检查
claude --version
```

> 権限の問題が発生した場合、2 つの解決策があります：
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

#### 4. API Key の設定

```bash
# 方式一：环境变量（推荐）
echo 'export ANTHROPIC_API_KEY="your-api-key-here"' >> ~/.bashrc
source ~/.bashrc

# 检查
echo $ANTHROPIC_API_KEY
```

> 方法 2：`claude` を直接実行すると、初回起動時に API Key の入力が求められます。

#### 5. 基本的な使い方

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

| コマンド | 説明 |
|------|------|
| `claude` | インタラクティブセッションを開始 |
| `claude -p "質問"` | 直接質問、非インタラクティブモード |
| `claude config` | 設定の確認/変更 |
| `claude update` | 最新バージョンに更新 |

#### 6. ネットワーク問題のトラブルシューティング

Anthropic API への接続がタイムアウトする場合：

```bash
# 配置代理
export https_proxy="http://your-proxy:port"
export http_proxy="http://your-proxy:port"

# 测试连通性
curl -s https://api.anthropic.com/ | head -5
```

#### 7. セキュリティの推奨事項

```bash
# 不要硬编码 API Key，始终用环境变量
echo 'export ANTHROPIC_API_KEY="sk-ant-xxx"' >> ~/.bashrc  # ✅
# ANTHROPIC_API_KEY=sk-ant-xxx 写在代码里  # ❌

# 限制文件权限
chmod 600 ~/.bashrc

# 检查是否泄露
grep -r "ANTHROPIC_API_KEY" --include="*.py" --include="*.js" .
```
