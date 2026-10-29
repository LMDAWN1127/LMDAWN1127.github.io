---
title: "Docker in Practice: Building a Multi-Game Image with Dockerfile and ADD Auto-Extraction"
date: 2026-10-26T15:20:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Copy the static files of two games (Gold Miner and Flappy Bird) out of an old all-in-one image dawn-games-dawn:v0.6 using a staging container, pack each into a tar.gz, then let the Dockerfile ADD instruction auto-extract them into an Alpine+nginx container at build time; finally build the image, start the container and visit both games by domain — plus the key difference between ADD and COPY: ADD auto-extracts tar.gz."
---

# Docker in Practice: Building a Multi-Game Image with Dockerfile and ADD Auto-Extraction

There is an old “all-in-one” image `uhub.service.ucloud.cn/dawn/dawn-games-dawn:v0.6` that serves two small games with nginx: Gold Miner (`huangjinkuanggong`) and Flappy Bird (`killbird`). Now I want to extract these two games separately and build a lightweight **Alpine + nginx** multi-game image.

This article walks through the whole thing: first copy the game static files out of the old image and pack each into a `tar.gz`, then use the Dockerfile **`ADD` instruction** to auto-extract them into the container at build time, and finally build the image, start the container and visit it by domain. Along the way it makes the key difference between `ADD` and `COPY` clear — **`ADD` auto-extracts `tar.gz`, while `COPY` just copies it verbatim**.

## 1. Extract the game code from the image

| Game        | Path inside the image                      |
| -------- | ------------------------------------------ |
| Gold Miner  | `/usr/local/nginx/html/huangjinkuanggong/` |
| Flappy Bird | `/usr/local/nginx/html/killbird/`          |

## 2. Create the directories and copy out via a staging container

```bash
root@docker01:~# mkdir -pv /dawn/dockerfile/alpine/kuanggong-killbird
mkdir: created directory '/dawn/dockerfile/alpine/kuanggong-killbird'
root@docker01:~# cd /dawn/dockerfile/alpine/kuanggong-killbird

# start the staging container
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# docker run -d --name games-extract uhub.service.ucloud.cn/dawn/dawn-games-dawn:v0.6 tail -f /dev/null
26a6e7d541a0034b41b0339a283006de59ca79e553c718c78b176933fe326315

# copy the two game directories out of the image
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# docker cp games-extract:/usr/local/nginx/html/huangjinkuanggong ./huangjinkuanggong
Successfully copied 5.3MB to /dawn/dockerfile/alpine/kuanggong-killbird/huangjinkuanggong
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# docker cp games-extract:/usr/local/nginx/html/killbird ./killbird
Successfully copied 1.27MB to /dawn/dockerfile/alpine/kuanggong-killbird/killbird
```

## 3. Pack into tar.gz

```bash
# pack from inside the game directory so extraction yields the game files directly
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# tar -czf dawn-huangjinkuanggong.tar.gz -C huangjinkuanggong .
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# tar -czf dawn-killbird.tar.gz -C killbird .

# clean up the original directory
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# rm -rf huangjinkuanggong killbird
```

## 4. Write the Dockerfile

```bash
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# cat Dockerfile
# specify the base image; every later operation builds on top of it
FROM alpine:3.20.2

# run commands inside the container to install the nginx service
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && \
     apk update && \
     apk add nginx && \
     rm -rf /var/cache/ rm -f /usr/share/nginx/*  && \
     mkdir -pv /usr/share/nginx/html/huangjinkuanggong  && \
     mkdir -pv /usr/share/nginx/html/killbird

## copy "dawn-bird.zip" from the current directory into the container's / directory
#COPY dawn-huangjinkuanggong.tar.gz /
#COPY dawn-killbird.tar.gz /
#
#
## extract the application into the target directory inside the container
#RUN tar xf /dawn-huangjinkuanggong.tar.gz -C /usr/share/nginx/html/huangjinkuanggong && \
#    tar xf /dawn-killbird.tar.gz -C /usr/share/nginx/html/killbird && \
#    rm -f /dawn-huangjinkuanggong.tar.gz /dawn-killbird.tar.gz

# the ADD instruction auto-extracts the contents of the tar archive into the given path in the container; think of it as copying the file in first, then extracting it, then removing the source file
ADD dawn-huangjinkuanggong.tar.gz /usr/share/nginx/html/huangjinkuanggong
ADD dawn-killbird.tar.gz /usr/share/nginx/html/killbird

# copy a local file to the given path in the container, overwriting the existing file
COPY games.conf /etc/nginx/http.d/default.conf

# specify the container's startup command
CMD ["nginx","-g","daemon off;"]
```

## 5. Write the nginx config games.conf

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

## 6. Build the image

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

## 7. Observe the intermediate layers produced by the build (every Dockerfile instruction creates a new image layer)

```bash
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# docker image ls -a | grep -E '9b4495d60e31|51cdedf25280|0ffa408b4136|40640938b557|a2f446944fd8|324bc02ae123'
<none>                                         <none>     40640938b557   7 minutes ago       14.4MB
<none>                                         <none>     51cdedf25280   7 minutes ago       15.6MB
dawn-games                                     v2.6       9b4495d60e31   7 minutes ago       15.6MB
<none>                                         <none>     a2f446944fd8   7 minutes ago       9.25MB
<none>                                         <none>     0ffa408b4136   7 minutes ago       15.6MB
alpine                                         3.20.2     324bc02ae123   2 years ago         7.8MB
```

## 8. Start the container

```bash
root@docker01:/dawn/dockerfile/alpine/kuanggong-killbird# docker run -d --name games-test -p 8082:80 dawn-games:v2.6
383f09529e6ec1b2de0f67f2600de92e8ee920e66091b4832915ff611b0c253e
```

## 9. Edit the local hosts file and visit via the domain

```bash
11.0.1.121  game01.dawn.com
11.0.1.121  game02.dawn.com
```

http://game01.dawn.com:8082/

![image-20261028184914653](/images/docker-dockerfile-multi-game-image-add-image-20261028184914653.png)

http://game02.dawn.com:8082/

![image-20261028184929946](/images/docker-dockerfile-multi-game-image-add-image-20261028184929946.png)