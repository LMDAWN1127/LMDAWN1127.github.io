---
title: "Building Multi-Service Images and Starting Containers with docker-compose"
date: 2026-10-29T13:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Through a docker-compose case, demonstrate how to use a single YAML file to orchestrate image builds and container management for two HTML5 game services (doudizhu and motuo): write the compose file (build context + each service's Dockerfile) together with nginx virtual hosts and a startup script, use docker-compose build to compile both images in one go, up -d to start in the background, ps/stop/start/restart/down to manage the lifecycle, then configure a fixed port with restart: always and a random port and verify access and the restart policy, and finally provide a reference table of common commands."
---

# Building Multi-Service Images and Starting Containers with docker-compose

## 1. Introduction to docker-compose

docker-compose is a tool for managing a group of containers. Through a single YAML file (docker-compose.yaml) it declares the image build, port mapping, networks, restart policies and dependencies of multiple services all at once, then uses one command to orchestrate the build and startup uniformly, replacing manual individual docker build / docker run.

This case uses two HTML5 games (doudizhu and motuo) as two services to demonstrate the full usage of docker-compose.

---

## 2. Experiment directory structure

```
/dawn/docker-compose/motuo-doudizhu/
├── docker-compose.yaml                 # compose orchestration file
└── dockerfile/                         # build context (context)
    ├── doudizhu.dockerfile             # doudizhu service image
    ├── motuo.dockerfile                # motuo service image
    ├── config/
    │   ├── doudizhu.conf               # doudizhu nginx virtual host
    │   └── motuo.conf                  # motuo nginx virtual host
    ├── code/
    │   ├── dawn-doudizhu.tar.gz        # doudizhu game code
    │   └── dawn-motuo.tar.gz           # motuo game code
    └── scripts/
        └── start.sh                    # multi-service startup script (sshd + nginx + block)
```

---

## 3. Writing the docker-compose orchestration file

### 3.1 docker-compose.yaml

```yaml
root@docker01:/dawn/docker-compose/motuo-doudizhu# cat docker-compose.yaml
# Declares the docker compose version number
version: '3.8'

# Defines the commonly used services
services:
   # doudizhu service
   doudizhu:
     # Specifies the image name
     image: dawn-games:doudizhu-v0.1
     # Specifies the build information
     build:
      # Declares the context, equivalent to "docker image build -t <>:<> -f Dockerfile PATH", here it is the PATH
      context: ./dockerfile
      #context: .
      # Declares the Dockerfile name (equivalent to the "-f" option)
      dockerfile: doudizhu.dockerfile

   # motuo service
   motuo:
     image: dawn-games:motuo-v0.1
     build:
       context: ./dockerfile
       # context: .
       dockerfile: motuo.dockerfile
```

### 3.2 nginx virtual host configuration

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

### 3.3 motuo service Dockerfile

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

### 3.4 doudizhu service Dockerfile

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

### 3.5 multi-service startup script

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

start.sh logic: initialize the root password -> start sshd -> start nginx -> use tail -f /etc/hosts to block the process, preventing the main process from exiting after the container starts.

---

## 4. Basic usage of docker-compose

### 4.1 Building images

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

Build result: a single build produces two images, dawn-games:doudizhu-v0.1 and dawn-games:motuo-v0.1. CACHED means the build cache was hit on a repeated build, so it is extremely fast.

### 4.2 Creating and starting containers in the background

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose up -d
[+] Building 0.0s (0/0)                                                                                                 docker:default
[+] Running 2/2
 ✔ Container motuo-doudizhu-doudizhu-1  Started                                                                                0.1s
 ✔ Container motuo-doudizhu-motuo-1     Started                                                                                0.1s
```

Container naming rule: <project directory name>-<service name>-<sequence number>, i.e. motuo-doudizhu-doudizhu-1 and motuo-doudizhu-motuo-1.

### 4.3 Viewing container status

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker-compose ps
NAME                           IMAGE                         COMMAND                  SERVICE    CREATED              STATUS              PORTS
motuo-doudizhu-doudizhu-1   dawn-games:doudizhu-v0.1   "/bin/sh -x /start.sh"   doudizhu   About a minute ago   Up About a minute   22/tcp, 80/tcp
motuo-doudizhu-motuo-1      dawn-games:motuo-v0.1      "/bin/sh -x /start.sh"   motuo      About a minute ago   Up About a minute   22/tcp, 80/tcp
```

### 4.4 Stopping all services

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

### 4.5 Starting all services

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

### 4.6 Restarting a specific service

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

The specified service is the one defined in the docker-compose.yaml configuration file; restart doudizhu only restarts the doudizhu service, and motuo is not affected.

### 4.7 Stopping and removing all containers

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

The difference between down and stop: down stops and removes the containers and also removes the network automatically created by compose (motuo-doudizhu_default).

---

## 5. Implementing port mapping and restart policy

Edit docker-compose.yaml to give doudizhu a fixed port + restart: always, and give motuo a random port:

```yaml
root@docker01:/dawn/docker-compose/motuo-doudizhu# cat docker-compose.yaml
# Declares the docker compose version number
version: '3.8'

# Defines the commonly used services
services:
   # doudizhu service
   doudizhu:
     # Specifies the image name
     image: dawn-games:doudizhu-v0.1
     # Configures port mapping
     ports:
       - 2481:80
       - 2422:22
     # Configures the restart policy
     restart: always
     # Specifies the build information
     build:
      # Declares the context, equivalent to "docker image build -t <>:<> -f Dockerfile PATH", here it is the PATH
      context: ./dockerfile
      #context: .
      # Declares the Dockerfile name (equivalent to the "-f" option)
      dockerfile: doudizhu.dockerfile

   # motuo service
   motuo:
     image: dawn-games:motuo-v0.1
     # Maps a random host port to the container's specified port
     ports:
       - :80
       - :22
     build:
       context: ./dockerfile
       # context: .
       dockerfile: motuo.dockerfile
```

Restart and verify:

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

Verify access results:

```bash
# doudizhu: fixed port 2481, returns HTTP 200
root@docker01:/dawn/docker-compose/motuo-doudizhu# curl -s -o /dev/null -w "%{http_code}" http://11.0.1.121:2481/
200

# motuo: random port 32769, returns HTTP 200
root@docker01:/dawn/docker-compose/motuo-doudizhu# curl -s -o /dev/null -w "%{http_code}" http://11.0.1.121:32769/
200
```

Verify the restart policy:

```bash
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' motuo-doudizhu-doudizhu-1
always
root@docker01:/dawn/docker-compose/motuo-doudizhu# docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' motuo-doudizhu-motuo-1
no
```

---

## 6. Basic docker-compose commands

| Command                                | Purpose                                       |
| ----------------------------------- | ------------------------------------------ |
| `docker-compose build`              | Compile images based on the build config in the yaml          |
| `docker-compose up -d`              | Create and start all services in the background (auto-build if needed) |
| `docker-compose ps`                 | View the container status managed by compose                |
| `docker-compose stop [-t 0]`        | Stop services (containers kept)                       |
| `docker-compose start`              | Start the stopped services                           |
| `docker-compose restart [service name]`   | Restart all services, or a specified service               |
| `docker-compose down [-t 0]`        | Stop and remove containers and networks                       |
| `docker-compose logs [-f] [service name]` | View service logs                               |
