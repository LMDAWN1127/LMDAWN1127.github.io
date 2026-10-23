---
title: "Docker 镜像迁移实战：save/load 离线传输与打标签"
date: 2026-10-23T15:24:00+08:00
draft: false
tags: ["Docker"]
---

# Docker 镜像迁移实战：save/load 离线传输与打标签

## docker的镜像本地迁移及打标签

1. 导出镜像（docker02）

```bash
# docker save两种写法等价：-o 文件名 与 > 重定向
root@docker02:~# docker save -o /tmp/nginx-1304.tar uhub.service.ucloud.cn/dawn/nginx:1.30.4
root@docker02:~# ls -lh /tmp/nginx-1304.tar
-rw------- 1 root root 158M Oct 23 06:20 nginx-1304.tar
root@docker02:~# md5sum /tmp/nginx-1304.tar
43e327d0a216069d3931a2c498fe2e3f  nginx-1304.tar
```

2. 本地迁移（docker02 → docker01）

先配置 SSH 密钥互信

```bash
root@docker02:~# ssh-keygen
root@docker02:~# ssh-copy-id 11.0.1.121
```

docker02 上 scp 迁移

```bash
root@docker02:~# scp /tmp/nginx-1304.tar 11.0.1.121:/tmp/
```

docker01 上校验完整性（与源端 md5 一致）

```bash
root@docker01:~# md5sum /tmp/nginx-1304.tar
43e327d0a216069d3931a2c498fe2e3f  nginx-1304.tar
```

3. 导入镜像（docker01）

```bash
root@docker01:~# docker load -i /tmp/nginx-1304.tar
Loaded image: uhub.service.ucloud.cn/dawn/nginx:1.30.4
root@docker01:~# docker images
REPOSITORY                          TAG       IMAGE ID       CREATED        SIZE
uhub.service.ucloud.cn/dawn/nginx   1.30.4    886dbea595a1   2 months ago   161MB
```

IMAGE ID `886dbea595a1` 与 docker02 上的源镜像完全一致——save/load 迁移不改变镜像本身

4. 打标签

```bash
root@docker01:~# docker tag uhub.service.ucloud.cn/dawn/nginx:1.30.4 dawn/nginx:v1.30.4
root@docker01:~# docker images dawn/nginx
REPOSITORY   TAG       IMAGE ID       CREATED        SIZE
dawn/nginx   v1.30.4   886dbea595a1   2 months ago   161MB
```

5. 测试运行

```bash
root@docker01:~# docker run -d -p 85:80 --name web-test dawn/nginx:v1.30.4
461a06c0feb9cfbd23e5f49148a49de247d2aeb9ab3986a1c2d662ce412d084d
root@docker01:~# docker ps
NAMES      IMAGE                STATUS         PORTS
web-test   dawn/nginx:v1.30.4   Up 2 seconds   0.0.0.0:85->80/tcp, :::85->80/tcp
root@docker01:~# curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:85/
HTTP 200
```



6. 一次性导出多个镜像

```bash
root@docker02:~# docker save $(docker images --format '{{.Repository}}:{{.Tag}}') > all-images.tar
```

7. 导入镜像的两种方式

  方式一：

```bash
root@docker01:~# docker load -i /tmp/nginx-1304.tar
```

  方式二：

```bash
root@docker01:~# docker image load < /tmp/nginx-1304.tar
```

  方式二导入时不会弹出很多提示的原因是已经导入过了，如果想要看到类似的效果可以先删除再导入

8. 批量删除镜像的方式

  方式一：

```bash
root@docker01:~# docker image rm `docker image ls -q`
```

  方式二：

```bash
root@docker01:~# docker rmi `docker image ls -q`
```
