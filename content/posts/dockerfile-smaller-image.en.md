---
title: "Docker Image Too Large? 10 Tips to Shrink It by 90%"
date: 2026-07-30T12:00:00+08:00
draft: false
author: "DAWN"
tags: ["Docker", "Dockerfile", "Image Optimization", "DevOps", "Containerization"]
categories: ["Container Tech"]
description: "10 proven techniques to reduce Docker image size by over 90%."
summary: "Big Docker images slow down deployments and inflate storage costs? This article shares 10 proven techniques to shrink your image by more than 90%."
showToc: true
TocOpen: true
---

#### 1. Choose the Right Base Image

```dockerfile
# ❌ Too large
FROM ubuntu:22.04          # ~77MB
FROM python:3.11           # ~1GB

# ✅ Recommended
FROM python:3.11-alpine    # ~50MB
FROM python:3.11-slim      # ~130MB

# ✅ Smallest
FROM gcr.io/distroless/python3  # ~20MB
```

| Base image | Size |
|------------|------|
| `ubuntu:22.04` | ~77MB |
| `python:3.11` | ~1GB |
| `python:3.11-alpine` | ~50MB |
| `distroless` | ~20MB |

#### 2. Use Multi-Stage Builds

The most effective technique: compile in a large image, ship the artifact from a minimal one.

```dockerfile
# Stage 1: compile
FROM golang:1.21 AS builder
WORKDIR /app
COPY . .
RUN go build -o myapp

# Stage 2: runtime
FROM alpine:3.18
WORKDIR /app
COPY --from=builder /app/myapp .
CMD ["./myapp"]
```

> A Go app goes from ~1GB to ~15MB.

#### 3. Combine RUN Instructions

```dockerfile
# ❌ Multiple layers
RUN apt-get update
RUN apt-get install -y curl
RUN apt-get install -y wget
RUN rm -rf /var/lib/apt/lists/*

# ✅ Combined into one layer
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        wget && \
    rm -rf /var/lib/apt/lists/*
```

#### 4. Clean Up Build Cache

```dockerfile
# Python — disable pip cache
RUN pip install --no-cache-dir -r requirements.txt

# Node.js — clear npm cache
RUN npm ci --only=production && \
    npm cache clean --force

# Go — strip debug info
RUN go build -ldflags="-s -w" -o myapp
```

#### 5. Use .dockerignore

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
# Check context size
docker build --no-cache -t test . 2>&1 | grep "Sending build context"
```

#### 6. Install Only What You Need

```dockerfile
# ❌ Build tools left in the runtime image
FROM ubuntu:22.04
RUN apt-get install -y build-essential gcc make cmake
COPY . .
RUN make && make install
CMD ["./myapp"]

# ✅ Build and runtime separated
FROM ubuntu:22.04 AS builder
RUN apt-get install -y build-essential gcc make
COPY . .
RUN make && make install

FROM ubuntu:22.04
COPY --from=builder /app/myapp .
CMD ["./myapp"]
```

#### 7. Use --no-install-recommends

```dockerfile
# ❌ Installs all recommended packages
RUN apt-get install -y curl

# ✅ Install only what's required (~50% fewer dependencies)
RUN apt-get install -y --no-install-recommends curl
```

#### 8. Compress Static Assets

```dockerfile
# Minify JavaScript
RUN uglifyjs app.js -o app.min.js

# Minify CSS
RUN cssnano app.css app.min.css

# Optimize images
RUN find . -name "*.png" -exec optipng {} \;

# Strip debug info from Go binaries
RUN go build -ldflags="-s -w" -o myapp
```

#### 9. Use Squash to Merge Layers

```bash
# Merge all layers into one, removing duplicate files from intermediate layers
docker build --squash -t myapp:slim .
```

> Requires the experimental feature to be enabled in `/etc/docker/daemon.json`.

#### 10. Analyze Image Layers

```bash
# Use dive to analyze each layer's size and content
docker run --rm -it \
  -v /var/run/docker.sock:/var/run/docker.sock \
  wagoodman/dive myapp:latest

# Or use docker history
docker history myapp:latest
```

#### Real-World Case: Python App

```dockerfile
# ❌ Before optimization (1.2GB)
FROM python:3.11
WORKDIR /app
COPY . .
RUN pip install -r requirements.txt
CMD ["python", "app.py"]
```

```dockerfile
# ✅ After optimization (150MB, 87% smaller)
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

#### Real-World Case: Node.js App

```dockerfile
# ❌ Before optimization (1.1GB)
FROM node:18
WORKDIR /app
COPY . .
RUN npm install
CMD ["node", "server.js"]
```

```dockerfile
# ✅ After optimization (180MB, 84% smaller)
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

#### Recommended Tools

| Tool | Purpose |
|------|---------|
| `dive` | Analyze each layer's content and size |
| `docker-slim` | Automatically shrink images |
| `hadolint` | Dockerfile static analysis |
| `trivy` | Container security scanning |
