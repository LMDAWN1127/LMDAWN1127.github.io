---
title: "Docker 实战：Dockerfile 多游戏镜像构建与 ADD 自动解压"
date: 2026-10-28T18:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "从一份旧的全家桶镜像 dawn-games-dawn:v0.6 里用中转容器拷出黄金矿工与压扁小鸟两个游戏的静态文件，各自打成 tar.gz，再用 Dockerfile 的 ADD 指令在构建时自动解压进 Alpine+nginx 容器，最后构建镜像、起容器并用域名访问两个游戏；并对比 ADD 与 COPY 的关键区别（ADD 自动解压 tar.gz）。"
---

# Docker 实战：Dockerfile 多游戏镜像构建与 ADD 自动解压

手头有一份“全家桶”式的旧镜像 `uhub.service.ucloud.cn/dawn/dawn-games-dawn:v0.6`，里面用 nginx 托管着两个小游戏：黄金矿工（`huangjinkuanggong`）和压扁小鸟（`killbird`）。现在想把这两个游戏单独抽出来，做一个轻量的 **Alpine + nginx** 多游戏镜像。

本文完整走一遍：先从旧镜像里把游戏静态文件拷出来、各自打成 `tar.gz`，再用 Dockerfile 的 **`ADD` 指令**在构建时自动解压进容器，最后构建镜像、起容器、用域名访问。顺带把 `ADD` 和 `COPY` 最关键的区别讲清楚——**`ADD` 会把 `tar.gz` 自动解压，而 `COPY` 只是原样拷贝**。

## 1. 从镜像提取游戏代码

| 游戏     | 镜像内路径                                 |
| -------- | ------------------------------------------ |
| 黄金矿工 | `/usr/local/nginx/html/huangjinkuanggong/` |
| 压扁小鸟 | `/usr/local/nginx/html/killbird/`          |

## 2. 建目录并用中转容器拷出

```bash
root@docker01:~# mkdir -pv /dawn/dockerfile/alpine/kuanggong-killbird
mkdir: created directory '/dawn/dockerfile/alpine/kuanggong-killbird'
root@docker01:~# cd /dawn/dockerfile/alpine/kuanggong-killbird

# 起中转容器
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# docker run -d --name games-extract uhub.service.ucloud.cn/dawn/dawn-games-dawn:v0.6 tail -f /dev/null
26a6e7d541a0034b41b0339a283006de59ca79e553c718c78b176933fe326315

# 从镜像拷出两个游戏目录
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# docker cp games-extract:/usr/local/nginx/html/huangjinkuanggong ./huangjinkuanggong
Successfully copied 5.3MB to /dawn/dockerfile/alpine/kuanggong-killbird/huangjinkuanggong
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# docker cp games-extract:/usr/local/nginx/html/killbird ./killbird
Successfully copied 1.27MB to /dawn/dockerfile/alpine/kuanggong-killbird/killbird
```

## 3. 打成 tar.gz

```bash
# 从游戏目录内部打包，使解压后直接就是游戏文件
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# tar -czf dawn-huangjinkuanggong.tar.gz -C huangjinkuanggong .
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# tar -czf dawn-killbird.tar.gz -C killbird .

# 清理原始目录
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# rm -rf huangjinkuanggong killbird
```

## 4. 编写Dockefile

```bash
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# cat Dockerfile
# 指定基础镜像，后续的所有操作都在该镜像基础之上操作
FROM alpine:3.20.2

# 在容器中运行命令，安装nginx服务
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && \
     apk update && \
     apk add nginx && \
     rm -rf /var/cache/ rm -f /usr/share/nginx/*  && \
     mkdir -pv /usr/share/nginx/html/huangjinkuanggong  && \
     mkdir -pv /usr/share/nginx/html/killbird

## 将当前目录的"dawn-bird.zip"拷贝到容器的/目录下
#COPY dawn-huangjinkuanggong.tar.gz /
#COPY dawn-killbird.tar.gz /
#
#
## 容器解压程序到指定目录
#RUN tar xf /dawn-huangjinkuanggong.tar.gz -C /usr/share/nginx/html/huangjinkuanggong && \
#    tar xf /dawn-killbird.tar.gz -C /usr/share/nginx/html/killbird && \
#    rm -f /dawn-huangjinkuanggong.tar.gz /dawn-killbird.tar.gz

# ADD指令会将tar包的内容自动解压到容器的指定路径，可以理解为先拷贝文件到容器中，然后在解压，最后删除源文件
ADD dawn-huangjinkuanggong.tar.gz /usr/share/nginx/html/huangjinkuanggong
ADD dawn-killbird.tar.gz /usr/share/nginx/html/killbird

# 将本地文件拷贝到容器的指定路径并覆盖原有的文件内容
COPY games.conf /etc/nginx/http.d/default.conf

# 指定容器的启动命令
CMD ["nginx","-g","daemon off;"]
```

## 5. 编写 nginx 配置 games.conf

```bash
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# vim games.conf
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/huangjinkuanggong;
    server_name   game01.dawn.com;
}

server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/killbird;
    server_name   game02.dawn.com;
}
```

## 6. 构建镜像

```bash
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# docker image build -t dawn-games:v2.6 .
DEPRECATED: The legacy builder is deprecated and will be removed in a future release.
            Install the buildx component to build images with BuildKit:
            https://docs.docker.com/go/buildx/

Sending build context to Docker daemon  5.015MB
Step 1/6 : FROM alpine:3.20.2
 ---> 324bc02ae123
Step 2/6 : RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories &&      apk update &&      apk add nginx &&      rm -rf /var/cache/ rm -f /usr/share/nginx/*  &&      mkdir -pv /usr/share/nginx/html/huangjinkuanggong  &&      mkdir -pv /usr/share/nginx/html/killbird
 ---> Running in e7850b9319be
fetch https://mirrors.tuna.tsinghua.edu.cn/alpine/v3.20/main/x86_64/APKINDEX.tar.gz
fetch https://mirrors.tuna.tsinghua.edu.cn/alpine/v3.20/community/x86_64/APKINDEX.tar.gz
v3.20.10-118-gcb3382a0eb8 [https://mirrors.tuna.tsinghua.edu.cn/alpine/v3.20/main]
v3.20.10-106-gcfb1a4769c3 [https://mirrors.tuna.tsinghua.edu.cn/alpine/v3.20/community]
OK: 24181 distinct packages available
(1/2) Installing pcre (8.45-r3)
(2/2) Installing nginx (1.26.3-r0)
Executing nginx-1.26.3-r0.pre-install
Executing nginx-1.26.3-r0.post-install
Executing busybox-1.36.1-r29.trigger
OK: 9 MiB in 16 packages
created directory: '/usr/share/nginx/html/'
created directory: '/usr/share/nginx/html/huangjinkuanggong'
created directory: '/usr/share/nginx/html/killbird'
 ---> Removed intermediate container e7850b9319be
 ---> a2f446944fd8
Step 3/6 : ADD dawn-huangjinkuanggong.tar.gz /usr/share/nginx/html/huangjinkuanggong
 ---> 40640938b557
Step 4/6 : ADD dawn-killbird.tar.gz /usr/share/nginx/html/killbird
 ---> 0ffa408b4136
Step 5/6 : COPY games.conf /etc/nginx/http.d/default.conf
 ---> 51cdedf25280
Step 6/6 : CMD ["nginx","-g","daemon off;"]
 ---> Running in 3cbdb8335dd2
 ---> Removed intermediate container 3cbdb8335dd2
 ---> 9b4495d60e31
Successfully built 9b4495d60e31
Successfully tagged dawn-games:v2.6
```

## 7. 观察镜像产生的中间层（每一条Dockerfile指令都会产生一个新的镜像）

```bash
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# docker image ls -a | grep -E '9b4495d60e31|51cdedf25280|0ffa408b4136|40640938b557|a2f446944fd8|324bc02ae123'
<none>                                         <none>     40640938b557   7 minutes ago       14.4MB
<none>                                         <none>     51cdedf25280   7 minutes ago       15.6MB
dawn-games                                     v2.6       9b4495d60e31   7 minutes ago       15.6MB
<none>                                         <none>     a2f446944fd8   7 minutes ago       9.25MB
<none>                                         <none>     0ffa408b4136   7 minutes ago       15.6MB
alpine                                         3.20.2     324bc02ae123   2 years ago         7.8MB
```

## 8. 启动容器

```bash
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# docker run -d --name games-test -p 8082:80 dawn-games:v2.6
383f09529e6ec1b2de0f67f2600de92e8ee920e66091b4832915ff611b0c253e
```

## 9. 改本地hosts，用域名访问

```bash
11.0.1.121  game01.dawn.com
11.0.1.121  game02.dawn.com
```

http://game01.dawn.com:8082/

![image-20261028184914653](/images/docker-dockerfile-multi-game-image-add-image-20261028184914653.png)

http://game02.dawn.com:8082/

![image-20261028184929946](/images/docker-dockerfile-multi-game-image-add-image-20261028184929946.png)