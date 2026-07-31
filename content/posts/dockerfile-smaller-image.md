---
title: "Dockerfile 构建镜像太大？10 个技巧让镜像瘦身 90%"
date: 2024-07-30T12:00:00+08:00
draft: false
author: "DAWN"
tags: ["Docker", "Dockerfile", "镜像优化", "DevOps", "容器化"]
categories: ["容器技术"]
description: "10 个经过验证的技巧，把 Docker 镜像体积缩小 90% 以上。"
summary: "Docker 镜像太大导致部署慢、存储成本高？本文分享 10 个经过验证的优化技巧，帮你把镜像缩小 90% 以上。"
showToc: true
TocOpen: true
---

#### 1. 选择合适的基础镜像

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

| 基础镜像 | 大小 |
|---------|------|
| `ubuntu:22.04` | ~77MB |
| `python:3.11` | ~1GB |
| `python:3.11-alpine` | ~50MB |
| `distroless` | ~20MB |

#### 2. 使用多阶段构建

最有效的优化手段：编译阶段用大镜像，运行阶段只复制产物。

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

> Go 应用从 ~1GB 缩小到 ~15MB。

#### 3. 合并 RUN 指令

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

#### 4. 清理构建缓存

```dockerfile
# Python - 禁用 pip 缓存
RUN pip install --no-cache-dir -r requirements.txt

# Node.js - 清理 npm 缓存
RUN npm ci --only=production && \
    npm cache clean --force

# Go - 去除调试信息
RUN go build -ldflags="-s -w" -o myapp
```

#### 5. 使用 .dockerignore

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

#### 6. 只安装必要的包

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

#### 7. 使用 --no-install-recommends

```dockerfile
# ❌ 安装了所有推荐包
RUN apt-get install -y curl

# ✅ 只装必须的包（减少约 50% 依赖）
RUN apt-get install -y --no-install-recommends curl
```

#### 8. 压缩静态资源

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

#### 9. 使用 Squash 合并层

```bash
# 合并所有层为一层，去除中间层的重复文件
docker build --squash -t myapp:slim .
```

> 需要在 `/etc/docker/daemon.json` 中启用 experimental 功能。

#### 10. 分析镜像层

```bash
# 使用 dive 工具分析每层大小和内容
docker run --rm -it \
  -v /var/run/docker.sock:/var/run/docker.sock \
  wagoodman/dive myapp:latest

# 或使用 docker history
docker history myapp:latest
```

#### 实战案例：Python 应用

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

#### 实战案例：Node.js 应用

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

#### 推荐工具

| 工具 | 用途 |
|------|------|
| `dive` | 分析镜像每层内容和大小 |
| `docker-slim` | 自动精简镜像 |
| `hadolint` | Dockerfile 静态检查 |
| `trivy` | 镜像安全扫描 |
