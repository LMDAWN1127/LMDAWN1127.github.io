---
title: "Docker 실전: Dockerfile 로 멀티 게임 이미지 빌드와 ADD 자동 압축 해제"
date: 2026-10-26T15:20:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "올인원 구형 이미지 dawn-games-dawn:v0.6 에서 중계 컨테이너로 두 게임 (골드 마이너, 플래피 버드) 의 정적 파일을 꺼내 각각 tar.gz 로 묶고, Dockerfile 의 ADD 명령으로 빌드 시 Alpine+nginx 컨테이너에 자동 압축 해제합니다. 마지막으로 이미지를 빌드하고 컨테이너를 띄워 도메인으로 두 게임에 접속하며, ADD 와 COPY 의 핵심 차이 (ADD 는 tar.gz 를 자동 해제) 도 정리합니다."
---

# Docker 실전: Dockerfile 로 멀티 게임 이미지 빌드와 ADD 자동 압축 해제

올인원 형태의 구형 이미지 `uhub.service.ucloud.cn/dawn/dawn-games-dawn:v0.6` 가 있고 nginx 로 두 개의 작은 게임 골드 마이너 (`huangjinkuanggong`) 와 플래피 버드 (`killbird`) 를 호스팅합니다. 이 두 게임을 각각 분리해 가벼운 **Alpine + nginx** 멀티 게임 이미지를 만들려 합니다.

이 글에서는 먼저 구형 이미지에서 게임 정적 파일을 꺼내 각각 `tar.gz` 로 묶고, Dockerfile 의 **`ADD` 명령**으로 빌드 시 컨테이너에 자동 압축 해제한 뒤, 이미지 빌드·컨테이너 실행·도메인 접속까지 전부 수행합니다. 아울러 `ADD` 와 `COPY` 의 가장 중요한 차이——**`ADD` 는 `tar.gz` 를 자동 해제하지만 `COPY` 는 있는 그대로 복사만 한다**——도 분명히 합니다.

## 1. 이미지에서 게임 코드 추출

| 게임       | 이미지 내 경로                             |
| -------- | ------------------------------------------ |
| 골드 마이너 | `/usr/local/nginx/html/huangjinkuanggong/` |
| 플래피 버드 | `/usr/local/nginx/html/killbird/`        |

## 2. 디렉터리 생성 및 중계 컨테이너로 복사

```bash
root@docker01:~# mkdir -pv /dawn/dockerfile/alpine/kuanggong-killbird
mkdir: created directory '/dawn/dockerfile/alpine/kuanggong-killbird'
root@docker01:~# cd /dawn/dockerfile/alpine/kuanggong-killbird

# 중계 컨테이너 실행
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# docker run -d --name games-extract uhub.service.ucloud.cn/dawn/dawn-games-dawn:v0.6 tail -f /dev/null
26a6e7d541a0034b41b0339a283006de59ca79e553c718c78b176933fe326315

# 이미지에서 두 게임 디렉터리 복사
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# docker cp games-extract:/usr/local/nginx/html/huangjinkuanggong ./huangjinkuanggong
Successfully copied 5.3MB to /dawn/dockerfile/alpine/kuanggong-killbird/huangjinkuanggong
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# docker cp games-extract:/usr/local/nginx/html/killbird ./killbird
Successfully copied 1.27MB to /dawn/dockerfile/alpine/kuanggong-killbird/killbird
```

## 3. tar.gz 로 압축

```bash
# 게임 디렉터리 내부에서 압축하여 해제 후 바로 게임 파일이 되도록 함
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# tar -czf dawn-huangjinkuanggong.tar.gz -C huangjinkuanggong .
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# tar -czf dawn-killbird.tar.gz -C killbird .

# 원본 디렉터리 정리
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# rm -rf huangjinkuanggong killbird
```

## 4. Dockerfile 작성

```bash
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# cat Dockerfile
# 베이스 이미지 지정. 이후 모든 작업은 이 이미지 위에서 수행됨
FROM alpine:3.20.2

# 컨테이너에서 명령을 실행해 nginx 설치
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && \
     apk update && \
     apk add nginx && \
     rm -rf /var/cache/ rm -f /usr/share/nginx/*  && \
     mkdir -pv /usr/share/nginx/html/huangjinkuanggong  && \
     mkdir -pv /usr/share/nginx/html/killbird

## 현재 디렉터리의 "dawn-bird.zip" 을 컨테이너의 / 디렉터리로 복사
#COPY dawn-huangjinkuanggong.tar.gz /
#COPY dawn-killbird.tar.gz /
#
#
## 컨테이너의 지정 디렉터리에 프로그램 압축 해제
#RUN tar xf /dawn-huangjinkuanggong.tar.gz -C /usr/share/nginx/html/huangjinkuanggong && \
#    tar xf /dawn-killbird.tar.gz -C /usr/share/nginx/html/killbird && \
#    rm -f /dawn-huangjinkuanggong.tar.gz /dawn-killbird.tar.gz

# ADD 명령은 tar 아카이브 내용을 컨테이너의 지정 경로에 자동으로 압축 해제합니다. 파일을 컨테이너에 복사한 뒤 압축을 풀고 마지막에 원본 파일을 삭제한다고 이해하면 됩니다
ADD dawn-huangjinkuanggong.tar.gz /usr/share/nginx/html/huangjinkuanggong
ADD dawn-killbird.tar.gz /usr/share/nginx/html/killbird

# 로컬 파일을 컨테이너의 지정 경로에 복사하여 기존 파일 내용을 덮어씀
COPY games.conf /etc/nginx/http.d/default.conf

# 컨테이너 시작 명령 지정
CMD ["nginx","-g","daemon off;"]
```

## 5. nginx 설정 games.conf 작성

```bash
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# vim games.conf
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/huangjinkuanggong;
    server_name   game01.dawn.com;
}

server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/killbird;
    server_name   game02.dawn.com;
}
```

## 6. 이미지 빌드

```bash
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# docker image build -t dawn-games:v2.6 .
DEPRECATED: The legacy builder is deprecated and will be removed in a future release.
            Install the buildx component to build images with BuildKit:
            https://docs.docker.com/go/buildx/

Sending build context to Docker daemon  5.015MB
Step 1/6 : FROM alpine:3.20.2
 ---> 324bc02ae123
Step 2/6 : RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories &&      apk update &&      apk add nginx &&      rm -rf /var/cache/ rm -f /usr/share/nginx/*  &&      mkdir -pv /usr/share/nginx/html/huangjinkuanggong  &&      mkdir -pv /usr/share/nginx/html/killbird
 ---> Running in e7850b9319be
fetch https://mirrors.tuna.tsinghua.edu.cn/alpine/v3.20/main/x86_64/APKINDEX.tar.gz
fetch https://mirrors.tuna.tsinghua.edu.cn/alpine/v3.20/community/x86_64/APKINDEX.tar.gz
v3.20.10-118-gcb3382a0eb8 [https://mirrors.tuna.tsinghua.edu.cn/alpine/v3.20/main]
v3.20.10-106-gcfb1a4769c3 [https://mirrors.tuna.tsinghua.edu.cn/alpine/v3.20/community]
OK: 24181 distinct packages available
(1/2) Installing pcre (8.45-r3)
(2/2) Installing nginx (1.26.3-r0)
Executing nginx-1.26.3-r0.pre-install
Executing nginx-1.26.3-r0.post-install
Executing busybox-1.36.1-r29.trigger
OK: 9 MiB in 16 packages
created directory: '/usr/share/nginx/html/'
created directory: '/usr/share/nginx/html/huangjinkuanggong'
created directory: '/usr/share/nginx/html/killbird'
 ---> Removed intermediate container e7850b9319be
 ---> a2f446944fd8
Step 3/6 : ADD dawn-huangjinkuanggong.tar.gz /usr/share/nginx/html/huangjinkuanggong
 ---> 40640938b557
Step 4/6 : ADD dawn-killbird.tar.gz /usr/share/nginx/html/killbird
 ---> 0ffa408b4136
Step 5/6 : COPY games.conf /etc/nginx/http.d/default.conf
 ---> 51cdedf25280
Step 6/6 : CMD ["nginx","-g","daemon off;"]
 ---> Running in 3cbdb8335dd2
 ---> Removed intermediate container 3cbdb8335dd2
 ---> 9b4495d60e31
Successfully built 9b4495d60e31
Successfully tagged dawn-games:v2.6
```

## 7. 빌드에서 생성된 중간 레이어 관찰 (Dockerfile 의 모든 명령은 새 이미지 레이어를 만든다)

```bash
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# docker image ls -a | grep -E '9b4495d60e31|51cdedf25280|0ffa408b4136|40640938b557|a2f446944fd8|324bc02ae123'
<none>                                         <none>     40640938b557   7 minutes ago       14.4MB
<none>                                         <none>     51cdedf25280   7 minutes ago       15.6MB
dawn-games                                     v2.6       9b4495d60e31   7 minutes ago       15.6MB
<none>                                         <none>     a2f446944fd8   7 minutes ago       9.25MB
<none>                                         <none>     0ffa408b4136   7 minutes ago       15.6MB
alpine                                         3.20.2     324bc02ae123   2 years ago         7.8MB
```

## 8. 컨테이너 실행

```bash
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# docker run -d --name games-test -p 8082:80 dawn-games:v2.6
383f09529e6ec1b2de0f67f2600de92e8ee920e66091b4832915ff611b0c253e
```

## 9. 로컬 hosts 수정 후 도메인으로 접속

```bash
11.0.1.121  game01.dawn.com
11.0.1.121  game02.dawn.com
```

http://game01.dawn.com:8082/

![image-20261028184914653](/images/docker-dockerfile-multi-game-image-add-image-20261028184914653.png)

http://game02.dawn.com:8082/

![image-20261028184929946](/images/docker-dockerfile-multi-game-image-add-image-20261028184929946.png)