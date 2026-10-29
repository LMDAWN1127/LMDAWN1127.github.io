---
title: "Docker in Practice: Deploying Applications - Tomcat / MySQL / WordPress / ELK"
date: 2026-10-26T14:10:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Deploy real applications with docker run: Tomcat, MySQL (including bulk 20-instance startup and multi-instance exposure), WordPress and the ElasticSearch + Kibana stack, with port mapping, persistent volumes and password/token setup."
---

# Docker in Practice: Deploying Applications - Tomcat / MySQL / WordPress / ELK

## 1. Deploy Tomcat with Docker

1. Create the container

```bash
root@docker02:~# docker run -d -p 8080:8080 tomcat:9.0-jdk17
root@docker02:~# docker exec goofy_ramanujan sh -c 'mv webapps.dist/* webapps/'
```

2. Access test

http://11.0.1.122:8080/

![image-20261023155148753](/images/docker-app-deployments-image-20261023155148753.png)

## 2. Deploy MySQL with Docker

1. Download the official image

```bash
root@docker02:~# docker pull mysql:8.4.1-oracle
```

2. Start MySQL

```bash
root@docker02:~# docker images
REPOSITORY                          TAG            IMAGE ID       CREATED        SIZE
tomcat                              9.0-jdk17      e726f39ab438   6 days ago     471MB
uhub.service.ucloud.cn/dawn/nginx   1.30.4         886dbea595a1   2 months ago   161MB
uhub.service.ucloud.cn/dawn/nginx   latest         4e5db4761e0f   3 months ago   161MB
mysql                               8.4.1-oracle   da8f2a99cf39   2 years ago    583MB
root@docker02:~# docker run --name mysql-server -e MYSQL_ROOT_PASSWORD=123456 -d mysql:8.4.1-oracle
3bfde430e3ba58d6589d38014f616847f21c5801723ec48f5f30a0b20bb8ed8c
```

3. Inspect the container

```bash
root@docker02:~# docker ps -l
CONTAINER ID   IMAGE                COMMAND                  CREATED          STATUS          PORTS                 NAMES
3bfde430e3ba   mysql:8.4.1-oracle   "docker-entrypoint.s…"   43 seconds ago   Up 43 seconds   3306/tcp, 33060/tcp   mysql-server
```

4. Connect to the MySQL database

```bash
root@docker02:~# docker exec -it mysql-server mysql -p123456
mysql: [Warning] Using a password on the command line interface can be insecure.
Welcome to the MySQL monitor.  Commands end with ; or \g.
Your MySQL connection id is 8
Server version: 8.4.1 MySQL Community Server - GPL

Copyright (c) 2000, 2024, Oracle and/or its affiliates.

Oracle is a registered trademark of Oracle Corporation and/or its
affiliates. Other names may be trademarks of their respective
owners.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

mysql> SHOW DATABASES;
+--------------------+
| Database           |
+--------------------+
| information_schema |
| mysql              |
| performance_schema |
| sys                |
+--------------------+
4 rows in set (0.00 sec)

mysql>
```

5. Create the specified database and user

```bash
root@docker02:~# docker run --name mysql-server02 -e MYSQL_ALLOW_EMPTY_PASSWORD=yes -e MYSQL_DATABASE=docker -e MYSQL_USER=dawn -e MYSQL_PASSWORD=123456 -d mysql:8.4.1-oracle
```

6. Verification test

```sql
root@docker02:~# docker exec -it mysql-server02 mysql
Welcome to the MySQL monitor.  Commands end with ; or \g.
Your MySQL connection id is 8
Server version: 8.4.1 MySQL Community Server - GPL

Copyright (c) 2000, 2024, Oracle and/or its affiliates.

Oracle is a registered trademark of Oracle Corporation and/or its
affiliates. Other names may be trademarks of their respective
owners.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

mysql> SHOW DATABASES;
+--------------------+
| Database           |
+--------------------+
| docker             |
| information_schema |
| mysql              |
| performance_schema |
| sys                |
+--------------------+
5 rows in set (0.00 sec)

mysql> SELECT user,host,plugin FROM mysql.user;
+------------------+-----------+-----------------------+
| user             | host      | plugin                |
+------------------+-----------+-----------------------+
| dawn             | %         | caching_sha2_password |
| root             | %         | caching_sha2_password |
| mysql.infoschema | localhost | caching_sha2_password |
| mysql.session    | localhost | caching_sha2_password |
| mysql.sys        | localhost | caching_sha2_password |
| root             | localhost | caching_sha2_password |
+------------------+-----------+-----------------------+
6 rows in set (0.00 sec)

mysql>
```

Start 20 database instances in bulk

```bash
root@docker02:~# for i in `seq 20`; do docker run --name mysql-server-haha${i} -e MYSQL_ALLOW_EMPTY_PASSWORD=yes -e MYSQL_DATABASE=docker -e MYSQL_USER=dawn -e MYSQL_PASSWORD=123456 -d mysql:8.4.1-oracle; done
6f9fee3ec8ff03d0095dc75fe31e784f5a2ed452232dadc52202e97d400b5179
cf078a3a59e2f01d0be618ed1393f27613600e1441552b51d56816a07540a183
edcc8fd33c9f5c79020d416d821312977e0a09c765a35843b92cfbfd0ffe1354
9defa7d6d5563cea5035775a6cdc0e2901877bc4b40022c75bac12034a1d6baa
508c0d365d4c1d24396781ec0bba67378fb18f4201ac8b039ba2a66a794d0d24
db5cddee5884d4baaac33241f902def85879f19bfe3af7a5548555d7b11fb376
8b7ad872f07ad8b897079c8ec4cd6f7e075cf22f542d9b41f55f2168f8ec95ce
ce0dfcbae42adef389f4ab141aeaf2a389d5c3894ebf4ac156907f126951f419
b2cbd44e225be91b827e167b6d75c9df2ad0fe625ab22d81479810033fa0272e
806899b3e1148a4a85bee66af301b8c079fe642402065b98a0aabb1ec8d40452
7521cf0b3dbf9f645fa320f876edb995fb610c1910fc40bbccea140b24f789b1
a0f0ca4090576c4519dc4f5f30c1f9e949ae6d3a2561708447e4be326e92f2c2
cab8572436cd1a934b951a10940c4ddcc41373e48ef4d8fe65a6a8e92a0e576d
8601e286c652baa9e94c17a743df44e3a1b894d2c78031fcdf65a9450075b2ce
27949a4f211b7ebb86d5803b1b7109a917d5b0ca9f86589137d9b62d563f63a3
cfb49367e2176cc21412ea3741055276abb44d338ef53e44fe0597384c1eb0df
c700c810219bc2d43f16e47753ff36a874178afe02a7f92aabfbbd31404f8de1
1ef6b2525955f2b1d4f320992fdd1eb61215222e22f7d79590588737086b755a
e33cbacc4b2c576e4f235e1de73bf3075370fa8a0f9ab9f3f3fc8b18c179d5a4
29ae103a02277d638082935d3703f51fabbc3b306ee80915b509ea82553b59f8
```

Expose services from multiple instances

```bash
root@docker02:~# docker run -d --name mysql-server01 -e MYSQL_ROOT_PASSWORD=123456 -p 13306:3306 -d mysql:8.4.1-oracle
090858aee291ef1eebb7b9da003362778ae4ac7a88e812f191b8687aaf37ba29
root@docker02:~# docker run -d --name mysql-server02 -e MYSQL_ROOT_PASSWORD=123456 -p 13307:3306 -d mysql:8.4.1-oracle
ba9679028f91c6d0fb6d65b674272a583e149f8bdad050f09f6c95f27ece09c0
root@docker02:~# docker run -d --name mysql-server03 -e MYSQL_ROOT_PASSWORD=123456 -p 13308:3306 -d mysql:8.4.1-oracle
cf95384ff0383b3b1751c38af84f94bc1ad416573d72b6b7013e8ef0bd4d615d
root@docker02:~# docker container ps
CONTAINER ID   IMAGE                COMMAND                  CREATED          STATUS          PORTS                                                    NAMES
679dcdcfae5c   mysql:8.4.1-oracle   "docker-entrypoint.s…"   11 seconds ago   Up 10 seconds   33060/tcp, 0.0.0.0:13308->3306/tcp, :::13308->3306/tcp   mysql-server03
ebc1783f77fd   mysql:8.4.1-oracle   "docker-entrypoint.s…"   22 seconds ago   Up 21 seconds   33060/tcp, 0.0.0.0:13307->3306/tcp, :::13307->3306/tcp   mysql-server02
1b521f6f7071   mysql:8.4.1-oracle   "docker-entrypoint.s…"   30 seconds ago   Up 29 seconds   33060/tcp, 0.0.0.0:13306->3306/tcp, :::13306->3306/tcp   mysql-server01
```

## 3. Deploy WordPress with Docker

Pull the image

```bash
root@docker01:~# docker pull uhub.service.ucloud.cn/dawn/wordpress:6.8
```

Start the database

```bash
root@docker02:~# docker run --name mysql-server02 \
  -e MYSQL_ALLOW_EMPTY_PASSWORD=yes \
  -e MYSQL_DATABASE=wordpress \
  -e MYSQL_USER=dawn \
  -e MYSQL_PASSWORD=123456 \
  -d \
  -p 13306:3306 \
  mysql:8.4.1-oracle
```

Deploy WordPress

```bash
root@docker01:~# docker images
REPOSITORY                              TAG       IMAGE ID       CREATED         SIZE
dawn/nginx                              v1.30.4   886dbea595a1   2 months ago    161MB
uhub.service.ucloud.cn/dawn/nginx       1.30.4    886dbea595a1   2 months ago    161MB
uhub.service.ucloud.cn/dawn/wordpress   6.8       8f5bd798d300   10 months ago   734MB
root@docker01:~# docker run -d --name wp -e WORDPRESS_DB_HOST=11.0.1.122:13306 -e WORDPRESS_DB_USER=dawn -e WORDPRESS_DB_PASSWORD=123456 -e WORDPRESS_DB_NAME=wordpress -p 80:80 uhub.service.ucloud.cn/dawn/wordpress:6.8
48ae8e77a8307a24ddb196100355e3ea4c4b23f539efa705ad46d48b8b0ea90e
root@docker01:~# docker ps
CONTAINER ID   IMAGE                                       COMMAND                  CREATED          STATUS         PORTS                               NAMES
48ae8e77a830   uhub.service.ucloud.cn/dawn/wordpress:6.8   "docker-entrypoint.s…"   10 seconds ago   Up 7 seconds   0.0.0.0:80->80/tcp, :::80->80/tcp   wp
461a06c0feb9   dawn/nginx:v1.30.4                          "/docker-entrypoint.…"   2 hours ago      Up 2 hours     0.0.0.0:85->80/tcp, :::85->80/tcp   web-test
```

Access the WordPress Web UI

  http://11.0.1.121/

![image-20261023164433329](/images/docker-app-deployments-image-20261023164433329.png)

## 4. Deploy ElasticSearch with Docker

1. Deploy a single-node ES service

```bash
root@docker02:~# docker run -d --name es01  -p 9200:9200 -e "discovery.type=single-node" uhub.service.ucloud.cn/dawn/elasticsearch:8.14.3
```

2. Reset the elastic password

```bash
root@docker02:~# docker exec -it es01 /usr/share/elasticsearch/bin/elasticsearch-reset-password -u elastic
WARNING: Owner of file [/usr/share/elasticsearch/config/users] used to be [root], but now is [elasticsearch]
WARNING: Owner of file [/usr/share/elasticsearch/config/users_roles] used to be [root], but now is [elasticsearch]
This tool will reset the password of the [elastic] user to an autogenerated value.
The password will be printed in the console.
Please confirm that you would like to continue [y/N]y


Password for the [elastic] user successfully reset.
New value: jKSbJe3qLG6aHxbmRBhb
```

## 5. Deploy Kibana with Docker

This must be done on the same Docker host as ES

1. Deploy Kibana

```bash
root@docker02:~# docker run -d --name kibana  -p 5601:5601 uhub.service.ucloud.cn/dawn/kibana:8.14.3
```

2. Check whether Kibana is running

```bash
root@docker02:~# docker ps
CONTAINER ID   IMAGE                                              COMMAND                  CREATED              STATUS              PORTS                                                    NAMES
23d3c92b8ff8   uhub.service.ucloud.cn/dawn/kibana:8.14.3          "/bin/tini -- /usr/l…"   About a minute ago   Up About a minute   0.0.0.0:5601->5601/tcp, :::5601->5601/tcp                kibana
31198819a488   uhub.service.ucloud.cn/dawn/elasticsearch:8.14.3   "/bin/tini -- /usr/l…"   7 minutes ago        Up 7 minutes        0.0.0.0:9200->9200/tcp, :::9200->9200/tcp, 9300/tcp      es01
8900f6bbf926   mysql:8.4.1-oracle                                 "docker-entrypoint.s…"   27 minutes ago       Up 27 minutes       33060/tcp, 0.0.0.0:13306->3306/tcp, :::13306->3306/tcp   mysql-server02
```

3. Generate a Kibana TOKEN on the ES node

```bash
root@docker02:~# docker exec -it es01 /usr/share/elasticsearch/bin/elasticsearch-create-enrollment-token -s kibana
eyJ2ZXIiOiI4LjE0LjAiLCJhZHIiOlsiMTcyLjE3LjAuMzo5MjAwIl0sImZnciI6IjY3YmVmODEzZDAyMGM4ZDY5MjBlMDE0ZjUyMjQ1YWRlY2Q2ZjRkMTVmYWY5NTAyY2MwODM4ZjdlM2UwNTA2NjQiLCJrZXkiOiJTQlBfWjZFQnZqU3pLVzZfOS0zVjowdXQtM19qbVNPR0RwT21vcmtWVk13In0=
```

4. Paste the token from the previous step into the Kibana Web UI

  http://11.0.1.122:5601/

![image-20261023170426953](/images/docker-app-deployments-image-20261023170426953.png)

5. Generate a verification code on the Kibana server

```bash
root@docker02:~# docker exec kibana /usr/share/kibana/bin/kibana-verification-code
Kibana is currently running with legacy OpenSSL providers enabled! For details and instructions on how to disable see https://www.elastic.co/guide/en/kibana/8.14/production.html#openssl-legacy-provider
Your verification code is:  040 210
```

![image-20261023170540120](/images/docker-app-deployments-image-20261023170540120.png)

6. Change the password of the elastic user
