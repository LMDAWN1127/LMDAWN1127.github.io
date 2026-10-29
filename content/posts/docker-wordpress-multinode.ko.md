---
title: "Docker 실전: WordPress 멀티 노드 배포와 영속성 검증"
date: 2026-10-26T16:30:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "WordPress 를 Docker 로 두 노드에 걸쳐 배포 (데이터베이스와 웹 분리) 하고 이름 지정 볼륨으로 데이터를 영속화한 뒤 컨테이너를 삭제·재생성하여 발행된 블로그가 유실되지 않음을 검증합니다."
---

# Docker 실전: WordPress 멀티 노드 배포와 영속성 검증

실험 목적:

WordPress 를 Docker 로 배포하고 테스트 블로그를 발행합니다. 요구사항은 데이터베이스와 WordPress 컨테이너를 2 개의 다른 노드에 배치하고, 데이터베이스와 WordPress 컨테이너를 삭제한 후 새 컨테이너를 재생성하여 발행된 블로그가 유실되지 않도록 보장하는 것입니다.

## 1. 데이터베이스 시작

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

## 2. 데이터베이스 마운트 정보 확인

```bash
root@docker02:~# docker container inspect -f "{{range .Mounts }}Container mount path: {{.Destination}} Host path: {{.Source}}{{end}}" mysql-server
Container mount path: /var/lib/mysql Host path: /var/lib/docker/volumes/dawn/_data
```

## 3. WordPress 시작

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

## 4. WordPress 초기화 및 설치

  http://11.0.1.121/

![image-20261026162513717](/images/docker-wordpress-multinode-image-20261026162513717.png)

![image-20261026162927303](/images/docker-wordpress-multinode-image-20261026162927303.png)

![image-20261026163043591](/images/docker-wordpress-multinode-image-20261026163043591.png)

## 5. 컨테이너 삭제

```bash
root@docker01:~# docker container rm -f `docker container ps -qa`
48a48bcb637c
root@docker02:~# docker container rm -f `docker container ps -qa`
57460e172c20
```

## 6. 인스턴스를 재시작하고 정상 접속되는지 확인

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