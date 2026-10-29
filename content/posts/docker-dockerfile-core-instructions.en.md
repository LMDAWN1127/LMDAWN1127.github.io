---
title: "Dockerfile Core Instructions in Practice: WORKDIR/EXPOSE/VOLUME, ENV/ARG, HEALTHCHECK, ENTRYPOINT"
date: 2026-10-28T21:41:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Use 4 web games to demonstrate 7 core Dockerfile instructions in full: the working directory, port exposure and persistence effects of WORKDIR/EXPOSE/VOLUME; the difference between ENV and ARG at build time vs. run time and how to override them; the HEALTHCHECK health-status transitions; and the non-overridable/overridable distinction between ENTRYPOINT and CMD plus the argument-passing mechanism."
---

# Dockerfile Core Instructions in Practice: WORKDIR/EXPOSE/VOLUME, ENV/ARG, HEALTHCHECK, ENTRYPOINT

This lab uses 4 web games to demonstrate 4 groups of Dockerfile instructions:

| Case | Game                          | Core instructions              | Image tag                   |
| ---- | ----------------------------- | ------------------------------- | ---------------------------- |
| 1    | Star-Benefit Game Platform (pingtai) | `WORKDIR` / `EXPOSE` / `VOLUME` | `dawn-games:v2.13`           |
| 2    | Plants vs. Zombies (zhiwu)    | `ENV` / `ARG` + multi-service startup | `dawn-games:v2.14` / `v2.15` |
| 3    | Life Restart Simulator (liferestart) | `HEALTHCHECK`           | `dawn-games:v2.15`           |
| 4    | Fruit Ninja (qieshuiguo)      | `ENTRYPOINT`                    | `dawn-games:v2.16`           |

---

## Case 1: WORKDIR / EXPOSE / VOLUME

### 1. Prepare the game code

Extract the code of the "Star-Benefit Game Platform" from the image and package it:

```bash
root@docker01:~# mkdir -p /dawn/dockerfile/alpine/pingtai-VOLUME-EXPOSE-WORKDIR/{code,config,scripts}

root@docker01:~# docker run --rm -v /dawn/dockerfile/alpine/pingtai-VOLUME-EXPOSE-WORKDIR/code:/out \
>   uhub.service.ucloud.cn/dawn/dawn-games-dawn:v0.6 \
>   sh -c 'cd /usr/local/nginx/html/pingtai && tar czf /out/dawn-pingtai.tar.gz .'

root@docker01:~# ls -lh /dawn/dockerfile/alpine/pingtai-VOLUME-EXPOSE-WORKDIR/code/
total 100M
-rw-r--r-- 1 root root 100M Oct 28 12:35 dawn-pingtai.tar.gz
```

### 2. Write the Dockerfile

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

# Specify the working directory; it is auto-switched to when connecting to the container
WORKDIR /usr/share/nginx/html

# Specify the exposed port number
EXPOSE 80

# Create a storage volume for the container's specified directory
VOLUME /usr/share/nginx/html

CMD ["nginx","-g","daemon off;"]
```

#### Roles of the three instructions

| Instruction                     | Effect       | Description                                |
| ------------------------------- | ------------ | ------------------------------------------ |
| `WORKDIR /usr/share/nginx/html` | Specify working directory | `docker exec` auto-`cd` to this directory after entering the container |
| `EXPOSE 80`                     | Declare exposed port | Works with `docker run -P` to auto-map a random port |
| `VOLUME /usr/share/nginx/html`  | Declare a storage volume | Automatically creates an anonymous volume; data persists |

### 3. Write the nginx configuration

```bash
root@docker01:/dawn/dockerfile/alpine/pingtai-VOLUME-EXPOSE-WORKDIR# cat config/games.conf
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/pingtai;
    server_name   game01.dawn.com;
}
```

### 4. Build the image

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

### 5. Start the container and verify the three instructions

```bash
root@docker01:~# docker run -dP --name c1 dawn-games:v2.13
0aca37fa9cbcf91721dd2a28c5330bec8677c603cfdedab00e4d5398d67d7b7e

root@docker01:~# docker ps -l
CONTAINER ID   IMAGE               COMMAND                  CREATED         STATUS         PORTS                                     NAMES
0aca37fa9cb1   dawn-games:v2.13   "nginx -g 'daemon of…"   3 seconds ago   Up 2 seconds   0.0.0.0:32770->80/tcp, :::32770->80/tcp   c1
```

**Verify EXPOSE (-P auto-maps a random port, 32770):**

```bash
root@docker01:~# docker inspect -f '{{json .Config.ExposedPorts}}' c1
{"80/tcp":{}}
```

**Verify VOLUME (location of the anonymous volume):**

```bash
root@docker01:~# docker inspect -f "{{range .Mounts}}{{.Source}}{{end}}" c1
/var/lib/docker/volumes/4269bc9ee8aa04573c8637c671a10cf98d2e9019949d0372a11c2f35c8c62f40/_data

root@docker01:~# ll /var/lib/docker/volumes/4269bc9ee8aa04573c8637c671a10cf98d2e9019949d0372a11c2f35c8c62f40/_data
total 12
drwxr-xr-x 3 root root 4096 Oct 28 12:36 ./
drwx-----x 3 root root 4096 Oct 28 12:36 ../
drwxr-xr-x 7 root root 4096 Oct 28 12:36 pingtai/
```

**Verify WORKDIR (auto-switches directory after exec):**

```bash
root@docker01:~# docker exec -it c1 sh
/usr/share/nginx/html # pwd
/usr/share/nginx/html
```

### 6. Access test

Browser access: `http://11.0.1.121:32770/`

![image-20261028210809525](/images/docker-dockerfile-core-instructions/image-20261028210809525.png)

---

## Case 2: ENV / ARG (multi-service startup)

### 1. Write the Dockerfile

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

# Variables effective at container runtime, valid in both build and run stages; at runtime, use -e to override the value
ENV dawn_USERNAME=root \
    dawn_PASSWORD=321

# Variables effective at image build time, valid only in the build stage; during build you can use the "--build-arg" option to override the value.
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

### 2. Write the startup script (multi-service: sshd + nginx)

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

### 3. Write the nginx configuration

```bash
root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG# cat config/games.conf
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/zhiwu;
    server_name   game01.dawn.com;
}
```

### 4. Build the image

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

### 5. Override ENV at runtime (use -e to change username and password)

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

**Verify multi-service startup (sshd + nginx running together):**

```bash
root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG# docker exec c1 ps aux | grep -E 'sshd|nginx'
   14 root      0:00 sshd: /usr/sbin/sshd [listener] 0 of 10-100 startups
   15 root      0:00 nginx: master process nginx -g daemon off;
   16 nginx     0:00 nginx: worker process
```

**Access test:**

![image-20261028211748223](/images/docker-dockerfile-core-instructions/image-20261028211748223.png)

### 6. Override ARG at build time (use --build-arg to change arguments)

```bash
root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG# docker build -t dawn-games:v2.15 --build-arg dawn_school=THU --build-arg dawn_class=yaoban .
Successfully tagged dawn-games:v2.15

root@docker01:/dawn/dockerfile/alpine/zhiwu-ENV-ARG# docker run --rm dawn-games:v2.15 sh -c 'ls /dawn-*'
/dawn-321
/dawn-haha-yaoban
/dawn-root
/dawn-xixi-THU
```

`/dawn-root`, `/dawn-321` -- from `ENV` (default value, not overridden)

`/dawn-xixi-THU` -- from `ARG dawn_school` (overridden by `--build-arg` to `THU`)

`/dawn-haha-yaoban` -- from `ARG dawn_class` (overridden by `--build-arg` to `yaoban`)

#### Differences between ENV and ARG

| Comparison item | ENV                | ARG                        |
| ------------ | ------------------ | -------------------------- |
| Effective stage | Build + run stage  | Build stage only           |
| Runtime override | `docker run -e`    | Not supported               |
| Build-time override | Not supported     | `docker build --build-arg` |
| Enters the image | Written to image env vars | No (disappears after build) |

---

## Case 3: HEALTHCHECK health check

### 1. Write the Dockerfile

```bash
root@docker01:/dawn/dockerfile/alpine/liferestart-HEALTHCHECK# cat Dockerfile
FROM alpine:3.20.2
...
ADD code/dawn-liferestart.tar.gz /usr/share/nginx/html/liferestart

COPY config/games.conf /etc/nginx/http.d/default.conf

COPY scripts/start.sh /

# Used for the container's health check. When the in-container service runs normally and the container has a health check specified,
# besides the normal state, it also has a health status.
# The status starts as "starting". Each time the health check passes, it becomes "healthy".
# After a certain number of consecutive failures, it becomes "unhealthy".
HEALTHCHECK --interval=1s \
            --timeout=1s \
            --start-period=10s \
            --retries=5 \
            CMD curl -H "host: game01.dawn.com" 127.0.0.1

CMD ["/bin/sh","-x","/start.sh"]
```

#### HEALTHCHECK parameters explained

| Parameter          | Default value | Meaning                               |
| -------------------- | ------ | ---------------------------------------- |
| `--interval=1s`      | 30s    | How often to check after the container starts |
| `--timeout=1s`       | 30s    | A single check exceeding this duration is treated as failed |
| `--start-period=10s` | 0s     | Start delay before checking; failures during this period are not counted as retries |
| `--retries=5`        | 3      | How many consecutive failures before being marked unhealthy |

### 2. Build and start the container

```bash
root@docker01:/dawn/dockerfile/alpine/liferestart-HEALTHCHECK# docker image build -t dawn-games:v2.15 .
...
Step 14/15 : HEALTHCHECK --interval=1s --timeout=1s --start-period=10s --retries=5 CMD curl -H "host: game01.dawn.com" 127.0.0.1
 ---> 19311a2ff5ea
Successfully tagged dawn-games:v2.15

root@docker01:/dawn/dockerfile/alpine/liferestart-HEALTHCHECK# docker run -dP --name c1 dawn-games:v2.15
8749a1d58d4226ca75dee7dc8df12cb5954ee68af7da87417a0ee287e0149e33
```

### 3. Observe the health-status changes

**Just after startup (starting):**

```bash
root@docker01:/dawn/dockerfile/alpine/liferestart-HEALTHCHECK# docker ps
CONTAINER ID   IMAGE               COMMAND                  CREATED         STATUS                            PORTS       NAMES
8749a1d58d42   dawn-games:v2.15   "/bin/sh -x /start.…"   1 second ago    Up Less than a second (health: starting)     c1
```

**After waiting 10 seconds (healthy):**

```bash
root@docker01:/dawn/dockerfile/alpine/liferestart-HEALTHCHECK# docker ps
CONTAINER ID   IMAGE               COMMAND                  CREATED         STATUS                   PORTS       NAMES
8749a1d58d42   dawn-games:v2.15   "/bin/sh -x /start.…"   18 seconds ago   Up 18 seconds (healthy)              c1
```

**View health-check details:**

```bash
root@docker01:/dawn/dockerfile/alpine/liferestart-HEALTHCHECK# docker inspect --format '{{json .State.Health}}' c1
{"Status":"healthy","FailingStreak":0,"Log":[{"Start":"...","End":"...","ExitCode":0,"Output":"..."},...]}
```

You can see that `Status` is `healthy` and `FailingStreak` (consecutive failure count) is 0,
and every health-check `ExitCode` is 0 (curl successfully accessed the game page).

---

## Case 4: ENTRYPOINT - specifying the startup command

### 1. Write the Dockerfile

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

# The CMD instruction can be overridden at container startup by supplying a startup command
# CMD ["/bin/sh","-x","/start.sh"]

# Using the ENTRYPOINT instruction as the startup command is not overridable.
# ENTRYPOINT can be combined with CMD; in that case CMD is passed as an argument to ENTRYPOINT
#ENTRYPOINT ["tail", "-f", "/etc/hosts"]
ENTRYPOINT ["/bin/sh","-x","/start.sh"]

#CMD ["tail -f /etc/hosts"]
#ENTRYPOINT ["/bin/sh","-c"]
```

### 2. Build the image

```bash
root@docker01:/dawn/dockerfile/alpine/qieshuiguo-ENTRYPOINT# docker image build -t dawn-games:v2.16 .
...
Step 15/15 : ENTRYPOINT ["/bin/sh","-x","/start.sh"]
 ---> fc30411c280a
Successfully tagged dawn-games:v2.16
```

### 3. Start the container and verify

```bash
root@docker01:/dawn/dockerfile/alpine/qieshuiguo-ENTRYPOINT# docker run -dP --name c1 dawn-games:v2.16
5c638a6732c6573cd858241d44a016afcac2bc34d5b042b529a58bb7ec1d9824

root@docker01:/dawn/dockerfile/alpine/qieshuiguo-ENTRYPOINT# docker inspect -f '{{json .Config.Entrypoint}}' c1
["/bin/sh","-x","/start.sh"]

root@docker01:/dawn/dockerfile/alpine/qieshuiguo-ENTRYPOINT# curl -s http://127.0.0.1:32773/ | grep -o '<title>[^<]*</title>'
<title>Cut Fruit</title>
```

### 4. Differences between ENTRYPOINT and CMD

| Comparison item       | CMD                          | ENTRYPOINT                   |
| ------------------------------ | ---------------------------- | ---------------------------- |
| Can be overridden by the `docker run` CLI | Yes (appending a command overrides) | Not overridable by default |
| Override method      | Append a command directly after `docker run` | Must force with `--entrypoint` |
| Used together        | Serves as the argument to ENTRYPOINT | Serves as the main command |

**Demonstrate ENTRYPOINT's argument-passing mechanism:**

```bash
root@docker01:/dawn/dockerfile/alpine/qieshuiguo-ENTRYPOINT# docker run --rm --entrypoint echo dawn-games:v2.16 'This is the argument received by ENTRYPOINT'
This is the argument received by ENTRYPOINT
```

**View the image's default configuration:**

```bash
root@docker01:/dawn/dockerfile/alpine/qieshuiguo-ENTRYPOINT# docker image inspect -f 'Entrypoint={{json .Config.Entrypoint}} Cmd={{json .Config.Cmd}}' dawn-games:v2.16
Entrypoint=["/bin/sh","-x","/start.sh"] Cmd=null
```

Because `ENTRYPOINT` is used instead of `CMD`, `Config.Cmd` is `null`.