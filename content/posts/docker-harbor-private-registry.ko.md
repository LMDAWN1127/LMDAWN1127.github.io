---
title: "프라이빗 이미지 레지스트리 실습: docker registry 와 VMware Harbor"
date: 2026-10-29T15:09:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "두 가지 프라이빗 이미지 레지스트리를 처음부터 구축한다. 먼저 경량 docker registry 로 이미지 배포·푸시·풀·삭제(메타데이터 수동 삭제 + GC 로 스토리지 회수 포함)를 완료하고, 다음으로 엔터프라이즈급 VMware Harbor(HTTP 모드)를 배포한다. hosts 해석, insecure-registries 설정, 프로젝트 생성, 3 가지 docker login 방식, 이미지 푸시/풀/삭제 전체 흐름을 시연하며, 마지막에 사이즈·배포·WebUI·프로젝트 관리·삭제·적용 시나리오 차이를 대조표로 요약한다."
---

# 프라이빗 이미지 레지스트리 실습: docker registry 와 VMware Harbor

**실험 목적**: docker registry 경량 프라이빗 레지스트리와 VMware Harbor 엔터프라이즈 프라이빗 레지스트리의 배포·푸시·풀·삭제 전체 흐름을 익힌다.

---

## 1. 프라이빗 이미지 레지스트리의 이점

1. 이미지 풀이 빠름;
2. 사용자가 이미지를 가져오기 쉬움;
3. 안전하며, 내부 사용.

## 2. 프라이빗 레지스트리 솔루션

| 솔루션                          | 설명                                                         |
| ----------------------------- | ------------------------------------------------------------ |
| **공식 레지스트리**                  | Docker Hub, 국내 차단됨, 프록시 필요                               |
| **docker registry**(비추천) | Docker 공식 오픈소스 이미지 레지스트리, 시작 시 약 20MB 로 매우 가벼우나 사용이 다소 복잡하고 관리가 어려움 |
| **VMware Harbor**(기업 추천) | docker registry 를 기반으로 이차 개발되었으며 harbor 저장소가 오픈소스화됨            |
| **서드파티 레지스트리**                | Alibaba Cloud, Huawei Cloud, 다양한 클라우드 플랫폼 등                                 |

---

## 1 부: docker registry 환경 구축 및 이미지 푸시

### 1.1 docker registry 배포

```bash
root@docker01:~# docker run -dp 5000:5000 --restart=always --name dawn-registry -v /var/lib/registry registry
Unable to find image 'registry:latest' locally
latest: Pulling from library/registry
7b229517ed22: Pull complete
9cf9c5d068e4: Pull complete
30513d5b3b2d: Pull complete
7a0bafd2eac6: Pull complete
b6d795448ea0: Pull complete
Digest: sha256:d4032d4cc323c1731c707931ecada07a53076eac38e3b61ae57533f170f2c6c3
Status: Downloaded newer image for registry:latest
ec44574ca8f2ce62f9a701bafb9641c3b65b2b7ed28c631f3d49651a25b8c67c

root@docker01:~# docker ps --filter name=dawn-registry --format '{{.Names}} {{.Status}} {{.Ports}}'
dawn-registry Up 0.0.0.0:5000->5000/tcp, :::5000->5000/tcp
```

### 1.2 WebUI 접속

```
http://11.0.1.121:5000/v2/_catalog
```

초기 응답(이미지 없음):

```json
{"repositories":[]}
```

### 1.3 클라이언트 불안전 레지스트리 설정

docker 는 기본적으로 https 프로토콜을 사용하지만 프라이빗 레지스트리는 http 이므로, docker 가 http 프로토콜을 신뢰하도록 하려면 `insecure-registries` 를 설정해야 한다.

```bash
root@docker02:~# cat /etc/docker/daemon.json
{
  "registry-mirrors": ["https://docker.m.daocloud.io"],
  "insecure-registries": ["11.0.1.121:5000"]
}
root@docker02:~# systemctl restart docker
root@docker02:~# docker info | grep "Insecure Registries" -A 3
 Insecure Registries:
  11.0.1.121:5000
  127.0.0.0/8
```

### 1.4 이미지 태그

```bash
root@docker02:~# docker tag mysql:8.4.1-oracle 11.0.1.121:5000/dawn-db/mysql:8.4.1-oracle
root@docker02:~# docker images | grep dawn-db
11.0.1.121:5000/dawn-db/mysql    8.4.1-oracle   da8f2a99cf39   2 years ago   583MB
```

### 1.5 이미지를 프라이빗 레지스트리에 푸시

```bash
root@docker02:~# docker push 11.0.1.121:5000/dawn-db/mysql:8.4.1-oracle
The push refers to repository [11.0.1.121:5000/dawn-db/mysql]
2f75bcd245fd: Pushed
3ea6a92c9182: Pushed
2606c15a4838: Pushed
987e49e8d588: Pushed
fde3e91c5c9e: Pushed
...
8.4.1-oracle: digest: sha256:03a538f365c14f3ed9354f678707525a027f00720c134376a3c78cdcbf844344 size: 2411
```

### 1.6 WebUI 재확인

```
http://11.0.1.121:5000/v2/_catalog
```

이 시점에서 볼 수 있음:

```json
{"repositories":["dawn-db/mysql"]}
```

이미지 업로드 성공을 나타낸다.

---

## 2 부: docker registry 에서 이미지 풀

### 2.1 프라이빗 레지스트리 주소 설정

```bash
root@docker01:~/haha# cat /etc/docker/daemon.json
{
  "registry-mirrors": ["https://docker.m.daocloud.io"],
  "insecure-registries": ["11.0.1.121:5000"]
}
root@docker01:~/haha# systemctl restart docker
root@docker01:~/haha# docker info | grep "Insecure Registries" -A 3
 Insecure Registries:
  11.0.1.121:5000
  127.0.0.0/8
```

### 2.2 이미지 풀

```bash
root@docker01:~/haha# docker pull 11.0.1.121:5000/dawn-db/mysql:8.4.1-oracle
8.4.1-oracle: Pulling from dawn-db/mysql
Digest: sha256:03a538f365c14f3ed9354f678707525a027f00720c134376a3c78cdcbf844344
Status: Downloaded newer image for 11.0.1.121:5000/dawn-db/mysql:8.4.1-oracle

root@docker01:~/haha# docker image ls 11.0.1.121:5000/dawn-db/mysql:8.4.1-oracle
REPOSITORY                           TAG            IMAGE ID       CREATED        SIZE
11.0.1.121:5000/dawn-db/mysql        8.4.1-oracle   da8f2a99cf39   2 years ago    583MB
```

**registry 의 단점**: 풀할 때 사용자가 이미지 이름을 모르면 이미지가 무엇인지 어디 있는지 전혀 알 수 없어 불편하다. 이것이 나중에 Harbor 를 도입하는 이유이기도 하다.

---

## 3 부: docker registry 이미지 삭제

### 3.1 이미지 메타데이터 삭제

```bash
root@docker01:~/haha# docker exec -it dawn-registry sh
/ # cd /var/lib/registry/docker/registry/v2/
/var/lib/registry/docker/registry/v2 # ls -l
total 8
drwxr-xr-x    3 root     root          4096 Oct 29 05:52 blobs
drwxr-xr-x    3 root     root          4096 Oct 29 05:52 repositories
/var/lib/registry/docker/registry/v2 # du -sh *
161.8M  blobs
164.0K  repositories
/var/lib/registry/docker/registry/v2 # ls repositories/
dawn-db
/var/lib/registry/docker/registry/v2 # rm -rf repositories/dawn-db/
/var/lib/registry/docker/registry/v2 # ls repositories/
/var/lib/registry/docker/registry/v2 # du -sh *
161.8M  blobs
4.0K   repositories
```

`repositories/` 아래 메타데이터를 삭제해도 `blobs`(이미지 실제 데이터 계층)는 삭제되지 않으며 공간이 아직 회수되지 않는다.

### 3.2 스토리지 회수를 위한 이미지 데이터 정리

```bash
/var/lib/registry/docker/registry/v2 # registry garbage-collect /etc/distribution/config.yml
0 blobs marked, 12 blobs and 0 manifests eligible for deletion
blob eligible for deletion: sha256:eafccfd1ea14e7a7cc14a17f7e177399149b675253070b5149a41068b6989f1e
INFO[0000] Deleting blob: /docker/registry/v2/blobs/sha256/ea/eafccfd1ea14...
/var/lib/registry/docker/registry/v2 # du -sh *
52.0K  blobs
4.0K   repositories
```

`garbage-collect` 를 실행하면 `blobs` 가 161.8M 에서 52.0K 로 줄고 스토리지 공간이 정상 회수되었다.

이미지 삭제는 번거롭다. 먼저 메타데이터를 수동 삭제하고, 그 다음 GC 를 실행해 데이터를 회수하는 2 단계 조작이며, 이것도 registry 가 관리하기 어려운 예이다.

---

## 4 부: Harbor HTTP 배포 사례

### 4.1 Harbor 다운로드

```bash
root@docker02:~# ls -lh harbor-offline-installer-v2.7.4.tgz
-rw-r--r-- 1 root root 721M Oct 29 05:59 harbor-offline-installer-v2.7.4.tgz
```

### 4.2 패키지 압축 해제

```bash
root@docker02:~# tar xf harbor-offline-installer-v2.7.4.tgz -C /dawn/softwares/
root@docker02:~# ls /dawn/softwares/harbor/
common.sh  harbor.v2.7.4.tar.gz  harbor.yml.tmpl  install.sh  LICENSE  prepare
```

### 4.3 데이터 디렉터리 준비

```bash
root@docker02:~# mkdir -pv /dawn/data/harbor
mkdir: created directory '/dawn/data'
mkdir: created directory '/dawn/data/harbor'
```

### 4.4 설정 파일 준비

```bash
root@docker02:~# cd /dawn/softwares/harbor/
root@docker02:/dawn/softwares/harbor# cp harbor.yml.tmpl harbor.yml
root@docker02:/dawn/softwares/harbor# vim harbor.yml
...
# Harbor 서버 주소 지정
hostname: harbor.dawn.com

# https 기능 주석 처리
#https:
#  # https port for harbor, default is 443
#  port: 443
#  # The path of cert and key files for nginx
#  certificate: /your/certificate/path
#  private_key: /your/private/key/path

# Harbor 관리자 사용자 비밀번호 변경
harbor_admin_password: 1

# 데이터 저장 디렉터리 지정
data_volume: /dawn/data/harbor
```

### 4.5 Harbor 설치 시작

```bash
root@docker02:/dawn/softwares/harbor# ./install.sh --with-chartmuseum
Loaded image: goharbor/trivy-adapter-photon:v2.7.4
Loaded image: goharbor/prepare:v2.7.4
Loaded image: goharbor/harbor-core:v2.7.4
Loaded image: goharbor/registry-photon:v2.7.4
Loaded image: goharbor/notary-server-photon:v2.7.4
Loaded image: goharbor/nginx-photon:v2.7.4
Loaded image: goharbor/notary-signer-photon:v2.7.4
Loaded image: goharbor/chartmuseum-photon:v2.7.4
Loaded image: goharbor/harbor-portal:v2.7.4
Loaded image: goharbor/harbor-log:v2.7.4
Loaded image: goharbor/harbor-db:v2.7.4
Loaded image: goharbor/harbor-exporter:v2.7.4

[Step 3]: preparing environment ...
[Step 4]: preparing harbor configs ...
Generated configuration file: /config/portal/nginx.conf
...
[Step 5]: starting Harbor ...
 Network harbor_harbor  Creating
 ...
 ✔ ----Harbor has been installed and started successfully.----
```

install.sh 설치 과정은 순서대로 다음을 완료한다:

1. docker 와 docker-compose 설치 여부 확인;
2. Harbor 가 필요로 하는 이미지를 가져온다(`docker load`);
3. docker-compose.yaml 과 common 디렉터리를 준비(`prepare` 스크립트);
4. docker-compose 를 시작.

### 4.6 WebUI 접속

http://11.0.1.122/harbor/projects

![image-20261029144827534](/images/docker-harbor-private-registry/image-20261029144827534.png)

설치 완료 후 검증:

```bash
root@docker02:/dawn/softwares/harbor# docker ps --format '{{.Names}} {{.Status}} {{.Ports}}'
nginx               Up (health: starting)    0.0.0.0:80->8080/tcp
harbor-jobservice   Up (health: starting)
harbor-core         Up (health: starting)
harbor-db           Up (health: starting)
redis               Up (health: starting)
harbor-portal       Up (health: starting)
registry            Up (health: starting)
registryctl         Up (health: starting)
chartmuseum         Up (health: starting)
harbor-log          Up (health: starting)    127.0.0.1:1514->10514/tcp
```

Harbor 는 10 개 컨테이너로 구성된다. nginx(포털 역방향 프록시), harbor-core(코어), harbor-db(PostgreSQL 데이터베이스), redis(캐시), harbor-portal(프론트엔드 UI), registry(이미지 레지스트리), registryctl, chartmuseum, jobservice, harbor-log(로그).

---

## 5 부: Harbor 로 이미지 푸시

### 5.1 로컬 hosts 파일 해석 추가

```bash
root@docker01:~# echo 11.0.1.122 harbor.dawn.com >> /etc/hosts
root@docker01:~# grep harbor /etc/hosts
11.0.1.122 harbor.dawn.com
```

### 5.2 이미지 HTTP 모드 추가

```bash
root@docker01:~# vim /etc/docker/daemon.json
{
  "registry-mirrors": [
      "https://docker.m.daocloud.io"
  ],
  "insecure-registries": ["11.0.1.121:5000", "harbor.dawn.com"]
}
```

### 5.3 Docker 서비스 재시작

```bash
root@docker01:~# systemctl restart docker
root@docker01:~# docker info | grep "Insecure Registries" -A 4
 Insecure Registries:
  11.0.1.121:5000
  harbor.dawn.com
  127.0.0.0/8
```

### 5.4 Harbor 레지스트리에 새 프로젝트 생성

WebUI 에서 새 프로젝트 `dawn-games` 생성:

![image-20261029145115418](/images/docker-harbor-private-registry/image-20261029145115418.png)

### 5.5 테스트 이미지 태그

```bash
root@docker01:~# docker tag dawn-games:v2.16 harbor.dawn.com/dawn-games/dawn-games:motuo-v0.1
root@docker01:~# docker images | grep 'dawn-games/dawn-games'
harbor.dawn.com/dawn-games/dawn-games   motuo-v0.1   fc30411c280a   17 hours ago   17.8MB
```

### 5.6 Harbor 레지스트리에 로그인

3 가지 로그인 방식:

```bash
# 방식 1: 대화형 로그인
root@docker01:~# docker login harbor.dawn.com
Username: admin
Password:
Login Succeeded

# 방식 2: -p 파라미터 로그인(안전하지 않다고 경고)
root@docker01:~# docker login -u admin -p 1 harbor.dawn.com
WARNING! Using --password via the CLI is insecure. Use --password-stdin.
Login Succeeded

# 방식 3: --password-stdin 안전 로그인(추천)
root@docker01:~# echo 1 | docker login -u admin --password-stdin harbor.dawn.com
Login Succeeded
```

로그인 후 비밀번호는 로컬에 저장된다. 사용이 끝나면 로그아웃:

```bash
root@docker01:~# more /root/.docker/config.json
{
    "auths": {
        "harbor.dawn.com": {
            "auth": "YWRtaW46MQ=="
        }
    }
}

# 복호화하면 평문 사용자 이름과 비밀번호가 보임
root@docker01:~# echo YWRtaW46MQ== | base64 -d | more
admin:1
```

### 5.7 이미지를 프라이빗 레지스트리에 푸시

```bash
root@docker01:~# docker push harbor.dawn.com/dawn-games/dawn-games:motuo-v0.1
The push refers to repository [harbor.dawn.com/dawn-games/dawn-games]
c051b9573618: Pushed
d71c57700c5d: Pushed
1912927f1150: Pushed
74cacacc6bfe: Pushed
78561cef0761: Pushed
motuo-v0.1: digest: sha256:96e5e4e6d2745d53695d5afe62f39ccdbaa1b546ca24824cda36d6e9a2e583a9 size: 1778
```

### 5.8 WebUI 보기

http://harbor.dawn.com/harbor/projects/2/repositories/dawn-games

![image-20261029150418021](/images/docker-harbor-private-registry/image-20261029150418021.png)

이 시점에서 `dawn-games` 프로젝트 아래에 저장소 `dawn-games/dawn-games` 가 보이며, 그 안에 `motuo-v0.1` 이미지가 있다.

### 5.9 로그아웃

```bash
root@docker01:~# docker logout harbor.dawn.com
Removing login credentials for harbor.dawn.com

root@docker01:~# more /root/.docker/config.json
{
    "auths": {}
}
```

---

## 6 부: Harbor 에서 이미지 풀

### 6.1 hosts 해석 설정

```bash
root@docker02:/dawn/softwares/harbor# echo "11.0.1.122 harbor.dawn.com" >> /etc/hosts
```

### 6.2 Docker 불안전 레지스트리 설정

```bash
root@docker02:/dawn/softwares/harbor# cat /etc/docker/daemon.json
{
  "registry-mirrors": ["https://docker.m.daocloud.io"],
  "insecure-registries": ["11.0.1.121:5000", "harbor.dawn.com"]
}
root@docker02:/dawn/softwares/harbor# systemctl restart docker
```

### 6.3 이미지 풀

(이 프로젝트 `dawn-games` 는 이미 public 으로 설정되어 로그인 없이 풀 수 있다)

```bash
root@docker02:/dawn/softwares/harbor# docker pull harbor.dawn.com/dawn-games/dawn-games:motuo-v0.1
motuo-v0.1: Pulling from dawn-games/dawn-games
c6a83fedfae6: Pull complete
9f5c3ad3fbc9: Pull complete
c44cfb6f2bc3: Pull complete
ac2ad8f66d49: Pull complete
0a45d138de7a: Pull complete
bdbb7eaafb83: Pull complete
0095e166c007: Pull complete
Digest: sha256:96e5e4e6d2745d53695d5afe62f39ccdbaa1b546ca24824cda36d6e9a2e583a9
Status: Downloaded newer image for harbor.dawn.com/dawn-games/dawn-games:motuo-v0.1

root@docker02:/dawn/softwares/harbor# docker images | grep 'dawn-games/dawn-games'
harbor.dawn.com/dawn-games/dawn-games   motuo-v0.1   fc30411c280a   17 hours ago   17.8MB
```

---

## 7 부: Harbor 이미지 삭제

![image-20261029150928929](/images/docker-harbor-private-registry/image-20261029150928929.png)

이미지 삭제는 Harbor 의 WebUI 에서 조작하면 된다(시각적이고 직관적). 이것은 registry 대비 Harbor 의 큰 장점으로, 수동 메타데이터 삭제 + GC 2 단계 조작이 더 이상 필요 없다.

---

## 8 부: registry 대 Harbor 비교

| 비교 항목   | docker registry           | VMware Harbor              |
| -------- | ------------------------- | -------------------------- |
| 크기     | 약 20MB, 가벼움              | 720MB 설치 패키지, 무거움           |
| 배포     | 단일 컨테이너 `docker run`       | 10 개 컨테이너 + docker-compose |
| WebUI    | 없음(JSON API 만)       | 완전한 시각화 WebUI           |
| 프로젝트 관리 | 없음                        | 프로젝트, 사용자, 역할, 할당량 지원 |
| 이미지 삭제 | 메타데이터 수동 삭제 + GC(2 단계) | WebUI 원클릭 삭제             |
| 적용 시나리오 | 단순 사내 임시 사용          | 엔터프라이즈 프로덕션 환경             |
