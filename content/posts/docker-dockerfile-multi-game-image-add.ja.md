---
title: "Docker 実戦：Dockerfile でマルチゲームイメージをビルドし ADD で自動展開"
date: 2026-10-26T15:20:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "古い全部入りイメージ dawn-games-dawn:v0.6 から中継コンテナ経由で 2 つのゲーム (黄金鉱夫と Flappy Bird) の静的ファイルを取り出し、それぞれ tar.gz に固め、Dockerfile の ADD 命令でビルド時に Alpine+nginx コンテナへ自動展開します。最後にイメージをビルドしてコンテナを起動し、ドメインで 2 つのゲームにアクセスします。さらに ADD と COPY の決定的な違い (ADD は tar.gz を自動展開する) も解説します。"
---

# Docker 実戦：Dockerfile でマルチゲームイメージをビルドし ADD で自動展開

手元には“全部入り”の古いイメージ `uhub.service.ucloud.cn/dawn/dawn-games-dawn:v0.6` があり、nginx で 2 つの小さなゲーム、黄金鉱夫 (`huangjinkuanggong`) と Flappy Bird (`killbird`) をホストしています。この 2 つのゲームを個別に取り出して、軽量な **Alpine + nginx** のマルチゲームイメージを作りたいと思います。

本記事では、まず古いイメージからゲームの静的ファイルを取り出してそれぞれ `tar.gz` に固め、次に Dockerfile の **`ADD` 命令**でビルド時にコンテナへ自動展開し、最後にイメージのビルド・コンテナ起動・ドメインでのアクセスまでを一通り実行します。あわせて `ADD` と `COPY` の最も重要な違い——**`ADD` は `tar.gz` を自動展開し、`COPY` はそのままコピーするだけ**——も明確にします。

## 1. イメージからゲームコードを取り出す

| ゲーム     | イメージ内のパス                           |
| -------- | ------------------------------------------ |
| 黄金鉱夫   | `/usr/local/nginx/html/huangjinkuanggong/` |
| Flappy Bird | `/usr/local/nginx/html/killbird/`        |

## 2. ディレクトリを作成し中継コンテナでコピー

```bash
root@docker01:~# mkdir -pv /dawn/dockerfile/alpine/kuanggong-killbird
mkdir: created directory '/dawn/dockerfile/alpine/kuanggong-killbird'
root@docker01:~# cd /dawn/dockerfile/alpine/kuanggong-killbird

# 中継コンテナを起動
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# docker run -d --name games-extract uhub.service.ucloud.cn/dawn/dawn-games-dawn:v0.6 tail -f /dev/null
26a6e7d541a0034b41b0339a283006de59ca79e553c718c78b176933fe326315

# イメージから 2 つのゲームディレクトリをコピー
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# docker cp games-extract:/usr/local/nginx/html/huangjinkuanggong ./huangjinkuanggong
Successfully copied 5.3MB to /dawn/dockerfile/alpine/kuanggong-killbird/huangjinkuanggong
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# docker cp games-extract:/usr/local/nginx/html/killbird ./killbird
Successfully copied 1.27MB to /dawn/dockerfile/alpine/kuanggong-killbird/killbird
```

## 3. tar.gz に固める

```bash
# ゲームディレクトリの内側で固めて、展開後すぐゲームファイルになるようにする
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# tar -czf dawn-huangjinkuanggong.tar.gz -C huangjinkuanggong .
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# tar -czf dawn-killbird.tar.gz -C killbird .

# 元のディレクトリを削除
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# rm -rf huangjinkuanggong killbird
```

## 4. Dockerfile を作成

```bash
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# cat Dockerfile
# ベースイメージを指定。以降の操作はすべてこのイメージの上で行われる
FROM alpine:3.20.2

# コンテナ内でコマンドを実行し nginx をインストール
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && \
     apk update && \
     apk add nginx && \
     rm -rf /var/cache/ rm -f /usr/share/nginx/*  && \
     mkdir -pv /usr/share/nginx/html/huangjinkuanggong  && \
     mkdir -pv /usr/share/nginx/html/killbird

## カレントディレクトリの "dawn-bird.zip" をコンテナの / 配下にコピー
#COPY dawn-huangjinkuanggong.tar.gz /
#COPY dawn-killbird.tar.gz /
#
#
## コンテナ内の指定ディレクトリにプログラムを展開
#RUN tar xf /dawn-huangjinkuanggong.tar.gz -C /usr/share/nginx/html/huangjinkuanggong && \
#    tar xf /dawn-killbird.tar.gz -C /usr/share/nginx/html/killbird && \
#    rm -f /dawn-huangjinkuanggong.tar.gz /dawn-killbird.tar.gz

# ADD 命令は tar アーカイブの内容をコンテナの指定パスに自動展開します。ファイルをコンテナにコピーしてから展開し、最後に元ファイルを削除する、と考えると分かりやすいでしょう
ADD dawn-huangjinkuanggong.tar.gz /usr/share/nginx/html/huangjinkuanggong
ADD dawn-killbird.tar.gz /usr/share/nginx/html/killbird

# ローカルファイルをコンテナの指定パスにコピーし、既存のファイルを上書き
COPY games.conf /etc/nginx/http.d/default.conf

# コンテナの起動コマンドを指定
CMD ["nginx","-g","daemon off;"]
```

## 5. nginx 設定 games.conf を作成

```bash
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# vim games.conf
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/huangjinkuanggong;
    server_name   game01.dawn.com;
}

server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/killbird;
    server_name   game02.dawn.com;
}
```

## 6. イメージをビルド

```bash
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# docker image build -t dawn-games:v2.6 .
DEPRECATED: The legacy builder is deprecated and will be removed in a future release.
            Install the buildx component to build images with BuildKit:
            https://docs.docker.com/go/buildx/

Sending build context to Docker daemon  5.015MB
Step 1/6 : FROM alpine:3.20.2
 ---> 324bc02ae123
Step 2/6 : RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories &&      apk update &&      apk add nginx &&      rm -rf /var/cache/ rm -f /usr/share/nginx/*  &&      mkdir -pv /usr/share/nginx/html/huangjinkuanggong  &&      mkdir -pv /usr/share/nginx/html/killbird
 ---> Running in e7850b9319be
fetch https://mirrors.tuna.tsinghua.edu.cn/alpine/v3.20/main/x86_64/APKINDEX.tar.gz
fetch https://mirrors.tuna.tsinghua.edu.cn/alpine/v3.20/community/x86_64/APKINDEX.tar.gz
v3.20.10-118-gcb3382a0eb8 [https://mirrors.tuna.tsinghua.edu.cn/alpine/v3.20/main]
v3.20.10-106-gcfb1a4769c3 [https://mirrors.tuna.tsinghua.edu.cn/alpine/v3.20/community]
OK: 24181 distinct packages available
(1/2) Installing pcre (8.45-r3)
(2/2) Installing nginx (1.26.3-r0)
Executing nginx-1.26.3-r0.pre-install
Executing nginx-1.26.3-r0.post-install
Executing busybox-1.36.1-r29.trigger
OK: 9 MiB in 16 packages
created directory: '/usr/share/nginx/html/'
created directory: '/usr/share/nginx/html/huangjinkuanggong'
created directory: '/usr/share/nginx/html/killbird'
 ---> Removed intermediate container e7850b9319be
 ---> a2f446944fd8
Step 3/6 : ADD dawn-huangjinkuanggong.tar.gz /usr/share/nginx/html/huangjinkuanggong
 ---> 40640938b557
Step 4/6 : ADD dawn-killbird.tar.gz /usr/share/nginx/html/killbird
 ---> 0ffa408b4136
Step 5/6 : COPY games.conf /etc/nginx/http.d/default.conf
 ---> 51cdedf25280
Step 6/6 : CMD ["nginx","-g","daemon off;"]
 ---> Running in 3cbdb8335dd2
 ---> Removed intermediate container 3cbdb8335dd2
 ---> 9b4495d60e31
Successfully built 9b4495d60e31
Successfully tagged dawn-games:v2.6
```

## 7. ビルドで生成される中間レイヤーを観察する (Dockerfile の各命令は新しいイメージを生成する)

```bash
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# docker image ls -a | grep -E '9b4495d60e31|51cdedf25280|0ffa408b4136|40640938b557|a2f446944fd8|324bc02ae123'
<none>                                         <none>     40640938b557   7 minutes ago       14.4MB
<none>                                         <none>     51cdedf25280   7 minutes ago       15.6MB
dawn-games                                     v2.6       9b4495d60e31   7 minutes ago       15.6MB
<none>                                         <none>     a2f446944fd8   7 minutes ago       9.25MB
<none>                                         <none>     0ffa408b4136   7 minutes ago       15.6MB
alpine                                         3.20.2     324bc02ae123   2 years ago         7.8MB
```

## 8. コンテナを起動

```bash
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# docker run -d --name games-test -p 8082:80 dawn-games:v2.6
383f09529e6ec1b2de0f67f2600de92e8ee920e66091b4832915ff611b0c253e
```

## 9. ローカルの hosts を書き換えてドメインでアクセス

```bash
11.0.1.121  game01.dawn.com
11.0.1.121  game02.dawn.com
```

http://game01.dawn.com:8082/

![image-20261028184914653](/images/docker-dockerfile-multi-game-image-add-image-20261028184914653.png)

http://game02.dawn.com:8082/

![image-20261028184929946](/images/docker-dockerfile-multi-game-image-add-image-20261028184929946.png)