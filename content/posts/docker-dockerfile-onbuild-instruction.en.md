---
title: "Hands-on with the Dockerfile ONBUILD Instruction"
date: 2026-10-29T11:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Use the You_Jump_I_Jump game image to demonstrate the Dockerfile ONBUILD instruction: understand its delayed-trigger mechanism (the defined instructions are not executed when the current image is built; they are only triggered automatically when another image uses this image as its base), write a base image Dockerfile containing two ONBUILD instructions (RUN to create directories/logs, LABEL to add the blog URL) and a child image Dockerfile, then after building v2.19/v2.20 compare OnBuild and Labels with docker inspect and compare the filesystem differences with containers, and finally explain how to use -f to specify multiple Dockerfiles to build different images."
---

# Hands-on with the Dockerfile ONBUILD Instruction

**Objective**

Understand the delayed-trigger mechanism of the ONBUILD instruction: the instructions it defines are not executed when the current image is built; they are only triggered automatically when another image uses the current image as its base image (FROM). It is commonly used to build a layered "base image + application image" architecture.

---

## 1. Writing the Dockerfile

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

# Define Dockerfile instructions that are not used in the current image; when other images reference this image, the corresponding Dockerfile instructions are triggered
ONBUILD RUN mkdir /dawn-tiaoyitiao && \
        touch /dawn-tiaoyitiao/xixi.log && \
        touch /dawn-tiaoyitiao/haha.log

ONBUILD LABEL blog=https://lmdawn1127.github.io

ENTRYPOINT ["/bin/sh","-x","/start.sh"]
```

### Child image Dockerfile

```bash
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# cat haha.dockerfile
FROM dawn-games:v2.19

RUN mkdir /dawn-dawn
```

---

## 2. Preparing the nginx config files

### 2.1 Virtual host configuration games.conf

```bash
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# cat config/games.conf
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/tiaoyitiao;
    server_name   game01.dawn.com;
}
```

### 2.2 Main configuration nginx.conf

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

## 3. Preparing the scripts

**Startup script start.sh**

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

## 4. Building the images

### 4.1 Building the base image v2.19

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

At this point the ONBUILD RUN mkdir ... and ONBUILD LABEL ... are only recorded, not actually executed.

### 4.2 Building the child image v2.20 (triggers ONBUILD)

```bash
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# docker image build -t dawn-games:v2.20 -f haha.dockerfile .
Sending build context to Docker daemon  4.034MB
Step 1/2 : FROM dawn-games:v2.19
# Executing 2 build triggers          ← auto-triggers 2 ONBUILD instructions
 ---> a4206d87efe7
Step 2/2 : RUN mkdir /dawn-dawn
 ---> 4be63f5e0568
Successfully built 4be63f5e0568
Successfully tagged dawn-games:v2.20
```

---

## 5. Inspecting image info (before/after ONBUILD trigger)

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

## 6. Inspecting container info (filesystem differences)

```bash
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# docker run -d --name tiao19 dawn-games:v2.19
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# docker run -d --name tiao20 dawn-games:v2.20
```

### 6.1 v2.19 container (no ONBUILD trigger, no dawn-tiaoyitiao directory)

```bash
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# docker exec tiao19 ls -d /dawn-tiaoyitiao
ls: /dawn-tiaoyitiao: No such file or directory
```

### 6.2 v2.20 container (ONBUILD triggered, two extra directories)

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

**Appendix: Specifying multiple Dockerfiles for the build**

```bash
# -f specifies a different Dockerfile filename to build a different image
docker image build -t dawn-games:v2.20 -f ../haha.dockerfile ..
docker image build -t dawn-games:v2.21 -f ../xixi.dockerfile ..
```

