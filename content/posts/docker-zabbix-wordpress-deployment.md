---
title: "Docker 实战：Docker 部署 Zabbix 监控与 WordPress 应用"
date: 2026-10-27T12:19:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Docker 实战：基于自定义网络，用 docker run 单机部署 Zabbix 监控（MySQL + Java gateway + Server + Web）与 WordPress 应用，含端口映射与持久化卷。"
---

# Docker 实战：Docker 部署 Zabbix 监控与 WordPress 应用

## 1. Docker 部署 Zabbix 监控

### 1.1 创建自定义网络

```bash
root@docker02:~# docker network create --subnet 172.20.0.0/16 --ip-range 172.20.240.0/20 zabbix-net
```

### 1.2 拉取镜像

```bash
root@docker02:~# docker pull uhub.service.ucloud.cn/dawn/zabbix-java-gateway:alpine-6.4-latest
alpine-6.4-latest: Pulling from dawn/zabbix-java-gateway
1f3e46996e29: Pull complete
606afb1ae72a: Pull complete
ccfcbe66b58e: Pull complete
4f4fb700ef54: Pull complete
6826ebbfaf77: Pull complete
24e4063b9d6e: Pull complete
Digest: sha256:62a3ac79df6ab0515afbb4cba634b2079bd875dbeff55fe33d52cca9d1ae3e74
Status: Downloaded newer image for uhub.service.ucloud.cn/dawn/zabbix-java-gateway:alpine-6.4-latest
uhub.service.ucloud.cn/dawn/zabbix-java-gateway:alpine-6.4-latest
root@docker02:~# docker pull uhub.service.ucloud.cn/dawn/zabbix-server-mysql:alpine-6.4-latest
alpine-6.4-latest: Pulling from dawn/zabbix-server-mysql
1f3e46996e29: Already exists
1772a90c6a5c: Pull complete
f803498c2d79: Pull complete
152feda2c3af: Pull complete
fe17bf02638c: Pull complete
e266bac3ed30: Pull complete
4f4fb700ef54: Pull complete
2d84b546e482: Pull complete
Digest: sha256:0fb69d03ef61011df4fc9e95432bc5b4797f85f864e067dab43d81b103cf85f8
Status: Downloaded newer image for uhub.service.ucloud.cn/dawn/zabbix-server-mysql:alpine-6.4-latest
uhub.service.ucloud.cn/dawn/zabbix-server-mysql:alpine-6.4-latest
root@docker02:~# docker pull uhub.service.ucloud.cn/dawn/zabbix-web-nginx-mysql:alpine-6.4-latest
alpine-6.4-latest: Pulling from dawn/zabbix-web-nginx-mysql
1f3e46996e29: Already exists
f22e0f609cf2: Pull complete
447f8b7a49df: Pull complete
17c1c2cf73ef: Pull complete
4f4fb700ef54: Pull complete
47f2a23549dd: Pull complete
Digest: sha256:a438cf5e4b6ebf04f829c5bbdf6873f88c72f7dce3aaedbfdbe3233be91c125d
Status: Downloaded newer image for uhub.service.ucloud.cn/dawn/zabbix-web-nginx-mysql:alpine-6.4-latest
uhub.service.ucloud.cn/dawn/zabbix-web-nginx-mysql:alpine-6.4-latest
```

### 1.3 启动MySQL

```bash
root@docker02:~# docker run -d --name mysql-server \
  --network zabbix-net --restart unless-stopped \
  -e MYSQL_ROOT_PASSWORD="123456" -e MYSQL_DATABASE=zabbix \
  -e MYSQL_USER=dawn -e MYSQL_PASSWORD="123456" \
  -v mysql-data:/var/lib/mysql \
  mysql:8.4.1-oracle \
  --character-set-server=utf8 --collation-server=utf8_bin
1fcaef6f24b7910ad50396cccd5c55f74a4236d586d2a9d0213c2ba8eae38119
```

### 1.4 部署Java gateway组件

```bash
root@docker02:~# docker run --name zabbix-java-gateway \
      --network=zabbix-net \
      --restart unless-stopped \
      -d uhub.service.ucloud.cn/dawn/zabbix-java-gateway:alpine-6.4-latest
8810d4427089a2e85f222a1ec797244de5680d337991a50d78d4546f20d2ad0b
```

### 1.5 部署Zabbix server 组件

```bash
root@docker02:~# docker run --name zabbix-server-mysql \
      -e DB_SERVER_HOST="mysql-server" \
      -e MYSQL_DATABASE="zabbix" \
      -e MYSQL_USER="dawn" \
      -e MYSQL_PASSWORD="123456" \
      -e MYSQL_ROOT_PASSWORD="123456" \
      -e ZBX_JAVAGATEWAY="zabbix-java-gateway" \
      --network=zabbix-net \
      -p 10051:10051 \
      --restart unless-stopped \
      -d uhub.service.ucloud.cn/dawn/zabbix-server-mysql:alpine-6.4-latest
b32956d36e5b86a7e0f1c9f24a44a586fb64b47c22684d8247c385d858543e52
```

### 1.6 部署Zabbix web组件

```bash
root@docker02:~# docker run --name zabbix-web-nginx-mysql \
      -e ZBX_SERVER_HOST="zabbix-server-mysql" \
      -e DB_SERVER_HOST="mysql-server" \
      -e MYSQL_DATABASE="zabbix" \
      -e MYSQL_USER="dawn" \
      -e MYSQL_PASSWORD="123456" \
      -e MYSQL_ROOT_PASSWORD="123456" \
      --network=zabbix-net \
      -p 80:8080 \
      --restart unless-stopped \
      -d uhub.service.ucloud.cn/dawn/zabbix-web-nginx-mysql:alpine-6.4-latest
66aa92aa7e1e8accee66b22eeddcc89fe93ccabc92de25458c9dd48ae67e6396
```

### 1.7 访问测试

![image-20261027120200988](/images/docker-zabbix-wordpress-deployment-image-20261027120200988.png)

![image-20261027120349327](/images/docker-zabbix-wordpress-deployment-image-20261027120349327.png)



## 2. Docker 部署 WordPress

### 2.1 创建自定义网络

```bash
root@docker02:~# docker network create --subnet 172.21.0.0/16 --ip-range 172.21.100.0/24 wp
```

### 2.2 启动数据库

```bash
root@docker02:~# docker run --name db-wp \
  -e MYSQL_ALLOW_EMPTY_PASSWORD=yes \
  -e MYSQL_DATABASE=wordpress \
  -e MYSQL_USER=dawn \
  -e MYSQL_PASSWORD=123456 \
  -v wp-data:/var/lib/mysql \
  -d \
  --network wp \
  mysql:8.4.1-oracle
43aa4887e26a89c46022bbeee95fa2bcc4fef6b4f85ca0c6ea5e46dc9efa0dc9
```

### 2.3 启动wordpress

```bash
root@docker02:~# docker run -d --name wp \
  -e WORDPRESS_DB_HOST=db-wp \
  -e WORDPRESS_DB_USER=dawn \
  -e WORDPRESS_DB_PASSWORD=123456 \
  -e WORDPRESS_DB_NAME=wordpress \
  -p 88:80 \
  -v wordpress:/var/www/html/ \
  --network wp \
  uhub.service.ucloud.cn/dawn/wordpress:6.8
adb9f4800e948d341ad3eeb335ae6ecf0d2b4b41478bd926ba10bd3534f81248
```

### 2.4 测试访问

![image-20261027121904441](/images/docker-zabbix-wordpress-deployment-image-20261027121904441.png)
