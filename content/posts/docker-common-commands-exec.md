---
title: "Docker 实战：容器常用命令与 exec 操作"
date: 2026-10-23T15:20:00+08:00
draft: false
tags: ["Docker"]
---

# Docker 实战：容器常用命令与 exec 操作

## 1. docker常用命令

查看正在运行的容器列表

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

查看所有容器列表

```bash
root@docker02:~# docker ps -a
root@docker02:~# docker container ls -a
root@docker02:~# docker container ps -a
```

查看所有容器的ID

```bash
root@docker02:~# docker container ls -a -q
```

删除未运行的容器

```bash
root@docker02:~# docker container rm c3
```

删除正在运行的容器

```bash
root@docker02:~# docker container rm -f c1
c1
# 或者
root@docker02:~# docker container stop c1
c1
root@docker02:~# docker container rm c1
```

删除所有的容器

```bash
root@docker02:~# docker container rm -f `docker ps -qa`
```

修改容器的名称

```bash
root@docker02:~# docker container rename c3 c4
```

实时查看日志

```bash
root@docker02:~# docker container logs -f   c1
root@docker02:~# docker container logs -f  --until 20m c1
root@docker02:~# docker container logs -f  --since 20m c1
```

  相关参数说明：

  -f:

  实时查看日志

  --since 20m:

  查看20分钟内产生的日志

  --until 20m:

  查看20分钟之前的日志

查看最近创建的一个容器

```bash
root@docker02:~# docker ps -l
```

宿主机和容器之间拷贝数据

 将容器的文件拷贝到宿主机：

```bash
root@docker02:~# docker container cp c1:/docker-entrypoint.sh /root/
```

 将宿主机的文件拷贝到容器中：

```bash
root@docker02:~# docker cp install-docker.sh c1:/
```

## 2. 在运行中的容器内执行命令

1. 查看ip地址

```bash
root@docker02:~# docker exec c1 hostname -I
172.17.0.2
```

2. 连接到容器使用shell环境

```bash
root@docker02:~# docker exec -it c1 sh
# ls
bin   dev                  docker-entrypoint.sh  home  lib64  mnt  proc  run   srv  tmp  var
boot  docker-entrypoint.d  etc                   lib   media  opt  root  sbin  sys  usr
#
```

3. 连接容器执行命令式要注意确保该容器有此命令

```bash
root@docker02:~# docker exec -it c1 ifconfig
OCI runtime exec failed: exec failed: unable to start container process: exec: "ifconfig": executable file not found in $PATH: unknown
```
