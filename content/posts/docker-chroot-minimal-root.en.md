---
title: "Docker in Practice: Hand-Building a Minimal Container Root with chroot to Understand What a Container Is"
date: 2026-10-26T19:50:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Without Docker commands, use chroot to hand-build a minimal container root from scratch (copying bash and its dynamic-library chain) to feel filesystem isolation; then show two independent roots make processes/data invisible to each other, and finally chroot into a real container's overlay2 merged filesystem to fix files and read logs."
---

# Docker in Practice: Hand-Building a Minimal Container Root with chroot to Understand What a Container Is

This article skips piling up Docker commands and goes a level lower - using `chroot` to hand-build a minimal container root from scratch (copying bash and its dynamic-library dependency chain) to get an intuitive feel for the filesystem-isolation 'container sensation'; then uses two independent root directories to show processes/data are invisible to each other, and finally `chroot` directly into a real Docker container's overlay2 merged filesystem to fix files and read logs.

## 1. Create the working directory

```bash
root@docker02:~# mkdir -pv dawn-dawn/bin dawn-dawn/lib dawn-dawn/lib64
mkdir: created directory 'dawn-dawn/bin'
mkdir: created directory 'dawn-dawn/lib'
mkdir: created directory 'dawn-dawn/lib64'
```

## 2. Copy bash and its dependency environment

**First, see what bash depends on**

```bash
root@docker02:~# ldd /bin/bash
	linux-vdso.so.1 (0x00007ffefd1f3000)
	libtinfo.so.6 => /lib/x86_64-linux-gnu/libtinfo.so.6 (0x00007ff773e35000)
	libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x00007ff773c0c000)
	/lib64/ld-linux-x86-64.so.2 (0x00007ff773fcf000)
```

ldd lists the dynamic-library dependency chain: bash itself does not move, but it calls readline which needs libtinfo, printf/malloc need libc, and it is ld-linux (the dynamic linker, the first thing the kernel loads when starting an ELF) that loads all of this - without it even bash cannot start.

**Copy according to the dependencies**

```bash
root@docker02:~# cp /bin/bash dawn-dawn/bin/
root@docker02:~# cp /lib/x86_64-linux-gnu/libtinfo.so.6 dawn-dawn/lib/
root@docker02:~# cp /lib/x86_64-linux-gnu/libc.so.6 dawn-dawn/lib/
root@docker02:~# cp /lib64/ld-linux-x86-64.so.2 dawn-dawn/lib64/
```

## 3. Copy ls and its dependency environment (including transitive dependencies)

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

libselinux in turn pulls in libpcre2 and libc - dependencies are transitive, and missing one results in the following error after chroot:

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

## 4. Change the root directory (chroot)

```bash
root@docker02:~# chroot dawn-dawn/ /bin/bash -c 'for i in haha xixi; do echo $i; done'
haha
xixi
```

Once inside, the / that this bash sees is dawn-dawn/

```bash
root@docker02:~# chroot dawn-dawn/ /bin/bash -c 'ls -l /'
total 12
drwxr-xr-x 2 0 0 4096 Oct 26 08:59 bin
drwxr-xr-x 2 0 0 4096 Oct 26 09:00 lib
drwxr-xr-x 2 0 0 4096 Oct 26 08:50 lib64
```

On the host there are dozens of directories; here only three remain - this is the most primitive form of the 'container sensation'.

## 5. Dual-container isolation demo

Copy the environment once to get two independent container roots

```bash
root@docker02:~# cp -r dawn-dawn dawn-dawn01
```

**Container 1** (terminal 1): enter dawn-dawn and create a file in its 'own /'

```bash
root@docker02:~# chroot dawn-dawn/ /bin/bash -c 'echo haha > /haha.txt; ls -l /'
total 16
drwxr-xr-x 2 0 0 4096 Oct 26 08:59 bin
-rw-r--r-- 1 0 0    5 Oct 26 09:09 haha.txt
drwxr-xr-x 2 0 0 4096 Oct 26 09:00 lib
drwxr-xr-x 2 0 0 4096 Oct 26 08:50 lib64
```

**Container 2** (terminal 2): enter dawn-dawn01 and do the same

```bash
root@docker02:~# chroot dawn-dawn01/ /bin/bash -c 'echo xixi > /xixi.log; ls /'
bin
lib
lib64
xixi.log
```

**Verification from the host perspective** - the two 'containers' cannot see each other's data, and the host root directory cannot see them either

```bash
root@docker02:~# ls /root/dawn-dawn/
bin  haha.txt  lib  lib64
root@docker02:~# ls /root/dawn-dawn01/
bin  lib  lib64  xixi.log
root@docker02:~# ls / | grep -E 'haha|xixi'
(no output)
```

## 6. chroot into a Docker container's filesystem

chroot is useful for more than toy directories - you can directly 'drill into' a real Docker container's filesystem. The container's root is the host's /var/lib/docker/overlay2/<id>/merged

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

When a container will not start or has no shell, you can chroot from the host into its merged directory to fix files and read logs directly.