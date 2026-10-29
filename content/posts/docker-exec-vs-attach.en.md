---
title: "Docker in Practice: The Difference Between docker exec and docker attach"
date: 2026-10-28T12:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Use docker top to compare process trees and see the essential difference between docker exec and docker attach: exec spawns a new process inside the container, while attach only connects your local stdin/stdout/stderr to the container's running main process. Also shows how to detach from attach with ctrl+p then ctrl+q without terminating the container."
---

# Docker in Practice: The Difference Between docker exec and docker attach

`docker exec` and `docker attach` can both get you into a container, but they are fundamentally different: **exec spawns a new process inside the container**, leaving the container's main process untouched; **attach does not create any new process**, it merely connects your local standard input/output/error to the container's already-running main process. Below we use `docker top` to observe the difference in their process trees.

## 1. Preparing the environment

```bash
root@docker01:~# docker run -itd --name c5 uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1
d81eb31cf5173dcb1d777559af33157dcef5a0d3f61e81f17103f27595c71a20
root@docker01:~# docker run -d --name c6 uhub.service.ucloud.cn/dawn/dawn-linux-tools:v0.1 sleep 3600
c91146c125ff956871ff359d428174e48d350eb94e9b671578d51a5e855abfeb
```

## 2. Inspecting container process information

```bash
root@docker01:~# docker top c5
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                9691                9671                0                   04:35               pts/0               00:00:00            /bin/sh
root@docker01:~# docker top c6
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                9784                9763                0                   04:35               ?                   00:00:00            sleep 3600
```

## 3. Connecting to container c5 with exec

### Test 1

**One terminal:**

```bash
root@docker01:~# docker exec -it c5 sh
/usr/local/stress # ls
bin    share
/usr/local/stress # sleep 3600
```

**Another terminal:**

```bash
root@docker01:~# docker top c5
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                9691                9671                0                   04:35               pts/0               00:00:00            /bin/sh
root                9887                9671                0                   04:36               pts/1               00:00:00            sh
root                10120               9887                0                   04:37               pts/1               00:00:00            sleep 3600
```

### Test 2

**One terminal:**

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

**Another terminal:**

```bash
root@docker01:~# docker top c5
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                9691                9671                0                   04:35               pts/0               00:00:00            /bin/sh
root                10176               9671                0                   04:38               ?                   00:00:00            tail -f /etc/hosts
```

## 4. Connecting to container c5 with attach

**One terminal:**

```bash
root@docker01:~# docker top c5
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                10411               10390               1                   04:41               pts/0               00:00:00            /bin/sh
root@docker01:~# docker attach c5
/usr/local/stress # sleep 3600
```

**Another terminal:**

```bash
root@docker01:~# docker top c5
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                10411               10390               0                   04:41               pts/0               00:00:00            /bin/sh
root                10485               10411               0                   04:42               pts/0               00:00:00            sleep 3600
```

## 5. Essential difference and how to detach

exec essentially spawns a new process inside the running container - it runs whatever command you want inside the container;

attach essentially creates no new process; it only connects the local standard input, standard output and standard error to the running container;

If you want to detach from attach without terminating the container, press "ctrl + p" and then "ctrl + q" in sequence - this leaves the current terminal session without exiting the container.