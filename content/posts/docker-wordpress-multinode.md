---
title: "Docker 实战：WordPress 跨节点部署与持久化验证"
date: 2026-10-26T16:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Docker 实战：将 WordPress 与 MySQL 跨两个节点部署（数据库与 Web 分离），使用命名卷持久化数据，验证删除并重建容器后已发表的博客不丢失。"
---

# Docker 实战：WordPress 跨节点部署与持久化验证

实验目的：

将wordpress使用docker部署，发表测试的博客，要求数据库和wordpress容器在2个不同的节点部署，删除数据库和wordpress容器后再重新创建新容器保证已经发表的博客不丢失

## 1. 启动数据库

```bash
root@docker02:~# docker run --name mysql-server \
  -e MYSQL_ALLOW_EMPTY_PASSWORD=yes \
  -e MYSQL_DATABASE=wordpress \
  -e MYSQL_USER=dawn \
  -e MYSQL_PASSWORD=123456 \
  -v dawn:/var/lib/mysql \
  -d \
  -p 13306:3306 \
  mysql:8.4.1-oracle
```

## 2. 查看数据库的挂载信息

```bash
root@docker02:~# docker container inspect -f "{{range .Mounts }}容器挂载路径: {{.Destination}} 宿主机路径: {{.Source}}{{end}}" mysql-server
容器挂载路径: /var/lib/mysql 宿主机路径: /var/lib/docker/volumes/dawn/_data
```

## 3. 启动wordpress

```bash
root@docker01:~# docker run -d --name wordpress \
  -e WORDPRESS_DB_HOST=11.0.1.122:13306 \
  -e WORDPRESS_DB_USER=dawn \
  -e WORDPRESS_DB_PASSWORD=123456 \
  -e WORDPRESS_DB_NAME=wordpress \
  -p 80:80 \
  -v wordpress:/var/www/html/ \
  uhub.service.ucloud.cn/dawn/wordpress:6.8
48a48bcb637c1f12b6a4f311991a119269e05a0cfaed50739377edef74dc35e0
```

## 4. 初始化安装wordpress

  http://11.0.1.121/

![image-20261026162513717](/images/docker-wordpress-multinode-image-20261026162513717.png)

![image-20261026162927303](/images/docker-wordpress-multinode-image-20261026162927303.png)

![image-20261026163043591](/images/docker-wordpress-multinode-image-20261026163043591.png)

## 5. 删除容器

```bash
root@docker01:~# docker container rm -f `docker container ps -qa`
48a48bcb637c
root@docker02:~# docker container rm -f `docker container ps -qa`
57460e172c20
```

## 6. 重启实例观察是否可以正常访问

  ```bash
root@docker02:~# docker run --name mysql-server \
  -e MYSQL_ALLOW_EMPTY_PASSWORD=yes \
  -e MYSQL_DATABASE=wordpress \
  -e MYSQL_USER=dawn \
  -e MYSQL_PASSWORD=123456 \
  -v dawn:/var/lib/mysql \
  -d \
  -p 13306:3306 \
  mysql:8.4.1-oracle
  
root@docker01:~# docker run -d --name wordpress \
  -e WORDPRESS_DB_HOST=11.0.1.122:13306 \
  -e WORDPRESS_DB_USER=dawn \
  -e WORDPRESS_DB_PASSWORD=123456 \
  -e WORDPRESS_DB_NAME=wordpress \
  -p 80:80 \
  -v wordpress:/var/www/html/ \
  uhub.service.ucloud.cn/dawn/wordpress:6.8
48a48bcb637c1f12b6a4f311991a119269e05a0cfaed50739377edef74dc35e0
  ```

![image-20261026163215647](/images/docker-wordpress-multinode-image-20261026163215647.png)