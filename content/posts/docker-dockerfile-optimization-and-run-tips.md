---
title: "Docker 实战：Dockerfile 优化技巧与容器启动技巧"
date: 2026-10-28T19:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "梳理 Docker 实战中的高频提效技巧：构建侧讲清镜像层缓存(Using cache)的命中逻辑、用 .dockerignore 把 1GB 的 build context 砍到约 1.6MB；运行侧演示 docker exec -w 指定工作目录、匿名存储卷在宿主机的落盘路径(/var/lib/docker/volumes/<hash>/_data)、以及 -p :80 随机端口映射(32768~60999)。"
---

# Docker 实战：Dockerfile 优化技巧与容器启动技巧

写 Dockerfile 和起容器，最常被忽略的就是“怎么更快、怎么更小、怎么更顺手”。本文把几个高频实用技巧串起来：构建侧讲透**镜像层缓存**的命中逻辑、用 **`.dockerignore`** 把臃肿的 build context 砍下去；运行侧则演示 `docker exec -w` 指定进容器后的工作目录、**匿名存储卷**在宿主机的落盘位置、以及 `-p :80` 的**随机端口映射**。都是日常能立刻用上的提效手段。

## Dockerfile 优化技巧

### 技巧一：镜像层缓存

重新构建时，未变化的层会命中缓存（`Using cache`）：

```bash
docker image build -t dawn-games:v2.8 . 2>&1 | grep -E 'Step|Using cache'
```

```
Step 2/7 : RUN ... apk add nginx ...   ← 未变化，命中缓存
 ---> Using cache
 ---> 2a68b3185350
Step 3/7 : ADD code/dawn-tanke.tar.gz ...  ← tar 包变了，重新执行
 ---> 9b1dba3f40f1
```

Docker 会缓存每条指令的执行结果，只有指令内容或依赖的层变化时才重新执行。
因此把不常变化的指令放上面、经常变化的指令放下面，能最大化利用缓存、加速构建。

---

### 技巧二：.dockerignore 忽略文件

1. 制造一个大文件

```bash
cd /dawn/dockerfile/alpine/tankedazhan-MAINTAINER-LABELS
dd if=/dev/zero of=./bigfile bs=1M count=1024
```

2. 无 .dockerignore 时构建（build context 暴涨）

```bash
docker image build -t dawn-games:v2.12 . 2>&1 | grep 'Sending build context'
# Sending build context to Docker daemon  1.075GB
```

此时 1GB 的 bigfile 被整个打包发送给 Docker daemon，浪费时间和带宽。

3. 编写 .dockerignore

```
big*
*.exe
*.txt
*.log
# config
```

| 规则                        | 作用                                  |
| --------------------------- | ------------------------------------- |
| `big*`                      | 忽略所有 big 开头的文件（如 bigfile） |
| `*.exe` / `*.txt` / `*.log` | 忽略指定后缀                          |
| `# config`                  | 注释                                  |

4. 有 .dockerignore 后构建（体积骤降）

```bash
docker image build -t dawn-games:v2.13 . 2>&1 | grep 'Sending build context'
# Sending build context to Docker daemon  1.623MB
```

### Dockerfile 优化总结

**编译速度**

1. 将不频繁修改的指令放上面、频繁修改的放下面，最大化利用缓存；
2. 用 `.dockerignore` 忽略编译时不必要的文件；
3. 使用国内软件源（如清华镜像）或本地仓库，提升下载速度；
4. 将较大的软件包放在本地/内网文件站点，避免重复下载。

**镜像大小**

1. 删除缓存、无用的软件包（如 `rm -rf /var/cache/`）；
2. 尽量合并指令，减少不必要的镜像分层（每条指令产生一个中间层，`docker image ls -a` 可见）；
3. 使用较小的基础镜像（如 alpine，仅约 5MB）。

---

## 启动容器的技巧

### 1.指定进入容器后的工作目录

```bash
# exec -w 指定进入容器后的工作目录
root@docker01:~# docker exec -w /usr/share/nginx/html/tanke games pwd
/usr/share/nginx/html/tanke
```

### 2.匿名存储卷

```bash
# -v 容器内路径
root@docker01:~# docker run -d --name game -v /usr/share/nginx/html dawn-games:v2.8
1aa0eb13c9dbb5a35018543ed125ad855a53a7f6df27519447bd94b407b25f5e
# 查看匿名卷在宿主机的位置
root@docker01:~# docker inspect -f '{{range .Mounts}}{{.Source}}{{end}}' game
/var/lib/docker/volumes/d700421bb6aa4da3f55bf98a8700218471410adb6494805aae5d410c832a9c96/_data
```

匿名卷由 Docker 自动分配一个随机卷名，存放在 `/var/lib/docker/volumes/<hash>/_data`。
适合不想指定宿主机路径、只需持久化的场景。

### 3.随机端口映射

```bash
# 随机端口映射（-p :80 省略宿主机端口）
root@docker01:~# docker run -dp :80 --name c2-tanke dawn-games:v2.8
fa72c4ac0470a15e7b5c5e9143190ccb7c66f1db715aa0c886a3db4d533c8c4b
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE             COMMAND                  CREATED         STATUS         PORTS                                     NAMES
fa72c4ac0470   dawn-games:v2.8   "nginx -g 'daemon of…"   8 seconds ago   Up 7 seconds   0.0.0.0:32769->80/tcp, :::32769->80/tcp   c2-tanke
```

省略冒号前的宿主机端口，Docker 会从 `32768~60999` 范围随机分配一个端口。