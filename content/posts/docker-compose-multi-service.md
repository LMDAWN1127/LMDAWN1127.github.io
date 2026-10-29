---
title: "基于 docker-compose 编译多服务镜像并启动容器"
date: 2026-10-29T13:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "通过一个 docker-compose 案例演示如何用一个 YAML 文件统一编排两个 HTML5 游戏服务（斗地主 doudizhu、摩托 motuo）的镜像构建与容器管理：编写 compose 文件（build context + 各自 Dockerfile）与 nginx 虚拟主机、启动脚本，用 docker-compose build 一次编译出两个镜像、up -d 后台启动、ps/stop/start/restart/down 管理生命周期，再配置固定端口加 restart: always 与随机端口并验证访问与重启策略，最后给出常用命令对照表。"
---

# 基于 docker-compose 编译多服务镜像并启动容器

## 一、docker-compose简介

docker-compose 是一个用来管理一组容器运行的工具。它通过一个 YAML 文件（`docker-compose.yaml`）把多个服务（service）的镜像构建、端口映射、网络、重启策略、依赖关系等一次性声明出来，再用一条命令统一编排构建与启动，取代手工逐个 `docker build` / `docker run`。

本案例用两个 HTML5 游戏（斗地主 doudizhu、摩托 motuo）作为两个服务，演示 docker-compose 的完整用法。

---

## 二、实验目录结构

```
/dawn/docker-compose/motuo-doudizhu/
├── docker-compose.yaml                 # compose 编排文件
└── dockerfile/                         # 构建上下文（context）
    ├── doudizhu.dockerfile             # 斗地主服务镜像
    ├── motuo.dockerfile                # 摩托服务镜像
    ├── config/
    │   ├── doudizhu.conf               # 斗地主 nginx 虚拟主机
    │   └── motuo.conf                  # 摩托 nginx 虚拟主机
    ├── code/
    │   ├── dawn-doudizhu.tar.gz        # 斗地主游戏代码
    │   └── dawn-motuo.tar.gz           # 摩托游戏代码
    └── scripts/
        └── start.sh                    # 多服务启动脚本（sshd + nginx + 阻塞）
```

---

## 三、编写 docker-compose 编排文件

### 3.1 docker-compose.yaml

```yaml
root@docker01:/dawn/docker-compose/motuo-doudizhu# cat docker-compose.yaml
# 声明docker compose的版本号
version: '3.8'

# 定义常用的服务
services:
   # 斗地主服务
   doudizhu:
     # 指定镜像的名称
     image: dawn-games:doudizhu-v0.1
     # 指定进行的编译信息
     build:
      # 声明上下文，相当于"docker image build -t <>:<> -f Dockerfile PATH"，此处相当于PATH
      context: ./dockerfile
      #context: .
      # 声明Dockefile的名称，相当于"-f"选项
      dockerfile: doudizhu.dockerfile

   # 摩托服务
   motuo:
     image: dawn-games:motuo-v0.1
     build:
       context: ./dockerfile
       # context: .
       dockerfile: motuo.dockerfile
```

### 3.2 nginx 虚拟主机配置

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# cat dockerfile/config/doudizhu.conf
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/doudizhu;
    server_name   game01.dawn.com;
}

root@docker01:/dawn/docker-compose/motuo-doudizhu# cat dockerfile/config/motuo.conf
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/motuo;
    server_name   game01.dawn.com;
}
```

### 3.3 摩托服务 Dockerfile

```dockerfile
root@docker01:/dawn/docker-compose/motuo-doudizhu# cat dockerfile/motuo.dockerfile
FROM alpine:3.20.2

MAINTAINER dawn 123456@dawn.com www.dawn.com xixi haha

LABEL school=czu \
      class=computer01 \
      auther=dawn \
      email=123456@dawn.com \
      office=www.dawn.com

WORKDIR /usr/share/nginx/html

VOLUME /usr/share/nginx/html

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && \
     apk update && \
     apk add nginx openssh-server curl && \
     sed -i 's@#PermitRootLogin prohibit-password@PermitRootLogin yes@' /etc/ssh/sshd_config && \
     ssh-keygen -A && \
     rm -rf /var/cache/ /usr/share/nginx/html/* && \
     ln -svf /dev/stderr  /var/log/nginx/error.log && \
     ln -svf /dev/stdout  /var/log/nginx/access.log

EXPOSE 80 22

ADD code/dawn-motuo.tar.gz /usr/share/nginx/html/motuo

COPY config/motuo.conf /etc/nginx/http.d/default.conf

COPY scripts/start.sh /

ENTRYPOINT ["/bin/sh","-x","/start.sh"]
```

### 3.4 斗地主服务 Dockerfile

```dockerfile
root@docker01:/dawn/docker-compose/motuo-doudizhu# cat dockerfile/doudizhu.dockerfile
FROM alpine:3.20.2

MAINTAINER dawn 123456@dawn.com www.dawn.com xixi haha

LABEL school=czu \
      class=computer01 \
      auther=dawn \
      email=123456@dawn.com \
      office=www.dawn.com

WORKDIR /usr/share/nginx/html

VOLUME /usr/share/nginx/html

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && \
     apk update && \
     apk add nginx openssh-server curl && \
     sed -i 's@#PermitRootLogin prohibit-password@PermitRootLogin yes@' /etc/ssh/sshd_config && \
     ssh-keygen -A && \
     rm -rf /var/cache/ /usr/share/nginx/html/* && \
     ln -svf /dev/stderr  /var/log/nginx/error.log && \
     ln -svf /dev/stdout  /var/log/nginx/access.log

EXPOSE 80 22

ADD code/dawn-doudizhu.tar.gz /usr/share/nginx/html/doudizhu

COPY config/doudizhu.conf /etc/nginx/http.d/default.conf

COPY scripts/start.sh /

ENTRYPOINT ["/bin/sh","-x","/start.sh"]
```

### 3.5 多服务启动脚本

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# cat dockerfile/scripts/start.sh
#!/bin/sh

# init root password
if [ -n $dawn_USERNAME ];then
    USERNAME=${dawn_USERNAME:-root}

    id ${USERNAME}

    if [ $? != 0 ];then
       adduser ${USERNAME} -D
    fi
fi

if [ -n "$1" ];then
   PASSWORD=$1
elif [ -n "$dawn_PASSWORD" ]; then
   PASSWORD=${dawn_PASSWORD}
else
   PASSWORD=123
fi

echo $USERNAME:$PASSWORD | chpasswd

# start sshd service
/usr/sbin/sshd

# start nginx service
# nginx -g 'daemon off;'
nginx

# block process
tail -f /etc/hosts
```

start.sh 逻辑：初始化 root 密码 → 启动 sshd → 启动 nginx → 用 `tail -f /etc/hosts` 阻塞住进程，防止容器启动后主进程退出。

---

## 四、docker-compose 基本使用

### 4.1 编译镜像

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose build
[+] Building 0.3s (17/17) FINISHED                                                                                      docker:default
 => [doudizhu internal] load build definition from doudizhu.dockerfile                                                            0.0s
 => => transferring dockerfile: 982B                                                                                              0.0s
 => [motuo internal] load build definition from motuo.dockerfile                                                                  0.0s
 => => transferring dockerfile: 970B                                                                                              0.0s
 => [doudizhu internal] load .dockerignore                                                                                        0.0s
 => => transferring context: 2B                                                                                                   0.0s
 => [motuo internal] load .dockerignore                                                                                           0.0s
 => => transferring context: 2B                                                                                                   0.0s
 => [motuo internal] load metadata for docker.io/library/alpine:3.20.2                                                            0.0s
 => [motuo 1/6] FROM docker.io/library/alpine:3.20.2                                                                              0.0s
 => [doudizhu internal] load build context                                                                                        0.1s
 => => transferring context: 2.78MB                                                                                               0.1s
 => [motuo internal] load build context                                                                                           0.0s
 => => transferring context: 30.69kB                                                                                              0.0s
 => CACHED [doudizhu 2/6] WORKDIR /usr/share/nginx/html                                                                           0.0s
 => CACHED [doudizhu 3/6] RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories &&      apk  0.0s
 => CACHED [motuo 4/6] ADD code/dawn-motuo.tar.gz /usr/share/nginx/html/motuo                                                0.0s
 => CACHED [motuo 5/6] COPY config/motuo.conf /etc/nginx/http.d/default.conf                                                      0.0s
 => CACHED [motuo 6/6] COPY scripts/start.sh /                                                                                    0.0s
 => [doudizhu] exporting to image                                                                                                 0.0s
 => => exporting layers                                                                                                           0.0s
 => => writing image sha256:b703be2d566230da9a12bd84189822af07167d1b14371b0f2c3ccd60375e7edc                                      0.0s
 => => writing image sha256:fdffcfbc066ae122bd0f86fb8cc0cba608919f805fadfce48cee19a7cc0a623e                                      0.0s
 => => naming to docker.io/library/dawn-games:motuo-v0.1                                                                       0.0s
 => => naming to docker.io/library/dawn-games:doudizhu-v0.1                                                                    0.0s
 => CACHED [doudizhu 4/6] ADD code/dawn-doudizhu.tar.gz /usr/share/nginx/html/doudizhu                                       0.0s
 => CACHED [doudizhu 5/6] COPY config/doudizhu.conf /etc/nginx/http.d/default.conf                                                0.0s
 => CACHED [doudizhu 6/6] COPY scripts/start.sh /                                                                                 0.0s
```

编译结果：一次 `build` 同时产出了 `dawn-games:doudizhu-v0.1` 和 `dawn-games:motuo-v0.1` 两个镜像。`CACHED` 表示重复构建时命中了构建缓存，速度极快。

### 4.2 后台创建并启动容器

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose up -d
[+] Building 0.0s (0/0)                                                                                                 docker:default
[+] Running 2/2
 ✔ Container motuo-doudizhu-doudizhu-1  Started                                                                                0.1s
 ✔ Container motuo-doudizhu-motuo-1     Started                                                                                0.1s
```

容器命名规则：`<项目目录名>-<服务名>-<序号>`，即 `motuo-doudizhu-doudizhu-1` 和 `motuo-doudizhu-motuo-1`。

### 4.3 查看容器的状态信息

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose ps
NAME                           IMAGE                         COMMAND                  SERVICE    CREATED              STATUS              PORTS
motuo-doudizhu-doudizhu-1   dawn-games:doudizhu-v0.1   "/bin/sh -x /start.sh"   doudizhu   About a minute ago   Up About a minute   22/tcp, 80/tcp
motuo-doudizhu-motuo-1      dawn-games:motuo-v0.1      "/bin/sh -x /start.sh"   motuo      About a minute ago   Up About a minute   22/tcp, 80/tcp
```

### 4.4 停止所有服务

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose stop -t 0
[+] Stopping 2/2
 ✔ Container motuo-doudizhu-doudizhu-1  Stopped                                                                                0.3s
 ✔ Container motuo-doudizhu-motuo-1     Stopped                                                                                0.3s
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose ps
NAME      IMAGE     COMMAND   SERVICE   CREATED   STATUS    PORTS
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker ps -a
CONTAINER ID   IMAGE                         COMMAND                  CREATED          STATUS                        PORTS     NAMES
3ec683731d79   dawn-games:doudizhu-v0.1   "/bin/sh -x /start.sh"   38 seconds ago   Exited (137) 27 seconds ago             motuo-doudizhu-doudizhu-1
e55d8f324ef9   dawn-games:motuo-v0.1      "/bin/sh -x /start.sh"   38 seconds ago   Exited (137) 27 seconds ago             motuo-doudizhu-motuo-1
```

### 4.5 启动所有的服务

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose start
[+] Running 2/2
 ✔ Container motuo-doudizhu-motuo-1     Started                                                                                0.6s
 ✔ Container motuo-doudizhu-doudizhu-1  Started                                                                                0.6s
root@docker01:/dawn/docker-compose/motuo-doudizhu#
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker ps -a
CONTAINER ID   IMAGE                         COMMAND                  CREATED          STATUS        PORTS            NAMES
3ec683731d79   dawn-games:doudizhu-v0.1   "/bin/sh -x /start.sh"   48 seconds ago   Up 1 second   22/tcp, 80/tcp   motuo-doudizhu-doudizhu-1
e55d8f324ef9   dawn-games:motuo-v0.1      "/bin/sh -x /start.sh"   48 seconds ago   Up 1 second   22/tcp, 80/tcp   motuo-doudizhu-motuo-1
```

### 4.6 重启指定的服务

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker ps -a
CONTAINER ID   IMAGE                         COMMAND                  CREATED              STATUS          PORTS            NAMES
3ec683731d79   dawn-games:doudizhu-v0.1   "/bin/sh -x /start.sh"   About a minute ago   Up 35 seconds   22/tcp, 80/tcp   motuo-doudizhu-doudizhu-1
e55d8f324ef9   dawn-games:motuo-v0.1      "/bin/sh -x /start.sh"   About a minute ago   Up 35 seconds   22/tcp, 80/tcp   motuo-doudizhu-motuo-1
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose restart doudizhu
[+] Restarting 1/1
 ✔ Container motuo-doudizhu-doudizhu-1  Started                                                                               10.5s
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker ps -a
CONTAINER ID   IMAGE                         COMMAND                  CREATED              STATUS              PORTS            NAMES
3ec683731d79   dawn-games:doudizhu-v0.1   "/bin/sh -x /start.sh"   About a minute ago   Up 3 seconds        22/tcp, 80/tcp   motuo-doudizhu-doudizhu-1
e55d8f324ef9   dawn-games:motuo-v0.1      "/bin/sh -x /start.sh"   About a minute ago   Up About a minute   22/tcp, 80/tcp   motuo-doudizhu-motuo-1
```

指定服务是在 `docker-compose.yaml` 配置文件中定义的服务，`restart doudizhu` 只重启 doudizhu 这一个服务，motuo 不受影响。

### 4.7 停止并删除所有的容器

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker ps -a
CONTAINER ID   IMAGE                         COMMAND                  CREATED         STATUS              PORTS            NAMES
3ec683731d79   dawn-games:doudizhu-v0.1   "/bin/sh -x /start.sh"   3 minutes ago   Up About a minute   22/tcp, 80/tcp   motuo-doudizhu-doudizhu-1
e55d8f324ef9   dawn-games:motuo-v0.1      "/bin/sh -x /start.sh"   3 minutes ago   Up 2 minutes        22/tcp, 80/tcp   motuo-doudizhu-motuo-1
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose down -t 0
[+] Running 3/3
 ✔ Container motuo-doudizhu-motuo-1     Removed                                                                                0.2s
 ✔ Container motuo-doudizhu-doudizhu-1  Removed                                                                                0.3s
 ✔ Network motuo-doudizhu_default       Removed                                                                                0.1s
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker ps -a
CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES
```

`down` 与 `stop` 的区别：`down` 会停止并删除容器，同时删除 compose 自动创建的网络（`motuo-doudizhu_default`）。

---

## 五、docker-compose 实现端口映射和重启策略

修改 `docker-compose.yaml`，为 doudizhu 配置固定端口 + `restart: always`，为 motuo 配置随机端口：

```yaml
root@docker01:/dawn/docker-compose/motuo-doudizhu# cat docker-compose.yaml
# 声明docker compose的版本号
version: '3.8'

# 定义常用的服务
services:
   # 斗地主服务
   doudizhu:
     # 指定镜像的名称
     image: dawn-games:doudizhu-v0.1
     # 配置端口映射
     ports:
       - 2481:80
       - 2422:22
     # 配置重启策略
     restart: always
     # 指定进行的编译信息
     build:
      # 声明上下文，相当于"docker image build -t <>:<> -f Dockerfile PATH"，此处相当于PATH
      context: ./dockerfile
      #context: .
      # 声明Dockefile的名称，相当于"-f"选项
      dockerfile: doudizhu.dockerfile

   # 摩托服务
   motuo:
     image: dawn-games:motuo-v0.1
     # 将宿主机的随机端口映射到容器的指定端口
     ports:
       - :80
       - :22
     build:
       context: ./dockerfile
       # context: .
       dockerfile: motuo.dockerfile
```

重新启动并验证：

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose up -d
[+] Running 2/2
 ✔ Container motuo-doudizhu-doudizhu-1  Started                                                                                0.1s
 ✔ Container motuo-doudizhu-motuo-1     Started                                                                                0.1s

root@docker01:/dawn/docker-compose/motuo-doudizhu# docker ps
CONTAINER ID   IMAGE                      COMMAND                  CREATED         STATUS         PORTS                                      NAMES
xxxxxxxxxxxx   dawn-games:doudizhu-v0.1   "/bin/sh -x /start.sh"   2 seconds ago   Up 2 seconds   0.0.0.0:2481->80/tcp, 0.0.0.0:2422->22/tcp   motuo-doudizhu-doudizhu-1
xxxxxxxxxxxx   dawn-games:motuo-v0.1      "/bin/sh -x /start.sh"   2 seconds ago   Up 2 seconds   0.0.0.0:32769->80/tcp, 0.0.0.0:32768->22/tcp  motuo-doudizhu-motuo-1
```

验证访问结果：

```bash
# 斗地主：固定端口 2481，返回 HTTP 200
root@docker01:/dawn/docker-compose/motuo-doudizhu# curl -s -o /dev/null -w "%{http_code}" http://11.0.1.121:2481/
200

# 摩托：随机端口 32769，返回 HTTP 200
root@docker01:/dawn/docker-compose/motuo-doudizhu# curl -s -o /dev/null -w "%{http_code}" http://11.0.1.121:32769/
200
```

验证重启策略：

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' motuo-doudizhu-doudizhu-1
always
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' motuo-doudizhu-motuo-1
no
```

---

## 六、docker-compose 基本命令

| 命令                                | 作用                                       |
| ----------------------------------- | ------------------------------------------ |
| `docker-compose build`              | 根据 yaml 中的 build 配置编译镜像          |
| `docker-compose up -d`              | 后台创建并启动所有服务（必要时自动 build） |
| `docker-compose ps`                 | 查看 compose 管理的容器状态                |
| `docker-compose stop [-t 0]`        | 停止服务（容器保留）                       |
| `docker-compose start`              | 启动已停止的服务                           |
| `docker-compose restart [服务名]`   | 重启所有服务，或指定某个服务               |
| `docker-compose down [-t 0]`        | 停止并删除容器、网络                       |
| `docker-compose logs [-f] [服务名]` | 查看服务日志                               |
