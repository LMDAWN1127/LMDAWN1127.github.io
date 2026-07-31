---
title: "Dockerfile 빌드 속도를 높이는 방법? 10가지 실용적인 최적화 팁"
date: 2026-07-30T11:00:00+08:00
draft: false
author: "DAWN"
tags: ["Docker", "Dockerfile", "성능 최적화", "DevOps", "CI/CD"]
categories: ["컨테이너 기술"]
description: "캐시 전략부터 멀티스테이지 빌드까지, Docker 빌드 시간을 대폭 단축하는 검증된 10가지 팁을 소개합니다."
summary: "Docker 빌드가 너무 느리신가요? 이 글에서는 캐시 전략부터 멀티스테이지 빌드까지, 빌드 시간을 대폭 단축할 수 있는 검증된 10가지 최적화 팁을 공유합니다."
showToc: true
TocOpen: true
---

#### 1. 명령어 순서 최적화 (캐시 활용)

변경 빈도가 낮은 명령어를 앞에, 높은 명령어를 뒤에 배치하세요. 특정 레이어의 캐시가 무효화되면 그 이후의 모든 레이���가 다시 빌드됩니다.

```dockerfile
# ❌ 잘못된 예: 코드 수정 시마다 의존성을 다시 설치
FROM node:18-alpine
WORKDIR /app
COPY . .                          # 코드는 자주 변경됨
RUN npm ci --production           # 의존성은 거의 변경되지 않음
CMD ["node", "server.js"]

# ✅ 올바른 예: 의존성 변경 시에만 다시 설치
FROM node:18-alpine
WORKDIR /app
COPY package.json package-lock.json ./  # 의존성 정의 (거의 변경되지 않음)
RUN npm ci --production                  # 의존성 설치 (거의 변경되지 않음)
COPY . .                                 # 코드 (자주 변경됨)
CMD ["node", "server.js"]
```

```bash
# 캐시 적중 여부 확인
docker build -t myapp . 2>&1 | grep -E "(CACHED|Using cache)"
```

#### 2. .dockerignore로 컨텍스트 축소

`docker build`는 `.git`, `node_modules` 등 불필요한 파일을 포함한 전체 디렉터리를 Docker daemon으로 전송합니다.

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
# 컨텍스트 크기 확인
docker build --no-cache -t test . 2>&1 | grep "Sending build context"
# 최적화 전: Sending build context to Docker daemon  1.2GB
# 최적화 후: Sending build context to Docker daemon  50MB
```

#### 3. 경량 베이스 이미지 사용

| 베이스 이미지 | 크기 | 설명 |
|----------|------|------|
| `ubuntu:22.04` | ~77MB | 완전한 Ubuntu |
| `python:3.11` | ~1GB | 완전한 Python 포함 |
| `python:3.11-slim` | ~130MB | 경량 버전 |
| `python:3.11-alpine` | ~50MB | Alpine 버전 |

```dockerfile
# ❌ 너무 큼
FROM python:3.11          # 1GB

# ✅ 추천
FROM python:3.11-slim     # 130MB

# ✅ 최소 크기 (musl 호환성 문제 주의)
FROM python:3.11-alpine   # 50MB
```

> Alpine은 `glibc` 대신 `musl`을 사용하므로 일부 소프트웨어가 호환되지 않을 수 있습니다. 문제가 발생하면 `slim` 버전을 선택하세요.

#### 4. RUN 명령어 병합으로 레이어 수 감소

각 RUN은 새로운 레이어를 생성하며, 레이어가 많을수록 빌드가 느려지고 이미지가 커집니다.

```dockerfile
# ❌ 5개 레이어
RUN apt-get update
RUN apt-get install -y curl
RUN apt-get install -y wget
RUN apt-get clean
RUN rm -rf /var/lib/apt/lists/*

# ✅ 1개 레이어
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        wget && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

```bash
# 이미지 레이어 수 확인
docker history myapp:latest
```

#### 5. 멀티스테이지 빌드 사용

한 스테이지에서 빌드하고 다른 스테이지에서 실행하여 필요한 파일만 복사합니다.

```dockerfile
# 스테이지 1: 빌드
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o app .

# 스테이지 2: 실행 (~15MB)
FROM alpine:3.18
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/app .
EXPOSE 8080
CMD ["./app"]
```

| 방식 | 이미지 크기 | 빌드 시간 |
|------|----------|----------|
| 싱글 스테이지 | ~1.2GB | 5분 |
| 멀티 스테이지 | ~15MB | 2분 |

#### 6. BuildKit으로 빌드 가속화

BuildKit은 병렬 빌드와 고급 캐싱을 지원합니다.

```bash
# BuildKit 활성화
export DOCKER_BUILDKIT=1

# 또는 /etc/docker/daemon.json에 영구 설정
# {
#   "features": { "buildkit": true }
# }
```

```dockerfile
# 캐시 마운트 사용 (BuildKit 기능)
# syntax=docker/dockerfile:1
FROM node:18-alpine
WORKDIR /app
COPY package.json package-lock.json ./
# 캐시 마운트로 매번 의존성을 다시 다운로드하지 않음
RUN --mount=type=cache,target=/root/.npm \
    npm ci --production
COPY . .
CMD ["node", "server.js"]
```

```bash
# BuildKit 활성화 여부 확인
docker build --progress=plain -t myapp . 2>&1 | head -5
```

#### 7. 캐시 가져오기/내보내기 사용

CI/CD 환경에서는 매 빌드 후 캐시가 손실됩니다. 캐시 가져오기/내보내기를 사용하면 빌드 간 캐시를 유지할 수 있습니다.

```bash
# 로컬로 내보내기
docker build \
  --cache-from type=local,src=/tmp/cache \
  --cache-to type=local,dest=/tmp/cache \
  -t myapp .

# 레지스트리를 캐시로 사용
docker build \
  --cache-from type=registry,ref=myregistry/myapp:cache \
  --cache-to type=registry,ref=myregistry/myapp:cache,mode=max \
  -t myapp .
```

```yaml
# GitHub Actions 예제
- name: Build and push
  uses: docker/build-push-action@v5
  with:
    context: .
    push: true
    tags: myapp:latest
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

#### 8. 의존성 병렬 설치

```dockerfile
# Node.js - npm ci가 npm install보다 빠름
RUN npm ci --production

# Python - 캐시 비활성화
RUN pip install --no-cache-dir -r requirements.txt

# Go - 모듈 병렬 다운로드
RUN go mod download

# Rust - cargo-chef 사용
COPY --from=chef /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
```

#### 9. 빌드 캐시 및 임시 파일 정리

동일한 RUN 명령어 내에서 정리하여 파일이 레이어에 남지 않도록 합니다.

```dockerfile
# ✅ 올바른 예: 동일 레이어에서 정리
RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential && \
    make && make install && \
    apt-get purge -y --auto-remove build-essential && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# ❌ 잘못된 예: 정리가 다른 레이어에서 수행되어 파일이 여전히 존재함
RUN apt-get update && apt-get install -y build-essential
RUN make && make install
RUN apt-get clean  # 너무 늦었습니다! 이��� 레이어에 파일이 이미 포함됨
```

언어별 정리 명령어:

```dockerfile
# Node.js
RUN npm ci --production && npm cache clean --force

# Python
RUN pip install --no-cache-dir -r requirements.txt

# Go
RUN go build -o app . && go clean -cache
```

#### 10. 특정 버전 태그 사용

```dockerfile
# ❌ latest는 변경될 수 있어 캐시를 예측할 수 없음
FROM node:latest

# ✅ 특정 버전
FROM node:18.17.0-alpine3.18

# ✅ 더 안전: SHA256 다이제스트 사용
FROM node:18.17.0-alpine3.18@sha256:abc123...
```

#### 이미지 레이어 상세 설명

```bash
# 이미지 레이어 히스토리 확인
docker history <image-name>
```

새 레이어를 생성하는 명령어: `FROM`, `RUN`, `COPY`, `ADD`

레이어를 생성하지 않는 명령어 (메타데이터만): `CMD`, `ENTRYPOINT`, `ENV`, `EXPOSE`, `WORKDIR`, `USER`, `LABEL`, `ARG`, `VOLUME`

```dockerfile
# 4개 레이어 생성
FROM node:18-alpine        # 레이어 1
RUN apk add --no-cache curl # 레이어 2
COPY package.json .         # 레이어 3
RUN npm install             # 레이어 4

# 이 명령어들은 레이어를 추가하지 않음
WORKDIR /app               # 레이어 없음
ENV NODE_ENV=production    # 레이어 없음
EXPOSE 3000               # 레이어 없음
CMD ["node", "server.js"]  # 레이어 없음
```

#### 최적화 효과 비교

```dockerfile
# ❌ 최적화 전 (8분, 1.2GB)
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
# ✅ 최적화 후 (1.5분, 150MB)
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

| 지표 | 최적화 전 | 최적화 후 | 개선 |
|------|--------|--------|------|
| 빌드 시간 | 8분 | 1.5분 | 81% ⬇️ |
| 이미지 크기 | 1.2GB | 150MB | 87% ⬇️ |
| 컨텍스트 크기 | 500MB | 50MB | 90% ⬇️ |
| 캐시 적중률 | 10% | 90% | 80% ⬆️ |

#### 모니터링 및 디버깅

```bash
# 상세 빌드 시간 표시
time docker build -t myapp .

# BuildKit 상세 진행 상황
DOCKER_BUILDKIT=1 docker build --progress=plain -t myapp .

# 이미지 레이어 분석
docker history myapp:latest

# dive 도구로 심층 분석
dive myapp:latest
```
