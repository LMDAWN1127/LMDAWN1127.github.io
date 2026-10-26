---
title: "Docker 实战：用 inspect 查看容器 PID、ID 与网络信息"
date: 2026-10-26T13:00:00+08:00
slug: docker-inspect-pid-id-network
tags: ["Docker"]
categories: ["Docker"]
draft: false
---

# Docker 实战：用 inspect 查看容器 PID、ID 与网络信息

## 1.查看容器的进程ID

```bash
root@docker02:~# docker container inspect -f "{{ .State.Pid }}" c1
4800
```

## 2.查看容器ID

```bash
root@docker02:~# docker container inspect -f "{{ .Id }}" c1
ece223aa9840347b908016a8b665f68ac87185aceea0a8ab3ccd508de90c12b5
```

## 3.查看IP地址信息

```bash
root@docker02:~# docker container inspect -f "{{ .NetworkSettings.IPAddress }}" c1
172.17.0.5
root@docker02:~# docker container inspect -f "{{ .NetworkSettings.Networks.bridge.IPAddress }}" c1
172.17.0.5
root@docker02:~# docker container inspect -f "{{ range .NetworkSettings.Networks }}{{ .IPAddress }}{{end}}" c1
172.17.0.5
root@docker02:~# docker container inspect -f "{{ range .NetworkSettings.Networks }}{{ .Gateway }}{{end}}" c1
172.17.0.1
root@docker02:~# docker container inspect -f "{{ range .NetworkSettings.Networks }}{{ .MacAddress }}{{end}}" c1
02:42:ac:11:00:05
```

## 4.查看最近一个容器创建的IP地址

```bash
root@docker02:~# docker container inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" `docker container ps -lq`
172.17.0.5
```
