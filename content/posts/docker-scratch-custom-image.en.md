---
title: "Building a Custom Image Without a Base Image: Using scratch"
date: 2026-10-29T18:28:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "scratch is a reserved name in Docker; when used as the base image in FROM it means no image is referenced, building a minimal image that contains only its own rootfs from scratch. This hands-on walkthrough downloads a third-party busybox root filesystem, injects a custom /etc/os-release, repackages it, writes a FROM scratch Dockerfile and docker-compose, builds and pushes the image to a Harbor registry, then pulls it from another host, starts the container, and verifies os-release and networking."
---

# Building a Custom Image Without a Base Image: Using scratch

scratch is a reserved name in Docker; used as the base image in FROM it means no image is referenced, building a minimal image that contains only its own rootfs from scratch.

## 1. Downloading a Third-Party Root Filesystem

```bash
root@docker01:~# wget https://mirrors.tuna.tsinghua.edu.cn/lxc-images/images/busybox/1.38.0/amd64/default/20261028_06%3A00/rootfs.tar.xz
```

## 2. Modifying the Root Filesystem (Injecting a Custom os-release)

The busybox rootfs has no `/etc/os-release` by default. To make the container produce output when running `cat /etc/os-release`, inject custom content after extracting and then repackage:

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

## 3. Writing the Dockerfile and docker-compose Configuration

```bash
root@docker01:/dawn/dockerfile/alpine/scratch# cat Dockerfile
# "scratch" is a reserved name; the image itself cannot be named "scratch"
# Once the image imported by FROM is scratch, it means no image is referenced
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

## 4. Building and Pushing the Image to the Harbor Registry

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

## 5. Pulling the Image from the Harbor Registry and Starting a Test

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

The scratch image was built successfully; inside the container the injected os-release and network stack are accessible normally.