---
title: "Docker 実戦：WordPress のマルチノード展開と永続化検証"
date: 2026-10-26T16:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "WordPress を Docker で 2 ノードにまたがって展開 (データベースと Web を分離) し、名前付きボリュームでデータを永続化した上で、コンテナを削除して再作成し、公開済みブログが失われないことを検証します。"
---

# Docker 実戦：WordPress のマルチノード展開と永続化検証

実験の目的:

WordPress を Docker でデプロイし、テストブログを公開します。要件は、データベースと WordPress コンテナを 2 つの異なるノードに配置し、データベースと WordPress コンテナを削除した後、新しいコンテナを再作成して公開済みブログが失われないことを確認することです。

## 1. データベースを起動

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

## 2. データベースのマウント情報を確認

```bash
root@docker02:~# docker container inspect -f "{{range .Mounts }}容器挂载路径: {{.Destination}} 宿主机路径: {{.Source}}{{end}}" mysql-server
容器挂载路径: /var/lib/mysql 宿主机路径: /var/lib/docker/volumes/dawn/_data
```

## 3. WordPress を起動

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

## 4. WordPress を初期化してインストール

  http://11.0.1.121/

![image-20261026162513717](/images/docker-wordpress-multinode-image-20261026162513717.png)

![image-20261026162927303](/images/docker-wordpress-multinode-image-20261026162927303.png)

![image-20261026163043591](/images/docker-wordpress-multinode-image-20261026163043591.png)

## 5. コンテナを削除

```bash
root@docker01:~# docker container rm -f `docker container ps -qa`
48a48bcb637c
root@docker02:~# docker container rm -f `docker container ps -qa`
57460e172c20
```

## 6. インスタンスを再起動し、正常にアクセスできるか確認

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