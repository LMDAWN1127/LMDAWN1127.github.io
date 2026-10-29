---
title: "docker registry 에서 Harbor 로 이미지 마이그레이션 및 두 Harbor 간 동기화 실습"
date: 2026-10-29T20:04:45+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "이 실습에서는 docker registry 의 이미지를 Harbor 로 마이그레이션하고 두 Harbor 인스턴스 간에 이미지를 동기화한다. 1 부는 Harbor 의 pull 레플리케이션 규칙을 사용해 registry 내 `dawn-games/**` 이미지를 로컬 Harbor 프로젝트로 동기화한다. 2 부는 docker01 과 docker02 노드 모두에 Harbor 를 배포한 뒤 Harbor→Harbor pull 모드 레플리케이션 규칙을 구성해 두 Harbor 이미지 동기화를 구현하고, 마지막으로 클라이언트 daemon.json 을 수정해 검증한다."
---

# docker registry 에서 Harbor 로 이미지 마이그레이션 및 두 Harbor 간 동기화 실습

## 1. docker registry 에서 Harbor 레지스트리로 이미지 마이그레이션

### 1. docker registry 에 테스트 이미지 준비

```bash
root@docker01:~# docker tag dawn-games:motuo-v0.1 11.0.1.121:5000/dawn-games/motuo:v0.1
root@docker01:~# docker push 11.0.1.121:5000/dawn-games/motuo:v0.1
The push refers to repository [11.0.1.121:5000/dawn-games/motuo]
v0.1: digest: sha256:7d82ead138ecd7aac243397261c10db595d4dfec4768c810747de3d92fed52d3 size: 1569

root@docker01:~# docker push 11.0.1.121:5000/dawn-games/doudizhu:v0.1
The push refers to repository [11.0.1.121:5000/dawn-games/doudizhu]
71fd8b81ea67: Mounted from dawn-games/motuo
v0.1: digest: sha256:adabbc8e7ea0bc5858223c414832e3fdd21bffb4a78ece88c6b67895b0eec9a0 size: 1571

root@docker01:~# docker push 11.0.1.121:5000/dawn-db/mysql:8.4.1-oracle
The push refers to repository [11.0.1.121:5000/dawn-db/mysql]
...
8.4.1-oracle: digest: sha256:ed172c8a1e69201bdf4aa92521781f8c50ebc57a1ed1bbaff51de7232d81fb45 size: 2411
```

### 2. WebUI 접속 테스트 및 검증

브라우저에서 `http://11.0.1.121:5000/v2/_catalog` 을 열면 다음 응답이 반환된다：

```json
{"repositories":["dawn-db/mysql","dawn-games/doudizhu","dawn-games/motuo"]}
```

![image-20261029183043727](/images/docker-registry-to-harbor-migration/image-20261029183043727.png)

### 3. 대상 생성

![image-20261029190918435](/images/docker-registry-to-harbor-migration/image-20261029190918435.png)

### 4. 레플리케이션 규칙 생성

pull 모드 레플리케이션 규칙을 생성하여 registry 에서 로컬 `dawn-games` 프로젝트로 `dawn-games/**` 를 동기화한다

![image-20261029191121516](/images/docker-registry-to-harbor-migration/image-20261029191121516.png)

### 5. 수동 트리거 및 풀 성공 검증

![image-20261029191158194](/images/docker-registry-to-harbor-migration/image-20261029191158194.png)

동기화 완료 후 dawn-games 프로젝트의 이미지는 프라이빗 프로젝트로 설정되며, 풀하려면 로그인이 필요하다.

### 6. 이미지 레지스트리를 공개로 설정

![image-20261029192604436](/images/docker-registry-to-harbor-migration/image-20261029192604436.png)

---

## 2. Harbor 이미지 동기화（두 Harbor）

### 1. docker01 노드에 Harbor 레지스트리 신규 생성

**1.1 패키지 복사**

```bash
root@docker02:~# scp harbor-offline-installer-v2.7.4.tgz 11.0.1.121:~
```

**1.2 패키지 압축 해제**

```bash
root@docker01:~# tar xf harbor-offline-installer-v2.7.4.tgz -C /dawn/softwares/
```

**1.3 설정 파일 생성**

```bash
root@docker01:~# cd /dawn/softwares/harbor/
root@docker01:/dawn/softwares/harbor# cp harbor.yml{.tmpl,}
```

**1.4 Harbor 설정 파일 수정**

```yaml
hostname: 11.0.1.121

#https:
#  port: 443
#  certificate: /your/certificate/path
#  private_key: /your/private/key/path

harbor_admin_password: 1

data_volume: /dawn/data/harbor
```

**1.5 Harbor 설치**

```bash
root@docker01:/dawn/softwares/harbor# ./install.sh --with-chartmuseum
✔ ----Harbor has been installed and started successfully.----

root@docker01:/dawn/softwares/harbor# docker ps --format '{{.Names}} {{.Status}}'
nginx Up (healthy)
harbor-core Up (healthy)
harbor-db Up (healthy)
redis Up (healthy)
harbor-portal Up (healthy)
registry Up (healthy)
registryctl Up (healthy)
chartmuseum Up (healthy)
harbor-jobservice Up (healthy)
harbor-log Up (healthy)
```

### 2. docker02 노드에 Harbor 레지스트리 신규 생성

docker02 에는 이미 Harbor 가 배포되어 있다（hostname `harbor.dawn.com`）. 여기서는 이를 재사용한다.

### 3. docker02 노드에 레플리케이션 규칙 생성（Harbor → Harbor, pull 모드）

먼저 docker02 Harbor 에서 docker01 Harbor 를 가리키는 registry endpoint 를 생성한다：

![image-20261029195149633](/images/docker-registry-to-harbor-migration/image-20261029195149633.png)

다음으로 docker01-harbor 에서 `dawn-linux/**` 를 동기화하는 pull 레플리케이션 규칙을 생성한다：

![image-20261029195222043](/images/docker-registry-to-harbor-migration/image-20261029195222043.png)

### 4. 클라이언트 설정 파일 수정

```bash
root@docker02:~# cat /etc/docker/daemon.json
{
  "registry-mirrors": ["https://docker.m.daocloud.io"],
  "insecure-registries": ["11.0.1.121:5000", "harbor.dawn.com", "11.0.1.121"]
}
root@docker02:~# systemctl restart docker
```

docker02 호스트에도 Harbor 가 배포되어 있어 docker 재시작 시 로컬 Harbor 컨테이너도 함께 종료되므로, `cd /dawn/softwares/harbor && docker-compose up -d` 로 복구해야 한다.

### 5. 레플리케이션 수동 트리거

![image-20261029195251514](/images/docker-registry-to-harbor-migration/image-20261029195251514.png)