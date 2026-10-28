---
title: "Docker in Practice: Tag Images with MAINTAINER and LABEL, and Inspect Metadata"
date: 2026-10-28T19:40:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Using a real dawn-games image, demonstrate writing author/school/email metadata into the Dockerfile with the deprecated MAINTAINER and the officially recommended LABEL, then reading .Author and .Config.Labels back with docker image inspect -f to verify, and starting the container with --network host to access over the host network. Includes a screenshot."
---

# Docker in Practice: Tag Images with MAINTAINER and LABEL, and Inspect Metadata

Tagging an image is a basic part of the release workflow. Using a real `dawn-games` image as an example, this article first writes author, school, email and other metadata into the Dockerfile with the (now deprecated) `MAINTAINER` instruction and the more canonical `LABEL` instruction. After building, it reads those fields back with `docker image inspect -f '{{.Author}}'` / `'{{.Config.Labels.xxx}}'` to verify them, then starts the container directly with `--network host` and accesses it over the host network to validate. (Includes a screenshot of the access.)

## Tag the Image

### 1. Write the Dockerfile

```dockerfile
FROM alpine:3.20.2

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && \
     apk update && \
     apk add nginx && \
     rm -rf /var/cache/ rm -f /usr/share/nginx/*  && \
     mkdir -pv /usr/share/nginx/html/tanke

ADD code/dawn-tanke.tar.gz /usr/share/nginx/html/tanke

COPY config/games.conf /etc/nginx/http.d/default.conf

# Declare copyright, author info, email, company website, etc. This instruction is deprecated for poor readability.
MAINTAINER dawn 123456@dawn.com www.dawn.com xixi haha

# The official recommendation is to use the LABEL instruction instead of MAINTAINER
LABEL school=czu \
      class=computer01 \
      auther=dawn \
      email=123456@dawn.com \
      office=www.dawn.com

CMD ["nginx","-g","daemon off;"]
```

### 2. nginx Configuration File

```json
server {
    listen        0.0.0.0:80;
    root          /usr/share/nginx/html/tanke;
    server_name   game01.dawn.com;
}
```

### 3. Build the Image

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

### 4. Inspect Image Metadata

View Author (written by MAINTAINER)

```bash
root@docker01:/dawn/dockerfile/alpine/tankedazhan-MAINTAINER-LABELS# docker image inspect -f '{{.Author}}' dawn-games:v2.8
dawn 123456@dawn.com www.dawn.com xixi haha
```

View a single Labels field

```bash
root@docker01:/dawn/dockerfile/alpine/tankedazhan-MAINTAINER-LABELS# docker image inspect -f '{{.Config.Labels.auther}}' dawn-games:v2.8
dawn
```

View the full Labels (JSON format)

```bash
root@docker01:/dawn/dockerfile/alpine/tankedazhan-LABELS# docker image inspect -f '{{json .Config.Labels}}' dawn-games:v2.8
{"auther":"dawn","class":"computer01","email":"123456@dawn.com","office":"www.dawn.com","school":"czu"}
```

### 5. Start the Container and Test

```bash
docker container run -d --name games --network host dawn-games:v2.8
```

Starting with `--network host` lets the container use the host's port 80 directly, with no port mapping needed.

**Browser access**:

```
# Add to local hosts:
11.0.1.121  game01.dawn.com

# Browser:
http://game01.dawn.com/
```

![image-20261028194608894](/images/docker-image-tag-maintainer-label-metadata-image-20261028194608894.png)
