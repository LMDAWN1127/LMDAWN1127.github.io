---
title: "不指定基础镜像实现自定义镜像scratch"
date: 2026-10-29T18:28:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "scratch 是 Docker 的保留名称，作为 FROM 的基础镜像时表示不引用任何镜像，从零构建一个仅含自身 rootfs 的最小镜像。本文实战演示：下载第三方 busybox 根文件系统，注入自定义 /etc/os-release 后重新打包，编写 FROM scratch 的 Dockerfile 与 docker-compose，构建并推送到 Harbor 仓库，再从另一台主机拉取镜像、启动容器并验证 os-release 与网络。"
---

# 不指定基础镜像实现自定义镜像scratch

scratch是Docker 的保留名称，作为FROM的基础镜像表示不引用任何镜像，从零开始构建一个仅含自己rootfs的最小镜像。

## 1. 下载第三方的根文件系统

```bash
root@docker01:~# wget https://mirrors.tuna.tsinghua.edu.cn/lxc-images/images/busybox/1.38.0/amd64/default/20261028_06%3A00/rootfs.tar.xz
```

## 2. 修改根文件系统文件（注入自定义os-release）

busybox rootfs 默认没有 `/etc/os-release`，为让容器验证 `cat /etc/os-release` 有输出，解压后注入自定义内容再重新打包：

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

## 3. 编写 Dockerfile 与 docker-compose 配置

```bash
root@docker01:/dawn/dockerfile/alpine/scratch# cat Dockerfile
# "scratch"是保留名称，即镜像的名称不能叫"scratch"
# 一旦FROM指令导入的镜像为scratch，则表示不引用任何镜像
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

## 4. 构建并推送镜像到 harbor 仓库

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

## 5. 从 harbor 仓库拉取镜像并启动测试

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

scratch 镜像构建成功，容器内能正常访问注入的 os-release 和网络栈。