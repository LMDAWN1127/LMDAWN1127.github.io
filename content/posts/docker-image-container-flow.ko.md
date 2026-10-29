---
title: "Docker 실전: 이미지 풀부터 컨테이너 실행까지 전체 흐름"
date: 2026-10-26T10:20:00+08:00
draft: false
categories: ["DevOps"]
tags: ["Docker"]
showToc: true
summary: "Docker 의 3대 핵심 객체인 이미지 레지스트리·이미지·컨테이너를 순서대로 따라갑니다. 로컬 레지스트리 목록을 조회하고 원격 레지스트리에서 이미지를 가져온 뒤 컨테이너를 실행하고 접속 테스트까지 진행합니다."
---

# Docker 실전: 이미지 풀부터 컨테이너 실행까지 전체 흐름

이미지·컨테이너·이미지 레지스트리는 Docker 의 3대 핵심 객체입니다. 레지스트리는 이미지의 저장과 배포를 담당하고, 이미지는 레지스트리에서 가져온 읽기 전용 템플릿이며, 컨테이너는 이미지의 실행 인스턴스입니다. 아래에서는 "이미지 레지스트리 → 이미지 → 컨테이너" 순서로 레지스트리 조회와 이미지 풀부터 컨테이너 실행 및 접속 확인까지의 전체 흐름을 따라갑니다.

## 이미지 레지스트리

이미지 레지스트리는 이미지의 저장·배포 중심입니다. 로컬에 이미 있는 레지스트리 목록을 조회하거나 원격 레지스트리에서 로컬로 이미지를 가져올 수 있습니다.

### 1. 로컬 이미지 레지스트리 목록 조회

```bash
root@docker02:~# docker image ls
REPOSITORY   TAG       IMAGE ID   CREATED   SIZE
```

## 이미지

이미지는 레지스트리에서 가져온 읽기 전용 템플릿이며 자체적으로 수정할 수 없습니다. 다시 빌드하거나 새 버전을 가져오는 방법으로만 갱신할 수 있습니다.

### 2. 원격 레지스트리에서 이미지 다운로드

```bash
root@docker02:~# docker pull uhub.service.ucloud.cn/dawn/nginx:1.30.4
1.30.4: Pulling from dawn/nginx
26c307b5e35a: Pull complete
7be390ba6238: Pull complete
d84ae7b21412: Pull complete
c0df8d325117: Pull complete
b8b80b9bc028: Pull complete
f5de6e85ac74: Pull complete
5a4222b844e8: Pull complete
Digest: sha256:9e4b33ead4c69e9845e53a1f175d0aa70a6cea62425b5d08957ba7eee5dc9b1d
Status: Downloaded newer image for uhub.service.ucloud.cn/dawn/nginx:1.30.4
uhub.service.ucloud.cn/dawn/nginx:1.30.4

root@docker02:~# docker image ls
REPOSITORY                          TAG       IMAGE ID       CREATED        SIZE
uhub.service.ucloud.cn/dawn/nginx   1.30.4    886dbea595a1   2 months ago   161MB
```

필드 설명:

- **REPOSITORY**: 이미지를 어떤 리포지토리에서 내려받았는지.
- **TAG**: 일반적으로 해당 버전.
- **IMAGE ID**: 이미지의 고유 식별자이며 수정할 수 없습니다.
- **CREATED**: 이미지 생성 시각.
- **SIZE**: 이미지 크기.

## 컨테이너

컨테이너는 이미지의 실행 인스턴스이며 이미지를 기반으로 시작됩니다. 아래에서는 컨테이너 실행과 조회, 그리고 컨테이너 실행 시 이미지 자동 풀과 접속 테스트를 보여줍니다.

### 3. 컨테이너 실행

```bash
root@docker02:~# docker run -d -p 88:80 886dbea595a1
5053b48e3161bb34793f9f7b095f53bc878b7b4efef639a6edbb77bd3207e9a4
```

파라미터 설명:

- **-d**: 컨테이너를 백그라운드로 실행.
- **-p**: "호스트 포트:컨테이너 포트" 포트 매핑 지정

### 4. 실행 중인 컨테이너 조회

```bash
root@docker02:~# docker container ls
CONTAINER ID   IMAGE          COMMAND                  CREATED              STATUS              PORTS                               NAMES
5053b48e3161   886dbea595a1   "/docker-entrypoint.…"   About a minute ago   Up About a minute   0.0.0.0:88->80/tcp, :::88->80/tcp   gifted_carver
root@docker02:~# docker container ps
CONTAINER ID   IMAGE          COMMAND                  CREATED         STATUS              PORTS                               NAMES
5053b48e3161   886dbea595a1   "/docker-entrypoint.…"   2 minutes ago   Up About a minute   0.0.0.0:88->80/tcp, :::88->80/tcp   gifted_carver
```

### 5. 컨테이너 실행 시 로컬에 이미지가 없으면 원격 레지스트리에서 자동으로 가져옵니다. 원격 레지스트리에 이미지가 없으면 풀에 실패합니다 (TAG 를 지정하지 않으면 기본값 latest)

```bash
root@docker02:~# docker images
REPOSITORY                          TAG       IMAGE ID       CREATED        SIZE
uhub.service.ucloud.cn/dawn/nginx   1.30.4    886dbea595a1   2 months ago   161MB
root@docker02:~# docker run -d -p 99:80 uhub.service.ucloud.cn/dawn/nginx:latest
Unable to find image 'uhub.service.ucloud.cn/dawn/nginx:latest' locally
latest: Pulling from dawn/nginx
062e450697fa: Pull complete
82454cdbf456: Pull complete
3c7ab7949321: Pull complete
cacfcdd01f30: Pull complete
b6698f04e005: Pull complete
2bedaf25031a: Pull complete
d26f27cc8c41: Pull complete
Digest: sha256:db4f612f385437d11eb26620a4f1d7efb3ff44e1296a3c21540b30454e6e2bf3
Status: Downloaded newer image for uhub.service.ucloud.cn/dawn/nginx:latest
8b9fd82e4e01fd8d2130ec1f3719e1dc15f878acfc2f6d8780be1ac9575d2779
root@docker02:~# docker images
REPOSITORY                          TAG       IMAGE ID       CREATED        SIZE
uhub.service.ucloud.cn/dawn/nginx   1.30.4    886dbea595a1   2 months ago   161MB
uhub.service.ucloud.cn/dawn/nginx   latest    4e5db4761e0f   3 months ago   161MB
root@docker02:~# docker container ps
CONTAINER ID   IMAGE                                      COMMAND                  CREATED          STATUS          PORTS                               NAMES
8b9fd82e4e01   uhub.service.ucloud.cn/dawn/nginx:latest   "/docker-entrypoint.…"   38 seconds ago   Up 38 seconds   0.0.0.0:99->80/tcp, :::99->80/tcp   practical_elion
5053b48e3161   886dbea595a1                               "/docker-entrypoint.…"   5 minutes ago   Up 5 minutes    0.0.0.0:88->80/tcp, :::88->80/tcp   gifted_carver

root@docker02:~# docker run -d -p 66:80 uhub.service.ucloud.cn/dawn/nginx:v6
Unable to find image 'uhub.service.ucloud.cn/dawn/nginx:v6' locally
docker: Error response from daemon: manifest for uhub.service.ucloud.cn/dawn/nginx:v6 not found: manifest unknown: manifest unknown.
See 'docker run --help'.
```

필드 설명:

- **CONTAINER ID**: 컨테이너 ID 이자 고유 식별자이며 수정할 수 없습니다.
- **IMAGE**: 컨테이너가 어떤 이미지에서 시작되었는지.
- **COMMAND**: 컨테이너 시작 시 실행되는 서비스.
- **CREATED**: 컨테이너 생성 시각.
- **STATUS**: 컨테이너 상태.
- **PORTS**: 컨테이너 포트 매핑.
- **NAMES**: 컨테이너 이름. 생성 시 지정하거나 나중에 변경할 수 있지만 모든 컨테이너 이름은 고유해야 합니다.

### 6. 접속 테스트

  http://11.0.1.122:88/

![image-20261023131501886](/images/docker-image-container-flow-image-20261023131501886.png)

  http://11.0.1.122:99/

![image-20261023132022374](/images/docker-image-container-flow-image-20261023132022374.png)
