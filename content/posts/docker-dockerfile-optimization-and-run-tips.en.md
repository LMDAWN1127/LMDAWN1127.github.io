---
title: "Docker in Practice: Dockerfile Optimization Tips and Container Startup Techniques"
date: 2026-10-28T19:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "A practical roundup of Docker efficiency tips: build-side image layer caching (Using cache) and .dockerignore to shrink a 1GB build context to ~1.6MB; runtime tricks docker exec -w for the working directory, anonymous volume host paths (/var/lib/docker/volumes/<hash>/_data), and -p :80 random port mapping (32768~60999)."
---

# Docker in Practice: Dockerfile Optimization Tips and Container Startup Techniques

Writing Dockerfiles and starting containers - the most overlooked aspects are "how to build faster, how to make images smaller, and how to work more smoothly." This article strings together several high-frequency, practical tips: on the build side, it explains how image layer caching (Using cache) works and uses `.dockerignore` to cut down a bloated build context; on the runtime side, it demonstrates `docker exec -w` to set the working directory after entering a container, where anonymous volumes land on the host, and random port mapping with `-p :80`. All are efficiency tricks you can put to use immediately.

## Dockerfile Optimization Tips

### Tip 1: Image Layer Caching

When rebuilding, layers that haven't changed hit the cache (`Using cache`):

```bash
docker image build -t dawn-games:v2.8 . 2>&1 | grep -E 'Step|Using cache'
```

```
Step 2/7 : RUN ... apk add nginx ...   <- unchanged, cache hit
 ---> Using cache
 ---> 2a68b3185350
Step 3/7 : ADD code/dawn-tanke.tar.gz ...  <- tar package changed, re-executed
 ---> 9b1dba3f40f1
```

Docker caches the result of each instruction; it only re-executes an instruction when its content or a dependent layer changes. Therefore, placing less-frequently-changed instructions above and frequently-changed ones below maximizes cache usage and speeds up builds.

---

### Tip 2: Ignore Files with .dockerignore

1. Create a large file

```bash
cd /dawn/dockerfile/alpine/tankedazhan-MAINTAINER-LABELS
dd if=/dev/zero of=./bigfile bs=1M count=1024
```

2. Build without .dockerignore (build context balloons)

```bash
docker image build -t dawn-games:v2.12 . 2>&1 | grep 'Sending build context'
# Sending build context to Docker daemon  1.075GB
```

At this point the 1GB bigfile is packaged and sent entirely to the Docker daemon, wasting time and bandwidth.

3. Write a .dockerignore

```
big*
*.exe
*.txt
*.log
# config
```

| Rule | Effect |
| --- | --- |
| \`big*\` | Ignore all files starting with big (e.g. bigfile) |
| \`*.exe\` / \`*.txt\` / \`*.log\` | Ignore specified extensions |
| \`# config\` | Comment |

4. Build with .dockerignore (size drops sharply)

```bash
docker image build -t dawn-games:v2.13 . 2>&1 | grep 'Sending build context'
# Sending build context to Docker daemon  1.623MB
```

### Dockerfile Optimization Summary

**Build speed**

1. Put infrequently modified instructions above and frequently modified ones below to maximize cache usage;
2. Use `.dockerignore` to ignore files unnecessary for the build;
3. Use domestic mirrors (e.g. Tsinghua mirror) or a local registry to speed up downloads;
4. Place large packages on a local/intranet file server to avoid repeated downloads.

**Image size**

1. Remove caches and unnecessary packages (e.g. `rm -rf /var/cache/`);
2. Merge instructions as much as possible to reduce unnecessary image layers (each instruction produces an intermediate layer, visible via `docker image ls -a`);
3. Use a smaller base image (e.g. alpine, only about 5MB).

---

## Container Startup Techniques

### 1. Specify the Working Directory After Entering the Container

```bash
# exec -w specifies the working directory after entering the container
root@docker01:~# docker exec -w /usr/share/nginx/html/tanke games pwd
/usr/share/nginx/html/tanke
```

### 2. Anonymous Volumes

```bash
# -v container path
root@docker01:~# docker run -d --name game -v /usr/share/nginx/html dawn-games:v2.8
1aa0eb13c9dbb5a35018543ed125ad855a53a7f6df27519447bd94b407b25f5e
# View the host location of the anonymous volume
root@docker01:~# docker inspect -f '{{range .Mounts}}{{.Source}}{{end}}' game
/var/lib/docker/volumes/d700421bb6aa4da3f55bf98a8700218471410adb6494805aae5d410c832a9c96/_data
```

Anonymous volumes are assigned a random volume name by Docker and stored under `/var/lib/docker/volumes/<hash>/_data`. They suit scenarios where you don't want to specify a host path but still need persistence.

### 3. Random Port Mapping

```bash
# Random port mapping (-p :80 omits the host port)
root@docker01:~# docker run -dp :80 --name c2-tanke dawn-games:v2.8
fa72c4ac0470a15e7b5c5e9143190ccb7c66f1db715aa0c886a3db4d533c8c4b
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE             COMMAND                  CREATED         STATUS         PORTS                                     NAMES
fa72c4ac0470   dawn-games:v2.8   "nginx -g 'daemon of."   8 seconds ago   Up 7 seconds   0.0.0.0:32769->80/tcp, :::32769->80/tcp   c2-tanke
```

Omitting the host port before the colon, Docker assigns a random port from the `32768~60999` range.
