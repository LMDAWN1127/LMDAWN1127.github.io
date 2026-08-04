---
title: "Dockerfile のビルドイメージが大きすぎる？10 のテクニックでイメージを 90% スリム化"
date: 2026-07-30T12:00:00+08:00
draft: false
author: "DAWN"
tags: ["Docker", "Dockerfile", "イメージ最適化", "DevOps", "コンテナ化"]
categories: ["コンテナ技術"]
description: "10 の実証済みテクニックで、Docker イメージサイズを 90% 以上削減します。"
summary: "Docker イメージが大きすぎてデプロイが遅く、ストレージコストが高くなっていませんか？本記事では 10 の実証済み最適化テクニックを共有し、イメージを 90% 以上スリム化する方法を紹介します。"
showToc: true
TocOpen: true
---

#### 1. 適切なベースイメージを選択する

```dockerfile
# ❌ 太大
FROM ubuntu:22.04          # ~77MB
FROM python:3.11           # ~1GB

# ✅ 推荐
FROM python:3.11-alpine    # ~50MB
FROM python:3.11-slim      # ~130MB

# ✅ 最小
FROM gcr.io/distroless/python3  # ~20MB
```

| ベースイメージ | サイズ |
|---------|------|
| `ubuntu:22.04` | ~77MB |
| `python:3.11` | ~1GB |
| `python:3.11-alpine` | ~50MB |
| `distroless` | ~20MB |

#### 2. マルチステージビルドを使用する

最も効果的な最適化手法：コンパイルステージでは大きなイメージを使い、実行ステージでは成果物だけをコピーします。

```dockerfile
# 阶段 1：编译
FROM golang:1.21 AS builder
WORKDIR /app
COPY . .
RUN go build -o myapp

# 阶段 2：运行
FROM alpine:3.18
WORKDIR /app
COPY --from=builder /app/myapp .
CMD ["./myapp"]
```

> Go アプリケーションが ~1GB から ~15MB に縮小されます。

#### 3. RUN 命令を統合する

```dockerfile
# ❌ 多个层
RUN apt-get update
RUN apt-get install -y curl
RUN apt-get install -y wget
RUN rm -rf /var/lib/apt/lists/*

# ✅ 合并为一个层
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        wget && \
    rm -rf /var/lib/apt/lists/*
```

#### 4. ビルドキャッシュのクリーンアップ

```dockerfile
# Python - 禁用 pip 缓存
RUN pip install --no-cache-dir -r requirements.txt

# Node.js - 清理 npm 缓存
RUN npm ci --only=production && \
    npm cache clean --force

# Go - 去除调试信息
RUN go build -ldflags="-s -w" -o myapp
```

#### 5. .dockerignore を使用する

```dockerignore
# .dockerignore
.git
node_modules
*.md
.env
.vscode
__pycache__
*.pyc
dist
build
coverage
```

```bash
# 检查上下文大小
docker build --no-cache -t test . 2>&1 | grep "Sending build context"
```

#### 6. 必要なパッケージのみインストールする

```dockerfile
# ❌ 运行镜像里装了编译工具
FROM ubuntu:22.04
RUN apt-get install -y build-essential gcc make cmake
COPY . .
RUN make && make install
CMD ["./myapp"]

# ✅ 编译和运行分离
FROM ubuntu:22.04 AS builder
RUN apt-get install -y build-essential gcc make
COPY . .
RUN make && make install

FROM ubuntu:22.04
COPY --from=builder /app/myapp .
CMD ["./myapp"]
```

#### 7. --no-install-recommends を使用する

```dockerfile
# ❌ 安装了所有推荐包
RUN apt-get install -y curl

# ✅ 只装必须的包（减少约 50% 依赖）
RUN apt-get install -y --no-install-recommends curl
```

#### 8. 静的リソースの圧縮

```dockerfile
# 压缩 JavaScript
RUN uglifyjs app.js -o app.min.js

# 压缩 CSS
RUN cssnano app.css app.min.css

# 压缩图片
RUN find . -name "*.png" -exec optipng {} \;

# Go 二进制去除调试信息
RUN go build -ldflags="-s -w" -o myapp
```

#### 9. Squash でレイヤーを統合する

```bash
# 合并所有层为一层，去除中间层的重复文件
docker build --squash -t myapp:slim .
```

> `/etc/docker/daemon.json` で experimental 機能を有効にする必要があります。

#### 10. イメージレイヤーを分析する

```bash
# 使用 dive 工具分析每层大小和内容
docker run --rm -it \
  -v /var/run/docker.sock:/var/run/docker.sock \
  wagoodman/dive myapp:latest

# 或使用 docker history
docker history myapp:latest
```

#### 実践例：Python アプリケーション

```dockerfile
# ❌ 优化前（1.2GB）
FROM python:3.11
WORKDIR /app
COPY . .
RUN pip install -r requirements.txt
CMD ["python", "app.py"]
```

```dockerfile
# ✅ 优化后（150MB，缩小 87%）
FROM python:3.11-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

FROM python:3.11-slim
WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY . .
ENV PATH=/root/.local/bin:$PATH
CMD ["python", "app.py"]
```

#### 実践例：Node.js アプリケーション

```dockerfile
# ❌ 优化前（1.1GB）
FROM node:18
WORKDIR /app
COPY . .
RUN npm install
CMD ["node", "server.js"]
```

```dockerfile
# ✅ 优化后（180MB，缩小 84%）
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
USER node
CMD ["node", "server.js"]
```

#### 推奨ツール

| ツール | 用途 |
|------|------|
| `dive` | イメージの各レイヤーの内容とサイズを分析 |
| `docker-slim` | イメージを自動的にスリム化 |
| `hadolint` | Dockerfile の静的チェック |
| `trivy` | イメージのセキュリティスキャン |
