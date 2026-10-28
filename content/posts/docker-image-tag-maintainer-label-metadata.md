---
title: "Docker 实战：镜像打标签 MAINTAINER 与 LABEL 及元数据查看"
date: 2026-10-28T19:40:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "以 dawn-games 镜像为例，演示如何在 Dockerfile 中用已弃用的 MAINTAINER 与官方推荐的 LABEL 写入作者/学校/邮箱等元数据，构建后用 docker image inspect -f 读取 .Author 与 .Config.Labels 核对，并用 --network host 直接起容器以 host 网络访问验证；含一张访问截图。"
---

# Docker 实战：镜像打标签 MAINTAINER 与 LABEL 及元数据查看

给镜像“贴标签”是发布环节的基本功。本文从一份实际的 `dawn-games` 镜像出发：先用 **`MAINTAINER`**（官方已弃用）和更规范的 **`LABEL`** 在 Dockerfile 里写入作者、学校、邮箱等元数据，构建后用 `docker image inspect` 的 `-f '{{.Author}}'` / `'{{.Config.Labels.xxx}}'` 把这些字段读出来核对，最后用 `--network host` 直接起容器、以宿主机 80 端口访问验证。

## 给镜像打标签

### 1.编写 Dockerfile

```dockerfile
FROM alpine:3.20.2

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && \
     apk update && \
     apk add nginx && \
     rm -rf /var/cache/ rm -f /usr/share/nginx/*  && \
     mkdir -pv /usr/share/nginx/html/tanke

ADD code/dawn-tanke.tar.gz /usr/share/nginx/html/tanke

COPY config/games.conf /etc/nginx/http.d/default.conf

# 声明版权，作者信息，邮箱，公司网站等，该指令已经被官方弃用，因为可读性较差。
MAINTAINER dawn 123456@dawn.com www.dawn.com xixi haha

# 官方推荐使用LABEL指令来替代MAINTAINER的信息
LABEL school=czu \
      class=computer01 \
      auther=dawn \
      email=123456@dawn.com \
      office=www.dawn.com

CMD ["nginx","-g","daemon off;"]
```

### 2.nginx 配置文件

```json
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/tanke;
    server_name   game01.dawn.com;
}
```

### 3.构建镜像

```bash
cd /dawn/dockerfile/alpine/tankedazhan-MAINTAINER-LABELS
docker image build -t dawn-games:v2.8 .
```

```bash
Sending build context to Docker daemon  1.622MB
Step 1/7 : FROM alpine:3.20.2
 ---> 324bc02ae123
Step 2/7 : RUN ... apk add nginx ... mkdir -pv /usr/share/nginx/html/tanke
 ---> 2a68b3185350
Step 3/7 : ADD code/dawn-tanke.tar.gz /usr/share/nginx/html/tanke
 ---> 9b1dba3f40f1
Step 4/7 : COPY config/games.conf /etc/nginx/http.d/default.conf
 ---> 58cf04d5506f
Step 5/7 : MAINTAINER dawn 123456@dawn.com www.dawn.com xixi haha
 ---> df0daa469d88
Step 6/7 : LABEL school=czu class=computer01 auther=dawn email=... office=...
 ---> 5dd0fd143c26
Step 7/7 : CMD ["nginx","-g","daemon off;"]
 ---> dbe04590110b
Successfully tagged dawn-games:v2.8
```

---

### 4.查看镜像元数据

查看 Author（MAINTAINER 写入）

```bash
root@docker01:/dawn/dockerfile/alpine/tankedazhan-MAINTAINER-LABELS# docker image inspect -f '{{.Author}}' dawn-games:v2.8
dawn 123456@dawn.com www.dawn.com xixi haha
```

查看 Labels 某个字段

```bash
root@docker01:/dawn/dockerfile/alpine/tankedazhan-MAINTAINER-LABELS# docker image inspect -f '{{.Config.Labels.auther}}' dawn-games:v2.8
dawn
```

查看完整 Labels（JSON 格式）

```bash
root@docker01:/dawn/dockerfile/alpine/tankedazhan-MAINTAINER-LABELS# docker image inspect -f '{{json .Config.Labels}}' dawn-games:v2.8
{"auther":"dawn","class":"computer01","email":"123456@dawn.com","office":"www.dawn.com","school":"czu"}
```

### 5.启动容器并测试

```bash
docker container run -d --name games --network host dawn-games:v2.8
```

用 `--network host` 启动，容器直接占用宿主机 80 端口，无需端口映射。

**浏览器访问**:

```
# 本机 hosts 添加：
11.0.1.121  game01.dawn.com

# 浏览器访问：
http://game01.dawn.com/
```

![image-20261028194608894](/images/docker-image-tag-maintainer-label-metadata-image-20261028194608894.png)
