---
title: "Dockerfile 이미지가 너무 크다고요? 이미지 크기를 90% 줄이는 10가지 팁"
date: 2026-07-30T12:00:00+08:00
draft: false
author: "DAWN"
tags: ["Docker", "Dockerfile", "이미지 최적화", "DevOps", "컨테이너화"]
categories: ["컨테이너 기술"]
description: "Docker 이미지 크기를 90% 이상 줄이는 검증된 10가지 팁을 소개합니다."
summary: "Docker 이미지가 너무 커서 배포가 느리고 스토리지 비용이 부담되시나요? 이 글에서는 이미지 크기를 90% 이상 줄일 수 있는 검증된 10가지 최적화 팁을 공유합니다."
showToc: true
TocOpen: true
---

#### 1. 적절한 베이스 이미지 선택

```dockerfile
# ❌ 너무 큼
FROM ubuntu:22.04          # ~77MB
FROM python:3.11           # ~1GB

# ✅ 추천
FROM python:3.11-alpine    # ~50MB
FROM python:3.11-slim      # ~130MB

# ✅ 최소 크기
FROM gcr.io/distroless/python3  # ~20MB
```

| 베이스 이미지 | 크기 |
|---------|------|
| `ubuntu:22.04` | ~77MB |
| `python:3.11` | ~1GB |
| `python:3.11-alpine` | ~50MB |
| `distroless` | ~20MB |

#### 2. 멀티스테이지 빌드 사용

가장 효과적인 최적화 방법: 컴파일 스테이지에서는 큰 이미지를 사용하고 실행 스테이지에서는 산출물만 복사합니다.

```dockerfile
# 스테이지 1: 컴파일
FROM golang:1.21 AS builder
WORKDIR /app
COPY . .
RUN go build -o myapp

# 스테이지 2: 실행
FROM alpine:3.18
WORKDIR /app
COPY --from=builder /app/myapp .
CMD ["./myapp"]
```

> Go 애플리케이션이 ~1GB에서 ~15MB로 축소됩니다.

#### 3. RUN 명령어 병합

```dockerfile
# ❌ 여러 레이어
RUN apt-get update
RUN apt-get install -y curl
RUN apt-get install -y wget
RUN rm -rf /var/lib/apt/lists/*

# ✅ 하나의 레이어로 병합
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        wget && \
    rm -rf /var/lib/apt/lists/*
```

#### 4. 빌드 캐시 정리

```dockerfile
# Python - pip 캐시 비활성화
RUN pip install --no-cache-dir -r requirements.txt

# Node.js - npm 캐시 정리
RUN npm ci --only=production && \
    npm cache clean --force

# Go - 디버그 정보 제거
RUN go build -ldflags="-s -w" -o myapp
```

#### 5. .dockerignore 사용

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
# 컨텍스트 크기 확인
docker build --no-cache -t test . 2>&1 | grep "Sending build context"
```

#### 6. 필요한 패키지만 설치

```dockerfile
# ❌ 실행 이미지에 빌드 도구가 포함됨
FROM ubuntu:22.04
RUN apt-get install -y build-essential gcc make cmake
COPY . .
RUN make && make install
CMD ["./myapp"]

# ✅ 빌드와 실행 분리
FROM ubuntu:22.04 AS builder
RUN apt-get install -y build-essential gcc make
COPY . .
RUN make && make install

FROM ubuntu:22.04
COPY --from=builder /app/myapp .
CMD ["./myapp"]
```

#### 7. --no-install-recommends 사용

```dockerfile
# ❌ 모든 추천 패키지 설치
RUN apt-get install -y curl

# ✅ 필수 패키지만 설치 (의존성 약 50% 감소)
RUN apt-get install -y --no-install-recommends curl
```

#### 8. 정적 리소스 압축

```dockerfile
# JavaScript 압축
RUN uglifyjs app.js -o app.min.js

# CSS 압축
RUN cssnano app.css app.min.css

# 이미지 압축
RUN find . -name "*.png" -exec optipng {} \;

# Go 바이너리 디버그 정보 제거
RUN go build -ldflags="-s -w" -o myapp
```

#### 9. Squash로 레이어 병합

```bash
# 모든 레이어를 하나로 병합하여 중간 레이어의 중복 파일 제거
docker build --squash -t myapp:slim .
```

> `/etc/docker/daemon.json`에서 experimental 기능을 활성화해야 합니다.

#### 10. 이미지 레이어 분석

```bash
# dive 도구로 각 레이어의 크기와 내용 분석
docker run --rm -it \
  -v /var/run/docker.sock:/var/run/docker.sock \
  wagoodman/dive myapp:latest

# 또는 docker history 사용
docker history myapp:latest
```

#### 실전 사례: Python 애플리케이션

```dockerfile
# ❌ 최적화 전 (1.2GB)
FROM python:3.11
WORKDIR /app
COPY . .
RUN pip install -r requirements.txt
CMD ["python", "app.py"]
```

```dockerfile
# ✅ 최적화 후 (150MB, 87% 감소)
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

#### 실전 사례: Node.js 애플리케이션

```dockerfile
# ❌ 최적화 전 (1.1GB)
FROM node:18
WORKDIR /app
COPY . .
RUN npm install
CMD ["node", "server.js"]
```

```dockerfile
# ✅ 최적화 후 (180MB, 84% 감소)
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

#### 추천 도구

| 도구 | 용도 |
|------|------|
| `dive` | 이미지의 각 레이어 내용과 크기 분석 |
| `docker-slim` | 이미지 자동 최적화 |
| `hadolint` | Dockerfile 정적 검사 |
| `trivy` | 이미지 보안 스캔 |
