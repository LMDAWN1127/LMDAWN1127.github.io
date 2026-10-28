---
title: "Docker 实战：docker exec 与 docker attach 的区别"
date: 2026-10-28T12:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "用 docker top 对比进程树，看清 docker exec 与 docker attach 的本质差别：exec 在容器内新建进程，attach 只把本地标准输入输出接上容器已有主进程；并给出 attach 用 ctrl+p、ctrl+q 退出而不终止容器的方法。"
---

# Docker 实战：docker exec 与 docker attach 的区别

`docker exec` 和 `docker attach` 都能进入容器，但本质完全不同：**exec 会在容器内新建一个进程**，容器主进程不受影响；**attach 不新建任何进程**，只是把本地的标准输入/输出/错误输出接上容器正在运行的那个主进程。下面用 `docker top` 观察两者的进程树差异。

## 1. 环境准备

```bash
root@docker01:~# docker run -itd --name c5 uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1
d81eb31cf5173dcb1d777559af33157dcef5a0d3f61e81f17103f27595c71a20
root@docker01:~# docker run -d --name c6 uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1 sleep 3600
c91146c125ff956871ff359d428174e48d350eb94e9b671578d51a5e855abfeb
```

## 2. 查看容器的进程信息

```bash
root@docker01:~# docker top c5
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                9691                9671                0                   04:35               pts/0               00:00:00            /bin/sh
root@docker01:~# docker top c6
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                9784                9763                0                   04:35               ?                   00:00:00            sleep 3600
```

## 3. 使用exec连接c5容器

### 测试 1

**一个终端：**

```bash
root@docker01:~# docker exec -it c5 sh
/usr/local/stress # ls
bin    share
/usr/local/stress # sleep 3600
```

**另一个终端：**

```bash
root@docker01:~# docker top c5
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                9691                9671                0                   04:35               pts/0               00:00:00            /bin/sh
root                9887                9671                0                   04:36               pts/1               00:00:00            sh
root                10120               9887                0                   04:37               pts/1               00:00:00            sleep 3600
```

### 测试 2

**一个终端：**

```bash
root@docker01:~# docker exec c5 tail -f /etc/hosts
127.0.0.1       localhost
::1     localhost ip6-localhost ip6-loopback
fe00::0 ip6-localnet
ff00::0 ip6-mcastprefix
ff02::1 ip6-allnodes
ff02::2 ip6-allrouters
172.17.0.2      d81eb31cf517
```

**另一个终端：**

```bash
root@docker01:~# docker top c5
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                9691                9671                0                   04:35               pts/0               00:00:00            /bin/sh
root                10176               9671                0                   04:38               ?                   00:00:00            tail -f /etc/hosts
```

## 4. 使用attach连接c5容器

**一个终端：**

```bash
root@docker01:~# docker top c5
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                10411               10390               1                   04:41               pts/0               00:00:00            /bin/sh
root@docker01:~# docker attach c5
/usr/local/stress # sleep 3600
```

**另一个终端：**

```bash
root@docker01:~# docker top c5
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                10411               10390               0                   04:41               pts/0               00:00:00            /bin/sh
root                10485               10411               0                   04:42               pts/0               00:00:00            sleep 3600
```

## 5. 本质区别与退出技巧

exec本质上是在正在运行的容器中产生了一个新的进程，就是在容器中执行你想要执行的任何命令;

attach本质上不会产生任何新的进程，只是将本地的标准输入，标准输出，错误输出连接到正在运行的容器;

attach工具如果想要退出容器，且不退出终端的情况下，可以连续按"ctrl + p"，再按"ctrl + q"就可以不退出当前终端。