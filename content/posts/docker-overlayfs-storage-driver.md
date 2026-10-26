---
title: "Docker 实战：OverlayFS 联合挂载与存储驱动解析"
date: 2026-10-26T21:00:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Docker 存储驱动 OverlayFS 原理：lower/upper/work 与 LowerDir/Upperdir/MergedDir 三层（含 init 层）、写时复制到读写层；并手动 mount -t overlay 演示分层与只读，最后用 docker run 印证容器底层即 overlay2。"
---

# Docker 实战：OverlayFS 联合挂载与存储驱动解析

## 1. OverlayFS 概述

OverlayFS是一种堆叠文件系统,它依赖并建立在其它的文件系统之上(例如ext4fs和xfs等),并不直接参与磁盘空间结构的划分,仅仅将原来系统文件中的文件或者目录进行"合并一起",最后向用户展示"合并"的文件是在同一级的目录, 这就是联合挂载技术, 相对于AUFS (<1.12 早期使用的存储技术), OverlayFS速度更快,实现更简单。

Linux内核为Docker提供的OverlayFS驱动有两种:Overlay和Overlay2。而Overlay2是相对于Overlay的一种改进,在Inode利用率方面比Overlay更有效。

但是Overlay有环境需求:

(1)Docker版本17.06.02+;

(2)宿主机文件系统需要是EXT4或XFS格式。

OverlayFS实现方式:

OverlayFS通过三个目录:lower目录、upper目录、以及work目录实现。

lower:

一般对应的是只读数据。

upper:

可以进行读写操作的目录。

work:

目录为工作基础目录,挂载后会自动创建一个work子目录(实际测试手动卸载后该目录并不会被删除)

该目录主要是存储一些临时存放的结果或中间数据的工作目录。

在使用过程中其内容用户不可见，最后联合挂载完成给用户呈现的统一视图称为merged目录。

OverlayFS结构分为三个层: LowerDir、Upperdir、MergedDir

### LowerDir (只读)

只读的image layer，实际上就是rootfs。

在使用Dockfile构建镜像的时候, Image Layer可以分很多层,所以对应的lowerdir会很多(源镜像)。

Lower 包括两个层:

(1)系统的init

```bash
1. 容器在启动以后, 默认情况下lower层是不能够修改内容的, 但是用户有需求需要修改主机名与域名地址, 那么就需要添加init层中的文件(hostname, resolv.conf，hosts，mtab等文件), 用于解决此类问题；
2. 修改的内容只对当前的容器生效, 而在docker commit提交为镜像时候，并不会将init层提交；
3. init文件存放的目录为/var/lib/docker/overlay2/<init_id>/diff
```

(2)容器的镜像层

不可修改的数据。

### Upperdir (读写)

upperdir则是在lowerdir之上的一层, 为读写层。容器在启动的时候会创建, 所有对容器的修改, 都是在这层。比如容器启动写入的日志文件，或者是应用程序写入的临时文件。

### MergedDir (展示)

merged目录是容器的挂载点,在用户视角能够看到的所有文件，都是从这层展示的。

## 2. OverlayFS 案例

### 2.1 创建工作目录

```bash
root@docker02:~# mkdir -pv /dawn/lower{0..2} /dawn/{uppper,work,merged}
mkdir: created directory '/dawn/lower0'
mkdir: created directory '/dawn/lower1'
mkdir: created directory '/dawn/lower2'
mkdir: created directory '/dawn/uppper'
mkdir: created directory '/dawn/work'
mkdir: created directory '/dawn/merged'
```

### 2.2 挂载文件系统

```bash
root@docker02:~# mount -t overlay overlay -o lowerdir=/dawn/lower0:/dawn/lower1:/dawn/lower2,upperdir=/dawn/uppper,workdir=/dawn/work  /dawn/merged/
```

### 2.3 查看挂载信息

```bash
root@docker02:~# df -h -t overlay
Filesystem      Size  Used Avail Use% Mounted on
overlay          48G   12G   34G  26% /dawn/merged
```

### 2.4 尝试在lower层写入准备初始数据

```bash
root@docker02:~# ll /dawn/ -R
/dawn/:
total 44
drwxr-xr-x  9 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 21 root root 4096 Oct 26 12:47 ../
-rw-r--r--  1 root root    0 Oct 26 06:57 c1.log
-rw-r--r--  1 root root    0 Oct 26 06:57 c2.log
-rw-r--r--  1 root root    6 Oct 26 05:54 index.html
drwxr-xr-x  2 root root 4096 Oct 26 12:48 lower0/
drwxr-xr-x  2 root root 4096 Oct 26 12:48 lower1/
drwxr-xr-x  2 root root 4096 Oct 26 12:48 lower2/
drwxr-xr-x  1 root root 4096 Oct 26 12:48 merged/
-rw-r--r--  1 root root  386 Oct 26 06:56 os-release
drwxr-xr-x  4 root root 4096 Oct 23 04:52 softwares/
drwxr-xr-x  2 root root 4096 Oct 26 12:48 uppper/
drwxr-xr-x  3 root root 4096 Oct 26 12:48 work/

/dawn/lower0:
total 8
drwxr-xr-x 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../

/dawn/lower1:
total 8
drwxr-xr-x 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../

/dawn/lower2:
total 8
drwxr-xr-x 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../

/dawn/merged:
total 8
drwxr-xr-x 1 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../

/dawn/softwares:
total 162084
drwxr-xr-x 4 root root      4096 Oct 23 04:52 ./
drwxr-xr-x 9 root root      4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root 165949725 Oct 23 04:52 dawn-autoinstall-docker-docker-compose.tar.gz
drwxrwxr-x 2 dawn dawn      4096 Oct 23 04:52 docker/
drwxr-xr-x 2 root root      4096 Oct 22 11:15 download/
-rwxr-xr-x 1 root root      3429 Oct 22 11:19 install-docker.sh*

/dawn/softwares/docker:
total 255820
drwxrwxr-x 2 dawn dawn     4096 Oct 23 04:52 ./
drwxr-xr-x 4 root root     4096 Oct 23 04:52 ../
-rwxr-xr-x 1 dawn dawn 39161856 Jun 29  2024 containerd*
-rwxr-xr-x 1 dawn dawn 12496896 Jun 29  2024 containerd-shim-runc-v2*
-rwxr-xr-x 1 dawn dawn 19361792 Jun 29  2024 ctr*
-rwxr-xr-x 1 dawn dawn 38498840 Jun 29  2024 docker*
-rwxr-xr-x 1 root root 63160172 Oct 23 04:52 docker-compose*
-rwxr-xr-x 1 dawn dawn 71298872 Jun 29  2024 dockerd*
-rwxr-xr-x 1 dawn dawn   708448 Jun 29  2024 docker-init*
-rwxr-xr-x 1 dawn dawn  1979949 Jun 29  2024 docker-proxy*
-rwxr-xr-x 1 dawn dawn 15275560 Jun 29  2024 runc*

/dawn/softwares/download:
total 133908
drwxr-xr-x 2 root root     4096 Oct 22 11:15 ./
drwxr-xr-x 4 root root     4096 Oct 23 04:52 ../
-rw-r--r-- 1 root root       59 Oct 22 11:31 daemon.json
-rw-r--r-- 1 root root   117176 Jun  7  2023 docker
-rw-r--r-- 1 root root 73823487 Jul  3  2024 docker-27.0.3.tgz
-rwxr-xr-x 1 root root 63160172 Jul 17  2024 docker-compose-v2.29.0*
-rw-r--r-- 1 root root      227 Jun  7  2023 docker.service

/dawn/uppper:
total 8
drwxr-xr-x 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../

/dawn/work:
total 12
drwxr-xr-x 3 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
d--------- 2 root root 4096 Oct 26 12:48 work/

/dawn/work/work:
total 8
d--------- 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 3 root root 4096 Oct 26 12:48 ../
root@docker02:~# cp /etc/hosts /dawn/lower0/
root@docker02:~# cp /etc/issue /dawn/lower1/
root@docker02:~# cp /etc/resolv.conf /dawn/lower2/
root@docker02:~# ll /dawn/ -R
/dawn/:
total 44
drwxr-xr-x  9 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 21 root root 4096 Oct 26 12:47 ../
-rw-r--r--  1 root root    0 Oct 26 06:57 c1.log
-rw-r--r--  1 root root    0 Oct 26 06:57 c2.log
-rw-r--r--  1 root root    6 Oct 26 05:54 index.html
drwxr-xr-x  2 root root 4096 Oct 26 12:48 lower0/
drwxr-xr-x  2 root root 4096 Oct 26 12:49 lower1/
drwxr-xr-x  2 root root 4096 Oct 26 12:49 lower2/
drwxr-xr-x  1 root root 4096 Oct 26 12:48 merged/
-rw-r--r--  1 root root  386 Oct 26 06:56 os-release
drwxr-xr-x  4 root root 4096 Oct 23 04:52 softwares/
drwxr-xr-x  2 root root 4096 Oct 26 12:48 uppper/
drwxr-xr-x  3 root root 4096 Oct 26 12:48 work/

/dawn/lower0:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root  223 Oct 26 12:48 hosts

/dawn/lower1:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root   26 Oct 26 12:49 issue

/dawn/lower2:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root  920 Oct 26 12:49 resolv.conf

/dawn/merged:
total 20
drwxr-xr-x 1 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root  223 Oct 26 12:48 hosts
-rw-r--r-- 1 root root   26 Oct 26 12:49 issue
-rw-r--r-- 1 root root  920 Oct 26 12:49 resolv.conf

/dawn/softwares:
total 162084
drwxr-xr-x 4 root root      4096 Oct 23 04:52 ./
drwxr-xr-x 9 root root      4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root 165949725 Oct 23 04:52 dawn-autoinstall-docker-docker-compose.tar.gz
drwxrwxr-x 2 dawn dawn      4096 Oct 23 04:52 docker/
drwxr-xr-x 2 root root      4096 Oct 22 11:15 download/
-rwxr-xr-x 1 root root      3429 Oct 22 11:19 install-docker.sh*

/dawn/softwares/docker:
total 255820
drwxrwxr-x 2 dawn dawn     4096 Oct 23 04:52 ./
drwxr-xr-x 4 root root     4096 Oct 23 04:52 ../
-rwxr-xr-x 1 dawn dawn 39161856 Jun 29  2024 containerd*
-rwxr-xr-x 1 dawn dawn 12496896 Jun 29  2024 containerd-shim-runc-v2*
-rwxr-xr-x 1 dawn dawn 19361792 Jun 29  2024 ctr*
-rwxr-xr-x 1 dawn dawn 38498840 Jun 29  2024 docker*
-rwxr-xr-x 1 root root 63160172 Oct 23 04:52 docker-compose*
-rwxr-xr-x 1 dawn dawn 71298872 Jun 29  2024 dockerd*
-rwxr-xr-x 1 dawn dawn   708448 Jun 29  2024 docker-init*
-rwxr-xr-x 1 dawn dawn  1979949 Jun 29  2024 docker-proxy*
-rwxr-xr-x 1 dawn dawn 15275560 Jun 29  2024 runc*

/dawn/softwares/download:
total 133908
drwxr-xr-x 2 root root     4096 Oct 22 11:15 ./
drwxr-xr-x 4 root root     4096 Oct 23 04:52 ../
-rw-r--r-- 1 root root       59 Oct 22 11:31 daemon.json
-rw-r--r-- 1 root root   117176 Jun  7  2023 docker
-rw-r--r-- 1 root root 73823487 Jul  3  2024 docker-27.0.3.tgz
-rwxr-xr-x 1 root root 63160172 Jul 17  2024 docker-compose-v2.29.0*
-rw-r--r-- 1 root root      227 Jun  7  2023 docker.service

/dawn/uppper:
total 8
drwxr-xr-x 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../

/dawn/work:
total 12
drwxr-xr-x 3 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
d--------- 2 root root 4096 Oct 26 12:48 work/

/dawn/work/work:
total 8
d--------- 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 3 root root 4096 Oct 26 12:48 ../
```

### 2.5 尝试在upper层写入准备初始数据

```bash
root@docker02:~# cp /etc/hostname /dawn/uppper/
root@docker02:~# ll /dawn/ -R
/dawn/:
total 44
drwxr-xr-x  9 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 21 root root 4096 Oct 26 12:47 ../
-rw-r--r--  1 root root    0 Oct 26 06:57 c1.log
-rw-r--r--  1 root root    0 Oct 26 06:57 c2.log
-rw-r--r--  1 root root    6 Oct 26 05:54 index.html
drwxr-xr-x  2 root root 4096 Oct 26 12:48 lower0/
drwxr-xr-x  2 root root 4096 Oct 26 12:49 lower1/
drwxr-xr-x  2 root root 4096 Oct 26 12:49 lower2/
drwxr-xr-x  1 root root 4096 Oct 26 12:49 merged/
-rw-r--r--  1 root root  386 Oct 26 06:56 os-release
drwxr-xr-x  4 root root 4096 Oct 23 04:52 softwares/
drwxr-xr-x  2 root root 4096 Oct 26 12:49 uppper/
drwxr-xr-x  3 root root 4096 Oct 26 12:48 work/

/dawn/lower0:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root  223 Oct 26 12:48 hosts

/dawn/lower1:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root   26 Oct 26 12:49 issue

/dawn/lower2:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root  920 Oct 26 12:49 resolv.conf

/dawn/merged:
total 24
drwxr-xr-x 1 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root    9 Oct 26 12:49 hostname
-rw-r--r-- 1 root root  223 Oct 26 12:48 hosts
-rw-r--r-- 1 root root   26 Oct 26 12:49 issue
-rw-r--r-- 1 root root  920 Oct 26 12:49 resolv.conf

/dawn/softwares:
total 162084
drwxr-xr-x 4 root root      4096 Oct 23 04:52 ./
drwxr-xr-x 9 root root      4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root 165949725 Oct 23 04:52 dawn-autoinstall-docker-docker-compose.tar.gz
drwxrwxr-x 2 dawn dawn      4096 Oct 23 04:52 docker/
drwxr-xr-x 2 root root      4096 Oct 22 11:15 download/
-rwxr-xr-x 1 root root      3429 Oct 22 11:19 install-docker.sh*

/dawn/softwares/docker:
total 255820
drwxrwxr-x 2 dawn dawn     4096 Oct 23 04:52 ./
drwxr-xr-x 4 root root     4096 Oct 23 04:52 ../
-rwxr-xr-x 1 dawn dawn 39161856 Jun 29  2024 containerd*
-rwxr-xr-x 1 dawn dawn 12496896 Jun 29  2024 containerd-shim-runc-v2*
-rwxr-xr-x 1 dawn dawn 19361792 Jun 29  2024 ctr*
-rwxr-xr-x 1 dawn dawn 38498840 Jun 29  2024 docker*
-rwxr-xr-x 1 root root 63160172 Oct 23 04:52 docker-compose*
-rwxr-xr-x 1 dawn dawn 71298872 Jun 29  2024 dockerd*
-rwxr-xr-x 1 dawn dawn   708448 Jun 29  2024 docker-init*
-rwxr-xr-x 1 dawn dawn  1979949 Jun 29  2024 docker-proxy*
-rwxr-xr-x 1 dawn dawn 15275560 Jun 29  2024 runc*

/dawn/softwares/download:
total 133908
drwxr-xr-x 2 root root     4096 Oct 22 11:15 ./
drwxr-xr-x 4 root root     4096 Oct 23 04:52 ../
-rw-r--r-- 1 root root       59 Oct 22 11:31 daemon.json
-rw-r--r-- 1 root root   117176 Jun  7  2023 docker
-rw-r--r-- 1 root root 73823487 Jul  3  2024 docker-27.0.3.tgz
-rwxr-xr-x 1 root root 63160172 Jul 17  2024 docker-compose-v2.29.0*
-rw-r--r-- 1 root root      227 Jun  7  2023 docker.service

/dawn/uppper:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root    9 Oct 26 12:49 hostname

/dawn/work:
total 12
drwxr-xr-x 3 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
d--------- 2 root root 4096 Oct 26 12:48 work/

/dawn/work/work:
total 8
d--------- 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 3 root root 4096 Oct 26 12:48 ../
```

### 2.6 尝试在merged目录写入数据，观察数据实际写入的应该是upper层

```bash
root@docker02:~# cp /etc/fstab /dawn/merged/
root@docker02:~# ll /dawn/ -R
/dawn/:
total 44
drwxr-xr-x  9 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 21 root root 4096 Oct 26 12:47 ../
-rw-r--r--  1 root root    0 Oct 26 06:57 c1.log
-rw-r--r--  1 root root    0 Oct 26 06:57 c2.log
-rw-r--r--  1 root root    6 Oct 26 05:54 index.html
drwxr-xr-x  2 root root 4096 Oct 26 12:48 lower0/
drwxr-xr-x  2 root root 4096 Oct 26 12:49 lower1/
drwxr-xr-x  2 root root 4096 Oct 26 12:49 lower2/
drwxr-xr-x  1 root root 4096 Oct 26 12:49 merged/
-rw-r--r--  1 root root  386 Oct 26 06:56 os-release
drwxr-xr-x  4 root root 4096 Oct 23 04:52 softwares/
drwxr-xr-x  2 root root 4096 Oct 26 12:49 uppper/
drwxr-xr-x  3 root root 4096 Oct 26 12:48 work/

/dawn/lower0:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root  223 Oct 26 12:48 hosts

/dawn/lower1:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root   26 Oct 26 12:49 issue

/dawn/lower2:
total 12
drwxr-xr-x 2 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root  920 Oct 26 12:49 resolv.conf

/dawn/merged:
total 28
drwxr-xr-x 1 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root  657 Oct 26 12:49 fstab
-rw-r--r-- 1 root root    9 Oct 26 12:49 hostname
-rw-r--r-- 1 root root  223 Oct 26 12:48 hosts
-rw-r--r-- 1 root root   26 Oct 26 12:49 issue
-rw-r--r-- 1 root root  920 Oct 26 12:49 resolv.conf

/dawn/softwares:
total 162084
drwxr-xr-x 4 root root      4096 Oct 23 04:52 ./
drwxr-xr-x 9 root root      4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root 165949725 Oct 23 04:52 dawn-autoinstall-docker-docker-compose.tar.gz
drwxrwxr-x 2 dawn dawn      4096 Oct 23 04:52 docker/
drwxr-xr-x 2 root root      4096 Oct 22 11:15 download/
-rwxr-xr-x 1 root root      3429 Oct 22 11:19 install-docker.sh*

/dawn/softwares/docker:
total 255820
drwxrwxr-x 2 dawn dawn     4096 Oct 23 04:52 ./
drwxr-xr-x 4 root root     4096 Oct 23 04:52 ../
-rwxr-xr-x 1 dawn dawn 39161856 Jun 29  2024 containerd*
-rwxr-xr-x 1 dawn dawn 12496896 Jun 29  2024 containerd-shim-runc-v2*
-rwxr-xr-x 1 dawn dawn 19361792 Jun 29  2024 ctr*
-rwxr-xr-x 1 dawn dawn 38498840 Jun 29  2024 docker*
-rwxr-xr-x 1 root root 63160172 Oct 23 04:52 docker-compose*
-rwxr-xr-x 1 dawn dawn 71298872 Jun 29  2024 dockerd*
-rwxr-xr-x 1 dawn dawn   708448 Jun 29  2024 docker-init*
-rwxr-xr-x 1 dawn dawn  1979949 Jun 29  2024 docker-proxy*
-rwxr-xr-x 1 dawn dawn 15275560 Jun 29  2024 runc*

/dawn/softwares/download:
total 133908
drwxr-xr-x 2 root root     4096 Oct 22 11:15 ./
drwxr-xr-x 4 root root     4096 Oct 23 04:52 ../
-rw-r--r-- 1 root root       59 Oct 22 11:31 daemon.json
-rw-r--r-- 1 root root   117176 Jun  7  2023 docker
-rw-r--r-- 1 root root 73823487 Jul  3  2024 docker-27.0.3.tgz
-rwxr-xr-x 1 root root 63160172 Jul 17  2024 docker-compose-v2.29.0*
-rw-r--r-- 1 root root      227 Jun  7  2023 docker.service

/dawn/uppper:
total 16
drwxr-xr-x 2 root root 4096 Oct 26 12:49 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
-rw-r--r-- 1 root root  657 Oct 26 12:49 fstab
-rw-r--r-- 1 root root    9 Oct 26 12:49 hostname

/dawn/work:
total 12
drwxr-xr-x 3 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 9 root root 4096 Oct 26 12:48 ../
d--------- 2 root root 4096 Oct 26 12:48 work/

/dawn/work/work:
total 8
d--------- 2 root root 4096 Oct 26 12:48 ./
drwxr-xr-x 3 root root 4096 Oct 26 12:48 ../
```

### 2.7 重新挂载，但不挂载upperdir层

```bash
root@docker02:~# umount /dawn/merged
root@docker02:~# mount -t overlay overlay -o lowerdir=/dawn/lower0:/dawn/lower1:/dawn/lower2,workdir=/dawn/work  /dawn/merged/
```

### 2.8 再次尝试写入数据失败，因为没有写层

```bash
root@docker02:~# cp /etc/os-release /dawn/merged/
cp: cannot create regular file '/dawn/merged/os-release': Read-only file system
```

## 3. Docker 底层用到了 OverlayFS

```bash
root@docker02:~# df -h -t overlay
Filesystem      Size  Used Avail Use% Mounted on
overlay          48G   12G   34G  26% /dawn/merged
root@docker02:~# docker run -d --name c1 uhub.service.ucloud.cn/dawn/apps:v1
d751a64952e703e04b3ca48bb4e4a757d9cf561ae2fb7883956e9c097c793569
root@docker02:~# df -h -t overlay
Filesystem      Size  Used Avail Use% Mounted on
overlay          48G   12G   34G  26% /dawn/merged
overlay          48G   12G   34G  26% /var/lib/docker/overlay2/4caa5a766db16e592c81cb35256dbb25ca98797e2251b6f5b782c2725541c563/merged
root@docker02:~# docker inspect -f "{{.GraphDriver.Data.MergedDir}}" c1
/var/lib/docker/overlay2/4caa5a766db16e592c81cb35256dbb25ca98797e2251b6f5b782c2725541c563/merged
root@docker02:~# docker inspect -f "{{.GraphDriver.Data.UpperDir}}" c1
/var/lib/docker/overlay2/4caa5a766db16e592c81cb35256dbb25ca98797e2251b6f5b782c2725541c563/diff
root@docker02:~# docker exec c1 touch /haha.log  # 完成写的操作
root@docker02:~# ls /var/lib/docker/overlay2/4caa5a766db16e592c81cb35256dbb25ca98797e2251b6f5b782c2725541c563/diff  # 很明显，数据被写入到读写层
etc  haha.log  run  var
root@docker02:~# ls /var/lib/docker/overlay2/4caa5a766db16e592c81cb35256dbb25ca98797e2251b6f5b782c2725541c563/merged/
bin  docker-entrypoint.d   etc       home  media  opt   root  sbin  sys  usr
dev  docker-entrypoint.sh  haha.log  lib   mnt    proc  run   srv   tmp  var
root@docker02:~# chroot /var/lib/docker/overlay2/4caa5a766db16e592c81cb35256dbb25ca98797e2251b6f5b782c2725541c563/merged /bin/sh
/ # ls /
bin                   haha.log              opt                   srv
dev                   home                  proc                  sys
docker-entrypoint.d   lib                   root                  tmp
docker-entrypoint.sh  media                 run                   usr
etc                   mnt                   sbin                  var
/ #
```
