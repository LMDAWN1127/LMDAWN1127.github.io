---
title: "Dockerfile: Running Containers as a Non-Root User (USER Instruction)"
date: 2026-10-29T10:47:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Use the Space Huggers game to demonstrate how to run a container as the non-root user dawn (uid 2025) with the Dockerfile USER instruction: first understand the directory/file ownership adjustments needed for nginx to run as a non-root user, then write the Dockerfile (chown system directories before switching to USER dawn), the nginx config (user dawn), and the startup script (nginx in background + tail to block), build the image and verify the process user, container configuration, access and health status, and finally compare the permission boundary where a non-root user can start nginx but cannot start sshd."
---

# Dockerfile: Running Containers as a Non-Root User (USER Instruction)

**Objective**

By default a Docker container runs services as the root user, which is a security risk in production. This lab shows how to use the `USER` instruction to run the container as the non-root user dawn (uid 2025), and how to solve the permission issues when running nginx as a non-root user.

---

## 1. Manual test commands

Before writing the Dockerfile, first understand a few things needed for nginx to run as a non-root user:

```bash
# 1. Create the non-root user dawn with uid 2025; -D means no password/home directory is created
adduser -u 2025 dawn -D

# 2. Change the running user in the nginx main config: from nginx to dawn
sed -i '/^user/s#nginx#dawn#' /etc/nginx/nginx.conf

# 3. When nginx runs as a non-root user, it must have write access to these directories (otherwise nginx fails to start with a permission error)
/var/lib/nginx/tmp/client_body   # temp file directory
/var/lib/nginx/logs/error.log    # error log
```

The nginx master process starts as root by default and then drops privileges to the user specified by the `user` directive for its workers; but if you want even the master process to run as a non-root user, you must first change the ownership of the required runtime directories/files to that user.

---

## 2. Writing the Dockerfile

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

# Specify the service user; the default is root. If a non-root user is specified, make sure that user exists in the container
USER dawn

COPY scripts/start.sh /

HEALTHCHECK --interval=1s \
            --timeout=1s \
            --start-period=10s \
            --retries=5 \
            CMD curl -H "host: game01.dawn.com" 127.0.0.1

ENTRYPOINT ["/bin/sh","-x","/start.sh"]
```

 The `USER` instruction only affects the instructions after it. So you must change the directory ownership in the `RUN` above first, then switch to `USER dawn`; otherwise the non-root user has no permission to modify system directories like `/var/lib/nginx`.

---

## 3. nginx configuration

### 3.1 Virtual host configuration games.conf

```bash
root@docker01:/dawn/dockerfile/alpine/chengbao-USER# cat config/games.conf
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/chengbao;
    server_name   game01.dawn.com;
}
```

### 3.2 Main configuration nginx.conf (user dawn)

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

## 4. Startup script

### 4.2 Startup script start.sh

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

Here nginx is started in the background with `nginx`, and `tail -f /etc/hosts` is used at the end to block the process and keep the container running. This differs from the previous `nginx -g 'daemon off;'` (foreground) approach.

---

## 5. Building the image

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

## 6. Testing and verification

### 6.1 Starting the container

```bash
root@docker01:/dawn/dockerfile/alpine/chengbao-USER# docker run -d --name c1 dawn-games:v2.18
4df2f7e32b40c935fdb5e9c41178f9e9ff29deec331fac51df342c155e46d005
```

### 6.2 Verifying the process user

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

### 6.3 Verifying the container's running-user configuration

```bash
root@docker01:/dawn/dockerfile/alpine/chengbao-USER# docker inspect -f '{{.Config.User}}' c1
dawn
```

### 6.4 Verifying nginx is accessible

```bash
root@docker01:/dawn/dockerfile/alpine/chengbao-USER# docker exec c1 wget -q -O - --header 'Host: game01.dawn.com' http://127.0.0.1/ | grep -o '<title>[^<]*</title>'
<title>Space Huggers</title>
```

### 6.5 Verifying the health status

```bash
root@docker01:/dawn/dockerfile/alpine/chengbao-USER# docker ps --filter name=c1
CONTAINER ID   IMAGE                COMMAND                  CREATED          STATUS                    PORTS          NAMES
4df2f7e32b40   dawn-games:v2.18   "/bin/sh -x /start.…"   28 seconds ago   Up 28 seconds (healthy)   22/tcp, 80/tcp   c1
```

---

## 7. The boundary of running services as a non-root user

| Service    | Can a non-root user start it |                             Reason                             |
| :-------: | :--------------: | :----------------------------------------------------------: |
| **nginx** |       Yes       | The Dockerfile already chowns `/run/nginx/`、and the log directories etc. are chowned to dawn, and the port 80 mapping is handled by the host |
| **sshd**  |      No      |            sshd requires root privileges and cannot be started by a non-root user             |
