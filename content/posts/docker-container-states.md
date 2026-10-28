---
title: "Docker 实战：容器状态详解——Up / Exited / Created / Paused"
date: 2026-10-28T11:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "逐个复现 docker ps 中四种容器状态的产生方式——Up、Exited（含退出状态码语义）、Created、Paused，并给出查看容器内主进程 ID 的三种方法：docker top、docker inspect 与宿主机 ps。"
---

# Docker 实战：容器状态详解——Up / Exited / Created / Paused

`docker ps` 输出的 STATUS 列其实就是容器的生命周期状态：**Up**（运行中）、**Exited**（已退出，括号里是退出状态码）、**Created**（已创建未启动）、**Paused**（暂停对外服务）。本文逐个复现这四种状态的产生方式，并顺带给出查看容器内主进程 ID 的三种办法（`docker top` / `docker inspect` / 宿主机 `ps`）。

## 1. Up

代表的是容器处于运行状态。

## 2. Exited

表示容器的启动名称被终止，通常情况下，退出状态码为0则该容器正常退出，非0表示异常退出。

比如:"sleep 3600"，表示一小时后容器再退出，但是如果不到1小时就退出了，则状态码非0。

```bash
root@docker01:~# docker run -d --name c1 uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1 sleep 10
aee6dd889ae1f028b1f477dce2b1725a3c03b4683f9cb4ef06ce62c44aa02e96
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE                                               COMMAND      CREATED         STATUS         PORTS     NAMES
aee6dd889ae1   uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1   "sleep 10"   8 seconds ago   Up 7 seconds             c1
root@docker01:~# docker ps -l # 观察退出的状态码为0
CONTAINER ID   IMAGE                                               COMMAND      CREATED          STATUS                     PORTS     NAMES
aee6dd889ae1   uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1   "sleep 10"   18 seconds ago   Exited (0) 7 seconds ago             c1

root@docker01:~# docker run -d --name c3 uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1 sleep 3600
f95bb6bea64926abf65662f844596b0cd240858f6e5ddcb1c4d2c7409c083885
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE                                               COMMAND        CREATED         STATUS         PORTS     NAMES
f95bb6bea649   uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1   "sleep 3600"   2 minutes ago   Up 2 minutes             c3
root@docker01:~# docker inspect  -f "{{.State.Pid}}" c3
7158
root@docker01:~# kill -9 7158
root@docker01:~# docker ps -l # 观察退出的状态码为非0
CONTAINER ID   IMAGE                                               COMMAND        CREATED         STATUS                        PORTS     NAMES
f95bb6bea649   uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1   "sleep 3600"   4 minutes ago   Exited (137) 12 seconds ago             c3
```

## 3. Created

表示容器处于创建状态，但是没有启动，需要执行"docker start"命令启动该容器。docker run等效于"docker create + docker start"。

```bash
root@docker01:~# docker create --name c3 uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1 sleep 3600
0d1f9b6be2ebe5ae3b26dcd760df11e916bcba6f741e0f6110cc7e56089b28ae
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE                                               COMMAND        CREATED         STATUS    PORTS     NAMES
0d1f9b6be2eb   uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1   "sleep 3600"   5 seconds ago   Created             c3
root@docker01:~# docker start c3
c3
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE                                               COMMAND        CREATED          STATUS         PORTS     NAMES
0d1f9b6be2eb   uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1   "sleep 3600"   26 seconds ago   Up 8 seconds             c3

root@docker01:~# docker run -d --name c4 -p 80:80 uhub.service.ucloud.cn/dawn/apps:v1
e19ebe79516214e59ea5b0197ee6ce760805eb9033b6acb433d83019b8403820
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE                                 COMMAND                  CREATED          STATUS          PORTS                               NAMES
e19ebe795162   uhub.service.ucloud.cn/dawn/apps:v1   "/docker-entrypoint.…"   52 seconds ago   Up 51 seconds   0.0.0.0:80->80/tcp, :::80->80/tcp   c4
```

## 4. Paused

容器依旧处于运行状态，但是此状态暂停对外服务。（类似于虚拟机被挂起）

重启容器，会对状态的时间重新计时，但暂停不会。

```bash
root@docker01:~# docker container pause c4
c4
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE                                 COMMAND                  CREATED          STATUS                   PORTS                               NAMES
e99412feba6d   uhub.service.ucloud.cn/dawn/apps:v1   "/docker-entrypoint.…"   15 seconds ago   Up 15 seconds (Paused)   0.0.0.0:80->80/tcp, :::80->80/tcp   c4
root@docker01:~# docker restart c4
c4
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE                                 COMMAND                  CREATED              STATUS         PORTS                               NAMES
e99412feba6d   uhub.service.ucloud.cn/dawn/apps:v1   "/docker-entrypoint.…"   About a minute ago   Up 2 seconds   0.0.0.0:80->80/tcp, :::80->80/tcp   c4
```

## 5. 查看容器的进程

```bash
# 使用top查看容器的进程ID  
root@docker01:~# docker top c2
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                7427                7406                0                   03:56               ?                   00:00:00            tail -f /dev/null

# 使用docker inspect查看容器的详细信息
root@docker01:~# docker inspect -f "{{.State.Pid}}" c2
7427

# 在宿主机直接过滤
root@docker01:~# ps -ef | grep 7427
root        7427    7406  0 03:56 ?        00:00:00 tail -f /dev/null
root        9341    2023  0 04:23 pts/0    00:00:00 grep --color=auto 7427
```