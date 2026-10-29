---
title: "Dockerfile 核心指令实战：WORKDIR/EXPOSE/VOLUME、ENV/ARG、HEALTHCHECK、ENTRYPOINT"
date: 2026-10-28T21:41:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "用 4 个网页游戏完整演示 7 个核心 Dockerfile 指令：WORKDIR/EXPOSE/VOLUME 的目录、端口与持久化效果，ENV 与 ARG 在构建期/运行期的差异及覆盖方式，HEALTHCHECK 的健康状态流转，以及 ENTRYPOINT 与 CMD 的不可覆盖/可覆盖区别与参数传递机制。"
---
# Dockerfile 核心指令实战：WORKDIR/EXPOSE/VOLUME、ENV/ARG、HEALTHCHECK、ENTRYPOINT

本实验用 4 个网页游戏分别演示 4 组 Dockerfile 指令：

| 案例 | 游戏                          | 核心指令                        | 镜像标签                     |
| ---- | ----------------------------- | ------------------------------- | ---------------------------- |
| 一   | 星益小游戏平台（pingtai）     | `WORKDIR` / `EXPOSE` / `VOLUME` | `dawn-games:v2.13`           |
| 二   | 植物大战僵尸（zhiwu）         | `ENV` / `ARG` + 多服务启动      | `dawn-games:v2.14` / `v2.15` |
| 三   | 人生重开模拟器（liferestart） | `HEALTHCHECK`                   | `dawn-games:v2.15`           |
| 四   | 切水果（qieshuiguo）          | `ENTRYPOINT`                    | `dawn-games:v2.16`           |

---

## 案例一：WORKDIR / EXPOSE / VOLUME

### 1. 准备游戏代码

从镜像中提取「星益小游戏平台」代码并打包：

```bash
root@docker01:~# mkdir -p /dawn/dockerfile/alpine/pingtai-VOLUME-EXPOSE-WORKDIR/{code,config,scripts}

root@docker01:~# docker run --rm -v /dawn/dockerfile/alpine/pingtai-VOLUME-EXPOSE-WORKDIR/code:/out \
>   uhub.service.ucloud.cn/dawn/dawn-games-dawn:v0.6 \
>   sh -c 'cd /usr/local/nginx/html/pingtai && tar czf /out/dawn-pingtai.tar.gz .'

root@docker01:~# ls -lh /dawn/dockerfile/alpine/pingtai-VOLUME-EXPOSE-WORKDIR/code/
total 100M
-rw-r--r-- 1 root root 100M Oct 28 12:35 dawn-pingtai.tar.gz
```

### 2. 编写 Dockerfile

```bash
root@docker01:/dawn/dockerfile/alpine/pingtai-VOLUME-EXPOSE-WORKDIR# cat Dockerfile
FROM alpine:3.20.2

MAINTAINER dawn 123456@dawn.com www.dawn.com xixi haha

LABEL school=czu \
      class=computer01 \
      auther=dawn \
      email=123456@dawn.com \
      office=www.dawn.com

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && \
     apk update && \
     apk add nginx && \
     rm -rf /var/cache/ rm -f /usr/share/nginx/*

ADD code/dawn-pingtai.tar.gz /usr/share/nginx/html/pingtai

COPY config/games.conf /etc/nginx/http.d/default.conf

# 指定工作目录，当连接到容器时自动切换的目录
WORKDIR /usr/share/nginx/html

# 指定暴露的端口号
EXPOSE 80

# 将容器的指定目录创建存储卷
VOLUME /usr/share/nginx/html

CMD ["nginx","-g","daemon off;"]
```

#### 三个指令的作用

| 指令                            | 作用         | 说明                                       |
| ------------------------------- | ------------ | ------------------------------------------ |
| `WORKDIR /usr/share/nginx/html` | 指定工作目录 | `docker exec` 进入容器后自动 `cd` 到该目录 |
| `EXPOSE 80`                     | 声明暴露端口 | 配合 `docker run -P` 自动映射随机端口      |
| `VOLUME /usr/share/nginx/html`  | 声明存储卷   | 自动创建匿名卷，数据持久化                 |

### 3. 编写 nginx 配置

```bash
root@docker01:/dawn/dockerfile/alpine/pingtai-VOLUME-EXPOSE-WORKDIR# cat config/games.conf
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/pingtai;
    server_name   game01.dawn.com;
}
```

### 4. 构建镜像

```bash
root@docker01:/dawn/dockerfile/alpine/pingtai-VOLUME-EXPOSE-WORKDIR# docker image build -t dawn-games:v2.13 .
...
Step 7/10 : WORKDIR /usr/share/nginx/html
 ---> c2beaad2ca7d
Step 8/10 : EXPOSE 80
 ---> adace459771f
Step 9/10 : VOLUME /usr/share/nginx/html
 ---> 58ae3b9289fe
Step 10/10 : CMD ["nginx","-g","daemon off;"]
 ---> c3489847ff85
Successfully built c3489847ff85
Successfully tagged dawn-games:v2.13
```

### 5. 启动容器并验证三个指令

```bash
root@docker01:~# docker run -dP --name c1 dawn-games:v2.13
0aca37fa9cbcf91721dd2a28c5330bec8677c603cfdedab00e4d5398d67d7b7e

root@docker01:~# docker ps -l
CONTAINER ID   IMAGE               COMMAND                  CREATED         STATUS         PORTS                                     NAMES
0aca37fa9cb1   dawn-games:v2.13   "nginx -g 'daemon of…"   3 seconds ago   Up 2 seconds   0.0.0.0:32770->80/tcp, :::32770->80/tcp   c1
```

**验证 EXPOSE（-P 自动映射随机端口 32770）：**

```bash
root@docker01:~# docker inspect -f '{{json .Config.ExposedPorts}}' c1
{"80/tcp":{}}
```

**验证 VOLUME（匿名卷位置）：**

```bash
root@docker01:~# docker inspect -f "{{range .Mounts}}{{.Source}}{{end}}" c1
/var/lib/docker/volumes/4269bc9ee8aa04573c8637c671a10cf98d2e9019949d0372a11c2f35c8c62f40/_data

root@docker01:~# ll /var/lib/docker/volumes/4269bc9ee8aa04573c8637c671a10cf98d2e9019949d0372a11c2f35c8c62f40/_data
total 12
drwxr-xr-x 3 root root 4096 Oct 28 12:36 ./
drwx-----x 3 root root 4096 Oct 28 12:36 ../
drwxr-xr-x 7 root root 4096 Oct 28 12:36 pingtai/
```

**验证 WORKDIR（exec 进入后自动切换目录）：**

```bash
root@docker01:~# docker exec -it c1 sh
/usr/share/nginx/html # pwd
/usr/share/nginx/html
```

### 6. 访问测试

浏览器访问：`http://11.0.1.121:32770/`

![image-20261028210809525](/images/docker-dockerfile-core-instructions/image-20261028210809525.png)

---

## 案例二：ENV / ARG（多服务启动）

### 1. 编写 Dockerfile

```bash
root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG# cat Dockerfile
FROM alpine:3.20.2

MAINTAINER dawn 123456@dawn.com www.dawn.com xixi haha

LABEL school=czu \
      class=computer01 \
      auther=dawn \
      email=123456@dawn.com \
      office=www.dawn.com

WORKDIR /usr/share/nginx/html

EXPOSE 80

VOLUME /usr/share/nginx/html

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && \
     apk update && \
     apk add nginx openssh-server curl && \
     sed -i 's@#PermitRootLogin prohibit-password@PermitRootLogin yes@' /etc/ssh/sshd_config && \
     ssh-keygen -A && \
     rm -rf /var/cache/ /usr/share/nginx/html/*

# 容器运行时生效的变量，在构建阶段和容器运行阶段均有效，容器运行时，使用-e覆盖变量的值
ENV dawn_USERNAME=root \
    dawn_PASSWORD=321

# 镜像构建时生效的变量，仅在构建阶段有效，在构建阶段可以使用"--build-arg"选项覆盖变量的值。
ARG dawn_school=czu \
    dawn_class=computer01

RUN touch /dawn-${dawn_USERNAME} && \
    touch /dawn-${dawn_PASSWORD} && \
    touch /dawn-xixi-${dawn_school} && \
    touch /dawn-haha-${dawn_class}

ADD code/dawn-zhiwu.tar.gz /usr/share/nginx/html/zhiwu

COPY config/games.conf /etc/nginx/http.d/default.conf

COPY scripts/start.sh /

# CMD ["nginx","-g","daemon off;"]
CMD ["/bin/sh","-x","/start.sh"]
# CMD ["tail","-f","/etc/hosts"]
```

### 2. 编写启动脚本（多服务：sshd + nginx）

```bash
root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG# cat scripts/start.sh
#!/bin/sh

# init root password
if [ -n $dawn_USERNAME ];then {
    USERNAME=${dawn_USERNAME:-root}

    id ${USERNAME}

    if [ $? != 0 ];then {
       adduser ${USERNAME} -D
    }
    fi
}
fi

if [ -n $dawn_PASSWORD ];then {
   PASSWORD=${dawn_PASSWORD:-123}
}
fi

echo $USERNAME:$PASSWORD | chpasswd

# start sshd service
/usr/sbin/sshd

# start nginx service
nginx -g 'daemon off;'
```

### 3. 编写 nginx 配置

```bash
root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG# cat config/games.conf
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/zhiwu;
    server_name   game01.dawn.com;
}
```

### 4. 构建镜像

```bash
root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG# docker image build -t dawn-games:v2.14 .
...
(15/15) Installing openssh-server (9.7_p1-r5)
...
Step 8/14 : ENV dawn_USERNAME=root     dawn_PASSWORD=321
 ---> 33d0dcf85ef9
Step 9/14 : ARG dawn_school=czu     dawn_class=computer01
 ---> db9d23d02ad7
Step 10/14 : RUN touch /dawn-${dawn_USERNAME} && ...
 ---> 3f912a699263
Step 14/14 : CMD ["/bin/sh","-x","/start.sh"]
 ---> c2d92ddef381
Successfully tagged dawn-games:v2.14
```

### 5. ENV 运行时覆盖（用 -e 修改用户名密码）

```bash
root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG/scripts# docker run -dP --name c1 -e dawn_USERNAME=xixi -e dawn_PASSWORD=haha dawn-games:v2.14
2b6539639876439a33773c8292dae05f3d87018cd1b59d990541581780ba7c1b

root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG# docker exec -it c1 sh
/usr/share/nginx/html # env
...
dawn_PASSWORD=haha
dawn_USERNAME=xixi
PWD=/usr/share/nginx/html
/usr/share/nginx/html #
```

**验证多服务启动（sshd + nginx 同时运行）：**

```bash
root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG# docker exec c1 ps aux | grep -E 'sshd|nginx'
   14 root      0:00 sshd: /usr/sbin/sshd [listener] 0 of 10-100 startups
   15 root      0:00 nginx: master process nginx -g daemon off;
   16 nginx     0:00 nginx: worker process
```

**访问测试：**

![image-20261028211748223](/images/docker-dockerfile-core-instructions/image-20261028211748223.png)

### 6. ARG 构建时覆盖（用 --build-arg 修改参数）

```bash
root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG# docker build -t dawn-games:v2.15 --build-arg dawn_school=THU --build-arg dawn_class=yaoban .
Successfully tagged dawn-games:v2.15

root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG# docker run --rm dawn-games:v2.15 sh -c 'ls /dawn-*'
/dawn-321
/dawn-haha-yaoban
/dawn-root
/dawn-xixi-THU
```

`/dawn-root`、`/dawn-321` —— 来自 `ENV`（默认值，未被覆盖）

`/dawn-xixi-THU` —— 来自 `ARG dawn_school`（`--build-arg` 覆盖为 `THU`）

`/dawn-haha-yaoban` —— 来自 `ARG dawn_class`（`--build-arg` 覆盖为 `yaoban`）

#### ENV 与 ARG 的区别

| 对比项       | ENV                | ARG                        |
| ------------ | ------------------ | -------------------------- |
| 生效阶段     | 构建 + 运行阶段    | 仅构建阶段                 |
| 运行时覆盖   | `docker run -e`    | 不支持                     |
| 构建时覆盖   | 不支持             | `docker build --build-arg` |
| 能否进入镜像 | 会写入镜像环境变量 | 不会（构建后消失）         |

---

## 案例三：HEALTHCHECK 健康检查

### 1. 编写 Dockerfile

```bash
root@docker01:/dawn/dockerfile/alpine/liferestart-HEALTHCHECK# cat Dockerfile
FROM alpine:3.20.2
...
ADD code/dawn-liferestart.tar.gz /usr/share/nginx/html/liferestart

COPY config/games.conf /etc/nginx/http.d/default.conf

COPY scripts/start.sh /

# 用做容器的健康检查，当容器内服务运行正常时，当容器指定了健康检查时，
# 除了正常状态外，它还具有健康状态。
# 状态最初为"starting". 每当健康检查通过时，它就会变成"healthy"。
# 在连续失败一定次数后，就变成了"unhealthy"。
HEALTHCHECK --interval=1s \
            --timeout=1s \
            --start-period=10s \
            --retries=5 \
            CMD curl -H "host: game01.dawn.com" 127.0.0.1

CMD ["/bin/sh","-x","/start.sh"]
```

#### HEALTHCHECK 参数详解

| 参数                 | 默认值 | 含义                                     |
| -------------------- | ------ | ---------------------------------------- |
| `--interval=1s`      | 30s    | 容器启动后每隔多久检查一次               |
| `--timeout=1s`       | 30s    | 单次检查超过该时长视为失败               |
| `--start-period=10s` | 0s     | 启动延迟检查时间，此期间失败不记重试次数 |
| `--retries=5`        | 3      | 连续失败多少次后判定为 unhealthy         |

### 2. 构建并启动容器

```bash
root@docker01:/dawn/dockerfile/alpine/liferestart-HEALTHCHECK# docker image build -t dawn-games:v2.15 .
...
Step 14/15 : HEALTHCHECK --interval=1s --timeout=1s --start-period=10s --retries=5 CMD curl -H "host: game01.dawn.com" 127.0.0.1
 ---> 19311a2ff5ea
Successfully tagged dawn-games:v2.15

root@docker01:/dawn/dockerfile/alpine/liferestart-HEALTHCHECK# docker run -dP --name c1 dawn-games:v2.15
8749a1d58d4226ca75dee7dc8df12cb5954ee68af7da87417a0ee287e0149e33
```

### 3. 观察健康状态变化

**刚启动时（starting）：**

```bash
root@docker01:/dawn/dockerfile/alpine/liferestart-HEALTHCHECK# docker ps
CONTAINER ID   IMAGE               COMMAND                  CREATED         STATUS                            PORTS       NAMES
8749a1d58d42   dawn-games:v2.15   "/bin/sh -x /start.…"   1 second ago    Up Less than a second (health: starting)     c1
```

**等待 10 秒后（healthy）：**

```bash
root@docker01:/dawn/dockerfile/alpine/liferestart-HEALTHCHECK# docker ps
CONTAINER ID   IMAGE               COMMAND                  CREATED         STATUS                   PORTS       NAMES
8749a1d58d42   dawn-games:v2.15   "/bin/sh -x /start.…"   18 seconds ago   Up 18 seconds (healthy)              c1
```

**查看健康检查详情：**

```bash
root@docker01:/dawn/dockerfile/alpine/liferestart-HEALTHCHECK# docker inspect --format '{{json .State.Health}}' c1
{"Status":"healthy","FailingStreak":0,"Log":[{"Start":"...","End":"...","ExitCode":0,"Output":"..."},...]}
```

可以看到 `Status` 为 `healthy`，`FailingStreak`（连续失败次数）为 0，
每次健康检查的 `ExitCode` 都是 0（curl 成功访问游戏页面）。

---

## 案例四：ENTRYPOINT 指定启动命令

### 1. 编写 Dockerfile

```bash
root@docker01:/dawn/dockerfile/alpine/qieshuiguo-ENTRYPOINT# cat Dockerfile
FROM alpine:3.20.2
...
ADD code/dawn-qieshuiguo.tar.gz /usr/share/nginx/html/qieshuiguo

COPY config/games.conf /etc/nginx/http.d/default.conf

COPY scripts/start.sh /

HEALTHCHECK --interval=1s \
            --timeout=1s \
            --start-period=10s \
            --retries=5 \
            CMD curl -H "host: game01.dawn.com" 127.0.0.1

# CMD的指令可以在容器启动时使用启动命令的方式被覆盖
# CMD ["/bin/sh","-x","/start.sh"]

# 使用ENTRYPOINT指令作为启动命令是不可覆盖的。
# ENTRYPOINT可以和CMD混用，此时CMD将作为参数传递给ENTRYPOINT
#ENTRYPOINT ["tail", "-f", "/etc/hosts"]
ENTRYPOINT ["/bin/sh","-x","/start.sh"]

#CMD ["tail -f /etc/hosts"]
#ENTRYPOINT ["/bin/sh","-c"]
```

### 2. 构建镜像

```bash
root@docker01:/dawn/dockerfile/alpine/qieshuiguo-ENTRYPOINT# docker image build -t dawn-games:v2.16 .
...
Step 15/15 : ENTRYPOINT ["/bin/sh","-x","/start.sh"]
 ---> fc30411c280a
Successfully tagged dawn-games:v2.16
```

### 3. 启动容器并验证

```bash
root@docker01:/dawn/dockerfile/alpine/qieshuiguo-ENTRYPOINT# docker run -dP --name c1 dawn-games:v2.16
5c638a6732c6573cd858241d44a016afcac2bc34d5b042b529a58bb7ec1d9824

root@docker01:/dawn/dockerfile/alpine/qieshuiguo-ENTRYPOINT# docker inspect -f '{{json .Config.Entrypoint}}' c1
["/bin/sh","-x","/start.sh"]

root@docker01:/dawn/dockerfile/alpine/qieshuiguo-ENTRYPOINT# curl -s http://127.0.0.1:32773/ | grep -o '<title>[^<]*</title>'
<title>切水果</title>
```

### 4. ENTRYPOINT 与 CMD 的区别

| 对比项                         | CMD                          | ENTRYPOINT                   |
| ------------------------------ | ---------------------------- | ---------------------------- |
| 能否被 `docker run` 命令行覆盖 | 可以（追加命令即覆盖）       | 默认不可覆盖                 |
| 覆盖方式                       | 直接在 `docker run` 后跟命令 | 需用 `--entrypoint` 强制覆盖 |
| 混用                           | 作为 ENTRYPOINT 的参数       | 作为主命令                   |

**演示 ENTRYPOINT 的参数传递机制：**

```bash
root@docker01:/dawn/dockerfile/alpine/qieshuiguo-ENTRYPOINT# docker run --rm --entrypoint echo dawn-games:v2.16 '这是ENTRYPOINT收到的参数'
这是ENTRYPOINT收到的参数
```

**查看镜像默认配置：**

```bash
root@docker01:/dawn/dockerfile/alpine/qieshuiguo-ENTRYPOINT# docker image inspect -f 'Entrypoint={{json .Config.Entrypoint}} Cmd={{json .Config.Cmd}}' dawn-games:v2.16
Entrypoint=["/bin/sh","-x","/start.sh"] Cmd=null
```

因为用的是 `ENTRYPOINT` 而非 `CMD`，所以 `Config.Cmd` 为 `null`。