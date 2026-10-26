---
title: "Docker 实战：从 chroot 手搓最小容器根，理解容器本质"
date: 2026-10-26T19:50:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "不用 Docker 命令，用 chroot 从零手搓最小容器根（拷贝 bash 与动态库依赖），直观理解文件系统隔离的容器本质；并演示双根目录隔离与 chroot 进真实容器 overlay2 文件系统。"
---

# Docker 实战：从 chroot 手搓最小容器根，理解容器本质

本文不堆 Docker 命令，而是退到更底层——用 `chroot` 从零手搓一个最小容器根（拷贝 bash 及其动态库依赖链），直观感受文件系统隔离的「容器感」；再用两个独立根目录演示进程/数据互不可见，最后直接 `chroot` 钻进真实 Docker 容器的 overlay2 merged 文件系统修文件、看日志。

## 1. 创建工作目录

```bash
root@docker02:~# mkdir -pv dawn-dawn/bin dawn-dawn/lib dawn-dawn/lib64
mkdir: created directory 'dawn-dawn/bin'
mkdir: created directory 'dawn-dawn/lib'
mkdir: created directory 'dawn-dawn/lib64'
```

## 2. 拷贝bash及其依赖环境

**先看 bash 依赖什么**

```bash
root@docker02:~# ldd /bin/bash
	linux-vdso.so.1 (0x00007ffefd1f3000)
	libtinfo.so.6 => /lib/x86_64-linux-gnu/libtinfo.so.6 (0x00007ff773e35000)
	libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x00007ff773c0c000)
	/lib64/ld-linux-x86-64.so.2 (0x00007ff773fcf000)
```

ldd 列出的是动态库依赖链：bash 自己不动，但它调用 readline 要 libtinfo，printf/malloc 要 libc，而加载这一切的是 ld-linux（动态链接器，内核启动 ELF 时第一个加载它，没有它连 bash 都起不来）。

**按依赖拷贝**

```bash
root@docker02:~# cp /bin/bash dawn-dawn/bin/
root@docker02:~# cp /lib/x86_64-linux-gnu/libtinfo.so.6 dawn-dawn/lib/
root@docker02:~# cp /lib/x86_64-linux-gnu/libc.so.6 dawn-dawn/lib/
root@docker02:~# cp /lib64/ld-linux-x86-64.so.2 dawn-dawn/lib64/
```

## 3. 拷贝 ls 及其依赖环境（含传递依赖）

```bash
root@docker02:~# cp /usr/bin/ls dawn-dawn/bin/
root@docker02:~# ldd dawn-dawn/bin/ls
	linux-vdso.so.1
	libselinux.so.1 => /lib/x86_64-linux-gnu/libselinux.so.1
	libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6
	libpcre2-8.so.0 => /lib/x86_64-linux-gnu/libpcre2-8.so.0
	libdl.so.2 => /lib/x86_64-linux-gnu/libdl.so.2
	libpthread.so.0 => /lib/x86_64-linux-gnu/libpthread.so.0
	/lib64/ld-linux-x86-64.so.2
```

libselinux 又拖着 libpcre2、libc——依赖是会传递的，漏一个的结果就是 chroot 后报：

```bash
bash: /usr/bin/ls: error while loading shared libraries: libselinux.so.1: cannot open shared object file
```

```bash
root@docker02:~# cp /lib/x86_64-linux-gnu/libselinux.so.1 dawn-dawn/lib/
root@docker02:~# cp /lib/x86_64-linux-gnu/libpcre2-8.so.0 dawn-dawn/lib/
root@docker02:~# cp /lib/x86_64-linux-gnu/libdl.so.2 dawn-dawn/lib/
root@docker02:~# cp /lib/x86_64-linux-gnu/libpthread.so.0 dawn-dawn/lib/
root@docker02:~# cp -f /lib64/ld-linux-x86-64.so.2 dawn-dawn/lib64/
```

## 4. 改变根目录（chroot）

```bash
root@docker02:~# chroot dawn-dawn/ /bin/bash -c 'for i in haha xixi; do echo $i; done'
haha
xixi
```

进去之后，这个 bash 眼里的 / 就是 dawn-dawn/

```bash
root@docker02:~# chroot dawn-dawn/ /bin/bash -c 'ls -l /'
total 12
drwxr-xr-x 2 0 0 4096 Oct 26 08:59 bin
drwxr-xr-x 2 0 0 4096 Oct 26 09:00 lib
drwxr-xr-x 2 0 0 4096 Oct 26 08:50 lib64
```

宿主机上几十个目录，这里只剩三个——这就是"容器感"的最原始形态

## 5. 双容器隔离演示

复制一份环境，得到两个独立的容器根

```bash
root@docker02:~# cp -r dawn-dawn dawn-dawn01
```

**容器 1**（终端 1）：进 dawn-dawn，在"自己的 /"里建文件

```bash
root@docker02:~# chroot dawn-dawn/ /bin/bash -c 'echo haha > /haha.txt; ls -l /'
total 16
drwxr-xr-x 2 0 0 4096 Oct 26 08:59 bin
-rw-r--r-- 1 0 0    5 Oct 26 09:09 haha.txt
drwxr-xr-x 2 0 0 4096 Oct 26 09:00 lib
drwxr-xr-x 2 0 0 4096 Oct 26 08:50 lib64
```

**容器 2**（终端 2）：进 dawn-dawn01，同样操作

```bash
root@docker02:~# chroot dawn-dawn01/ /bin/bash -c 'echo xixi > /xixi.log; ls /'
bin
lib
lib64
xixi.log
```

**宿主机视角验证**——两个"容器"互相看不见对方的数据，而且宿主机根目录也看不到它们

```bash
root@docker02:~# ls /root/dawn-dawn/
bin  haha.txt  lib  lib64
root@docker02:~# ls /root/dawn-dawn01/
bin  lib  lib64  xixi.log
root@docker02:~# ls / | grep -E 'haha|xixi'
（无输出）
```

## 6. chroot 进 Docker 容器的文件系统

chroot 的用武之地不止玩具目录——可以直接"钻进"一个真实 Docker 容器的文件系统。容器的根就是宿主机的 /var/lib/docker/overlay2/<id>/merged

```bash
root@docker02:~# docker run -d --name c-chroot uhub.service.ucloud.cn/dawn/apps:v1
root@docker02:~# docker exec c-chroot touch /haha.log
root@docker02:~# docker inspect -f '{{.GraphDriver.Data.MergedDir}}' c-chroot
/var/lib/docker/overlay2/dfe2e54e4db540e275ceac6f8a74a5c4cbd56554e47989effe6e588298dba3bf/merged
root@docker02:~# chroot /var/lib/docker/overlay2/dfe2e54e4db540e275ceac6f8a74a5c4cbd56554e47989effe6e588298dba3bf/merged /bin/sh -c 'ls -l /haha.log; ls / | head -8'
-rw-r--r--    1 root     root             0 Oct 26 09:10 /haha.log
bin
dev
docker-entrypoint.d
docker-entrypoint.sh
etc
haha.log
home
lib
```

容器起不来/没有 shell 时，可以从宿主机 chroot 进它的 merged 目录直接修文件、看日志。