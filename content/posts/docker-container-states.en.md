---
title: "Docker in Practice: A Detailed Look at Container States — Up / Exited / Created / Paused"
date: 2026-10-28T11:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Reproduce how each of the four container states shown by docker ps is produced — Up, Exited (exit-code semantics: 0 = normal, 137 = SIGKILL), Created (created but not started), and Paused (suspended from serving, and unlike restart it does not reset the status timer)."
---

# Docker in Practice: A Detailed Look at Container States — Up / Exited / Created / Paused

The STATUS column printed by `docker ps` reflects the container's lifecycle state: **Up** (running), **Exited** (stopped, with the exit code shown in parentheses), **Created** (created but not yet started), and **Paused** (suspended from serving traffic). This article reproduces how each of these four states is produced.

## 1. Up

Indicates the container is running.

## 2. Exited

Indicates the container's process has terminated. Normally, an exit code of 0 means the container exited normally, while a non-zero code indicates an abnormal exit.

For example, `sleep 3600` means the container exits after one hour; if it exits before that, the exit code will be non-zero.

```bash
root@docker01:~# docker run -d --name c1 uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1 sleep 10
aee6dd889ae1f028b1f477dce2b1725a3c03b4683f9cb4ef06ce62c44aa02e96
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE                                               COMMAND      CREATED         STATUS         PORTS     NAMES
aee6dd889ae1   uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1   "sleep 10"   8 seconds ago   Up 7 seconds             c1
root@docker01:~# docker ps -l # observe that the exit code is 0
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
root@docker01:~# docker ps -l # observe that the exit code is non-zero
CONTAINER ID   IMAGE                                               COMMAND        CREATED         STATUS                        PORTS     NAMES
f95bb6bea649   uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1   "sleep 3600"   4 minutes ago   Exited (137) 12 seconds ago             c3
```

## 3. Created

Indicates the container has been created but not started; you must run `docker start` to launch it. `docker run` is equivalent to `docker create` + `docker start`.

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

The container is still running, but in this state it is suspended from serving traffic (similar to a virtual machine being suspended).

Restarting a container resets the timer for its status display, but pausing does not.

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
