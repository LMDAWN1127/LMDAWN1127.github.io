---
title: "Docker in Practice: Image Migration - Offline save/load Transfer and Tagging"
date: 2026-10-23T15:24:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Export an image with docker save, transfer it offline over SSH, verify integrity with md5sum, then import it with docker load and re-tag it. Shows that save/load preserves the IMAGE ID, how to export multiple images at once, two import forms, and two ways to batch-delete images."
---

# Docker in Practice: Image Migration - Offline save/load Transfer and Tagging

## Local image migration and tagging

1. Export the image (docker02)

```bash
# the two docker save forms are equivalent: -o <file> and > redirection
root@docker02:~# docker save -o /tmp/nginx-1304.tar uhub.service.ucloud.cn/dawn/nginx:1.30.4
root@docker02:~# ls -lh /tmp/nginx-1304.tar
-rw------- 1 root root 158M Oct 23 06:20 nginx-1304.tar
root@docker02:~# md5sum /tmp/nginx-1304.tar
43e327d0a216069d3931a2c498fe2e3f  nginx-1304.tar
```

2. Local migration (docker02 -> docker01)

Configure SSH key-based mutual trust first

```bash
root@docker02:~# ssh-keygen
root@docker02:~# ssh-copy-id 11.0.1.121
```

scp the image from docker02

```bash
root@docker02:~# scp /tmp/nginx-1304.tar 11.0.1.121:/tmp/
```

Verify integrity on docker01 (md5 matches the source)

```bash
root@docker01:~# md5sum /tmp/nginx-1304.tar
43e327d0a216069d3931a2c498fe2e3f  nginx-1304.tar
```

3. Import the image (docker01)

```bash
root@docker01:~# docker load -i /tmp/nginx-1304.tar
Loaded image: uhub.service.ucloud.cn/dawn/nginx:1.30.4
root@docker01:~# docker images
REPOSITORY                          TAG       IMAGE ID       CREATED        SIZE
uhub.service.ucloud.cn/dawn/nginx   1.30.4    886dbea595a1   2 months ago   161MB
```

The IMAGE ID `886dbea595a1` is exactly the same as the source image on docker02 - save/load migration does not alter the image itself

4. Tag the image

```bash
root@docker01:~# docker tag uhub.service.ucloud.cn/dawn/nginx:1.30.4 dawn/nginx:v1.30.4
root@docker01:~# docker images dawn/nginx
REPOSITORY   TAG       IMAGE ID       CREATED        SIZE
dawn/nginx   v1.30.4   886dbea595a1   2 months ago   161MB
```

5. Test run

```bash
root@docker01:~# docker run -d -p 85:80 --name web-test dawn/nginx:v1.30.4
461a06c0feb9cfbd23e5f49148a49de247d2aeb9ab3986a1c2d662ce412d084d
root@docker01:~# docker ps
NAMES      IMAGE                STATUS         PORTS
web-test   dawn/nginx:v1.30.4   Up 2 seconds   0.0.0.0:85->80/tcp, :::85->80/tcp
root@docker01:~# curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:85/
HTTP 200
```



6. Export multiple images at once

```bash
root@docker02:~# docker save $(docker images --format '{{.Repository}}:{{.Tag}}') > all-images.tar
```

7. Two ways to import an image

  Method 1:

```bash
root@docker01:~# docker load -i /tmp/nginx-1304.tar
```

  Method 2:

```bash
root@docker01:~# docker image load < /tmp/nginx-1304.tar
```

The reason method 2 shows fewer prompts is that the image was already imported; to see the same effect, delete it first and then import.

8. Ways to batch-delete images

  Method 1:

```bash
root@docker01:~# docker image rm `docker image ls -q`
```

  Method 2:

```bash
root@docker01:~# docker rmi `docker image ls -q`
```
