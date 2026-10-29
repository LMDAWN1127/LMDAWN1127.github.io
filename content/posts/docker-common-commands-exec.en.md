---
title: "Docker in Practice: Common Container Commands and exec Operations"
date: 2026-10-23T15:20:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "A roundup of everyday container commands (list/remove/rename containers, follow logs with -f/--since/--until, copy files with docker cp) plus running commands inside a running container with docker exec, including the gotcha that the target command must exist in the image."
---

# Docker in Practice: Common Container Commands and exec Operations

## 1. Common docker commands

List running containers

```bash
root@docker02:~# docker container ps
CONTAINER ID   IMAGE                                      COMMAND                  CREATED         STATUS         PORTS                               NAMES
ff10508a36b1   uhub.service.ucloud.cn/dawn/nginx:latest   "/docker-entrypoint.…"   8 minutes ago   Up 8 minutes   0.0.0.0:82->80/tcp, :::82->80/tcp   c2
53efc7e7cfcb   uhub.service.ucloud.cn/dawn/nginx:1.30.4   "/docker-entrypoint.…"   8 minutes ago   Up 8 minutes   0.0.0.0:81->80/tcp, :::81->80/tcp   c1
root@docker02:~# docker ps
CONTAINER ID   IMAGE                                      COMMAND                  CREATED         STATUS         PORTS                               NAMES
ff10508a36b1   uhub.service.ucloud.cn/dawn/nginx:latest   "/docker-entrypoint.…"   8 minutes ago   Up 8 minutes   0.0.0.0:82->80/tcp, :::82->80/tcp   c2
53efc7e7cfcb   uhub.service.ucloud.cn/dawn/nginx:1.30.4   "/docker-entrypoint.…"   8 minutes ago   Up 8 minutes   0.0.0.0:81->80/tcp, :::81->80/tcp   c1
```

List all containers

```bash
root@docker02:~# docker ps -a
root@docker02:~# docker container ls -a
root@docker02:~# docker container ps -a
```

List the IDs of all containers

```bash
root@docker02:~# docker container ls -a -q
```

Remove a stopped container

```bash
root@docker02:~# docker container rm c3
```

Remove a running container

```bash
root@docker02:~# docker container rm -f c1
c1
# or
root@docker02:~# docker container stop c1
c1
root@docker02:~# docker container rm c1
```

Remove all containers

```bash
root@docker02:~# docker container rm -f `docker ps -qa`
```

Rename a container

```bash
root@docker02:~# docker container rename c3 c4
```

Follow container logs in real time

```bash
root@docker02:~# docker container logs -f   c1
root@docker02:~# docker container logs -f  --until 20m c1
root@docker02:~# docker container logs -f  --since 20m c1
```

  Related parameters:

  -f:

  Follow the logs in real time

  --since 20m:

  Show logs generated within the last 20 minutes

  --until 20m:

  Show logs generated before 20 minutes ago

Show the most recently created container

```bash
root@docker02:~# docker ps -l
```

Copy data between the host and the container

  Copy a file from the container to the host:

```bash
root@docker02:~# docker container cp c1:/docker-entrypoint.sh /root/
```

  Copy a file from the host to the container:

```bash
root@docker02:~# docker cp install-docker.sh c1:/
```

## 2. Running commands inside a running container

1. Show the IP address

```bash
root@docker02:~# docker exec c1 hostname -I
172.17.0.2
```

2. Connect to the container with a shell

```bash
root@docker02:~# docker exec -it c1 sh
# ls
bin   dev                  docker-entrypoint.sh  home  lib64  mnt  proc  run   srv  tmp  var
boot  docker-entrypoint.d  etc                   lib   media  opt  root  sbin  sys  usr
#
```

3. When executing a command via exec, make sure the container actually has that command

```bash
root@docker02:~# docker exec -it c1 ifconfig
OCI runtime exec failed: exec failed: unable to start container process: exec: "ifconfig": executable file not found in $PATH: unknown
```
