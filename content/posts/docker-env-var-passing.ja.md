---
title: "Docker 実戦：コンテナの環境変数の渡し方と確認方法"
date: 2026-10-23T17:26:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "コンテナに -e で環境変数を渡し、後から docker exec <コンテナ> env で確認する方法を解説します。"
---

# Docker 実戦：コンテナの環境変数の渡し方と確認方法

## コンテナへの環境変数の渡し方

1. コンテナを起動する

```bash
root@docker02:~# docker run -d --name c1 -e SCHOOL=dawn -e CLASS=docker uhub.service.ucloud.cn/dawn/nginx:1.30.4
aa3538d29cc8ea72d6058d48b4c038b4f3234e6bf3ff970432c66b80f935d6a4
root@docker02:~# docker ps -l
CONTAINER ID   IMAGE                                      COMMAND                  CREATED          STATUS          PORTS     NAMES
aa3538d29cc8   uhub.service.ucloud.cn/dawn/nginx:1.30.4   "/docker-entrypoint.…"   13 seconds ago   Up 12 seconds   80/tcp    c1
```

2. 環境変数を確認する

```bash
root@docker02:~# docker exec c1 env
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
HOSTNAME=aa3538d29cc8
SCHOOL=dawn
CLASS=docker
NGINX_VERSION=1.30.4
NJS_VERSION=1.0.0
NJS_RELEASE=1~trixie
ACME_VERSION=0.4.1
PKG_RELEASE=1~trixie
DYNPKG_RELEASE=1~trixie
HOME=/root
```
