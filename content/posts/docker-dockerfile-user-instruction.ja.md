---
title: "Dockerfile 一般ユーザーでのコンテナ実行（USER 命令）実戦"
date: 2026-10-29T10:47:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Space Huggers ゲームを使って、Dockerfile の USER 命令でコンテナを一般ユーザー dawn (uid 2025) として実行する方法を実演します。一般ユーザーで nginx を実行するために必要なディレクトリ/ファイルの所有権調整をまず理解し、次に Dockerfile (USER dawn に切り替える前にシステムディレクトリを chown)、nginx 設定 (user dawn)、起動スクリプト (nginx バックグラウンド + tail でブロック) を作成し、イメージをビルドしてプロセスユーザー、コンテナ設定、アクセス、健康状態を検証し、最後に一般ユーザーは nginx を起動できるが sshd は起動できないという権限の境界を比較します。"
---

# Dockerfile 一般ユーザーでのコンテナ実行（USER 命令）実戦

**実験目的**

Docker コンテナはデフォルトで root ユーザーとしてサービスを実行し、本番環境ではセキュリティリスクとなります。この実験では `USER` 命令を使ってコンテナを一般ユーザー dawn (uid 2025) として実行する方法と、一般ユーザーで nginx を実行する際の権限問題の解決方法を示します。

---

## 1. 手動テストコマンド

Dockerfile を書く前に、nginx を一般ユーザーで実行するために必要なことをいくつか理解しておく：

```bash
# 1. 一般ユーザー dawn を作成し uid を 2025 に指定。-D はパスワード/ホームディレクトリを作成しないことを意味する
adduser -u 2025 dawn -D

# 2. nginx メイン設定の実行ユーザーを変更：nginx から dawn へ
sed -i '/^user/s#nginx#dawn#' /etc/nginx/nginx.conf

# 3. nginx を一般ユーザーで実行するには、これらのディレクトリへの書き込み権限が必要（ないと nginx 起動時に権限エラー）
/var/lib/nginx/tmp/client_body   # 一時ファイルディレクトリ
/var/lib/nginx/logs/error.log    # エラーログ
```

nginx マスタープロセスはデフォルトで root で起動し、その後ワーカーを `user` ディレクティブで指定したユーザーに権限降下させます。しかしマスタープロセス自体を一般ユーザーで動かしたい場合は、実行に必要なディレクトリ/ファイルの所有権を先にそのユーザーに変更する必要があります。

---

## 2. Dockerfile の作成

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

# サービスのユーザーを指定。デフォルトは root。一般ユーザーを指定する場合は、そのユーザーがコンテナ内に存在することを確認
USER dawn

COPY scripts/start.sh /

HEALTHCHECK --interval=1s \
            --timeout=1s \
            --start-period=10s \
            --retries=5 \
            CMD curl -H "host: game01.dawn.com" 127.0.0.1

ENTRYPOINT ["/bin/sh","-x","/start.sh"]
```

 `USER` 命令はそれ以降の命令にのみ影響します。そのため、まず上の `RUN` でディレクトリの所有権を変更してから `USER dawn` に切り替える必要があります。そうしないと一般ユーザーは `/var/lib/nginx` などのシステムディレクトリを変更する権限がありません。

---

## 3. nginx 設定

### 3.1 バーチャルホスト設定 games.conf

```bash
root@docker01:/dawn/dockerfile/alpine/chengbao-USER# cat config/games.conf
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/chengbao;
    server_name   game01.dawn.com;
}
```

### 3.2 メイン設定 nginx.conf（user dawn）

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

## 4. 起動スクリプト

### 4.2 起動スクリプト start.sh

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

ここでは nginx を `nginx`（バックグラウンド方式）で起動し、最後に `tail -f /etc/hosts` でプロセスをブロックしてコンテナを実行状態に保ちます。これは以前の `nginx -g 'daemon off;'`（フォアグラウンド方式）とは異なります。

---

## 5. イメージのビルド

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

## 6. テストと検証

### 6.1 コンテナの起動

```bash
root@docker01:/dawn/dockerfile/alpine/chengbao-USER# docker run -d --name c1 dawn-games:v2.18
4df2f7e32b40c935fdb5e9c41178f9e9ff29deec331fac51df342c155e46d005
```

### 6.2 プロセスユーザーの検証

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

### 6.3 コンテナの実行ユーザー設定の検証

```bash
root@docker01:/dawn/dockerfile/alpine/chengbao-USER# docker inspect -f '{{.Config.User}}' c1
dawn
```

### 6.4 nginx が正常にアクセスできることの検証

```bash
root@docker01:/dawn/dockerfile/alpine/chengbao-USER# docker exec c1 wget -q -O - --header 'Host: game01.dawn.com' http://127.0.0.1/ | grep -o '<title>[^<]*</title>'
<title>Space Huggers</title>
```

### 6.5 健康状態の検証

```bash
root@docker01:/dawn/dockerfile/alpine/chengbao-USER# docker ps --filter name=c1
CONTAINER ID   IMAGE                COMMAND                  CREATED          STATUS                    PORTS          NAMES
4df2f7e32b40   dawn-games:v2.18   "/bin/sh -x /start.…"   28 seconds ago   Up 28 seconds (healthy)   22/tcp, 80/tcp   c1
```

---

## 7. 一般ユーザーでサービスを実行する境界

| サービス    | 一般ユーザーで起動可能か |                             理由                             |
| :-------: | :--------------: | :----------------------------------------------------------: |
| **nginx** |       可       | Dockerfile ですでに `/run/nginx/`、やログディレクトリなどを dawn に chown しており、80 ポートのマッピングはホストが処理 |
| **sshd**  |      不可      |            sshd は root 権限を必要とし、一般ユーザーでは起動できない             |
