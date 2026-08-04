---
title: "Dockerfile のビルドをより速くするには？10 の実用的な最適化テクニック"
date: 2026-07-30T11:00:00+08:00
draft: false
author: "DAWN"
tags: ["Docker", "Dockerfile", "パフォーマンス最適化", "DevOps", "CI/CD"]
categories: ["コンテナ技術"]
description: "10 の実証済みテクニックで、キャッシュ戦略からマルチステージビルドまで、Docker のビルド時間を大幅に短縮します。"
summary: "Docker のビルドが遅い？本記事では 10 の実証済み最適化テクニックを共有し、キャッシュ戦略からマルチステージビルドまで、ビルド時間を大幅に短縮する方法を紹介します。"
showToc: true
TocOpen: true
---

#### 1. 命令の順序を適切に配置する（キャッシュの活用）

変更頻度の低い命令を前に、変更頻度の高い命令を後に配置します。あるレイヤーのキャッシュが無効になると、以降のすべてのレイヤーが再ビルドされます。

```dockerfile
# ❌ 错误：每次改代码都要重新装依赖
FROM node:18-alpine
WORKDIR /app
COPY . .                          # 代码经常变
RUN npm ci --production           # 依赖很少变
CMD ["node", "server.js"]

# ✅ 正确：依赖变化时才重新安装
FROM node:18-alpine
WORKDIR /app
COPY package.json package-lock.json ./  # 依赖定义（很少变）
RUN npm ci --production                  # 安装依赖（很少变）
COPY . .                                 # 代码（经常变）
CMD ["node", "server.js"]
```

```bash
# 检查缓存命中情况
docker build -t myapp . 2>&1 | grep -E "(CACHED|Using cache)"
```

#### 2. .dockerignore でコンテキストを削減する

`docker build` は `.git` や `node_modules` など不要なファイルを含むディレクトリ全体を Docker daemon に送信します。

```dockerignore
# .dockerignore
.git
.github
.vscode
.idea
node_modules
dist
build
*.md
*.log
.env
.env.local
.DS_Store
coverage
.nyc_output
```

```bash
# 检查上下文大小
docker build --no-cache -t test . 2>&1 | grep "Sending build context"
# 优化前：Sending build context to Docker daemon  1.2GB
# 优化后：Sending build context to Docker daemon  50MB
```

#### 3. 軽量なベースイメージを使用する

| ベースイメージ | サイズ | 説明 |
|----------|------|------|
| `ubuntu:22.04` | ~77MB | 完全な Ubuntu |
| `python:3.11` | ~1GB | 完全な Python を含む |
| `python:3.11-slim` | ~130MB | スリム版 |
| `python:3.11-alpine` | ~50MB | Alpine 版 |

```dockerfile
# ❌ 太大
FROM python:3.11          # 1GB

# ✅ 推荐
FROM python:3.11-slim     # 130MB

# ✅ 最小（注意 musl 兼容性问题）
FROM python:3.11-alpine   # 50MB
```

> Alpine は `glibc` ではなく `musl` を使用するため、一部のソフトウェアで互換性の問題が生じる可能性があります。問題に遭遇した場合は `slim` 版を選択してください。

#### 4. RUN 命令を統合してレイヤー数を削減する

各 RUN は新しいレイヤーを作成し、レイヤーが多いほどビルドが遅くなり、イメージも大きくなります。

```dockerfile
# ❌ 5 个层
RUN apt-get update
RUN apt-get install -y curl
RUN apt-get install -y wget
RUN apt-get clean
RUN rm -rf /var/lib/apt/lists/*

# ✅ 1 个层
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        wget && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

```bash
# 检查镜像层数
docker history myapp:latest
```

#### 5. マルチステージビルドを使用する

あるステージでビルドを行い、別のステージで実行し、必要なファイルだけをコピーします。

```dockerfile
# 阶段 1：构建
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o app .

# 阶段 2：运行（只有 ~15MB）
FROM alpine:3.18
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/app .
EXPOSE 8080
CMD ["./app"]
```

| 方式 | イメージサイズ | ビルド時間 |
|------|----------|----------|
| シングルステージ | ~1.2GB | 5 分 |
| マルチステージ | ~15MB | 2 分 |

#### 6. BuildKit でビルドを高速化する

BuildKit は並列ビルドと高度なキャッシュをサポートしています。

```bash
# 启用 BuildKit
export DOCKER_BUILDKIT=1

# 或在 /etc/docker/daemon.json 中永久配置
# {
#   "features": { "buildkit": true }
# }
```

```dockerfile
# 使用缓存挂载（BuildKit 特性）
# syntax=docker/dockerfile:1
FROM node:18-alpine
WORKDIR /app
COPY package.json package-lock.json ./
# 缓存挂载避免每次重新下载依赖
RUN --mount=type=cache,target=/root/.npm \
    npm ci --production
COPY . .
CMD ["node", "server.js"]
```

```bash
# 检查 BuildKit 是否启用
docker build --progress=plain -t myapp . 2>&1 | head -5
```

#### 7. キャッシュのインポート・エクスポートを使用する

CI/CD では、キャッシュは毎回のビルド後に失われます。キャッシュのインポート・エクスポートを使うことで、ビルド間でキャッシュを保持できます。

```bash
# 导出到本地
docker build \
  --cache-from type=local,src=/tmp/cache \
  --cache-to type=local,dest=/tmp/cache \
  -t myapp .

# 使用注册表作为缓存
docker build \
  --cache-from type=registry,ref=myregistry/myapp:cache \
  --cache-to type=registry,ref=myregistry/myapp:cache,mode=max \
  -t myapp .
```

```yaml
# GitHub Actions 示例
- name: Build and push
  uses: docker/build-push-action@v5
  with:
    context: .
    push: true
    tags: myapp:latest
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

#### 8. 依存関係の並列インストール

```dockerfile
# Node.js - npm ci 比 npm install 快
RUN npm ci --production

# Python - 禁用缓存
RUN pip install --no-cache-dir -r requirements.txt

# Go - 并行下载模块
RUN go mod download

# Rust - 使用 cargo-chef
COPY --from=chef /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
```

#### 9. ビルドキャッシュと一時ファイルのクリーンアップ

同じ RUN 命令内でクリーンアップを行い、ファイルがレイヤーに残らないようにします。

```dockerfile
# ✅ 正确：同一层中清理
RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential && \
    make && make install && \
    apt-get purge -y --auto-remove build-essential && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# ❌ 错误：清理在另一层，文件仍然存在
RUN apt-get update && apt-get install -y build-essential
RUN make && make install
RUN apt-get clean  # 太晚了！前面的层已经包含了文件
```

各言語のクリーンアップコマンド：

```dockerfile
# Node.js
RUN npm ci --production && npm cache clean --force

# Python
RUN pip install --no-cache-dir -r requirements.txt

# Go
RUN go build -o app . && go clean -cache
```

#### 10. 特定バージョンのタグを使用する

```dockerfile
# ❌ latest 可能变化，缓存不可预测
FROM node:latest

# ✅ 特定版本
FROM node:18.17.0-alpine3.18

# ✅ 更安全：使用 SHA256 摘要
FROM node:18.17.0-alpine3.18@sha256:abc123...
```

#### イメージレイヤーの詳細

```bash
# 查看镜像层历史
docker history <image-name>
```

新しいレイヤーを作成する命令：`FROM`、`RUN`、`COPY`、`ADD`

新しいレイヤーを作成しない命令（メタデータのみ）：`CMD`、`ENTRYPOINT`、`ENV`、`EXPOSE`、`WORKDIR`、`USER`、`LABEL`、`ARG`、`VOLUME`

```dockerfile
# 这会创建 4 个层
FROM node:18-alpine        # 层 1
RUN apk add --no-cache curl # 层 2
COPY package.json .         # 层 3
RUN npm install             # 层 4

# 这些指令不增加层
WORKDIR /app               # 无层
ENV NODE_ENV=production    # 无层
EXPOSE 3000               # 无层
CMD ["node", "server.js"]  # 无层
```

#### 最適化効果の比較

```dockerfile
# ❌ 优化前（8 分钟，1.2GB）
FROM ubuntu:22.04
RUN apt-get update
RUN apt-get install -y python3 python3-pip
RUN apt-get install -y build-essential
WORKDIR /app
COPY . .
RUN pip3 install -r requirements.txt
CMD ["python3", "app.py"]
```

```dockerfile
# ✅ 优化后（1.5 分钟，150MB）
# syntax=docker/dockerfile:1
FROM python:3.11-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r requirements.txt

FROM python:3.11-slim
WORKDIR /app
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY . .
EXPOSE 8000
CMD ["python", "app.py"]
```

| 指標 | 最適化前 | 最適化後 | 改善 |
|------|--------|--------|------|
| ビルド時間 | 8 分 | 1.5 分 | 81% ⬇️ |
| イメージサイズ | 1.2GB | 150MB | 87% ⬇️ |
| コンテキストサイズ | 500MB | 50MB | 90% ⬇️ |
| キャッシュヒット率 | 10% | 90% | 80% ⬆️ |

#### 監視とデバッグ

```bash
# 显示详细构建时间
time docker build -t myapp .

# BuildKit 详细进度
DOCKER_BUILDKIT=1 docker build --progress=plain -t myapp .

# 分析镜像层
docker history myapp:latest

# 使用 dive 工具深入分析
dive myapp:latest
```
