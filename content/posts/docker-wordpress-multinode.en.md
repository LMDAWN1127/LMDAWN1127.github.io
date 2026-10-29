---
title: "Docker in Practice: WordPress Multi-Node Deployment and Persistence Verification"
date: 2026-10-26T16:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Deploy WordPress with Docker across two nodes (database and web separated), persist data with named volumes, then delete and recreate the containers to verify the published blog is not lost."
---

# Docker in Practice: WordPress Multi-Node Deployment and Persistence Verification

Experiment goal:

Deploy WordPress with Docker and publish a test blog. The requirement is that the database and the WordPress container run on two different nodes; after deleting the database and WordPress containers, recreate new containers to ensure the published blog is not lost.

## 1. Start the database

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

## 2. Inspect the database's mount information

```bash
root@docker02:~# docker container inspect -f "{{range .Mounts }}Container mount path: {{.Destination}} Host path: {{.Source}}{{end}}" mysql-server
Container mount path: /var/lib/mysql Host path: /var/lib/docker/volumes/dawn/_data
```

## 3. Start WordPress

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

## 4. Initialize and install WordPress

  http://11.0.1.121/

![image-20261026162513717](/images/docker-wordpress-multinode-image-20261026162513717.png)

![image-20261026162927303](/images/docker-wordpress-multinode-image-20261026162927303.png)

![image-20261026163043591](/images/docker-wordpress-multinode-image-20261026163043591.png)

## 5. Delete the containers

```bash
root@docker01:~# docker container rm -f `docker container ps -qa`
48a48bcb637c
root@docker02:~# docker container rm -f `docker container ps -qa`
57460e172c20
```

## 6. Restart the instances and check whether access works normally

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