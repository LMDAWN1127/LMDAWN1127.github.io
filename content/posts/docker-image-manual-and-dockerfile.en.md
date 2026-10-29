---
title: "Docker in Practice: Building Docker Images Manually and Automatically with a Dockerfile"
date: 2026-10-28T14:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Build the same nginx game image manually from three base images - CentOS, Ubuntu and Alpine - and commit it with docker commit (236MB / 215MB / 9.41MB), then rebuild it with a Dockerfile, and summarize the three drawbacks of the manual approach: oversized images, tedious startup-command changes, and no build cache."
---

# Docker in Practice: Building Docker Images Manually and Automatically with a Dockerfile

There are two ways to build a Docker image: the **manual way** starts a base container, installs the service inside it and then commits it with `docker commit`; the **Dockerfile way** writes the whole process into a file and finishes it in a single `docker build`. This article first builds the same nginx game image manually from three base images - CentOS, Ubuntu and Alpine (checking the size along the way: 236MB / 215MB / 9.41MB) - then rebuilds it with a Dockerfile, and finally lists the three drawbacks of the manual approach.

## 1. Building a Docker Image Manually

### 1.1 Build the game image on CentOS

1. Prepare the image

```bash
root@docker01:~# docker pull uhub.service.ucloud.cn/dawn/centos:7.9.2009
```

2. Start the CentOS image

```bash
root@docker01:~# docker run -it --name c1 uhub.service.ucloud.cn/dawn/centos:7.9.2009
[root@de8e7781da0e /]#
```

3. Check the size of the container and the image

```bash
root@docker01:~# docker image ls uhub.service.ucloud.cn/dawn/centos
REPOSITORY                           TAG        IMAGE ID       CREATED       SIZE
uhub.service.ucloud.cn/dawn/centos   7.9.2009   eeb6ee3f44bd   5 years ago   204MB
root@docker01:~# docker ps -ls
CONTAINER ID   IMAGE                                         COMMAND       CREATED          STATUS          PORTS     NAMES     SIZE
de8e7781da0e   uhub.service.ucloud.cn/dawn/centos:7.9.2009   "/bin/bash"   13 seconds ago   Up 12 seconds             c1        0B (virtual 204MB)
```

4. Start installing the service

```bash
[root@de8e7781da0e /]# cat > /etc/yum.repos.d/nginx.repo<<'EOF'
> [nginx-stable]
> name=nginx stable repo
> baseurl=http://nginx.org/packages/centos/$releasever/$basearch/
> gpgcheck=1
> enabled=1
> gpgkey=https://nginx.org/keys/nginx_signing.key
> module_hotfixes=true
>
> [nginx-mainline]
> name=nginx mainline repo
> baseurl=http://nginx.org/packages/mainline/centos/$releasever/$basearch/
> gpgcheck=1
> enabled=0
> gpgkey=https://nginx.org/keys/nginx_signing.key
> module_hotfixes=true
> EOF
[root@de8e7781da0e /]# curl -s -o /etc/yum.repos.d/CentOS-Base.repo http://mirrors.aliyun.com/repo/Centos-7.repo
[root@de8e7781da0e /]# sed -i -e '/mirrors.cloud.aliyuncs.com/d' -e '/mirrors.aliyuncs.com/d' /etc/yum.repos.d/CentOS-Base.repo
[root@de8e7781da0e /]# yum -y install nginx
```

5. Check the container size again

```bash
root@docker01:~# docker ps -ls
CONTAINER ID   IMAGE                                         COMMAND       CREATED         STATUS         PORTS     NAMES     SIZE
de8e7781da0e   uhub.service.ucloud.cn/dawn/centos:7.9.2009   "/bin/bash"   4 minutes ago   Up 4 minutes             c1        265MB (virtual 469MB)
```

6. Optimize with yum

```bash
[root@de8e7781da0e /]# rm -rf /var/cache/
[root@de8e7781da0e /]# nginx -t
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: [emerg] mkdir() "/var/cache/nginx/client_temp" failed (2: No such file or directory)
nginx: configuration file /etc/nginx/nginx.conf test failed
[root@de8e7781da0e /]# mkdir -pv /var/cache/nginx
mkdir: created directory '/var/cache'
mkdir: created directory '/var/cache/nginx'
[root@de8e7781da0e /]# nginx -t
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

7. Check the container size again

```bash
root@docker01:~# docker ps -ls
CONTAINER ID   IMAGE                                         COMMAND       CREATED         STATUS         PORTS     NAMES     SIZE
de8e7781da0e   uhub.service.ucloud.cn/dawn/centos:7.9.2009   "/bin/bash"   6 minutes ago   Up 6 minutes             c1        32.2MB (virtual 236MB)
```

8. Prepare the nginx test data

8.1 Delete the original file contents

```bash
[root@de8e7781da0e /]# rm -f /usr/share/nginx/html/*
[root@de8e7781da0e /]# ls -l /usr/share/nginx/html
total 0
```

8.2 Copy the game code

```bash
# 1. Pull the image
docker pull uhub.service.ucloud.cn/dawn/dawn-games:v0.6

# 2. Start a temporary container and copy bird from the image to the host
docker run -d --name tmp-games uhub.service.ucloud.cn/dawn/dawn-games:v0.6 tail -f /dev/null
docker cp tmp-games:/usr/local/nginx/html/bird /root/bird

# 3. Copy it into the target container c1
docker cp /root/bird c1:/usr/share/nginx/html/

# 4. Remove the temporary container
docker rm -f tmp-games
```

The bird code is test code and can be copied directly out of the "uhub.service.ucloud.cn/dawn/dawn-games:v0.6" image

8.3 Prepare the bird source code

```bash
[root@de8e7781da0e /]# cd /usr/share/nginx/html/bird/
[root@de8e7781da0e bird]# ls
2000.png  21.js  icon.png  img  index.html  sound1.mp3
[root@de8e7781da0e bird]# mv * ../
[root@de8e7781da0e bird]# cd ..
[root@de8e7781da0e html]# rm -rf bird/
[root@de8e7781da0e html]# ll
total 144
-rw-r--r-- 1 root root 15329 Aug 31  2022 2000.png
-rw-r--r-- 1 root root 51562 Aug 31  2022 21.js
-rw-r--r-- 1 root root   254 Aug 31  2022 icon.png
drwxr-xr-x 2 root root  4096 Feb 23  2023 img
-rw-r--r-- 1 root root  3049 Aug 31  2022 index.html
-rw-r--r-- 1 root root 63008 Aug 31  2022 sound1.mp3
```

9. Commit the image

9.1 Commit container c1 as an image

```bash
root@docker01:~# docker container commit c1 dawn-games:v0.1
sha256:69bd176b9a1c85bb4418dccc9cfe3063f47b877eb0628b7b2a5d96eda4f3b244
```

9.2 Inspect the image

```bash
root@docker01:~# docker image ls dawn-games
REPOSITORY   TAG       IMAGE ID       CREATED          SIZE
dawn-games   v0.1      69bd176b9a1c   45 seconds ago   236MB
```

10. Start the custom image

10.1 Start without specifying a custom command

```bash
root@docker01:~# docker run -itd -p 80:80 --name game dawn-games:v0.1
a42c86886e83089c4ad72673d46eb8ac1d41ece7977cc1d307339d69749c7dab
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE             COMMAND       CREATED         STATUS         PORTS                               NAMES
a42c86886e83   dawn-games:v0.1   "/bin/bash"   8 seconds ago   Up 7 seconds   0.0.0.0:80->80/tcp, :::80->80/tcp   game
root@docker01:~# docker top game
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                15178               15154               0                   06:27               pts/0               00:00:00            /bin/bash
root@docker01:~# docker exec -it game sh
sh-4.2# nginx
sh-4.2#
```

10.2 Start the container with a startup command

```bash
root@docker01:~# docker run -itd -p 80:80 --name game dawn-games:v0.1 nginx -g 'daemon off;'
175bdc314d92dd911f2b0e4a8c8665d9b3415156deb5e52b8387aae52d14df3e
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE             COMMAND                  CREATED          STATUS          PORTS                               NAMES
175bdc314d92   dawn-games:v0.1   "nginx -g 'daemon of…"   14 seconds ago   Up 13 seconds   0.0.0.0:80->80/tcp, :::80->80/tcp   game
```

10.3 Commit the new startup image once more and you are done

```bash
root@docker01:~# docker ps -l --no-trunc
CONTAINER ID                                                       IMAGE             COMMAND                    CREATED         STATUS         PORTS                               NAMES
175bdc314d92dd911f2b0e4a8c8665d9b3415156deb5e52b8387aae52d14df3e   dawn-games:v0.1   "nginx -g 'daemon off;'"   2 minutes ago   Up 2 minutes   0.0.0.0:80->80/tcp, :::80->80/tcp   game
root@docker01:~# docker commit game dawn-games:v0.2
sha256:dd4932b55d441d802585724172fb4fc47781200cc0f687c0fb607fe011999cbd
root@docker01:~# docker image ls dawn-games
REPOSITORY   TAG       IMAGE ID       CREATED          SIZE
dawn-games   v0.2      dd4932b55d44   14 seconds ago   236MB
dawn-games   v0.1      69bd176b9a1c   7 minutes ago    236MB
root@docker01:~# docker run -d -p 88:80 --name game02 dawn-games:v0.2
3e4e52204e0072fe2fdbd6c9590968100bcbad2304d2bdfa173a35e96dced3cd
root@docker01:~# docker ps -l --no-trunc
CONTAINER ID                                                       IMAGE             COMMAND                    CREATED         STATUS         PORTS                               NAMES
3e4e52204e0072fe2fdbd6c9590968100bcbad2304d2bdfa173a35e96dced3cd   dawn-games:v0.2   "nginx -g 'daemon off;'"   7 seconds ago   Up 6 seconds   0.0.0.0:88->80/tcp, :::88->80/tcp   game02
```

If no COMMAND (the container startup command) is specified when starting a child image, the startup command of the parent image is used

### 1.2 Build the game image on Ubuntu

1. Pull the image

```bash
root@docker01:~# docker pull ubuntu:22.04
```

2. Start the Ubuntu image

```bash
root@docker01:~# docker container run --name c1 -it ubuntu:22.04
root@cd4225a50f46:/#
```

3. Install the service

```bash
root@cd4225a50f46:/# apt update
root@cd4225a50f46:/# apt -y install nginx
root@cd4225a50f46:/# rm -f /var/www/html/*
```

4. Copy the test code

```bash
root@docker01:~# docker cp  bird/ c1:/var/www/html/
Successfully copied 172kB to c1:/var/www/html/
```

5. Prepare the test data

```bash
root@cd4225a50f46:/# cd /var/www/html/bird/
root@cd4225a50f46:/var/www/html/bird# mv * ../
root@cd4225a50f46:/var/www/html/bird# cd ..
root@cd4225a50f46:/var/www/html# rm -rf bird/
root@cd4225a50f46:/var/www/html# ll
total 152
drwxr-xr-x 3 root root  4096 Oct 28 06:38 ./
drwxr-xr-x 3 root root  4096 Oct 28 06:36 ../
-rw-r--r-- 1 root root 15329 Aug 31  2022 2000.png
-rw-r--r-- 1 root root 51562 Aug 31  2022 21.js
-rw-r--r-- 1 root root   254 Aug 31  2022 icon.png
drwxr-xr-x 2 root root  4096 Feb 23  2023 img/
-rw-r--r-- 1 root root  3049 Aug 31  2022 index.html
-rw-r--r-- 1 root root 63008 Aug 31  2022 sound1.mp3
```

6. Commit the image

```bash
root@docker01:~# docker commit c1 dawn-games:v1.0
sha256:b9468a21eb088f88c31b2f72b9889135662fad37a0c54d5782bf87426d901af4
root@docker01:~# docker image ls dawn-games
REPOSITORY   TAG       IMAGE ID       CREATED          SIZE
dawn-games   v1.0      b9468a21eb08   12 seconds ago   215MB
dawn-games   v0.2      dd4932b55d44   7 minutes ago    236MB
dawn-games   v0.1      69bd176b9a1c   14 minutes ago   236MB
```

7. Start the service

```bash
root@docker01:~# docker run -d -p 81:80 --name game dawn-games:v1.0 nginx -g 'daemon off;'
9ab6168a04f68060b7e804c3b34684cc23d3ecc6c0a7622495ffad1d74ce3b9b
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE             COMMAND                  CREATED          STATUS          PORTS                               NAMES
9ab6168a04f6   dawn-games:v1.0   "nginx -g 'daemon of…"   12 seconds ago   Up 11 seconds   0.0.0.0:81->80/tcp, :::81->80/tcp   game
```

8. Commit the image again

```bash
root@docker01:~# docker commit game dawn-games:v1.1
sha256:405ca93633d6795d6b6efa2df521dfd229776647e452535123bacccf7537939a
root@docker01:~# docker run -d --name game2 -p 82:80 dawn-games:v1.1
08a61bc3faaa83c37b38d8507da811c601c7c5622fc82aec09f1f31d93433106
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE             COMMAND                  CREATED         STATUS         PORTS                               NAMES
08a61bc3faaa   dawn-games:v1.1   "nginx -g 'daemon of…"   8 seconds ago   Up 7 seconds   0.0.0.0:82->80/tcp, :::82->80/tcp   game2
root@docker01:~# docker image ls dawn-games
REPOSITORY   TAG       IMAGE ID       CREATED          SIZE
dawn-games   v1.1      405ca93633d6   24 seconds ago   215MB
dawn-games   v1.0      b9468a21eb08   2 minutes ago    215MB
dawn-games   v0.2      dd4932b55d44   9 minutes ago    236MB
dawn-games   v0.1      69bd176b9a1c   16 minutes ago   236MB
```

Building services from the Ubuntu image saves more space than CentOS

### 1.3 Build the game image on Alpine

1. Pull the image

```bash
root@docker01:~# docker pull alpine:3.20.2
```

2. Start the container and install the service

```bash
root@docker01:~# docker container run -it --name c1 alpine:3.20.2
/ # sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories
/ # apk update
fetch https://mirrors.tuna.tsinghua.edu.cn/alpine/v3.20/main/x86_64/APKINDEX.tar.gz
fetch https://mirrors.tuna.tsinghua.edu.cn/alpine/v3.20/community/x86_64/APKINDEX.tar.gz
v3.20.10-118-gcb3382a0eb8 [https://mirrors.tuna.tsinghua.edu.cn/alpine/v3.20/main]
v3.20.10-106-gcfb1a4769c3 [https://mirrors.tuna.tsinghua.edu.cn/alpine/v3.20/community]
OK: 24181 distinct packages available
/ # apk add nginx
(1/2) Installing pcre (8.45-r3)
(2/2) Installing nginx (1.26.3-r0)
Executing nginx-1.26.3-r0.pre-install
Executing nginx-1.26.3-r0.post-install
Executing busybox-1.36.1-r29.trigger
OK: 9 MiB in 16 packages
/ # nginx  -t
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
/ # du -sh /var/cache/
2.2M    /var/cache/
/ # rm -rf /var/cache/
/ # rm -f /usr/share/nginx/*
/ #
```

3. Copy the test code

```bash
root@docker01:~# docker cp bird c1:/usr/share/nginx/html
Successfully copied 172kB to c1:/usr/share/nginx/html
```

4. Write the nginx configuration file

```bash
/ # rm -f /etc/nginx/http.d/default.conf
/ # vi /etc/nginx/http.d/default.conf
server {
    listen 80;
    server_name _;

    location / {
        root /usr/share/nginx/html;
        index index.html;
    }
}

```

5. Check the configuration file syntax

```bash
/ # nginx -t
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

6. Commit the image

```bash
root@docker01:~# docker commit c1 dawn-games:v2.0
sha256:9f71529e87b1d0624cded19da5e939a22afe438583da169e76f8092d0c8e6047
root@docker01:~# docker image ls dawn-games
REPOSITORY   TAG       IMAGE ID       CREATED          SIZE
dawn-games   v2.0      9f71529e87b1   9 seconds ago    9.41MB
dawn-games   v1.1      405ca93633d6   15 minutes ago   215MB
dawn-games   v1.0      b9468a21eb08   17 minutes ago   215MB
dawn-games   v0.2      dd4932b55d44   24 minutes ago   236MB
dawn-games   v0.1      69bd176b9a1c   31 minutes ago   236MB
```

7. Start the container

```bash
root@docker01:~# docker run -d -p 85:80 --name game dawn-games:v2.0 nginx -g 'daemon off;'
b9b3524f467b3e4895dccf96505d99862ace2641d720600ee51320a8050d20ef
root@docker01:~# docker ps -l
CONTAINER ID   IMAGE             COMMAND                  CREATED         STATUS         PORTS                               NAMES
b9b3524f467b   dawn-games:v2.0   "nginx -g 'daemon of…"   9 seconds ago   Up 8 seconds   0.0.0.0:85->80/tcp, :::85->80/tcp   game
```

8. Commit the image again

```bash
root@docker01:~# docker commit game dawn-games:v2.1
sha256:db1ed8c3492a619b9618111fa8ba2d8c24450ddaa26a87e598e16f1d792b031f
root@docker01:~# docker image ls dawn-games
REPOSITORY   TAG       IMAGE ID       CREATED              SIZE
dawn-games   v2.1      db1ed8c3492a   9 seconds ago        9.41MB
dawn-games   v2.0      9f71529e87b1   About a minute ago   9.41MB
dawn-games   v1.1      405ca93633d6   17 minutes ago       215MB
dawn-games   v1.0      b9468a21eb08   19 minutes ago       215MB
dawn-games   v0.2      dd4932b55d44   26 minutes ago       236MB
dawn-games   v0.1      69bd176b9a1c   33 minutes ago       236MB
root@docker01:~# docker run -d -p 86:80 --name game2 dawn-games:v2.1
8310670e0cc681911eb8f05bf6a83ca73ec7a6a46ace87ef333027249f629c9d
root@docker01:~# docker ps -l --no-trunc
CONTAINER ID                                                       IMAGE             COMMAND                    CREATED          STATUS          PORTS                               NAMES
8310670e0cc681911eb8f05bf6a83ca73ec7a6a46ace87ef333027249f629c9d   dawn-games:v2.1   "nginx -g 'daemon off;'"   12 seconds ago   Up 12 seconds   0.0.0.0:86->80/tcp, :::86->80/tcp   game2
```



### 1.4 Drawbacks of building images manually

1. The image is too large and hard to transfer;

2. Modifying an image is complicated - for example, changing the COMMAND startup command means starting a container, committing a new image and starting from that new image;

3. No build cache can be used: every command has to be run by hand, much like operating a Linux virtual machine.

## 2. Building Images Automatically with a Dockerfile

### 2.1 Enter the working directory

```bash
root@docker01:~# mkdir -pv /dawn/dockerfile && cd /dawn/dockerfile
mkdir: created directory '/dawn/dockerfile'
root@docker01:/dawn/dockerfile# mkdir alpine centos ubuntu
root@docker01:/dawn/dockerfile# ll
total 20
drwxr-xr-x 5 root root 4096 Oct 28 07:10 ./
drwxr-xr-x 4 root root 4096 Oct 28 07:10 ../
drwxr-xr-x 2 root root 4096 Oct 28 07:10 alpine/
drwxr-xr-x 2 root root 4096 Oct 28 07:10 centos/
drwxr-xr-x 2 root root 4096 Oct 28 07:10 ubuntu/
```

### 2.2 Write the Dockerfile

```bash
root@docker01:/dawn/dockerfile# cd alpine/
root@docker01:/dawn/dockerfile/alpine# mkdir bird
root@docker01:/dawn/dockerfile/alpine# cd bird/
root@docker01:/dawn/dockerfile/alpine/bird# ll
total 8
drwxr-xr-x 2 root root 4096 Jul 24 04:06 ./
drwxr-xr-x 3 root root 4096 Jul 24 04:06 ../
root@docker01:/dawn/dockerfile/alpine/bird# cat Dockerfile
# Specify the base image; all later operations are performed on top of this image
FROM alpine:3.20.2

# Run a command inside the container to install the nginx service
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && \
     apk update && \
     apk add nginx && \
      rm -rf /var/cache/ rm -f /usr/share/nginx/*

# Copy "dawn-bird.zip" from the current directory into the / directory of the container
#COPY dawn-bird.zip /
COPY dawn-bird.tar.gz /

# Extract the program inside the container to the target directory
#RUN unzip /dawn-bird.zip -d  /usr/share/nginx/html  && \
#    rm -f /dawn-bird.zip
RUN mkdir -pv /usr/share/nginx/html  && \
    tar xf /dawn-bird.tar.gz -C /usr/share/nginx/html && \
    rm -f /dawn-bird.tar.gz

# Copy a local file to the given path in the container, overwriting the existing file contents
COPY bird.conf /etc/nginx/http.d/default.conf

# Specify the container startup command
CMD ["nginx","-g","daemon off;"]
```

### 2.3 Package the files

```bash
root@docker01:~/bird# tar -czvf dawn-bird.tar.gz *
2000.png
21.js
icon.png
img/
img/bg1.jpg
img/s1.png
img/number1.png
img/number2.png
img/bg2.jpg
img/s2.png
index.html
sound1.mp3
root@docker01:~/bird# mv dawn-bird.tar.gz /dawn/dockerfile/alpine/bird/
```

### 2.4 Prepare the test file

```bash
root@docker01:/dawn/dockerfile/alpine/bird# cat bird.conf
server {
    listen 80;
    location / {
       root /usr/share/nginx/html;
       index index.html;
    }
}
```

### 2.5 Build the image

```bash
root@docker01:/dawn/dockerfile/alpine/bird# docker image build -t dawn-games:v2.3 .
```

### 2.6 Start the service from the image

```bash
root@docker01:/dawn/dockerfile/alpine/bird# docker run -d --name game -p 80:80 dawn-games:v2.3
b7e8cb9ef8f314ce52bfa245fcb4af6e6c5985a5de0db85ebe426802f1a60918
```

In production, packaging files as a tar archive is recommended; zip can corrupt files during compression, especially image files
