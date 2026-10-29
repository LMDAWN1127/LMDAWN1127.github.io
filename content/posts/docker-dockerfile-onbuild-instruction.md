---
title: "Dockerfile 之 ONBUILD 指令实战"
date: 2026-10-29T11:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "通过跳一跳（You_Jump_I_Jump）游戏镜像演示 Dockerfile 的 ONBUILD 指令：理解其延迟触发机制（定义的指令在当前镜像构建时不执行，仅当其它镜像以本镜像为基础镜像时才自动触发），编写含 2 个 ONBUILD 指令（RUN 建目录/日志、LABEL 加博客地址）的基础镜像与子镜像 Dockerfile，构建 v2.19/v2.20 后用 docker inspect 对比 OnBuild 与 Labels、用容器对比文件系统差异，最后说明如何用 -f 指定多个 Dockerfile 构建不同镜像。"
---

# Dockerfile 之 ONBUILD 指令实战

**实验目的**

理解 `ONBUILD` 指令的延迟触发机制：它定义的指令在当前镜像构建时不会执行，只有当其他镜像以当前镜像为基础镜像（`FROM`）构建时才会被自动触发。常用于构建「基础镜像 + 应用镜像」的分层架构。

---

## 一、编写 Dockerfile

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

# 定义Dockerfile指令，在当前的镜像中并不使用，其他镜像引用当前镜像时会触发相应的Dockerfile指令
ONBUILD RUN mkdir /dawn-tiaoyitiao && \
        touch /dawn-tiaoyitiao/xixi.log && \
        touch /dawn-tiaoyitiao/haha.log

ONBUILD LABEL blog=https://lmdawn1127.github.io

ENTRYPOINT ["/bin/sh","-x","/start.sh"]
```

### 子镜像 Dockerfile

```bash
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# cat haha.dockerfile
FROM dawn-games:v2.19

RUN mkdir /dawn-dawn
```

---

## 二、准备 nginx 配置文件

### 2.1 虚拟主机配置 games.conf

```bash
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# cat config/games.conf
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/tiaoyitiao;
    server_name   game01.dawn.com;
}
```

### 2.2 主配置 nginx.conf

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

## 三、准备脚本

**启动脚本 start.sh**

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

## 四、编译镜像

### 4.1 构建基础镜像 v2.19

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

此时 `ONBUILD RUN mkdir ...` 和 `ONBUILD LABEL ...` 只是被记录，并没有真正执行。

### 4.2 构建子镜像 v2.20（触发 ONBUILD）

```bash
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# docker image build -t dawn-games:v2.20 -f haha.dockerfile .
Sending build context to Docker daemon  4.034MB
Step 1/2 : FROM dawn-games:v2.19
# Executing 2 build triggers          ← 自动触发 2 个 ONBUILD 指令
 ---> a4206d87efe7
Step 2/2 : RUN mkdir /dawn-dawn
 ---> 4be63f5e0568
Successfully built 4be63f5e0568
Successfully tagged dawn-games:v2.20
```

---

## 五、查看镜像信息（对比 ONBUILD 触发前后）

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

## 六、查看容器信息（对比文件系统差异）

```bash
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# docker run -d --name tiao19 dawn-games:v2.19
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# docker run -d --name tiao20 dawn-games:v2.20
```

### 6.1 v2.19 容器（无 ONBUILD 触发，无 dawn-tiaoyitiao 目录）

```bash
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# docker exec tiao19 ls -d /dawn-tiaoyitiao
ls: /dawn-tiaoyitiao: No such file or directory
```

### 6.2 v2.20 容器（ONBUILD 已触发，多了两个目录）

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

**附：docker 编译时指定多个 Dockerfile 文件**

```bash
# -f 指定不同的 Dockerfile 文件名，构建出不同的镜像
docker image build -t dawn-games:v2.20 -f ../haha.dockerfile ..
docker image build -t dawn-games:v2.21 -f ../xixi.dockerfile ..
```

