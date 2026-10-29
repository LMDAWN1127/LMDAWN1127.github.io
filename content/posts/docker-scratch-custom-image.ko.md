---
title: "베이스 이미지 없이 커스텀 이미지 만들기: scratch 활용"
date: 2026-10-29T18:28:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "scratch 는 Docker 의 예약어이다. FROM 의 베이스 이미지로 사용하면 어떤 이미지도 참조하지 않고, 자체 rootfs 만 포함하는 최소 이미지를 처음부터 구성한다. 이 실습에서는 서드파티 busybox 루트 파일시스템을 다운로드하고, 커스텀 /etc/os-release 를 주입해 재패키징한 뒤 FROM scratch Dockerfile 과 docker-compose 를 작성해 Harbor 레지스트리로 빌드·푸시하고, 다른 호스트에서 풀하여 컨테이너를 시작한 뒤 os-release 와 네트워킹을 검증한다."
---

# 베이스 이미지 없이 커스텀 이미지 만들기: scratch 활용

scratch 는 Docker 의 예약어이다. FROM 의 베이스 이미지로 사용하면 어떤 이미지도 참조하지 않고, 자체 rootfs 만 포함하는 최소 이미지를 처음부터 구성한다.

## 1. 서드파티 루트 파일시스템 다운로드

```bash
root@docker01:~# wget https://mirrors.tuna.tsinghua.edu.cn/lxc-images/images/busybox/1.38.0/amd64/default/20261028_06%3A00/rootfs.tar.xz
```

## 2. 루트 파일시스템 수정（커스텀 os-release 주입）

busybox rootfs 에는 기본적으로 `/etc/os-release` 가 없다. 컨테이너에서 `cat /etc/os-release` 실행 시 출력이 나오도록, 압축 해제 후 커스텀 내용을 주입하고 재패키징한다:

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

## 3. Dockerfile 과 docker-compose 설정 작성

```bash
root@docker01:/dawn/dockerfile/alpine/scratch# cat Dockerfile
# "scratch" 는 예약어이므로, 이미지 자체를 "scratch" 라고 이름 붙일 수 없다
# FROM 로 가져오는 이미지가 scratch 이면, 어떤 이미지도 참조하지 않음을 의미한다
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

## 4. 이미지 빌드 및 Harbor 레지스트리로 푸시

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

## 5. Harbor 레지스트리에서 이미지 풀 및 시작 테스트

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

scratch 이미지 빌드에 성공했으며, 컨테이너 내에서 주입한 os-release 와 네트워크 스택에 정상적으로 접근할 수 있다.