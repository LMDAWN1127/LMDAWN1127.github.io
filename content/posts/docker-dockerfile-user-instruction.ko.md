---
title: "Dockerfile 일반 사용자로 컨테이너 실행(USER 명령) 실전"
date: 2026-10-29T10:47:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Space Huggers 게임으로 Dockerfile USER 명령을 사용해 컨테이너를 일반 사용자 dawn(uid 2025) 으로 실행하는 방법을 시연합니다. 일반 사용자로 nginx 를 실행하는 데 필요한 디렉터리/파일 소유권 조정을 먼저 이해하고, Dockerfile(USER dawn 으로 전환하기 전 시스템 디렉터리 chown), nginx 설정(user dawn), 시작 스크립트(nginx 백그라운드 + tail 블록) 를 작성한 뒤 이미지를 빌드하여 프로세스 사용자, 컨테이너 설정, 접속, 건강 상태를 검증하고, 마지막으로 일반 사용자는 nginx 를 시작할 수 있지만 sshd 는 시작할 수 없는 권한 경계를 비교합니다."
---

# Dockerfile 일반 사용자로 컨테이너 실행(USER 명령) 실전

**실험 목적**

Docker 컨테이너는 기본적으로 root 사용자로 서비스를 실행하며, 운영 환경에서 보안 위험이 됩니다. 이 실습에서는 `USER` 명령을 사용해 컨테이너를 일반 사용자 dawn(uid 2025) 으로 실행하는 방법과 일반 사용자로 nginx 를 실행할 때의 권한 문제 해결 방법을 보여줍니다.

---

## 1. 수동 테스트 명령

Dockerfile 를 작성하기 전에, nginx 를 일반 사용자로 실행하기 위해 필요한 몇 가지를 먼저 이해한다:

```bash
# 1. 일반 사용자 dawn 생성, uid 2025 지정, -D 는 비밀번호/홈 디렉터리 미생성 의미
adduser -u 2025 dawn -D

# 2. nginx 메인 설정의 실행 사용자를 nginx 에서 dawn 으로 변경
sed -i '/^user/s#nginx#dawn#' /etc/nginx/nginx.conf

# 3. nginx 를 일반 사용자로 실행하려면 이 디렉터리들에 쓰기 권한이 있어야 함(없으면 nginx 시작 시 권한 오류)
/var/lib/nginx/tmp/client_body   # 임시 파일 디렉터리
/var/lib/nginx/logs/error.log    # 오류 로그
```

nginx 마스터 프로세스는 기본적으로 root 로 시작된 후 워커를 `user` 지시문이 지정한 사용자로 권한 강등시킵니다. 하지만 마스터 프로세스조차 일반 사용자로 돌리려면, 실행에 필요한 디렉터리/파일의 소유권을 먼저 해당 사용자로 변경해야 합니다.

---

## 2. Dockerfile 작성

```bash
root@docker01:/dawn/dockerfile/alpine/chengbao-USER# cat Dockerfile
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

ADD code/dawn-chengbao.tar.gz /usr/share/nginx/html/chengbao

COPY config/games.conf /etc/nginx/http.d/default.conf
COPY config/nginx.conf /etc/nginx/nginx.conf

RUN adduser -u 2025 dawn -D && \
    install -d /var/lib/nginx/tmp/client_body -o dawn -g dawn && \
    touch /var/lib/nginx/logs/error.log  /var/log/nginx/access.log && \
    chown dawn:dawn -R  /run/nginx/  /var/lib/nginx/logs/error.log /var/log/nginx/access.log  /var/lib/nginx/

# 서비스 사용자 지정, 기본은 root. 일반 사용자를 지정하면 해당 사용자가 컨테이너에 존재하는지 확인
USER dawn

COPY scripts/start.sh /

HEALTHCHECK --interval=1s \
            --timeout=1s \
            --start-period=10s \
            --retries=5 \
            CMD curl -H "host: game01.dawn.com" 127.0.0.1

ENTRYPOINT ["/bin/sh","-x","/start.sh"]
```

 `USER` 명령은 그 이후의 명령에만 영향을 줍니다. 따라서 먼저 위의 `RUN` 에서 디렉터리 소유권을 변경한 다음 `USER dawn` 으로 전환해야 합니다. 그렇지 않으면 일반 사용자는 `/var/lib/nginx` 와 같은 시스템 디렉터리를 수정할 권한이 없습니다.

---

## 3. nginx 설정

### 3.1 가상 호스트 설정 games.conf

```bash
root@docker01:/dawn/dockerfile/alpine/chengbao-USER# cat config/games.conf
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/chengbao;
    server_name   game01.dawn.com;
}
```

### 3.2 메인 설정 nginx.conf (user dawn)

```bash
root@docker01:/dawn/dockerfile/alpine/chengbao-USER# cat config/nginx.conf
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

## 4. 시작 스크립트

### 4.2 시작 스크립트 start.sh

```bash
root@docker01:/dawn/dockerfile/alpine/chengbao-USER# cat scripts/start.sh
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

여기서는 nginx 를 `nginx`(백그라운드 방식) 으로 시작하고, 마지막에 `tail -f /etc/hosts` 로 프로세스를 블록하여 컨테이너를 계속 실행 상태로 둡니다. 이는 이전의 `nginx -g 'daemon off;'`(포어그라운드 방식) 과 다릅니다.

---

## 5. 이미지 빌드

```bash
root@docker01:/dawn/dockerfile/alpine/chengbao-USER# docker image build -t dawn-games:v2.18 .
...
Step 11/15 : RUN adduser -u 2025 dawn -D &&     install -d /var/lib/nginx/tmp/client_body -o dawn -g dawn &&     touch /var/lib/nginx/logs/error.log  /var/log/nginx/access.log &&     chown dawn:dawn -R  /run/nginx/  /var/lib/nginx/logs/error.log /var/log/nginx/access.log  /var/lib/nginx/
 ---> 580f08d6f0ff
Step 12/15 : USER dawn
 ---> 3215dcbeab8e
Step 13/15 : COPY scripts/start.sh /
 ---> 7dbdc04ac019
Step 14/15 : HEALTHCHECK --interval=1s --timeout=1s --start-period=10s --retries=5 CMD curl -H "host: game01.dawn.com" 127.0.0.1
 ---> 1c23e6980ce3
Step 15/15 : ENTRYPOINT ["/bin/sh","-x","/start.sh"]
 ---> 340aa3294c93
Successfully built 340aa3294c93
Successfully tagged dawn-games:v2.18
```

---

## 6. 테스트 및 검증

### 6.1 컨테이너 시작

```bash
root@docker01:/dawn/dockerfile/alpine/chengbao-USER# docker run -d --name c1 dawn-games:v2.18
4df2f7e32b40c935fdb5e9c41178f9e9ff29deec331fac51df342c155e46d005
```

### 6.2 프로세스 사용자 검증

```bash
root@docker01:/dawn/dockerfile/alpine/chengbao-USER# docker exec -it c1 sh
/usr/share/nginx/html $ whoami
dawn
/usr/share/nginx/html $ ps -ef
PID   USER     TIME  COMMAND
    1 dawn      0:00 /bin/sh -x /start.sh
   11 dawn      0:00 nginx: master process nginx
   12 dawn      0:00 tail -f /etc/hosts
   13 dawn      0:00 nginx: worker process
   14 dawn      0:00 nginx: worker process
   52 dawn      0:00 ps -ef
```

### 6.3 컨테이너 실행 사용자 설정 검증

```bash
root@docker01:/dawn/dockerfile/alpine/chengbao-USER# docker inspect -f '{{.Config.User}}' c1
dawn
```

### 6.4 nginx 정상 접속 검증

```bash
root@docker01:/dawn/dockerfile/alpine/chengbao-USER# docker exec c1 wget -q -O - --header 'Host: game01.dawn.com' http://127.0.0.1/ | grep -o '<title>[^<]*</title>'
<title>Space Huggers</title>
```

### 6.5 건강 상태 검증

```bash
root@docker01:/dawn/dockerfile/alpine/chengbao-USER# docker ps --filter name=c1
CONTAINER ID   IMAGE                COMMAND                  CREATED          STATUS                    PORTS          NAMES
4df2f7e32b40   dawn-games:v2.18   "/bin/sh -x /start.…"   28 seconds ago   Up 28 seconds (healthy)   22/tcp, 80/tcp   c1
```

---

## 7. 일반 사용자로 서비스 실행의 경계

| 서비스    | 일반 사용자 시작 가능 |                             이유                             |
| :-------: | :--------------: | :----------------------------------------------------------: |
| **nginx** |       가능       | Dockerfile 가 이미 `/run/nginx/`、와 로그 디렉터리 등을 dawn 에게 chown 했고, 80 포트 매핑은 호스트가 처리 |
| **sshd**  |      불가      |            sshd 는 root 권한이 필요하며 일반 사용자는 시작할 수 없음             |
