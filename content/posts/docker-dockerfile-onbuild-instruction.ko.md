---
title: "Dockerfile ONBUILD 명령 실전"
date: 2026-10-29T11:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "You_Jump_I_Jump 게임 이미지로 Dockerfile ONBUILD 명령을 시연한다. 지연 트리거 메커니즘(정의된 명령은 현재 이미지 빌드 시 실행되지 않고, 다른 이미지가 이 이미지를 베이스로 사용할 때만 자동 트리거됨)을 이해하고, 2개의 ONBUILD 명령(RUN 으로 디렉터리/로그 생성, LABEL 로 블로그 URL 추가)을 포함한 베이스 이미지와 자식 이미지 Dockerfile 을 작성한 뒤 v2.19/v2.20 빌드 후 docker inspect 로 OnBuild 와 Labels 를 비교하고 컨테이너로 파일시스템 차이를 비교하며, 마지막으로 -f 로 여러 Dockerfile 을 지정해 다른 이미지를 빌드하는 방법을 설명한다."
---

# Dockerfile ONBUILD 명령 실전

**실험 목적**

ONBUILD 명령의 지연 트리거 메커니즘을 이해한다: 정의된 명령은 현재 이미지를 빌드할 때 실행되지 않고, 다른 이미지가 현재 이미지를 베이스 이미지(FROM)로 사용해 빌드할 때만 자동으로 트리거된다. 주로 "베이스 이미지 + 애플리케이션 이미지" 계층 구조를 구성할 때 쓰인다.

---

## 1. Dockerfile 작성

```bash
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# cat Dockerfile
FROM alpine:3.20.2

MAINTAINER dawn 123456@dawn.com www.dawn.com xixi haha

LABEL school=czu \
      class=computer01 \
      auther=dawn \
      email=123456@dawn.com \
      office=www.dawn.com

WORKDIR /usr/share/nginx/html

VOLUME /usr/share/nginx/html

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && \
     apk update && \
     apk add nginx openssh-server curl && \
     sed -i 's@#PermitRootLogin prohibit-password@PermitRootLogin yes@' /etc/ssh/sshd_config && \
     ssh-keygen -A && \
     rm -rf /var/cache/ /usr/share/nginx/html/*

EXPOSE 80 22

RUN adduser -u 2025 dawn -D && \
    install -d /var/lib/nginx/tmp/client_body -o dawn -g dawn && \
    touch /var/lib/nginx/logs/error.log  /var/log/nginx/access.log && \
    chown dawn:dawn -R  /run/nginx/  /var/lib/nginx/logs/error.log /var/log/nginx/access.log  /var/lib/nginx/

# USER dawn

HEALTHCHECK --interval=1s \
            --timeout=1s \
            --start-period=10s \
            --retries=5 \
            CMD curl -H "host: game01.dawn.com" 127.0.0.1

ADD code/dawn-tiaoyitiao.tar.gz /usr/share/nginx/html/tiaoyitiao

COPY config/games.conf /etc/nginx/http.d/default.conf
COPY config/nginx.conf /etc/nginx/nginx.conf

COPY scripts/start.sh /

# 현재 이미지에서는 사용하지 않는 Dockerfile 명령을 정의한다. 다른 이미지가 이 이미지를 참조하면 해당 Dockerfile 명령이 트리거된다
ONBUILD RUN mkdir /dawn-tiaoyitiao && \
        touch /dawn-tiaoyitiao/xixi.log && \
        touch /dawn-tiaoyitiao/haha.log

ONBUILD LABEL blog=https://lmdawn1127.github.io

ENTRYPOINT ["/bin/sh","-x","/start.sh"]
```

### 자식 이미지 Dockerfile

```bash
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# cat haha.dockerfile
FROM dawn-games:v2.19

RUN mkdir /dawn-dawn
```

---

## 2. nginx 설정 파일 준비

### 2.1 가상 호스트 설정 games.conf

```bash
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# cat config/games.conf
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/tiaoyitiao;
    server_name   game01.dawn.com;
}
```

### 2.2 메인 설정 nginx.conf

```bash
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# cat config/nginx.conf
user dawn;
worker_processes auto;
pcre_jit on;
error_log /var/log/nginx/error.log warn;
include /etc/nginx/modules/*.conf;
include /etc/nginx/conf.d/*.conf;
events {
    worker_connections 024;
}
http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    server_tokens off;
    client_max_body_size 1m;
    sendfile on;
    tcp_nopush on;
    ssl_protocols TLSv1.1 TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:2m;
    ssl_session_timeout 1h;
    ssl_session_tickets off;
    gzip_vary on;
    map $http_upgrade $connection_upgrade {
        default upgrade;
        '' close;
    }
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
            '$status $body_bytes_sent "$http_referer" '
            '"$http_user_agent" "$http_x_forwarded_for"';
    access_log /var/log/nginx/access.log main;
    include /etc/nginx/http.d/*.conf;
}
```

---

## 3. 스크립트 준비

**시작 스크립트 start.sh**

```bash
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# cat scripts/start.sh
#!/bin/sh

# init root password
if [ -n $dawn_USERNAME ];then
    USERNAME=${dawn_USERNAME:-root}

    id ${USERNAME}

    if [ $? != 0 ];then
       adduser ${USERNAME} -D
    fi
fi

if [ -n "$1" ];then
   PASSWORD=$1
elif [ -n "$dawn_PASSWORD" ]; then
   PASSWORD=${dawn_PASSWORD}
else
   PASSWORD=123
fi

echo $USERNAME:$PASSWORD | chpasswd

# start sshd service
/usr/sbin/sshd

# start nginx service
# nginx -g 'daemon off;'
nginx

# block process
tail -f /etc/hosts
```

---

## 4. 이미지 빌드

### 4.1 베이스 이미지 v2.19 빌드

```bash
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# docker image build -t dawn-games:v2.19 .
...
Step 14/16 : ONBUILD RUN mkdir /dawn-tiaoyitiao &&         touch /dawn-tiaoyitiao/xixi.log &&         touch /dawn-tiaoyitiao/haha.log
 ---> fe722e1557fe
Step 15/16 : ONBUILD LABEL blog=https://lmdawn1127.github.io
 ---> 6e267cdd3ef1
Step 16/16 : ENTRYPOINT ["/bin/sh","-x","/start.sh"]
 ---> 0dcff928c63c
Successfully built 0dcff928c63c
Successfully tagged dawn-games:v2.19
```

이 시점에서 ONBUILD RUN mkdir ... 와 ONBUILD LABEL ... 는 기록만 되고 실제로 실행되지는 않는다.

### 4.2 자식 이미지 v2.20 빌드 (ONBUILD 트리거)

```bash
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# docker image build -t dawn-games:v2.20 -f haha.dockerfile .
Sending build context to Docker daemon  4.034MB
Step 1/2 : FROM dawn-games:v2.19
# Executing 2 build triggers          ← 2개의 ONBUILD 명령이 자동 트리거됨
 ---> a4206d87efe7
Step 2/2 : RUN mkdir /dawn-dawn
 ---> 4be63f5e0568
Successfully built 4be63f5e0568
Successfully tagged dawn-games:v2.20
```

---

## 5. 이미지 정보 확인 (ONBUILD 트리거 전후)

```bash
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# docker inspect -f "{{.Config.Labels}}" dawn-games:v2.19
map[auther:dawn class:computer01 email:123456@dawn.com office:www.dawn.com school:czu]

root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# docker inspect -f "{{.Config.OnBuild}}" dawn-games:v2.19
[RUN mkdir /dawn-tiaoyitiao &&         touch /dawn-tiaoyitiao/xixi.log &&         touch /dawn-tiaoyitiao/haha.log LABEL blog=https://lmdawn1127.github.io]

root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# docker inspect -f "{{.Config.OnBuild}}" dawn-games:v2.20
[]

root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# docker inspect -f "{{.Config.Labels}}" dawn-games:v2.20
map[auther:dawn blog:https://lmdawn1127.github.io class:computer01 email:123456@dawn.com office:www.dawn.com school:czu]
```

---

## 6. 컨테이너 정보 확인 (파일시스템 차이)

```bash
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# docker run -d --name tiao19 dawn-games:v2.19
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# docker run -d --name tiao20 dawn-games:v2.20
```

### 6.1 v2.19 컨테이너 (ONBUILD 트리거 없음, dawn-tiaoyitiao 디렉터리 없음)

```bash
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# docker exec tiao19 ls -d /dawn-tiaoyitiao
ls: /dawn-tiaoyitiao: No such file or directory
```

### 6.2 v2.20 컨테이너 (ONBUILD 트리거됨, 디렉터리 2개 추가)

```bash
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# docker exec tiao20 ls -d /dawn-tiaoyitiao /dawn-dawn
/dawn-dawn
/dawn-tiaoyitiao

root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# docker exec tiao20 ls -l /dawn-tiaoyitiao/
total 0
-rw-r--r--    1 root     root             0 Oct 29 02:56 haha.log
-rw-r--r--    1 root     root             0 Oct 29 02:56 xixi.log
```

---

**부록: 빌드 시 여러 Dockerfile 지정**

```bash
# -f 로 다른 Dockerfile 파일 이름을 지정해 다른 이미지를 빌드
docker image build -t dawn-games:v2.20 -f ../haha.dockerfile ..
docker image build -t dawn-games:v2.21 -f ../xixi.dockerfile ..
```

