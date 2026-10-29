---
title: "ベースイメージを指定せずに独自イメージを構築：scratch の活用"
date: 2026-10-29T18:28:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "scratch は Docker の予約語である。FROM のベースイメージとして使うと何のイメージも参照せず、自身の rootfs だけを含む最小イメージをゼロから構築する。本実践ではサードパーティの busybox ルートファイルシステムをダウンロードし、カスタム /etc/os-release を注入して再パッケージ化し、FROM scratch の Dockerfile と docker-compose を作成して Harbor レジストリへビルド・プッシュし、別ホストからプルしてコンテナを起動し、os-release とネットワークを検証する。"
---

# ベースイメージを指定せずに独自イメージを構築：scratch の活用

scratch は Docker の予約語である。FROM のベースイメージとして使うと何のイメージも参照せず、自身の rootfs だけを含む最小イメージをゼロから構築する。

## 1. サードパーティのルートファイルシステムをダウンロード

```bash
root@docker01:~# wget https://mirrors.tuna.tsinghua.edu.cn/lxc-images/images/busybox/1.38.0/amd64/default/20261028_06%3A00/rootfs.tar.xz
```

## 2. ルートファイルシステムの修正（カスタム os-release の注入）

busybox の rootfs にはデフォルトで `/etc/os-release` がない。コンテナで `cat /etc/os-release` を実行した際に出力があるように、展開後にカスタム内容を注入して再パッケージ化する:

```bash
root@docker01:~# cd /dawn/dockerfile/alpine/scratch
root@docker01:/dawn/dockerfile/alpine/scratch# mkdir -p rootfs && tar xf rootfs.tar.xz -C rootfs
root@docker01:/dawn/dockerfile/alpine/scratch# cat > rootfs/etc/os-release <<'EOF'
NAME="dawn"
VERSION="24.07 LTS (DAWN)"
ID=dawn_linux
PRETTY_NAME="Ubuntu 24.07.1 LTS"
VERSION_ID="24.07"
HOME_URL="https://lmdawn1127.github.io"
EOF
root@docker01:/dawn/dockerfile/alpine/scratch# cd rootfs && tar czf ../dawn-linux-rootfs.tar.gz . && cd ..
```

## 3. Dockerfile と docker-compose 設定の作成

```bash
root@docker01:/dawn/dockerfile/alpine/scratch# cat Dockerfile
# "scratch" は予約語であり、イメージそのものを "scratch" と名付けることはできない
# FROM で取り込むイメージが scratch になると、何のイメージも参照しないことを意味する
FROM scratch

MAINTAINER dawn

LABEL auther=dawn \
      school=czu \
      class=computer01

ONBUILD LABEL email=123456@dawn.com office=www.dawn.com

ADD dawn-linux-rootfs.tar.gz /

CMD ["tail","-f","/etc/hosts"]

root@docker01:/dawn/dockerfile/alpine/scratch# cat docker-compose.yaml
version: '3.8'

services:
   mysql-server:
     build:
       context: .
       dockerfile: Dockerfile
     image: harbor.dawn.com/dawn-linux/dawn:v0.1
     container_name: mylinux
```

## 4. イメージのビルドと Harbor レジストリへのプッシュ

```bash
root@docker01:/dawn/dockerfile/alpine/scratch# docker-compose build
[+] Building 1.0s (8/8) FINISHED
 => [internal] load build definition from Dockerfile
 => => transferring dockerfile: 342B
 => [internal] load .dockerignore
 => [internal] load metadata for scratch
 => [internal] load build context
 => => transferring context: 2.31MB
 => CACHED [1/2] ADD dawn-linux-rootfs.tar.gz /
 => CACHED [2/2] MAINTAINER dawn
 => exporting to image
 => => exporting layers
 => => writing image sha256:...

root@docker01:/dawn/dockerfile/alpine/scratch# docker login -u admin -p 1 harbor.dawn.com
WARNING! Using --password via the CLI is insecure. Use --password-stdin.
Login Succeeded

root@docker01:/dawn/dockerfile/alpine/scratch# docker tag harbor.dawn.com/dawn-linux/dawn:v0.1 11.0.1.121/dawn-linux/dawn:v0.1
root@docker01:/dawn/dockerfile/alpine/scratch# docker push 11.0.1.121/dawn-linux/dawn:v0.1
The push refers to repository [11.0.1.121/dawn-linux/dawn]
76b75a567f39: Pushed
v0.1: digest: sha256:0182c026d965ba278aad919fa08e56a1a4011ac3abc3ded21814b5bcba6b2ffc size: 527
```

## 5. Harbor レジストリからのイメージプルと起動テスト

```bash
root@docker02:~# docker pull 11.0.1.121/dawn-linux/dawn:v0.1
v0.1: Pulling from dawn-linux/dawn
Digest: sha256:0182c026d965ba278aad919fa08e56a1a4011ac3abc3ded21814b5bcba6b2ffc
Status: Downloaded newer image for 11.0.1.121/dawn-linux/dawn:v0.1

root@docker02:~# docker image ls 11.0.1.121/dawn-linux/dawn:v0.1
REPOSITORY                       TAG       IMAGE ID       CREATED              SIZE
11.0.1.121/dawn-linux/dawn       v0.1      8dba0e9f0b3d   33 minutes ago       2.36MB

root@docker02:~# docker run --rm -it 11.0.1.121/dawn-linux/dawn:v0.1 sh
~ # cat /etc/os-release
NAME="dawn"
VERSION="24.07 LTS (DAWN)"
ID=dawn_linux
PRETTY_NAME="Ubuntu 24.07.1 LTS"
VERSION_ID="24.07"
HOME_URL="https://lmdawn1127.github.io"
~ #
~ # ifconfig
eth0      Link encap:Ethernet  HWaddr 02:42:AC:11:00:02
          inet addr:172.17.0.2  Bcast:172.17.255.255  Mask:255.255.0.0
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
lo        Link encap:Local Loopback
          inet addr:127.0.0.1  Mask:255.0.0.0
          UP LOOPBACK RUNNING  MTU:65536  Metric:1
```

scratch イメージの構築に成功し、コンテナ内から注入した os-release とネットワークスタックに正常にアクセスできる。