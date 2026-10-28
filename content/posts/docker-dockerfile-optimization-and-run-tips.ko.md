---
title: "Docker 실전: Dockerfile 최적화 팁과 컨테이너 시작 기법"
date: 2026-10-28T19:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Docker 효율화 팁을 정리합니다. 빌드 측면의 이미지 레이어 캐싱(Using cache)과 .dockerignore로 1GB 빌드 컨텍스트를 약 1.6MB로 축소, 실행 측면의 docker exec -w 작업 디렉터리 지정, 익명 볼륨 호스트 경로(/var/lib/docker/volumes/<hash>/_data), -p :80 임의 포트 매핑(32768~60999)을 다룹니다."
---

# Docker 실전: Dockerfile 최적화 팁과 컨테이너 시작 기법

Dockerfile을 작성하고 컨테이너를 시작할 때 가장 자주 놓치는 부분은 '어떻게 더 빠르게, 어떻게 더 작게, 어떻게 더 편하게'입니다. 이 글은 자주 쓰이는 실용적인 팁들을 모았습니다. 빌드 측면에서는 이미지 레이어 캐싱(Using cache)의 동작 원리와 `.dockerignore`로 부풀어 오른 빌드 컨텍스트를 줄이는 방법을 설명하고, 실행 측면에서는 컨테이너 진입 후 작업 디렉터리를 지정하는 `docker exec -w`, 익명 볼륨이 호스트에 위치하는 경로, 그리고 `-p :80` 임의 포트 매핑을 시연합니다. 모두 당장 써먹을 수 있는 효율화 방법입니다.

## Dockerfile 최적화 팁

### 팁 1: 이미지 레이어 캐싱

재빌드할 때 변경되지 않은 레이어는 캐시를 히트합니다(`Using cache`):

```bash
docker image build -t dawn-games:v2.8 . 2>&1 | grep -E 'Step|Using cache'
```

```
Step 2/7 : RUN ... apk add nginx ...   <- 변경 없음, 캐시 히트
 ---> Using cache
 ---> 2a68b3185350
Step 3/7 : ADD code/dawn-tanke.tar.gz ...  <- tar 패키지 변경, 재실행
 ---> 9b1dba3f40f1
```

Docker는 각 명령의 실행 결과를 캐싱하며, 명령 내용이나 의존 레이어가 변경된 경우에만 다시 실행합니다. 따라서 자주 바뀌지 않는 명령은 위에, 자주 바뀌는 명령은 아래에 배치하면 캐시 효율을 극대화하고 빌드를 가속할 수 있습니다.

---

### 팁 2: .dockerignore로 파일 무시하기

1. 큰 파일 만들기

```bash
cd /dawn/dockerfile/alpine/tankedazhan-MAINTAINER-LABELS
dd if=/dev/zero of=./bigfile bs=1M count=1024
```

2. .dockerignore 없이 빌드하기(빌드 컨텍스트 폭증)

```bash
docker image build -t dawn-games:v2.12 . 2>&1 | grep 'Sending build context'
# Sending build context to Docker daemon  1.075GB
```

이때 1GB짜리 bigfile이 통째로 Docker 데몬에 전송되어 시간과 대역폭을 낭비합니다.

3. .dockerignore 작성하기

```
big*
*.exe
*.txt
*.log
# config
```

| 규칙 | 효과 |
| --- | --- |
| \`big*\` | big으로 시작하는 파일 모두 무시(예: bigfile) |
| \`*.exe\` / \`*.txt\` / \`*.log\` | 지정한 확장자 무시 |
| \`# config\` | 주석 |

4. .dockerignore 적용 후 빌드하기(크기 급감)

```bash
docker image build -t dawn-games:v2.13 . 2>&1 | grep 'Sending build context'
# Sending build context to Docker daemon  1.623MB
```

### Dockerfile 최적화 요약

**빌드 속도**

1. 자주 바뀌지 않는 명령은 위에, 자주 바뀌는 명령은 아래에 배치하여 캐시 효율 극대화;
2. 빌드에 불필요한 파일은 `.dockerignore`로 무시;
3. 국내 미러(예: Tsinghua 미러)나 로컬 레지스트리를 사용하여 다운로드 속도 향상;
4. 큰 패키지는 로컬/사내 파일 서버에 두어 반복 다운로드 방지.

**이미지 크기**

1. 캐시와 불필요한 패키지 제거(예: `rm -rf /var/cache/`);
2. 불필요한 이미지 레이어를 줄이기 위해 명령어 병합(각 명령은 하나의 중간 레이어를 생성, `docker image ls -a`로 확인 가능);
3. 더 작은 베이스 이미지 사용(예: alpine, 약 5MB).

---

## 컨테이너 시작 기법

### 1. 컨테이너 진입 후 작업 디렉터리 지정

```bash
# exec -w는 컨테이너 진입 후 작업 디렉터리를 지정
root@docker01:~# docker exec -w /usr/share/nginx/html/tanke games pwd
/usr/share/nginx/html/tanke
```

### 2. 익명 볼륨

```bash
# -v 컨테이너 경로
root@docker01:~# docker run -d --name game -v /usr/share/nginx/html dawn-games:v2.8
1aa0eb13c9dbb5a35018543ed125ad855a53a7f6df27519447bd94b407b25f5e
# 익명 볼륨의 호스트 위치 확인
root@docker01:~# docker inspect -f '{{range .Mounts}}{{.Source}}{{end}}' game
/var/lib/docker/volumes/d700421bb6aa4da3f55bf98a8700218471410adb6494805aae5d410c832a9c96/_data
```

익명 볼륨은 Docker가 임의의 볼륨 이름을 할당하며 `/var/lib/docker/volumes/<hash>/_data`에 저장됩니다. 호스트 경로를 지정하고 싶지 않지만 영속성이 필요한 상황에 적합합니다.

### 3. 임의 포트 매핑

```bash
# 임의 포트 매핑(-p :80은 호스트 포트 생략)
root@docker01:~# docker run -dp :80 --name c2-tanke dawn-games:v2.8
fa72c4ac0470a15e7b5c5e9143190ccb7c66f1db715aa0c886a3db4d533c8c4b
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE             COMMAND                  CREATED         STATUS         PORTS                                     NAMES
fa72c4ac0470   dawn-games:v2.8   "nginx -g 'daemon of."   8 seconds ago   Up 7 seconds   0.0.0.0:32769->80/tcp, :::32769->80/tcp   c2-tanke
```

콜론 앞의 호스트 포트를 생략하면 Docker가 `32768~60999` 범위에서 임의의 포트를 할당합니다.
