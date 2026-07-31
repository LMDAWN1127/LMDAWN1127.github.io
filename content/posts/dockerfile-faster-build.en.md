---
title: "How to Make Dockerfile Builds Faster: 10 Practical Optimization Tips"
date: 2026-07-30T11:00:00+08:00
draft: false
author: "DAWN"
tags: ["Docker", "Dockerfile", "Performance", "DevOps", "CI/CD"]
categories: ["Container Tech"]
description: "10 proven tips — from cache strategy to multi-stage builds — to dramatically cut Docker build time."
summary: "Docker builds too slow? This article shares 10 proven optimization tips, from cache strategy to multi-stage builds, to help you cut build time dramatically."
showToc: true
TocOpen: true
---

#### 1. Order Instructions to Leverage Cache

Put rarely-changing instructions first, frequently-changing ones last. Once a layer's cache is invalidated, every subsequent layer is rebuilt.

```dockerfile
# ❌ Wrong: reinstall dependencies on every code change
FROM node:18-alpine
WORKDIR /app
COPY . .                          # code changes often
RUN npm ci --production           # deps rarely change
CMD ["node", "server.js"]

# ✅ Right: reinstall deps only when they change
FROM node:18-alpine
WORKDIR /app
COPY package.json package-lock.json ./  # dep definitions (rarely change)
RUN npm ci --production                  # install deps (rarely change)
COPY . .                                 # source code (changes often)
CMD ["node", "server.js"]
```

```bash
# Check cache hits
docker build -t myapp . 2>&1 | grep -E "(CACHED|Using cache)"
```

#### 2. Use .dockerignore to Shrink the Build Context

`docker build` sends the entire directory to the Docker daemon, including `.git`, `node_modules`, and other files you don't need.

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
# Check context size
docker build --no-cache -t test . 2>&1 | grep "Sending build context"
# Before: Sending build context to Docker daemon  1.2GB
# After:  Sending build context to Docker daemon  50MB
```

#### 3. Use Lightweight Base Images

| Base image | Size | Notes |
|------------|------|-------|
| `ubuntu:22.04` | ~77MB | Full Ubuntu |
| `python:3.11` | ~1GB | Full Python |
| `python:3.11-slim` | ~130MB | Stripped down |
| `python:3.11-alpine` | ~50MB | Alpine-based |

```dockerfile
# ❌ Too large
FROM python:3.11          # 1GB

# ✅ Recommended
FROM python:3.11-slim     # 130MB

# ✅ Smallest (watch out for musl compatibility)
FROM python:3.11-alpine   # 50MB
```

> Alpine uses `musl` instead of `glibc`, which can break some software. If you hit issues, fall back to `slim`.

#### 4. Combine RUN Instructions to Reduce Layers

Every RUN creates a new layer — more layers means slower builds and larger images.

```dockerfile
# ❌ 5 layers
RUN apt-get update
RUN apt-get install -y curl
RUN apt-get install -y wget
RUN apt-get clean
RUN rm -rf /var/lib/apt/lists/*

# ✅ 1 layer
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        wget && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

```bash
# Check image layer count
docker history myapp:latest
```

#### 5. Use Multi-Stage Builds

Build in one stage, run in another, and copy only what's needed.

```dockerfile
# Stage 1: build
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o app .

# Stage 2: runtime (only ~15MB)
FROM alpine:3.18
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/app .
EXPOSE 8080
CMD ["./app"]
```

| Approach | Image size | Build time |
|----------|------------|------------|
| Single-stage | ~1.2GB | 5 min |
| Multi-stage | ~15MB | 2 min |

#### 6. Use BuildKit to Speed Up Builds

BuildKit supports parallel builds and advanced caching.

```bash
# Enable BuildKit
export DOCKER_BUILDKIT=1

# Or enable it permanently in /etc/docker/daemon.json
# {
#   "features": { "buildkit": true }
# }
```

```dockerfile
# Use cache mounts (a BuildKit feature)
# syntax=docker/dockerfile:1
FROM node:18-alpine
WORKDIR /app
COPY package.json package-lock.json ./
# Cache mount avoids re-downloading deps every build
RUN --mount=type=cache,target=/root/.npm \
    npm ci --production
COPY . .
CMD ["node", "server.js"]
```

```bash
# Check whether BuildKit is enabled
docker build --progress=plain -t myapp . 2>&1 | head -5
```

#### 7. Use Cache Import/Export

In CI/CD, the cache is lost after every build. Cache import/export keeps it across builds.

```bash
# Export to a local directory
docker build \
  --cache-from type=local,src=/tmp/cache \
  --cache-to type=local,dest=/tmp/cache \
  -t myapp .

# Use a registry as cache backend
docker build \
  --cache-from type=registry,ref=myregistry/myapp:cache \
  --cache-to type=registry,ref=myregistry/myapp:cache,mode=max \
  -t myapp .
```

```yaml
# GitHub Actions example
- name: Build and push
  uses: docker/build-push-action@v5
  with:
    context: .
    push: true
    tags: myapp:latest
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

#### 8. Install Dependencies in Parallel

```dockerfile
# Node.js — npm ci is faster than npm install
RUN npm ci --production

# Python — disable pip cache
RUN pip install --no-cache-dir -r requirements.txt

# Go — download modules in parallel
RUN go mod download

# Rust — use cargo-chef
COPY --from=chef /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
```

#### 9. Clean Up Build Cache and Temp Files

Clean up in the same RUN instruction to avoid leaving files in earlier layers.

```dockerfile
# ✅ Right: clean up in the same layer
RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential && \
    make && make install && \
    apt-get purge -y --auto-remove build-essential && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# ❌ Wrong: cleanup in another layer — files still exist
RUN apt-get update && apt-get install -y build-essential
RUN make && make install
RUN apt-get clean  # too late! earlier layers still contain the files
```

Per-language cleanup commands:

```dockerfile
# Node.js
RUN npm ci --production && npm cache clean --force

# Python
RUN pip install --no-cache-dir -r requirements.txt

# Go
RUN go build -o app . && go clean -cache
```

#### 10. Pin a Specific Version Tag

```dockerfile
# ❌ latest may change, cache is unpredictable
FROM node:latest

# ✅ Specific version
FROM node:18.17.0-alpine3.18

# ✅ Safest: use the SHA256 digest
FROM node:18.17.0-alpine3.18@sha256:abc123...
```

#### How Layers Work

```bash
# View image layer history
docker history <image-name>
```

Instructions that create new layers: `FROM`, `RUN`, `COPY`, `ADD`

Instructions that don't create new layers (just metadata): `CMD`, `ENTRYPOINT`, `ENV`, `EXPOSE`, `WORKDIR`, `USER`, `LABEL`, `ARG`, `VOLUME`

```dockerfile
# This creates 4 layers
FROM node:18-alpine        # layer 1
RUN apk add --no-cache curl # layer 2
COPY package.json .         # layer 3
RUN npm install             # layer 4

# These instructions add no layer
WORKDIR /app               # no layer
ENV NODE_ENV=production    # no layer
EXPOSE 3000               # no layer
CMD ["node", "server.js"]  # no layer
```

#### Before / After Comparison

```dockerfile
# ❌ Before optimization (8 min, 1.2GB)
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
# ✅ After optimization (1.5 min, 150MB)
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

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Build time | 8 min | 1.5 min | 81% ⬇️ |
| Image size | 1.2GB | 150MB | 87% ⬇️ |
| Context size | 500MB | 50MB | 90% ⬇️ |
| Cache hit rate | 10% | 90% | 80% ⬆️ |

#### Monitoring and Debugging

```bash
# Show detailed build time
time docker build -t myapp .

# BuildKit detailed progress
DOCKER_BUILDKIT=1 docker build --progress=plain -t myapp .

# Analyze image layers
docker history myapp:latest

# Use dive for deep layer analysis
dive myapp:latest
```
