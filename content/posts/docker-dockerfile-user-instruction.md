---
title: "Dockerfile 基于普通用户运行容器（USER 指令）实战"
date: 2026-10-29T10:47:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "通过 Space Huggers 游戏演示如何用 Dockerfile 的 USER 指令让容器以普通用户 dawn（uid 2025）运行：先理解普通用户跑 nginx 需要的目录/文件属主调整，再编写 Dockerfile（chown 系统目录后切 USER dawn）、nginx 配置（user dawn）、启动脚本（nginx 后台 + tail 阻塞），构建镜像并验证进程用户、容器配置、访问与健康状态，最后对比普通用户能启动 nginx 但无法启动 sshd 的权限边界。"
---

# Dockerfile 基于普通用户运行容器（USER 指令）实战

**实验目的**

Docker 容器默认以 root 用户运行服务，这在生产环境存在安全隐患。本实验演示如何通过 `USER` 指令让容器以普通用户 dawn（uid 2025） 运行，并解决普通用户运行 nginx 时的权限问题。

---

## 一、手动测试命令

在编写 Dockerfile 之前，先理解普通用户运行 nginx 需要做的几件事：

```bash
# 1. 创建普通用户 dawn，指定 uid 为 2025，-D 表示不创建密码/家目录
adduser -u 2025 dawn -D

# 2. 修改 nginx 主配置里的运行用户：从 nginx 改为 dawn
sed -i '/^user/s#nginx#dawn#' /etc/nginx/nginx.conf

# 3. 普通用户运行 nginx 时，需要有权写这些目录（否则 nginx 启动报权限错误）
/var/lib/nginx/tmp/client_body   # 临时文件目录
/var/lib/nginx/logs/error.log    # 错误日志
```

nginx 主进程默认以 root 启动后会把 worker 降权到 `user` 指令指定的用户；但如果连主进程都要用普通用户跑，就必须先把运行所需的目录/文件属主改成该用户。

---

## 二、编写 Dockerfile

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

# 指定服务的用户，默认是root用户，若指定了普通用户，请确保该用户在容器中是存在的
USER dawn

COPY scripts/start.sh /

HEALTHCHECK --interval=1s \
            --timeout=1s \
            --start-period=10s \
            --retries=5 \
            CMD curl -H "host: game01.dawn.com" 127.0.0.1

ENTRYPOINT ["/bin/sh","-x","/start.sh"]
```

 `USER` 指令只影响它之后的指令。所以必须先在上面的 `RUN` 里把目录属主改好，再切到 `USER dawn`，否则普通用户没有权限改 `/var/lib/nginx` 这些系统目录。

---

## 三、nginx 配置

### 3.1 虚拟主机配置 games.conf

```bash
root@docker01:/dawn/dockerfile/alpine/chengbao-USER# cat config/games.conf
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/chengbao;
    server_name   game01.dawn.com;
}
```

### 3.2 主配置 nginx.conf（user dawn）

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

## 四、启动脚本

### 4.2 启动脚本 start.sh

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

这里启动 nginx 用的是 `nginx`（后台方式），最后用 `tail -f /etc/hosts` 阻塞进程，让容器保持运行。这与之前的 `nginx -g 'daemon off;'`（前台方式）不同

---

## 五、构建镜像

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

## 六、测试验证

### 6.1 启动容器

```bash
root@docker01:/dawn/dockerfile/alpine/chengbao-USER# docker run -d --name c1 dawn-games:v2.18
4df2f7e32b40c935fdb5e9c41178f9e9ff29deec331fac51df342c155e46d005
```

### 6.2 验证进程用户

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

### 6.3 验证容器运行用户配置

```bash
root@docker01:/dawn/dockerfile/alpine/chengbao-USER# docker inspect -f '{{.Config.User}}' c1
dawn
```

### 6.4 验证 nginx 服务正常访问

```bash
root@docker01:/dawn/dockerfile/alpine/chengbao-USER# docker exec c1 wget -q -O - --header 'Host: game01.dawn.com' http://127.0.0.1/ | grep -o '<title>[^<]*</title>'
<title>Space Huggers</title>
```

### 6.5 验证健康状态

```bash
root@docker01:/dawn/dockerfile/alpine/chengbao-USER# docker ps --filter name=c1
CONTAINER ID   IMAGE                COMMAND                  CREATED          STATUS                    PORTS          NAMES
4df2f7e32b40   dawn-games:v2.18   "/bin/sh -x /start.…"   28 seconds ago   Up 28 seconds (healthy)   22/tcp, 80/tcp   c1
```

---

## 七、普通用户运行服务的边界

|   服务    | 普通用户能否启动 |                             原因                             |
| :-------: | :--------------: | :----------------------------------------------------------: |
| **nginx** |       可以       | Dockerfile 已把 `/run/nginx/`、日志目录等 `chown` 给 dawn，且 80 端口映射由宿主机处理 |
| **sshd**  |      不可以      |            sshd 需要 root 权限，普通用户无法启动             |
