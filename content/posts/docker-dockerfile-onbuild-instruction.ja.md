---
title: "Dockerfile の ONBUILD 命令実戦"
date: 2026-10-29T11:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "You_Jump_I_Jump ゲームイメージを使って Dockerfile の ONBUILD 命令を実演します。遅延トリガー機構（定義された命令は現在のイメージ構築時には実行されず、他のイメージがこのイメージをベースとして使う場合にのみ自動トリガーされる）を理解し、2 つの ONBUILD 命令（RUN でディレクトリ/ログ作成、LABEL でブログ URL 追加）を含むベースイメージと子イメージの Dockerfile を作成し、v2.19/v2.20 構築後に docker inspect で OnBuild と Labels を比較、コンテナでファイルシステムの差を比較し、最後に -f で複数の Dockerfile を指定して異なるイメージをビルドする方法を説明します。"
---

# Dockerfile の ONBUILD 命令実戦

**実験目的**

ONBUILD 命令の遅延トリガー機構を理解する：定義された命令は現在のイメージ構築時には実行されず、他のイメージが現在のイメージをベースイメージ（`FROM`）として構築する場合にのみ自動的にトリガーされる。これは「ベースイメージ + アプリケーションイメージ」という階層アーキテクチャを構築する際によく使われる。

---

## 1. Dockerfile の作成

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

# 現在のイメージでは使用しない Dockerfile 命令を定義する。他のイメージがこのイメージを参照したときに対応する Dockerfile 命令がトリガーされる
ONBUILD RUN mkdir /dawn-tiaoyitiao && \
        touch /dawn-tiaoyitiao/xixi.log && \
        touch /dawn-tiaoyitiao/haha.log

ONBUILD LABEL blog=https://lmdawn1127.github.io

ENTRYPOINT ["/bin/sh","-x","/start.sh"]
```

### 子イメージ Dockerfile

```bash
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# cat haha.dockerfile
FROM dawn-games:v2.19

RUN mkdir /dawn-dawn
```

---

## 2. nginx 設定ファイルの準備

### 2.1 バーチャルホスト設定 games.conf

```bash
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# cat config/games.conf
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/tiaoyitiao;
    server_name   game01.dawn.com;
}
```

### 2.2 メイン設定 nginx.conf

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

## 3. スクリプトの準備

**起動スクリプト start.sh**

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

## 4. イメージのビルド

### 4.1 ベースイメージ v2.19 のビルド

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

この時点では ONBUILD RUN mkdir ... と ONBUILD LABEL ... は記録されるだけで、実際には実行されない。

### 4.2 子イメージ v2.20 のビルド（ONBUILD トリガー）

```bash
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# docker image build -t dawn-games:v2.20 -f haha.dockerfile .
Sending build context to Docker daemon  4.034MB
Step 1/2 : FROM dawn-games:v2.19
# Executing 2 build triggers          ← 自動トリガーされる 2 つの ONBUILD 命令
 ---> a4206d87efe7
Step 2/2 : RUN mkdir /dawn-dawn
 ---> 4be63f5e0568
Successfully built 4be63f5e0568
Successfully tagged dawn-games:v2.20
```

---

## 5. イメージ情報の確認（ONBUILD トリガー前後）

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

## 6. コンテナ情報の確認（ファイルシステムの差）

```bash
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# docker run -d --name tiao19 dawn-games:v2.19
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# docker run -d --name tiao20 dawn-games:v2.20
```

### 6.1 v2.19 コンテナ（ONBUILD 未トリガー、dawn-tiaoyitiao ディレクトリなし）

```bash
root@docker01:/dawn/dockerfile/alpine/tiaoyitiao-ONBUILD# docker exec tiao19 ls -d /dawn-tiaoyitiao
ls: /dawn-tiaoyitiao: No such file or directory
```

### 6.2 v2.20 コンテナ（ONBUILD トリガー済み、2 ディレクトリ増加）

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

**付録：ビルド時に複数の Dockerfile を指定する**

```bash
# -f で異なる Dockerfile ファイル名を指定し、異なるイメージをビルド
docker image build -t dawn-games:v2.20 -f ../haha.dockerfile ..
docker image build -t dawn-games:v2.21 -f ../xixi.dockerfile ..
```

