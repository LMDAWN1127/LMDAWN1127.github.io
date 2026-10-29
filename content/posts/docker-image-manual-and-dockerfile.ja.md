---
title: "Docker 実戦：手動での Docker イメージ作成と Dockerfile による自動ビルド"
date: 2026-10-28T14:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "CentOS・Ubuntu・Alpine の 3 種類のベースイメージから nginx ゲームイメージを手動で作成し docker commit でコミット（サイズ 236MB / 215MB / 9.41MB）。その後 Dockerfile で同じイメージを自動ビルドし、手動作成の 3 つの欠点をまとめます。"
---

# Docker 実戦：手動での Docker イメージ作成と Dockerfile による自動ビルド

Docker イメージを作る道は 2 つあります。**手動方式**はベースコンテナを起動し、その中にサービスをインストールしてから `docker commit` でコミットする方法です。**Dockerfile 方式**は全過程をファイルに書き、`docker build` で一気に仕上げます。本記事ではまず CentOS・Ubuntu・Alpine の 3 種類のベースイメージから同じ nginx ゲームイメージを手動で作成し（ついでにサイズも確認します。236MB / 215MB / 9.41MB）、次に Dockerfile でもう一度作り直し、最後に手動方式の 3 つの欠点を挙げます。

## 1. Docker イメージを手動で作成する

### 1.1 CentOS 環境でゲームイメージを作成する

1. イメージを用意する

```bash
root@docker01:~# docker pull uhub.service.ucloud.cn/dawn/centos:7.9.2009
```

2. CentOS イメージを起動する

```bash
root@docker01:~# docker run -it --name c1 uhub.service.ucloud.cn/dawn/centos:7.9.2009
[root@de8e7781da0e /]#
```

3. コンテナとイメージのサイズを確認する

```bash
root@docker01:~# docker image ls uhub.service.ucloud.cn/dawn/centos
REPOSITORY                           TAG        IMAGE ID       CREATED       SIZE
uhub.service.ucloud.cn/dawn/centos   7.9.2009   eeb6ee3f44bd   5 years ago   204MB
root@docker01:~# docker ps -ls
CONTAINER ID   IMAGE                                         COMMAND       CREATED          STATUS          PORTS     NAMES     SIZE
de8e7781da0e   uhub.service.ucloud.cn/dawn/centos:7.9.2009   "/bin/bash"   13 seconds ago   Up 12 seconds             c1        0B (virtual 204MB)
```

4. サービスのインストールを開始する

```bash
[root@de8e7781da0e /]# cat > /etc/yum.repos.d/nginx.repo<<'EOF'
> [nginx-stable]
> name=nginx stable repo
> baseurl=http://nginx.org/packages/centos/$releasever/$basearch/
> gpgcheck=1
> enabled=1
> gpgkey=https://nginx.org/keys/nginx_signing.key
> module_hotfixes=true
>
> [nginx-mainline]
> name=nginx mainline repo
> baseurl=http://nginx.org/packages/mainline/centos/$releasever/$basearch/
> gpgcheck=1
> enabled=0
> gpgkey=https://nginx.org/keys/nginx_signing.key
> module_hotfixes=true
> EOF
[root@de8e7781da0e /]# curl -s -o /etc/yum.repos.d/CentOS-Base.repo http://mirrors.aliyun.com/repo/Centos-7.repo
[root@de8e7781da0e /]# sed -i -e '/mirrors.cloud.aliyuncs.com/d' -e '/mirrors.aliyuncs.com/d' /etc/yum.repos.d/CentOS-Base.repo
[root@de8e7781da0e /]# yum -y install nginx
```

5. コンテナのサイズを再確認する

```bash
root@docker01:~# docker ps -ls
CONTAINER ID   IMAGE                                         COMMAND       CREATED         STATUS         PORTS     NAMES     SIZE
de8e7781da0e   uhub.service.ucloud.cn/dawn/centos:7.9.2009   "/bin/bash"   4 minutes ago   Up 4 minutes             c1        265MB (virtual 469MB)
```

6. yum の最適化を行う

```bash
[root@de8e7781da0e /]# rm -rf /var/cache/
[root@de8e7781da0e /]# nginx -t
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: [emerg] mkdir() "/var/cache/nginx/client_temp" failed (2: No such file or directory)
nginx: configuration file /etc/nginx/nginx.conf test failed
[root@de8e7781da0e /]# mkdir -pv /var/cache/nginx
mkdir: created directory '/var/cache'
mkdir: created directory '/var/cache/nginx'
[root@de8e7781da0e /]# nginx -t
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

7. コンテナのサイズを再確認する

```bash
root@docker01:~# docker ps -ls
CONTAINER ID   IMAGE                                         COMMAND       CREATED         STATUS         PORTS     NAMES     SIZE
de8e7781da0e   uhub.service.ucloud.cn/dawn/centos:7.9.2009   "/bin/bash"   6 minutes ago   Up 6 minutes             c1        32.2MB (virtual 236MB)
```

8. nginx のテストデータを用意する

8.1 元ファイルの内容を削除する

```bash
[root@de8e7781da0e /]# rm -f /usr/share/nginx/html/*
[root@de8e7781da0e /]# ls -l /usr/share/nginx/html
total 0
```

8.2 ゲームコードをコピーする

```bash
# 1. イメージを取得
docker pull uhub.service.ucloud.cn/dawn/dawn-games:v0.6

# 2. 一時コンテナを起動し、イメージから bird をホストへコピー
docker run -d --name tmp-games uhub.service.ucloud.cn/dawn/dawn-games:v0.6 tail -f /dev/null
docker cp tmp-games:/usr/local/nginx/html/bird /root/bird

# 3. 対象コンテナ c1 にコピー
docker cp /root/bird c1:/usr/share/nginx/html/

# 4. 一時コンテナを削除
docker rm -f tmp-games
```

bird コードはテストコードなので、"uhub.service.ucloud.cn/dawn/dawn-games:v0.6" イメージから直接コピーできます

8.3 bird のソースコードを用意する

```bash
[root@de8e7781da0e /]# cd /usr/share/nginx/html/bird/
[root@de8e7781da0e bird]# ls
2000.png  21.js  icon.png  img  index.html  sound1.mp3
[root@de8e7781da0e bird]# mv * ../
[root@de8e7781da0e bird]# cd ..
[root@de8e7781da0e html]# rm -rf bird/
[root@de8e7781da0e html]# ll
total 144
-rw-r--r-- 1 root root 15329 Aug 31  2022 2000.png
-rw-r--r-- 1 root root 51562 Aug 31  2022 21.js
-rw-r--r-- 1 root root   254 Aug 31  2022 icon.png
drwxr-xr-x 2 root root  4096 Feb 23  2023 img
-rw-r--r-- 1 root root  3049 Aug 31  2022 index.html
-rw-r--r-- 1 root root 63008 Aug 31  2022 sound1.mp3
```

9. イメージをコミットする

9.1 c1 コンテナをイメージとしてコミットする

```bash
root@docker01:~# docker container commit c1 dawn-games:v0.1
sha256:69bd176b9a1c85bb4418dccc9cfe3063f47b877eb0628b7b2a5d96eda4f3b244
```

9.2 イメージを確認する

```bash
root@docker01:~# docker image ls dawn-games
REPOSITORY   TAG       IMAGE ID       CREATED          SIZE
dawn-games   v0.1      69bd176b9a1c   45 seconds ago   236MB
```

10. 自作イメージを起動する

10.1 カスタムコマンドを指定せずに起動する

```bash
root@docker01:~# docker run -itd -p 80:80 --name game dawn-games:v0.1
a42c86886e83089c4ad72673d46eb8ac1d41ece7977cc1d307339d69749c7dab
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE             COMMAND       CREATED         STATUS         PORTS                               NAMES
a42c86886e83   dawn-games:v0.1   "/bin/bash"   8 seconds ago   Up 7 seconds   0.0.0.0:80->80/tcp, :::80->80/tcp   game
root@docker01:~# docker top game
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                15178               15154               0                   06:27               pts/0               00:00:00            /bin/bash
root@docker01:~# docker exec -it game sh
sh-4.2# nginx
sh-4.2#
```

10.2 起動コマンドを指定してコンテナを起動する

```bash
root@docker01:~# docker run -itd -p 80:80 --name game dawn-games:v0.1 nginx -g 'daemon off;'
175bdc314d92dd911f2b0e4a8c8665d9b3415156deb5e52b8387aae52d14df3e
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE             COMMAND                  CREATED          STATUS          PORTS                               NAMES
175bdc314d92   dawn-games:v0.1   "nginx -g 'daemon of…"   14 seconds ago   Up 13 seconds   0.0.0.0:80->80/tcp, :::80->80/tcp   game
```

10.3 新しい起動イメージをもう一度コミットすれば完了

```bash
root@docker01:~# docker ps -l --no-trunc
CONTAINER ID                                                       IMAGE             COMMAND                    CREATED         STATUS         PORTS                               NAMES
175bdc314d92dd911f2b0e4a8c8665d9b3415156deb5e52b8387aae52d14df3e   dawn-games:v0.1   "nginx -g 'daemon off;'"   2 minutes ago   Up 2 minutes   0.0.0.0:80->80/tcp, :::80->80/tcp   game
root@docker01:~# docker commit game dawn-games:v0.2
sha256:dd4932b55d441d802585724172fb4fc47781200cc0f687c0fb607fe011999cbd
root@docker01:~# docker image ls dawn-games
REPOSITORY   TAG       IMAGE ID       CREATED          SIZE
dawn-games   v0.2      dd4932b55d44   14 seconds ago   236MB
dawn-games   v0.1      69bd176b9a1c   7 minutes ago    236MB
root@docker01:~# docker run -d -p 88:80 --name game02 dawn-games:v0.2
3e4e52204e0072fe2fdbd6c9590968100bcbad2304d2bdfa173a35e96dced3cd
root@docker01:~# docker ps -l --no-trunc
CONTAINER ID                                                       IMAGE             COMMAND                    CREATED         STATUS         PORTS                               NAMES
3e4e52204e0072fe2fdbd6c9590968100bcbad2304d2bdfa173a35e96dced3cd   dawn-games:v0.2   "nginx -g 'daemon off;'"   7 seconds ago   Up 6 seconds   0.0.0.0:88->80/tcp, :::88->80/tcp   game02
```

子イメージ起動時に COMMAND（コンテナの起動コマンド）を指定しない場合は、親イメージの起動コマンドが使われます

### 1.2 Ubuntu 環境でゲームイメージを作成する

1. イメージを取得する

```bash
root@docker01:~# docker pull ubuntu:22.04
```

2. Ubuntu イメージを起動する

```bash
root@docker01:~# docker container run --name c1 -it ubuntu:22.04
root@cd4225a50f46:/#
```

3. サービスをインストールする

```bash
root@cd4225a50f46:/# apt update
root@cd4225a50f46:/# apt -y install nginx
root@cd4225a50f46:/# rm -f /var/www/html/*
```

4. テストコードをコピーする

```bash
root@docker01:~# docker cp  bird/ c1:/var/www/html/
Successfully copied 172kB to c1:/var/www/html/
```

5. テストデータを用意する

```bash
root@cd4225a50f46:/# cd /var/www/html/bird/
root@cd4225a50f46:/var/www/html/bird# mv * ../
root@cd4225a50f46:/var/www/html/bird# cd ..
root@cd4225a50f46:/var/www/html# rm -rf bird/
root@cd4225a50f46:/var/www/html# ll
total 152
drwxr-xr-x 3 root root  4096 Oct 28 06:38 ./
drwxr-xr-x 3 root root  4096 Oct 28 06:36 ../
-rw-r--r-- 1 root root 15329 Aug 31  2022 2000.png
-rw-r--r-- 1 root root 51562 Aug 31  2022 21.js
-rw-r--r-- 1 root root   254 Aug 31  2022 icon.png
drwxr-xr-x 2 root root  4096 Feb 23  2023 img/
-rw-r--r-- 1 root root  3049 Aug 31  2022 index.html
-rw-r--r-- 1 root root 63008 Aug 31  2022 sound1.mp3
```

6. イメージをコミットする

```bash
root@docker01:~# docker commit c1 dawn-games:v1.0
sha256:b9468a21eb088f88c31b2f72b9889135662fad37a0c54d5782bf87426d901af4
root@docker01:~# docker image ls dawn-games
REPOSITORY   TAG       IMAGE ID       CREATED          SIZE
dawn-games   v1.0      b9468a21eb08   12 seconds ago   215MB
dawn-games   v0.2      dd4932b55d44   7 minutes ago    236MB
dawn-games   v0.1      69bd176b9a1c   14 minutes ago   236MB
```

7. サービスを起動する

```bash
root@docker01:~# docker run -d -p 81:80 --name game dawn-games:v1.0 nginx -g 'daemon off;'
9ab6168a04f68060b7e804c3b34684cc23d3ecc6c0a7622495ffad1d74ce3b9b
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE             COMMAND                  CREATED          STATUS          PORTS                               NAMES
9ab6168a04f6   dawn-games:v1.0   "nginx -g 'daemon of…"   12 seconds ago   Up 11 seconds   0.0.0.0:81->80/tcp, :::81->80/tcp   game
```

8. イメージを再コミットする

```bash
root@docker01:~# docker commit game dawn-games:v1.1
sha256:405ca93633d6795d6b6efa2df521dfd229776647e452535123bacccf7537939a
root@docker01:~# docker run -d --name game2 -p 82:80 dawn-games:v1.1
08a61bc3faaa83c37b38d8507da811c601c7c5622fc82aec09f1f31d93433106
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE             COMMAND                  CREATED         STATUS         PORTS                               NAMES
08a61bc3faaa   dawn-games:v1.1   "nginx -g 'daemon of…"   8 seconds ago   Up 7 seconds   0.0.0.0:82->80/tcp, :::82->80/tcp   game2
root@docker01:~# docker image ls dawn-games
REPOSITORY   TAG       IMAGE ID       CREATED          SIZE
dawn-games   v1.1      405ca93633d6   24 seconds ago   215MB
dawn-games   v1.0      b9468a21eb08   2 minutes ago    215MB
dawn-games   v0.2      dd4932b55d44   9 minutes ago    236MB
dawn-games   v0.1      69bd176b9a1c   16 minutes ago   236MB
```

Ubuntu イメージで各種サービスを作成する方が、CentOS より容量を節約できます

### 1.3 Alpine 環境でゲームイメージを作成する

1. イメージを取得する

```bash
root@docker01:~# docker pull alpine:3.20.2
```

2. コンテナを起動してサービスをインストールする

```bash
root@docker01:~# docker container run -it --name c1 alpine:3.20.2
/ # sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories
/ # apk update
fetch https://mirrors.tuna.tsinghua.edu.cn/alpine/v3.20/main/x86_64/APKINDEX.tar.gz
fetch https://mirrors.tuna.tsinghua.edu.cn/alpine/v3.20/community/x86_64/APKINDEX.tar.gz
v3.20.10-118-gcb3382a0eb8 [https://mirrors.tuna.tsinghua.edu.cn/alpine/v3.20/main]
v3.20.10-106-gcfb1a4769c3 [https://mirrors.tuna.tsinghua.edu.cn/alpine/v3.20/community]
OK: 24181 distinct packages available
/ # apk add nginx
(1/2) Installing pcre (8.45-r3)
(2/2) Installing nginx (1.26.3-r0)
Executing nginx-1.26.3-r0.pre-install
Executing nginx-1.26.3-r0.post-install
Executing busybox-1.36.1-r29.trigger
OK: 9 MiB in 16 packages
/ # nginx  -t
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
/ # du -sh /var/cache/
2.2M    /var/cache/
/ # rm -rf /var/cache/
/ # rm -f /usr/share/nginx/*
/ #
```

3. テストコードをコピーする

```bash
root@docker01:~# docker cp bird c1:/usr/share/nginx/html
Successfully copied 172kB to c1:/usr/share/nginx/html
```

4. nginx の設定ファイルを作成する

```bash
/ # rm -f /etc/nginx/http.d/default.conf
/ # vi /etc/nginx/http.d/default.conf
server {
    listen 80;
    server_name _;

    location / {
        root /usr/share/nginx/html;
        index index.html;
    }
}

```

5. 設定ファイルの構文をチェックする

```bash
/ # nginx -t
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

6. イメージをコミットする

```bash
root@docker01:~# docker commit c1 dawn-games:v2.0
sha256:9f71529e87b1d0624cded19da5e939a22afe438583da169e76f8092d0c8e6047
root@docker01:~# docker image ls dawn-games
REPOSITORY   TAG       IMAGE ID       CREATED          SIZE
dawn-games   v2.0      9f71529e87b1   9 seconds ago    9.41MB
dawn-games   v1.1      405ca93633d6   15 minutes ago   215MB
dawn-games   v1.0      b9468a21eb08   17 minutes ago   215MB
dawn-games   v0.2      dd4932b55d44   24 minutes ago   236MB
dawn-games   v0.1      69bd176b9a1c   31 minutes ago   236MB
```

7. コンテナを起動する

```bash
root@docker01:~# docker run -d -p 85:80 --name game dawn-games:v2.0 nginx -g 'daemon off;'
b9b3524f467b3e4895dccf96505d99862ace2641d720600ee51320a8050d20ef
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE             COMMAND                  CREATED         STATUS         PORTS                               NAMES
b9b3524f467b   dawn-games:v2.0   "nginx -g 'daemon of…"   9 seconds ago   Up 8 seconds   0.0.0.0:85->80/tcp, :::85->80/tcp   game
```

8. イメージを再コミットする

```bash
root@docker01:~# docker commit game dawn-games:v2.1
sha256:db1ed8c3492a619b9618111fa8ba2d8c24450ddaa26a87e598e16f1d792b031f
root@docker01:~# docker image ls dawn-games
REPOSITORY   TAG       IMAGE ID       CREATED              SIZE
dawn-games   v2.1      db1ed8c3492a   9 seconds ago        9.41MB
dawn-games   v2.0      9f71529e87b1   About a minute ago   9.41MB
dawn-games   v1.1      405ca93633d6   17 minutes ago       215MB
dawn-games   v1.0      b9468a21eb08   19 minutes ago       215MB
dawn-games   v0.2      dd4932b55d44   26 minutes ago       236MB
dawn-games   v0.1      69bd176b9a1c   33 minutes ago       236MB
root@docker01:~# docker run -d -p 86:80 --name game2 dawn-games:v2.1
8310670e0cc681911eb8f05bf6a83ca73ec7a6a46ace87ef333027249f629c9d
root@docker01:~# docker ps -l --no-trunc
CONTAINER ID                                                       IMAGE             COMMAND                    CREATED          STATUS          PORTS                               NAMES
8310670e0cc681911eb8f05bf6a83ca73ec7a6a46ace87ef333027249f629c9d   dawn-games:v2.1   "nginx -g 'daemon off;'"   12 seconds ago   Up 12 seconds   0.0.0.0:86->80/tcp, :::86->80/tcp   game2
```



### 1.4 手動でイメージを作成する際の欠点

1. イメージのサイズが大きすぎて転送しにくい;

2. イメージの変更が煩雑。たとえば COMMAND 起動コマンドを変更するには、コンテナを起動し、新しいイメージをコミットし、その新しいイメージから起動し直す必要がある;

3. キャッシュ機能を利用できず、コマンドを 1 つずつ手動で実行する必要があり、Linux 仮想マシンの操作と似ている。

## 2. Dockerfile によるイメージの自動作成

### 2.1 作業ディレクトリに入る

```bash
root@docker01:~# mkdir -pv /dawn/dockerfile && cd /dawn/dockerfile
mkdir: created directory '/dawn/dockerfile'
root@docker01:/dawn/dockerfile# mkdir alpine centos ubuntu
root@docker01:/dawn/dockerfile# ll
total 20
drwxr-xr-x 5 root root 4096 Oct 28 07:10 ./
drwxr-xr-x 4 root root 4096 Oct 28 07:10 ../
drwxr-xr-x 2 root root 4096 Oct 28 07:10 alpine/
drwxr-xr-x 2 root root 4096 Oct 28 07:10 centos/
drwxr-xr-x 2 root root 4096 Oct 28 07:10 ubuntu/
```

### 2.2 Dockerfile を作成する

```bash
root@docker01:/dawn/dockerfile# cd alpine/
root@docker01:/dawn/dockerfile/alpine# mkdir bird
root@docker01:/dawn/dockerfile/alpine# cd bird/
root@docker01:/dawn/dockerfile/alpine/bird# ll
total 8
drwxr-xr-x 2 root root 4096 Jul 24 04:06 ./
drwxr-xr-x 3 root root 4096 Jul 24 04:06 ../
root@docker01:/dawn/dockerfile/alpine/bird# cat Dockerfile
# ベースイメージを指定。以降のすべての操作はこのイメージの上で行われる
FROM alpine:3.20.2

# コンテナ内でコマンドを実行し、nginx サービスをインストールする
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && \
     apk update && \
     apk add nginx && \
      rm -rf /var/cache/ rm -f /usr/share/nginx/*

# カレントディレクトリの "dawn-bird.zip" をコンテナの / ディレクトリにコピーする
#COPY dawn-bird.zip /
COPY dawn-bird.tar.gz /

# コンテナ内で指定ディレクトリにプログラムを展開する
#RUN unzip /dawn-bird.zip -d  /usr/share/nginx/html  && \
#    rm -f /dawn-bird.zip
RUN mkdir -pv /usr/share/nginx/html  && \
    tar xf /dawn-bird.tar.gz -C /usr/share/nginx/html && \
    rm -f /dawn-bird.tar.gz

# ローカルファイルをコンテナの指定パスにコピーし、既存のファイル内容を上書きする
COPY bird.conf /etc/nginx/http.d/default.conf

# コンテナの起動コマンドを指定する
CMD ["nginx","-g","daemon off;"]
```

### 2.3 ファイルをパッケージする

```bash
root@docker01:~/bird# tar -czvf dawn-bird.tar.gz *
2000.png
21.js
icon.png
img/
img/bg1.jpg
img/s1.png
img/number1.png
img/number2.png
img/bg2.jpg
img/s2.png
index.html
sound1.mp3
root@docker01:~/bird# mv dawn-bird.tar.gz /dawn/dockerfile/alpine/bird/
```

### 2.4 テストファイルを用意する

```bash
root@docker01:/dawn/dockerfile/alpine/bird# cat bird.conf
server {
    listen 80;
    location / {
       root /usr/share/nginx/html;
       index index.html;
    }
}
```

### 2.5 イメージをビルドする

```bash
root@docker01:/dawn/dockerfile/alpine/bird# docker image build -t dawn-games:v2.3 .
```

### 2.6 イメージからサービスを起動する

```bash
root@docker01:/dawn/dockerfile/alpine/bird# docker run -d --name game -p 80:80 dawn-games:v2.3
b7e8cb9ef8f314ce52bfa245fcb4af6e6c5985a5de0db85ebe426802f1a60918
```

本番環境ではファイルを tar パッケージでまとめることを推奨します。zip を使うと圧縮時にファイルが破損する場合があり、特に画像ファイルで起こりやすいです
