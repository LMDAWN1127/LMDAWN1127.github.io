---
title: "Docker 实战：镜像拉取与容器启动全流程"
date: 2026-10-23T14:30:00+08:00
draft: false
tags: ["Docker"]
---

# Docker 实战：镜像拉取与容器启动全流程

## 镜像仓库、镜像和容器

1. 查看本地镜像仓库列表

```bash
root@docker02:~# docker image ls
REPOSITORY   TAG       IMAGE ID   CREATED   SIZE
```

2. 从远程仓库下载镜像

```bash
root@docker02:~# docker pull uhub.service.ucloud.cn/dawn/nginx:1.30.4
1.30.4: Pulling from dawn/nginx
26c307b5e35a: Pull complete
7be390ba6238: Pull complete
d84ae7b21412: Pull complete
c0df8d325117: Pull complete
b8b80b9bc028: Pull complete
f5de6e85ac74: Pull complete
5a4222b844e8: Pull complete
Digest: sha256:9e4b33ead4c69e9845e53a1f175d0aa70a6cea62425b5d08957ba7eee5dc9b1d
Status: Downloaded newer image for uhub.service.ucloud.cn/dawn/nginx:1.30.4
uhub.service.ucloud.cn/dawn/nginx:1.30.4

root@docker02:~# docker image ls
REPOSITORY                          TAG       IMAGE ID       CREATED        SIZE
uhub.service.ucloud.cn/dawn/nginx   1.30.4    886dbea595a1   2 months ago   161MB
```

  相关字段说明:

  REPOSITORY:

  代表从哪个仓库下载来的。

  TAG:

  一般代表对应版本。

  IMAGE ID:

  镜像的唯一标识，不可修改。

  CREATED:

  镜像的创建时间。

  SIZE:

  镜像的大小。

3. 启动容器

```bash
root@docker02:~# docker run -d -p 88:80 886dbea595a1
5053b48e3161bb34793f9f7b095f53bc878b7b4efef639a6edbb77bd3207e9a4
```

相关参数说明:

  -d :

  代表后台运行容器。

  -p:

  指定端口映射"宿主机端口:容器端口"

4. 查看正在运行的容器

```bash
root@docker02:~# docker container ls
CONTAINER ID   IMAGE          COMMAND                  CREATED              STATUS              PORTS                               NAMES
5053b48e3161   886dbea595a1   "/docker-entrypoint.…"   About a minute ago   Up About a minute   0.0.0.0:88->80/tcp, :::88->80/tcp   gifted_carver
root@docker02:~# docker container ps
CONTAINER ID   IMAGE          COMMAND                  CREATED         STATUS              PORTS                               NAMES
5053b48e3161   886dbea595a1   "/docker-entrypoint.…"   2 minutes ago   Up About a minute   0.0.0.0:88->80/tcp, :::88->80/tcp   gifted_carver
```

5. 运行容器时，若本地没有镜像，会自动去远程仓库拉取镜像，如果远程仓库中没有镜像，则拉取失败（不指定TAG，默认latest）

```bash
root@docker02:~# docker images
REPOSITORY                          TAG       IMAGE ID       CREATED        SIZE
uhub.service.ucloud.cn/dawn/nginx   1.30.4    886dbea595a1   2 months ago   161MB
root@docker02:~# docker run -d -p 99:80 uhub.service.ucloud.cn/dawn/nginx:latest
Unable to find image 'uhub.service.ucloud.cn/dawn/nginx:latest' locally
latest: Pulling from dawn/nginx
062e450697fa: Pull complete
82454cdbf456: Pull complete
3c7ab7949321: Pull complete
cacfcdd01f30: Pull complete
b6698f04e005: Pull complete
2bedaf25031a: Pull complete
d26f27cc8c41: Pull complete
Digest: sha256:db4f612f385437d11eb26620a4f1d7efb3ff44e1296a3c21540b30454e6e2bf3
Status: Downloaded newer image for uhub.service.ucloud.cn/dawn/nginx:latest
8b9fd82e4e01fd8d2130ec1f3719e1dc15f878acfc2f6d8780be1ac9575d2779
root@docker02:~# docker images
REPOSITORY                          TAG       IMAGE ID       CREATED        SIZE
uhub.service.ucloud.cn/dawn/nginx   1.30.4    886dbea595a1   2 months ago   161MB
uhub.service.ucloud.cn/dawn/nginx   latest    4e5db4761e0f   3 months ago   161MB
root@docker02:~# docker container ps
CONTAINER ID   IMAGE                                      COMMAND                  CREATED          STATUS          PORTS                               NAMES
8b9fd82e4e01   uhub.service.ucloud.cn/dawn/nginx:latest   "/docker-entrypoint.…"   38 seconds ago   Up 38 seconds   0.0.0.0:99->80/tcp, :::99->80/tcp   practical_elion
5053b48e3161   886dbea595a1                               "/docker-entrypoint.…"   5 minutes ago    Up 5 minutes    0.0.0.0:88->80/tcp, :::88->80/tcp   gifted_carver

root@docker02:~# docker run -d -p 66:80 uhub.service.ucloud.cn/dawn/nginx:v6
Unable to find image 'uhub.service.ucloud.cn/dawn/nginx:v6' locally
docker: Error response from daemon: manifest for uhub.service.ucloud.cn/dawn/nginx:v6 not found: manifest unknown: manifest unknown.
See 'docker run --help'.
```

 相关字段说明:

  CONTAINER ID

  容器的ID，容器的唯一标识，不可修改。

  IMAGE:

  容器基于哪个镜像启动。

  COMMAND:

  容器启动时，运行哪些服务。

  CREATED:

  容器的创建时间。

  STATUS:

  容器的状态。

  PORTS:

  容器端口映射。

  NAMES:

  容器的名称，创建容器时可以指定名称，也可以后期修改容器名称，但是每个容器的名称必须唯一。

6. 访问测试

  http://11.0.1.122:88/

![image-20261023131501886](/images/docker-image-container-flow-image-20261023131501886.png)

  http://11.0.1.122:99/

![image-20261023132022374](/images/docker-image-container-flow-image-20261023132022374.png)
