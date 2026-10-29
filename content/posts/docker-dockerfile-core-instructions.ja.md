---
title: "Dockerfile コア命令実戦：WORKDIR/EXPOSE/VOLUME、ENV/ARG、HEALTHCHECK、ENTRYPOINT"
date: 2026-10-28T21:41:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "4 つのウェブゲームを使って 7 つのコア Dockerfile 命令を完全に実演します。WORKDIR/EXPOSE/VOLUME の作業ディレクトリ・ポート公開・永続化の効果、構築時と実行時で異なる ENV と ARG の違いと上書き方法、HEALTHCHECK の健康状態の遷移、そして ENTRYPOINT と CMD の上書き可否の違いと引数受け渡しの仕組み。"
---

# Dockerfile コア命令実戦：WORKDIR/EXPOSE/VOLUME、ENV/ARG、HEALTHCHECK、ENTRYPOINT

本実験では 4 つのウェブゲームを使って 4 組の Dockerfile 命令をそれぞれ実演します。

| 事例 | ゲーム                        | コア命令                        | イメージタグ                 |
| ---- | ----------------------------- | ------------------------------- | ---------------------------- |
| 1    | 星益小ゲームプラットフォーム（pingtai） | `WORKDIR` / `EXPOSE` / `VOLUME` | `dawn-games:v2.13`           |
| 2    | 植物vsゾンビ（zhiwu）          | `ENV` / `ARG` + マルチサービス起動 | `dawn-games:v2.14` / `v2.15` |
| 3    | 人生リスタートシミュレーター（liferestart） | `HEALTHCHECK`      | `dawn-games:v2.15`           |
| 4    | フルーツカット（qieshuiguo）  | `ENTRYPOINT`                    | `dawn-games:v2.16`           |

---

## 事例1：WORKDIR / EXPOSE / VOLUME

### 1. ゲームコードを用意する

イメージから「星益小ゲームプラットフォーム」のコードを抽出してパッケージ化します：

```bash
root@docker01:~# mkdir -p /dawn/dockerfile/alpine/pingtai-VOLUME-EXPOSE-WORKDIR/{code,config,scripts}

root@docker01:~# docker run --rm -v /dawn/dockerfile/alpine/pingtai-VOLUME-EXPOSE-WORKDIR/code:/out \
>   uhub.service.ucloud.cn/dawn/dawn-games-dawn:v0.6 \
>   sh -c 'cd /usr/local/nginx/html/pingtai && tar czf /out/dawn-pingtai.tar.gz .'

root@docker01:~# ls -lh /dawn/dockerfile/alpine/pingtai-VOLUME-EXPOSE-WORKDIR/code/
total 100M
-rw-r--r-- 1 root root 100M Oct 28 12:35 dawn-pingtai.tar.gz
```

### 2. Dockerfile を作成する

```bash
root@docker01:/dawn/dockerfile/alpine/pingtai-VOLUME-EXPOSE-WORKDIR# cat Dockerfile
FROM alpine:3.20.2

MAINTAINER dawn 123456@dawn.com www.dawn.com xixi haha

LABEL school=czu \
      class=computer01 \
      auther=dawn \
      email=123456@dawn.com \
      office=www.dawn.com

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && \
     apk update && \
     apk add nginx && \
     rm -rf /var/cache/ rm -f /usr/share/nginx/*

ADD code/dawn-pingtai.tar.gz /usr/share/nginx/html/pingtai

COPY config/games.conf /etc/nginx/http.d/default.conf

# 作業ディレクトリを指定。コンテナに接続時に自動的に切り替わる
WORKDIR /usr/share/nginx/html

# 公開するポート番号を指定
EXPOSE 80

# コンテナの指定ディレクトリにストレージボリュームを作成
VOLUME /usr/share/nginx/html

CMD ["nginx","-g","daemon off;"]
```

#### 3 つの命令の役割

| 命令                             | 役割         | 説明                                       |
| ------------------------------- | ------------ | ------------------------------------------ |
| `WORKDIR /usr/share/nginx/html` | 作業ディレクトリを指定 | `docker exec` でコンテナに入ると自動的に `cd` する |
| `EXPOSE 80`                     | 公開ポートを宣言 | `docker run -P` と組み合わせてランダムポートに自動マッピング |
| `VOLUME /usr/share/nginx/html`  | ストレージボリュームを宣言 | 匿名ボリュームを自動作成し、データを永続化 |

### 3. nginx の設定を作成

```bash
root@docker01:/dawn/dockerfile/alpine/pingtai-VOLUME-EXPOSE-WORKDIR# cat config/games.conf
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/pingtai;
    server_name   game01.dawn.com;
}
```

### 4. イメージをビルド

```bash
root@docker01:/dawn/dockerfile/alpine/pingtai-VOLUME-EXPOSE-WORKDIR# docker image build -t dawn-games:v2.13 .
...
Step 7/10 : WORKDIR /usr/share/nginx/html
 ---> c2beaad2ca7d
Step 8/10 : EXPOSE 80
 ---> adace459771f
Step 9/10 : VOLUME /usr/share/nginx/html
 ---> 58ae3b9289fe
Step 10/10 : CMD ["nginx","-g","daemon off;"]
 ---> c3489847ff85
Successfully built c3489847ff85
Successfully tagged dawn-games:v2.13
```

### 5. コンテナを起動し 3 つの命令を検証

```bash
root@docker01:~# docker run -dP --name c1 dawn-games:v2.13
0aca37fa9cbcf91721dd2a28c5330bec8677c603cfdedab00e4d5398d67d7b7e

root@docker01:~# docker ps -l
CONTAINER ID   IMAGE               COMMAND                  CREATED         STATUS         PORTS                                     NAMES
0aca37fa9cb1   dawn-games:v2.13   "nginx -g 'daemon of…"   3 seconds ago   Up 2 seconds   0.0.0.0:32770->80/tcp, :::32770->80/tcp   c1
```

**EXPOSE を検証（-P でランダムポート 32770 に自動マッピング）：**

```bash
root@docker01:~# docker inspect -f '{{json .Config.ExposedPorts}}' c1
{"80/tcp":{}}
```

**VOLUME を検証（匿名ボリュームの場所）：**

```bash
root@docker01:~# docker inspect -f "{{range .Mounts}}{{.Source}}{{end}}" c1
/var/lib/docker/volumes/4269bc9ee8aa04573c8637c671a10cf98d2e9019949d0372a11c2f35c8c62f40/_data

root@docker01:~# ll /var/lib/docker/volumes/4269bc9ee8aa04573c8637c671a10cf98d2e9019949d0372a11c2f35c8c62f40/_data
total 12
drwxr-xr-x 3 root root 4096 Oct 28 12:36 ./
drwx-----x 3 root root 4096 Oct 28 12:36 ../
drwxr-xr-x 7 root root 4096 Oct 28 12:36 pingtai/
```

**WORKDIR を検証（exec で入った後自動的にディレクトリが切り替わる）：**

```bash
root@docker01:~# docker exec -it c1 sh
/usr/share/nginx/html # pwd
/usr/share/nginx/html
```

### 6. アクセステスト

ブラウザでアクセス：`http://11.0.1.121:32770/`

![image-20261028210809525](/images/docker-dockerfile-core-instructions/image-20261028210809525.png)

---

## 事例2：ENV / ARG（マルチサービス起動）

### 1. Dockerfile を作成する

```bash
root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG# cat Dockerfile
FROM alpine:3.20.2

MAINTAINER dawn 123456@dawn.com www.dawn.com xixi haha

LABEL school=czu \
      class=computer01 \
      auther=dawn \
      email=123456@dawn.com \
      office=www.dawn.com

WORKDIR /usr/share/nginx/html

EXPOSE 80

VOLUME /usr/share/nginx/html

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && \
     apk update && \
     apk add nginx openssh-server curl && \
     sed -i 's@#PermitRootLogin prohibit-password@PermitRootLogin yes@' /etc/ssh/sshd_config && \
     ssh-keygen -A && \
     rm -rf /var/cache/ /usr/share/nginx/html/*

# コンテナ実行時に有効な変数。構築段階と実行段階の両方で有効。実行時は -e で値を上書き
ENV dawn_USERNAME=root \
    dawn_PASSWORD=321

# イメージ構築時に有効な変数。構築段階のみで有効。構築段階では "--build-arg" オプションで値を上書きできる。
ARG dawn_school=czu \
    dawn_class=computer01

RUN touch /dawn-${dawn_USERNAME} && \
    touch /dawn-${dawn_PASSWORD} && \
    touch /dawn-xixi-${dawn_school} && \
    touch /dawn-haha-${dawn_class}

ADD code/dawn-zhiwu.tar.gz /usr/share/nginx/html/zhiwu

COPY config/games.conf /etc/nginx/http.d/default.conf

COPY scripts/start.sh /

# CMD ["nginx","-g","daemon off;"]
CMD ["/bin/sh","-x","/start.sh"]
# CMD ["tail","-f","/etc/hosts"]
```

### 2. 起動スクリプトを作成（マルチサービス：sshd + nginx）

```bash
root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG# cat scripts/start.sh
#!/bin/sh

# init root password
if [ -n $dawn_USERNAME ];then {
    USERNAME=${dawn_USERNAME:-root}

    id ${USERNAME}

    if [ $? != 0 ];then {
       adduser ${USERNAME} -D
    }
    fi
}
fi

if [ -n $dawn_PASSWORD ];then {
   PASSWORD=${dawn_PASSWORD:-123}
}
fi

echo $USERNAME:$PASSWORD | chpasswd

# start sshd service
/usr/sbin/sshd

# start nginx service
nginx -g 'daemon off;'
```

### 3. nginx の設定を作成

```bash
root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG# cat config/games.conf
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/zhiwu;
    server_name   game01.dawn.com;
}
```

### 4. イメージをビルド

```bash
root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG# docker image build -t dawn-games:v2.14 .
...
(15/15) Installing openssh-server (9.7_p1-r5)
...
Step 8/14 : ENV dawn_USERNAME=root     dawn_PASSWORD=321
 ---> 33d0dcf85ef9
Step 9/14 : ARG dawn_school=czu     dawn_class=computer01
 ---> db9d23d02ad7
Step 10/14 : RUN touch /dawn-${dawn_USERNAME} && ...
 ---> 3f912a699263
Step 14/14 : CMD ["/bin/sh","-x","/start.sh"]
 ---> c2d92ddef381
Successfully tagged dawn-games:v2.14
```

### 5. 実行時に ENV を上書き（-e でユーザー名とパスワードを変更）

```bash
root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG/scripts# docker run -dP --name c1 -e dawn_USERNAME=xixi -e dawn_PASSWORD=haha dawn-games:v2.14
2b6539639876439a33773c8292dae05f3d87018cd1b59d990541581780ba7c1b

root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG# docker exec -it c1 sh
/usr/share/nginx/html # env
...
dawn_PASSWORD=haha
dawn_USERNAME=xixi
PWD=/usr/share/nginx/html
/usr/share/nginx/html #
```

**マルチサービス起動を検証（sshd + nginx が同時に動作）：**

```bash
root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG# docker exec c1 ps aux | grep -E 'sshd|nginx'
   14 root      0:00 sshd: /usr/sbin/sshd [listener] 0 of 10-100 startups
   15 root      0:00 nginx: master process nginx -g daemon off;
   16 nginx     0:00 nginx: worker process
```

**アクセステスト：**

![image-20261028211748223](/images/docker-dockerfile-core-instructions/image-20261028211748223.png)

### 6. 構築時に ARG を上書き（--build-arg で引数を変更）

```bash
root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG# docker build -t dawn-games:v2.15 --build-arg dawn_school=THU --build-arg dawn_class=yaoban .
Successfully tagged dawn-games:v2.15

root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG# docker run --rm dawn-games:v2.15 sh -c 'ls /dawn-*'
/dawn-321
/dawn-haha-yaoban
/dawn-root
/dawn-xixi-THU
```

`/dawn-root`、`/dawn-321` —— `ENV` から（デフォルト値、上書きされていない）

`/dawn-xixi-THU` —— `ARG dawn_school` から（`--build-arg` で `THU` に上書き）

`/dawn-haha-yaoban` —— `ARG dawn_class` から（`--build-arg` で `yaoban` に上書き）

#### ENV と ARG の違い

| 比較項目       | ENV                | ARG                        |
| ------------ | ------------------ | -------------------------- |
| 有効段階       | 構築 + 実行段階    | 構築段階のみ               |
| 実行時の上書き | `docker run -e`    | サポートなし               |
| 構築時の上書き | サポートなし       | `docker build --build-arg` |
| イメージに入るか | イメージの環境変数に書き込まれる | 書き込まれない（構築後に消える） |

---

## 事例3：HEALTHCHECK ヘルスチェック

### 1. Dockerfile を作成する

```bash
root@docker01:/dawn/dockerfile/alpine/liferestart-HEALTHCHECK# cat Dockerfile
FROM alpine:3.20.2
...
ADD code/dawn-liferestart.tar.gz /usr/share/nginx/html/liferestart

COPY config/games.conf /etc/nginx/http.d/default.conf

COPY scripts/start.sh /

# コンテナのヘルスチェックに使う。コンテナ内サービスが正常に動作し、コンテナにヘルスチェックが指定されている場合、
# 正常状態の他に、健康状態も持つ。
# 状態は最初 "starting"。ヘルスチェックが通るたびに "healthy" になる。
# 一定回数連続で失敗すると、"unhealthy" になる。
HEALTHCHECK --interval=1s \
            --timeout=1s \
            --start-period=10s \
            --retries=5 \
            CMD curl -H "host: game01.dawn.com" 127.0.0.1

CMD ["/bin/sh","-x","/start.sh"]
```

#### HEALTHCHECK パラメータ詳解

| パラメータ         | デフォルト値 | 意味                                   |
| -------------------- | ------ | ---------------------------------------- |
| `--interval=1s`      | 30s    | コンテナ起動後、どのくらいの間隔でチェックするか |
| `--timeout=1s`       | 30s    | 1 回のチェックがこの時間を超えると失敗とみなす |
| `--start-period=10s` | 0s     | チェック開始までの遅延時間。この期間の失敗はリトライ回数にカウントされない |
| `--retries=5`        | 3      | 連続で何回失敗すると unhealthy と判定されるか |

### 2. イメージをビルドしてコンテナを起動

```bash
root@docker01:/dawn/dockerfile/alpine/liferestart-HEALTHCHECK# docker image build -t dawn-games:v2.15 .
...
Step 14/15 : HEALTHCHECK --interval=1s --timeout=1s --start-period=10s --retries=5 CMD curl -H "host: game01.dawn.com" 127.0.0.1
 ---> 19311a2ff5ea
Successfully tagged dawn-games:v2.15

root@docker01:/dawn/dockerfile/alpine/liferestart-HEALTHCHECK# docker run -dP --name c1 dawn-games:v2.15
8749a1d58d4226ca75dee7dc8df12cb5954ee68af7da87417a0ee287e0149e33
```

### 3. 健康状態の変化を観察

**起動直後（starting）：**

```bash
root@docker01:/dawn/dockerfile/alpine/liferestart-HEALTHCHECK# docker ps
CONTAINER ID   IMAGE               COMMAND                  CREATED         STATUS                            PORTS       NAMES
8749a1d58d42   dawn-games:v2.15   "/bin/sh -x /start.…"   1 second ago    Up Less than a second (health: starting)     c1
```

**10 秒待機後（healthy）：**

```bash
root@docker01:/dawn/dockerfile/alpine/liferestart-HEALTHCHECK# docker ps
CONTAINER ID   IMAGE               COMMAND                  CREATED         STATUS                   PORTS       NAMES
8749a1d58d42   dawn-games:v2.15   "/bin/sh -x /start.…"   18 seconds ago   Up 18 seconds (healthy)              c1
```

**ヘルスチェックの詳細を確認：**

```bash
root@docker01:/dawn/dockerfile/alpine/liferestart-HEALTHCHECK# docker inspect --format '{{json .State.Health}}' c1
{"Status":"healthy","FailingStreak":0,"Log":[{"Start":"...","End":"...","ExitCode":0,"Output":"..."},...]}
```

 `Status` が `healthy` で、 `FailingStreak`（連続失敗回数）が 0 であることが分かり、
各ヘルスチェックの `ExitCode` はすべて 0 です（curl がゲームページに正常にアクセス）。

---

## 事例4：ENTRYPOINT 起動コマンドの指定

### 1. Dockerfile を作成する

```bash
root@docker01:/dawn/dockerfile/alpine/qieshuiguo-ENTRYPOINT# cat Dockerfile
FROM alpine:3.20.2
...
ADD code/dawn-qieshuiguo.tar.gz /usr/share/nginx/html/qieshuiguo

COPY config/games.conf /etc/nginx/http.d/default.conf

COPY scripts/start.sh /

HEALTHCHECK --interval=1s \
            --timeout=1s \
            --start-period=10s \
            --retries=5 \
            CMD curl -H "host: game01.dawn.com" 127.0.0.1

# CMD の命令は、コンテナ起動時に起動コマンドを指定することで上書きできる
# CMD ["/bin/sh","-x","/start.sh"]

# 起動コマンドとして ENTRYPOINT 命令を使うと上書きできない。
# ENTRYPOINT は CMD と併用でき、その場合 CMD は ENTRYPOINT への引数として渡される
#ENTRYPOINT ["tail", "-f", "/etc/hosts"]
ENTRYPOINT ["/bin/sh","-x","/start.sh"]

#CMD ["tail -f /etc/hosts"]
#ENTRYPOINT ["/bin/sh","-c"]
```

### 2. イメージをビルド

```bash
root@docker01:/dawn/dockerfile/alpine/qieshuiguo-ENTRYPOINT# docker image build -t dawn-games:v2.16 .
...
Step 15/15 : ENTRYPOINT ["/bin/sh","-x","/start.sh"]
 ---> fc30411c280a
Successfully tagged dawn-games:v2.16
```

### 3. コンテナを起動して検証

```bash
root@docker01:/dawn/dockerfile/alpine/qieshuiguo-ENTRYPOINT# docker run -dP --name c1 dawn-games:v2.16
5c638a6732c6573cd858241d44a016afcac2bc34d5b042b529a58bb7ec1d9824

root@docker01:/dawn/dockerfile/alpine/qieshuiguo-ENTRYPOINT# docker inspect -f '{{json .Config.Entrypoint}}' c1
["/bin/sh","-x","/start.sh"]

root@docker01:/dawn/dockerfile/alpine/qieshuiguo-ENTRYPOINT# curl -s http://127.0.0.1:32773/ | grep -o '<title>[^<]*</title>'
<title>切水果</title>
```

### 4. ENTRYPOINT と CMD の違い

| 比較項目             | CMD                          | ENTRYPOINT                   |
| ------------------------------ | ---------------------------- | ---------------------------- |
| `docker run` コマンドラインで上書き可能か | 可（コマンドを追加すると上書き） | 既定では上書き不可 |
| 上書き方法           | `docker run` の直後にコマンドを続ける | `--entrypoint` で強制上書きが必要 |
| 併用                 | ENTRYPOINT の引数となる      | メインコマンドとなる         |

**ENTRYPOINT の引数受け渡しの仕組みを実演：**

```bash
root@docker01:/dawn/dockerfile/alpine/qieshuiguo-ENTRYPOINT# docker run --rm --entrypoint echo dawn-games:v2.16 'これはENTRYPOINTが受け取った引数'
これはENTRYPOINTが受け取った引数
```

**イメージのデフォルト設定を確認：**

```bash
root@docker01:/dawn/dockerfile/alpine/qieshuiguo-ENTRYPOINT# docker image inspect -f 'Entrypoint={{json .Config.Entrypoint}} Cmd={{json .Config.Cmd}}' dawn-games:v2.16
Entrypoint=["/bin/sh","-x","/start.sh"] Cmd=null
```

 `CMD` ではなく `ENTRYPOINT` を使っているため、 `Config.Cmd` は `null` になります。