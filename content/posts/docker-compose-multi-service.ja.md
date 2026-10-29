---
title: "docker-compose でマルチサービスイメージをビルドしコンテナを起動する事例"
date: 2026-10-29T13:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "docker-compose の事例を通して、1 つの YAML ファイルで 2 つの HTML5 ゲームサービス（doudizhu と motuo）のイメージビルドとコンテナ管理を統合的にオーケストレーションする方法を示す。compose ファイル（ビルドコンテキスト + 各サービスの Dockerfile）と nginx バーチャルホスト、起動スクリプトを作成し、docker-compose build で 2 つのイメージを一度にコンパイル、up -d でバックグラウンド起動、ps/stop/start/restart/down でライフサイクルを管理し、その後固定ポート + restart: always とランダムポートを設定してアクセスと再起動ポリシーを検証し、最後によく使うコマンドの対照表を提示する。"
---

# docker-compose でマルチサービスイメージをビルドしコンテナを起動する事例

## 1. docker-compose 概要

docker-compose は一組のコンテナを管理するためのツールである。1 つの YAML ファイル（docker-compose.yaml）を通じて、複数のサービス（service）のイメージビルド、ポートマッピング、ネットワーク、再起動ポリシー、依存関係などを一度に宣言し、その後 1 つのコマンドでビルドと起動を統合的にオーケストレーションし、手作業の個別 docker build / docker run を置き換える。

この事例では 2 つの HTML5 ゲーム（doudizhu と motuo）を 2 つのサービスとして、docker-compose の完全な使い方を示す。

---

## 2. 実験ディレクトリ構造

```
/dawn/docker-compose/motuo-doudizhu/
├── docker-compose.yaml                 # compose オーケストレーションファイル
└── dockerfile/                         # ビルドコンテキスト (context)
    ├── doudizhu.dockerfile             # doudizhu サービスイメージ
    ├── motuo.dockerfile                # motuo サービスイメージ
    ├── config/
    │   ├── doudizhu.conf               # doudizhu nginx バーチャルホスト
    │   └── motuo.conf                  # motuo nginx バーチャルホスト
    ├── code/
    │   ├── dawn-doudizhu.tar.gz        # doudizhu ゲームコード
    │   └── dawn-motuo.tar.gz           # motuo ゲームコード
    └── scripts/
        └── start.sh                    # マルチサービス起動スクリプト (sshd + nginx + ブロック)
```

---

## 3. docker-compose オーケストレーションファイルの作成

### 3.1 docker-compose.yaml

```yaml
root@docker01:/dawn/docker-compose/motuo-doudizhu# cat docker-compose.yaml
# docker compose のバージョン番号を宣言
version: '3.8'

# よく使うサービスを定義
services:
   # doudizhu サービス
   doudizhu:
     # イメージ名を指定
     image: dawn-games:doudizhu-v0.1
     # ビルド情報を指定
     build:
      # コンテキストを宣言。"docker image build -t <>:<> -f Dockerfile PATH" と同等、ここでは PATH に相当
      context: ./dockerfile
      #context: .
      # Dockerfile 名を宣言 ("-f" オプションと同等)
      dockerfile: doudizhu.dockerfile

   # motuo サービス
   motuo:
     image: dawn-games:motuo-v0.1
     build:
       context: ./dockerfile
       # context: .
       dockerfile: motuo.dockerfile
```

### 3.2 nginx バーチャルホスト設定

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# cat dockerfile/config/doudizhu.conf
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/doudizhu;
    server_name   game01.dawn.com;
}

root@docker01:/dawn/docker-compose/motuo-doudizhu# cat dockerfile/config/motuo.conf
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/motuo;
    server_name   game01.dawn.com;
}
```

### 3.3 motuo サービス Dockerfile

```dockerfile
root@docker01:/dawn/docker-compose/motuo-doudizhu# cat dockerfile/motuo.dockerfile
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
     rm -rf /var/cache/ /usr/share/nginx/html/* && \
     ln -svf /dev/stderr  /var/log/nginx/error.log && \
     ln -svf /dev/stdout  /var/log/nginx/access.log

EXPOSE 80 22

ADD code/dawn-motuo.tar.gz /usr/share/nginx/html/motuo

COPY config/motuo.conf /etc/nginx/http.d/default.conf

COPY scripts/start.sh /

ENTRYPOINT ["/bin/sh","-x","/start.sh"]
```

### 3.4 doudizhu サービス Dockerfile

```dockerfile
root@docker01:/dawn/docker-compose/motuo-doudizhu# cat dockerfile/doudizhu.dockerfile
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
     rm -rf /var/cache/ /usr/share/nginx/html/* && \
     ln -svf /dev/stderr  /var/log/nginx/error.log && \
     ln -svf /dev/stdout  /var/log/nginx/access.log

EXPOSE 80 22

ADD code/dawn-doudizhu.tar.gz /usr/share/nginx/html/doudizhu

COPY config/doudizhu.conf /etc/nginx/http.d/default.conf

COPY scripts/start.sh /

ENTRYPOINT ["/bin/sh","-x","/start.sh"]
```

### 3.5 マルチサービス起動スクリプト

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# cat dockerfile/scripts/start.sh
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

start.sh のロジック：root パスワードを初期化 → sshd を起動 → nginx を起動 → tail -f /etc/hosts でプロセスをブロックし、コンテナ起動後にメインプロセスが終了するのを防ぐ。

---

## 4. docker-compose の基本操作

### 4.1 イメージのビルド

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose build
[+] Building 0.3s (17/17) FINISHED                                                                                      docker:default
 => [doudizhu internal] load build definition from doudizhu.dockerfile                                                            0.0s
 => => transferring dockerfile: 982B                                                                                              0.0s
 => [motuo internal] load build definition from motuo.dockerfile                                                                  0.0s
 => => transferring dockerfile: 970B                                                                                              0.0s
 => [doudizhu internal] load .dockerignore                                                                                        0.0s
 => => transferring context: 2B                                                                                                   0.0s
 => [motuo internal] load .dockerignore                                                                                           0.0s
 => => transferring context: 2B                                                                                                   0.0s
 => [motuo internal] load metadata for docker.io/library/alpine:3.20.2                                                            0.0s
 => [motuo 1/6] FROM docker.io/library/alpine:3.20.2                                                                              0.0s
 => [doudizhu internal] load build context                                                                                        0.1s
 => => transferring context: 2.78MB                                                                                               0.1s
 => [motuo internal] load build context                                                                                           0.0s
 => => transferring context: 30.69kB                                                                                              0.0s
 => CACHED [doudizhu 2/6] WORKDIR /usr/share/nginx/html                                                                           0.0s
 => CACHED [doudizhu 3/6] RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories &&      apk  0.0s
 => CACHED [motuo 4/6] ADD code/dawn-motuo.tar.gz /usr/share/nginx/html/motuo                                                0.0s
 => CACHED [motuo 5/6] COPY config/motuo.conf /etc/nginx/http.d/default.conf                                                      0.0s
 => CACHED [motuo 6/6] COPY scripts/start.sh /                                                                                    0.0s
 => [doudizhu] exporting to image                                                                                                 0.0s
 => => exporting layers                                                                                                           0.0s
 => => writing image sha256:b703be2d566230da9a12bd84189822af07167d1b14371b0f2c3ccd60375e7edc                                      0.0s
 => => writing image sha256:fdffcfbc066ae122bd0f86fb8cc0cba608919f805fadfce48cee19a7cc0a623e                                      0.0s
 => => naming to docker.io/library/dawn-games:motuo-v0.1                                                                       0.0s
 => => naming to docker.io/library/dawn-games:doudizhu-v0.1                                                                    0.0s
 => CACHED [doudizhu 4/6] ADD code/dawn-doudizhu.tar.gz /usr/share/nginx/html/doudizhu                                       0.0s
 => CACHED [doudizhu 5/6] COPY config/doudizhu.conf /etc/nginx/http.d/default.conf                                                0.0s
 => CACHED [doudizhu 6/6] COPY scripts/start.sh /                                                                                 0.0s
```

ビルド結果：1 回の build で dawn-games:doudizhu-v0.1 と dawn-games:motuo-v0.1 の 2 つのイメージを同時に生成する。CACHED は繰り返しビルド時にビルドキャッシュがヒットしたことを意味し、非常に高速である。

### 4.2 バックグラウンドでのコンテナ作成と起動

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose up -d
[+] Building 0.0s (0/0)                                                                                                 docker:default
[+] Running 2/2
 ✔ Container motuo-doudizhu-doudizhu-1  Started                                                                                0.1s
 ✔ Container motuo-doudizhu-motuo-1     Started                                                                                0.1s
```

コンテナ命名規則：<プロジェクトディレクトリ名>-<サービス名>-<連番>、すなわち motuo-doudizhu-doudizhu-1 と motuo-doudizhu-motuo-1。

### 4.3 コンテナ状態の確認

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose ps
NAME                           IMAGE                         COMMAND                  SERVICE    CREATED              STATUS              PORTS
motuo-doudizhu-doudizhu-1   dawn-games:doudizhu-v0.1   "/bin/sh -x /start.sh"   doudizhu   About a minute ago   Up About a minute   22/tcp, 80/tcp
motuo-doudizhu-motuo-1      dawn-games:motuo-v0.1      "/bin/sh -x /start.sh"   motuo      About a minute ago   Up About a minute   22/tcp, 80/tcp
```

### 4.4 全サービスの停止

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose stop -t 0
[+] Stopping 2/2
 ✔ Container motuo-doudizhu-doudizhu-1  Stopped                                                                                0.3s
 ✔ Container motuo-doudizhu-motuo-1     Stopped                                                                                0.3s
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose ps
NAME      IMAGE     COMMAND   SERVICE   CREATED   STATUS    PORTS
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker ps -a
CONTAINER ID   IMAGE                         COMMAND                  CREATED          STATUS                        PORTS     NAMES
3ec683731d79   dawn-games:doudizhu-v0.1   "/bin/sh -x /start.sh"   38 seconds ago   Exited (137) 27 seconds ago             motuo-doudizhu-doudizhu-1
e55d8f324ef9   dawn-games:motuo-v0.1      "/bin/sh -x /start.sh"   38 seconds ago   Exited (137) 27 seconds ago             motuo-doudizhu-motuo-1
```

### 4.5 全サービスの起動

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose start
[+] Running 2/2
 ✔ Container motuo-doudizhu-motuo-1     Started                                                                                0.6s
 ✔ Container motuo-doudizhu-doudizhu-1  Started                                                                                0.6s
root@docker01:/dawn/docker-compose/motuo-doudizhu#
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker ps -a
CONTAINER ID   IMAGE                         COMMAND                  CREATED          STATUS        PORTS            NAMES
3ec683731d79   dawn-games:doudizhu-v0.1   "/bin/sh -x /start.sh"   48 seconds ago   Up 1 second   22/tcp, 80/tcp   motuo-doudizhu-doudizhu-1
e55d8f324ef9   dawn-games:motuo-v0.1      "/bin/sh -x /start.sh"   48 seconds ago   Up 1 second   22/tcp, 80/tcp   motuo-doudizhu-motuo-1
```

### 4.6 指定サービスの再起動

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker ps -a
CONTAINER ID   IMAGE                         COMMAND                  CREATED              STATUS          PORTS            NAMES
3ec683731d79   dawn-games:doudizhu-v0.1   "/bin/sh -x /start.sh"   About a minute ago   Up 35 seconds   22/tcp, 80/tcp   motuo-doudizhu-doudizhu-1
e55d8f324ef9   dawn-games:motuo-v0.1      "/bin/sh -x /start.sh"   About a minute ago   Up 35 seconds   22/tcp, 80/tcp   motuo-doudizhu-motuo-1
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose restart doudizhu
[+] Restarting 1/1
 ✔ Container motuo-doudizhu-doudizhu-1  Started                                                                               10.5s
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker ps -a
CONTAINER ID   IMAGE                         COMMAND                  CREATED              STATUS              PORTS            NAMES
3ec683731d79   dawn-games:doudizhu-v0.1   "/bin/sh -x /start.sh"   About a minute ago   Up 3 seconds        22/tcp, 80/tcp   motuo-doudizhu-doudizhu-1
e55d8f324ef9   dawn-games:motuo-v0.1      "/bin/sh -x /start.sh"   About a minute ago   Up About a minute   22/tcp, 80/tcp   motuo-doudizhu-motuo-1
```

指定したサービスとは docker-compose.yaml 設定ファイルで定義されたサービスであり、restart doudizhu は doudizhu サービスのみを再起動し、motuo には影響しない。

### 4.7 全コンテナの停止と削除

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker ps -a
CONTAINER ID   IMAGE                         COMMAND                  CREATED         STATUS              PORTS            NAMES
3ec683731d79   dawn-games:doudizhu-v0.1   "/bin/sh -x /start.sh"   3 minutes ago   Up About a minute   22/tcp, 80/tcp   motuo-doudizhu-doudizhu-1
e55d8f324ef9   dawn-games:motuo-v0.1      "/bin/sh -x /start.sh"   3 minutes ago   Up 2 minutes        22/tcp, 80/tcp   motuo-doudizhu-motuo-1
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose down -t 0
[+] Running 3/3
 ✔ Container motuo-doudizhu-motuo-1     Removed                                                                                0.2s
 ✔ Container motuo-doudizhu-doudizhu-1  Removed                                                                                0.3s
 ✔ Network motuo-doudizhu_default       Removed                                                                                0.1s
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker ps -a
CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES
```

down と stop の違い：down はコンテナを停止して削除し、同時に compose が自動作成したネットワーク（motuo-doudizhu_default）も削除する。

---

## 5. docker-compose によるポートマッピングと再起動ポリシー

docker-compose.yaml を編集し、doudizhu には固定ポート + restart: always を、motuo にはランダムポートを設定する：

```yaml
root@docker01:/dawn/docker-compose/motuo-doudizhu# cat docker-compose.yaml
# docker compose のバージョン番号を宣言
version: '3.8'

# よく使うサービスを定義
services:
   # doudizhu サービス
   doudizhu:
     # イメージ名を指定
     image: dawn-games:doudizhu-v0.1
     # ポートマッピングを設定
     ports:
       - 2481:80
       - 2422:22
     # 再起動ポリシーを設定
     restart: always
     # ビルド情報を指定
     build:
      # コンテキストを宣言。"docker image build -t <>:<> -f Dockerfile PATH" と同等、ここでは PATH に相当
      context: ./dockerfile
      #context: .
      # Dockerfile 名を宣言 ("-f" オプションと同等)
      dockerfile: doudizhu.dockerfile

   # motuo サービス
   motuo:
     image: dawn-games:motuo-v0.1
     # ホストのランダムポートをコンテナの指定ポートにマッピング
     ports:
       - :80
       - :22
     build:
       context: ./dockerfile
       # context: .
       dockerfile: motuo.dockerfile
```

再起動して検証：

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose up -d
[+] Running 2/2
 ✔ Container motuo-doudizhu-doudizhu-1  Started                                                                                0.1s
 ✔ Container motuo-doudizhu-motuo-1     Started                                                                                0.1s

root@docker01:/dawn/docker-compose/motuo-doudizhu# docker ps
CONTAINER ID   IMAGE                      COMMAND                  CREATED         STATUS         PORTS                                      NAMES
xxxxxxxxxxxx   dawn-games:doudizhu-v0.1   "/bin/sh -x /start.sh"   2 seconds ago   Up 2 seconds   0.0.0.0:2481->80/tcp, 0.0.0.0:2422->22/tcp   motuo-doudizhu-doudizhu-1
xxxxxxxxxxxx   dawn-games:motuo-v0.1      "/bin/sh -x /start.sh"   2 seconds ago   Up 2 seconds   0.0.0.0:32769->80/tcp, 0.0.0.0:32768->22/tcp  motuo-doudizhu-motuo-1
```

アクセス結果の検証：

```bash
# doudizhu: 固定ポート 2481, HTTP 200 を返す
root@docker01:/dawn/docker-compose/motuo-doudizhu# curl -s -o /dev/null -w "%{http_code}" http://11.0.1.121:2481/
200

# motuo: ランダムポート 32769, HTTP 200 を返す
root@docker01:/dawn/docker-compose/motuo-doudizhu# curl -s -o /dev/null -w "%{http_code}" http://11.0.1.121:32769/
200
```

再起動ポリシーの検証：

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' motuo-doudizhu-doudizhu-1
always
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' motuo-doudizhu-motuo-1
no
```

---

## 6. docker-compose の基本コマンド

| コマンド                                | 役割                                       |
| ----------------------------------- | ------------------------------------------ |
| `docker-compose build`              | yaml の build 設定に基づいてイメージをコンパイル          |
| `docker-compose up -d`              | バックグラウンドで全サービスを作成・起動（必要に応じて自動 build） |
| `docker-compose ps`                 | compose が管理するコンテナ状態を確認                |
| `docker-compose stop [-t 0]`        | サービスを停止（コンテナは保持）                       |
| `docker-compose start`              | 停止したサービスを起動                           |
| `docker-compose restart [サービス名]`   | 全サービスを再起動、または特定のサービスを指定               |
| `docker-compose down [-t 0]`        | コンテナとネットワークを停止・削除                       |
| `docker-compose logs [-f] [サービス名]` | サービスログを確認                               |
