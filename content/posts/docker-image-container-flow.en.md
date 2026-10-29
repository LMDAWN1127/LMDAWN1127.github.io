---
title: "Docker in Practice: The Full Flow of Pulling an Image and Starting a Container"
date: 2026-10-26T10:20:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Walk through Docker's three core objects in order — image registry, image, container: inspect the local registry list, pull an image from a remote registry, start a container, and run an access test."
---

# Docker in Practice: The Full Flow of Pulling an Image and Starting a Container

Images, containers and image registries are Docker's three core objects: the registry stores and distributes images; an image is a read-only template pulled from a registry; a container is a running instance of an image. Below we follow the order "image registry → image → container" and walk through the complete flow from inspecting the registry and pulling an image to starting and accessing a container.

## Image Registry

An image registry is the storage and distribution center for images. You can list the image registries already available locally, and pull images from a remote registry onto your machine.

### 1. List the local image registries

```bash
root@docker02:~# docker image ls
REPOSITORY   TAG       IMAGE ID   CREATED   SIZE
```

## Image

An image is a read-only template pulled from a registry. It cannot be modified itself — you can only update it by rebuilding it or pulling a new version.

### 2. Download an image from the remote registry

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

Field reference:

- **REPOSITORY**: which repository the image was downloaded from.
- **TAG**: generally the corresponding version.
- **IMAGE ID**: the image's unique identifier; it cannot be modified.
- **CREATED**: when the image was created.
- **SIZE**: the size of the image.

## Container

A container is a running instance of an image, started from that image. Below we demonstrate starting and listing containers, plus the automatic image pull that happens when running a container and an access test.

### 3. Start a container

```bash
root@docker02:~# docker run -d -p 88:80 886dbea595a1
5053b48e3161bb34793f9f7b095f53bc878b7b4efef639a6edbb77bd3207e9a4
```

Parameter reference:

- **-d**: run the container in the background.
- **-p**: specify the port mapping "host port:container port"

### 4. List the running containers

```bash
root@docker02:~# docker container ls
CONTAINER ID   IMAGE          COMMAND                  CREATED              STATUS              PORTS                               NAMES
5053b48e3161   886dbea595a1   "/docker-entrypoint.…"   About a minute ago   Up About a minute   0.0.0.0:88->80/tcp, :::88->80/tcp   gifted_carver
root@docker02:~# docker container ps
CONTAINER ID   IMAGE          COMMAND                  CREATED         STATUS              PORTS                               NAMES
5053b48e3161   886dbea595a1   "/docker-entrypoint.…"   2 minutes ago   Up About a minute   0.0.0.0:88->80/tcp, :::88->80/tcp   gifted_carver
```

### 5. When running a container, if the image is not available locally Docker pulls it from the remote registry automatically; if the remote registry does not have the image, the pull fails (if no TAG is specified, latest is the default)

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
5053b48e3161   886dbea595a1                               "/docker-entrypoint.…"   5 minutes ago   Up 5 minutes    0.0.0.0:88->80/tcp, :::88->80/tcp   gifted_carver

root@docker02:~# docker run -d -p 66:80 uhub.service.ucloud.cn/dawn/nginx:v6
Unable to find image 'uhub.service.ucloud.cn/dawn/nginx:v6' locally
docker: Error response from daemon: manifest for uhub.service.ucloud.cn/dawn/nginx:v6 not found: manifest unknown: manifest unknown.
See 'docker run --help'.
```

Field reference:

- **CONTAINER ID**: the container ID, its unique identifier; it cannot be modified.
- **IMAGE**: which image the container was started from.
- **COMMAND**: which services run when the container starts.
- **CREATED**: when the container was created.
- **STATUS**: the container's status.
- **PORTS**: the container's port mappings.
- **NAMES**: the container name. You can set it when creating the container or rename the container later, but every container name must be unique.

### 6. Access test

  http://11.0.1.122:88/

![image-20261023131501886](/images/docker-image-container-flow-image-20261023131501886.png)

  http://11.0.1.122:99/

![image-20261023132022374](/images/docker-image-container-flow-image-20261023132022374.png)
